#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""soak_mcu_log.py — Thu log COM9 trong N phút và kiểm tiêu chí Gate G2.7.

MỤC ĐÍCH: biến soak 30 phút từ "ngồi chép tay" thành một lần chạy, có file log
và bảng kiểm tự động. Không có script này thì bằng chứng G2.7 phụ thuộc vào việc
ai đó kịp chép log — đúng lý do tài liệu đang ghi `NOT RUN` dù người dùng xác
nhận đã soak.

ĐỌC GÌ:
  - `[RING] FPGA pend=... drop=... oe=... fe=... byt=... isr=...`
  - `[M3] t=... ... BB n<count> v<valid> crc<err> en<enable> ... tx=<ok>/<fail>`

KIỂM GÌ (theo BRINGUP_CHECKLIST.md 2.7.1):
  - Không có dòng `=== ... BOOT ===` lần thứ hai  -> không reset
  - `fe`, `oe`, `drop` không tăng                    -> không lỗi khung / tràn
  - `byt` tăng đều                                   -> đường truyền sống
  - `tx` tăng đều, `fail` không tăng                 -> LoRa vẫn phát
  - `[M3]` cách nhau ~1000 ms                        -> định thời 1 Hz

KHÔNG KIỂM ĐƯỢC (phải làm tay):
  - Nhiệt FPGA (2.7.2): cần nhiệt kế.
  - FPS giảm > 5 % (2.7.3): script in FPS đầu/cuối để người đọc tự soát, nhưng
    FPS phụ thuộc ánh sáng (F-01) nên bản thân nó KHÔNG phải tiêu chí ổn định.

