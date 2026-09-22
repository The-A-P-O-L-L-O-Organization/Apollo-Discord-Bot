#!/usr/bin/env python3
"""TF-oracle baseline for NSFW fidelity tests.

Rebuilds the NSFWJS Keras model from the TFJS directory (same code path as
the ONNX conversion) and runs predictions with the EXACT preprocessing from
NSFWJS src/core.ts infer():

    fromPixels(img) -> toFloat().div(255) -> resizeBilinear([size,size],
    alignCorners=true) if needed -> reshape [1,size,size,3]

Outputs become the reference predictions in tests/nsfw-fidelity.test.ts.
Run: nsfw-conv-venv/bin/python scripts/nsfw_tf_oracle.py <img> [img ...]
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np
import tensorflow as tf
from PIL import Image

from convert_nsfw_direct import rebuild_keras_model

LABELS = ["Drawing", "Hentai", "Neutral", "Porn", "Sexy"]
SIZE = 224


def resize_bilinear_align_corners(img):
    """Bilinear resize with align_corners=true, matching NSFWJS.

    img: HxWx3 float32 in [0, 1]. Corners map exactly corner-to-corner.
    """
    h, w, c = img.shape
    if h == SIZE and w == SIZE:
        return img
    scale_y = (h - 1) / (SIZE - 1)
    scale_x = (w - 1) / (SIZE - 1)
    oy = np.arange(SIZE) * scale_y
    ox = np.arange(SIZE) * scale_x
    y0 = np.floor(oy).astype(int)
    x0 = np.floor(ox).astype(int)
    y1 = np.minimum(y0 + 1, h - 1)
    x1 = np.minimum(x0 + 1, w - 1)
    wy = (oy - y0).reshape(SIZE, 1, 1)
    wx = (ox - x0).reshape(1, SIZE, 1)
    top = img[y0][:, x0] * (1 - wx) + img[y0][:, x1] * wx
    bot = img[y1][:, x0] * (1 - wx) + img[y1][:, x1] * wx
    return top * (1 - wy) + bot * wy


def nsfws_preprocess(path):
    """Mirror NSFWJS infer() preprocessing exactly."""
    img = Image.open(path).convert("RGB")
    arr = np.asarray(img, dtype=np.float32) / 255.0
    resized = resize_bilinear_align_corners(arr)
    return resized.reshape(1, SIZE, SIZE, 3)


def main():
    tfjs_dir = os.environ.get(
        "TFJS_MODEL_DIR",
        os.path.join(os.path.dirname(os.path.abspath(__file__)),
                     "..", "models", "nsfwjs_tfjs"),
    )
    model = rebuild_keras_model(tfjs_dir)
    for path in sys.argv[1:]:
        out = model(nsfws_preprocess(path), training=False).numpy()[0]
        print(path)
        for label, score in zip(LABELS, out):
            print(f"  {label}: {score:.4f}")
        print(f"  sum: {out.sum():.4f}")


if __name__ == "__main__":
    main()
