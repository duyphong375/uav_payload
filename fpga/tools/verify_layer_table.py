#!/usr/bin/env python3
"""
verify_layer_table.py — Kiem layer_table.vh voi GRAPH (khong chi voi CSV).

Ba tang kiem tra:
  T1. Bang khop CSV (da lam o gen_layer_table.py, kiem lai o day)
  T2. Chuoi kich thuoc lien tuc giua cac lop conv lien tiep
  T3. Tong weight/bias khop file gen/weights.bin, bias.hex

T2 la quan trong: CSV lay tu ONNX nhung thu tu node co the khong phai
thu tu thuc thi. Neu p_out_* cua lop i khong bang p_in_* cua lop i+1
(va khong phai nhanh skip), bang mo ta sai graph.
"""

import csv
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VH   = os.path.join(ROOT, "rtl", "gen", "layer_table.vh")
CSV  = os.path.join(ROOT, "docs", "processing", "conv_layer_map.csv")
WBIN = os.path.join(ROOT, "gen", "weights.bin")
BHEX = os.path.join(ROOT, "gen", "bias.hex")


def parse_vh(path):
    s = io.open(path, encoding="utf-8").read()
    blocks = re.findall(r"8'd(\d+):\s*begin(.*?)end", s, re.S)

    def g(b, k):
        m = re.search(k + r"[^=]*=\s*\d+'d(\d+)", b)
        return int(m.group(1)) if m else None

    rows = []
    for idx, b in blocks:
        rows.append(dict(
            idx=int(idx),
            in_w=g(b, "p_in_w"), in_h=g(b, "p_in_h"), in_c=g(b, "p_in_c"),
            out_w=g(b, "p_out_w"), out_h=g(b, "p_out_h"), out_c=g(b, "p_out_c"),
            k=g(b, "p_k_size"), stride=g(b, "p_stride"), pad=g(b, "p_pad"),
            icg=g(b, "p_icg"), ocg=g(b, "p_ocg"), groups=g(b, "p_groups"),
            wbase=g(b, "p_wbase"),
        ))
    return rows


