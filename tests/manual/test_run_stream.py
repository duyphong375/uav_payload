"""Kiem tra runner nhan dien thoi gian thuc ma khong mo camera/model/GPU."""

import socket
import threading
import time
import unittest
from pathlib import Path

from scripts.manual.run_stream import (
    STREAM_STALL_TIMEOUT_SEC,
    LatestFrame,
    describe_detections,
    draw_detections,
    format_detection_label,
    parse_source,
    start_server,
    validate_class_names,
)


class FakeScalar:
    def __init__(self, value):
        self.value = value

    def item(self):
        return self.value


class FakeVector:
    def __init__(self, values):
        self.values = values

    def tolist(self):
        return list(self.values)


class FakeBox:
    def __init__(self, class_id, confidence, xyxy):
        self.cls = [FakeScalar(class_id)]
        self.conf = [FakeScalar(confidence)]
        self.xyxy = [FakeVector(xyxy)]


class FakeCv2:
    """Ghi lai lenh ve; du de khang dinh toa do va nhan ma khong can OpenCV."""

    FONT_HERSHEY_SIMPLEX = 0
    LINE_AA = 16

    def __init__(self):
        self.rectangles = []
        self.texts = []

    def rectangle(self, frame, pt1, pt2, color, thickness):
        self.rectangles.append((pt1, pt2, color, thickness))

    def getTextSize(self, text, font, scale, thickness):
        return (7 * len(text), 11), 3

    def putText(self, frame, text, org, font, scale, color, thickness, lineType=0):
        self.texts.append((text, org))


class TestParseSource(unittest.TestCase):
    def test_numeric_index_becomes_camera_int(self):
        self.assertEqual(parse_source("0"), 0)
        self.assertEqual(parse_source(" 2 "), 2)

    def test_file_path_stays_a_path(self):
        self.assertEqual(parse_source("clip.mp4"), "clip.mp4")

    def test_bare_host_and_port_get_http_scheme(self):
        self.assertEqual(parse_source("192.168.1.15:8080"), "http://192.168.1.15:8080")

    def test_full_urls_are_preserved(self):
        for url in (
            "http://192.168.1.15:8080/video",
            "https://camera.local/stream",
            "rtsp://10.0.0.2:554/live",
        ):
            with self.subTest(url=url):
                self.assertEqual(parse_source(url), url)

    def test_empty_source_is_rejected(self):
        with self.assertRaises(ValueError):
            parse_source("   ")


class TestValidateClassNames(unittest.TestCase):
    def test_accepts_two_class_person_lifebuoy_checkpoint(self):
        names = validate_class_names({0: "person", 1: "lifebuoy"})
        self.assertEqual(names, {0: "person", 1: "lifebuoy"})

    def test_accepts_string_keys_and_case_from_ultralytics(self):
        names = validate_class_names({"0": "Person", "1": " LifeBuoy "})
        self.assertEqual(names, {0: "person", 1: "lifebuoy"})

    def test_rejects_checkpoint_with_swapped_classes(self):
        with self.assertRaises(ValueError):
            validate_class_names({0: "lifebuoy", 1: "person"})

    def test_rejects_checkpoint_with_extra_or_missing_classes(self):
        for names in (
            {0: "person"},
            {0: "person", 1: "lifebuoy", 2: "boat"},
            {0: "person", 1: "boat"},
        ):
            with self.subTest(names=names):
                with self.assertRaises(ValueError):
                    validate_class_names(names)


class TestDescribeDetections(unittest.TestCase):
    def test_returns_wire_payloads_for_both_classes(self):
        boxes = [
            FakeBox(0, 0.91, (10.0, 20.0, 60.0, 140.0)),
            FakeBox(1, 0.73, (200.0, 210.0, 260.0, 250.0)),
        ]
        payloads, rejected = describe_detections(boxes, 640, 480, 12)

        self.assertEqual(rejected, [])
        self.assertEqual([p["class_name"] for p in payloads], ["person", "lifebuoy"])
        self.assertEqual([p["wire_class_id"] for p in payloads], [1, 2])
        self.assertEqual(payloads[0]["bbox_orig_pixels"], {"x1": 10.0, "y1": 20.0, "x2": 60.0, "y2": 140.0})
        self.assertEqual(payloads[0]["inference_provenance"], "PC_REFERENCE")
        self.assertEqual(payloads[1]["detection_id"], "stream-frame-12-detection-1")

    def test_unsupported_class_is_reported_without_dropping_other_boxes(self):
        boxes = [
            FakeBox(7, 0.99, (1.0, 2.0, 3.0, 4.0)),
            FakeBox(1, 0.44, (5.0, 6.0, 7.0, 8.0)),
        ]
        payloads, rejected = describe_detections(boxes, 640, 480, 3)

        self.assertEqual([p["class_name"] for p in payloads], ["lifebuoy"])
        self.assertEqual(len(rejected), 1)
        self.assertEqual(rejected[0][0], 0)
        self.assertIn("Unsupported model class_id 7", rejected[0][1])

    def test_label_includes_class_name_and_integer_confidence(self):
        payloads, _ = describe_detections([FakeBox(1, 0.873, (1.0, 2.0, 3.0, 4.0))], 640, 480, 0)
        self.assertEqual(format_detection_label(payloads[0]), "lifebuoy 87%")


