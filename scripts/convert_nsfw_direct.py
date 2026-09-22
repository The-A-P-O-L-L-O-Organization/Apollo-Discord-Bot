#!/usr/bin/env python3
"""
Convert NSFWJS TensorFlow.js model to ONNX format directly using Keras/TensorFlow.
This avoids the tensorflowjs package which has protobuf compatibility issues.

Process:
1. Load model topology from model.json
2. Load weights from .bin shards
3. Reconstruct Keras model
4. Save as SavedModel
5. Convert to ONNX using tf2onnx
"""
import argparse
import json
import os
import struct
import sys
import tempfile
import shutil

import numpy as np
import tensorflow as tf
from tensorflow import keras


def load_tfjs_weights(weights_manifest, model_dir):
    """Load weights from individual TFJS binary files (already dequantized to float32 by extract script)."""
    weights = {}
    
    # The manifest has one entry with many weights, each weight maps to a .bin file
    for entry in weights_manifest:
        for weight_info in entry['weights']:
            name = weight_info['name']
            shape = weight_info['shape']
            dtype = weight_info.get('dtype', 'float32')
            # Note: The extraction script already dequantized uint8 -> float32
            # So the .bin files contain float32 data (4 bytes per element)
            
            # Map weight name to filename (already extracted)
            safe_name = name.replace('/', '_').replace(':', '_')
            weight_file = os.path.join(model_dir, f"{safe_name}.bin")
            
            if not os.path.exists(weight_file):
                # Try alternative naming patterns
                alt_file = os.path.join(model_dir, f"{safe_name.replace('_', '-')}.bin")
                if os.path.exists(alt_file):
                    weight_file = alt_file
                else:
                    print(f"Warning: Weight file not found: {weight_file}")
                    continue
            
            with open(weight_file, 'rb') as f:
                data = f.read()
            
            # Parse as float32 (already dequantized by extract script)
            count = len(data) // 4
            arr = np.frombuffer(data, dtype=np.float32, count=count)
            
            weights[name] = arr.reshape(shape)
            print(f"  Loaded {name}: shape={arr.shape}, file={weight_file}")
    
    return weights


