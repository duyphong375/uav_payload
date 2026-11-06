"""
Giai ma bao cao TU DO VSYNC tu capture UART cua bitstream DIAG_MODE=2.

BOI CANH
    Ban thi nghiem khong co scope/LA. Bitstream chan doan do nhip VSYNC bang
    clock noi va day ket qua ra UART qua 12 bbox IF-01
    (xem KVC_PR/src/processing/vsync_report.v). Tool nay doc file `.bin` do
    `fpga_uart_capture.py --dump` sinh ra va in bang doc duoc.

SU DUNG
    python scripts/manual/decode_vsync_diag.py --file <capture.bin>
    python scripts/manual/decode_vsync_diag.py --file <capture.bin> --all

ANH XA 12 SLOT (rev 2, 2026-11-02)

    slot  X                  Y                  Y nghia
    ----  -----------------  -----------------  --------------------------------
      0   w_vsync            w_periods          canh nhan / chu ky do duoc
      1   w_sum_100us        w_min_ms           tong (100 us) / ngan nhat (ms)
      2   w_max_ms           w_b1x              dai nhat (ms) / bucket 1x (55-80)
      3   w_b2x              w_b3x              bucket 2x (120-145) / 3x (180-215)
      4   w_b5x              w_b6x              bucket 5x (310-340) / 6x (380-410)
      5   w_bshort           w_bother           bucket <55 ms / con lai
      6   w_rejected         t_vsync            gai bi chan (cua so) / TICH LUY
      7   t_frame            t_max_ms           TICH LUY frame / chu ky dai nhat
      8   t_rejected         t_b1x              TICH LUY gai bi chan / bucket 1x
      9   t_b2x              t_b3x              TICH LUY bucket 2x / 3x
     10   t_b5x              t_b6x              TICH LUY bucket 5x / 6x
     11   t_bshort           t_bother           TICH LUY bucket short / other

    W cua moi slot = chi so slot (0..11) — dung de xac nhan thu tu.

TUONG THICH NGUOC (bitstream cu)
    `C82B9EFE` / `840117FA` phat N=10 voi ban do khac va `t_bother` bi cat 8 bit.
    Ham decode_report() tu nhan dien bang so slot: N=10 -> ban do cu, N=12 -> moi.
    Voi N=10, `t_bother` duoc phuc hoi bang `t_periods - (t_b1x+t_b3x+t_b5x+t_b6x)`.

MA CLASS VA CONF
    class luon 2, conf luon 100. Chung KHONG mang du lieu; chi de khung hop le
    IF-01. Dung doc chung nhu ket qua nhan dang.
"""

import argparse
import sys


SYNC0, SYNC1 = 0x5A, 0xA5
VERSION = 1
MAX_N = 12
HEADER_LEN = 8
BBOX_LEN = 8
CRC_LEN = 2


def crc16_ccitt_false(data):
    crc = 0xFFFF
    for b in data:
        crc ^= b << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) & 0xFFFF if crc & 0x8000 else (crc << 1) & 0xFFFF
    return crc


def iter_frames(buf):
    i = 0
    n = len(buf)
    while i + HEADER_LEN + CRC_LEN <= n:
        if buf[i] != SYNC0 or buf[i + 1] != SYNC1:
            i += 1
            continue

        ver = buf[i + 2]
        cnt = buf[i + 3]
        if ver != VERSION or cnt > MAX_N:
            i += 1
            continue

        total = HEADER_LEN + cnt * BBOX_LEN + CRC_LEN
        if i + total > n:
            break

        body = buf[i:i + HEADER_LEN + cnt * BBOX_LEN]
        rx_crc = buf[i + total - 2] | (buf[i + total - 1] << 8)
        if crc16_ccitt_false(body) != rx_crc:
            i += 1
            continue

        ts = int.from_bytes(buf[i + 4:i + 8], "little")

        boxes = []
        base = i + HEADER_LEN
        for k in range(cnt):
            p = base + k * BBOX_LEN
            boxes.append(dict(
                x=int.from_bytes(buf[p:p + 2], "little"),
                y=int.from_bytes(buf[p + 2:p + 4], "little"),
                w=buf[p + 4],
                h=buf[p + 5],
                cls=buf[p + 6],
                conf=buf[p + 7],
            ))

        yield dict(ts=ts, count=cnt, boxes=boxes), i, total
        i += total


def _slots_ok(boxes, count):
    if len(boxes) != count:
        return False
    return all(boxes[i]["w"] == i for i in range(count))


