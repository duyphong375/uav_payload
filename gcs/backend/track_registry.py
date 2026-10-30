"""Track registry on the GCS side.

The IF-02 telemetry frame carries exactly one target per packet and no stable
track identifier: the FPGA BBox item (IF-01) has no `track_id` field, so the
MCU cannot forward one. `esp32_ingress` used to derive `track_id` from
`seq_num`, which changes on every packet and makes the UI spawn a new marker
for the same victim each second.

This module assigns a *stable local* track id by nearest-neighbour matching in
time and space. It never invents a position: a candidate is only matched when
the previous observation carried a usable position in the same frame.

Scope: GCS-only. No change to IF-02 layout, CRC or bit meanings.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

TRACK_MATCH_RADIUS_CM = 200.0
TRACK_TTL_MS = 5000
TRACK_ID_MIN = 1000
TRACK_ID_MAX = 65535


@dataclass
class _Track:
    track_id: int
    class_id: int
    frame: str
    x_cm: float | None
    y_cm: float | None
    lat: float | None
    lon: float | None
    last_seen_ms: int


@dataclass
class TrackRegistry:
    """Nearest-neighbour track id assignment for single-target packets."""

    match_radius_cm: float = TRACK_MATCH_RADIUS_CM
    ttl_ms: int = TRACK_TTL_MS
    _tracks: dict[int, _Track] = field(default_factory=dict)
    _next_id: int = TRACK_ID_MIN

    def reset(self) -> None:
        self._tracks.clear()
        self._next_id = TRACK_ID_MIN

    def _allocate(self) -> int:
        # Skip ids still held by a live track so a reuse cannot alias two victims.
        for _ in range(TRACK_ID_MAX - TRACK_ID_MIN + 1):
            candidate = self._next_id
            self._next_id = TRACK_ID_MIN if candidate >= TRACK_ID_MAX else candidate + 1
            if candidate not in self._tracks:
                return candidate
        self._tracks.clear()
        self._next_id = TRACK_ID_MIN
        return TRACK_ID_MIN

    def _expire(self, now_ms: int) -> None:
        stale = [tid for tid, tr in self._tracks.items() if now_ms - tr.last_seen_ms > self.ttl_ms]
        for tid in stale:
            del self._tracks[tid]

    @staticmethod
    def _distance_cm(a: _Track, frame: str, x_cm: float | None, y_cm: float | None,
                     lat: float | None, lon: float | None) -> float | None:
        if frame != a.frame:
            return None
        if frame == "LOCAL_GRID":
            if a.x_cm is None or a.y_cm is None or x_cm is None or y_cm is None:
                return None
            return math.hypot(x_cm - a.x_cm, y_cm - a.y_cm)
        if frame == "WGS84":
            if a.lat is None or a.lon is None or lat is None or lon is None:
                return None
            # Metres between two WGS-84 points, converted to centimetres.
            r = 6371_000.0
            p1 = math.radians(a.lat)
            p2 = math.radians(lat)
            dp = p2 - p1
            dl = math.radians(lon - a.lon)
            h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
            metres = 2 * r * math.atan2(math.sqrt(h), math.sqrt(1 - h))
            return metres * 100.0
        return None

    def resolve(
        self,
        *,
        now_ms: int,
        class_id: int,
        frame: str,
        x_cm: float | None = None,
        y_cm: float | None = None,
        lat: float | None = None,
        lon: float | None = None,
        position_valid: bool = True,
    ) -> int:
        """Return the stable track id for this observation.

        Without a usable position the tracker cannot bind the observation to a
        known victim, so it allocates a fresh id instead of guessing.
        """
        self._expire(now_ms)

        if position_valid:
            best_id: int | None = None
            best_dist = float("inf")
            for tid, tr in self._tracks.items():
                if tr.class_id != class_id:
                    continue
                dist = self._distance_cm(tr, frame, x_cm, y_cm, lat, lon)
                if dist is None or dist > self.match_radius_cm:
                    continue
                if dist < best_dist:
                    best_dist = dist
                    best_id = tid
            if best_id is not None:
                tr = self._tracks[best_id]
                tr.x_cm = x_cm
                tr.y_cm = y_cm
                tr.lat = lat
                tr.lon = lon
                tr.last_seen_ms = now_ms
                return best_id

        track_id = self._allocate()
        self._tracks[track_id] = _Track(
            track_id=track_id,
            class_id=class_id,
            frame=frame,
            x_cm=x_cm,
            y_cm=y_cm,
            lat=lat,
            lon=lon,
            last_seen_ms=now_ms,
        )
        return track_id

    def last_known(self, track_id: int) -> dict[str, Any] | None:
        tr = self._tracks.get(track_id)
        if tr is None:
            return None
        return {
            "track_id": tr.track_id,
            "class_id": tr.class_id,
            "coordinate_frame": tr.frame,
            "local_x_cm": tr.x_cm,
            "local_y_cm": tr.y_cm,
            "latitude": tr.lat,
            "longitude": tr.lon,
            "last_seen_ms": tr.last_seen_ms,
        }

    def live_tracks(self, now_ms: int) -> list[int]:
        self._expire(now_ms)
        return sorted(self._tracks)


_default_registry = TrackRegistry()


def get_track_registry() -> TrackRegistry:
    return _default_registry


def reset_track_registry() -> None:
    _default_registry.reset()
