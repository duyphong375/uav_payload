"""
KVC SAR UAV - Thử nghiệm Định vị Kép (Dual Geolocation Demonstration)
====================================================================
Mô phỏng đồng thời 2 luồng tọa độ GPS trên Web GCS:
  1. Tọa độ 1: Do MCU + FPGA tính toán trên UAV, phát qua sóng LoRa 32 byte (IF-02)
     -> Đối tượng: Phao cứu sinh (Lifebuoy, Class 2), nhãn FPGA_GW2A.
  2. Tọa độ 2: Do Laptop CPU/GPU nhận diện từ Video ESP32-S3-CAM và tính toán chiếu tia
     -> Đối tượng: Người gặp nạn (Person, Class 1), nhãn PC_REFERENCE.
     -> Kèm Bounding Box đồng bộ trên Video Stream!

Cách chạy:
  python scripts/manual/demo_dual_geolocation.py
"""

import json
import math
import struct
import sys
import time
import urllib.request

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

BACKEND_URL = "http://127.0.0.1:8000"
INGRESS_ENVELOPE_URL = f"{BACKEND_URL}/api/ingress/envelope"


def crc16_ccitt_false(data: bytes) -> int:
    """CRC-16/CCITT-FALSE chuẩn theo IF-02."""
    crc = 0xFFFF
    for byte in data:
        crc ^= byte << 8
        for _ in range(8):
            if crc & 0x8000:
                crc = ((crc << 1) ^ 0x1021) & 0xFFFF
            else:
                crc = (crc << 1) & 0xFFFF
    return crc


def make_rf_payload(
    seq_num: int,
    timestamp_ms: int,
    class_id: int,
    confidence: int,
    lat: float,
    lon: float,
    x_local_cm: int,
    y_local_cm: int,
    lidar_cm: int,
    roll_deg: float = 1.2,
    pitch_deg: float = -0.8,
) -> str:
    """Tạo gói tin RF 32-byte chuẩn Little-Endian theo ABI IF-02."""
    lat_scaled = int(round(lat * 1e7))
    lon_scaled = int(round(lon * 1e7))
    status_reserved = 0

    # Flags: bit0=GPS valid, bit1=LiDAR valid, bit2=IMU valid, bit3=AI detected
    sensor_flags = 0x01 | 0x02 | 0x04 | 0x08

    reserved_bytes = struct.pack("<hh", int(round(roll_deg * 10)), int(round(pitch_deg * 10)))

    raw_header = struct.pack(
        "<2sBBIIIhhHBBBB4s",
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
    )
    crc = crc16_ccitt_false(raw_header)
    return (raw_header + struct.pack("<H", crc)).hex()


def send_envelope(seq: int, rf_hex: str, device: str, rssi: int = -68):
    """Gửi envelope chứa gói tin 32-byte và định danh nguồn suy luận tới GCS Backend."""
    payload = {
        "transport_version": 1,
        "gateway_session_id": 1,
        "gateway_sequence": seq,
        "rx_monotonic_ms": int(time.time() * 1000) % 1000000,
        "rf_payload_hex": rf_hex,
        "inference_device": device,
        "rssi_dbm": rssi,
        "snr_db": 9.5,
        "rx_drop_count": 0,
    }
    req = urllib.request.Request(
        INGRESS_ENVELOPE_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=2.0) as resp:
        return resp.status


def calculate_laptop_geolocation(
    uav_lat: float,
    uav_lon: float,
    altitude_m: float,
    roll_deg: float,
    pitch_deg: float,
    yaw_deg: float,
    pixel_u: float,
    pixel_v: float,
    img_w: int = 800,
    img_h: int = 600,
    hfov_deg: float = 65.0,
):
    """
    Tính tọa độ GPS của người từ Video trên Laptop (Ray-plane intersection):
    1. Chuyển pixel (u, v) thành vector quang học.
    2. Bù góc nghiêng máy bay (roll, pitch, yaw).
    3. Giao với mặt phẳng nước ở độ cao Z = altitude_m.
    4. Cộng bù độ dời (dx, dy) vào UAV GPS.
    """
    # Tiêu cự tính theo pixel (Pinhole camera model)
    fx = (img_w / 2.0) / math.tan(math.radians(hfov_deg / 2.0))
    fy = fx  # Giả định pixel vuông

    # Tọa độ chuẩn hóa từ tâm ảnh
    cx = img_w / 2.0
    cy = img_h / 2.0
    dx_cam = (pixel_u - cx) / fx
    dy_cam = (pixel_v - cy) / fy

    # Vector hướng nhìn (xuống nước, Z dương hướng xuống)
    # Góc chúc ngẩng pitch: UAV nghiêng về trước -> nhìn xa hơn
    pitch_rad = math.radians(pitch_deg)
    roll_rad = math.radians(roll_deg)
    yaw_rad = math.radians(yaw_deg)

    # Khoảng cách cục bộ (mét) trên mặt nước
    # Công thức xấp xỉ bậc 1 với góc nghiêng nhỏ (UAV đứng yên lượn lờ < 5 độ):
    local_x = altitude_m * (dy_cam + math.tan(pitch_rad))   # Mét về phía trước UAV
    local_y = altitude_m * (dx_cam + math.tan(roll_rad))    # Mét về phía phải UAV

    # Xoay theo la bàn Yaw (0 độ = Bắc, 90 độ = Đông)
    d_north = local_x * math.cos(yaw_rad) - local_y * math.sin(yaw_rad)
    d_east = local_x * math.sin(yaw_rad) + local_y * math.cos(yaw_rad)

    # Chuyển độ dời mét sang vĩ độ và kinh độ WGS-84
    # 1 độ vĩ ~ 111,320m; 1 độ kinh ~ 111,320m * cos(lat)
    target_lat = uav_lat + (d_north / 111320.0)
    target_lon = uav_lon + (d_east / (111320.0 * math.cos(math.radians(uav_lat))))

    return target_lat, target_lon, local_x, local_y


