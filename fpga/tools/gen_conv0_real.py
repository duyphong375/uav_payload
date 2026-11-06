#!/usr/bin/env python3
"""
gen_conv0_real.py — Sinh weights THAT cua conv0 tu ONNX YOLO11n.

KHAC voi gen_conv0_golden.py:
  - gen_conv0_golden.py : weights GIA (random), chi verify so hoc engine
  - gen_conv0_real.py   : weights THAT tu model.onnx -> verify engine dung
                          voi du lieu cua YOLO11n that

Nguon: yolo11n_2class_best.onnx (opset 12, 88 Conv, input 640x640).
       ONNX DA BN-FOLDED (conv.bias ton tai, khong co BatchNorm node).

CHU Y VE RESOLUTION:
  ONNX nay la 640x640, KHONG phai 160x160 da chot trong B-5.
  Conv0 shape [16,3,3,3] va weights KHONG phu thuoc resolution,
  nen weights/bias/quant sinh ra dung cho ca 640 va 160.
  Chi co activation shape thay doi. Vi vay P4 verify duoc engine
  voi weights that; P5 moi can train lai 160.

Output (fpga/verification/data/conv0_real/):
  weight.hex   : INT8, 16x3x3x3 = 432 byte, per-output-channel symmetric
  bias.hex     : INT32, 16 entry
  quant.hex    : {shift[7:0], mult_q31[31:0]} moi dong, 16 entry
  metadata.json

Quantization:
  - per-output-channel symmetric INT8 cho weight
  - input scale = 1/255 (uint8 -> [0,1] voi zero_point 0)
  - bias_q = round(bias_fp32 / (input_scale * weight_scale))
  - mult_q31 + shift = requant tu INT32 accumulator ve INT8
"""

import json
import hashlib
import os
import struct

ONNX = r"D:\Project_UAV_KVC\ai_training\weights\yolo11n_2class_best.onnx"

OUT_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "verification", "data", "conv0_real"
)

TARGET_CONV = "model.0.conv.weight"
TARGET_BIAS = "model.0.conv.bias"


# ---------------------------------------------------------------------------
# Protobuf reader toi gian (khong can package onnx)
# ---------------------------------------------------------------------------
def varint(b, i):
    r = 0
    s = 0
    while True:
        c = b[i]
        i += 1
        r |= (c & 0x7F) << s
        if not c & 0x80:
            return r, i
        s += 7


def fields(b):
    i = 0
    n = len(b)
    while i < n:
        k, i = varint(b, i)
        f = k >> 3
        w = k & 7
        if w == 0:
            x, i = varint(b, i)
            yield f, 0, x
        elif w == 2:
            ln, i = varint(b, i)
            yield f, 2, b[i:i + ln]
            i += ln
        elif w == 5:
            yield f, 5, b[i:i + 4]
            i += 4
        elif w == 1:
            yield f, 1, b[i:i + 8]
            i += 8


def packed(b):
    o = []
    i = 0
    while i < len(b):
        x, i = varint(b, i)
        o.append(x)
    return o


def read_initializers(path):
    data = open(path, "rb").read()
    graph = None
    for f, w, x in fields(data):
        if f == 7:
            graph = x
            break

    inits = {}
    for f, w, x in fields(graph):
        if f != 5:
            continue
        dims, dt, name, raw = [], None, None, None
        for f2, w2, v2 in fields(x):
            if f2 == 1:
                dims = packed(v2) if w2 == 2 else dims + [v2]
            elif f2 == 2:
                dt = v2
            elif f2 == 8:
                name = v2.decode()
            elif f2 == 9:
                raw = v2
        inits[name] = (dt, dims, raw)
    return inits


def to_floats(dt, dims, raw):
    n = 1
    for d in dims:
        n *= d
    if dt == 1:                       # FLOAT
        return list(struct.unpack_from("<%df" % n, raw, 0))
    if dt == 10:                      # FLOAT16
        return list(struct.unpack_from("<%de" % n, raw, 0))
    raise ValueError(f"unsupported dtype {dt}")


# ---------------------------------------------------------------------------
# Quantization
# ---------------------------------------------------------------------------
def quantize_per_channel(weights, oc, per_ch):
    """Symmetric INT8 per output channel -> (q_weights, scales)."""
    q = []
    scales = []
    for o in range(oc):
        row = weights[o * per_ch:(o + 1) * per_ch]
        amax = max(abs(v) for v in row) or 1e-9
        s = amax / 127.0
        scales.append(s)
        for v in row:
            qi = int(round(v / s))
            q.append(max(-127, min(127, qi)))
    return q, scales


def compute_mult_shift(m_real, shift_bits=31):
    """
    Bieu dien m_real (~ 1) thanh mult_q31 / 2^31, chuan hoa de mult
    nam trong [2^30, 2^31). Tra ve (mult_q31, shift).
    """
    if m_real <= 0:
        return 0, shift_bits

    # dua m_real ve dai [0.5, 1)
    e = 0
    v = m_real
    while v >= 1.0:
        v /= 2.0
        e += 1
    while v < 0.5:
        v *= 2.0
        e -= 1

    mult = int(round(v * (1 << shift_bits)))
    if mult >= (1 << shift_bits):
        mult = (1 << shift_bits) - 1
    # so bit dich thuc te = shift_bits - e
    shift = shift_bits - e
    if shift < 0 or shift > 63:
        raise ValueError(f"shift out of range: {shift} (m_real={m_real})")
    return mult, shift


