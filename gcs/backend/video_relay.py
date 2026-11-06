"""IF-05: relay MJPEG từ ESP32-S3-CAM sang trình duyệt qua backend.

TẠI SAO PHẢI CÓ MODULE NÀY (và tại sao không cho trình duyệt gọi thẳng camera):

  `docs/interfaces/IF_ESP32_GCS_WS.md:44` quy định trình duyệt **tuyệt đối không
  kết nối trực tiếp vào ESP32**. Nếu cho `<img src="http://192.168.4.1:81/stream">`
  thì phạm quy tắc đó và kéo theo ba lỗi đã ghi trong
  `review/KVC-GCS-TACTICAL-UI-20261101-001/ASSESSMENT.md:148-163`:
    - thiếu CORS header -> canvas bị taint, `toDataURL` ném SecurityError;
    - trang HTTPS không tải được `http://` (mixed content);
    - `fetch()` trên MJPEG multipart không bao giờ resolve.

  Backend đóng vai client outbound, đọc multipart, và phát lại cho trình duyệt
  same-origin. Trình duyệt chỉ nói chuyện với `127.0.0.1:8000`.

GIỚI HẠN ĐÃ BIẾT:
  - KHÔNG đồng bộ clock với IF-01. BBox của FPGA và khung hình của S3-CAM là
    hai nguồn thời gian độc lập; chênh lệch 100-500 ms. Vì vậy trạng thái
    `video` luôn có `is_connected` riêng và client KHÔNG được vẽ bbox FPGA lên
    khung video ESP32 rồi coi là đồng bộ.
  - KHÔNG suy ra FPS. `frame_count` là số khung đếm được, không phải phép đo
    tần số; muốn FPS phải đo riêng.
  - Relay chết KHÔNG được làm sập luồng telemetry (LoRa). Mọi lỗi ở đây chỉ
    cập nhật `video.error_message` và `is_connected = False`.

MỘT KẾT NỐI TỚI CAMERA (fan-out nội bộ):
  - `VideoRelay._consume` giữ DUY NHẤT một kết nối tới camera, đếm khung, giữ
    trạng thái và phát mỗi khung cho mọi người xem đang đăng ký.
  - `GET /video/stream` (`main.py`) KHÔNG mở kết nối riêng: nó đăng ký một
    subscriber vào relay và nhận khung từ hàng đợi của mình.

  Trước 03/11/2026 mỗi người xem mở thêm một kết nối tới camera, nên tải lên
  thiết bị là `1 + số_người_xem` và firmware phải chia khung cho từng client.
  Đó là nguyên nhân trực tiếp của hiện tượng hình giật khi có hơn một nguồn xem.
"""

import asyncio
import logging
import time
from typing import AsyncIterator, Optional

import httpx

try:
    from .config import Settings
    from .schemas import VideoStatus
except (ImportError, ValueError):
    from config import Settings
    from schemas import VideoStatus

log = logging.getLogger("kvc.video")

STREAM_PATH = "/video/stream"

# Boundary của ESP32-CAM (`esp32-camera`/`CameraWebServer`). Giá trị này là
# TOKEN, không kèm dấu `--`: theo RFC 2046 tham số `boundary=` chỉ chứa token,
# còn dấu phân cách trên dây là `\r\n--` + token. Camera khai báo đúng dạng này,
# và ta replay nguyên byte của nó nên header phát cho trình duyệt phải khớp.
# Không tự sinh boundary khi làm client: ta không điều khiển server.
BOUNDARY = "123456789000000000000987654321"
_JPG_START = b"\xff\xd8"
_JPG_END = b"\xff\xd9"

# Trần kích thước một khung. S3-CAM VGA JPEG thường < 60 KiB; 512 KiB là mức
# chặn trên rộng rãi để phát hiện stream hỏng thay vì nuốt cả bộ nhớ.
_MAX_FRAME_BYTES = 512 * 1024

# Nhịp phát `VIDEO_STATUS` lên WebSocket. Đây là trạng thái, không phải dữ liệu
# khung: phát dày hơn mức này chỉ làm nghẽn hàng đợi của client mà không thêm
# thông tin. 1 s đủ để UI biết mất khung trong ngưỡng `video_frame_timeout_sec`.
_STATUS_INTERVAL_SEC = 1.0


def encode_part(frame: bytes) -> bytes:
    """Đóng một khung JPEG thành một part multipart đúng RFC 2046."""
    header = (
        "\r\n--" + BOUNDARY + "\r\n"
        "Content-Type: image/jpeg\r\n"
        f"Content-Length: {len(frame)}\r\n\r\n"
    ).encode("ascii")
    return header + frame


