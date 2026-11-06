"""IF-05 — relay video không được phá luồng telemetry.

Trọng tâm kiểm thử, theo đúng thứ tự rủi ro:

  1. `FrameExtractor` tách đúng khung JPEG từ multipart, kể cả khi khung bị
     chia cắt giữa hai chunk (điều luôn xảy ra với TCP).
  2. Relay lỗi/không có camera -> telemetry VẪN publish được. Đây là tính
     chất sống còn: LoRa là kênh chính, video là kênh phụ.
  3. Route `/video/stream` trả 503 khi tắt relay, không treo.
  4. `video` được reset về NONE khi rotate session; SNAPSHOT cũ không có
     trường `video` vẫn validate được (replay bản ghi cũ).
  5. `last_frame_age_ms` là MỘT nguồn duy nhất: relay đo, store neo lại, nên
     `/api/video/status` và `VIDEO_STATUS`/`SNAPSHOT` không lệch nhau.
  6. Camera giả chạy dài + reconnect thật qua TCP loopback.
"""

import asyncio

import httpx
import pytest
from fastapi.testclient import TestClient

from gcs.backend.config import Settings
from gcs.backend.main import STREAM_PATH, create_app
from gcs.backend.schemas import Event
from gcs.backend.state import Hub, MissionStore
from gcs.backend.video_relay import BOUNDARY, FrameExtractor, VideoRelay, build_status_when_disabled


JPEG_A = b"\xff\xd8" + b"\x01\x02\x03" * 10 + b"\xff\xd9"
JPEG_B = b"\xff\xd8" + b"\x04\x05\x06" * 5 + b"\xff\xd9"


def multipart(*frames):
    body = bytearray()
    for frame in frames:
        body += b"--" + BOUNDARY.encode() + b"\r\n"
        body += b"Content-Type: image/jpeg\r\n"
        body += f"Content-Length: {len(frame)}\r\n\r\n".encode()
        body += frame
        body += b"\r\n"
    return bytes(body)


# ---------------------------------------------------------------- extractor
def test_extractor_returns_each_frame():
    extractor = FrameExtractor()
    frames = extractor.feed(multipart(JPEG_A, JPEG_B))
    assert frames == [JPEG_A, JPEG_B]


def test_extractor_handles_frame_split_across_chunks():
    """TCP chia khung tuỳ ý. Marker SOI/EOI có thể nằm ở hai chunk khác nhau."""
    payload = multipart(JPEG_A, JPEG_B)
    extractor = FrameExtractor()
    collected = []
    for index in range(0, len(payload), 7):
        collected.extend(extractor.feed(payload[index:index + 7]))
    assert collected == [JPEG_A, JPEG_B]


def test_extractor_discards_garbage_and_keeps_sync():
    extractor = FrameExtractor()
    extractor.feed(b"noise without marker")
    frames = extractor.feed(multipart(JPEG_A))
    assert frames == [JPEG_A]


# ---------------------------------------------------------------- status
def test_status_reports_none_when_no_source():
    status = build_status_when_disabled()
    assert status["source_kind"] == "NONE"
    assert status["is_connected"] is False
    assert status["frame_count"] == 0
    assert status["stream_path"] is None


def test_extractor_discards_truncated_frame():
    """Khung mất EOI phải bị bỏ, không được ghép với khung sau thành blob hỏng."""
    extractor = FrameExtractor()
    truncated = b"\xff\xd8" + b"PARTIAL" * 10      # không có EOI
    assert extractor.feed(truncated) == []

    # Khung kế tiếp phải được nhận nguyên vẹn, không dính phần header cũ.
    frames = extractor.feed(multipart(JPEG_B))
    assert frames == [JPEG_B]


def test_extractor_survives_oversize_buffer():
    """Buffer vượt trần phải bị xoá thay vì nuốt hết bộ nhớ."""
    extractor = FrameExtractor()
    extractor.feed(b"\xff\xd8" + b"\x00" * (600 * 1024))
    # Sau khi xoá, khung mới vẫn phải tách được.
    assert extractor.feed(multipart(JPEG_A)) == [JPEG_A]


def test_relay_status_disconnected_before_any_frame():
    settings = Settings(enable_video_relay=True, video_source_url="http://127.0.0.1:1/stream")
    relay = VideoRelay(Hub(MissionStore(settings)), settings)
    status = relay.status()
    assert status["source_kind"] == "RELAY"
    assert status["is_connected"] is False
    assert status["frame_count"] == 0
    # Chưa từng có khung -> tuổi là null, không phải 0 (0 nghĩa là vừa có khung).
    assert status["last_frame_age_ms"] is None


