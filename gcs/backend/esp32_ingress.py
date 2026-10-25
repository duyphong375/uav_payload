"""ESP32-C3 WebSocket Ingress Client and 32-Byte RF Payload Parser.

Connects to the ESP32 Gateway at ws://192.168.4.1:8080/telemetry,
unpacks Little-Endian 32-byte RF telemetry, and injects events into Hub.
"""

import asyncio
import json
import logging
import struct
from typing import Any

import websockets

logger = logging.getLogger("kvc.esp32_ingress")

# IF-02 ABI hien hanh: goi RF 32 byte Little-Endian.
# Khoa o day de parser va test cung mot nguon; doi layout phai sua IF-02 truoc.
RF_PAYLOAD_SIZE = 32
RF_PAYLOAD_FORMAT = "<2sBBIIIhhHBBBB4sH"
RF_CRC_COVERAGE = 30

# Golden vector GV-01 (IF-02 muc 3), sinh tu kvc_telemetry.h tren MCU va
# doi chieu bang runPhase2SelfTest() tren Gateway. Dung chung C/Python.
GOLDEN_GV01_HEX = "aa55012ae8030000baba6b06d4b3923f96004001f000015c0f7e000000004e30"
GOLDEN_GV01_CRC16 = 0x304E


def crc16_ccitt_false(data: bytes) -> int:
    """CRC-16/CCITT-FALSE: poly 0x1021, init 0xFFFF, RefIn/RefOut false, xor 0."""
    crc = 0xFFFF
    for byte in data:
        crc ^= byte << 8
        for _ in range(8):
            if crc & 0x8000:
                crc = ((crc << 1) ^ 0x1021) & 0xFFFF
            else:
                crc = (crc << 1) & 0xFFFF
    return crc


def validate_rf_payload(raw_bytes: bytes) -> tuple[bool, bool]:
    """Check length, sync và CRC16 của frame 32 byte theo IF-02.

    Trả (sync_valid, crc_valid). Không ném lỗi để caller tự quyết định policy.
    """
    if len(raw_bytes) != RF_PAYLOAD_SIZE:
        return False, False
    sync_valid = raw_bytes[0:2] == b"\xaa\x55"
    expected = int.from_bytes(raw_bytes[RF_CRC_COVERAGE:RF_PAYLOAD_SIZE], "little")
    crc_valid = crc16_ccitt_false(raw_bytes[:RF_CRC_COVERAGE]) == expected
    return sync_valid, crc_valid


