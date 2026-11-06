#!/usr/bin/env python3
"""Validate Conv0 Q31 requantization against saved golden tensors.

Expected files in verification/data/conv0/: metadata.json, acc_int32_golden.npy,
output_q_golden.npy. The policy matches the patched RTL: signed product,
magnitude-based round-to-nearest/ties-to-even, then INT8 saturation.
"""
from pathlib import Path
import json
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "verification/data/conv0"

def round_ties_even_signed(n: np.ndarray, shift: int) -> np.ndarray:
    if not 0 <= shift <= 63:
        raise ValueError("shift must be in 0..63")
    n = n.astype(np.int64, copy=False)
    if shift == 0:
        return n
    den = 1 << shift
    mag = np.abs(n)
    q, r = mag // den, mag % den
    half = den >> 1
    inc = (r > half) | ((r == half) & ((q & 1) == 1))
    q = q + inc.astype(np.int64)
    return np.where(n < 0, -q, q)

def main():
    meta = json.loads((DATA / "metadata.json").read_text(encoding="utf-8"))
    q = meta["quantization"]
    acc = np.load(DATA / "acc_int32_golden.npy", allow_pickle=False)
    golden = np.load(DATA / "output_q_golden.npy", allow_pickle=False)
    if acc.shape != golden.shape or acc.ndim != 4:
        raise SystemExit(f"shape mismatch: acc={acc.shape}, golden={golden.shape}")
    shift = 31
    scales = np.asarray(q["weight_scales"], dtype=np.float64)
    ratio = float(q["input_scale"]) * scales / float(q["output_scale"])
    multipliers = np.ceil(ratio * (1 << shift)).astype(np.int64)
    if len(multipliers) != acc.shape[1]:
        raise SystemExit("number of multipliers does not match output channels")
    predicted = np.empty(acc.shape, dtype=np.int64)
    for ch, mult in enumerate(multipliers):
        # This tensor's documented accumulator range makes int64 multiplication safe.
        product = acc[:, ch, :, :].astype(np.int64) * int(mult)
        predicted[:, ch, :, :] = round_ties_even_signed(product, shift)
    predicted = np.clip(predicted, -128, 127).astype(np.int8)
    golden = golden.astype(np.int8, copy=False)
    mismatches = int(np.count_nonzero(predicted != golden))
    max_diff = int(np.max(np.abs(predicted.astype(np.int16) - golden.astype(np.int16))))
    print(f"model={meta.get('layer_requested')}")
    print(f"shape={tuple(acc.shape)}; elements={golden.size}; shift={shift}")
    print(f"mismatches={mismatches}/{golden.size}; max_abs_diff={max_diff}")
    print("multipliers_signed=" + ",".join(str(int(x)) for x in multipliers))
    if mismatches:
        raise SystemExit(2)
    print("PASS: integer Q31 requantization matches saved Conv0 golden output exactly.")

if __name__ == "__main__":
    main()
