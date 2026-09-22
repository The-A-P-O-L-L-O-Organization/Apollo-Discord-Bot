use clap::Parser;
use tonic::transport::Server;
use tracing::info;
use std::net::SocketAddr;
use std::path::PathBuf;

mod model;
mod service;
mod telemetry;

use crate::service::NsfwServiceImpl;
use nsfw_proto::v1::nsfw_service_server::NsfwServiceServer;

#[derive(Parser, Debug)]
#[command(name = "nsfw-server", version, about = "NSFW Detection gRPC Server")]
struct Args {
    #[arg(long, env = "NSFW_GRPC_ADDR", default_value = "0.0.0.0:50051")]
    grpc_addr: SocketAddr,
    
    #[arg(long, env = "NSFW_MODEL_PATH", default_value = "./models/nsfw.onnx")]
    model_path: PathBuf,
    
    #[arg(long, env = "NSFW_THRESHOLD", default_value = "0.6")]
    threshold: f32,
    
    #[arg(long, env = "OTEL_EXPORTER_OTLP_ENDPOINT", default_value = "http://localhost:4318")]
    otel_endpoint: String,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args = Args::parse();
    
    crate::telemetry::init_telemetry("nsfw-server")?;
    
    info!("Loading model from {:?}", args.model_path);
    let model = crate::model::NsfwModel::load(&args.model_path)?;
    
    let service = NsfwServiceImpl::new(model, args.threshold);
    
    info!("Starting gRPC server on {}", args.grpc_addr);
    Server::builder()
        .add_service(NsfwServiceServer::new(service))
        .serve(args.grpc_addr)
        .await?;
    
    Ok(())
}