def decode_report_v2(boxes):
    """Ban do 12 slot (rev 2). Tra None neu thu tu sai."""
    if len(boxes) != 12 or not _slots_ok(boxes, 12):
        return None

    rep = dict(
        layout=12,
        # cua so
        w_vsync=boxes[0]["x"],   w_periods=boxes[0]["y"],
        w_sum_100us=boxes[1]["x"], w_min_ms=boxes[1]["y"],
        w_max_ms=boxes[2]["x"],  w_b1x=boxes[2]["y"],
        w_b2x=boxes[3]["x"],     w_b3x=boxes[3]["y"],
        w_b5x=boxes[4]["x"],     w_b6x=boxes[4]["y"],
        w_bshort=boxes[5]["x"],  w_bother=boxes[5]["y"],
        w_rejected=boxes[6]["x"],
        # tich luy
        t_vsync=boxes[6]["y"],   t_frame=boxes[7]["x"],
        t_max_ms=boxes[7]["y"],  t_rejected=boxes[8]["x"],
        t_b1x=boxes[8]["y"],     t_b2x=boxes[9]["x"],
        t_b3x=boxes[9]["y"],     t_b5x=boxes[10]["x"],
        t_b6x=boxes[10]["y"],    t_bshort=boxes[11]["x"],
        t_bother=boxes[11]["y"],
    )
    return rep


def decode_report_v1(boxes):
    """Ban do 10 slot (C82B9EFE / 840117FA). `t_bother` phuc hoi tu t_periods."""
    if len(boxes) != 10 or not _slots_ok(boxes, 10):
        return None

    t_b1 = boxes[8]["x"]
    t_b3 = boxes[8]["y"]
    t_b5 = boxes[9]["x"]
    t_b6 = boxes[9]["y"]
    t_periods = boxes[7]["x"]
    t_bother_u8 = boxes[9]["h"]
    t_bother = t_periods - (t_b1 + t_b3 + t_b5 + t_b6)

    return dict(
        layout=10,
        w_vsync=boxes[0]["x"],   w_periods=boxes[1]["x"],
        w_sum_100us=boxes[1]["y"], w_min_ms=boxes[2]["x"],
        w_max_ms=boxes[2]["y"],  w_b1x=boxes[3]["x"],
        w_b2x=0,                 w_b3x=boxes[3]["y"],
        w_b5x=boxes[4]["x"],     w_b6x=boxes[4]["y"],
        w_bshort=0,              w_bother=boxes[5]["x"],
        w_rejected=0,
        t_vsync=boxes[6]["x"],   t_frame=boxes[6]["y"],
        t_max_ms=boxes[7]["y"],  t_rejected=0,
        t_b1x=t_b1,              t_b2x=0,
        t_b3x=t_b3,              t_b5x=t_b5,
        t_b6x=t_b6,              t_bshort=0,
        t_bother=t_bother,
        t_bother_u8=t_bother_u8,
        t_bother_truncated=(t_bother % 256 == t_bother_u8 and t_bother > 255),
    )


def decode_report(boxes):
    rep = decode_report_v2(boxes)
    if rep is not None:
        return rep
    return decode_report_v1(boxes)


def _pct(v, tot):
    return f"{100.0*v/tot:5.1f}%" if tot else "  n/a "


