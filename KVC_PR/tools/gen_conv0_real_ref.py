#!/usr/bin/env python3
"""
gen_conv0_real_ref.py — Sinh input + expected cho tb_conv0_real.

Dung weights/bias/quant THAT da sinh boi gen_conv0_real.py.
Activation: du lieu test tat dinh (seed co dinh), gia tri nho de
tranh bao hoa sau requant.

Expected tinh bang cong thuc doc lap voi RTL:
    acc  = sum(act[i] * w[i])
    out  = clamp( round_ties_even((acc * mult) >> shift) + bias , -128, 127 )
"""

import json
import hashlib
import os
import random

D = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "verification", "data", "conv0_real"
)

K, IN_C, OUT_C, IMG, PAD, STRIDE = 3, 3, 16, 8, 1, 1
SEED = 20261031


def read_hex(name, bits):
    v = []
    for line in open(os.path.join(D, name)):
        x = int(line.strip(), 16)
        if bits == 8 and x >= 128:
            x -= 256
        elif bits == 32 and x >= 2**31:
            x -= 2**32
        v.append(x)
    return v


def round_shift(acc, mult, shift):
    """Ties-to-even giong RTL requant()."""
    prod = acc * mult
    if shift == 0:
        return prod
    p_abs = -prod if prod < 0 else prod
    mask = (1 << shift) - 1
    half = 1 << (shift - 1)
    q = p_abs >> shift
    rem = p_abs & mask
    if rem > half or (rem == half and (q & 1)):
        q += 1
    return -q if prod < 0 else q


def main():
    w = read_hex("weight.hex", 8)
    bias = read_hex("bias.hex", 32)
    quant = [int(x.strip(), 16) for x in open(os.path.join(D, "quant.hex"))]

    rng = random.Random(SEED)
    # Activation mo phong pixel anh da luong tu hoa:
    #   uint8 [0,255] -> int8 qua (v - 128) hoac (v/2 - 64)
    # Chon dai [-64, 64] (~ nua dai int8) de dai dien anh co ca toi va sang
    # nhung khong bao hoa ngay. Acc toi da 27*64*127 ~= 219k, van trong int32.
    act = [rng.randint(-64, 64) for _ in range(IMG * IMG * IN_C)]

    expected = []
    for oc in range(OUT_C):
        mult = quant[oc] & 0xFFFFFFFF
        if mult >= 2**31:
            mult -= 2**32
        shift = (quant[oc] >> 32) & 0xFF

        for y in range(IMG):
            for x in range(IMG):
                acc = 0
                for ic in range(IN_C):
                    for ky in range(K):
                        for kx in range(K):
                            iy = y * STRIDE + ky - PAD
                            ix = x * STRIDE + kx - PAD
                            if 0 <= iy < IMG and 0 <= ix < IMG:
                                a = act[ic * IMG * IMG + iy * IMG + ix]
                                ww = w[oc * IN_C * K * K + ic * K * K + ky * K + kx]
                                acc += a * ww
                v = round_shift(acc, mult, shift) + bias[oc]
                expected.append(max(-128, min(127, v)))

    def write_hex(name, values, width_bits):
        path = os.path.join(D, name)
        digits = (width_bits + 3) // 4
        mask = (1 << width_bits) - 1
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            for v in values:
                f.write(f"{(v & mask):0{digits}x}\n")
        return hashlib.sha256(open(path, "rb").read()).hexdigest()

    h_act = write_hex("input_act.hex", act, 8)
    h_exp = write_hex("expected.hex", expected, 8)

    # cap nhat metadata
    mp = os.path.join(D, "metadata.json")
    meta = json.load(open(mp, encoding="utf-8"))
    meta["sha256"]["input_act"] = h_act
    meta["sha256"]["expected"] = h_exp
    meta["reference"] = {
        "generator": "tools/gen_conv0_real_ref.py",
        "seed": SEED,
        "act_range": [-16, 16],
        "img": IMG, "pad": PAD, "stride": STRIDE,
    }
    json.dump(meta, open(mp, "w", encoding="utf-8", newline="\n"),
              ensure_ascii=False, indent=2)

    # thong ke
    import collections
    c = collections.Counter(expected)
    print(f"OK -> {D}")
    print(f"  act={len(act)} expected={len(expected)}")
    print(f"  expected[0:8] = {expected[:8]}")
    print(f"  distinct={len(c)} min={min(expected)} max={max(expected)}")
    print(f"  sat 127={c[127]} sat -128={c[-128]}")


if __name__ == "__main__":
    main()
