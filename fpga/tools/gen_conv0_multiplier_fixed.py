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
    
    with meta_path.open("r", encoding="utf-8") as f:
        meta = json.load(f)

    acc = load_array(data_dir / "acc_int32_golden.npy")
    golden = load_array(data_dir / "output_q_golden.npy")

    if acc.shape != golden.shape:
        raise ValueError(
            f"Tensor shape mismatch: acc={acc.shape}, golden={golden.shape}"
        )

    if acc.ndim != 4:
        raise ValueError(
            f"Expected NCHW tensor [N,C,H,W], got shape={acc.shape}"
        )

    channels = acc.shape[1]
    policies = ("nearest_even", "floor", "ceil")
    results = []

    out_dir.mkdir(parents=True, exist_ok=True)

    for policy in policies:
        multipliers = multiplier_values(meta, policy, args.shift)

        if len(multipliers) != channels:
            raise ValueError(
                f"Found {len(multipliers)} weight scales/multipliers, "
                f"but tensor has {channels} output channels. "
                "Check metadata.json and tensor layout."
            )

        predicted = np.empty(acc.shape, dtype=np.int64)

        for ch, mult in enumerate(multipliers):
            predicted[:, ch, :, :] = simulate(
                acc[:, ch, :, :], mult, args.shift
            )

        predicted = np.clip(predicted, -128, 127).astype(np.int8)
        golden_i8 = golden.astype(np.int8, copy=False)

        mismatch = predicted != golden_i8
        mismatch_count = int(np.count_nonzero(mismatch))
        total = int(golden_i8.size)

        diff = predicted.astype(np.int16) - golden_i8.astype(np.int16)
        max_abs_diff = int(np.max(np.abs(diff))) if total else 0

        results.append({
            "policy": policy,
            "shift": args.shift,
            "mismatch_count": mismatch_count,
            "total": total,
            "mismatch_rate": mismatch_count / total if total else 0.0,
            "max_abs_diff": max_abs_diff,
            "multipliers": multipliers,
        })

        (out_dir / f"conv0_multiplier_{policy}.dec").write_text(
            "\n".join(map(str, multipliers)) + "\n",
            encoding="utf-8",
        )
        (out_dir / f"conv0_multiplier_{policy}.hex").write_text(
            "\n".join(f"{m:08X}" for m in multipliers) + "\n",
            encoding="utf-8",
        )

        print(
            f"[{policy}] mismatches={mismatch_count}/{total} "
            f"({100 * mismatch_count / total:.8f}%), "
            f"max_abs_diff={max_abs_diff}"
        )
        print(f"  multipliers={multipliers}")

    report_path = out_dir / "validation_report.json"
    report_path.write_text(
        json.dumps(results, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    selected = next(r for r in results if r["policy"] == args.policy)
    print(f"\nSelected policy: {args.policy}")
    print(f"Report: {report_path}")
    print(f"Output directory: {out_dir}")

    if args.strict and selected["mismatch_count"] != 0:
        print("STRICT CHECK FAILED: selected policy has mismatches.")
        return 2

    if selected["mismatch_count"] == 0:
        print("Selected policy matches the saved golden tensor exactly.")
    else:
        print("Selected policy does NOT match the saved golden tensor exactly.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
