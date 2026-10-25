#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
mock_fpga_bbox.py
Công cụ giả lập luồng BBox từ FPGA OneKiwi phát qua cổng nối tiếp (USB-to-TTL CH340).

Tuân thủ chặt chẽ đặc tả giao diện IF-01:
- docs/interfaces/IF_FPGA_MCU_UART.md
- Đầu khung: 0x5A 0xA5
- Phiên bản: 0x01
- Mã kiểm tra: CRC-16/CCITT-FALSE (Little-Endian)
- Tốc độ mặc định: 115200 bps, 8N1 (hoặc 38400 bps)

Tác giả: Phân hệ MCU/Tích hợp KVC (Nguyễn Tá Duy Phong)
"""

import sys
import time
import struct
import argparse
import io

# Đảm bảo in tiếng Việt chuẩn và flush ngay lập tức trên Windows Console
if sys.platform == "win32" and hasattr(sys.stdout, "buffer"):
    try:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace", line_buffering=True)
    except Exception:
        pass

try:
    import serial
    import serial.tools.list_ports
except ImportError:
    print("[!] Thieu thu vien pyserial. Vui long cai dat bang lenh: pip install pyserial")
    sys.exit(1)


def calc_crc16_ccitt(data: bytes) -> int:
    """
    Tính mã CRC-16/CCITT-FALSE chuẩn theo quy cách của MCU Sonix và dự án KVC:
    Polynomial: 0x1021, Init: 0xFFFF, RefIn: False, RefOut: False, XorOut: 0x0000
    """
    crc = 0xFFFF
    for byte in data:
        crc ^= (byte << 8)
        for _ in range(8):
            if crc & 0x8000:
                crc = ((crc << 1) ^ 0x1021) & 0xFFFF
            else:
                crc = (crc << 1) & 0xFFFF
    return crc


def build_bbox_item(x_center: int, y_center: int, width: int, height: int, class_id: int, confidence: int) -> bytes:
    """
    Đóng gói 1 BBox 8 byte theo chuẩn IF-01 (Little-Endian):
    Byte 0-1: uint16 X_center (pixel)
    Byte 2-3: uint16 Y_center (pixel)
    Byte 4:   uint8  Width (pixel)
    Byte 5:   uint8  Height (pixel)
    Byte 6:   uint8  Class_ID (1: person, 2: lifebuoy)
    Byte 7:   uint8  Confidence (0..100 %)
    """
    return struct.pack("<HHBBBB", x_center, y_center, width, height, class_id, confidence)


def build_frame(timestamp_ms: int, bboxes: list) -> bytes:
    """
    Đóng gói toàn bộ khung truyền IF-01:
    Header: Sync[2] (0x5A, 0xA5) + Ver (1) + Count (N) + Timestamp (uint32 ms)
    Payload: N x BBox (N x 8B)
    Checksum: CRC16 (uint16 Little-Endian)
    """
    count = len(bboxes)
    sync = bytes([0x5A, 0xA5])
    version = 1
    header = sync + struct.pack("<BBI", version, count, timestamp_ms & 0xFFFFFFFF)
    
    payload = b"".join(bboxes)
    data_to_crc = header + payload
    
    crc = calc_crc16_ccitt(data_to_crc)
    crc_bytes = struct.pack("<H", crc)
    
    return data_to_crc + crc_bytes


def list_serial_ports():
    """Liệt kê các cổng COM đang có trên máy tính."""
    ports = serial.tools.list_ports.comports()
    if not ports:
        print("[*] Không tìm thấy cổng COM nào trên máy tính.")
        return
    print("[*] Danh sách cổng COM hiện có:")
    for p in ports:
        print(f"    - {p.device}: {p.description}")


def main():
    parser = argparse.ArgumentParser(description="KVC Mock FPGA BBox Transmitter over USB-to-TTL")
    parser.add_argument("--port", "-p", type=str, default=None, help="Cổng COM (ví dụ: COM3, COM4). Bỏ trống để dò tự động.")
    parser.add_argument("--baud", "-b", type=int, default=38400, help="Tốc độ Baud (mặc định: 38400 bps, dự phòng: 115200)")
    parser.add_argument("--scenario", "-s", type=int, default=2, choices=[1, 2, 3, 4, 5],
                        help="Kịch bản thử nghiệm: 1 = Người ở giữa ảnh; 2 = Người trôi dạt diện rộng; 3 = 2 Người + 1 Phao; 4 = Khung trống; 5 = Đại hồng thủy (3 Người + 1 Thuyền)")
    parser.add_argument("--rate", "-r", type=float, default=1.0, help="Tần suất phát (Hz, mặc định: 1.0 = 1 giây/lần)")
    parser.add_argument("--list", "-l", action="store_true", help="Liệt kê các cổng COM rồi thoát")
    args = parser.parse_args()

    if args.list:
        list_serial_ports()
        return

    # Nếu người dùng chưa chỉ định cổng COM, tự động dò tìm
    target_port = args.port
    if not target_port:
        ports = serial.tools.list_ports.comports()
        ch340_ports = [p.device for p in ports if "CH340" in p.description or "USB-SERIAL" in p.description or "USB Serial" in p.description]
        if ch340_ports:
            target_port = ch340_ports[0]
            print(f"[*] Tự động nhận diện module CH340 tại cổng: {target_port}")
        elif ports:
            target_port = ports[0].device
            print(f"[*] Chọn cổng đầu tiên tìm thấy: {target_port}")
        else:
            print("[!] Không tìm thấy cổng COM nào! Hãy cắm module USB-TTL CH340 vào máy tính.")
            sys.exit(1)

    print("==================================================================", flush=True)
    print("  KVC - MOCK FPGA BBOX SENDER (DỮ LIỆU GIẢ LẬP KIỂM THỬ MCU)", flush=True)
    print(f"  Cổng COM: {target_port} | Tốc độ: {args.baud} bps 8N1", flush=True)
    print(f"  Kịch bản: {args.scenario} | Tần suất: {args.rate} Hz", flush=True)
    print("==================================================================", flush=True)

    try:
        ser = serial.Serial(target_port, args.baud, timeout=1.0)
    except serial.SerialException as e:
        print(f"[!] Không thể mở cổng {target_port}: {e}", flush=True)
        list_serial_ports()
        sys.exit(1)

    print(f"[*] Đã mở {target_port} thành công. Bắt đầu phát gói tin... (Nhấn Ctrl+C để dừng)\n", flush=True)

    t_start = time.time()
    step_count = 0

    try:
        while True:
            now_ms = int((time.time() - t_start) * 1000)
            bboxes = []

            import math
            t_sec = step_count * (1.0 / args.rate)

            if args.scenario == 1:
                # Kịch bản 1: Người tĩnh tại tâm ảnh (320, 240), frame 640x480
                bboxes.append(build_bbox_item(x_center=320, y_center=240, width=45, height=65, class_id=1, confidence=95))
                scenario_desc = "1 Person tại tâm (320, 240)"

            elif args.scenario == 2:
                # Kịch bản 2: 1 Người trôi dạt theo dòng nước lũ (quét từ 100 đến 540 pixel, trôi ~25-40 mét)
                cycle_prog = (t_sec * 0.08) % 1.0  # Chu kỳ ~12.5 giây trôi qua khung hình
                x_pos = int(100 + cycle_prog * 440)
                y_pos = int(240 + math.sin(t_sec * 0.8) * 85)
                bboxes.append(build_bbox_item(x_center=x_pos, y_center=y_pos, width=45, height=65, class_id=1, confidence=94))
                scenario_desc = f"1 Người trôi dạt tại ({x_pos}, {y_pos})"

            elif args.scenario == 3:
                # Kịch bản 3: Nhiều mục tiêu: 2 Người gặp nạn + 1 Phao cứu sinh
                # Người 1: Trôi dòng chính (nhanh)
                prog1 = (t_sec * 0.10) % 1.0
                p1_x = int(120 + prog1 * 400)
                p1_y = int(180 + math.sin(t_sec * 1.0) * 60)
                bboxes.append(build_bbox_item(x_center=p1_x, y_center=p1_y, width=45, height=60, class_id=1, confidence=96))

                # Người 2: Mắc kẹt gần bờ kè (trôi chậm, vị trí khác)
                prog2 = (t_sec * 0.04) % 1.0
                p2_x = int(500 - prog2 * 300)
                p2_y = int(320 + math.cos(t_sec * 0.6) * 50)
                bboxes.append(build_bbox_item(x_center=p2_x, y_center=p2_y, width=40, height=55, class_id=1, confidence=92))

                # Phao cứu sinh / Thuyền bè hỗ trợ (Class 2: Boat)
                p3_x = int(320 + math.sin(t_sec * 0.5) * 140)
                p3_y = int(240 + math.cos(t_sec * 0.5) * 80)
                bboxes.append(build_bbox_item(x_center=p3_x, y_center=p3_y, width=35, height=35, class_id=2, confidence=98))

                scenario_desc = f"3 Mục tiêu: Người 1 ({p1_x},{p1_y}) + Người 2 ({p2_x},{p2_y}) + Phao ({p3_x},{p3_y})"

            elif args.scenario == 4:
                # Kịch bản 4: Khung ảnh trống (Count = 0)
                scenario_desc = "Khung trống (Count = 0)"

            elif args.scenario == 5:
                # Kịch bản 5: Đại hồng thủy - Cứu hộ quy mô lớn (3 Người trôi dạt + 1 Thuyền phao)
                p1_x = int(100 + ((t_sec * 0.12) % 1.0) * 440)
                p1_y = int(160 + math.sin(t_sec * 1.1) * 50)
                bboxes.append(build_bbox_item(x_center=p1_x, y_center=p1_y, width=45, height=60, class_id=1, confidence=97))

                p2_x = int(520 - ((t_sec * 0.07) % 1.0) * 380)
                p2_y = int(340 + math.cos(t_sec * 0.9) * 60)
                bboxes.append(build_bbox_item(x_center=p2_x, y_center=p2_y, width=42, height=58, class_id=1, confidence=94))

                p3_x = int(200 + ((t_sec * 0.05) % 1.0) * 300)
                p3_y = int(260 + math.sin(t_sec * 0.7) * 40)
                bboxes.append(build_bbox_item(x_center=p3_x, y_center=p3_y, width=40, height=55, class_id=1, confidence=91))

                p4_x = int(320 + math.sin(t_sec * 0.4) * 160)
                p4_y = int(220 + math.cos(t_sec * 0.4) * 70)
                bboxes.append(build_bbox_item(x_center=p4_x, y_center=p4_y, width=38, height=38, class_id=2, confidence=99))

                scenario_desc = f"4 Mục tiêu: 3 Người trôi dạt + 1 Thuyền phao cứu nạn"

            frame = build_frame(now_ms, bboxes)
            ser.write(frame)
            ser.flush()

            crc_val = struct.unpack("<H", frame[-2:])[0]
            hex_preview = " ".join(f"{b:02X}" for b in frame[:10]) + ("..." if len(frame) > 10 else "")
            print(f"[{now_ms:6d} ms] Frame #{step_count:04d} | Độ dài: {len(frame):2d}B | CRC: 0x{crc_val:04X} | {scenario_desc}", flush=True)
            print(f"          Raw bytes: {hex_preview}", flush=True)

            step_count += 1
            time.sleep(1.0 / args.rate)

    except KeyboardInterrupt:
        print("\n[*] Đã nhận lệnh dừng từ bàn phím. Đóng cổng COM...")
    finally:
        ser.close()
        print("[*] Đã đóng cổng COM an toàn.")


if __name__ == "__main__":
    main()
