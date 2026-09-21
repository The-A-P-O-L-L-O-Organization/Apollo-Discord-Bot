#!/usr/bin/env python3
"""
Verify ONNX model structure and run inference test.
"""
import argparse
import sys


def verify_onnx_model(onnx_path: str):
    """Verify ONNX model loads and has correct structure."""
    try:
        import onnx
    except ImportError:
        print("onnx not installed, skipping verification")
        return False
    
    try:
        model = onnx.load(onnx_path)
        onnx.checker.check_model(model)
        
        print(f"✓ Model loaded and validated: {onnx_path}")
        print(f"  IR version: {model.ir_version}")
        print(f"  Producer: {model.producer_name} {model.producer_version}")
        print(f"  Opset: {[op.domain + ':' + str(op.version) for op in model.opset_import]}")
        print(f"  Inputs:")
        for inp in model.graph.input:
            shape = [d.dim_value if d.dim_value > 0 else '?' for d in inp.type.tensor_type.shape.dim]
            print(f"    {inp.name}: {inp.type.tensor_type.elem_type} {shape}")
        print(f"  Outputs:")
        for out in model.graph.output:
            shape = [d.dim_value if d.dim_value > 0 else '?' for d in out.type.tensor_type.shape.dim]
            print(f"    {out.name}: {out.type.tensor_type.elem_type} {shape}")
        
        return True
    except Exception as e:
        print(f"✗ Model verification failed: {e}")
        return False


def test_inference(onnx_path: str):
    """Test ONNX model inference with dummy input."""
    try:
        import onnxruntime as ort
        import numpy as np
    except ImportError:
        print("onnxruntime not installed, skipping inference test")
        return False
    
    try:
        session = ort.InferenceSession(onnx_path)
        
        # Create dummy input: [1, 224, 224, 3]
        dummy_input = np.random.randn(1, 224, 224, 3).astype(np.float32)
        
        # Get input/output names
        input_name = session.get_inputs()[0].name
        output_name = session.get_outputs()[0].name
        
        print(f"Running inference...")
        print(f"  Input: {input_name} {session.get_inputs()[0].shape}")
        print(f"  Output: {output_name} {session.get_outputs()[0].shape}")
        
        outputs = session.run([output_name], {input_name: dummy_input})
        
        result = outputs[0]
        print(f"✓ Inference successful!")
        print(f"  Output shape: {result.shape}")
        print(f"  Output sum: {result.sum():.4f}")
        print(f"  Output values: {result[0]}")
        
        # Verify shape matches expected: [1, 5] for 5 classes
        if result.shape == (1, 5):
            print(f"✓ Output shape matches expected [1, 5] (Drawing, Hentai, Neutral, Porn, Sexy)")
        else:
            print(f"✗ Unexpected output shape: {result.shape}")
        
        return True
    except Exception as e:
        print(f"✗ Inference test failed: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Verify ONNX model")
    parser.add_argument("model", help="Path to ONNX model file")
    parser.add_argument("--no-inference", action="store_true", help="Skip inference test")
    args = parser.parse_args()
    
    if not verify_onnx_model(args.model):
        sys.exit(1)
    
    if not args.no_inference:
        if not test_inference(args.model):
            sys.exit(1)
    
    print("\n✓ All verification passed!")


if __name__ == "__main__":
    main()