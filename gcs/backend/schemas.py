"""Strict application events. Omitted patch keys preserve; explicit null clears."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Nonnegative = Annotated[int, Field(ge=0)]
Percent = Annotated[int, Field(ge=0, le=100)]


class StrictModel(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid", allow_inf_nan=False)


class Telemetry(StrictModel):
    battery_pct: Percent | None = None
    lidar_range_cm: Annotated[int, Field(ge=20, le=800)] | None = None
    gps_valid: bool = False
    lidar_valid: bool = False
    imu_valid: bool = False
    ai_detected: bool = False
    packet_rssi_dbm: Annotated[int, Field(ge=-127, le=0)] | None = None
    packet_snr_db: float | None = None
    roll_deg: float | None = None
    pitch_deg: float | None = None


class Target(StrictModel):
    track_id: Annotated[int, Field(ge=1, le=65535)] | None = None
    class_id: Annotated[int, Field(ge=0, le=2)] = 0
    class_name: Literal["unknown", "person", "lifebuoy", "boat"] = "unknown"
    confidence: Percent | None = None
    target_confirmed: bool = False
    pos_valid: bool = False
    coordinate_frame: Literal["LOCAL_GRID", "WGS84", "NONE"] = "NONE"
    local_x_cm: float | None = None
    local_y_cm: float | None = None
    latitude: Annotated[float, Field(ge=-90, le=90)] | None = None
    longitude: Annotated[float, Field(ge=-180, le=180)] | None = None
    origin_id: Annotated[int, Field(ge=1, le=255)] | None = None


class HardwareLink(StrictModel):
    status: Literal["CONNECTED", "DISCONNECTED", "RECONNECTING", "UNKNOWN"] = "UNKNOWN"
    port: str | None = None
    error_message: str | None = None


class Diagnostics(StrictModel):
    packets_received_total: Nonnegative = 0
    decode_errors_total: Nonnegative = 0
    ingress_drops_total: Nonnegative = 0
    logger_drops_total: Nonnegative = 0
    client_drops_total: Nonnegative = 0
    data_loss_latched: bool = False
    logger_status: Literal["OK", "LOG_DEGRADED", "STORAGE_ERROR"] = "LOG_DEGRADED"


class Alert(StrictModel):
    level: Literal["INFO", "WARN", "CRITICAL"]
    code: Annotated[str, Field(min_length=1, max_length=100)]
    message: Annotated[str, Field(max_length=1000)]
    condition_status: Literal["ACTIVE", "RESOLVED", "UNKNOWN"] = "ACTIVE"


class StoredAlert(Alert):
    timestamp_iso: str


class CameraPosition(StrictModel):
    latitude: Annotated[float, Field(ge=-90, le=90)] | None = None
    longitude: Annotated[float, Field(ge=-180, le=180)] | None = None
    altitude_m: float | None = None
    altitude_reference: Literal["ELLIPSOID", "MSL", "AGL", "UNKNOWN"] = "UNKNOWN"
    heading_deg: Annotated[float, Field(ge=0, lt=360)] | None = None
    is_valid: bool = False
    last_updated_iso: str | None = None
    age_ms: Nonnegative = 0


class BoundingBox(StrictModel):
    id: str
    x: float
    y: float
    width: Annotated[float, Field(ge=0)]
    height: Annotated[float, Field(ge=0)]
    confidence: Annotated[float, Field(ge=0, le=100)]
    label: str
    track_id: int | None = None
    is_synced: bool


class ReplayMetadata(StrictModel):
    source_file: str
    source_session_id: str
    speed_multiplier: Literal[0.5, 1.0, 2.0]
    is_paused: bool
    current_record_index: Nonnegative
    total_records: Nonnegative
    progress_pct: Annotated[float, Field(ge=0, le=100)]
    position_ms: Nonnegative
    duration_ms: Nonnegative


class ReplayStartRequest(StrictModel):
    session_id: Annotated[str, Field(min_length=1, max_length=128)]
    speed: Literal[0.5, 1.0, 2.0] = 1.0


class ReplaySeekRequest(StrictModel):
    timestamp_ms: Nonnegative


class ReplaySpeedRequest(StrictModel):
    speed: Literal[0.5, 1.0, 2.0]


class Event(StrictModel):
    event_type: Literal[
        "SNAPSHOT", "TELEMETRY_UPDATE", "TARGET_UPDATE", "ALERT_EVENT",
        "LINK_STATUS", "SYSTEM_DIAGNOSTICS", "REPLAY_TICK",
    ]
    schema_version: Literal["1.0.0"] = "1.0.0"
    session_id: Annotated[str, Field(min_length=1)]
    source_mode: Literal["MOCK", "REPLAY"] = "MOCK"
    original_source_mode: Literal["REAL", "MOCK", "UNKNOWN"] = "MOCK"
    inference_device: Literal["FPGA_GW2A", "PC_REFERENCE", "SIMULATED", "UNKNOWN"] = "SIMULATED"
    sender_session_id: Annotated[int, Field(ge=1, le=4294967295)] | None = None
    ground_session_id: Annotated[int, Field(ge=1, le=65535)] | None = None
    sequence_number: Nonnegative
    pc_rx_time_iso: str
    pc_rx_monotonic_ms: Nonnegative
    device_measurement_time_ms: Nonnegative | None = None
    measurement_age_ms: Nonnegative | None = None
    rx_age_ms: Nonnegative = 0
    is_stale: bool = False
    telemetry_age_ms: Nonnegative | None = None
    target_age_ms: Nonnegative | None = None
    camera_age_ms: Nonnegative | None = None
    telemetry: Telemetry | None = None
    has_target: bool | None = None
    target: Target | None = None
    hardware_link: HardwareLink | None = None
    diagnostics: Diagnostics | None = None
    alert: Alert | None = None
    alerts: list[StoredAlert] | None = None
    camera_position: CameraPosition | None = None
    bounding_boxes: list[BoundingBox] | None = None
    replay_metadata: ReplayMetadata | None = None

    @model_validator(mode="after")
    def validate_domains(self):
        if self.source_mode == "MOCK" and self.inference_device != "SIMULATED":
            raise ValueError("MOCK acquisition requires SIMULATED inference")
        domains = {
            "TELEMETRY_UPDATE": {"telemetry", "camera_position", "bounding_boxes"},
            "TARGET_UPDATE": {"target", "has_target", "bounding_boxes"},
            "ALERT_EVENT": {"alert"},
            "LINK_STATUS": {"hardware_link"},
            "SYSTEM_DIAGNOSTICS": {"diagnostics"},
            "REPLAY_TICK": {"replay_metadata"},
        }
        all_domains = set.union(*domains.values()) | {"alerts", "replay_metadata"}
        supplied = self.model_fields_set & all_domains
        if self.event_type == "SNAPSHOT":
            required = all_domains - {"alert"}
            if not required <= supplied:
                raise ValueError("SNAPSHOT must provide all application domains")
            for value in (self.telemetry, self.target, self.hardware_link, self.diagnostics):
                if value is not None and value.model_fields_set != set(type(value).model_fields):
                    raise ValueError("SNAPSHOT nested objects must be complete")
            if self.has_target is None or self.alerts is None:
                raise ValueError("SNAPSHOT requires has_target and alerts")
        elif not supplied <= domains[self.event_type]:
            raise ValueError("Patch contains fields outside its event domain")
        if self.event_type == "REPLAY_TICK" and self.replay_metadata is None:
            raise ValueError("REPLAY_TICK requires replay_metadata")
        if self.source_mode == "REPLAY" and self.event_type == "SNAPSHOT" and self.replay_metadata is None:
            raise ValueError("REPLAY SNAPSHOT requires replay_metadata")
        if "has_target" in self.model_fields_set and self.has_target is None:
            raise ValueError("has_target cannot be null")
        if self.alerts is not None and len(self.alerts) > 50:
            raise ValueError("Alert history exceeds 50")
        return self