VÍ DỤ:
  python scripts/manual/soak_mcu_log.py --port COM9 --minutes 30 `
      --out docs/verification/evidence/G2.7_soak_20261102-0100.txt

Chỉ dùng thư viện chuẩn + pyserial.
"""

import argparse
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

# Khớp dòng RING. Dùng "GNSS"/"USND" cũng khớp mẫu này — chỉ lấy dòng "FPGA".
RING_RE = re.compile(
    r"\[RING\]\s*(?P<dev>\w+)\s+pend=(?P<pend>\d+)\s+drop=(?P<drop>\d+)\s+"
    r"oe=(?P<oe>\d+)\s+fe=(?P<fe>\d+)\s+byt=(?P<byt>\d+)\s+isr=(?P<isr>\d+)"
)

# Khớp dòng M3. Chỉ cần các trường kiểm được.
M3_TIME_RE = re.compile(r"\[M3\]\s+t=(?P<t>\d+)")
M3_BB_RE = re.compile(r"\bBB\s+n(?P<n>\d+)\s+v(?P<v>\d+)\s+crc(?P<crc>\d+)\s+en(?P<en>\d+)")
M3_TX_RE = re.compile(r"\btx=(?P<ok>\d+)/(?P<fail>\d+)")
M3_OVR_RE = re.compile(r"\bovr(?P<ovr>\d+)\s+late_max=(?P<late>\d+)")

BOOT_MARK = "BOOT ==="

# KVC-MCU-TB-001: dòng công bố nguồn thời gian. Phải đọc TRƯỚC khi tin bất kỳ
# số nào về chu kỳ / timestamp, vì chế độ phần mềm chậm ~18 %.
TIMEBASE_HW_MARK = "Timebase SYSTICK"
TIMEBASE_SW_MARK = "Timebase SW fallback"


def parse_ring(line):
    m = RING_RE.search(line)
    if not m or m.group("dev") != "FPGA":
        return None
    return {k: int(m.group(k)) for k in ("pend", "drop", "oe", "fe", "byt", "isr")}


def parse_m3(line):
    mt = M3_TIME_RE.search(line)
    if not mt:
        return None
    out = {"t": int(mt.group("t"))}
    mb = M3_BB_RE.search(line)
    if mb:
        out.update({k: int(mb.group(k)) for k in ("n", "v", "crc", "en")})
    mx = M3_TX_RE.search(line)
    if mx:
        out["tx_ok"] = int(mx.group("ok"))
        out["tx_fail"] = int(mx.group("fail"))
    mo = M3_OVR_RE.search(line)
    if mo:
        out["ovr"] = int(mo.group("ovr"))
        out["late_max"] = int(mo.group("late"))
    return out


class Soak:
    def __init__(self):
        self.rings = []          # (wall_s, dict)
        self.m3 = []             # (wall_s, dict)
        self.boots = []          # wall_s của mỗi dòng BOOT
        self.raw_lines = 0
        self.n_with_target = 0   # số dòng M3 có n >= 1
        self.timebase_hw = None  # True = SysTick, False = SW fallback, None = chưa thấy

    def feed(self, line, wall_s):
        self.raw_lines += 1
        if BOOT_MARK in line:
            self.boots.append(wall_s)
        if TIMEBASE_HW_MARK in line:
            self.timebase_hw = True
        elif TIMEBASE_SW_MARK in line:
            self.timebase_hw = False
        ring = parse_ring(line)
        if ring is not None:
            self.rings.append((wall_s, ring))
            return "RING"
        m3 = parse_m3(line)
        if m3 is not None:
            self.m3.append((wall_s, m3))
            if m3.get("n", 0) >= 1:
                self.n_with_target += 1
            return "M3"
        return None

    # ---- đánh giá ----
    def evaluate(self):
        res = {"verdicts": [], "notes": []}

        def add(name, ok, detail, blocking=True):
            res["verdicts"].append(
                {"name": name, "ok": ok, "detail": detail, "blocking": blocking})

        add("Không reset trong phiên",
            len(self.boots) <= 1,
            f"{len(self.boots)} lần BOOT" + (
                f" (lần đầu + {len(self.boots) - 1} lần reset)" if len(self.boots) > 1 else ""))

        if len(self.rings) < 2:
            add("Có đủ mẫu [RING]", False,
                f"chỉ {len(self.rings)} mẫu — cần ≥ 2 để so sánh")
            return res

        first, last = self.rings[0][1], self.rings[-1][1]
        t_first, t_last = self.rings[0][0], self.rings[-1][0]
        span = t_last - t_first

        for key, label in (("fe", "fe (framing error)"),
                           ("oe", "oe (FIFO overrun)"),
                           ("drop", "drop (ring tràn)")):
            delta = last[key] - first[key]
            add(f"{label} không tăng", delta == 0,
                f"{first[key]} → {last[key]} (Δ={delta})")

        dbyt = last["byt"] - first["byt"]
        add("byt tăng", dbyt > 0,
            f"{first['byt']} → {last['byt']} (Δ={dbyt} byte / {span:.0f} s)")
        add("isr == byt", last["isr"] == last["byt"],
            f"isr={last['isr']} byt={last['byt']} (Δ={last['isr'] - last['byt']})")

        if span > 0:
            res["notes"].append(f"Tốc độ byte trung bình: {dbyt / span:.1f} B/s")
            res["notes"].append(
                f"Ước tính khung/s (10 B/khung rỗng): {dbyt / span / 10:.1f}")
            res["notes"].append(
                f"Tải UART: {dbyt / span * 10 / 38400 * 100:.2f} % của 38400 bps")

        if self.m3:
            f, l = self.m3[0][1], self.m3[-1][1]
            if "tx_ok" in f and "tx_ok" in l:
                add("tx không lỗi", l.get("tx_fail", 0) == 0,
                    f"fail={l.get('tx_fail')}, tx {f['tx_ok']} → {l['tx_ok']}")
            if "crc" in l:
                add("crc_err = 0", l["crc"] == 0, f"crc={l['crc']}")
            if "ovr" in l:
                add("Không overrun vòng main", l["ovr"] == 0,
                    f"ovr={l['ovr']}, late_max={l['late_max']} ms")

            # ---- ĐỊNH THỜI THẬT (KVC-MCU-TB-001) ----
            #
            # Phép kiểm quan trọng nhất và là lý do script này tồn tại: so
            # `[M3] t=` (đồng hồ MCU) với wall-clock bên PC.
            #
            # KHÔNG dùng khoảng cách giữa hai dòng `[M3]` liên tiếp làm tiêu chí
            # chính: bản trước làm vậy và báo PASS trong khi đồng hồ sai 18 %,
            # vì cả hai mốc đều lấy từ cùng một đồng hồ lỗi (lập luận vòng tròn).
            timebase_ok = self.timebase_hw is not False
            if self.timebase_hw is True:
                add("Nguồn thời gian", True, "SYSTICK 1ms (phần cứng)")
            elif self.timebase_hw is False:
                add("Nguồn thời gian", False,
                    "SW fallback — đồng hồ chậm ~18 %, không nghiệm thu", blocking=True)
            else:
                res["notes"].append(
                    "Không thấy dòng '[INIT] Timebase' — firmware có thể là bản cũ "
                    "trước KVC-MCU-TB-001; kết quả định thời dưới đây đáng ngờ")

            if len(self.m3) >= 2:
                wall_span = self.m3[-1][0] - self.m3[0][0]
                mcu_span = (self.m3[-1][1].get("t", 0) - self.m3[0][1].get("t", 0)) / 1000.0
                if wall_span > 5.0 and mcu_span > 0:
                    ratio = mcu_span / wall_span
                    ok = 0.98 <= ratio <= 1.02
                    drift_10min = (wall_span - mcu_span) / wall_span * 600.0
                    add("Tỉ lệ MCU/wall trong 0,98–1,02", ok and timebase_ok,
                        f"wall={wall_span:.1f}s mcu={mcu_span:.1f}s "
                        f"ratio={ratio:.4f} drift={drift_10min:.1f}s/10phut")
                    res["notes"].append(
                        f"Drift quy về 10 phút: {drift_10min:.0f} s "
                        f"(ngưỡng plan B4: 50 ms)")
                else:
                    res["notes"].append(
                        f"Không đủ dài để đánh giá tỉ lệ (wall={wall_span:.1f}s)")

            # Định thời 1 Hz — đo bằng WALL-CLOCK, không bằng `[M3] t=`.
            #
            # Bản trước so `t` với `t` và báo PASS trong khi đồng hồ sai 18 %:
            # cả hai mốc đến từ cùng một đồng hồ lỗi. Đó là lập luận vòng tròn.
            # Nay lấy wall-clock (do script ghi) chia cho số chu kỳ MCU báo —
            # hai đồng hồ độc lập.
            walls = [w for w, _ in self.m3]
            if len(walls) >= 3 and walls[-1] > walls[0]:
                n_intervals = len(walls) - 1
                avg_period = (walls[-1] - walls[0]) / n_intervals
                # Chỉ có ý nghĩa khi MCU thực sự in 1 dòng / 1 chu kỳ.
                add("Chu kỳ in [M3] thực (wall) ~1,00 s",
                    0.95 <= avg_period <= 1.05,
                    f"trung bình {avg_period:.3f} s trên {n_intervals} khoảng "
                    f"(đo bằng wall-clock, không phải đồng hồ MCU)")

            total = len(self.m3)
            res["notes"].append(
                f"[M3] có mục tiêu: {self.n_with_target}/{total} dòng "
                f"({100.0 * self.n_with_target / total:.0f}%)")
        else:
            add("Có mẫu [M3]", False, "không thấy dòng [M3] nào")

        return res


def main():
    ap = argparse.ArgumentParser(description="Soak log MCU cho Gate G2.7")
    ap.add_argument("--port", required=True, help="COM port của UART5 debug, vd COM9")
    ap.add_argument("--baud", type=int, default=9600,
                    help="9600 = 9615 bps thực tế (mặc định)")
    ap.add_argument("--minutes", type=float, default=30.0,
                    help="thời lượng soak (mặc định 30 phút theo 2.7.1)")
    ap.add_argument("--out", help="ghi toàn bộ log thô ra file này")
    ap.add_argument("--quiet", action="store_true", help="không in từng dòng")
    args = ap.parse_args()

    try:
        import serial
    except ImportError:
        print("[!] Thiếu pyserial: .venv/Scripts/python.exe -m pip install pyserial")
        return 1

    duration = args.minutes * 60.0
    soak = Soak()
    out_handle = None
    if args.out:
        parent = os.path.dirname(os.path.abspath(args.out))
        if parent and not os.path.isdir(parent):
            os.makedirs(parent, exist_ok=True)
        out_handle = open(args.out, "w", encoding="utf-8")
        out_handle.write(
            f"# Soak {args.port} @ {args.baud} trong {args.minutes:.1f} phút\n"
            f"# Bắt đầu: {time.strftime('%Y-%m-%d %H:%M:%S')}\n"
            f"# Lệnh: soak_mcu_log.py --port {args.port} --minutes {args.minutes}\n"
            f"# {'=' * 68}\n")

    print(f"[*] Mở {args.port} @ {args.baud} 8N1, soak {args.minutes:.1f} phút")
    print("[*] Ctrl+C để dừng sớm và vẫn nhận báo cáo.")
    try:
        ser = serial.Serial(args.port, args.baud, timeout=0.2)
    except serial.SerialException as exc:
        print(f"[!] Không mở được {args.port}: {exc}")
        print("    Kiểm: cáp USB-UART đã cắm? Đúng cổng? Không bị Hercules giữ?")
        print("    Liệt kê cổng: python -c \""
              "import serial.tools.list_ports as p;"
              "print([x.device for x in p.comports()])\"")
        if out_handle:
            out_handle.close()
        return 1

    t0 = time.time()
    deadline = t0 + duration
    partial = b""
    last_report = t0

    try:
        while time.time() < deadline:
            chunk = ser.read(ser.in_waiting or 1)
            if not chunk:
                continue
            partial += chunk
            while b"\n" in partial:
                raw, _, partial = partial.partition(b"\n")
                line = raw.decode("utf-8", errors="replace").rstrip("\r")
                if not line.strip():
                    continue
                wall = time.time() - t0
                kind = soak.feed(line, wall)
                if out_handle:
                    out_handle.write(f"[{wall:8.2f}] {line}\n")
                if not args.quiet and kind:
                    print(f"[{wall:7.1f}s] {line}")

            now = time.time()
            if now - last_report >= 60.0:
                last_report = now
                remain = (deadline - now) / 60.0
                print(f"[*] còn {remain:.1f} phút | RING={len(soak.rings)} "
                      f"M3={len(soak.m3)} BOOT={len(soak.boots)}")
    except KeyboardInterrupt:
        print("\n[!] Dừng sớm theo yêu cầu — vẫn đánh giá phần đã thu.")
    finally:
        ser.close()
        if out_handle:
            out_handle.write(f"# {'=' * 68}\n# Kết thúc: "
                             f"{time.strftime('%Y-%m-%d %H:%M:%S')}\n")
            out_handle.close()

    elapsed = time.time() - t0
    print("\n" + "=" * 68)
    print(f"  TỔNG KẾT SOAK — {elapsed / 60.0:.1f} phút")
    print("=" * 68)
    print(f"  Dòng thô       : {soak.raw_lines}")
    print(f"  Mẫu [RING]     : {len(soak.rings)}")
    print(f"  Mẫu [M3]       : {len(soak.m3)}")
    print(f"  Lần BOOT       : {len(soak.boots)}")

    res = soak.evaluate()
    print()
    print("  TIÊU CHÍ (2.7.1):")
    blocking_fail = []
    for v in res["verdicts"]:
        mark = "PASS" if v["ok"] else "FAIL"
        print(f"    [{mark}] {v['name']}: {v['detail']}")
        if not v["ok"] and v["blocking"]:
            blocking_fail.append(v["name"])

    if res["notes"]:
        print()
        print("  GHI CHÚ:")
        for n in res["notes"]:
            print(f"    - {n}")

    print()
    if blocking_fail:
        print(f"  KẾT LUẬN: Chưa đạt — {len(blocking_fail)} tiêu chí FAIL.")
        print("  Không đánh PASS. Ghi nguyên nhân và chạy lại sau khi sửa.")
    elif elapsed < duration * 0.95:
        print(f"  KẾT LUẬN: Thu được {elapsed / 60.0:.1f}/{args.minutes:.0f} phút.")
        print("  Tiêu chí đạt trên cửa sổ này, nhưng CHƯA đủ thời lượng 2.7.1.")
        print("  Ghi 'một phần', không đóng gate G2.7.")
    else:
        print("  KẾT LUẬN: Đạt tiêu chí 2.7.1 trên toàn cửa sổ.")
        print("  Còn 2.7.2 (nhiệt FPGA) và 2.7.3 (FPS cuối) — làm tay.")

    print()
    print("  KHÔNG kiểm được tự động: nhiệt FPGA (2.7.2), FPS (2.7.3).")
    print("  FPS phụ thuộc ánh sáng (F-01) nên không dùng làm tiêu chí ổn định.")
    print("=" * 68)

    return 0 if not blocking_fail else 2


if __name__ == "__main__":
    sys.exit(main())