def parse_rf_payload(rf_payload_hex: str) -> dict[str, Any]:
    """Parse 64-char hex string (32 bytes Little-Endian) per IF_MCU_LORA_RF.md."""
    raw_bytes = bytes.fromhex(rf_payload_hex.strip())
    if len(raw_bytes) != RF_PAYLOAD_SIZE:
        raise ValueError(f"Payload must be {RF_PAYLOAD_SIZE} bytes, got {len(raw_bytes)}")

    sync_valid, crc_valid = validate_rf_payload(raw_bytes)
    fmt = RF_PAYLOAD_FORMAT
    (
        _sync, msg_id, seq_num, timestamp_ms,
        lat_scaled, lon_scaled,
        x_local_cm, y_local_cm,
        lidar_cm, class_id, confidence,
        sensor_flags, battery_raw, reserved, crc16,
    ) = struct.unpack(fmt, raw_bytes)

    gps_valid = bool(sensor_flags & 0x01)
    lidar_valid = bool(sensor_flags & 0x02)
    imu_valid = bool(sensor_flags & 0x04)
    ai_detected = bool(sensor_flags & 0x08)

    # Class mapping theo IF-02 (một tên chuẩn duy nhất):
    #   1 = person (người), 2 = lifebuoy (phao cứu sinh)
    # FIX (Codex F14): trước đây map 2 -> "boat", lệch với IF-02 và
    # kvc_fpga_bbox.h (LIFEBUOY). Nay dùng "lifebuoy". Schema vẫn chấp nhận
    # "boat" để không phá dữ liệu cũ trong DB/replay.
    class_name = "person" if class_id == 1 else "lifebuoy" if class_id == 2 else "unknown"

    # Firmware currently sends zero to mean "not measured" (no battery ADC).
    # Preserve unknown as null instead of presenting it as an empty battery.
    if battery_raw == 0:
        battery_pct = None
    else:
        # 10.5V (0%) to 12.6V (100%), 0.1V/bit
        battery_v = battery_raw * 0.1
        battery_pct = int(min(100, max(0, (battery_v - 10.5) / (12.6 - 10.5) * 100)))

    has_target = ai_detected and (class_id in (1, 2))

    target_data = None
    if has_target:
        lidar_position_valid = lidar_valid and 20 <= lidar_cm <= 800
        has_wgs84_position = gps_valid and lidar_position_valid and lat_scaled != 0 and lon_scaled != 0
        has_local_position = (
            not gps_valid
            and lidar_position_valid
            and (x_local_cm != 0 or y_local_cm != 0)
        )

        if not has_wgs84_position and not has_local_position:
            target_data = {
                "track_id": seq_num or 1,
                "class_id": class_id,
                "class_name": class_name,
                "confidence": min(100, max(0, confidence)),
                "target_confirmed": True,
                "pos_valid": False,
                "coordinate_frame": "NONE",
                "latitude": None,
                "longitude": None,
                "local_x_cm": None,
                "local_y_cm": None,
                "origin_id": None,
            }
        elif has_wgs84_position:
            target_id = x_local_cm if (1 <= x_local_cm <= 10) else (seq_num or 1)
            target_data = {
                "track_id": target_id,
                "class_id": class_id,
                "class_name": class_name,
                "confidence": min(100, max(0, confidence)),
                "target_confirmed": True,
                "pos_valid": True,
                "coordinate_frame": "WGS84",
                "latitude": lat_scaled / 1e7,
                "longitude": lon_scaled / 1e7,
                "local_x_cm": float(x_local_cm),
                "local_y_cm": float(y_local_cm),
                "origin_id": None,
            }
        else:
            target_data = {
                "track_id": seq_num or 1,
                "class_id": class_id,
                "class_name": class_name,
                "confidence": min(100, max(0, confidence)),
                "target_confirmed": True,
                "pos_valid": True,
                "coordinate_frame": "LOCAL_GRID",
                "latitude": None,
                "longitude": None,
                "local_x_cm": float(x_local_cm),
                "local_y_cm": float(y_local_cm),
                "origin_id": 1,
            }

    roll_deg = None
    pitch_deg = None
    if imu_valid and isinstance(reserved, (bytes, bytearray)) and len(reserved) >= 4:
        r_raw, p_raw = struct.unpack("<hh", reserved[:4])
        roll_deg = round(r_raw / 10.0, 1)
        pitch_deg = round(p_raw / 10.0, 1)

    target_lat = round(lat_scaled / 1e7, 7) if (lat_scaled != 0 and gps_valid) else None
    target_lon = round(lon_scaled / 1e7, 7) if (lon_scaled != 0 and gps_valid) else None

    # Tách biệt tọa độ UAV với tọa độ người trôi dạt:
    # UAV giữ nguyên vị trí bay thực tế, không bị nhảy giật theo mục tiêu
    if target_lat is not None and target_lon is not None:
        if target_data is not None and target_data["pos_valid"] and (x_local_cm != 0 or y_local_cm != 0):
            d_lat = (y_local_cm / 100.0) * (89.977 / 1e7)
            d_lon = (x_local_cm / 100.0) * (93.633 / 1e7)
            uav_lat = round(target_lat - d_lat, 7)
            uav_lon = round(target_lon - d_lon, 7)
        else:
            uav_lat = target_lat
            uav_lon = target_lon
    else:
        uav_lat = None
        uav_lon = None

    return {
        "sync_valid": sync_valid,
        "crc_valid": crc_valid,
        "crc16": crc16,
        "msg_id": msg_id,
        "seq_num": seq_num,
        "device_measurement_time_ms": timestamp_ms,
        "telemetry": {
            "battery_pct": battery_pct,
            "lidar_range_cm": lidar_cm if (lidar_valid and 20 <= lidar_cm <= 800) else None,
            "gps_valid": gps_valid,
            "lidar_valid": lidar_valid,
            "imu_valid": imu_valid,
            "ai_detected": ai_detected,
            "roll_deg": roll_deg,
            "pitch_deg": pitch_deg,
        },
        "uav_gps": {
            "latitude": uav_lat,
            "longitude": uav_lon,
        } if (uav_lat is not None and uav_lon is not None) else None,
        "imu": {
            "roll_deg": roll_deg,
            "pitch_deg": pitch_deg,
        } if imu_valid else None,
        "has_target": has_target,
        "target": target_data,
    }


def inject_envelope(hub: Any, data: dict[str, Any]) -> dict[str, Any]:
    """Inject a parsed envelope into the Hub."""
    hub.store.original_source_mode = "REAL"
    rf_hex = data.get("rf_payload_hex")
    if not rf_hex:
        raise ValueError("Missing rf_payload_hex field")

    parsed = parse_rf_payload(rf_hex)
    rssi = data.get("rssi_dbm")
    snr = data.get("snr_db")

    telem = parsed["telemetry"]
    if rssi is not None and -127 <= rssi <= 0:
        telem["packet_rssi_dbm"] = int(rssi)
    if snr is not None:
        telem["packet_snr_db"] = float(snr)

    cam_pos = None
    uav_gps = parsed.get("uav_gps")
    if uav_gps and uav_gps["latitude"] is not None and uav_gps["longitude"] is not None:
        alt_m = None
        if telem.get("lidar_range_cm") is not None:
            alt_m = round(telem["lidar_range_cm"] / 100.0, 2)
        cam_pos = {
            "latitude": uav_gps["latitude"],
            "longitude": uav_gps["longitude"],
            "altitude_m": alt_m,
            # FIX (Codex F12): lidar_range_cm là cự ly siêu âm đo từ UAV xuống
            # mặt nước đất, tức độ cao so với bề mặt (AGL). Trước đây gán "MSL"
            # nên GCS hiểu là độ cao trên mực nước biển -> sai. Nay gán "AGL".
            "altitude_reference": "AGL" if alt_m is not None else "UNKNOWN",
            "heading_deg": None,
            "is_valid": True,
            "last_updated_iso": None,
        }
    elif not telem.get("gps_valid"):
        cam_pos = {
            "latitude": None,
            "longitude": None,
            "altitude_m": None,
            "altitude_reference": "UNKNOWN",
            "heading_deg": None,
            "is_valid": False,
            "last_updated_iso": None,
        }

    hub.publish("LINK_STATUS", hardware_link={"status": "CONNECTED", "port": "ESP32_WIFI"})
    telemetry_kwargs = {"telemetry": telem}
    if cam_pos is not None:
        telemetry_kwargs["camera_position"] = cam_pos
    hub.publish("TELEMETRY_UPDATE", **telemetry_kwargs)

    if parsed["has_target"]:
        hub.publish("TARGET_UPDATE", has_target=True, target=parsed["target"])
    else:
        hub.publish("TARGET_UPDATE", has_target=False, target=None)

    return parsed