def verdict(rep, first_ts=None, last_ts=None):
    """Ket luan cho ba cau hoi cua KVC-CAM-DIAG-20261102."""
    lines = []
    layout = rep.get("layout", 0)

    buckets = [
        ("short (<55)", rep["t_bshort"]),
        ("1x (55-80)", rep["t_b1x"]),
        ("2x (120-145)", rep["t_b2x"]),
        ("3x (180-215)", rep["t_b3x"]),
        ("5x (310-340)", rep["t_b5x"]),
        ("6x (380-410)", rep["t_b6x"]),
        ("other", rep["t_bother"]),
    ]
    tot = sum(v for _, v in buckets)

    # --- Cau hoi 1: nhip VSYNC ---
    if tot == 0:
        lines.append("Q1: chua du du lieu (khong co chu ky nao)")
    else:
        lines.append(f"Q1: phan bo {tot} chu ky (tich luy):")
        for name, v in buckets:
            if v:
                lines.append(f"      {name:<13} {v:6d}  {_pct(v, tot)}")
        dom = max(buckets, key=lambda kv: kv[1])
        share = 100.0 * dom[1] / tot
        if share >= 80.0:
            lines.append(f"    => nhip CHU DAO la {dom[0]} ({share:.0f}%)")
        elif share >= 40.0:
            lines.append(f"    => KHONG co nhip chu dao ro rang; "
                         f"cao nhat {dom[0]} chi {share:.0f}%")
        else:
            lines.append(f"    => phan bo RAI, khong co mode ro rang "
                         f"({dom[0]} chi {share:.0f}%)")
        if rep["t_bother"] * 100.0 / tot > 40.0:
            lines.append("    CANH BAO: `other` > 40% -> mo hinh bucket CHUA phu")
            lines.append("    du du lieu; khong nen ket luan ve co che AEC.")

    # --- Cau hoi 2: chenh VSYNC/frame ---
    lines.append("")
    span_s = (last_ts / 1000.0) if last_ts else None
    if rep["t_vsync"] == 0:
        lines.append("Q2: chua co xung VSYNC nao")
    else:
        if span_s:
            lines.append("Q2: t_vsync / t_frame dem tu RESET (ts = 0):")
            lines.append(f"      VSYNC = {rep['t_vsync']} / {span_s:.0f} s "
                         f"= {rep['t_vsync']/span_s:.2f} Hz")
            lines.append(f"      frame = {rep['t_frame']} / {span_s:.0f} s "
                         f"= {rep['t_frame']/span_s:.2f} Hz")
        rot = rep["t_vsync"] - rep["t_frame"]
        lines.append(f"      chenh = {rot} "
                     f"({_pct(rep['t_frame'], rep['t_vsync'])} phat ra)")
        if rep["t_rejected"] > 0:
            rej = 100.0 * rep["t_rejected"] / max(1, rep["t_vsync"] + rep["t_rejected"])
            lines.append(f"      LUU Y: bo loc chan {rep['t_rejected']} gai "
                         f"({rej:.1f}% so canh) — t_vsync la canh CHAP NHAN,")
            lines.append("      nen hieu tren khong phai so frame bi rot that.")

    # --- Cau hoi 3: nhieu tren duong VSYNC ---
    lines.append("")
    if layout == 12:
        rej = rep["t_rejected"]
        sh = rep["t_bshort"]
        if rej == 0 and sh == 0:
            lines.append("Q3: duong VSYNC SACH — khong gai bi chan, "
                         "khong chu ky ngan")
        else:
            lines.append(f"Q3: co NHIEU tren duong VSYNC:")
            lines.append(f"      gai bi loc chan : {rej}")
            lines.append(f"      chu ky < 55 ms  : {sh}  (gai lot qua bo loc)")
            lines.append("    => moi ket luan ve nhip camera phai kem dieu kien nay.")
    else:
        lines.append("Q3: bitstream cu (N=10) khong co bo loc / bucket short")

    # --- Trung binh ---
    if rep["w_periods"]:
        avg = rep["w_sum_100us"] / rep["w_periods"] / 10.0
        lines.append("")
        lines.append(f"    chu ky TB cua so = {avg:.2f} ms ({1000.0/avg:.2f} Hz)")
        if avg < 10.0:
            lines.append("    CANH BAO: TB < 10 ms la BAT KHA voi 1 frame VGA —")
            lines.append("    con glitch lot qua bo loc. Xem bucket `short`.")

    return lines


