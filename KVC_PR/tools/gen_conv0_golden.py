#!/usr/bin/env python3
"""
gen_conv0_golden.py — Sinh golden vector cho conv_engine_dynamic_fsm.

MUC DICH: tao du lieu test doc lap (khong dung RTL) de verify engine.
Truoc day `verification/data/` rong hoan toan — khong co golden nao trong
repo hay git history, nen khong the chung minh engine dung.

Mo hinh toan hoc:
    acc  = sum(activation[i] * weight[i])            INT32
    out  = clamp( round((acc * mult_q31) >> shift) + bias , -128, 127 )

Config mac dinh khop conv0 cua KVC_PR/docs/processing/conv_layer_map.csv:
    kernel=3, in_c=3, out_c=16, pad=1, stride=1 (test nho, khong phai 640)
    Kich thuoc anh test = 8x8 de chay nhanh trong mo phong.

Output:
    KVC_PR/verification/data/conv0_golden/
        input_act.hex     : INT8, 8x8x3
        weight.hex        : INT8, 16x3x3x3
        bias.hex          : INT32, 16 entry
        quant.hex         : {shift[7:0], mult[31:0]} moi dong, 16 entry
        expected.hex      : INT8, 16x8x8
        metadata.json     : tham so + hash
"""

import json
import hashlib
import os
import random
import struct

OUT_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "verification", "data", "conv0_golden"
)

K = 3
IN_C = 3
OUT_C = 16
IMG = 8
PAD = 1
STRIDE = 1
SHIFT = 31
SEED = 20261031


def clamp(v, lo=-128, hi=127):
    return max(lo, min(hi, v))


def round_shift(acc, mult, shift):
    """round-to-nearest-even sau khi nhan Q31 va dich."""
    prod = acc * mult                      # Python int: khong tran
    if shift == 0:
        return prod
    # round half to even
    mask = (1 << shift) - 1
    half = 1 << (shift - 1)
    q = prod >> shift
    rem = prod & mask
    if rem > half or (rem == half and (q & 1)):
        q += 1
    return q


def main():
    rng = random.Random(SEED)

    # --- Sinh input, weight, bias, quant ---
    # act nho (|a| <= 8), weight nho (|w| <= 4) -> acc toi da
    # 27 tap * 8 * 4 = 864, khong tran INT32 va con du dai de requant
    # ra gia tri trong [-128, 127] thay vi bao hoa.
    act = [rng.randint(-8, 8) for _ in range(IMG * IMG * IN_C)]
    w = [rng.randint(-4, 4)
         for _ in range(OUT_C * IN_C * K * K)]

    bias = [rng.randint(-64, 64) for _ in range(OUT_C)]

    # mult Q31 nho (~2^-27..2^-23) de acc*mult>>31 roi ve dai INT8
    # 864 * 2^-23 ~= 1e-4 ... qua nho. Chon mult quanh 2^27..2^30
    # de out ~ acc * mult / 2^31 nam trong [-128,127].
    mult = [rng.randint(1 << 27, (1 << 30) - 1) for _ in range(OUT_C)]
    shift = [SHIFT] * OUT_C

    # --- Tinh output ---
    expected = []
    for oc in range(OUT_C):
        for y in range(IMG):
            for x in range(IMG):
                acc = 0
                for ic in range(IN_C):
                    for ky in range(K):
                        for kx in range(K):
                            iy = y * STRIDE + ky - PAD
                            ix = x * STRIDE + kx - PAD
                            if 0 <= iy < IMG and 0 <= ix < IMG:
                                a = act[(ic * IMG * IMG) + (iy * IMG) + ix]
                                ww = w[oc * IN_C * K * K + ic * K * K + ky * K + kx]
                                acc += a * ww
                v = round_shift(acc, mult[oc], shift[oc]) + bias[oc]
                expected.append(clamp(v))

    os.makedirs(OUT_DIR, exist_ok=True)

    def write_hex(name, values, width_bits):
        path = os.path.join(OUT_DIR, name)
        digits = (width_bits + 3) // 4
        mask = (1 << width_bits) - 1
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            for v in values:
                f.write(f"{(v & mask):0{digits}x}\n")
        return hashlib.sha256(
            open(path, "rb").read()).hexdigest()

    h = {}
    h["input_act"] = write_hex("input_act.hex", act, 8)
    h["weight"]    = write_hex("weight.hex",    w,   8)
    h["bias"]      = write_hex("bias.hex",      bias, 32)
    h["expected"]  = write_hex("expected.hex",  expected, 8)

    # quant.hex: moi dong = {shift[7:0], mult[31:0]} -> 10 hex digit
    path = os.path.join(OUT_DIR, "quant.hex")
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        for i in range(OUT_C):
            f.write(f"{(shift[i] << 32) | (mult[i] & 0xFFFF_FFFF):010x}\n")
    h["quant"] = hashlib.sha256(open(path, "rb").read()).hexdigest()

    meta = {
        "purpose": "golden vector doc lap cho conv_engine_dynamic_fsm",
        "generator": "tools/gen_conv0_golden.py",
        "seed": SEED,
        "config": {
            "kernel": K, "in_c": IN_C, "out_c": OUT_C,
            "img": IMG, "pad": PAD, "stride": STRIDE, "shift": SHIFT,
        },
        "quantization": {
            "weight_dtype": "int8",
            "act_dtype": "int8",
            "bias_dtype": "int32",
            "mult_dtype": "q31",
            "rounding": "nearest_even",
        },
        "counts": {
            "act": len(act), "weight": len(w),
            "bias": len(bias), "expected": len(expected),
        },
        "sha256": h,
        "evidence_level": "SYNTHETIC_ONLY",
        "note": (
            "Du lieu SINH GIA LAP, khong phai conv0 that cua YOLO11n. "
            "Muc dich: verify so hoc engine (acc, requant, clamp). "
            "Khong dung de danh gia do chinh xac model."
        ),
    }
    with open(os.path.join(OUT_DIR, "metadata.json"), "w",
              encoding="utf-8", newline="\n") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    print(f"OK -> {OUT_DIR}")
    print(f"  act={len(act)} weight={len(w)} bias={len(bias)} expected={len(expected)}")
    print(f"  expected[0:8] = {expected[:8]}")


if __name__ == "__main__":
    main()