async def probe_gateway_url(ip: str) -> str | None:
    """Probe an IP address for active KVC ESP32 Gateway WebSocket."""
    url = f"ws://{ip}:8080/telemetry"
    try:
        async with websockets.connect(url, open_timeout=1.5, close_timeout=0.5) as ws:
            msg = await asyncio.wait_for(ws.recv(), timeout=1.0)
            if "KVC_ESP32_GATEWAY" in msg or "transport_version" in msg:
                return url
    except Exception:
        return None
    return None


async def discover_esp32_gateway(preferred_url: str = "") -> str | None:
    """Auto-discover ESP32 Gateway WebSocket URL across common subnets."""
    # 0. Check preferred_url if given
    if preferred_url:
        host = preferred_url.replace("ws://", "").replace("http://", "").split("/")[0].split(":")[0]
        if host:
            res = await probe_gateway_url(host)
            if res:
                return res

    # 1. First probe known static IPs
    for ip in ("10.136.131.101", "192.168.4.1", "192.168.1.175", "192.168.1.15"):
        res = await probe_gateway_url(ip)
        if res:
            return res

    # 2. Try local subnet based on machine's current IP
    try:
        import socket
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        subnet_prefix = ".".join(local_ip.split(".")[:3])
        if subnet_prefix not in {"127.0.0", "0.0.0"}:
            for host_num in (101, 1, 100, 102, 103, 105, 110, 15, 175):
                res = await probe_gateway_url(f"{subnet_prefix}.{host_num}")
                if res:
                    return res
    except Exception:
        pass

    return None


async def run_esp32_ingress(hub: Any, ws_url: str = "ws://10.136.131.101:8080/telemetry") -> None:
    """Async task connecting to ESP32 Gateway WebSocket with automatic reconnect and auto-discovery."""
    reconnect_delay = 2.0
    last_status = None
    current_url = ws_url
    fail_count = 0

    while True:
        try:
            logger.info("Connecting to ESP32 Gateway at %s...", current_url)
            async with websockets.connect(current_url, open_timeout=5.0, close_timeout=1.0) as ws:
                fail_count = 0
                last_status = "CONNECTED"
                hub.publish("LINK_STATUS", hardware_link={"status": "CONNECTED", "port": current_url})
                logger.info("Connected to ESP32 Gateway at %s.", current_url)

                # Đảm bảo nếu có mock source nào đang chạy ngầm thì hủy ngay lập tức
                if hasattr(hub, "source_task") and hub.source_task is not None:
                    hub.source_task.cancel()
                    hub.source_task = None

                async for message in ws:
                    try:
                        envelope = json.loads(message)
                        # Nếu nhận gói tin Handshake chào mừng từ ESP32 (không có rf_payload_hex)
                        if envelope.get("status") == "CONNECTED" and "rf_payload_hex" not in envelope:
                            logger.info("ESP32 Handshake received: %s", envelope)
                            hub.publish("LINK_STATUS", hardware_link={"status": "CONNECTED", "port": current_url})
                            continue

                        inject_envelope(hub, envelope)
                    except Exception as err:
                        logger.warning("Error processing packet from ESP32: %s", err)
        except asyncio.CancelledError:
            break
        except Exception as exc:
            fail_count += 1
            # CHỈ publish LINK_STATUS khi trạng thái thực sự thay đổi sang DISCONNECTED (tránh spam packet mỗi 2 giây)
            if last_status != "DISCONNECTED":
                last_status = "DISCONNECTED"
                hub.publish("LINK_STATUS", hardware_link={"status": "DISCONNECTED", "port": current_url, "error_message": str(exc)})

            # Tự động dò tìm IP mới của ESP32 sau 5 lần thất bại liên tiếp (~10s)
            if fail_count >= 5:
                fail_count = 0
                discovered = await discover_esp32_gateway(preferred_url=ws_url)
                if discovered and discovered != current_url:
                    logger.info("ESP32 Gateway auto-discovered at %s! Updating target URL.", discovered)
                    current_url = discovered

            await asyncio.sleep(reconnect_delay)

