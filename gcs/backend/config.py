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
    # FIX (Codex F13): default cũ là 10.136.131.101 (IP mạng LAN của một máy cụ
    # thể), lệch với IF_ESP32_GCS_WS.md:55-56 quy định ESP32 SoftAP ở
    # 192.168.4.1. Nay dùng đúng giá trị trong hợp đồng. Vẫn override được bằng
    # env KVC_ESP32_WS_URL khi cần trỏ tới IP khác.
    esp32_ws_url: str = field(default_factory=lambda: _env_str("KVC_ESP32_WS_URL", "ws://192.168.4.1:8080/telemetry"))
    enable_esp32_ingress: bool = field(default_factory=lambda: _env_bool("KVC_ENABLE_ESP32", False))

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
