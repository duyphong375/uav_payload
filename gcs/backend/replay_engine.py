"""Committed-session replay with an injectable virtual clock and no hardware I/O."""

from __future__ import annotations

import asyncio
import json
import re
import sqlite3
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Awaitable, Callable
from uuid import uuid4

try:
    from .schemas import Event
    from .state import MissionStore
except (ImportError, ValueError):
    from schemas import Event
    from state import MissionStore


_SAFE_SESSION = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
_REPLAYABLE_TYPES = {
    "SNAPSHOT", "TELEMETRY_UPDATE", "TARGET_UPDATE", "ALERT_EVENT",
    "LINK_STATUS", "SYSTEM_DIAGNOSTICS",
}
_DOMAIN_FIELDS = {
    "telemetry", "target", "has_target", "hardware_link", "diagnostics", "alert",
    "alerts", "camera_position", "bounding_boxes", "replay_metadata",
}


class ForbiddenHardwareBoundary:
    """Application boundary: replay has no reason to touch a hardware transport."""

    def open(self):
        raise AssertionError("Replay must not open hardware")

    def read(self):
        raise AssertionError("Replay must not read hardware")

    def write(self, _data):
        raise AssertionError("Replay must not write hardware")


@dataclass(frozen=True)
class ReplayRecord:
    record_id: int
    relative_ms: int
    payload: dict[str, Any]


