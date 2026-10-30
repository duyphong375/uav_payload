"""Công cụ giả lập phát gói tin Telemetry (Người / Tàu thuyền) gửi tới GCS Backend.

Dùng để test hiển thị Dashboard mà không cần phần cứng ESP32.
Chạy bằng: python scripts/mock_send_to_gcs.py
"""

import struct
import time
import urllib.request
import json

BACKEND_INGRESS_URL = "http://127.0.0.1:8000/api/ingress/envelope"


def make_rf_payload(
    seq_num: int,
    timestamp_ms: int,
    class_id: int,       # 0: None, 1: Người, 2: Tàu thuyền
    confidence: int,     # 0 - 100%
    lat: float,          # WGS84
    lon: float,          # WGS84
    x_local_cm: int,
    y_local_cm: int,
    lidar_cm: int,
    battery_v: float,    # KHÔNG dùng: KVC đã bỏ đo pin; giữ tham số để không phá call site
    has_gps: bool = True,
    ai_detect: bool = True,
    roll_deg: float = 1.2,
    pitch_deg: float = -0.8,
) -> str:
    fmt = "<2sBBIIIhhHBBBB4sH"
    lat_scaled = int(lat * 1e7) if has_gps else 0
    lon_scaled = int(lon * 1e7) if has_gps else 0
    # Byte 25 IF-02 nay la status_reserved (luon 0). Truoc day la battery_raw.
    status_reserved = 0
    del battery_v
    
    # Flags: bit0=GPS, bit1=LiDAR, bit2=IMU, bit3=AI
    sensor_flags = 0
    if has_gps:
        sensor_flags |= 0x01
    sensor_flags |= 0x02  # LiDAR valid
    sensor_flags |= 0x04  # IMU valid
    if ai_detect and class_id > 0:
        sensor_flags |= 0x08  # AI detected

    # Pack Roll & Pitch vào 4 byte reserved (đơn vị 0.1 độ, ví dụ 12 = 1.2°)
    reserved_bytes = struct.pack("<hh", int(round(roll_deg * 10)), int(round(pitch_deg * 10)))

    raw_bytes = struct.pack(
        fmt,
        b"\xaa\x55",
        1,  # Msg ID
        seq_num % 256,
        timestamp_ms,
        lat_scaled,
        lon_scaled,
        x_local_cm,
        y_local_cm,
        lidar_cm,
        class_id,
        confidence,
        sensor_flags,
        status_reserved,
        reserved_bytes,
        0xABCD,  # CRC16
    )
    return raw_bytes.hex()


def send_packet(seq: int, class_id: int, name: str, lat: float, lon: float, conf: int, lidar: int, bat: float):
    rf_hex = make_rf_payload(
        seq_num=seq,
        timestamp_ms=int(time.time() * 1000) % 1000000,
        class_id=class_id,
        confidence=conf,
        lat=lat,
        lon=lon,
        x_local_cm=150,
        y_local_cm=300,
        lidar_cm=lidar,
        battery_v=bat,
    )
    payload = {
        "transport_version": 1,
        "gateway_session_id": 1,
        "gateway_sequence": seq,
        "rx_monotonic_ms": int(time.time() * 1000) % 1000000,
        "rf_payload_hex": rf_hex,
        "rssi_dbm": -68 - (seq % 10),
        "snr_db": 9.5,
        "rx_drop_count": 0,
    }
    req = urllib.request.Request(
        BACKEND_INGRESS_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=2.0) as resp:
            print(f"[TX #{seq:03d}] Đã gửi: {name} (Class {class_id}) | LiDAR={lidar}cm | HTTP {resp.status}")
    except Exception as err:
        print(f"[!] Lỗi kết nối tới Backend ({BACKEND_INGRESS_URL}): {err}")
        print("    -> Bạn đã chạy 'python -m gcs.backend.main' chưa?")


def main():
    print("=" * 65)
    print("  KVC - CÔNG CỤ PHÁT DỮ LIỆU GIẢ LẬP GCS (NGƯỜI & TÀU THUYỀN)")
    print("  Đang phát gói tin 32-byte mô phỏng lên Backend (chu kỳ 1 giây)...")
    print("  Mở Dashboard tại: http://127.0.0.1:5173 để xem trực quan!")
    print("  Nhấn Ctrl+C để dừng.")
    print("=" * 65)

    seq = 1
    # Tọa độ quanh Hồ bơi / Khu vực cứu nạn giả lập (Đại học Bách Khoa TP.HCM / Hồ bơi)
    base_lat = 10.772345
    base_lon = 106.657890

    scenarios = [
        # (class_id, name, conf, lat_offset, lon_offset, lidar, battery)
        (1, "🧍 NGƯỜI GẶP NẠN (Person)", 92, 0.000000, 0.000000, 240, 12.4),
        (1, "🧍 NGƯỜI GẶP NẠN (Person)", 95, 0.000020, 0.000030, 235, 12.3),
        (2, "🚤 TÀU THUYỀN / CA-NÔ (Boat)", 89, 0.000250, 0.000350, 280, 12.2),
        (2, "🚤 TÀU THUYỀN / CA-NÔ (Boat)", 93, 0.000280, 0.000380, 275, 12.1),
        (0, "🌊 ĐANG QUÉT (Không có mục tiêu)", 0, 0.0, 0.0, 310, 12.0),
    ]

    while True:
        idx = (seq - 1) % len(scenarios)
        cid, name, conf, dlat, dlon, lidar, bat = scenarios[idx]
        send_packet(
            seq=seq,
            class_id=cid,
            name=name,
            lat=base_lat + dlat,
            lon=base_lon + dlon,
            conf=conf,
            lidar=lidar,
            bat=bat,
        )
        seq += 1
        time.sleep(1.0)


if __name__ == "__main__":
    main()
