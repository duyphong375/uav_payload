#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""decode_pixel_diag.py — Giai ma bao cao THONG KE MAU RGB565 (muc G6.1.9).

BOI CANH
    Muc 6.1.9 cua BRINGUP_CHECKLIST yeu cau do GIA TRI MAU that (R/G/B) de biet
    nguong trong `kvc_blob_detect.v` co dung khong. Day la phep do KHAC 6.1.10:
      6.1.10 hoi "co blob khong"   -> tra loi bang `BB n1` tren log MCU
      6.1.9  hoi "mau that la gi"  -> phai doc gia tri pixel

    Duong du lieu khong mang pixel ra ngoai, nen phai nap bitstream chan doan
    `kvc_top_diag_pixel` (DIAG_MODE = 3) va doc bao cao qua khung IF-01.

ANH XA 12 SLOT (rev 5, 2026-11-04)
    slot  X                        Y                  Y nghia
    ----  -----------------------  -----------------  --------------------------
      0   pix_count[15:0]           pix_count[18:16]   tong so pixel hop le
      1   sum_r[15:0]               sum_r[24:16]       tong R5 (5 bit)
      2   sum_g[15:0]               sum_g[24:16]       tong G6 (6 bit)
      3   sum_b[15:0]               sum_b[24:16]       tong B5 (5 bit)
      4   cnt_match[15:0]           cnt_match[18:16]   so pixel vao cnt cua blob
      5   {vsync_per_rep[5:0],      max_py             so VSYNC ke tu bao cao
          max_px[9:0]}                                 truoc + cot lon nhat
      6   cnt_ord_ok[15:0]          (cnt_ord_ok[18:16]) R>G>B
      7   cnt_hue_ok[15:0]          (cnt_hue_ok[18:16]) 6n>=d va 3n<=2d (~10..40 do)
      8   cnt_sat_ok[15:0]          (cnt_sat_ok[18:16]) 5B<=R (S >= 0,80)
      9   cnt_tone_ok[15:0]         (cnt_tone_ok[18:16]) R>=32 va R-B>=24
     10   PIXSTAT_REV (5)           0                  dau hieu nhan dien rev 5
     11   href_per_vs               max_r5             so dong HREF sensor phat
                                                        trong khung vua roi

    W cua moi slot = chi so slot (0..11).

    REV 5 THEM GI (tra loi F-10)
      `vsync_per_rep` = so xung VSYNC ke tu bao cao truoc. Bao cao chi phat khi
      da co pixel, nen:
          vsync_per_rep == 1  -> binh thuong, mot VSYNC mot khung
          vsync_per_rep >= 2  -> CO xung VSYNC giua khung (gai) -> F-10 co che (B)
      `href_per_vs` = so dong HREF sensor noi da phat trong khung vua roi. So
      sanh voi `pix_count / 400`:
          href_per_vs ~ 300, pix/400 ~ 200 -> FPGA/camera_rx LAM ROT pixel (C)
          href_per_vs ~ 200, pix/400 ~ 200 -> sensor TU CAT frame (A)
      `max_px` giam con 10 bit (0..399 la du cho 400 cot).

    REV 3 (bitstream 05288FA6) CO HAI LOI KHONG SUA DUOC BANG TOOL NAY:
      1. `d`/`n` trong RTL khai bao 8 bit nen TRAN khi R8 < B8 / G8 < B8, va
         `hue_ok`/`tone_ok` dung chung ma khong co `ord_ok` chan. Ket qua:
         slot 7 (`cnt_hue_ok`) va slot 9 (`cnt_tone_ok`) dem ca pixel XANH/TIM.
         Quet du 65.536 ma RGB565: 10.581 ma (65 % tong hue_ok) va 24.192 ma
         (46,6 % tong tone_ok) la ARTIFACT cua tran. KHONG dung hai so nay de
         ket luan nguong mau. Rev 4 sua goc.
      2. `center_pixel` (slot 5) doc tai (320,240). Neu frame khong toi dong 240
         thi in lai gia tri frame TRUOC. Rev 4 thay slot 5 bang max_px/max_py.
      `cnt_match` (slot 4) va `cnt_ord_ok`/`cnt_sat_ok` (slot 6/8) KHONG bi anh
      huong: `ord_ok` da bao dam R > G > B truoc khi tinh. Ba so nay van dung
      tren rev 3.

    REV 1 (bitstream A92E18B9, capture 03/11/2026) dung nguong CHAT HON blob
    (R>=26, G<=12, B<=8) nen `red_count` KHONG so sanh duoc voi blob. Rev 2
    dung nguong blob CU (R>=20, G 10..44, B<=12) — nguong do da bi thay bang
    bo loc TY LE o rev 2 cua `kvc_blob_detect`, nen rev 2 khong con do duoc
    cai gi co y nghia. Rev 3 copy dung tung dieu kien cua bo loc ty le va ghi
    so revision vao slot 10, nen khong phai suy doan nhu truoc.

    Tool van doc duoc rev 1 (de doc lai capture cu) va rev 2, nhung chi rev 3
    moi so sanh duoc voi `cnt` cua blob hien tai.