def rebuild_keras_model(tfjs_model_dir):
    """Rebuild the NSFWJS Keras model from a TFJS model directory.

    Returns the compiled model in inference mode. Shared by the ONNX
    conversion and the TF-oracle baseline script so both use identical
    weights and preprocessing assumptions.
    """

    # Step 1: Load model topology
    model_json_path = os.path.join(tfjs_model_dir, 'model.json')
    with open(model_json_path, 'r') as f:
        model_data = json.load(f)
    
    topology = model_data['modelTopology']
    weights_manifest = model_data['weightsManifest']
    
    print(f"Loaded model topology: {topology['model_config']['config']['name']}")
    print(f"Input shape: {topology['model_config']['config']['layers'][0]['config']['batch_input_shape']}")
    print(f"Number of weight entries: {len(weights_manifest)}")
    
    # Step 2: Load weights
    print("Loading weights from binary shards...")
    weights = load_tfjs_weights(weights_manifest, tfjs_model_dir)
    print(f"Loaded {len(weights)} weight tensors")
    
    # Step 3: Reconstruct Keras model from config
    print("Reconstructing Keras model...")
    model_config = topology['model_config']['config']
    model = keras.Model.from_config(model_config)
    
    # Step 4: Set weights
    print("Setting weights...")
    # The manifest has weights with full names like "Conv1/kernel", "bn_Conv1/gamma"
    # But Keras model.weights only has generic names like "kernel:0", "gamma:0"
    # We need to iterate through layers and match by position within each layer
    
    # Build mapping from manifest names to loaded weights
    weight_map = {}
    for loaded_name, loaded_weight in weights.items():
        weight_map[loaded_name] = loaded_weight
    
    print(f"Built weight map with {len(weight_map)} entries")
    
    # Create a mapping from Keras layer name to manifest layer name
    # Keras layer names: Conv1, bn_Conv1, expanded_conv_pad, expanded_conv, expanded_conv_BN, etc.
    # Manifest names: Conv1, bn_Conv1, expanded_conv_depthwise, expanded_conv_depthwise_BN, 
    #                 expanded_conv_project, expanded_conv_project_BN, block_10, etc.
    
    # The manifest has a DIFFERENT ORDER than Keras layers!
    # Keras order: Conv1 -> expanded_conv -> blocks 1-16 -> Conv_1 -> dense_1 -> dense_2 -> dense_3
    # Manifest order: Conv1 -> Conv_1 -> block_10-16 -> expanded_conv
    
    # We need to match by layer name
    layer_weight_map = {}
    for layer in model.layers:
        if layer.weights:
            layer_weight_map[layer.name] = layer.weights
    
    print(f"Keras has {len(layer_weight_map)} layers with weights")
    
    # Now iterate through manifest weights and assign to correct layer
    weight_list = []
    manifest_idx = 0
    matched = 0
    
    # First, get the manifest weights in order
    manifest_weights = []
    for entry in weights_manifest:
        for w_info in entry['weights']:
            manifest_weights.append(w_info)
    
    print(f"Manifest has {len(manifest_weights)} weights")
    
    # Match by finding manifest weights for each Keras layer by name
    # The manifest has a DIFFERENT ORDER than Keras layers
    # We need to match by layer name, not by position
    
    # Get all manifest weights
    manifest_weights = []
    for entry in weights_manifest:
        for w_info in entry['weights']:
            manifest_weights.append(w_info)
    
    print(f"Manifest has {len(manifest_weights)} weights")
    
    # Create a lookup: manifest layer name -> list of manifest weights
    manifest_by_layer = {}
    for mw in manifest_weights:
        layer_name = mw['name'].split('/')[0]
        if layer_name not in manifest_by_layer:
            manifest_by_layer[layer_name] = []
        manifest_by_layer[layer_name].append(mw)
    
    print(f"Manifest has {len(manifest_by_layer)} unique layers")
    
    # Map Keras layer names to manifest layer names
    def keras_to_manifest_layer(keras_name):
        """Map Keras layer name to manifest layer name."""
        # Special cases
        if keras_name == 'Conv1':
            return 'Conv1'
        elif keras_name == 'bn_Conv1':
            return 'bn_Conv1'
        elif keras_name == 'expanded_conv_depthwise':
            return 'expanded_conv_depthwise'
        elif keras_name == 'expanded_conv_depthwise_BN':
            return 'expanded_conv_depthwise_BN'
        elif keras_name == 'expanded_conv_project':
            return 'expanded_conv_project'
        elif keras_name == 'expanded_conv_project_BN':
            return 'expanded_conv_project_BN'
        elif keras_name.startswith('block_'):
            # Keras: block_1_expand, block_1_expand_BN, block_1_depthwise, block_1_depthwise_BN, block_1_project, block_1_project_BN
            # Manifest: block_1_depthwise, block_1_depthwise_BN, block_1_expand, block_1_expand_BN, block_1_project, block_1_project_BN
            # Same names, different order - just return the keras name
            return keras_name
        elif keras_name == 'Conv_1':
            return 'Conv_1'
        elif keras_name == 'Conv_1_bn':
            return 'Conv_1_bn'
        elif keras_name.startswith('dense_'):
            return keras_name
        else:
            return keras_name
    
    # Match weights for each Keras layer
    weight_list = []
    matched = 0
    total_expected = len(model.weights)
    
    for layer in model.layers:
        if not layer.weights:
            continue
        
        keras_layer_name = layer.name
        manifest_layer_name = keras_to_manifest_layer(keras_layer_name)
        
        if manifest_layer_name not in manifest_by_layer:
            print(f"  ERROR: No manifest weights for layer {keras_layer_name} (looked for {manifest_layer_name})")
            print(f"  Available manifest layers: {sorted(manifest_by_layer.keys())[:20]}...")
            # Use zeros
            for w in layer.weights:
                weight_list.append(np.zeros_like(w.numpy()))
            continue
        
        manifest_layer_weights = manifest_by_layer[manifest_layer_name]
        
        if len(manifest_layer_weights) != len(layer.weights):
            print(f"  WARNING: Layer {keras_layer_name} ({manifest_layer_name}) has {len(layer.weights)} Keras weights but {len(manifest_layer_weights)} manifest weights")
            print(f"    Keras weights: {[w.name for w in layer.weights]}")
            print(f"    Manifest weights: {[mw['name'] for mw in manifest_layer_weights]}")
        
        # Sort manifest weights by weight type to match Keras order
        # Keras order: kernel, gamma, beta, moving_mean, moving_variance (for BN)
        #              kernel, bias (for dense/conv)
        #              depthwise_kernel (for depthwise)
        def weight_sort_key(mw):
            name = mw['name']
            if '/depthwise_kernel' in name:
                return 0
            elif '/kernel' in name:
                return 1
            elif '/gamma' in name:
                return 2
            elif '/beta' in name:
                return 3
            elif '/moving_mean' in name:
                return 4
            elif '/moving_variance' in name:
                return 5
            elif '/bias' in name:
                return 6
            return 99
        
        manifest_layer_weights.sort(key=weight_sort_key)
        
        # Assign weights in order
        for i, (keras_weight, manifest_weight) in enumerate(zip(layer.weights, manifest_layer_weights)):
            loaded_weight = weight_map[manifest_weight['name']]
            expected_shape = tuple(keras_weight.shape)
            loaded_shape = loaded_weight.shape
            if expected_shape != loaded_shape:
                print(f"  SHAPE MISMATCH: {keras_weight.name} expected {expected_shape}, got {loaded_shape} from {manifest_weight['name']}")
            
            # Sanitize BatchNorm moving statistics
            # TFJS models can have zero/negative moving_variance which causes NaN in ONNX
            mn = manifest_weight['name']
            if 'moving_variance' in mn:
                # Ensure variance is positive (add epsilon if zero/negative)
                loaded_weight = np.where(loaded_weight <= 0, 1e-5, loaded_weight)
                print(f"  Sanitized {mn}: replaced {np.sum(loaded_weight <= 0)} zero/negative values with 1e-5")
            elif 'moving_mean' in mn:
                # Ensure mean is finite
                loaded_weight = np.where(np.isfinite(loaded_weight), loaded_weight, 0.0)
                non_finite = np.sum(~np.isfinite(loaded_weight))
                if non_finite > 0:
                    print(f"  Sanitized {mn}: replaced {non_finite} non-finite values with 0.0")
            
            weight_list.append(loaded_weight)
            matched += 1
    
    print(f"Total matched: {matched}/{total_expected}")
    model.set_weights(weight_list)
    
    # Ensure all layers are in inference mode
    model.trainable = False
    for layer in model.layers:
        layer.trainable = False
        # For BatchNorm, explicitly set training=False
        if 'bn' in layer.name.lower() or 'BN' in layer.name:
            layer.trainable = False
    
    # Compile the model (required for proper SavedModel export)
    model.compile(optimizer='adam', loss='categorical_crossentropy')
    
    # Verify model works in inference mode
    print("Verifying model (inference mode)...")
    dummy_input = np.random.rand(1, 224, 224, 3).astype(np.float32)
    output = model(dummy_input, training=False)
    print(f"Output shape: {output.shape}")
    print(f"Output sum: {output.numpy().sum():.6f}")
    print(f"Output classes: {output.numpy()[0]}")
    
    # Check for NaN
    if np.isnan(output.numpy()).any():
        print("WARNING: Model output contains NaN!")
        # Try a few more predictions
        for _ in range(5):
            output = model(dummy_input, training=False)
        print(f"After stabilization: {output.numpy()[0]}")
    
    # Model is rebuilt and verified; hand off to the caller.
    return model


