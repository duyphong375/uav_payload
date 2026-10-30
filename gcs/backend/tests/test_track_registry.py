"""Tests for the GCS-side track registry (stable track_id without IF-02 changes)."""

import pytest

from track_registry import TRACK_MATCH_RADIUS_CM, TRACK_TTL_MS, TrackRegistry


def _local(reg: TrackRegistry, now_ms: int, x: float, y: float, class_id: int = 1) -> int:
    return reg.resolve(
        now_ms=now_ms,
        class_id=class_id,
        frame="LOCAL_GRID",
        x_cm=x,
        y_cm=y,
    )


def test_same_position_within_ttl_keeps_track_id():
    reg = TrackRegistry()
    first = _local(reg, 1000, 100.0, 200.0)
    second = _local(reg, 3000, 120.0, 210.0)
    third = _local(reg, 5000, 140.0, 220.0)
    assert first == second == third


def test_jump_beyond_radius_allocates_new_track():
    reg = TrackRegistry()
    first = _local(reg, 1000, 100.0, 200.0)
    second = _local(reg, 2000, 100.0 + TRACK_MATCH_RADIUS_CM + 50.0, 200.0)
    assert first != second


def test_expired_track_allocates_new_id():
    reg = TrackRegistry()
    first = _local(reg, 1000, 100.0, 200.0)
    second = _local(reg, 1000 + TRACK_TTL_MS + 1, 100.0, 200.0)
    assert first != second


def test_different_class_does_not_merge():
    reg = TrackRegistry()
    person = _local(reg, 1000, 100.0, 200.0, class_id=1)
    buoy = _local(reg, 1500, 100.0, 200.0, class_id=2)
    assert person != buoy


def test_position_invalid_allocates_fresh_id_without_guessing():
    reg = TrackRegistry()
    first = _local(reg, 1000, 100.0, 200.0)
    second = reg.resolve(now_ms=1500, class_id=1, frame="NONE", position_valid=False)
    assert first != second


def test_wgs84_matching_uses_metres_converted_to_cm():
    reg = TrackRegistry()
    a = reg.resolve(now_ms=1000, class_id=1, frame="WGS84", lat=16.0, lon=108.0)
    # ~55 m north: outside the 200 cm gate, so a new track is expected.
    b = reg.resolve(now_ms=2000, class_id=1, frame="WGS84", lat=16.0005, lon=108.0)
    assert a != b
    # ~0.5 m: inside the gate.
    c = reg.resolve(now_ms=1000, class_id=1, frame="WGS84", lat=16.0, lon=108.0)
    d = reg.resolve(now_ms=2000, class_id=1, frame="WGS84", lat=16.0000045, lon=108.0)
    assert c == d


def test_ids_stay_within_schema_bounds():
    reg = TrackRegistry()
    ids = [_local(reg, 1000 + i, 1000.0 * i, 0.0) for i in range(50)]
    assert all(1 <= tid <= 65535 for tid in ids)
    assert len(set(ids)) == len(ids)


def test_last_known_returns_recorded_position():
    reg = TrackRegistry()
    tid = _local(reg, 1000, 150.0, 250.0)
    info = reg.last_known(tid)
    assert info is not None
    assert info["track_id"] == tid
    assert info["local_x_cm"] == pytest.approx(150.0)
    assert info["local_y_cm"] == pytest.approx(250.0)


def test_reset_clears_state():
    reg = TrackRegistry()
    tid = _local(reg, 1000, 10.0, 10.0)
    reg.reset()
    assert reg.last_known(tid) is None
    assert reg.live_tracks(1000) == []
