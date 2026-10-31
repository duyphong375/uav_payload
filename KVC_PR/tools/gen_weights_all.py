#!/usr/bin/env python3
"""
gen_weights_all.py — Sinh weights.bin / bias.hex / quant.hex cho TOAN BO 88 lop.

Nguon: yolo11n_2class_best.onnx (opset 12, 88 Conv, da BN-folded).
Thu tu lop: conv_layer_map.csv (khop kvc_yolo_top layer_idx 0..87).

Dinh dang dau ra (thay the gen/ hien tai la du lieu gia):

  gen/weights.bin   : INT8, noi tiep theo weight_base tu CSV
                      -> tong phai dung 2.574.656 byte
  gen/bias.hex      : INT32, mot dong moi entry, tong 7.887 dong
  gen/quant.hex     : {shift[7:0], mult_q31[31:0]} = 10 hex digit/dong,
                      tong 7.887 dong
  gen/silu_lut.hex  : INT8, 256 entry (tu gen_silu_lut.py, giu nguyen)
  gen/metadata.json : tham so + hash de tai lap

CONG THUC (da verify o P4 voi conv0):
    weight_q  = round(w_fp / w_scale)            w_scale = max|w_fp|/127 (per-oc)
    bias_q    = round(bias_fp / out_scale)       <- CHIA CHO out_scale
    mult_q31  = round( (input_scale*w_scale/out_scale) x 2^(31-e) )
    shift     = 31 - e,  e chon de mult in [2^30, 2^31)

GIOI HAN: out_scale la GIA DINH (chua calibration that). Chi dung de
verify so hoc engine, KHONG dung de danh gia do chinh xac model.
"""

import csv
import hashlib
import io
import json
import os
import struct
import sys

ONNX = r"D:\Project_UAV_KVC\ai_training\weights\yolo11n_2class_best.onnx"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV  = os.path.join(ROOT, "docs", "processing", "conv_layer_map.csv")
GEN  = os.path.join(ROOT, "gen")

INPUT_SCALE = 1.0 / 255.0
K_GAIN      = 255.0 * 64.0 / 127.0     # giong P4
OUT_SCALE   = INPUT_SCALE * K_GAIN
SHIFT_BITS  = 31

# Gioi han an toan de phat hien som neu ONNX khac CSV
EXPECT_WEIGHTS = 2574656
EXPECT_BIAS    = 7887


# ---------------------------------------------------------------------------
# ONNX reader (protobuf toi gian, khong can package onnx)
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
    data = io.open(path, "rb").read()
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
    if dt == 1:
        return list(struct.unpack_from("<%df" % n, raw, 0))
    if dt == 10:
        return list(struct.unpack_from("<%de" % n, raw, 0))
    raise ValueError("unsupported dtype %d" % dt)


# ---------------------------------------------------------------------------
# Anh xa node_name (CSV) -> ten initializer (ONNX)
#
# ONNX export lam phang ten module: node name co segment lap tien to.
#   /model.10/m/m.0/ffn/ffn.0/conv/Conv
#     -> model.10.m.0.ffn.0.conv
# Quy tac: neu segment bat dau bang (segment truoc + '.'), thay the segment truoc.
# Da verify 87/88; chi dfl khong co bias (DFL dung weight co dinh, khong bias).
# ---------------------------------------------------------------------------
def collapse_segments(segments):
    out = []
    for s in segments:
        if out and s.startswith(out[-1] + '.'):
            out[-1] = s
        else:
            out.append(s)
    return out


def node_to_init_prefix(node_name):
    parts = [p for p in node_name.split("/") if p]
    if parts and parts[-1] in ("Conv", "conv"):
        parts = parts[:-1]
    return ".".join(collapse_segments(parts))


# ---------------------------------------------------------------------------
# Quantization
# ---------------------------------------------------------------------------
def quant_per_channel(w_fp, oc, per_ch):
    q = []
    scales = []
    for o in range(oc):
        row = w_fp[o * per_ch:(o + 1) * per_ch]
        amax = max(abs(v) for v in row) or 1e-9
        s = amax / 127.0
        scales.append(s)
        for v in row:
            qi = int(round(v / s))
            q.append(max(-127, min(127, qi)))
    return q, scales