def print_report(rep, ts, idx, total_reports):
    print(f"=== Bao cao {idx}/{total_reports}, ts={ts} ms "
          f"(layout N={rep.get('layout')}) ===")
    print()
    print("  --- Cua so ---")
    print(f"  canh nhan      : {rep['w_vsync']}")
    print(f"  chu ky do duoc : {rep['w_periods']}")
    print(f"  tong (100 us)  : {rep['w_sum_100us']}")
    print(f"  min / max (ms) : {rep['w_min_ms']} / {rep['w_max_ms']}")
    if rep.get("layout") == 12:
        print(f"  bucket 1x/2x   : {rep['w_b1x']} / {rep['w_b2x']}")
        print(f"  bucket 3x      : {rep['w_b3x']}")
        print(f"  bucket 5x/6x   : {rep['w_b5x']} / {rep['w_b6x']}")
        print(f"  bucket short   : {rep['w_bshort']}")
        print(f"  bucket other   : {rep['w_bother']}")
        print(f"  gai bi chan    : {rep['w_rejected']}")
    else:
        print(f"  bucket 1x/3x   : {rep['w_b1x']} / {rep['w_b3x']}")
        print(f"  bucket 5x/6x   : {rep['w_b5x']} / {rep['w_b6x']}")
        print(f"  bucket other   : {rep['w_bother']}")
    print()
    print("  --- Tich luy tu reset ---")
    print(f"  VSYNC          : {rep['t_vsync']}")
    print(f"  frame phat ra  : {rep['t_frame']}")
    print(f"  max (ms)       : {rep['t_max_ms']}")
    if rep.get("layout") == 12:
        print(f"  gai bi chan    : {rep['t_rejected']}")
        print(f"  bucket 1x/2x   : {rep['t_b1x']} / {rep['t_b2x']}")
        print(f"  bucket 3x      : {rep['t_b3x']}")
        print(f"  bucket 5x/6x   : {rep['t_b5x']} / {rep['t_b6x']}")
        print(f"  bucket short   : {rep['t_bshort']}")
        print(f"  bucket other   : {rep['t_bother']}")
    else:
        print(f"  bucket 1x/3x   : {rep['t_b1x']} / {rep['t_b3x']}")
        print(f"  bucket 5x/6x   : {rep['t_b5x']} / {rep['t_b6x']}")
        print(f"  bucket other   : {rep['t_bother']}"
              + (f"  (H chi ghi {rep['t_bother_u8']} — bi cat 8 bit)"
                 if rep.get("t_bother_truncated") else ""))
    tot = (rep["t_b1x"] + rep["t_b2x"] + rep["t_b3x"] + rep["t_b5x"]
           + rep["t_b6x"] + rep["t_bshort"] + rep["t_bother"])
    if tot and rep.get("layout") == 12:
        expect = rep["t_vsync"] - 1
        if tot != expect:
            print(f"  CANH BAO: tong bucket {tot} != t_vsync-1 {expect}")
    print()


def main():
    ap = argparse.ArgumentParser(
        description="Giai ma bao cao tu do VSYNC (DIAG_MODE=2)")
    ap.add_argument("--file", required=True,
                    help="file .bin do fpga_uart_capture.py --dump sinh ra")
    ap.add_argument("--all", action="store_true",
                    help="in moi bao cao, khong chi bao cao cuoi")
    args = ap.parse_args()

    with open(args.file, "rb") as f:
        buf = f.read()

    frames = list(iter_frames(buf))
    if not frames:
        print(f"[!] Khong co khung IF-01 hop le trong {args.file}")
        return 1

    print(f"[*] {args.file}: {len(buf)} byte, {len(frames)} khung")
    print()

    reports = []
    for fr, off, length in frames:
        rep = decode_report(fr["boxes"])
        if rep is None:
            continue
        reports.append((fr["ts"], rep))

    if not reports:
        print("[!] Khong co khung nao o dinh dang bao cao chan doan.")
        print("    Kiem tra: bitstream co dung DIAG_MODE=2 khong?")
        print(f"    N cua khung dau = {frames[0][0]['count']} (ky vong 10 hoac 12)")
        return 1

    layouts = sorted(set(r["layout"] for _, r in reports))
    if len(layouts) > 1:
        print(f"[!] Tron lan layout {layouts} trong mot file — kiem tra lai")

    show = reports if args.all else reports[-1:]
    for k, (ts, rep) in enumerate(show):
        idx = reports.index((ts, rep)) + 1
        label = "CUOI " if (not args.all and len(reports) > 1) else ""
        print_report(rep, ts, idx, len(reports))
        print("  --- Ket luan ---")
        for line in verdict(rep, reports[0][0], reports[-1][0]):
            print(f"  {line}")
        print()

    if len(reports) > 1:
        print("  --- Toan bo phien ---")
        print(f"  so bao cao     : {len(reports)}")
        print(f"  layout         : {layouts}")
        print(f"  ts dau -> cuoi : {reports[0][0]} -> {reports[-1][0]} ms "
              f"({(reports[-1][0]-reports[0][0])/1000.0:.1f} s)")
        span = reports[-1][0] / 1000.0
        last = reports[-1][1]
        if span > 0 and last["t_vsync"]:
            print(f"  t_* dem tu reset (ts=0), nen toc do:")
            print(f"    VSYNC = {last['t_vsync']} / {span:.0f} s = "
                  f"{last['t_vsync']/span:.2f} Hz")
            print(f"    frame = {last['t_frame']} / {span:.0f} s = "
                  f"{last['t_frame']/span:.2f} Hz")
            print(f"    ty le = {_pct(last['t_frame'], last['t_vsync'])}")
            print(f"    KHONG chia cho "
                  f"{(reports[-1][0]-reports[0][0])/1000.0:.0f} s — se ra sai")
        print()

    return 0


if __name__ == "__main__":
    sys.exit(main())