CACH TINH TRUNG BINH
    RTL khong chia (divider ton DSP va lam giam Fmax). Tool tinh o day:
        mean_R5 = sum_r / pix_count        (thang 0..31)
        mean_R8 = round(mean_R5 * 255/31)  (thang 0..255, de so voi checklist)
    Tuong tu cho G (0..63) va B (0..31).

SU DUNG
    python scripts/manual/decode_pixel_diag.py --file <capture.bin>
    python scripts/manual/decode_pixel_diag.py --file <capture.bin> --all
    python scripts/manual/decode_pixel_diag.py --file <capture.bin> --json

QUY TRINH DO (muc 6.1.9)
    1. Xac nhan hash bitstream TRUOC khi nap:
         Get-FileHash review\\artifacts\\KVC_FPGA_diag_pixel_EC4BC008.fs -Algorithm SHA256
       Phai ra EC4BC0081339729AD8CAFA4551A3076908E0FCC04CF4A8827A61B9CF153971A4
    2. Nap bang Gowin Programmer -> SRAM Program
    3. Dat vat DO/CAM DAC phu kin khung hinh (khong dung man hinh phat — AWB va
       vien man hinh lam sai mau, da gap trong F-02)
    4. Capture RAW (khong dung HEX cua Hercules):
         python scripts/manual/fpga_uart_capture.py --port COM6 --baud 38400 \\
             --seconds 10 --dump px.bin
    5. Chay tool nay: python scripts/manual/decode_pixel_diag.py --file px.bin
    6. NAP LAI release `9E62B590` truoc khi lam bat ky viec gi khac