class FrameExtractor:
    """Tách khung JPEG từ luồng multipart MJPEG.

    Không dùng regexp/parse boundary đầy đủ: dữ liệu nhị phân có thể chứa
    chuỗi giống boundary. Cách an toàn hơn là bám marker SOI/EOI của JPEG,
    vốn không xuất hiện trong payload nén (0xFF phải bị escape).

    KHUNG BỊ CẮT: nếu gặp `FF D8` mới TRƯỚC `FF D9` thì khung hiện tại đã mất
    phần đuôi (Wi-Fi rớt giữa khung, client đóng đột ngột). Phải BỎ khung dở và
    bắt đầu lại từ SOI mới. Nếu không, bộ tách sẽ ghép đuôi của khung SAU vào
    đầu khung TRƯỚC và trả về một blob hỏng mà `frame_count` vẫn đếm là hợp lệ
    — đúng loại lỗi im lặng làm sai mọi số liệu đo sau này.
    """

    def __init__(self) -> None:
        self._buf = bytearray()

    def feed(self, chunk: bytes) -> list[bytes]:
        frames: list[bytes] = []
        self._buf.extend(chunk)
        while True:
            start = self._buf.find(_JPG_START)
            if start < 0:
                # Giữ 1 byte cuối: nửa đầu của marker có thể nằm ở chunk sau.
                if len(self._buf) > 1:
                    del self._buf[:-1]
                break
            if start > 0:
                del self._buf[:start]
            end = self._buf.find(_JPG_END, 2)
            if end < 0:
                if len(self._buf) > _MAX_FRAME_BYTES:
                    log.warning("MJPEG frame vuot %d byte, bo buffer", _MAX_FRAME_BYTES)
                    self._buf.clear()
                break
            nested = self._buf.find(_JPG_START, 2)
            if 0 <= nested < end:
                # Khung dở: SOI mới xuất hiện trước EOI -> bỏ phần đã hỏng.
                log.debug("Bo khung MJPEG bi cat o %d byte", nested)
                del self._buf[:nested]
                continue
            frames.append(bytes(self._buf[: end + 2]))
            del self._buf[: end + 2]
        return frames

    def reset(self) -> None:
        self._buf.clear()


