#!/usr/bin/env python3
"""
Generate and validate Conv0 Q31 multipliers against a saved golden tensor.

Expected files in --data-dir:
  metadata.json
  acc_int32_golden.npy
  output_q_golden.npy

The script does NOT modify RTL/ROM files. It evaluates nearest-even, floor,
and ceil multiplier policies using integer Q31 requantization with ties-to-even.
It also reports the exact mismatch count against the saved golden output.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any

import numpy as np


def round_divide_ties_even(numer: np.ndarray, denom: int) -> np.ndarray:
    """Round signed integer numerator / positive denom to nearest, ties-to-even."""
    a = np.abs(numer).astype(np.int64)
    q = a // denom
    r = a % denom
    inc = (2 * r > denom) | ((2 * r == denom) & ((q & 1) == 1))
    q = q + inc.astype(np.int64)
    return np.where(numer < 0, -q, q).astype(np.int64)


def multiplier_values(meta: dict[str, Any], policy: str, shift: int) -> list[int]:
    q = meta.get("quantization", meta)
    input_scale = float(q.get("input_scale", meta.get("input_scale")))
    output_scale = float(q.get("output_scale", meta.get("output_scale")))
    weight_scales = q.get("weight_scales", meta.get("weight_scales"))
    if input_scale is None or output_scale is None or weight_scales is None:
        raise ValueError(
            "Could not find input_scale, output_scale, and weight_scales in metadata.json. "
            "Inspect metadata keys and adapt this script to its schema."
        )
    ratio = (input_scale * np.asarray(weight_scales, dtype=np.float64)) / output_scale
    raw = ratio * (1 << shift)
    if policy == "ceil":
        vals = np.ceil(raw)
    elif policy == "floor":
        vals = np.floor(raw)
    else:
        vals = np.rint(raw)  # ties-to-even
    return [int(x) for x in vals]


def simulate(acc: np.ndarray, mult: int, shift: int) -> np.ndarray:
    # Use Python-object multiplication to avoid overflow in intermediate products.
    flat = acc.astype(np.int64, copy=False).ravel()
    prod = flat.astype(object) * int(mult)
    den = 1 << shift
    # Integer Q31 ties-to-even. Use scalar arithmetic for exact signed behavior.
    out = np.empty(flat.size, dtype=np.int64)
    for i, p in enumerate(prod):
        sign = -1 if p < 0 else 1
        ap = abs(int(p))
        q, r = divmod(ap, den)
        if 2 * r > den or (2 * r == den and (q & 1)):
            q += 1
        out[i] = sign * q
    return out.reshape(acc.shape)


def load_array(path: Path) -> np.ndarray:
    if not path.is_file():
        raise FileNotFoundError(f"Required input file not found: {path}")
    return np.load(path, allow_pickle=False)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--data-dir", type=Path, required=True)
    ap.add_argument("--out-dir", type=Path, default=Path("verification/results/conv0_multiplier"))
    ap.add_argument("--policy", choices=("nearest_even", "floor", "ceil"), default="ceil")
    ap.add_argument("--shift", type=int, default=31)
    ap.add_argument("--strict", action="store_true",
                    help="Return exit code 2 if selected policy has any mismatch")
    args = ap.parse_args()

    if args.shift < 0 or args.shift > 62:
        raise ValueError("--shift must be in range 0..62")

    data_dir = args.data_dir.resolve()
    out_dir = args.out_dir.resolve()
    meta_path = data_dir / "metadata.json"
    if not meta_path.is_file():
        raise FileNotFoundError(f"Required metadata file not found: {meta_path}")