def main():
    print("=" * 72)
    print("   KVC SAR UAV - THỬ NGHIỆM ĐỊNH VỊ KÉP ĐỒNG THỜI (DUAL GEOLOCATION)")
    print("=" * 72)
    print("  Kênh 1: MCU + FPGA trên máy bay (Phao cứu sinh / Lifebuoy qua LoRa RF)")
    print("  Kênh 2: Laptop CPU/GPU từ Video (Người gặp nạn / Person qua Ray-Plane)")
    print("  Giao diện Web GCS: http://localhost:5173")
    print("=" * 72)

    # Kiểm tra Backend
    try:
        with urllib.request.urlopen(f"{BACKEND_URL}/api/health", timeout=2.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            print(f"[+] Đã kết nối GCS Backend ({BACKEND_URL}): status={data.get('status')}")
    except Exception as exc:
        print(f"[!] KHÔNG THỂ KẾT NỐI BACKEND TẠI {BACKEND_URL}: {exc}")
        print("    -> Vui lòng chạy backend: python -m gcs.backend.main --real --no-esp32")
        sys.exit(1)

    # Tọa độ cơ sở của UAV cứu nạn (Khu vực diễn tập / Hồ bơi)
    uav_lat = 16.474400
    uav_lon = 107.575350
    altitude_m = 2.40  # Độ cao 2.4m từ cảm biến siêu âm AJ-SR04M
    lidar_cm = int(altitude_m * 100)
    roll_deg = 1.2
    pitch_deg = -0.8
    yaw_deg = 45.0  # Hướng Đông-Bắc

    # 1. Tọa độ Phao do MCU/FPGA phát hiện (Local: X=1.5m, Y=2.0m)
    fpga_target_lat = uav_lat + (2.0 / 111320.0)
    fpga_target_lon = uav_lon + (1.5 / (111320.0 * math.cos(math.radians(uav_lat))))
    fpga_conf = 94

    seq = 1
    print("\n[*] Đang phát đồng thời 2 luồng tọa độ lên GCS (Chu kỳ: 1.0 giây)...")
    print("[*] Mở trình duyệt tại http://localhost:5173 để quan sát trực tiếp!")
    print("[*] Nhấn Ctrl+C để dừng mô phỏng.\n")

    try:
        while True:
            now_ms = int(time.time() * 1000) % 10000000

            # -------------------------------------------------------------
            # PHÁT HÀNH 1: Gói từ MCU/FPGA (LoRa RF 32 byte) -> PHAO CỨU SINH
            # -------------------------------------------------------------
            rf_hex_fpga = make_rf_payload(
                seq_num=seq,
                timestamp_ms=now_ms,
                class_id=2,  # 2 = Lifebuoy
                confidence=fpga_conf,
                lat=fpga_target_lat,
                lon=fpga_target_lon,
                x_local_cm=150,
                y_local_cm=200,
                lidar_cm=lidar_cm,
                roll_deg=roll_deg,
                pitch_deg=pitch_deg,
            )
            status1 = send_envelope(seq=seq, rf_hex=rf_hex_fpga, device="FPGA_GW2A")

            # -------------------------------------------------------------
            # PHÁT HÀNH 2: Tọa độ do Laptop GPU tính từ Video -> NGƯỜI GẶP NẠN
            # Giả lập tâm BBox người trên khung hình SVGA 800x600:
            # Người nằm tại (u=480, v=320)
            # -------------------------------------------------------------
            person_u = 480 + 15 * math.sin(seq * 0.1)
            person_v = 320 + 10 * math.cos(seq * 0.1)
            person_lat, person_lon, lx, ly = calculate_laptop_geolocation(
                uav_lat=uav_lat,
                uav_lon=uav_lon,
                altitude_m=altitude_m,
                roll_deg=roll_deg,
                pitch_deg=pitch_deg,
                yaw_deg=yaw_deg,
                pixel_u=person_u,
                pixel_v=person_v,
            )
            laptop_conf = 97

            # Đóng gói tọa độ người từ Laptop gửi vào Ingress
            rf_hex_pc = make_rf_payload(
                seq_num=seq + 1000,
                timestamp_ms=now_ms + 50,
                class_id=1,  # 1 = Person
                confidence=laptop_conf,
                lat=person_lat,
                lon=person_lon,
                x_local_cm=int(lx * 100),
                y_local_cm=int(ly * 100),
                lidar_cm=lidar_cm,
                roll_deg=roll_deg,
                pitch_deg=pitch_deg,
            )
            status2 = send_envelope(seq=seq + 1000, rf_hex=rf_hex_pc, device="PC_REFERENCE")

            # In thông tin ra console
            print(
                f"[TX #{seq:03d}] "
                f"MCU/FPGA: Phao ({fpga_target_lat:.6f}, {fpga_target_lon:.6f}) Conf {fpga_conf}% | "
                f"Laptop GPU: Người ({person_lat:.6f}, {person_lon:.6f}) Conf {laptop_conf}% | "
                f"HTTP {status1}/{status2}"
            )

            seq += 1
            time.sleep(1.0)

    except KeyboardInterrupt:
        print("\n[*] Đã dừng phát mô phỏng tọa độ kép.")


if __name__ == "__main__":
    main()