class VideoRelay:
    """Đọc MJPEG outbound MỘT lần rồi phát lại cho mọi người xem.

    Camera chỉ thấy đúng một kết nối bất kể số người xem. Mỗi subscriber có
    hàng đợi riêng dung lượng 1 khung: khi hàng đợi đầy, khung CŨ bị bỏ để
    khung mới nhất đi ngay. Đây là hành vi đúng cho video quan sát trực tiếp —
    thà mất khung còn hơn trễ tích luỹ.

    `frame_count` vẫn là số khung relay NHẬN được từ camera, không phải FPS và
    không phải số khung đã gửi cho từng người xem.
    """

    def __init__(self, hub, settings: Settings, *, clock=time.monotonic):
        self.hub = hub
        self.settings = settings
        self.clock = clock
        self.task: Optional[asyncio.Task] = None
        self.frame_count = 0
        self._last_frame_at: Optional[float] = None
        self._last_error: Optional[str] = None
        self._subscribers: set[asyncio.Queue[bytes]] = set()

    # ---- fan-out tới người xem --------------------------------------
    def subscribe(self) -> asyncio.Queue[bytes]:
        """Đăng ký một người xem. Trả hàng đợi nhận khung JPEG đã tách.

        KHÔNG đẩy sẵn khung cũ vào hàng đợi: người xem mới phải chờ khung
        THẬT kế tiếp, nhờ vậy route phân biệt được "camera còn sống" với
        "camera đã ngừng nhưng còn khung cũ trong bộ nhớ".
        """
        queue: asyncio.Queue[bytes] = asyncio.Queue(maxsize=1)
        self._subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue[bytes]) -> None:
        self._subscribers.discard(queue)

    @property
    def subscriber_count(self) -> int:
        return len(self._subscribers)

    def _broadcast(self, frame: bytes) -> None:
        for queue in tuple(self._subscribers):
            if queue.full():
                # Bỏ khung cũ: người xem chậm không được làm trễ cả luồng.
                try:
                    queue.get_nowait()
                except asyncio.QueueEmpty:  # pragma: no cover - full implies not empty
                    pass
            try:
                queue.put_nowait(frame)
            except asyncio.QueueFull:  # pragma: no cover - đã làm rỗng ở trên
                pass

    # ---- trạng thái ------------------------------------------------
    @property
    def source_url(self) -> str:
        return self.settings.video_source_url

    def status(self) -> dict:
        age_ms = None
        if self._last_frame_at is not None:
            age_ms = max(0, int(round((self.clock() - self._last_frame_at) * 1000)))
        connected = (
            self.task is not None
            and not self.task.done()
            and age_ms is not None
            and age_ms <= self.settings.video_frame_timeout_sec * 1000
        )
        return VideoStatus(
            source_kind="RELAY" if self.source_url else "NONE",
            stream_path=STREAM_PATH if self.source_url else None,
            is_connected=connected,
            frame_count=self.frame_count,
            # Tuổi khung do CHÍNH relay đo trên đồng hồ của nó. `MissionStore`
            # chuyển giá trị này sang đồng hồ của store khi áp event, nên
            # `/api/video/status` và `VIDEO_STATUS` trên WS không còn lệch nhau.
            last_frame_age_ms=age_ms,
            error_message=self._last_error,
        ).model_dump()

    def _publish(self) -> None:
        try:
            self.hub.publish("VIDEO_STATUS", video=self.status())
        except Exception:  # pragma: no cover - không được để lỗi trạng thái giết relay
            log.exception("khong publish duoc VIDEO_STATUS")

    # ---- vòng đời --------------------------------------------------
    async def run(self) -> None:
        """Vòng lặp có backoff. Chỉ thoát khi bị cancel."""
        while True:
            try:
                await self._consume()
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                self._last_error = f"{type(exc).__name__}: {exc}"
                log.warning("video relay loi: %s", self._last_error)
                self._publish()
            await asyncio.sleep(self.settings.video_reconnect_sec)

    async def _consume(self) -> None:
        extractor = FrameExtractor()
        deadline = self.settings.video_frame_timeout_sec
        next_publish = self.clock()
        async with httpx.AsyncClient(timeout=httpx.Timeout(10.0, read=deadline)) as client:
            async with client.stream("GET", self.source_url) as response:
                response.raise_for_status()
                self._last_error = None
                self._publish()
                next_publish = self.clock() + _STATUS_INTERVAL_SEC
                async for chunk in response.aiter_bytes():
                    if not chunk:
                        continue
                    for frame in extractor.feed(chunk):
                        self.frame_count += 1
                        self._last_frame_at = self.clock()
                        self._broadcast(frame)
                    # Nhịp theo ĐỒNG HỒ, không theo số khung: `frame_count % 30`
                    # phụ thuộc FPS thực tế nên sẽ phát dồn khi FPS cao và im
                    # lặng khi FPS thấp — trong khi `last_frame_age_ms` cần được
                    # cập nhật đều để UI biết khung cuối cũ bao lâu.
                    if self.clock() >= next_publish:
                        self._publish()
                        next_publish = self.clock() + _STATUS_INTERVAL_SEC
        # Server đóng stream bình thường -> coi như mất kết nối, vòng ngoài sẽ nối lại.

    def start(self) -> None:
        if self.task is None or self.task.done():
            self.task = asyncio.create_task(self.run(), name="kvc-video-relay")

    async def stop(self) -> None:
        if self.task:
            self.task.cancel()
            await asyncio.gather(self.task, return_exceptions=True)
            self.task = None
        self._last_frame_at = None
        self._publish()

    async def stream_to(self, queue: asyncio.Queue[bytes]) -> AsyncIterator[bytes]:
        """Sinh các khung multipart cho MỘT người xem từ hàng đợi của họ.

        Không mở kết nối mới tới camera: mọi byte đều đến từ kết nối duy nhất
        của `_consume`. Nếu quá `video_frame_timeout_sec` không có khung mới,
        generator kết thúc để trình duyệt thấy stream đóng và kích hoạt
        `onError`/reconnect, thay vì treo im lặng trên một ảnh cũ.
        """
        timeout = self.settings.video_frame_timeout_sec
        try:
            while True:
                try:
                    frame = await asyncio.wait_for(queue.get(), timeout=timeout)
                except asyncio.TimeoutError:
                    log.warning("nguoi xem khong nhan duoc khung trong %.1f s", timeout)
                    return
                yield encode_part(frame)
        finally:
            self.unsubscribe(queue)


def build_status_when_disabled() -> dict:
    """Trạng thái khi `KVC_ENABLE_VIDEO_RELAY=0` (mặc định)."""
    return VideoStatus().model_dump()
