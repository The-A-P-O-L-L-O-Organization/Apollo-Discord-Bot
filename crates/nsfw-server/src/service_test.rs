#[cfg(test)]
mod tests {
    use super::*;
    use nsfw_proto::v1::{AnalyzeRequest, AnalyzeResponse};
    use tonic::Request;

    #[tokio::test]
    async fn test_analyze_returns_valid_response() {
        let service = NsfwServiceImpl::new_test().await;
        let req = Request::new(AnalyzeRequest {
            image_data: vec![0xFF, 0xD8, 0xFF],
            threshold: 0.6,
            guild_id: "test".into(),
            user_id: "test".into(),
            ..Default::default()
        });
        
        let resp = service.analyze(req).await.unwrap().into_inner();
        assert!(resp.predictions.len() > 0);
        assert!(resp.inference_ms > 0);
    }
}