"""Single-event-loop state and bounded, independent client mailboxes."""

import asyncio
import copy
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from uuid import uuid4

try:
    from .config import Settings
    from .schemas import Alert, CameraPosition, Diagnostics, Event, HardwareLink, Target, Telemetry
except (ImportError, ValueError):
    from config import Settings
    from schemas import Alert, CameraPosition, Diagnostics, Event, HardwareLink, Target, Telemetry


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class MissionStore:
    def __init__(self, settings=Settings(), clock=time.monotonic):
        self.settings = settings
        self.clock = clock
        self.started = clock()
        self.sequence = 0
        self.new_session()

    def now_ms(self):
        return max(0, int(round((self.clock() - self.started) * 1000)))

    def new_session(
        self,
        *,
        source_mode="MOCK",
        original_source_mode="MOCK",
        inference_device="SIMULATED",
        session_id=None,
    ):
        self.session_id = session_id or f"SES-{source_mode}-{uuid4()}"
        self.source_mode = source_mode
        self.original_source_mode = original_source_mode
        self.inference_device = inference_device
        self.telemetry = Telemetry().model_dump()
        self.target = None
        self.camera_position = None
        self.bounding_boxes = []
        self.hardware_link = HardwareLink().model_dump()
        self.alerts = {}
        self.replay_metadata = None
        self.times = {"rx": None, "telemetry": None, "target": None, "camera": None}

    def ages(self):
        now = self.now_ms()
        age = lambda key: None if self.times[key] is None else max(0, now - self.times[key])
        rx = age("rx")
        return {
            "rx_age_ms": rx or 0,
            "is_stale": rx is None or rx > self.settings.stale_threshold_ms,
            "telemetry_age_ms": age("telemetry"),
            "target_age_ms": age("target"),
            "camera_age_ms": age("camera"),
        }

    def metadata(self, event_type):
        return {
            "event_type": event_type, "schema_version": "1.0.0",
            "session_id": self.session_id, "source_mode": self.source_mode,
            "original_source_mode": self.original_source_mode,
            "inference_device": self.inference_device,
            "sender_session_id": None, "ground_session_id": None,
            "sequence_number": self.sequence, "pc_rx_time_iso": utc_now(),
            "pc_rx_monotonic_ms": self.now_ms(), "device_measurement_time_ms": None,
            "measurement_age_ms": None, **self.ages(),
        }

    def snapshot(self, diagnostics=None):
        result = {
            **self.metadata("SNAPSHOT"), "telemetry": copy.deepcopy(self.telemetry),
            "target": copy.deepcopy(self.target), "has_target": self.target is not None,
            "hardware_link": dict(self.hardware_link),
            "diagnostics": diagnostics or Diagnostics().model_dump(),
            "alerts": list(copy.deepcopy(self.alerts).values()),
            "camera_position": copy.deepcopy(self.camera_position),
            "bounding_boxes": copy.deepcopy(self.bounding_boxes),
            "replay_metadata": copy.deepcopy(self.replay_metadata),
        }
        Event.model_validate(result)
        return result

    def apply(self, event):
        # Validate/merge on a candidate copy so a rejected event cannot partly mutate state.
        candidate = copy.copy(self)
        candidate.telemetry = copy.deepcopy(self.telemetry)
        candidate.target = copy.deepcopy(self.target)
        candidate.camera_position = copy.deepcopy(self.camera_position)
        candidate.bounding_boxes = copy.deepcopy(self.bounding_boxes)
        candidate.hardware_link = dict(self.hardware_link)
        candidate.alerts = copy.deepcopy(self.alerts)
        candidate.replay_metadata = copy.deepcopy(self.replay_metadata)
        candidate.times = dict(self.times)
        candidate._apply(event)
        self.__dict__.update(candidate.__dict__)

    def _apply(self, event):
        parsed = Event.model_validate(event)
        data = parsed.model_dump(exclude_unset=True)
        snapshot = parsed.event_type == "SNAPSHOT"
        if parsed.session_id != self.session_id and not snapshot:
            raise ValueError("A new session must begin with SNAPSHOT")
        if snapshot:
            self.session_id = parsed.session_id
            self.source_mode = parsed.source_mode
            self.original_source_mode = parsed.original_source_mode
            self.inference_device = parsed.inference_device
            self.telemetry = Telemetry().model_dump()
            self.target = None
            self.camera_position = None
            self.bounding_boxes = []
            self.hardware_link = HardwareLink().model_dump()
            self.alerts = {}
            self.replay_metadata = None
            self.times = dict.fromkeys(self.times)
        else:
            self.original_source_mode = parsed.original_source_mode
            self.inference_device = parsed.inference_device
        if "telemetry" in data:
            merged = Telemetry().model_dump() if data["telemetry"] is None else {
                **self.telemetry, **data["telemetry"],
            }
            if not merged["lidar_valid"]:
                merged["lidar_range_cm"] = None
            if not merged["imu_valid"]:
                merged["roll_deg"] = None
                merged["pitch_deg"] = None
            self.telemetry = Telemetry.model_validate(merged).model_dump()
            self.times["telemetry"] = None if data["telemetry"] is None else self.now_ms()
        if "target" in data:
            if data["target"] is None:
                self.target = None
                self.times["target"] = None
            else:
                merged = {**(self.target or Target().model_dump()), **data["target"]}
                if merged.get("class_name") not in ("person", "lifebuoy", "boat"):
                    # Fallback theo class_id; class 2 dùng tên chuẩn IF-02 là "lifebuoy".
                    merged["class_name"] = ("unknown", "person", "lifebuoy")[merged["class_id"]]
                if not merged["pos_valid"] or merged["coordinate_frame"] == "NONE":
                    for key in ("local_x_cm", "local_y_cm", "latitude", "longitude"):
                        merged[key] = None
                elif merged["coordinate_frame"] == "LOCAL_GRID":
                    merged["latitude"] = merged["longitude"] = None
                    if any(merged[key] is None for key in ("local_x_cm", "local_y_cm", "origin_id")):
                        raise ValueError("Valid LOCAL_GRID target needs coordinates and origin")
                else:
                    merged["local_x_cm"] = merged["local_y_cm"] = merged["origin_id"] = None
                    if not self.telemetry["gps_valid"] or any(merged[key] is None for key in ("latitude", "longitude")):
                        raise ValueError("Valid WGS84 target needs GNSS and coordinates")
                self.target = Target.model_validate(merged).model_dump()
                self.times["target"] = self.now_ms()
        if "camera_position" in data:
            self.camera_position = (
                None if data["camera_position"] is None
                else CameraPosition.model_validate(data["camera_position"]).model_dump()
            )
            self.times["camera"] = None if self.camera_position is None else self.now_ms()
        if "bounding_boxes" in data:
            self.bounding_boxes = copy.deepcopy(data["bounding_boxes"] or [])
        if data.get("has_target") is False:
            self.target = None
            self.times["target"] = None
        elif data.get("has_target") is True and self.target is None:
            raise ValueError("has_target=true needs a target")
        if "hardware_link" in data:
            self.hardware_link = HardwareLink.model_validate(
                HardwareLink().model_dump() if data["hardware_link"] is None else {
                    **self.hardware_link, **data["hardware_link"],
                }
            ).model_dump()
        if snapshot:
            for alert in data["alerts"]:
                self.alerts[alert["code"]] = alert
        if "alert" in data:
            if data["alert"] is None:
                self.alerts.clear()
            else:
                alert = Alert.model_validate(data["alert"]).model_dump()
                self.alerts.pop(alert["code"], None)
                self.alerts[alert["code"]] = {**alert, "timestamp_iso": parsed.pc_rx_time_iso}
                if len(self.alerts) > 50:
                    self.alerts.pop(next(iter(self.alerts)))
        if "replay_metadata" in data:
            self.replay_metadata = copy.deepcopy(data["replay_metadata"])
        if parsed.event_type in {"TELEMETRY_UPDATE", "TARGET_UPDATE"}:
            self.times["rx"] = self.now_ms()
        if snapshot:
            for key in ("telemetry", "target", "camera"):
                age = data.get(f"{key}_age_ms")
                self.times[key] = None if age is None else self.now_ms() - age
            self.times["rx"] = None if parsed.is_stale and parsed.rx_age_ms == 0 else self.now_ms() - parsed.rx_age_ms