def test_relay_status_reports_measured_frame_age():
    """`last_frame_age_ms` do relay đo trên đồng hồ của nó, không bịa `None`."""

    async def run():
        now = [100.0]
        settings = Settings(enable_video_relay=True, video_source_url="http://127.0.0.1:1/stream")
        hub = Hub(MissionStore(settings))
        relay = VideoRelay(hub, settings, clock=lambda: now[0])
        relay.task = asyncio.get_running_loop().create_future()  # task "đang chạy"
        relay._last_frame_at = 100.0
        assert relay.status()["last_frame_age_ms"] == 0
        now[0] = 101.25
        assert relay.status()["last_frame_age_ms"] == 1250
        assert relay.status()["is_connected"] is True

    asyncio.run(run())


def test_frame_age_published_reaches_store_with_reported_value():
    """Relay publish tuổi 1200 ms -> store neo lại, `video_with_age()` trả 1200."""

    async def run():
        now = [200.0]
        settings = Settings(enable_video_relay=True, video_source_url="http://127.0.0.1:1/stream")
        store = MissionStore(settings, clock=lambda: now[0])
        hub = Hub(store)
        relay = VideoRelay(hub, settings, clock=lambda: now[0])
        relay.task = asyncio.get_running_loop().create_future()
        # Store đã chạy 5 s trước khi có khung đầu.
        now[0] += 5.0
        # Relay vừa thấy khung cách đây 1200 ms (đồng hồ của relay).
        relay._last_frame_at = now[0] - 1.2
        relay.frame_count = 7
        relay._publish()

        assert store.video["last_frame_age_ms"] == 1200
        assert store.video_with_age()["last_frame_age_ms"] == 1200
        assert store.video["frame_count"] == 7

        # 400 ms sau, tuổi phải già thêm đúng 400 ms — không reset về 0.
        now[0] += 0.4
        assert store.video_with_age()["last_frame_age_ms"] == 1600

    asyncio.run(run())


def test_frame_age_null_when_no_frame_reported():
    hub = Hub(MissionStore(Settings(enable_mock=False, storage_dir=None)))
    hub.publish("VIDEO_STATUS", video={"source_kind": "RELAY", "is_connected": False, "frame_count": 0})
    assert hub.store.video["last_frame_age_ms"] is None
    assert hub.store.video_with_age()["last_frame_age_ms"] is None


# ---------------------------------------------------------------- isolation
def test_video_failure_does_not_block_telemetry():
    """Kênh phụ hỏng KHÔNG được làm hỏng kênh chính (LoRa)."""

    async def run():
        settings = Settings(enable_video_relay=True, video_source_url="http://127.0.0.1:1/stream")
        hub = Hub(MissionStore(settings))
        relay = VideoRelay(hub, settings)
        # Không start() task: mô phỏng relay chưa từng kết nối được.
        hub.publish("TELEMETRY_UPDATE", telemetry={"battery_pct": 77, "gps_valid": True})
        assert hub.store.telemetry["battery_pct"] == 77
        assert hub.store.video["is_connected"] is False
        assert relay.status()["is_connected"] is False

    asyncio.run(run())


def test_relay_unreachable_keeps_publishing_status():
    """relay trỏ cổng đóng -> task kết thúc bằng lỗi, không ném ra ngoài."""

    async def run():
        settings = Settings(
            enable_video_relay=True,
            video_source_url="http://127.0.0.1:9/never",
            video_reconnect_sec=0.01,
        )
        hub = Hub(MissionStore(settings))
        relay = VideoRelay(hub, settings)
        relay.start()
        await asyncio.sleep(0.05)
        status = relay.status()
        assert status["is_connected"] is False
        # Relay còn sống (vòng backoff), không chết hẳn vì một lần lỗi.
        assert relay.task is not None and not relay.task.done()
        await relay.stop()

    asyncio.run(run())


# ---------------------------------------------------------------- routes
def test_stream_route_returns_503_when_relay_disabled():
    app = create_app(Settings(enable_mock=False, storage_dir=None))
    with TestClient(app) as client:
        response = client.get(STREAM_PATH)
        assert response.status_code == 503
        assert "disabled" in response.json()["detail"].lower()


