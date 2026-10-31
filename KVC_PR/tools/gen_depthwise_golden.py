#!/usr/bin/env python3
"""
gen_depthwise_golden.py — Sinh golden cho lop DEPTHWISE (E-03).

Muc dich: chung minh conv_engine_dynamic_fsm xu ly dung GROUPS>1.
YOLO11n co 7 lop grouped/depthwise voi nhom 64/128/256. Test nay dung
cau hinh nho (IN_C=OUT_C=4, GROUPS=4) de chay nhanh trong mo phong.

Depthwise: moi output channel oc chi tich luy tu MOT input channel
tuong ung, weight shape [OUT_C][1][K][K].

Output (KVC_PR/verification/data/depthwise/):
    weight.hex, bias.hex, quant.hex, input_act.hex, expected.hex, metadata.json
"""

import json
import hashlib
import os
import random

D = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "verification", "data", "depthwise"
)

K, C, IMG, PAD, STRIDE, SHIFT = 3, 4, 6, 1, 1, 31
GROUPS = C          # depthwise
SEED = 20261031


def clamp(v):
    return max(-128, min(127, v))


def round_shift(acc, mult, shift):
    prod = acc * mult
    if shift == 0:
        return prod
    p = -prod if prod < 0 else prod
    mask = (1 << shift) - 1
    half = 1 << (shift - 1)
    q = p >> shift
    rem = p & mask
    if rem > half or (rem == half and (q & 1)):
        q += 1
    return -q if prod < 0 else q


def main():
    rng = random.Random(SEED)

    # depthwise: weight [OUT_C][1][K][K]
    in_c_per_g = C // GROUPS          # = 1
    act = [rng.randint(-16, 16) for _ in range(IMG * IMG * C)]
    w = [rng.randint(-6, 6) for _ in range(C * in_c_per_g * K * K)]
    bias = [rng.randint(-32, 32) for _ in range(C)]

    input_scale = 1.0 / 255.0
    out_scale = input_scale * 128.5

    # per-channel weight scale
    w_scales = []
    q_w = []
    per = in_c_per_g * K * K
    for o in range(C):
        row = w[o * per:(o + 1) * per]
        amax = max(abs(v) for v in row) or 1e-9
        s = amax / 127.0
        w_scales.append(s)
        for v in row:
            q_w.append(max(-127, min(127, int(round(v / s)))))

    bias_q = [int(round(b / out_scale)) for b in bias]

    def mult_shift(m_real):
        e = 0
        v = m_real
        while v >= 1.0:
            v /= 2.0
            e += 1
        while v < 0.5:
            v *= 2.0
            e -= 1
        mult = int(round(v * (1 << SHIFT)))
        if mult >= (1 << SHIFT):
            mult = (1 << SHIFT) - 1
        return mult, SHIFT - e

    quant = []
    for o in range(C):
        m_real = (input_scale * w_scales[o]) / out_scale
        mult, sh = mult_shift(m_real)
        quant.append((sh, mult))

    # expected: depthwise -> moi oc chi dung kenh oc
    expected = []
    for oc in range(C):
        mult = quant[oc][1]
        if mult >= 2**31:
            mult -= 2**32
        sh = quant[oc][0]
        for y in range(IMG):
            for x in range(IMG):
                acc = 0
                for ky in range(K):
                    for kx in range(K):
                        iy = y * STRIDE + ky - PAD
                        ix = x * STRIDE + kx - PAD
                        if 0 <= iy < IMG and 0 <= ix < IMG:
                            a = act[oc * IMG * IMG + iy * IMG + ix]
                            ww = q_w[oc * per + ky * K + kx]
                            acc += a * ww
                expected.append(clamp(round_shift(acc, mult, sh) + bias_q[oc]))

    os.makedirs(D, exist_ok=True)

    def wh(name, vals, bits):
        p = os.path.join(D, name)
        digits = (bits + 3) // 4
        mask = (1 << bits) - 1
        with open(p, "w", encoding="utf-8", newline="\n") as f:
            for v in vals:
                f.write(f"{(v & mask):0{digits}x}\n")
        return hashlib.sha256(open(p, "rb").read()).hexdigest()

    h = {}
    h["weight"] = wh("weight.hex", q_w, 8)
    h["bias"] = wh("bias.hex", bias_q, 32)
    h["input_act"] = wh("input_act.hex", act, 8)
    h["expected"] = wh("expected.hex", expected, 8)

    pq = os.path.join(D, "quant.hex")
    with open(pq, "w", encoding="utf-8", newline="\n") as f:
        for sh, m in quant:
            f.write(f"{(sh << 32) | (m & 0xFFFF_FFFF):010x}\n")
    h["quant"] = hashlib.sha256(open(pq, "rb").read()).hexdigest()

    meta = {
        "purpose": "golden cho lop DEPTHWISE (E-03): chung minh GROUPS>1",
        "config": {
            "kernel": K, "channels": C, "groups": GROUPS,
            "in_c_per_group": in_c_per_g, "img": IMG,
            "pad": PAD, "stride": STRIDE,
        },
        "counts": {
            "act": len(act), "weight": len(q_w),
            "bias": len(bias_q), "expected": len(expected),
        },
        "seed": SEED,
        "evidence_level": "SYNTHETIC_ONLY",
        "note": (
            "Depthwise nho (4 kenh) de chay nhanh. YOLO11n that co nhom "
            "64/128/256 — cung co che, chi khac kich thuoc."
        ),
        "sha256": h,
    }
    with open(os.path.join(D, "metadata.json"), "w",
              encoding="utf-8", newline="\n") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    print(f"OK -> {D}")
    print(f"  C={C} GROUPS={GROUPS} in_c_per_g={in_c_per_g}")
    print(f"  weight={len(q_w)} expected={len(expected)}")
    print(f"  expected[0:6] = {expected[:6]}")
    import collections
    c = collections.Counter(expected)
    print(f"  distinct={len(c)} min={min(expected)} max={max(expected)}")


if __name__ == "__main__":
    main()