"""

import argparse
import io
import json
import sys

# Console Windows mac dinh la cp1252/cp437 va khong in duoc chu co dau (vd "cung").
# Bao ve bang wrapper UTF-8 nhu `soak_mcu_log.py`. Chi ap dung khi chay nhu script:
# neu import (pytest, tool khac) ma doi sys.stdout toan cuc se pha capture cua
# pytest va co the lam hong output cua tien trinh goi.
if __name__ == "__main__" and sys.platform == "win32" and hasattr(sys.stdout, "buffer"):
    try:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8",
                                      errors="replace", line_buffering=True)
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8",
                                      errors="replace", line_buffering=True)
    except Exception:
        pass

SYNC0, SYNC1 = 0x5A, 0xA5
VERSION = 1
MAX_N = 12
HEADER_LEN = 8
BBOX_LEN = 8
CRC_LEN = 2

# So slot toi thieu de giai ma duoc bao cao (rev 1 phat 6 slot co nghia;
# rev 2 phat 10 slot co nghia; rev 3/4 phat 11 slot co nghia).
PIXSTAT_SLOTS = 6

# Slot 10 mang so revision. Rev 1/2 de 0; rev 3 va rev 4 ghi so that.
PIXSTAT_REV_SLOT = 10
PIXSTAT_REV_EXPECT = 6

# Chi rev 4 moi co slot 7 (hue) va slot 9 (tone) DUNG NGHIA VOI BLO HIEN TAI:
#   - rev 1/2 dung nguong BIEN DO tuyet doi (khac bo loc ty le), nhung hai bo dem
#     van dung voi nguong cua chinh no -> van doc duoc, chi la khong so sanh duoc.
#   - rev 3 dung bo loc ty le nhung `d`/`n` khai bao 8 bit nen TRAN khi R8 < B8 /
#     G8 < B8 -> hue/tone dem ca pixel lanh. Hai slot nay VO NGHIA.
#   - rev 4 sua goc va la ban duy nhat so sanh duoc tung dieu kien voi blob.
REV_TRUSTED_HUE_TONE = 4
REV_WRAP_BUG = 3


def crc16_ccitt_false(data):
    crc = 0xFFFF
    for b in data:
        crc ^= b << 8
        for _ in range(8):
            if crc & 0x8000:
                crc = ((crc << 1) ^ 0x1021) & 0xFFFF
            else:
                crc = (crc << 1) & 0xFFFF
    return crc


def parse_frames(buf):
    """Tach khung IF-01. Tra ve list dict + so khung loi CRC."""
    frames = []
    crc_err = 0
    i = 0
    n = len(buf)
    while i + HEADER_LEN + CRC_LEN <= n:
        if buf[i] != SYNC0 or buf[i + 1] != SYNC1:
            i += 1
            continue
        ver = buf[i + 2]
        count = buf[i + 3]
        if ver != VERSION or count > MAX_N:
            i += 1
            continue
        total = HEADER_LEN + count * BBOX_LEN + CRC_LEN
        if i + total > n:
            break
        body = buf[i:i + total - CRC_LEN]
        recv = buf[i + total - 2] | (buf[i + total - 1] << 8)
        if crc16_ccitt_false(body) != recv:
            crc_err += 1
            i += 1
            continue

        ts = buf[i + 4] | (buf[i + 5] << 8) | (buf[i + 6] << 16) | (buf[i + 7] << 24)
        boxes = []
        for k in range(count):
            o = i + HEADER_LEN + k * BBOX_LEN
            boxes.append({
                "x": buf[o] | (buf[o + 1] << 8),
                "y": buf[o + 2] | (buf[o + 3] << 8),
                "w": buf[o + 4],
                "h": buf[o + 5],
                "cls": buf[o + 6],
                "conf": buf[o + 7],
            })
        frames.append({"offset": i, "ts": ts, "count": count, "boxes": boxes})
        i += total
    return frames, crc_err


def join16(lo, hi):
    return lo + (hi << 16)


def decode_report(frame):
    """Giai ma mot khung bao cao pixel_stats -> dict thong ke."""
    b = frame["boxes"]
    if len(b) < PIXSTAT_SLOTS:
        return None

    # Kiem thu tu slot qua truong W (phai = chi so)
    order_ok = all(b[k]["w"] == k for k in range(PIXSTAT_SLOTS))

    rep = {
        "ts": frame["ts"],
        "pix_count": join16(b[0]["x"], b[0]["y"]),
        "sum_r": join16(b[1]["x"], b[1]["y"]),
        "sum_g": join16(b[2]["x"], b[2]["y"]),
        "sum_b": join16(b[3]["x"], b[3]["y"]),
        "cnt_match": join16(b[4]["x"], b[4]["y"]),
        "slot5_x": b[5]["x"],
        "slot5_y": b[5]["y"],
        "order_ok": order_ok,
    }

    # Rev 4 ghi thang so revision vao slot 10. Day la bang chung manh nhat,
    # khong phai suy doan tu cac slot chan doan.
    rep["rev_slot"] = b[PIXSTAT_REV_SLOT]["x"] if len(b) > PIXSTAT_REV_SLOT else 0

    # Slot 5 doi nghia theo rev:
    #   rev 1..3: center_pixel (16 bit) + max_r5 (5 bit)
    #   rev 4   : max_px + max_py, max_r5 chuyen sang slot 11
    #   rev 5   : {vsync_per_rep[5:0], max_px[9:0]} + max_py;
    #             slot 11 = {href_per_vs, max_r5}
    rev = rep["rev_slot"]
    if rev >= 5:
        rep["max_px"] = b[5]["x"] & 0x03FF
        rep["max_py"] = b[5]["y"]
        rep["vsync_per_rep"] = (b[5]["x"] >> 10) & 0x3F
        rep["href_per_vs"] = b[11]["x"] if len(b) > 11 else 0
        rep["max_r5"] = b[11]["y"] & 0x1F if len(b) > 11 else 0
        rep["center_pixel"] = None
    elif rev >= 4:
        rep["max_px"] = b[5]["x"]
        rep["max_py"] = b[5]["y"]
        rep["vsync_per_rep"] = None
        rep["href_per_vs"] = None
        rep["center_pixel"] = None
        rep["max_r5"] = b[11]["x"] & 0x1F if len(b) > 11 else 0
    else:
        rep["max_px"] = None
        rep["max_py"] = None
        rep["vsync_per_rep"] = None
        rep["href_per_vs"] = None
        rep["center_pixel"] = b[5]["x"]
        rep["max_r5"] = b[5]["y"] & 0x1F

    # Rev 1 khong co slot 6..9 va khong co slot 10. Rev 2 co 6..9 nhung slot 10
    # = 0. Dung bat bien cua rev 2/3: cnt_match <= min(ord, hue, sat, tone) —
    # khong the co match ma ca bon chi tieu deu 0.
    if len(b) >= 10:
        rep["cnt_ord_ok"] = join16(b[6]["x"], b[6]["y"])
        rep["cnt_hue_ok"] = join16(b[7]["x"], b[7]["y"])
        rep["cnt_sat_ok"] = join16(b[8]["x"], b[8]["y"])
        rep["cnt_tone_ok"] = join16(b[9]["x"], b[9]["y"])
    else:
        rep["cnt_ord_ok"] = rep["cnt_hue_ok"] = rep["cnt_sat_ok"] = rep["cnt_tone_ok"] = 0

    # Giu ten cu de khong pha vo tool/tests da co (y nghia da doi o rev 3).
    rep["cnt_r_ok"] = rep["cnt_ord_ok"]
    rep["cnt_g_ok"] = rep["cnt_hue_ok"]
    rep["cnt_b_ok"] = rep["cnt_sat_ok"]
    rep["cnt_rg_ok"] = rep["cnt_tone_ok"]

    rep["diag_sum"] = (rep["cnt_ord_ok"] + rep["cnt_hue_ok"]
                       + rep["cnt_sat_ok"] + rep["cnt_tone_ok"])
    if rep["rev_slot"] >= PIXSTAT_REV_EXPECT:
        rep["rev"] = rep["rev_slot"]
    elif rep["rev_slot"] > 0:
        rep["rev"] = rep["rev_slot"]
    elif rep["pix_count"] == 0:
        rep["rev"] = 0
    elif rep["diag_sum"] > 0:
        rep["rev"] = 2
    elif rep["cnt_match"] > 0:
        rep["rev"] = 1
    else:
        rep["rev"] = 0
    rep["rev_known"] = rep["rev"] != 0

    # Rev 3 khong the tin slot 7 (hue) va slot 9 (tone): hai bo dem do bi cong
    # ca pixel lanh do phep tru 8 bit bi tran. Rev 1/2 dung nguong bien do nen
    # khong dinh loi nay. Xem docstring.
    rep["hue_tone_trusted"] = rep["rev"] != REV_WRAP_BUG
    rep["hue_tone_wrap_bug"] = rep["rev"] == REV_WRAP_BUG

    if rep["center_pixel"] is not None:
        # Rev 1..3: tach center_pixel thanh kenh
        cp = rep["center_pixel"]
        rep["center_r5"] = (cp >> 11) & 0x1F
        rep["center_g6"] = (cp >> 5) & 0x3F
        rep["center_b5"] = cp & 0x1F
    else:
        rep["center_r5"] = rep["center_g6"] = rep["center_b5"] = None

    # Trung binh (RTL khong chia)
    n = rep["pix_count"]
    if n > 0:
        mr5 = rep["sum_r"] / n
        mg6 = rep["sum_g"] / n
        mb5 = rep["sum_b"] / n
        rep["mean_r5"] = mr5
        rep["mean_g6"] = mg6
        rep["mean_b5"] = mb5
        # Quy ve thang 8 bit de so voi checklist (R>0xF000 = 240/255)
        rep["mean_r8"] = round(mr5 * 255.0 / 31.0)
        rep["mean_g8"] = round(mg6 * 255.0 / 63.0)
        rep["mean_b8"] = round(mb5 * 255.0 / 31.0)
        rep["match_pct"] = 100.0 * rep["cnt_match"] / n
        rep["ord_ok_pct"] = 100.0 * rep["cnt_ord_ok"] / n
        rep["hue_ok_pct"] = 100.0 * rep["cnt_hue_ok"] / n
        rep["sat_ok_pct"] = 100.0 * rep["cnt_sat_ok"] / n
        rep["tone_ok_pct"] = 100.0 * rep["cnt_tone_ok"] / n
        # Ten cu, giu de khong pha vo caller da co.
        rep["r_ok_pct"] = rep["ord_ok_pct"]
        rep["g_ok_pct"] = rep["hue_ok_pct"]
        rep["b_ok_pct"] = rep["sat_ok_pct"]
        rep["rg_ok_pct"] = rep["tone_ok_pct"]
    else:
        for k in ("mean_r5", "mean_g6", "mean_b5",
                  "mean_r8", "mean_g8", "mean_b8",
                  "match_pct", "r_ok_pct", "g_ok_pct", "b_ok_pct", "rg_ok_pct",
                  "ord_ok_pct", "hue_ok_pct", "sat_ok_pct", "tone_ok_pct"):
            rep[k] = 0.0

    return rep

def infer_file_rev(reports):
    """Suy revision cua CA FILE tu cac bao cao.

    Mot file la mot bitstream, khong the tron rev. Rev 3 ghi thang so revision
    vao slot 10 nen uu tien tuyet doi. Rev 2 va rev 1 phai suy tu cac slot chan
    doan; frame toan mau la khong tu khang dinh duoc rev, nen lay bang chung tu
    cac frame khac trong cung file.

    Returns: 6, 5, 4, 3, 2, 1, hoac 0 (khong du bang chung).
    """
    revs = {rep["rev"] for _, rep in reports}
    for r in (6, 5, 4, 3, 2, 1):
        if r in revs:
            return r
    return 0


def effective_rev(rep):
    """Rev cua frame, fallback ve rev cua ca file khi frame khong du bang chung."""
    return rep.get("file_rev") or rep["rev"]


def evaluate(rep):
    """Danh gia theo tieu chi 6.1.9 cua checklist.

    Checklist ghi: "vat do thuan, R > 0xF000, G/B < 0x2000" trong thang RGB565
    16 bit. Quy ra thang 8 bit: R > 240/255, G/B < 32/255.
    """
    verdicts = []

    def add(name, ok, detail):
        verdicts.append({"name": name, "ok": ok, "detail": detail})

    add("Có pixel", rep["pix_count"] > 0,
        f"pix_count={rep['pix_count']}")

    if rep["pix_count"] == 0:
        return verdicts

    # Thang 8 bit de so truc tiep voi checklist
    add("R trung binh > 240/255", rep["mean_r8"] > 240,
        f"mean_r8={rep['mean_r8']:.1f} (mean_r5={rep['mean_r5']:.2f}/31)")
    add("G trung binh < 32/255", rep["mean_g8"] < 32,
        f"mean_g8={rep['mean_g8']:.1f} (mean_g6={rep['mean_g6']:.2f}/63)")
    add("B trung binh < 32/255", rep["mean_b8"] < 32,
        f"mean_b8={rep['mean_b8']:.1f} (mean_b5={rep['mean_b5']:.2f}/31)")

    if effective_rev(rep) >= 2:
        # Chan doan dieu kien nao loai nhieu pixel nhat — day la du lieu cho F-02.
        same = ("cùng bộ lọc với blob (rev 4)"
                if effective_rev(rep) >= 4
                else f"cùng bộ lọc với blob (rev {effective_rev(rep)}; hue/tone bị lỗi tràn)")
        add("[thông tin] Tỉ lệ khớp đủ điều kiện", True,
            f"{rep['match_pct']:.2f}% ({same})")
        add("[thông tin] Loại theo thứ tự R>G>B", True,
            f"đạt {rep['ord_ok_pct']:.1f}% → loại {100 - rep['ord_ok_pct']:.1f}%")
        add("[thông tin] Loại theo bão hoà S>=0,80", True,
            f"đạt {rep['sat_ok_pct']:.1f}% → loại {100 - rep['sat_ok_pct']:.1f}%")

        if rep["hue_tone_trusted"]:
            add("[thông tin] Loại theo dải hue 10..40 độ", True,
                f"đạt {rep['hue_ok_pct']:.1f}% → loại {100 - rep['hue_ok_pct']:.1f}%")
            add("[thông tin] Loại theo độ sáng + chroma", True,
                f"đạt {rep['tone_ok_pct']:.1f}% → loại {100 - rep['tone_ok_pct']:.1f}%")
        else:
            add(f"[CẢNH BÁO] rev {effective_rev(rep)} tràn 8 bit: hue/tone KHÔNG tin được", False,
                f"hue={rep['hue_ok_pct']:.1f}% và tone={rep['tone_ok_pct']:.1f}% "
                f"đếm cả pixel lạnh; KHÔNG dùng để kết luận ngưỡng màu. Cần rev 4")
    # Doi chieu frame bi cat. Kich thuoc DAY DU la 400x300 — do tren bo
    # 04/11/2026 (xem KVC-G6.1-20261104-002.md). Khong dung 640x480.
    if rep.get("max_py") is not None:
        got_lines = rep["max_py"] + 1
        full = rep["max_px"] >= 399 and rep["max_py"] >= 299
        add("Khung đầy đủ (max_px=399, max_py=299)", full,
            f"max_px={rep['max_px']}, max_py={rep['max_py']} "
            f"({got_lines}/300 dòng, {100.0 * got_lines / 300:.1f}%)"
            + ("" if full else " — FRAME BỊ CẮT"))

    # F-10: phan biet ba co che cat khung.
    if rep.get("href_per_vs") is not None and rep["pix_count"] > 0:
        pix_lines = rep["pix_count"] / 400.0
        href = rep["href_per_vs"]
        vsper = rep.get("vsync_per_rep")
        if vsper is not None and vsper >= 2:
            add("F-10: VSYNC giữa khung", False,
                f"vsync_per_rep={vsper} — CÓ xung VSYNC không mang pixel. "
                f"Cơ chế (B): gai VSYNC chia khung")
        elif href > 0 and pix_lines < href * 0.7:
            add("F-10: sensor phát đủ dòng, FPGA rớt pixel", False,
                f"href_per_vs={href} dòng nhưng chỉ {pix_lines:.0f} dòng có pixel "
                f"({100 * pix_lines / href:.0f}%). Cơ chế (C)")
        elif href > 0 and abs(href - pix_lines) <= max(3, href * 0.1):
            add("F-10: sensor tự cắt frame", False,
                f"href_per_vs={href} ≈ {pix_lines:.0f} dòng có pixel — sensor chỉ "
                f"phát {href} dòng, không phải FPGA làm rớt. Cơ chế (A)")
        else:
            add("F-10: chưa phân loại được", False,
                f"href_per_vs={href}, {pix_lines:.0f} dòng có pixel")

    if effective_rev(rep) == 1:
        add("[thông tin] Đây là rev 1 — ngưỡng chặt hơn blob", True,
            "cnt_match/red_count KHÔNG so sánh được với cnt của blob; "
            "không dùng để kết luận F-02. Cần bitstream rev 4")

    return verdicts


def rev_text(rev):
    if rev == 6:
        return "rev 6"
    if rev == 5:
        return "rev 5"
    if rev == 4:
        return "rev 4"
    if rev == 3:
        return "rev 3"
    if rev == 2:
        return "rev 2"
    if rev == 1:
        return "rev 1"
    return "rev ?"


def print_report(rep, idx, verbose):
    print(f"\n--- Báo cáo #{idx}  (ts={rep['ts']} ms, {rev_text(effective_rev(rep))}) ---")
    if not rep["order_ok"]:
        print("  [!] Thu tu slot SAI (W khong khop chi so) — du lieu khong dang tin")
    print(f"  pix_count   : {rep['pix_count']}")
    print(f"  sum R/G/B   : {rep['sum_r']} / {rep['sum_g']} / {rep['sum_b']}")
    print(f"  mean R5/G6/B5: {rep['mean_r5']:.2f} / {rep['mean_g6']:.2f} / {rep['mean_b5']:.2f}"
          f"   (thang 0..31 / 0..63 / 0..31)")
    print(f"  mean R8/G8/B8: {rep['mean_r8']:.0f} / {rep['mean_g8']:.0f} / {rep['mean_b8']:.0f}"
          f"   (thang 0..255, de so voi checklist)")
    print(f"  cnt_match   : {rep['cnt_match']} ({rep['match_pct']:.2f}% — "
          f"{'cùng bộ lọc với blob' if effective_rev(rep) >= 3 else 'ngưỡng cũ, KHÔNG so được với blob'})")
    print(f"  max_r5      : {rep['max_r5']}/31")

    if rep.get("max_py") is not None:
        print(f"  khung nhận  : max_px={rep['max_px']}, max_py={rep['max_py']} "
              f"({rep['max_py'] + 1}/300 dòng)")
    if rep.get("href_per_vs") is not None:
        pl = rep["pix_count"] / 400.0
        print(f"  F-10        : href_per_vs={rep['href_per_vs']}, "
              f"vsync_per_rep={rep.get('vsync_per_rep')}, "
              f"{pl:.0f} dòng có pixel")
    elif verbose and rep.get("center_pixel") is not None:
        cp = rep["center_pixel"]
        print(f"  center_pixel: 0x{cp:04X} "
              f"(R5={rep['center_r5']} G6={rep['center_g6']} B5={rep['center_b5']})")

    if effective_rev(rep) >= 2:
        if rep["hue_tone_trusted"]:
            print(f"  chẩn đoán   : R>G>B {rep['ord_ok_pct']:.1f}% · hue {rep['hue_ok_pct']:.1f}%"
                  f" · S>=0,80 {rep['sat_ok_pct']:.1f}% · sáng+chroma {rep['tone_ok_pct']:.1f}%")
        else:
            print(f"  chẩn đoán   : R>G>B {rep['ord_ok_pct']:.1f}% · S>=0,80 {rep['sat_ok_pct']:.1f}%"
                  f"   (hue/tone BỎ QUA: rev {effective_rev(rep)} tràn 8 bit)")



def main(argv=None):
    ap = argparse.ArgumentParser(
        description="Giai ma bao cao thong ke mau RGB565 (muc G6.1.9)")
    ap.add_argument("--file", required=True, help="File .bin do fpga_uart_capture.py --dump")
    ap.add_argument("--all", action="store_true", help="In tat ca bao cao, khong chi bao cao cuoi")
    ap.add_argument("--json", action="store_true", help="Xuat JSON thay vi text")
    args = ap.parse_args(argv)

    with open(args.file, "rb") as fh:
        buf = fh.read()

    frames, crc_err = parse_frames(buf)
    if not frames:
        print(f"[!] Khong tim thay khung IF-01 nao trong {args.file} ({len(buf)} byte)")
        print("    Kiem: bitstream DIAG_MODE=3 da nap? Baud 38400? Dung cong COM?")
        return 1

    # Bao cao pixel_stats co N = 6..12 (slot chua dung = 0 nen N co the la 12)
    reports = []
    for k, fr in enumerate(frames):
        rep = decode_report(fr)
        if rep is not None and rep["pix_count"] > 0:
            reports.append((k, rep))

    print(f"[*] File       : {args.file} ({len(buf)} byte)")
    print(f"[*] Khung IF-01: {len(frames)} hop le, {crc_err} loi CRC")
    print(f"[*] Bao cao co pixel: {len(reports)}")

    if not reports:
        print("\n[!] Khong co bao cao nao chua pixel.")
        print("    Kiem: camera co phat khung? vat truoc ong kinh? bitstream dung?")
        # Van in cau truc de nguoi doc biet minh dang o dau
        fr = frames[-1]
        print(f"\n  Khung cuoi: N={fr['count']}, ts={fr['ts']}")
        for i, b in enumerate(fr["boxes"][:6]):
            print(f"    slot {i}: x={b['x']} y={b['y']} w={b['w']} h={b['h']}")
        return 1

    selected = reports if args.all else [reports[-1]]
    file_rev = infer_file_rev(reports)
    for _, rep in reports:
        rep["file_rev"] = file_rev
    for idx, (frame_idx, rep) in enumerate(selected):
        print_report(rep, idx + 1, verbose=True)

    last = reports[-1][1]
    verdicts = evaluate(last)

    print("\n" + "=" * 66)
    print("  DANH GIA MUC 6.1.9")
    print("=" * 66)
    fails = 0
    for v in verdicts:
        mark = "PASS" if v["ok"] else "FAIL"
        print(f"  [{mark}] {v['name']}: {v['detail']}")
        if not v["ok"] and not v["name"].startswith("Thông tin"):
            fails += 1

    print()
    if last["order_ok"]:
        print("  Thu tu slot: OK")
    else:
        print("  [!] Thu tu slot SAI — khong ket luan duoc, kiem lai bitstream")

    print()
    if not last["rev_known"] and file_rev == 0:
        print("  [!] KHONG xac dinh duoc rev cua bitstream: slot 4..10 deu = 0.")
        print("      Khong the ket luan 6.1.9. Kiem lai bitstream da nap.")
    elif fails == 0:
        print("  KET LUAN: DAT — mau do dung nguong 6.1.9.")
        print("  Ghi so do vao BRINGUP_CHECKLIST muc 6.1.9.")
    else:
        print(f"  KET LUAN: CHUA DAT — {fails} tieu chi FAIL.")
        print("  Xem chi tiet o tren. Neu mean_R8 thap: kiem anh sang va AWB.")
        print("  Neu tone/sat thap: vat nen chua du do, hoac AWB dang keo mau.")

    print("=" * 66)
    print("  NHAC: nap lai `9E62B590` (release) truoc khi lam viec khac.")
    print("=" * 66)

    if args.json:
        out = [{"report": r, "verdicts": verdicts} for _, r in reports]
        print(json.dumps(out, indent=2, ensure_ascii=False))

    return 0 if fails == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