class TestDrawDetections(unittest.TestCase):
    def test_draws_box_and_label_for_each_detection(self):
        payloads, _ = describe_detections(
            [
                FakeBox(0, 0.90, (100.4, 50.6, 180.2, 210.9)),
                FakeBox(1, 0.30, (300.0, 100.0, 340.0, 140.0)),
            ],
            640,
            480,
            1,
        )
        fake_cv2 = FakeCv2()
        draw_detections(fake_cv2, object(), payloads)

        self.assertEqual(len(fake_cv2.rectangles), 4)
        box_rects = [r for r in fake_cv2.rectangles if r[3] == 2]
        self.assertEqual(box_rects[0][:2], ((100, 51), (180, 211)))
        self.assertEqual(box_rects[1][:2], ((300, 100), (340, 140)))
        self.assertEqual([t[0] for t in fake_cv2.texts], ["person 90%", "lifebuoy 30%"])

    def test_label_background_is_clamped_inside_the_frame(self):
        payloads, _ = describe_detections([FakeBox(0, 0.5, (5.0, 2.0, 40.0, 30.0))], 640, 480, 1)
        fake_cv2 = FakeCv2()
        draw_detections(fake_cv2, object(), payloads)

        label_rect = [r for r in fake_cv2.rectangles if r[3] == -1][0]
        self.assertGreaterEqual(label_rect[0][1], 0)
        self.assertGreater(label_rect[1][1], label_rect[0][1])

    def test_no_detections_draws_nothing(self):
        fake_cv2 = FakeCv2()
        draw_detections(fake_cv2, object(), [])
        self.assertEqual(fake_cv2.rectangles, [])
        self.assertEqual(fake_cv2.texts, [])


class TestImportIsSideEffectFree(unittest.TestCase):
    def test_module_does_not_import_heavy_runtime_at_import_time(self):
        import scripts.manual.run_stream as module

        self.assertFalse(hasattr(module, "cv2"))
        self.assertFalse(hasattr(module, "YOLO"))
        self.assertTrue(Path(module.__file__).is_file())


class TestLatestFrameWait(unittest.TestCase):
    """`wait_next` phai chi thuc day khi CO KHUNG MOI hoac het timeout.

    Truoc day `Condition.wait()` duoc goi mot lan, nen mot notify_all tu client
    khac hoac spurious wakeup lam ham tra ve sequence cu -> `_send_stream`
    thay `sequence == last_sequence` va dong ket noi. Day dung la nguyen nhan
    stream dut moi vai giay du nguon van chay.
    """

    def test_returns_immediately_when_a_frame_already_exists(self):
        latest = LatestFrame()
        latest.publish(b"jpeg-1")

        started = time.monotonic()
        sequence, jpeg = latest.wait_next(-1, timeout=5.0)

        self.assertEqual(sequence, 1)
        self.assertEqual(jpeg, b"jpeg-1")
        self.assertLess(time.monotonic() - started, 0.5)

    def test_waits_for_the_next_frame_instead_of_returning_the_old_one(self):
        latest = LatestFrame()
        latest.publish(b"jpeg-1")

        def publish_later():
            time.sleep(0.2)
            latest.publish(b"jpeg-2")

        threading.Thread(target=publish_later, daemon=True).start()

        sequence, jpeg = latest.wait_next(1, timeout=5.0)

        self.assertEqual(sequence, 2)
        self.assertEqual(jpeg, b"jpeg-2")

    def test_returns_same_sequence_after_timeout_without_a_new_frame(self):
        latest = LatestFrame()
        latest.publish(b"jpeg-1")

        started = time.monotonic()
        sequence, jpeg = latest.wait_next(1, timeout=0.3)
        elapsed = time.monotonic() - started

        self.assertEqual(sequence, 1)
        self.assertEqual(jpeg, b"jpeg-1")
        self.assertGreaterEqual(elapsed, 0.25)
        self.assertLess(elapsed, 2.0)

    def test_stall_timeout_covers_measured_source_gaps(self):
        # Do tren ESP32-S3-CAM qua relay IF-05: p95 gap 789 ms, max 2.751 ms.
        # Nguong phai rong hon gap lon nhat da do, neu khong stream se dong
        # dung luc nguon chi cham nhat thoi.
        self.assertGreater(STREAM_STALL_TIMEOUT_SEC, 2.751)