class ReplayEngine:
    SPEEDS = {0.5, 1.0, 2.0}

    def __init__(
        self,
        hub,
        storage_dir: Path,
        *,
        clock: Callable[[], float] = time.monotonic,
        sleeper: Callable[[float], Awaitable[None]] = asyncio.sleep,
        hardware=None,
    ):
        self.hub = hub
        self.storage_dir = Path(storage_dir)
        self.clock = clock
        self.sleeper = sleeper
        self.hardware = hardware or ForbiddenHardwareBoundary()
        self.records: list[ReplayRecord] = []
        self.source_session_id: str | None = None
        self.source_file: str | None = None
        self.replay_session_id: str | None = None
        self.position_ms = 0
        self.duration_ms = 0
        self.speed = 1.0
        self.paused = True
        self.active = False
        self._next_index = 0
        self._anchor_clock = 0.0
        self._anchor_position_ms = 0
        self._last_tick_position = -1
        self._task: asyncio.Task | None = None
        self._lock = asyncio.Lock()

    @staticmethod
    def _safe_session_id(session_id: str) -> str:
        if not _SAFE_SESSION.fullmatch(session_id) or session_id in {".", ".."}:
            raise ValueError("Unsafe replay session_id")
        return session_id

    def _load_records(self, session_id: str) -> tuple[list[ReplayRecord], str]:
        safe_id = self._safe_session_id(session_id)
        path = self.storage_dir / f"{safe_id}.db"
        if not path.is_file():
            raise FileNotFoundError(f"Committed session not found: {safe_id}")
        connection = sqlite3.connect(f"{path.resolve().as_uri()}?mode=ro", uri=True)
        try:
            connection.execute("PRAGMA query_only=ON")
            rows = connection.execute(
                "SELECT record_id, pc_rx_monotonic_ms, parsed_json "
                "FROM telemetry_records WHERE session_id=? AND is_valid=1 "
                "ORDER BY pc_rx_monotonic_ms, record_id",
                (safe_id,),
            ).fetchall()
        finally:
            connection.close()
        if not rows:
            raise ValueError("Session has no committed valid records")
        base_ms = int(rows[0][1])
        records = []
        for record_id, timestamp_ms, parsed_json in rows:
            payload = json.loads(parsed_json)
            if not isinstance(payload, dict):
                raise ValueError(f"Record {record_id} parsed_json is not an object")
            if payload.get("event_type") not in _REPLAYABLE_TYPES:
                raise ValueError(f"Record {record_id} has unsupported event_type")
            if payload.get("source_mode") not in {"MOCK", "REAL"}:
                raise ValueError(f"Record {record_id} is not an acquired source event")
            records.append(ReplayRecord(int(record_id), max(0, int(timestamp_ms) - base_ms), payload))
        return records, path.name

    def _metadata(self) -> dict[str, Any]:
        total = len(self.records)
        progress = 100.0 if self.duration_ms == 0 and total else (
            0.0 if self.duration_ms == 0 else min(100.0, self.position_ms * 100.0 / self.duration_ms)
        )
        return {
            "source_file": self.source_file or "",
            "source_session_id": self.source_session_id or "",
            "speed_multiplier": self.speed,
            "is_paused": self.paused,
            "current_record_index": self._next_index,
            "total_records": total,
            "progress_pct": round(progress, 3),
            "position_ms": self.position_ms,
            "duration_ms": self.duration_ms,
        }

    def _new_replay_store(self, original_source: str, inference_device: str) -> None:
        self.position_ms = 0
        store = MissionStore(self.hub.store.settings, clock=lambda: self.position_ms / 1000.0)
        store.started = 0.0
        store.sequence = 0
        store.new_session(
            source_mode="REPLAY",
            original_source_mode=original_source,
            inference_device=inference_device,
            session_id=self.replay_session_id,
        )
        store.replay_metadata = self._metadata()
        self.hub.store = store

    def _record_payload(self, record: ReplayRecord) -> tuple[str, dict[str, Any]]:
        raw = record.payload
        event_type = raw["event_type"]
        payload = {key: raw[key] for key in _DOMAIN_FIELDS if key in raw}
        payload.update({
            "original_source_mode": raw.get("original_source_mode") or raw.get("source_mode") or "UNKNOWN",
            "inference_device": raw.get("inference_device") or "UNKNOWN",
            "sender_session_id": raw.get("sender_session_id"),
            "ground_session_id": raw.get("ground_session_id"),
            "pc_rx_time_iso": raw.get("pc_rx_time_iso"),
            "pc_rx_monotonic_ms": record.relative_ms,
            "device_measurement_time_ms": raw.get("device_measurement_time_ms"),
            "measurement_age_ms": raw.get("measurement_age_ms"),
        })
        if event_type == "SNAPSHOT":
            # Snapshot ages describe observations before the recorded snapshot.
            # Preserve them when rebasing the session onto the virtual clock.
            for key in ("rx_age_ms", "is_stale", "telemetry_age_ms", "target_age_ms", "camera_age_ms"):
                if key in raw:
                    payload[key] = raw[key]
            payload["replay_metadata"] = self._metadata()
        return event_type, payload

    def _apply_record(self, record: ReplayRecord, *, broadcast: bool) -> None:
        self.position_ms = record.relative_ms
        event_type, payload = self._record_payload(record)
        self.hub.publish(event_type, persist=False, broadcast=broadcast, **payload)

    def _broadcast_snapshot(self) -> dict[str, Any]:
        self.hub.store.replay_metadata = self._metadata()
        snapshot = self.hub.store.snapshot(self.hub.diagnostics())
        payload = {key: snapshot[key] for key in (
            "telemetry", "target", "has_target", "hardware_link", "diagnostics",
            "alerts", "camera_position", "bounding_boxes", "replay_metadata",
        )}
        return self.hub.publish("SNAPSHOT", persist=False, **payload)

    def _emit_tick(self) -> dict[str, Any]:
        metadata = self._metadata()
        self._last_tick_position = self.position_ms
        return self.hub.publish(
            "REPLAY_TICK", persist=False, replay_metadata=metadata,
        )

    def _sync_position(self) -> None:
        if self.paused:
            return
        elapsed_ms = max(0.0, (self.clock() - self._anchor_clock) * 1000.0)
        self.position_ms = min(
            self.duration_ms,
            max(0, int(round(self._anchor_position_ms + elapsed_ms * self.speed))),
        )

    def _apply_due(self, *, broadcast: bool) -> bool:
        emitted = False
        target_position = self.position_ms
        while (
            self._next_index < len(self.records)
            and self.records[self._next_index].relative_ms <= target_position
        ):
            self._apply_record(self.records[self._next_index], broadcast=broadcast)
            self._next_index += 1
            emitted = True
        self.position_ms = target_position
        return emitted

    async def start(self, session_id: str, speed: float = 1.0, *, background: bool = True) -> dict[str, Any]:
        await self.stop()
        if speed not in self.SPEEDS:
            raise ValueError("Replay speed must be 0.5, 1.0 or 2.0")
        records, filename = await asyncio.to_thread(self._load_records, session_id)
        async with self._lock:
            self.records = records
            self.source_session_id = session_id
            self.source_file = filename
            self.replay_session_id = f"SES-REPLAY-{uuid4()}"
            self.duration_ms = records[-1].relative_ms
            self.speed = float(speed)
            self.paused = False
            self.active = True
            self._next_index = 0
            self._last_tick_position = -1
            first = records[0].payload
            original = first.get("original_source_mode") or first.get("source_mode") or "UNKNOWN"
            inference = first.get("inference_device") or "UNKNOWN"
            self._new_replay_store(original, inference)
            while self._next_index < len(self.records) and self.records[self._next_index].relative_ms == 0:
                self._apply_record(self.records[self._next_index], broadcast=False)
                self._next_index += 1
            self.position_ms = 0
            self._anchor_clock = self.clock()
            self._anchor_position_ms = 0
            snapshot = self._broadcast_snapshot()
            if background:
                self._task = asyncio.create_task(self._run(), name="kvc-replay-engine")
            return snapshot

    async def advance(self, *, emit_tick: bool = True) -> dict[str, Any]:
        async with self._lock:
            if not self.active:
                raise RuntimeError("Replay is not active")
            self._sync_position()
            emitted = self._apply_due(broadcast=True)
            if self.position_ms >= self.duration_ms and self._next_index >= len(self.records):
                self.paused = True
            should_tick = emit_tick and (
                emitted or self._last_tick_position < 0
                or self.position_ms - self._last_tick_position >= 250
            )
            if should_tick:
                self._emit_tick()
            else:
                self.hub.store.replay_metadata = self._metadata()
            return self._metadata()

    async def _run(self) -> None:
        try:
            while self.active:
                await self.advance()
                await self.sleeper(0.05)
        except asyncio.CancelledError:
            raise

    async def pause(self) -> dict[str, Any]:
        async with self._lock:
            if not self.active:
                raise RuntimeError("Replay is not active")
            self._sync_position()
            self._apply_due(broadcast=True)
            self.paused = True
            self._anchor_position_ms = self.position_ms
            self._emit_tick()
            return self._metadata()

    async def resume(self) -> dict[str, Any]:
        async with self._lock:
            if not self.active:
                raise RuntimeError("Replay is not active")
            if self.position_ms >= self.duration_ms and self._next_index >= len(self.records):
                raise RuntimeError("Replay is at end; seek before resume")
            self.paused = False
            self._anchor_clock = self.clock()
            self._anchor_position_ms = self.position_ms
            self._emit_tick()
            return self._metadata()

    async def set_speed(self, speed: float) -> dict[str, Any]:
        if speed not in self.SPEEDS:
            raise ValueError("Replay speed must be 0.5, 1.0 or 2.0")
        async with self._lock:
            if not self.active:
                raise RuntimeError("Replay is not active")
            self._sync_position()
            self._apply_due(broadcast=True)
            self.speed = float(speed)
            self._anchor_clock = self.clock()
            self._anchor_position_ms = self.position_ms
            self._emit_tick()
            return self._metadata()

    async def seek(self, timestamp_ms: int) -> dict[str, Any]:
        async with self._lock:
            if not self.active:
                raise RuntimeError("Replay is not active")
            target = min(self.duration_ms, max(0, int(timestamp_ms)))
            was_paused = self.paused
            first = self.records[0].payload
            original = first.get("original_source_mode") or first.get("source_mode") or "UNKNOWN"
            inference = first.get("inference_device") or "UNKNOWN"
            self._next_index = 0
            self._new_replay_store(original, inference)
            while self._next_index < len(self.records) and self.records[self._next_index].relative_ms <= target:
                self._apply_record(self.records[self._next_index], broadcast=False)
                self._next_index += 1
            self.position_ms = target
            self.paused = was_paused
            self._anchor_clock = self.clock()
            self._anchor_position_ms = target
            self._last_tick_position = target
            self._broadcast_snapshot()
            return self._metadata()

    async def stop(self) -> None:
        task = self._task
        self._task = None
        self.active = False
        self.paused = True
        if task and task is not asyncio.current_task():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)

    async def shutdown(self) -> None:
        await self.stop()

    def status(self) -> dict[str, Any]:
        return {"active": self.active, **self._metadata()}
