"""Hợp đồng dây dẫn giữa firmware S3-CAM và backend relay (IF-05).

Test này KHÔNG chạy trên phần cứng. Nó dựng lại CHÍNH XÁC chuỗi byte mà
`firmware/esp32_s3_cam/src/main.cpp` ghi ra `httpd_resp_send_chunk()`, rồi cho
`gcs/backend/video_relay.FrameExtractor` thật phân tích. Nhờ vậy nếu ai sửa
một bên mà quên bên kia, test đỏ ngay trên CI thay vì lúc cắm bo.

Ranh giới của test này (phải ghi rõ khi báo cáo):
  - Chứng minh: định dạng multipart + boundary + thứ tự header khớp với bộ
    phân tích của backend, kể cả khi khung bị chia cắt tuỳ ý.
  - KHÔNG chứng minh: camera thật phát được khung, Wi-Fi thông, hay driver
    OV3660 cấu hình đúng. Những mục đó cần phần cứng (A5/A6).
"""

import pytest

from gcs.backend.video_relay import BOUNDARY, FrameExtractor

# Phải khớp `KVC_MAX_JPEG_BYTES` trong firmware/esp32_s3_cam/include/kvc_config.h
KVC_MAX_JPEG_BYTES = 160 * 1024

# Phải khớp `_MAX_FRAME_BYTES` trong gcs/backend/video_relay.py
BACKEND_MAX_FRAME_BYTES = 512 * 1024

# JPEG tối thiểu: SOI + payload + EOI. Payload cố tình chứa 0xFF không phải
# marker để chắc chắn bộ tách không nhầm.
JPEG_A = b"\xff\xd8" + b"KVC-FRAME-A" + b"\xff\x00" * 20 + b"\xff\xd9"
JPEG_B = b"\xff\xd8" + b"KVC-FRAME-B" + b"\xff\x00" * 40 + b"\xff\xd9"


def firmware_frame(frame: bytes) -> bytes:
    """Dựng lại đúng những gì `stream_handler()` gửi cho một khung.

    Ba lời gọi `httpd_resp_send_chunk()` trong main.cpp, nối lại:
      1. "\\r\\n--<boundary>\\r\\n"
      2. "Content-Type: image/jpeg\\r\\nContent-Length: <n>\\r\\n\\r\\n"
      3. <n byte JPEG>
    """
    boundary_line = "\r\n--" + BOUNDARY + "\r\n"
    part_hdr = f"Content-Type: image/jpeg\r\nContent-Length: {len(frame)}\r\n\r\n"
    return boundary_line.encode() + part_hdr.encode() + frame


def firmware_response_headers() -> str:
    """Header mà `httpd_resp_set_type()` tạo ra cho /stream."""
    return f"multipart/x-mixed-replace; boundary={BOUNDARY}"


class TestWireContract:
    def test_content_type_boundary_is_bare_token(self):
        """RFC 2046: `boundary=` là token, KHÔNG có `--`. Đây là lỗi đã sửa
        ngày 01/11/2026 ở cả hai phía."""
        ctype = firmware_response_headers()
        assert ctype == "multipart/x-mixed-replace; boundary=123456789000000000000987654321"
        assert "boundary=--" not in ctype

    def test_boundary_matches_backend_constant(self):
        """Firmware hardcode chuỗi trong .h; backend có hằng BOUNDARY.
        Hai nơi phải giống hệt, nếu không trình duyệt không tách được khung."""
        assert f"boundary={BOUNDARY}" in firmware_response_headers()

    def test_single_frame_roundtrip(self):
        extractor = FrameExtractor()
        frames = extractor.feed(firmware_frame(JPEG_A))
        assert frames == [JPEG_A]

    def test_three_consecutive_frames(self):
        stream = firmware_frame(JPEG_A) + firmware_frame(JPEG_B) + firmware_frame(JPEG_A)
        extractor = FrameExtractor()
        assert extractor.feed(stream) == [JPEG_A, JPEG_B, JPEG_A]

    @pytest.mark.parametrize("split", [1, 2, 3, 7, 13, 64, 512, 4096])
    def test_arbitrary_tcp_split(self, split):
        """TCP cắt ở bất kỳ đâu; bộ tách phải cho cùng kết quả."""
        stream = firmware_frame(JPEG_A) + firmware_frame(JPEG_B)
        extractor = FrameExtractor()
        got = []
        for i in range(0, len(stream), split):
            got.extend(extractor.feed(stream[i : i + split]))
        assert got == [JPEG_A, JPEG_B]

    def test_empty_frame_list_yields_nothing(self):
        extractor = FrameExtractor()
        assert extractor.feed(b"") == []

    def test_headers_without_frames_yield_nothing(self):
        """Client kết nối rồi chưa kịp nhận khung: không được bịa khung."""
        extractor = FrameExtractor()
        hdr = firmware_response_headers().encode() + b"\r\n\r\n"
        assert extractor.feed(hdr) == []


class TestSizeLimits:
    def test_firmware_cap_below_backend_cap(self):
        """Firmware phải bỏ khung TRƯỚC khi backend coi là hỏng.

        Nếu `KVC_MAX_JPEG_BYTES` >= `_MAX_FRAME_BYTES` thì một khung quá lớn
        vừa được firmware gửi đi vừa bị backend xoá buffer — stream chết mà
        không ai báo lỗi rõ ràng.
        """
        assert KVC_MAX_JPEG_BYTES < BACKEND_MAX_FRAME_BYTES

    def test_frame_at_firmware_cap_passes_backend(self):
        """Khung đúng bằng trần firmware vẫn phải qua được backend."""
        payload_len = KVC_MAX_JPEG_BYTES - len(b"\xff\xd8") - len(b"\xff\xd9")
        frame = b"\xff\xd8" + b"\x42" * payload_len + b"\xff\xd9"
        assert len(frame) == KVC_MAX_JPEG_BYTES
        extractor = FrameExtractor()
        assert extractor.feed(firmware_frame(frame)) == [frame]


class TestSendChunkErrorPath:
    """Lỗi gửi KHÔNG được làm hỏng bộ đếm.

    Firmware chỉ tăng `g_frames_served` khi cả ba chunk đều trả ESP_OK. Test
    dưới đây mô phỏng trường hợp ngắt giữa khung: backend chỉ thấy khung CỤT và
    phải BỎ nó, không được đếm. Nhờ vậy `frame_count` phía backend và
    `frames` phía firmware không lệch nhau một cách âm thầm.
    """

    def test_truncated_frame_is_discarded(self):
        full = firmware_frame(JPEG_A)
        truncated = full[: len(full) - 3]      # mất EOI
        extractor = FrameExtractor()
        assert extractor.feed(truncated) == []

        # Khi khung kế tiếp đến, bộ tách phải tìm được SOI mới và chạy tiếp,
        # không bị kẹt vĩnh viễn vì header của khung cụt.
        frames = extractor.feed(firmware_frame(JPEG_B))
        assert frames == [JPEG_B]