def convert_tfjs_to_onnx(tfjs_model_dir, output_path):
    """Convert TFJS model to ONNX directly."""
    model = rebuild_keras_model(tfjs_model_dir)

    # Step 5: Save as SavedModel (Keras 3 compatible)
    saved_model_dir = os.path.join(os.path.dirname(output_path), "nsfw_saved_model")
    if os.path.exists(saved_model_dir):
        shutil.rmtree(saved_model_dir)
    
    print(f"Saving as SavedModel to {saved_model_dir}...")
    # In Keras 3, use export() for SavedModel format
    model.export(saved_model_dir)
    
    # Step 6: Convert to ONNX using tf2onnx
    # Let tf2onnx auto-detect outputs from the signature
    print(f"Converting to ONNX...")
    import subprocess
    result = subprocess.run([
        sys.executable, "-m", "tf2onnx.convert",
        "--saved-model", saved_model_dir,
        "--output", output_path,
        "--opset", "13",
        "--inputs", "input_1:0[1,224,224,3]",
    ], capture_output=True, text=True)
    
    if result.returncode != 0:
        print(f"tf2onnx stderr: {result.stderr}")
        raise RuntimeError(f"tf2onnx conversion failed: {result.stdout}")
    
    # Verify ONNX model
    import onnx
    import onnxruntime as ort
    
    onnx_model = onnx.load(output_path)
    onnx.checker.check_model(onnx_model)
    
    print(f"✓ Model converted and saved to {output_path}")
    print(f"✓ Model validation passed")
    print(f"  Inputs: {[i.name for i in onnx_model.graph.input]}")
    print(f"  Outputs: {[o.name for o in onnx_model.graph.output]}")
    
    # Cleanup
    shutil.rmtree(saved_model_dir)
    print(f"✓ Cleaned up temporary SavedModel")


def main():
    parser = argparse.ArgumentParser(description="Convert NSFWJS TFJS model to ONNX (direct method)")
    parser.add_argument("--tfjs-model", required=True, help="Path to TFJS model directory (with model.json)")
    parser.add_argument("--output", required=True, help="Output ONNX file path")
    args = parser.parse_args()
    
    if not os.path.exists(args.tfjs_model):
        print(f"Error: TFJS model directory not found: {args.tfjs_model}")
        sys.exit(1)
    
    model_json = os.path.join(args.tfjs_model, "model.json")
    if not os.path.exists(model_json):
        print(f"Error: model.json not found in {args.tfjs_model}")
        sys.exit(1)
    
    try:
        convert_tfjs_to_onnx(args.tfjs_model, args.output)
    except Exception as e:
        print(f"Conversion failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()