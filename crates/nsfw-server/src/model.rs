use ort::session::{builder::GraphOptimizationLevel, Session};
use ort::value::Tensor;
use ndarray::Array4;
use image;
use anyhow::{Result, Context, bail, anyhow};
use std::path::Path;
use reqwest::Client;
use std::time::Duration;
use num_cpus;
use std::sync::Mutex;

const INPUT_SIZE: (u32, u32) = (224, 224);
const CLASS_LABELS: &[&str] = &["Drawing", "Hentai", "Neutral", "Porn", "Sexy"];
const MAX_IMAGE_SIZE: usize = 10 * 1024 * 1024;
const FETCH_TIMEOUT: Duration = Duration::from_secs(10);

pub struct NsfwModel {
    session: Mutex<Session>,
    input_name: String,
    output_name: String,
    http_client: Client,
}

impl NsfwModel {
    pub fn load(model_path: &Path) -> Result<Self> {
        let mut builder = Session::builder().map_err(|e| anyhow!("Failed to create session builder: {}", e))?;
        builder = builder.with_optimization_level(GraphOptimizationLevel::Level3).map_err(|e| anyhow!("Failed to set optimization level: {}", e))?;
        builder = builder.with_intra_threads(num_cpus::get()).map_err(|e| anyhow!("Failed to set intra threads: {}", e))?;
        let session = builder.commit_from_file(model_path).map_err(|e| anyhow!("Failed to load model from file: {}", e))?;
        
        let input_name = session.inputs()[0].name().to_string();
        let output_name = session.outputs()[0].name().to_string();
        
        let http_client = Client::builder()
            .timeout(FETCH_TIMEOUT)
            .user_agent("Apollo-NsfwBot/1.0 (Discord content-moderation bot; +https://github.com/The-A-P-O-L-L-O-Organization/Apollo-Discord-Bot)")
            .build()?;
        
        Ok(Self { session: Mutex::new(session), input_name, output_name, http_client })
    }
    
    pub async fn fetch_image(&self, url: &str) -> Result<Vec<u8>> {
        let response = self.http_client.get(url).send().await
            .context("Failed to send HTTP request")?;
        
        if !response.status().is_success() {
            bail!("HTTP error: {}", response.status());
        }
        
        let content_length = response.content_length().unwrap_or(0);
        if content_length > MAX_IMAGE_SIZE as u64 {
            bail!("Image too large: {} bytes (max {})", content_length, MAX_IMAGE_SIZE);
        }
        
        let bytes = response.bytes().await
            .context("Failed to read response body")?;
        
        if bytes.len() > MAX_IMAGE_SIZE {
            bail!("Image too large: {} bytes (max {})", bytes.len(), MAX_IMAGE_SIZE);
        }
        
        Ok(bytes.to_vec())
    }
    
    pub fn predict(&self, image_bytes: &[u8]) -> Result<Vec<f32>> {
        let img = image::load_from_memory(image_bytes)
            .context("Failed to decode image")?;

        // Mirror NSFWJS infer() preprocessing exactly:
        // decode -> float -> /255 -> bilinear resize (align_corners=true) -> NHWC batch.
        let rgb = img.to_rgb8();
        let (src_w, src_h) = (rgb.width() as usize, rgb.height() as usize);
        let (dst_w, dst_h) = (INPUT_SIZE.0 as usize, INPUT_SIZE.1 as usize);
        let mut input_array =
            Array4::<f32>::zeros((1, dst_h, dst_w, 3));

        if src_w == dst_w && src_h == dst_h {
            for (x, y, pixel) in rgb.enumerate_pixels() {
                let [r, g, b] = pixel.0;
                input_array[[0, y as usize, x as usize, 0]] = r as f32 / 255.0;
                input_array[[0, y as usize, x as usize, 1]] = g as f32 / 255.0;
                input_array[[0, y as usize, x as usize, 2]] = b as f32 / 255.0;
            }
        } else {
            // Bilinear resampling with corner alignment: out pixel o maps to
            // src coordinate o * (src - 1) / (dst - 1), corners exact.
            let raw = rgb.into_raw();
            let sample = |sx: usize, sy: usize, c: usize| -> f32 {
                raw[(sy * src_w + sx) * 3 + c] as f32 / 255.0
            };
            let scale_x = (src_w - 1) as f32 / (dst_w - 1) as f32;
            let scale_y = (src_h - 1) as f32 / (dst_h - 1) as f32;
            for oy in 0..dst_h {
                let fy = oy as f32 * scale_y;
                let y0 = fy.floor() as usize;
                let y1 = (y0 + 1).min(src_h - 1);
                let wy = fy - y0 as f32;
                for ox in 0..dst_w {
                    let fx = ox as f32 * scale_x;
                    let x0 = fx.floor() as usize;
                    let x1 = (x0 + 1).min(src_w - 1);
                    let wx = fx - x0 as f32;
                    for c in 0..3 {
                        let top = sample(x0, y0, c) * (1.0 - wx)
                            + sample(x1, y0, c) * wx;
                        let bot = sample(x0, y1, c) * (1.0 - wx)
                            + sample(x1, y1, c) * wx;
                        input_array[[0, oy, ox, c]] =
                            top * (1.0 - wy) + bot * wy;
                    }
                }
            }
        }
        
        let input_tensor = Tensor::from_array(input_array.into_dyn()).map_err(|e| anyhow!("Failed to create input tensor: {}", e))?;
        let mut session = self.session.lock().map_err(|e| anyhow!("Failed to lock session: {}", e))?;
        let outputs = session.run(ort::inputs![
            &self.input_name => input_tensor
        ]).map_err(|e| anyhow!("ONNX inference failed: {}", e))?;
        
        let output_tensor = outputs[0].try_extract_tensor::<f32>().map_err(|e| anyhow!("Failed to extract output tensor: {}", e))?;
        let predictions = output_tensor.1.to_vec();
        
        Ok(predictions)
    }
    
    pub fn class_labels() -> &'static [&'static str] {
        CLASS_LABELS
    }
}