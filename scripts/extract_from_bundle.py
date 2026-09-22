#!/usr/bin/env python3
"""
Extract NSFWJS model from the minified bundle format to TFJS format.
The model is embedded in a webpack/browserify bundle at a known offset.
"""
import json
import re
import os
import sys


def extract_json_from_bundle(js_file_path, output_dir):
    """Extract the model JSON from the bundle file."""
    with open(js_file_path, 'rb') as f:
        content = f.read()
    
    # Find the start of the model export: "a.exports={modelTopology:"
    start_marker = b'a.exports={modelTopology:'
    start_idx = content.find(start_marker)
    if start_idx == -1:
        # Try alternative
        start_marker = b'modelTopology:'
        start_idx = content.find(start_marker)
        if start_idx == -1:
            raise ValueError("Could not find modelTopology in bundle")
        # Go back to find the opening brace
        while start_idx > 0 and content[start_idx - 1] != ord('{'):
            start_idx -= 1
    else:
        # The { is right after ={
        start_idx = start_idx + len(b'a.exports={')
    
    # Verify we're at the opening brace
    if content[start_idx] != ord('{'):
        # Search nearby for the brace
        for i in range(start_idx, min(start_idx + 10, len(content))):
            if content[i] == ord('{'):
                start_idx = i
                break
    
    # The JSON object starts with the opening brace - but our current start_idx
    # might point to 'modelTopology' which is a key inside the object.
    # We need to find the actual opening brace of the object.
    # The object starts with "{modelTopology:" so we need to find that {
    if content[start_idx] != ord('{'):
        # Search backward for the opening brace
        for i in range(start_idx, max(start_idx - 10, 0), -1):
            if content[i] == ord('{'):
                start_idx = i
                break
    
    print(f"Found modelTopology at offset {start_idx}")
    print(f"Content at start_idx: {content[start_idx:start_idx+50]}")
    
    # Now find the matching closing brace for the entire object
    brace_count = 0
    in_string = False
    escape_next = False
    end_idx = -1
    
    for i in range(start_idx, len(content)):
        ch = content[i]
        
        if escape_next:
            escape_next = False
            continue
            
        if ch == ord('\\'):
            escape_next = True
            continue
            
        if ch == ord('"') and not escape_next:
            in_string = not in_string
            continue
            
        if not in_string:
            if ch == ord('{'):
                brace_count += 1
            elif ch == ord('}'):
                brace_count -= 1
                if brace_count == 0:
                    end_idx = i + 1
                    break
    
    if end_idx == -1:
        raise ValueError("Could not find end of model JSON object")
    
    json_bytes = content[start_idx:end_idx]
    
    # Convert JS-like syntax to JSON
    json_str = json_bytes.decode('utf-8')
    json_str = json_str.replace('!0', 'true').replace('!1', 'false')
    
    # Convert JavaScript object literal to valid JSON by quoting property names
    # Pattern: {prop: or ,prop: or [prop: -> {"prop": or ,"prop": or ["prop":
    json_str = re.sub(r'([{,[])\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:', r'\1"\2":', json_str)
    
    # Fix numbers starting with decimal point: .999 -> 0.999 and -.873 -> -0.873
    json_str = re.sub(r'([\s:,])(-?)(\.\d+)', r'\g<1>\g<2>0\g<3>', json_str)
    
    model_data = json.loads(json_str)
    
    print(f"Extracted model JSON ({len(json_str)} chars)")
    print(f"Model topology keys: {model_data.keys()}")
    print(f"Weights manifest entries: {len(model_data.get('weightsManifest', []))}")
    
    # Save model.json in TFJS format
    os.makedirs(output_dir, exist_ok=True)
    model_json = {
        'modelTopology': model_data['modelTopology'],
        'weightsManifest': model_data['weightsManifest'],
        'format': 'layers-model',
        'generatedBy': 'nsfwjs-extractor',
        'convertedBy': 'custom-script'
    }
    
    model_json_path = os.path.join(output_dir, 'model.json')
    with open(model_json_path, 'w') as f:
        json.dump(model_json, f, indent=2)
    
    print(f"Saved model.json to {model_json_path}")
    
    return model_data


def extract_weights(model_data, bundle_path, output_dir):
    """Extract weight data from the shard file."""
    shard_path = bundle_path.replace('model.min.js', 'group1-shard1of1.min.js')
    if not os.path.exists(shard_path):
        raise FileNotFoundError(f"Shard file not found: {shard_path}")
    
    with open(shard_path, 'r') as f:
        shard_content = f.read()
    
    # Extract base64 encoded weights from h.exports="..."
    weight_match = re.search(r'h\.exports="([A-Za-z0-9+/=]+)"', shard_content)
    if not weight_match:
        raise ValueError("Could not find base64 weights in shard file")
    
    import base64
    weight_bytes = base64.b64decode(weight_match.group(1))
    print(f"Extracted weight bytes: {len(weight_bytes)}")
    
    # Split weights according to manifest
    # The weights are stored as quantized uint8 values
    offset = 0
    for manifest in model_data.get('weightsManifest', []):
        for weight in manifest['weights']:
            name = weight['name']
            shape = weight['shape']
            dtype = weight['dtype']
            quantization = weight.get('quantization')
            
            num_elements = 1
            for dim in shape:
                num_elements *= dim
            
            # Check if quantized
            if quantization and quantization.get('dtype') == 'uint8':
                # Weights are stored as uint8, 1 byte per element
                byte_size = num_elements
                is_quantized = True
                quant_min = quantization['min']
                quant_scale = quantization['scale']
            else:
                # Regular float32
                if dtype == 'float32':
                    byte_size = num_elements * 4
                elif dtype == 'int32':
                    byte_size = num_elements * 4
                elif dtype == 'uint8':
                    byte_size = num_elements
                else:
                    byte_size = num_elements * 4
                is_quantized = False
            
            if offset + byte_size > len(weight_bytes):
                print(f"Warning: Not enough bytes for {name}, needed {byte_size}, remaining {len(weight_bytes) - offset}")
                break
                
            weight_data = weight_bytes[offset:offset + byte_size]
            offset += byte_size
            
            # If quantized, dequantize to float32
            if is_quantized:
                import struct
                float_values = []
                for b in weight_data:
                    # TFJS affine dequantization: value = min + q * scale
                    float_val = quant_min + b * quant_scale
                    float_values.append(float_val)
                # Pack as float32
                weight_data = struct.pack(f'{num_elements}f', *float_values)
            
            safe_name = name.replace('/', '_').replace(':', '_')
            weight_file = os.path.join(output_dir, f"{safe_name}.bin")
            with open(weight_file, 'wb') as f:
                f.write(weight_data)
            print(f"  Saved weight: {name} -> {weight_file} ({len(weight_data)} bytes, shape={shape}, dtype={dtype}, quantized={is_quantized})")
    
    print(f"Total bytes consumed: {offset} / {len(weight_bytes)}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python extract_from_bundle.py <model.min.js> <output_dir>")
        sys.exit(1)
    
    model_data = extract_json_from_bundle(sys.argv[1], sys.argv[2])
    extract_weights(model_data, sys.argv[1], sys.argv[2])
    print(f"Extraction complete. Output directory: {sys.argv[2]}")