def test_video_status_route_when_disabled():
    app = create_app(Settings(enable_mock=False, storage_dir=None))
    with TestClient(app) as client:
        body = client.get("/api/video/status").json()
        assert body["source_kind"] == "NONE"
        assert body["is_connected"] is False


def test_snapshot_contains_video_domain():
    app = create_app(Settings(enable_mock=False, storage_dir=None))
    with TestClient(app) as client:
        snapshot = client.get("/api/state/snapshot").json()
        assert "video" in snapshot
        assert snapshot["video"]["source_kind"] == "NONE"
        # SNAPSHOT vẫn phải qua được schema (đây là chỗ dễ vỡ nhất khi thêm domain).
        Event.model_validate(snapshot)


def test_rotate_session_resets_video():
    hub = Hub(MissionStore(Settings(enable_mock=False, storage_dir=None)))
    hub.publish("VIDEO_STATUS", video={"source_kind": "RELAY", "is_connected": True, "frame_count": 120})
    assert hub.store.video["frame_count"] == 120
    hub.rotate_session()
    assert hub.store.video["source_kind"] == "NONE"
    assert hub.store.video["frame_count"] == 0


def test_old_snapshot_without_video_still_validates():
    """Bản ghi replay cũ không có `video`; thêm domain mới không được phá chúng."""
    hub = Hub(MissionStore(Settings(enable_mock=False, storage_dir=None)))
    payload = hub.store.snapshot(hub.diagnostics())
    payload.pop("video")
    Event.model_validate(payload)


def test_settings_rejects_relay_without_url():
    with pytest.raises(ValueError):
        Settings(enable_video_relay=True, video_source_url="")


# ------------------------------------------------- end-to-end với camera giả
async def _serve_fake_camera(frames, ready, *, repeat=False, delay=0.0, connections=None):
    """HTTP server tối giản phát MJPEG multipart, mô phỏng ESP32-S3-CAM.

    `repeat=True` giữ kết nối mở và phát lại danh sách khung (mô phỏng camera
    chạy dài); mặc định đóng kết nối sau khi gửi hết để kiểm reconnect.

    `connections` là list tuỳ chọn: mỗi kết nối TCP được chấp nhận sẽ được đếm
    vào đây, dùng để chứng minh relay chỉ mở MỘT kết nối tới camera.
    """

    async def handle(reader, writer):
        if connections is not None:
            connections.append(1)
        try:
            await reader.readuntil(b"\r\n\r\n")
            writer.write(
                b"HTTP/1.1 200 OK\r\n"
                b"Content-Type: multipart/x-mixed-replace; boundary="
                + BOUNDARY.encode()
                + b"\r\n"
                b"Connection: close\r\n\r\n"
            )
            while True:
                for frame in frames:
                    writer.write(
                        b"--" + BOUNDARY.encode() + b"\r\n"
                        b"Content-Type: image/jpeg\r\n"
                        + f"Content-Length: {len(frame)}\r\n\r\n".encode()
                        + frame
                        + b"\r\n"
                    )
                await writer.drain()
                if ready is not None:
                    ready.set()
                if not repeat:
                    break
                if delay:
                    await asyncio.sleep(delay)
        except (ConnectionResetError, asyncio.IncompleteReadError):
            pass
        finally:
            writer.close()

    server = await asyncio.start_server(handle, "127.0.0.1", 0)
    port = server.sockets[0].getsockname()[1]
    return server, port


def test_relay_counts_real_frames_from_mjpeg_server():
    """Đường `_consume()` thật: nối tới server MJPEG, đếm khung, publish status."""

    async def run():
        ready = asyncio.Event()
        server, port = await _serve_fake_camera([JPEG_A, JPEG_B, JPEG_A], ready)
        settings = Settings(
            enable_video_relay=True,
            video_source_url=f"http://127.0.0.1:{port}/stream",
            video_reconnect_sec=0.01,
        )
        hub = Hub(MissionStore(settings))
        relay = VideoRelay(hub, settings)
        try:
            relay.start()
            await asyncio.wait_for(ready.wait(), timeout=5.0)
            # Chờ relay đọc hết 3 khung.
            for _ in range(100):
                if relay.frame_count >= 3:
                    break
                await asyncio.sleep(0.01)
            assert relay.frame_count == 3
            assert hub.store.video["source_kind"] == "RELAY"
        finally:
            await relay.stop()
            server.close()
            await server.wait_closed()

    asyncio.run(run())