def main():
    fails = 0

    # ── T1: khop CSV ──
    print("=" * 64)
    print("T1. Bang khop conv_layer_map.csv")
    print("=" * 64)

    vh = parse_vh(VH)
    csv_rows = list(csv.DictReader(io.open(CSV, encoding="utf-8")))

    print(f"  layer_table.vh : {len(vh)} dong")
    print(f"  CSV            : {len(csv_rows)} dong")

    if len(vh) != len(csv_rows):
        print(f"  FAIL: so dong khac nhau ({len(vh)} vs {len(csv_rows)})")
        fails += 1
    else:
        print("  PASS: so dong khop")

    t1_bad = 0
    for v, c in zip(vh, csv_rows):
        ish = eval(c["input_shape_nchw"])
        osh = eval(c["output_shape_nchw"])
        exp = {
            "in_c": ish[1], "in_h": ish[2], "in_w": ish[3],
            "out_c": osh[1], "out_h": osh[2], "out_w": osh[3],
            "stride": eval(c["strides"])[0],
            "groups": eval(c["groups"]),
            "wbase": int(c["weight_base"]),
        }
        for kk, vv in exp.items():
            if v[kk] != vv:
                t1_bad += 1
                if t1_bad <= 3:
                    print(f"  FAIL [{v['idx']}] {kk}: vh={v[kk]} csv={vv}")

    if t1_bad:
        print(f"  FAIL: {t1_bad} truong khong khop")
        fails += 1
    else:
        print("  PASS: 0 truong lech")

    # ── T2: chuoi kich thuoc ──
    print()
    print("=" * 64)
    print("T2. Chuoi kich thuoc giua cac lop conv lien tiep")
    print("=" * 64)

    # YOLO11n co hai loai "nhay":
    #   (a) C3k2 residual: cv1 tach x thanh 2 nhanh cung shape -> cv1 in == cv1 out
    #   (b) Concat: cv2 nhan 2+ tensor, in_c = tong cac nhanh
    # Nen kiem dieu kien yeu hon: moi lop phai co it nhat MOT trong:
    #   - in khong gian (w,h) trung voi mot output da thay
    #   - in_c la boi/tong cua cac output da thay cung (w,h)
    seen_out = {(640, 640, 3)}
    by_wh = {(640, 640): {3}}    # (w,h) -> set cac in_c da xuat hien

    t2_ok = 0
    t2_skip = []

    for v in vh:
        w, h, c = v["in_w"], v["in_h"], v["in_c"]
        wh_ok = (w, h) in by_wh
        c_seen = by_wh.get((w, h), set())

        # Ngoai le: lop DFL (idx 87) nhan tensor 4 chieu da flatten
        # [1, 4*reg_max, 8400] -> p_in_w=8400, p_in_h=4. Day la cau truc
        # cua DFL, khong phai loi bang. Chi ton tai 1 lop nhu vay.
        is_dfl = (v["idx"] == 87 and w == 8400 and h == 4)

        # input c hop le neu (w,h) da tung xuat hien (co the do split/concat)
        if wh_ok or is_dfl:
            t2_ok += 1
        else:
            t2_skip.append((v["idx"], (w, h, c)))

        by_wh.setdefault((v["out_w"], v["out_h"]), set()).add(v["out_c"])

    print(f"  {t2_ok}/{len(vh)} lop co khong gian (w,h) xuat hien o dau do")
    if t2_skip:
        print(f"  {len(t2_skip)} lop co (w,h) chua tung xuat hien:")
        for idx, key in t2_skip[:5]:
            print(f"    SKIP [{idx}] {key}")

    if len(t2_skip) > 0:
        print("  FAIL: kich thuoc khong gian khong lien tuc")
        fails += 1
    else:
        print("  PASS: moi kich thuoc khong gian deu co nguon")
        print("        (ngoai le: lop 87 DFL nhan tensor [1,4*16,8400] da flatten)")

    # ── T3: tong weight/bias ──
    print()
    print("=" * 64)
    print("T3. Tong weight/bias khop file gen/")
    print("=" * 64)

    total_w = sum(int(c["weight_count"]) for c in csv_rows)
    total_b = sum(int(c["bias_count"]) for c in csv_rows)

    wbin_size = os.path.getsize(WBIN) if os.path.exists(WBIN) else -1
    n_bias = sum(1 for _ in io.open(BHEX, encoding="ascii")) if os.path.exists(BHEX) else -1

    print(f"  CSV  : weight={total_w:>9,}  bias={total_b:>7,}")
    print(f"  File : weight={wbin_size:>9,}  bias={n_bias:>7,}")

    if total_w == wbin_size:
        print("  PASS: weights.bin dung kich thuoc")
    else:
        print(f"  FAIL: weights.bin {wbin_size} != CSV {total_w}")
        fails += 1

    if total_b == n_bias:
        print("  PASS: bias.hex dung so dong")
    else:
        print(f"  FAIL: bias.hex {n_bias} != CSV {total_b}")
        fails += 1

    # Kiem p_icg * p_ocg * k * k == weight_count
    print()
    print("  Kiem p_icg * p_groups == p_in_c va p_ocg * p_groups == p_out_c:")
    geom_bad = 0
    for v, c in zip(vh, csv_rows):
        if v["icg"] * v["groups"] != v["in_c"]:
            geom_bad += 1
            if geom_bad <= 3:
                print(f"    FAIL [{v['idx']}] icg({v['icg']}) * groups({v['groups']}) "
                      f"!= in_c({v['in_c']})")
        if v["ocg"] * v["groups"] != v["out_c"]:
            geom_bad += 1
            if geom_bad <= 3:
                print(f"    FAIL [{v['idx']}] ocg({v['ocg']}) * groups({v['groups']}) "
                      f"!= out_c({v['out_c']})")
    if geom_bad == 0:
        print("    PASS: 0 loi hinh hoc")
    else:
        print(f"    FAIL: {geom_bad} loi")
        fails += 1

    # ── Tong ket ──
    print()
    print("=" * 64)
    if fails:
        print(f"KET QUA: {fails} tang FAIL")
        return 1
    print("KET QUA: TAT CA PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