def main():
    if not os.path.exists(ONNX):
        raise SystemExit(f"Khong tim thay ONNX: {ONNX}")

    inits = read_initializers(ONNX)
    if TARGET_CONV not in inits:
        raise SystemExit(f"Khong co {TARGET_CONV} trong ONNX")

    dt, dims, raw = inits[TARGET_CONV]
    w_fp = to_floats(dt, dims, raw)
    oc, icg, kh, kw = dims
    per_ch = icg * kh * kw

    bdt, bdims, braw = inits[TARGET_BIAS]
    b_fp = to_floats(bdt, bdims, braw)

    print(f"conv0 weight: {dims} dtype={dt} ({len(w_fp)} phan tu)")
    print(f"conv0 bias  : {bdims} ({len(b_fp)} phan tu)")

    # --- Luong tu hoa weight per-channel ---
    q_w, w_scales = quantize_per_channel(w_fp, oc, per_ch)

    # --- input scale: uint8 [0,255] -> float [0,1] ---
    input_scale = 1.0 / 255.0

    # --- output_scale: GIA DINH (chua calibration that) ---
    # Chon de acc*weight_scale dien hinh (~vai nghin) roi ve dai INT8.
    K_GAIN = 255.0 * 64.0 / 127.0
    out_scale = input_scale * K_GAIN

    # --- bias INT32 ---
    # Trong cong thuc requant:
    #   out_q = round((acc * mult_q31) >> shift) + bias_q
    # va mult_q31/2^shift ~= (input_scale * w_scale) / out_scale,
    # nen bias_q phai la bias_real / out_scale (KHONG phai input_scale * w_scale).
    # Truoc day dung denom = input_scale * w_scale -> bias lon gap ~128 lan
    # so voi mult, gay bao hoa 896/1024.
    bias_q = []
    for o in range(oc):
        bias_q.append(int(round(b_fp[o] / out_scale)))

    # --- mult/shift ---
    quant_rows = []
    for o in range(oc):
        m_real = (input_scale * w_scales[o]) / out_scale
        mult, shift = compute_mult_shift(m_real)
        quant_rows.append((shift, mult))

    # --- Ghi file ---
    os.makedirs(OUT_DIR, exist_ok=True)

    def write_hex(name, values, width_bits):
        path = os.path.join(OUT_DIR, name)
        digits = (width_bits + 3) // 4
        mask = (1 << width_bits) - 1
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            for v in values:
                f.write(f"{(v & mask):0{digits}x}\n")
        h = hashlib.sha256(open(path, "rb").read()).hexdigest()
        return h

    h = {}
    h["weight"] = write_hex("weight.hex", q_w, 8)
    h["bias"] = write_hex("bias.hex", bias_q, 32)

    path = os.path.join(OUT_DIR, "quant.hex")
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        for shift, mult in quant_rows:
            f.write(f"{(shift << 32) | (mult & 0xFFFF_FFFF):010x}\n")
    h["quant"] = hashlib.sha256(open(path, "rb").read()).hexdigest()

    meta = {
        "purpose": "weights THAT cua conv0 YOLO11n de verify engine",
        "source_onnx": os.path.basename(ONNX),
        "source_onnx_sha256": hashlib.sha256(
            open(ONNX, "rb").read()).hexdigest(),
        "source_tensor": TARGET_CONV,
        "source_bias": TARGET_BIAS,
        "config": {
            "out_c": oc, "in_c": icg, "kernel": kh,
            "weight_count": len(q_w), "bias_count": len(bias_q),
        },
        "quantization": {
            "scheme": "per_output_channel_symmetric_int8",
            "input_scale": input_scale,
            "output_scale": out_scale,
            "weight_scales": [round(s, 10) for s in w_scales],
            "rounding": "nearest_even",
            "bn_folded": True,
            "bn_eps_note": "ONNX da fold BN voi eps=1e-3 (da verify luot 1)",
        },
        "resolution_note": (
            "Weights/bias/quant KHONG phu thuoc resolution input. "
            "ONNX la 640x640 nhung conv0 [16,3,3,3] dung duoc cho ca 160. "
            "Chi activation shape thay doi."
        ),
        "evidence_level": "SOURCE_VERIFIED_MODEL_WEIGHTS",
        "note": (
            "Day la weights THAT tu YOLO11n, khac voi conv0_golden (random). "
            "Dung de chung minh engine xu ly dung du lieu model that."
        ),
        "sha256": h,
    }
    with open(os.path.join(OUT_DIR, "metadata.json"), "w",
              encoding="utf-8", newline="\n") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    print(f"\nOK -> {OUT_DIR}")
    print(f"  weight INT8 : {len(q_w)} byte")
    print(f"  bias INT32  : {len(bias_q)} entry")
    print(f"  quant       : {len(quant_rows)} entry")
    print(f"  bias_q[0:4] = {bias_q[:4]}")
    print(f"  shift[0:4]  = {[r[0] for r in quant_rows[:4]]}")
    print(f"  mult[0:4]   = {[r[1] for r in quant_rows[:4]]}")
    print(f"  w_scale[0:3]= {[round(s, 8) for s in w_scales[:3]]}")


if __name__ == "__main__":
    main()