def test_relay_survives_long_stream_and_reports_connected():
    """Camera giả phát liên tục: relay đếm tăng đều, `is_connected` giữ true."""

    async def run():
        ready = asyncio.Event()
        server, port = await _serve_fake_camera([JPEG_A, JPEG_B], ready, repeat=True, delay=0.005)
        settings = Settings(
            enable_video_relay=True,
            video_source_url=f"http://127.0.0.1:{port}/stream",
            video_reconnect_sec=0.01,
        )
        hub = Hub(MissionStore(settings))
        relay = VideoRelay(hub, settings)
        try:
            relay.start()
            await asyncio.wait_for(ready.wait(), timeout=5.0)
            first = None
            for _ in range(200):
                if relay.frame_count >= 10:
                    first = relay.frame_count
                    break
                await asyncio.sleep(0.01)
            assert first is not None, "relay chưa nhận đủ 10 khung"
            deadline = asyncio.get_running_loop().time() + 3.0
            while relay.frame_count < first + 40:
                assert asyncio.get_running_loop().time() < deadline, "relay ngừng đếm khung"
                await asyncio.sleep(0.01)
            status = relay.status()
            assert status["is_connected"] is True
            assert status["frame_count"] >= first + 40
            assert status["last_frame_age_ms"] is not None
            assert status["last_frame_age_ms"] <= settings.video_frame_timeout_sec * 1000
            # Cùng một nguồn tuổi: `VIDEO_STATUS` mang đúng con số relay đo được,
            # không phải `None` như bản cũ, và store không tự đặt tuổi = 0.
            deadline = asyncio.get_running_loop().time() + 3.0
            while hub.store.video["last_frame_age_ms"] is None:
                assert asyncio.get_running_loop().time() < deadline, "không có VIDEO_STATUS mang tuổi khung"
                await asyncio.sleep(0.02)
            stored = hub.store.video["last_frame_age_ms"]
            assert 0 <= stored <= settings.video_frame_timeout_sec * 1000
            # `video_with_age()` chỉ cộng thêm thời gian trôi qua kể từ lần publish,
            # nên không được lớn hơn ngưỡng timeout sau vài chục ms.
            assert hub.store.video_with_age()["last_frame_age_ms"] <= (
                settings.video_frame_timeout_sec * 1000
            )
        finally:
            await relay.stop()
            server.close()
            await server.wait_closed()

    asyncio.run(run())


def test_relay_reconnects_after_camera_closes_stream():
    """Camera đóng kết nối -> vòng backoff nối lại và đếm tiếp, không chết."""

    async def run():
        closed = asyncio.Event()
        server, port = await _serve_fake_camera([JPEG_A], closed)
        settings = Settings(
            enable_video_relay=True,
            video_source_url=f"http://127.0.0.1:{port}/stream",
            video_reconnect_sec=0.01,
        )
        hub = Hub(MissionStore(settings))
        relay = VideoRelay(hub, settings)
        try:
            relay.start()
            await asyncio.wait_for(closed.wait(), timeout=5.0)
            # Server đóng sau mỗi kết nối, nên số khung phải tăng qua nhiều vòng.
            deadline = asyncio.get_running_loop().time() + 5.0
            while relay.frame_count < 3:
                assert asyncio.get_running_loop().time() < deadline, "relay không reconnect"
                await asyncio.sleep(0.02)
            assert relay.task is not None and not relay.task.done()
        finally:
            await relay.stop()
            server.close()
            await server.wait_closed()

    asyncio.run(run())


