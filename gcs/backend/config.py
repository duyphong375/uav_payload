import os
from dataclasses import dataclass, field
from pathlib import Path


def _env_bool(name: str, default: bool) -> bool:
    val = os.getenv(name)
    if val is None:
        return default
    return val.strip().lower() not in {"0", "false", "no", "off", "disable", "disabled"}


def _env_str(name: str, default: str) -> str:
    return os.getenv(name, default)


@dataclass(frozen=True)
class Settings:
    host: str = "127.0.0.1"
    port: int = 8000
    queue_capacity: int = 64
    send_timeout_sec: float = 1.0
    mock_interval_sec: float = 1.0
    stale_threshold_ms: int = 3000
    enable_mock: bool = field(default_factory=lambda: _env_bool("KVC_ENABLE_MOCK", True))
    storage_dir: Path | None = Path("data/sessions")
    logger_queue_capacity: int = 1024
    logger_flush_timeout_sec: float = 5.0
    # Cấu hình địa chỉ WebSocket Gateway ESP32 (mặc định SoftAP 192.168.4.1:8080/telemetry theo IF-03)
    esp32_ws_url: str = field(default_factory=lambda: _env_str("KVC_ESP32_WS_URL", "ws://192.168.4.1:8080/telemetry"))
    enable_esp32_ingress: bool = field(default_factory=lambda: _env_bool("KVC_ENABLE_ESP32", False))

    # IF-05: kênh video phụ (ESP32-S3-CAM MJPEG) đi qua backend relay.
    # Backend là CLIENT của camera, trình duyệt KHÔNG nối trực tiếp thiết bị
    # (giữ nguyên quy tắc cốt lõi của IF-03). Tắt mặc định để không mở kết nối
    # mạng ra ngoài khi chưa cấu hình.
    enable_video_relay: bool = field(default_factory=lambda: _env_bool("KVC_ENABLE_VIDEO_RELAY", False))
    video_source_url: str = field(default_factory=lambda: _env_str("KVC_VIDEO_SOURCE_URL", ""))
    video_reconnect_sec: float = 2.0
    video_frame_timeout_sec: float = 10.0

    def __post_init__(self):
        if self.host not in {"127.0.0.1", "::1"}:
            raise ValueError("This development server must bind loopback")
        if not 1 <= self.queue_capacity <= 64:
            raise ValueError("queue_capacity must be in 1..64")
        if not 0 < self.send_timeout_sec <= 1:
            raise ValueError("send_timeout_sec must be in (0,1]")
        if self.mock_interval_sec <= 0 or self.stale_threshold_ms != 3000:
            raise ValueError("Invalid mock interval or application stale threshold")
        if not 1 <= self.logger_queue_capacity <= 1024:
            raise ValueError("logger_queue_capacity must be in 1..1024")
        if not 0 < self.logger_flush_timeout_sec <= 30:
            raise ValueError("logger_flush_timeout_sec must be in (0,30]")
        if not 0 < self.video_reconnect_sec <= 60:
            raise ValueError("video_reconnect_sec must be in (0,60]")
        if not 0 < self.video_frame_timeout_sec <= 60:
            raise ValueError("video_frame_timeout_sec must be in (0,60]")
        if self.enable_video_relay and not self.video_source_url.strip():
            raise ValueError("KVC_ENABLE_VIDEO_RELAY=1 requires KVC_VIDEO_SOURCE_URL")