@dataclass(eq=False)
class Subscriber:
    queue: asyncio.Queue
    stopped: asyncio.Event = field(default_factory=asyncio.Event)
    close_code: int = 1000
    high_water: int = 0


class Hub:
    def __init__(self, store, logger=None):
        self.store = store
        self.logger = logger
        self.last_log_ticket = None
        self.clients = set()
        self.client_drops = 0
        self.send_timeouts = 0
        self.events_emitted = 0
        self.queue_high_water = 0
        self.mock_errors = 0
        self.source_task = None

    def diagnostics(self):
        logger_status = self.logger.status() if self.logger else None
        logger_drops = logger_status["drops_total"] if logger_status else 0
        return Diagnostics(
            logger_drops_total=logger_drops,
            client_drops_total=self.client_drops,
            data_loss_latched=self.client_drops > 0 or logger_drops > 0,
            logger_status=logger_status["status"] if logger_status else "LOG_DEGRADED",
        ).model_dump()

    def subscribe(self):
        client = Subscriber(asyncio.Queue(maxsize=self.store.settings.queue_capacity))
        # No await between snapshot capture and registration: atomic on the owned loop.
        client.queue.put_nowait(self.store.snapshot(self.diagnostics()))
        self.clients.add(client)
        client.high_water = 1
        self.queue_high_water = max(self.queue_high_water, 1)
        return client

    def fail(self, client, timeout=False):
        if not client.stopped.is_set():
            self.client_drops += client.queue.qsize() + 1
            self.send_timeouts += int(timeout)
            client.close_code = 1008
            client.stopped.set()

    def publish(self, event_type, *, persist=True, broadcast=True, **payload):
        self.store.sequence += 1
        event = {**self.store.metadata(event_type), **payload}
        try:
            self.store.apply(event)
        except (TypeError, ValueError) as exc:
            if self.logger and persist:
                self.last_log_ticket = self.logger.enqueue(
                    event,
                    storage_session_id=self.store.session_id,
                    is_valid=False,
                    reject_reason=f"{type(exc).__name__}: {exc}",
                )
            raise
        event.update(self.store.ages())
        if event_type == "SYSTEM_DIAGNOSTICS":
            event["diagnostics"] = self.diagnostics()
        Event.model_validate(event)
        if self.logger and persist:
            # The queue operation is non-blocking. This event is only in RAM until
            # last_log_ticket resolves with committed=True after SQLite COMMIT.
            self.last_log_ticket = self.logger.enqueue(
                event, storage_session_id=self.store.session_id, is_valid=True
            )
        self.events_emitted += 1
        if broadcast:
            for client in tuple(self.clients):
                if client.stopped.is_set():
                    continue
                try:
                    client.queue.put_nowait(copy.deepcopy(event))
                    client.high_water = max(client.high_water, client.queue.qsize())
                    self.queue_high_water = max(self.queue_high_water, client.high_water)
                except asyncio.QueueFull:
                    self.fail(client)
        return event

    def rotate_session(self):
        self.store.new_session()
        snapshot = self.store.snapshot(self.diagnostics())
        payload = {key: snapshot[key] for key in (
            "telemetry", "target", "has_target", "hardware_link", "diagnostics",
            "alerts", "camera_position", "bounding_boxes", "replay_metadata",
        )}
        return self.publish("SNAPSHOT", **payload)

    def status(self):
        logger_status = self.logger.status() if self.logger else None
        return {
            **self.store.metadata("SYSTEM_DIAGNOSTICS"),
            "hardware_link": self.store.hardware_link,
            "diagnostics": self.diagnostics(),
            "storage_implemented": self.logger is not None,
            "storage_available": logger_status is not None and logger_status["status"] != "STORAGE_ERROR",
            "logger": logger_status,
            "mock_events_emitted": self.events_emitted,
            "mock_errors": self.mock_errors, "send_timeouts": self.send_timeouts,
            "clients": len(self.clients), "queue_capacity": self.store.settings.queue_capacity,
            "queue_depths": [c.queue.qsize() for c in self.clients],
            "queue_high_water": self.queue_high_water, "alerts_count": len(self.store.alerts),
            "source_task_running": self.source_task is not None and not self.source_task.done(),
        }