# ------------------------------------------------- fan-out: một kết nối duy nhất
def test_multiple_subscribers_share_one_upstream_connection():
    """Nhiều người xem KHÔNG được làm camera mở thêm kết nối.

    Trước 03/11/2026 mỗi `/video/stream` mở một HTTP client riêng tới camera,
    nên tải là `1 + số_người_xem`. Test này đếm kết nối TCP thật ở camera giả.
    """

    async def run():
        ready = asyncio.Event()
        connections: list[int] = []
        server, port = await _serve_fake_camera(
            [JPEG_A, JPEG_B], ready, repeat=True, delay=0.005, connections=connections
        )
        settings = Settings(
            enable_video_relay=True,
            video_source_url=f"http://127.0.0.1:{port}/stream",
            video_reconnect_sec=0.01,
        )
        hub = Hub(MissionStore(settings))
        relay = VideoRelay(hub, settings)
        viewers = [relay.subscribe() for _ in range(3)]
        try:
            relay.start()
            await asyncio.wait_for(ready.wait(), timeout=5.0)
            for _ in range(200):
                if all(not q.empty() for q in viewers):
                    break
                await asyncio.sleep(0.01)
            assert relay.subscriber_count == 3
            # Cả ba người xem đều nhận được khung, và chỉ có MỘT kết nối upstream.
            assert all(not q.empty() for q in viewers), "subscriber không nhận được khung"
            assert len(connections) == 1, f"camera nhận {len(connections)} kết nối, phải là 1"
        finally:
            for queue in viewers:
                relay.unsubscribe(queue)
            await relay.stop()
            server.close()
            await server.wait_closed()

    asyncio.run(run())


def test_slow_subscriber_drops_old_frames_instead_of_delaying():
    """Hàng đợi mỗi người xem giữ 1 khung: khung cũ bị bỏ, không trễ tích luỹ."""

    async def run():
        ready = asyncio.Event()
        server, port = await _serve_fake_camera([JPEG_A], ready, repeat=True, delay=0.001)
        settings = Settings(
            enable_video_relay=True,
            video_source_url=f"http://127.0.0.1:{port}/stream",
            video_reconnect_sec=0.01,
        )
        hub = Hub(MissionStore(settings))
        relay = VideoRelay(hub, settings)
        queue = relay.subscribe()
        try:
            relay.start()
            await asyncio.wait_for(ready.wait(), timeout=5.0)
            for _ in range(300):
                if relay.frame_count >= 5:
                    break
                await asyncio.sleep(0.01)
            assert relay.frame_count >= 5
            # Người xem không đọc: hàng đợi phải kẹp ở 1, không phình theo số khung.
            assert queue.qsize() == 1
        finally:
            relay.unsubscribe(queue)
            await relay.stop()
            server.close()
            await server.wait_closed()

    asyncio.run(run())


def test_stream_route_serves_frames_from_relay_without_new_upstream():
    """Route `/video/stream` lấy khung từ relay, không mở client mới tới camera.

    Dùng relay giả có hàng đợi đã có sẵn một khung và kết thúc sau khung đó, để
    response hữu hạn. Nếu route còn tự mở HTTP client tới camera (bản cũ), nó
    sẽ bỏ qua relay này và test không thấy khung.
    """

    class _FakeRelay:
        def __init__(self):
            self.subscribed = 0
            self.unsubscribed = 0
            self._queue: asyncio.Queue[bytes] = asyncio.Queue()
            self._queue.put_nowait(JPEG_A)

        def subscribe(self):
            self.subscribed += 1
            return self._queue

        def unsubscribe(self, queue):
            self.unsubscribed += 1

        async def stream_to(self, queue):
            try:
                return
                yield  # pragma: no cover - generator rỗng
            finally:
                self.unsubscribe(queue)

    app = create_app(Settings(enable_video_relay=True, video_source_url="http://127.0.0.1:9/never",
                              enable_mock=False, storage_dir=None))
    fake = _FakeRelay()
    with TestClient(app) as client:
        app.state.video_relay = fake
        response = client.get(STREAM_PATH)
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("multipart/x-mixed-replace")
        assert JPEG_A in response.content
        assert fake.subscribed == 1
        assert fake.unsubscribed == 1

    """Camera không tồn tại -> `is_connected` false, `error_message` có nội dung."""

    async def run():
        settings = Settings(
            enable_video_relay=True,
            video_source_url="http://127.0.0.1:9/never",
            video_reconnect_sec=0.01,
        )
        hub = Hub(MissionStore(settings))
        relay = VideoRelay(hub, settings)
        relay.start()
        try:
            deadline = asyncio.get_running_loop().time() + 5.0
            while relay.status()["error_message"] is None:
                assert asyncio.get_running_loop().time() < deadline, "relay không báo lỗi kết nối"
                await asyncio.sleep(0.02)
            status = relay.status()
            assert status["is_connected"] is False
            assert status["last_frame_age_ms"] is None
            # Trạng thái lỗi cũng đi vào store để UI thấy lý do, không chỉ log.
            assert hub.store.video["error_message"] is not None
        finally:
            await relay.stop()

    asyncio.run(run())

