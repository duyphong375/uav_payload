#!/usr/bin/env python3
"""
gen_layer_table.py — Sinh bang cau hinh lop cho kvc_yolo_top.v tu conv_layer_map.csv.

VAN DE: bang hien tai trong kvc_yolo_top.v co 140 dong, trong do:
  - 52 dong la placeholder (p_in_w=1, p_in_h=1, p_in_c=1)
  - TAT CA 140 dong co p_stride=1, trong khi ONNX co 7 conv stride 2
  - p_icg/p_ocg khong phan anh 7 lop grouped (nhom 64/128/256)
=> Bang nay khong the dieu khien dung YOLO11n.

SCRIPT NAY sinh lai bang tu conv_layer_map.csv (88 conv, du lieu tu ONNX),
giu nguyen dinh dang case statement de thay the trong kvc_yolo_top.v.

Output: KVC_PR/rtl/gen/layer_table.vh (include duoc trong kvc_yolo_top.v)
        + in ra man hinh de doi chieu
"""

import csv
import io
import os

CSV = r"D:\KVC_PRODUCT\KVC_PR\docs\processing\conv_layer_map.csv"
OUT = r"D:\KVC_PRODUCT\KVC_PR\rtl\gen\layer_table.vh"


def main():
    rows = list(csv.DictReader(io.open(CSV, encoding="utf-8")))
    if len(rows) != 88:
        raise SystemExit(f"Ky vong 88 conv, doc duoc {len(rows)}")

    lines = []
    lines.append("// -----------------------------------------------------------------------------")
    lines.append("// layer_table.vh — BANG CAU HINH LOP, SINH TU conv_layer_map.csv")
    lines.append("//")
    lines.append("// KHONG SUA TAY. Chay lai: python tools/gen_layer_table.py")
    lines.append("// Nguon: docs/processing/conv_layer_map.csv (88 conv tu ONNX YOLO11n)")
    lines.append("//")
    lines.append("// Truoc day kvc_yolo_top.v co bang 140 dong hard-code voi 52 placeholder")
    lines.append("// va toan bo stride=1 (sai). File nay thay the bang du lieu dung.")
    lines.append("// -----------------------------------------------------------------------------")
    lines.append("")
    lines.append("    case (layer_idx)")

    for i, r in enumerate(rows):
        ish = eval(r["input_shape_nchw"])     # [1, C, H, W]
        osh = eval(r["output_shape_nchw"])
        wsh = eval(r["weight_shape_oihw"])    # [OC, IC/g, KH, KW]
        ksh = eval(r["kernel_shape"])
        sts = eval(r["strides"])
        pds = eval(r["pads"])
        grp = eval(r["groups"])

        in_c, in_h, in_w = ish[1], ish[2], ish[3]
        out_c, out_h, out_w = osh[1], osh[2], osh[3]
        kh, kw = ksh[0], ksh[1]
        sh = sts[0]
        pad = pds[0]
        icg = wsh[1]
        ocg = out_c // grp if grp > 0 else out_c

        lines.append(f"        8'd{i}: begin  // {r['module']}")
        lines.append(f"            p_in_w  = 16'd{in_w};")
        lines.append(f"            p_in_h  = 16'd{in_h};")
        lines.append(f"            p_in_c  = 16'd{in_c};")
        lines.append(f"            p_out_w = 16'd{out_w};")
        lines.append(f"            p_out_h = 16'd{out_h};")
        lines.append(f"            p_out_c = 16'd{out_c};")
        lines.append(f"            p_k_size = 8'd{kh};")
        lines.append(f"            p_stride = 16'd{sh};")
        lines.append(f"            p_pad    = 16'd{pad};")
        lines.append(f"            p_icg    = 16'd{icg};")
        lines.append(f"            p_ocg    = 16'd{ocg};")
        lines.append(f"            p_groups = 16'd{grp};")
        lines.append(f"            p_wbase  = 24'd{int(r['weight_base'])};")
        lines.append(f"            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that")
        lines.append(f"            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that")
        lines.append(f"            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)")
        lines.append("        end")
        lines.append("")

    lines.append("        default: begin")
    lines.append("            p_in_w = 16'd0; p_in_h = 16'd0; p_in_c = 16'd0;")
    lines.append("            p_out_w = 16'd0; p_out_h = 16'd0; p_out_c = 16'd0;")
    lines.append("            p_k_size = 8'd0; p_stride = 16'd1; p_pad = 16'd0;")
    lines.append("            p_icg = 16'd0; p_ocg = 16'd0; p_groups = 16'd1;")
    lines.append("            p_wbase = 24'd0; p_bbase = 24'd0; p_qbase = 24'd0;")
    lines.append("            p_act = 8'd0;")
    lines.append("        end")
    lines.append("    endcase")

    txt = "\n".join(lines) + "\n"
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    io.open(OUT, "w", encoding="utf-8", newline="\n").write(txt)

    # thong ke
    s2 = sum(1 for r in rows if eval(r["strides"])[0] == 2)
    gr = sum(1 for r in rows if eval(r["groups"]) > 1)
    print(f"OK -> {OUT}")
    print(f"  {len(rows)} dong conv")
    print(f"  stride=2 : {s2} (truoc day bang cu ghi 0)")
    print(f"  grouped  : {gr} (truoc day bang cu khong phan anh)")
    print(f"  placeholder: 0 (truoc day 52)")


if __name__ == "__main__":
    main()