class TestStreamSurvivesSourceGap(unittest.TestCase):
    """Stream MJPEG phai song qua khoang lang ngan cua nguon.

    Day la hoi quy truc tiep cho trieu chung "0,7 FPS roi dung anh": nguon
    ESP32-S3-CAM co luc nghen 2-3 giay (p95 gap 789 ms, max 2.751 ms do duoc).
    Voi timeout 2 s cu, `_send_stream` dong ket noi giua luc do, va vi frontend
    cu khong retry, panel dung han cho toi khi F5.
    """

    def setUp(self):
        self.latest = LatestFrame()
        self.latest.publish(b"\xff\xd8first\xff\xd9")
        self.server = start_server("127.0.0.1", 0, self.latest, lambda: {"ok": True})
        self.port = self.server.server_address[1]
        self._sock = None

    def tearDown(self):
        if self._sock is not None:
            try:
                self._sock.close()
            except OSError:
                pass
        self.server.shutdown()
        self.server.server_close()

    def _open_stream(self):
        """Mo /stream bang socket tho de doc duoc multipart vo han."""
        sock = socket.create_connection(("127.0.0.1", self.port), timeout=20)
        self._sock = sock
        sock.sendall(
            b"GET /stream HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n"
        )
        sock.settimeout(20)
        first_chunk = sock.recv(4096)
        self.assertIn(b"200", first_chunk.split(b"\r\n", 1)[0])
        self.assertIn(b"multipart/x-mixed-replace", first_chunk)
        return sock, first_chunk

    @staticmethod
    def _recv_until(sock, marker, timeout, initial=b""):
        """Doc toi khi thay `marker`, tinh ca du lieu da co trong `initial`.

        Phai bat `socket.timeout` chu khong de no no ra ngoai: test do stream
        song qua khoang lang, nen "khong co du lieu trong X giay" la mot ket
        qua hop le can khang dinh, khong phai loi ha tang.
        """
        buffer = bytearray(initial)
        deadline = time.monotonic() + timeout
        while marker not in buffer:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            sock.settimeout(remaining)
            try:
                chunk = sock.recv(4096)
            except socket.timeout:
                break
            if not chunk:
                break
            buffer.extend(chunk)
        return bytes(buffer)

    def test_second_frame_arrives_after_gap_longer_than_old_timeout(self):
        sock, head = self._open_stream()
        # BOM header co the chua san khung dau tien trong cung mot lan recv.
        rest = self._recv_until(sock, b"\xff\xd8first\xff\xd9", 10, initial=head)
        self.assertIn(b"\xff\xd8first\xff\xd9", rest)

        # Khoang lang 2,5 s: dai hon timeout CU (2,0 s) nhung ngan hon nguong
        # moi. Voi code cu, ket noi da bi dong va lan doc nay khong con gi.
        time.sleep(2.5)
        self.latest.publish(b"\xff\xd8second\xff\xd9")

        tail = self._recv_until(sock, b"\xff\xd8second\xff\xd9", 10)
        self.assertIn(b"\xff\xd8second\xff\xd9", tail)

    def test_waits_for_first_frame_instead_of_closing_immediately(self):
        # Client ket noi TRUOC khi AI publish khung dau tien: truoc day
        # `_send_stream` thay `jpeg is None` va dong ngay lap tuc.
        latest = LatestFrame()
        server = start_server("127.0.0.1", 0, latest, lambda: {"ok": True})
        port = server.server_address[1]
        sock = socket.create_connection(("127.0.0.1", port), timeout=20)
        self._sock = sock
        try:
            sock.sendall(
                b"GET /stream HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n"
            )
            head = sock.recv(4096)
            self.assertIn(b"200", head.split(b"\r\n", 1)[0])

            def publish_soon():
                time.sleep(0.5)
                latest.publish(b"\xff\xd8late\xff\xd9")

            threading.Thread(target=publish_soon, daemon=True).start()

            body = self._recv_until(sock, b"\xff\xd8late\xff\xd9", 15, initial=head)
            self.assertIn(b"\xff\xd8late\xff\xd9", body)
        finally:
            sock.close()
            self._sock = None
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    unittest.main()
