#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fpga_uart_capture.py — Doc va kiem chung khung IF-01 tu FPGA.

HAI CHE DO:
  1. --port COM3      : doc truc tiep tu USB-UART (CP2102/CH340 3.3V tai R13)
  2. --file capture.hex: doc tu file HEX do Hercules/TeraTerm xuat ra

Muc dich: xac nhan FPGA phat dung khung theo IF-01 truoc khi noi MCU Sonix.
Kiem tra:
  - Sync 0x5A 0xA5
  - Version 0x01
  - Count N <= 12
  - Timestamp don vi ms, tang dan
  - CRC-16/CCITT-FALSE (Little-Endian)
  - Truong BBox: X/Y uint16 LE, W/H uint8, class uint8, confidence uint8
  - Thong ke: so frame, so byte, CRC loi, N trung binh, FPS do duoc

KHONG ket noi MCU. KHONG ghi vao bo. Chi doc.

Vi du:
  python scripts/manual/fpga_uart_capture.py --port COM5 --baud 38400 --seconds 10
  python scripts/manual/fpga_uart_capture.py --file hercules_capture.hex
  python scripts/manual/fpga_uart_capture.py --port COM5 --dump frames.bin
"""

import argparse
import binascii
import io
import os
import re
import sys
import time

if sys.platform == "win32" and hasattr(sys.stdout, "buffer"):
    try:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8",
                                      errors="replace", line_buffering=True)
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8",
                                      errors="replace", line_buffering=True)
    except Exception:
        pass

SYNC0 = 0x5A
SYNC1 = 0xA5
VERSION = 0x01
MAX_N = 12
HEADER_LEN = 8      # sync(2) + ver(1) + count(1) + timestamp(4)
BBOX_LEN = 8
CRC_LEN = 2


def crc16_ccitt_false(data: bytes) -> int:
    """Poly 0x1021, init 0xFFFF, khong reflect, xorout 0."""
    crc = 0xFFFF
    for b in data:
        crc ^= (b << 8)
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) & 0xFFFF if (crc & 0x8000) else ((crc << 1) & 0xFFFF)
    return crc


def parse_hex_file(path: str) -> bytes:
    """
    Doc file HEX do Hercules/TeraTerm xuat.
    Ho tro:
      - moi dong mot byte:  "5A"
      - nhieu byte cach nhau khoang trang: "5A A5 01 02"
      - chuoi lien: "5AA50102..."
    Bo qua dong khong phai hex (header, timestamp neu co).
    """
    out = bytearray()
    hex_line = re.compile(r"^\s*([0-9A-Fa-f]{2}[\s:,-]*)+$")
    for raw in io.open(path, encoding="utf-8", errors="ignore"):
        line = raw.strip()
        if not line:
            continue
        # Cat phan timestamp neu co dang [12:34:56.789]
        line = re.sub(r"^\[[^\]]*\]\s*", "", line)
        if not hex_line.match(line):
            continue
        for tok in re.findall(r"[0-9A-Fa-f]{2}", line):
            out.append(int(tok, 16))
    return bytes(out)


def iter_frames(buf: bytes):
    """
    Tach khung tu stream. Tra ve (frame_dict, offset, consumed).
    Neu sync sai hoac CRC sai, truot 1 byte va thu lai.
    """
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
        rx_crc = buf[i + total - 2] | (buf[i + total - 1] << 8)  # Little-Endian
        calc_crc = crc16_ccitt_false(body)

        if rx_crc != calc_crc:
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

        yield dict(ver=ver, count=cnt, ts=ts, boxes=boxes,
                   offset=i, length=total, crc=rx_crc), i, total
        i += total


def main():
    ap = argparse.ArgumentParser(
        description="Doc va kiem chung khung IF-01 tu FPGA")
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--port", help="COM port, vi du COM5")
    src.add_argument("--file", help="file HEX do Hercules xuat")
    ap.add_argument("--baud", type=int, default=38400)
    ap.add_argument("--seconds", type=float, default=10.0,
                    help="thoi gian doc khi dung --port (mac dinh 10 s)")
    ap.add_argument("--dump", help="ghi byte tho ra file (de phan tich sau)")
    ap.add_argument("--max-frames", type=int, default=0,
                    help="dung sau N frame (0 = khong gioi han)")
    ap.add_argument("--quiet", action="store_true",
                    help="chi in tong ket, khong in tung frame")
    args = ap.parse_args()

    if args.file:
        if not os.path.exists(args.file):
            print(f"[!] Khong tim thay file: {args.file}")
            return 1
        buf = parse_hex_file(args.file)
        print(f"[*] Doc {len(buf)} byte tu {args.file}")
    else:
        try:
            import serial
        except ImportError:
            print("[!] Thieu pyserial: pip install pyserial")
            return 1
        print(f"[*] Mo {args.port} @ {args.baud} 8N1, doc {args.seconds}s ...")
        ser = serial.Serial(args.port, args.baud, timeout=0.2)
        buf = bytearray()
        t0 = time.time()
        try:
            while time.time() - t0 < args.seconds:
                chunk = ser.read(4096)
                if chunk:
                    buf.extend(chunk)
        finally:
            ser.close()
        buf = bytes(buf)
        print(f"[*] Nhan {len(buf)} byte")

    if args.dump:
        io.open(args.dump, "wb").write(buf)
        print(f"[*] Da ghi byte tho -> {args.dump}")

    if not buf:
        print("[!] Khong co du lieu. Kiem tra:")
        print("    - USB-UART loai 3.3V (khong phai 5V)")
        print("    - RX noi vao R13 (J2 pin 11), GND chung")
        print("    - Baud 38400, 8N1")
        return 1

    # ── Phan tich ──
    frames = []
    consumed = 0
    for fr, off, length in iter_frames(buf):
        frames.append(fr)
        consumed = off + length
        if not args.quiet:
            bx = ", ".join(
                f"(x={b['x']},y={b['y']},w={b['w']},h={b['h']},c={b['cls']},p={b['conf']})"
                for b in fr["boxes"][:3])
            more = "" if fr["count"] <= 3 else f" ... +{fr['count']-3}"
            print(f"  #{len(frames):5d} off={off:8d} N={fr['count']:2d} "
                  f"ts={fr['ts']:10d} crc={fr['crc']:04X} {bx}{more}")
        if args.max_frames and len(frames) >= args.max_frames:
            break

    print()
    print("=" * 64)
    print("  KET QUA KIEM CHUNG")
    print("=" * 64)

    if not frames:
        print("  FAIL: khong tim thay khung hop le nao")
        print(f"  Byte dau: {' '.join(f'{b:02X}' for b in buf[:32])}")
        if len(buf) >= 2:
            print(f"  Sync dau tien: {buf[0]:02X} {buf[1]:02X} "
                  f"(ky vong 5A A5)")
        return 1

    n = len(frames)
    ts_first, ts_last = frames[0]["ts"], frames[-1]["ts"]
    dt_ms = ts_last - ts_first
    ts_ok = all(frames[i]["ts"] <= frames[i + 1]["ts"] for i in range(n - 1))

    counts = [f["count"] for f in frames]
    classes = {}
    for f in frames:
        for b in f["boxes"]:
            classes[b["cls"]] = classes.get(b["cls"], 0) + 1

    print(f"  Khung hop le     : {n}")
    print(f"  Byte da doc      : {len(buf)}")
    print(f"  Byte trong khung : {consumed} ({100.0*consumed/len(buf):.1f}%)")
    print(f"  Byte rac bo qua  : {len(buf) - consumed}")
    print()
    print(f"  N (box/frame)    : min={min(counts)} max={max(counts)} "
          f"tb={sum(counts)/n:.1f}")
    print(f"  Timestamp        : {ts_first} -> {ts_last} ms "
          f"({dt_ms} ms, {'TANG DAN OK' if ts_ok else 'KHONG TANG DAN'})")
    if dt_ms > 0:
        print(f"  FPS do duoc      : {1000.0*(n-1)/dt_ms:.1f} frame/s")
    print(f"  Class gap        : {classes if classes else '(khong co)'}")
    print()

    # ── Danh gia ──
    ok = True

    if not ts_ok:
        print("  FAIL: timestamp khong tang dan")
        ok = False

    if max(counts) > MAX_N:
        print(f"  FAIL: N={max(counts)} > {MAX_N}")
        ok = False

    # Timestamp phai la ms -> 200 Hz mock thi dt trung binh ~5 ms
    if n > 2 and dt_ms > 0:
        avg_dt = dt_ms / (n - 1)
        if avg_dt < 0.5:
            print(f"  CANH BAO: dt trung binh {avg_dt:.2f} ms qua nho — "
                  f"timestamp co the van la tick 100 MHz, khong phai ms")
            ok = False
        elif avg_dt > 2000:
            print(f"  CANH BAO: dt trung binh {avg_dt:.0f} ms qua lon — "
                  f"kiem tra mock rate hoac nghen UART")

    # So byte la (byte rac) nen nho
    junk = len(buf) - consumed
    if junk > len(buf) * 0.02:
        print(f"  CANH BAO: {junk} byte rac ({100.0*junk/len(buf):.1f}%) — "
              f"kiem tra GND chung / nhieu tren duong RX / baud")

    # Confidence phai trong 0..100 (khong phai INT8 am)
    bad_conf = [b for f in frames for b in f["boxes"] if b["conf"] > 100]
    if bad_conf:
        print(f"  CANH BAO: {len(bad_conf)} box co confidence > 100 "
              f"(vd {bad_conf[0]['conf']}) — kiem tra clamp 0..100")

    print()
    if ok:
        print("  KET QUA: PASS — khung IF-01 dung, CRC khop, timestamp ms")
        return 0
    print("  KET QUA: CO VAN DE — xem canh bao o tren")
    return 1


if __name__ == "__main__":
    sys.exit(main())