def compute_mult_shift(m, shift_bits=SHIFT_BITS):
    if m <= 0:
        return 0, shift_bits
    e = 0
    v = m
    while v >= 1.0:
        v /= 2.0
        e += 1
    while v < 0.5:
        v *= 2.0
        e -= 1
    mult = int(round(v * (1 << shift_bits)))
    if mult >= (1 << shift_bits):
        mult = (1 << shift_bits) - 1
    shift = shift_bits - e
    if shift < 0 or shift > 63:
        raise ValueError("shift out of range: %d (m=%.6g)" % (shift, m))
    return mult, shift


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    if not os.path.exists(ONNX):
        raise SystemExit("Khong tim thay ONNX: %s" % ONNX)

    rows = list(csv.DictReader(io.open(CSV, encoding="utf-8")))
    print("CSV: %d lop conv" % len(rows))

    inits = read_initializers(ONNX)
    print("ONNX: %d initializer" % len(inits))

    # Thu tu output: theo weight_base tang dan (chinh la thu tu conv trong graph)
    rows_sorted = sorted(rows, key=lambda r: int(r["weight_base"]))

    weights_all = []      # list INT8
    bias_all    = []      # list INT32
    quant_all   = []      # list (shift, mult)
    seen_base   = 0
    missing     = []

    for idx, r in enumerate(rows_sorted):
        module = r["module"]
        prefix = node_to_init_prefix(r["node_name"])
        wname = prefix + ".weight"
        bname = prefix + ".bias"

        if wname not in inits:
            missing.append(wname)
            continue

        dt, dims, raw = inits[wname]
        w_fp = to_floats(dt, dims, raw)
        oc, icg, kh, kw = dims
        per_ch = icg * kh * kw

        expect_count = int(r["weight_count"])
        if len(w_fp) != expect_count:
            raise SystemExit(
                "MISMATCH %s: ONNX %d weight, CSV %d"
                % (module, len(w_fp), expect_count))

        q_w, scales = quant_per_channel(w_fp, oc, per_ch)
        if len(q_w) != expect_count:
            raise SystemExit("quant sai so luong: %s" % module)

        # bias
        if bname in inits:
            bdt, bdims, braw = inits[bname]
            b_fp = to_floats(bdt, bdims, braw)
        else:
            b_fp = [0.0] * oc

        if len(b_fp) != oc:
            raise SystemExit("bias size mismatch: %s" % module)

        bias_q = [int(round(b / OUT_SCALE)) for b in b_fp]

        # quant
        for o in range(oc):
            m_real = (INPUT_SCALE * scales[o]) / OUT_SCALE
            mult, sh = compute_mult_shift(m_real)
            quant_all.append((sh, mult))

        # noi tiep
        wbase = int(r["weight_base"])
        if wbase != len(weights_all):
            raise SystemExit(
                "weight_base khong lien tuc tai %s: CSV=%d, running=%d"
                % (module, wbase, len(weights_all)))

        weights_all.extend(q_w)
        bias_all.extend(bias_q)
        seen_base += expect_count

    if missing:
        print("CANH BAO: thieu %d tensor trong ONNX:" % len(missing))
        for m in missing[:5]:
            print("  ", m)

    print()
    print("Tong weight: %d byte (ky vong %d)" % (len(weights_all), EXPECT_WEIGHTS))
    print("Tong bias  : %d entry (ky vong %d)" % (len(bias_all), EXPECT_BIAS))
    print("Tong quant : %d entry" % len(quant_all))

    if len(weights_all) != EXPECT_WEIGHTS:
        raise SystemExit("SAI: weights %d != %d" % (len(weights_all), EXPECT_WEIGHTS))
    if len(bias_all) != EXPECT_BIAS:
        raise SystemExit("SAI: bias %d != %d" % (len(bias_all), EXPECT_BIAS))

    # Ghi file
    os.makedirs(GEN, exist_ok=True)

    wpath = os.path.join(GEN, "weights.bin")
    with io.open(wpath, "wb") as f:
        f.write(bytes((v & 0xFF) for v in weights_all))

    bpath = os.path.join(GEN, "bias.hex")
    with io.open(bpath, "w", encoding="ascii", newline="\n") as f:
        for v in bias_all:
            f.write("%08x\n" % (v & 0xFFFFFFFF))

    qpath = os.path.join(GEN, "quant.hex")
    with io.open(qpath, "w", encoding="ascii", newline="\n") as f:
        for sh, mult in quant_all:
            f.write("%010x\n" % (((sh & 0xFF) << 32) | (mult & 0xFFFFFFFF)))

    # Thong ke
    def sha(p):
        return hashlib.sha256(io.open(p, "rb").read()).hexdigest()

    nz = sum(1 for v in weights_all if v != 0)
    import collections
    q_nonzero = sum(1 for sh, m in quant_all if m != 0)

    meta = {
        "purpose": "weights THAT cho 88 lop conv YOLO11n",
        "source_onnx": os.path.basename(ONNX),
        "source_onnx_sha256": sha(ONNX),
        "source_layer_map": "docs/processing/conv_layer_map.csv",
        "n_layers": len(rows_sorted),
        "weight_bytes": len(weights_all),
        "bias_entries": len(bias_all),
        "quant_entries": len(quant_all),
        "weight_nonzero": nz,
        "weight_nonzero_pct": round(100.0 * nz / len(weights_all), 4),
        "quant_nonzero": q_nonzero,
        "quantization": {
            "weight": "per_output_channel_symmetric_int8",
            "input_scale": INPUT_SCALE,
            "out_scale_assumed": OUT_SCALE,
            "out_scale_note": "GIA DINH, chua calibration that — chi dung verify so hoc",
            "bias_formula": "bias_q = round(bias_fp / out_scale)",
            "mult_shift_bits": SHIFT_BITS,
            "bn_folded_in_onnx": True,
            "bn_eps_used_by_export": 1e-3,
        },
        "sha256": {
            "weights.bin": sha(wpath),
            "bias.hex": sha(bpath),
            "quant.hex": sha(qpath),
        },
        "evidence_level": "SOURCE_VERIFIED_MODEL_WEIGHTS",
        "note": (
            "Weights THAT tu ONNX. KHONG dung de danh gia mAP: "
            "out_scale chua calibration. Dung de verify engine va nap flash."
        ),
    }
    mpath = os.path.join(GEN, "metadata.json")
    io.open(mpath, "w", encoding="utf-8", newline="\n").write(
        json.dumps(meta, ensure_ascii=False, indent=2) + "\n")

    print()
    print("OK -> %s" % GEN)
    print("  weights.bin : %d byte, nonzero %d (%.2f%%)"
          % (len(weights_all), nz, 100.0 * nz / len(weights_all)))
    print("  bias.hex    : %d dong, min=%d max=%d"
          % (len(bias_all), min(bias_all), max(bias_all)))
    print("  quant.hex   : %d dong, mult!=0: %d, shift range [%d..%d]"
          % (len(quant_all), q_nonzero,
             min(s for s, _ in quant_all), max(s for s, _ in quant_all)))
    print("  sha256 weights.bin = %s" % meta["sha256"]["weights.bin"])


if __name__ == "__main__":
    main()
