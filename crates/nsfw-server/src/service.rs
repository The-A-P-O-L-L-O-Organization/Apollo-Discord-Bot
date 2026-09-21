use nsfw_proto::v1::{
    nsfw_service_server::NsfwService, AnalyzeRequest, AnalyzeResponse, HealthCheckRequest, HealthCheckResponse
};
use tonic::{Request, Response, Status, Code};
use std::sync::Arc;
use std::time::Instant;
use tracing::{info, instrument, error};
use crate::model::NsfwModel;

#[derive(Clone)]
pub struct NsfwServiceImpl {
    model: Arc<NsfwModel>,
    start_time: Instant,
    threshold: f32,
}

impl NsfwServiceImpl {
    pub fn new(model: NsfwModel, threshold: f32) -> Self {
        Self {
            model: Arc::new(model),
            start_time: Instant::now(),
            threshold,
        }
    }
    
    #[cfg(test)]
    pub async fn new_test() -> Self {
        let model = if let Ok(path) = std::env::var("TEST_MODEL_PATH") {
            NsfwModel::load(&std::path::PathBuf::from(path))
                .expect("Failed to load test model")
        } else {
            panic!("TEST_MODEL_PATH must be set for integration tests")
        };
        Self::new(model, 0.6)
    }
}

fn map_error_to_status(err: anyhow::Error) -> Status {
    let err_str = err.to_string().to_lowercase();
    
    if err_str.contains("timeout") || err_str.contains("timed out") {
        return Status::new(Code::DeadlineExceeded, format!("Request timeout: {}", err));
    }
    if err_str.contains("too large") || err_str.contains("size limit") {
        return Status::new(Code::ResourceExhausted, format!("Image too large: {}", err));
    }
    if err_str.contains("http error") || err_str.contains("failed to send") || err_str.contains("connection") {
        return Status::new(Code::Unavailable, format!("Upstream unavailable: {}", err));
    }
    if err_str.contains("decode") || err_str.contains("invalid") || err_str.contains("format") {
        return Status::new(Code::InvalidArgument, format!("Invalid image: {}", err));
    }
    if err_str.contains("inference") || err_str.contains("ort") || err_str.contains("onnx") {
        return Status::new(Code::Internal, format!("Inference error: {}", err));
    }
    
    error!(error = %err, "Unhandled error in NSFW service");
    Status::new(Code::Internal, format!("Internal error: {}", err))
}

#[tonic::async_trait]
impl NsfwService for NsfwServiceImpl {
    #[instrument(skip(self, request), fields(guild_id = %request.get_ref().guild_id))]
    async fn analyze(&self, request: Request<AnalyzeRequest>) -> Result<Response<AnalyzeResponse>, Status> {
        let req = request.into_inner();
        let start = Instant::now();
        
        let image_bytes = if !req.image_url.is_empty() {
            self.model.fetch_image(&req.image_url).await
                .map_err(map_error_to_status)?
        } else if !req.image_data.is_empty() {
            req.image_data
        } else {
            return Err(Status::new(Code::InvalidArgument, "Either image_data or image_url must be provided"));
        };
        
        let _threshold = if req.threshold > 0.0 && req.threshold <= 1.0 {
            req.threshold
        } else {
            self.threshold
        };
        
        let predictions = self.model.predict(&image_bytes)
            .map_err(map_error_to_status)?;
        
        let inference_ms = start.elapsed().as_millis() as i64;
        
        let mut pred_map = std::collections::HashMap::new();
        let labels = NsfwModel::class_labels();
        let mut max_confidence = 0.0f32;
        let mut is_nsfw = false;
        
        for (i, &label) in labels.iter().enumerate() {
            let conf = predictions.get(i).copied().unwrap_or(0.0);
            pred_map.insert(label.to_string(), conf);
            
            if conf > max_confidence {
                max_confidence = conf;
            }
            
            if (label == "Porn" || label == "Hentai" || label == "Sexy") && conf >= self.threshold {
                is_nsfw = true;
            }
        }
        
        info!(is_nsfw, max_confidence, inference_ms, "Analysis complete");
        
        Ok(Response::new(AnalyzeResponse {
            is_nsfw,
            predictions: pred_map,
            max_confidence,
            inference_ms,
        }))
    }
    
    async fn health_check(&self, _request: Request<HealthCheckRequest>) -> Result<Response<HealthCheckResponse>, Status> {
        Ok(Response::new(HealthCheckResponse {
            healthy: true,
            model_version: env!("CARGO_PKG_VERSION").to_string(),
            uptime_ms: self.start_time.elapsed().as_millis() as i64,
        }))
    }
}