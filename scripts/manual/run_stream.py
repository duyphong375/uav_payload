"""
KVC SAR UAV - Nhan dien person/lifebuoy tren luong video thoi gian thuc
=======================================================================
Nap checkpoint YOLO11n 2 lop da huan luyen, suy luan tren tung khung cua
luong video (webcam, RTSP/HTTP MJPEG, hoac file), ve khung bao + nhan
truc tiep len khung hinh, va phat lai luong da ve duoi dang MJPEG de xem
tren trinh duyet tai http://127.0.0.1:<port>/.

Suy luan chay tren PC va mang provenance PC_REFERENCE, KHONG phai FPGA.

Vi du:
  python scripts/manual/run_stream.py --source 0
  python scripts/manual/run_stream.py --source 0 --display
  python scripts/manual/run_stream.py --source http://192.168.1.15:8080/video
  python scripts/manual/run_stream.py --source clip.mp4 --record ai/runs/out.mp4
"""

import argparse
import copy
import hashlib
import json
import os
import re
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

WORKSPACE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if WORKSPACE_DIR not in sys.path:
    sys.path.insert(0, WORKSPACE_DIR)
from ai.inference.inference_adapter import adapt_detection_to_wire
from scripts.manual.run_webcam import adapt_result_box, get_default_weights

EXPECTED_CLASS_NAMES = {0: "person", 1: "lifebuoy"}
CLASS_COLORS_BGR = {
    "person": (80, 220, 80),
    "lifebuoy": (0, 165, 255),
}
DEFAULT_COLOR_BGR = (220, 220, 220)
MJPEG_BOUNDARY = "kvc-annotated-stream"
_HOST_PORT_RE = re.compile(r"^\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?$")
_JPEG_QUALITY = 80

# Giữ kết nối MJPEG sống qua khoảng lặng ngắn của nguồn. Đo trên ESP32-S3-CAM
# qua relay IF-05: p95 gap 789 ms, lớn nhất 2.751 ms. Ngưỡng cũ 2.0 s đóng
# stream đúng lúc nguồn chỉ chậm nhất thời, buộc trình duyệt nối lại và đứng
# ảnh; 10 s đủ rộng cho jitter mạng mà vẫn phát hiện được nguồn chết hẳn.
STREAM_STALL_TIMEOUT_SEC = 10.0


def parse_source(raw):
    """Chuoi '0' -> index camera; URL/dir file giu nguyen (them http:// neu can)."""
    value = str(raw).strip()
    if not value:
        raise ValueError("source rong")
    if value.isdigit():
        return int(value)
    if not re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*://", value) and _HOST_PORT_RE.match(value):
        value = "http://" + value
    return value


def validate_class_names(names):
    """Chan checkpoint khong dung 2 lop person/lifebuoy truoc khi chay."""
    normalized = {int(k): str(v).strip().lower() for k, v in dict(names).items()}
    if normalized != EXPECTED_CLASS_NAMES:
        raise ValueError(
            f"Checkpoint khong dung 2 lop mong doi {EXPECTED_CLASS_NAMES}, nhan duoc {normalized}"
        )
    return normalized


def format_detection_label(payload):
    return f"{payload['class_name']} {payload['confidence_pct']}%"


def describe_detections(boxes, width, height, frame_index):
    """Chuyen results.boxes thanh payload wire; bo qua detection khong hop le."""
    payloads = []
    rejected = []
    for index, box in enumerate(boxes):
        try:
            payload = adapt_result_box(
                box, width, height, f"stream-frame-{frame_index}-detection-{index}"
            )
        except (AttributeError, IndexError, TypeError, ValueError) as exc:
            rejected.append((index, str(exc)))
            continue
        payloads.append(payload)
    return payloads, rejected


def draw_detections(cv2, frame, payloads):
    """Ve khung bao va nhan truc tiep len khung hinh (BGR in-place)."""
    for payload in payloads:
        box = payload["bbox_orig_pixels"]
        x1, y1 = int(round(box["x1"])), int(round(box["y1"]))
        x2, y2 = int(round(box["x2"])), int(round(box["y2"]))
        color = CLASS_COLORS_BGR.get(payload["class_name"], DEFAULT_COLOR_BGR)
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

        label = format_detection_label(payload)
        (text_w, text_h), baseline = cv2.getTextSize(
            label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1
        )
        top = max(0, y1 - text_h - baseline - 6)
        cv2.rectangle(frame, (x1, top), (x1 + text_w + 8, top + text_h + baseline + 6), color, -1)
        cv2.putText(
            frame,
            label,
            (x1 + 4, top + text_h + 3),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (20, 20, 20),
            1,
            cv2.LINE_AA,
        )


def draw_hud(cv2, frame, lines):
    for row, text in enumerate(lines):
        y = 24 + row * 22
        cv2.putText(
            frame,
            text,
            (12, y),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (0, 255, 128),
            2,
            cv2.LINE_AA,
        )


def sha256_file(path, chunk_size=1 << 20):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(chunk_size), b""):
            digest.update(chunk)
    return digest.hexdigest()


class LatestFrame:
    """Giu khung JPEG moi nhat cho moi client MJPEG doc doc lap."""

    def __init__(self):
        self._condition = threading.Condition()
        self._jpeg = None
        self._sequence = 0

    def publish(self, jpeg):
        with self._condition:
            self._jpeg = jpeg
            self._sequence += 1
            self._condition.notify_all()

    def snapshot(self):
        with self._condition:
            return self._sequence, self._jpeg

    def wait_next(self, last_sequence, timeout):
        """Chờ tới khi có khung mới hoặc hết `timeout` giây.

        `Condition.wait()` có thể thức dậy sớm (spurious wakeup) và cũng thức
        dậy khi một lần publish khác gọi `notify_all`, nên phải kiểm tra lại
        điều kiện theo đồng hồ. Tin vào một lần chờ duy nhất sẽ làm stream đóng
        sớm dù khung mới vẫn đang tới.
        """
        deadline = time.monotonic() + max(0.0, timeout)
        with self._condition:
            while self._sequence == last_sequence:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    break
                self._condition.wait(remaining)
            return self._sequence, self._jpeg


def make_handler(latest, stats):
    class AnnotatedStreamHandler(BaseHTTPRequestHandler):
        def do_GET(self):
            path = urlsplit(self.path).path
            if path in ("/", "/index.html"):
                self._send_index()
            elif path in ("/stream", "/video"):
                self._send_stream()
            elif path == "/snapshot.jpg":
                self._send_snapshot()
            elif path == "/healthz":
                self._send_json(stats())
            else:
                self.send_response(404)
                self.end_headers()

        def _send_index(self):
            body = (
                "<!doctype html><html lang='vi'><meta charset='utf-8'>"
                "<title>KVC AI stream</title>"
                "<body style='margin:0;background:#111;color:#ddd;font-family:sans-serif'>"
                "<div style='padding:8px 12px'>KVC - person / lifebuoy (PC_REFERENCE)</div>"
                "<img src='/stream' style='width:100%;display:block'>"
                "</body></html>"
            ).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _send_snapshot(self):
            _, jpeg = latest.snapshot()
            if jpeg is None:
                self.send_response(503)
                self.end_headers()
                return
            self.send_response(200)
            self.send_header("Content-Type", "image/jpeg")
            self.send_header("Content-Length", str(len(jpeg)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(jpeg)

        def _send_json(self, payload):
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _send_stream(self):
            self.send_response(200)
            self.send_header(
                "Content-Type", f"multipart/x-mixed-replace; boundary={MJPEG_BOUNDARY}"
            )
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
            self.send_header("Pragma", "no-cache")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()

            last_sequence = -1
            try:
                while True:
                    sequence, jpeg = latest.wait_next(
                        last_sequence, timeout=STREAM_STALL_TIMEOUT_SEC
                    )
                    # `sequence == last_sequence` nghia la da cho het timeout ma
                    # khong co khung moi -> nguon chet that, dong de client
                    # reconnect. Con `jpeg is None` voi sequence moi chi la
                    # client ket noi TRUOC khung dau tien: phai cho tiep, khong
                    # duoc dong ngay (truoc day cho nay dong stream tuc thi).
                    if sequence == last_sequence:
                        break
                    last_sequence = sequence
                    if jpeg is None:
                        continue
                    header = (
                        f"--{MJPEG_BOUNDARY}\r\n"
                        "Content-Type: image/jpeg\r\n"
                        f"Content-Length: {len(jpeg)}\r\n\r\n"
                    ).encode("ascii")
                    self.wfile.write(header)
                    self.wfile.write(jpeg)
                    self.wfile.write(b"\r\n")
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass
            self.close_connection = True

        def log_message(self, format, *args):
            return

    return AnnotatedStreamHandler


def start_server(host, port, latest, stats):
    server = ThreadingHTTPServer((host, port), make_handler(latest, stats))
    server.daemon_threads = True
    thread = threading.Thread(target=server.serve_forever, name="kvc-ai-stream", daemon=True)
    thread.start()
    return server


class RealtimeCapture:
    """Doc luong mang khong de bi tre tich luy (luon lay khung moi nhat tu camera, tu dong ket noi lai)."""

    def __init__(self, cv2, source):
        self._cv2 = cv2
        self._source = source
        self._cap = None
        self._frame = None
        self._ret = False
        self._running = True
        self._cond = threading.Condition()
        self._seq = 0
        self._open()
        self._thread = threading.Thread(target=self._worker, daemon=True, name="kvc-rt-reader")
        self._thread.start()

    def _open(self):
        if self._cap is not None:
            try:
                self._cap.release()
            except Exception:
                pass
            self._cap = None
        cap = self._cv2.VideoCapture(self._source)
        if cap.isOpened():
            self._cap = cap
            return True
        return False

    def _worker(self):
        while self._running:
            if self._cap is None or not self._cap.isOpened():
                if not self._open():
                    time.sleep(1.0)
                    continue

            try:
                ret, frame = self._cap.read()
            except Exception:
                ret, frame = False, None
            if not ret or frame is None:
                # Mat ket noi hoac camera rot luong -> mo lai
                with self._cond:
                    self._ret = False
                time.sleep(0.5)
                self._open()
                continue

            with self._cond:
                self._frame = frame
                self._ret = True
                self._seq += 1
                self._cond.notify_all()

    def isOpened(self):
        if self._cap is not None and self._cap.isOpened():
            return True
        return self._open()

    def read_latest(self, last_seq=-1, timeout=1.0):
        with self._cond:
            if self._seq == last_seq and self._running:
                self._cond.wait(timeout)
            return self._ret, self._frame, self._seq

    def read(self):
        with self._cond:
            return self._ret, self._frame

    def get(self, prop_id):
        return self._cap.get(prop_id) if self._cap else 0.0

    def set(self, prop_id, value):
        return self._cap.set(prop_id, value) if self._cap else False

    def release(self):
        self._running = False
        with self._cond:
            self._cond.notify_all()
        if self._cap:
            try:
                self._cap.release()
            except Exception:
                pass
            self._cap = None


def open_capture(cv2, source):
    is_network = isinstance(source, str) and (
        source.startswith("http://")
        or source.startswith("https://")
        or source.startswith("rtsp://")
    )
    if is_network:
        return RealtimeCapture(cv2, source)

    capture = cv2.VideoCapture(source)
    if isinstance(source, int):
        capture.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
        capture.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
        capture.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    return capture


def main():
    parser = argparse.ArgumentParser(
        description="KVC - nhan dien person/lifebuoy thoi gian thuc tren luong video"
    )
    parser.add_argument("--source", default="0", help="Index camera, URL RTSP/HTTP MJPEG, hoac file video")
    parser.add_argument("--weights", default=get_default_weights(), help="Checkpoint YOLO 2 lop")
    parser.add_argument("--conf", type=float, default=0.25, help="Nguong confidence (mac dinh 0.25)")
    parser.add_argument("--imgsz", type=int, default=640, help="Kich thuoc suy luan (mac dinh 640)")
    parser.add_argument("--device", default="auto", help="'auto', 'cpu', hoac index GPU")
    parser.add_argument("--host", default="127.0.0.1", help="Dia chi bind MJPEG (mac dinh 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8090, help="Cong MJPEG (mac dinh 8090)")
    parser.add_argument("--no-serve", action="store_true", help="Khong mo MJPEG server")
    parser.add_argument("--display", action="store_true", help="Mo cua so OpenCV (can GUI)")
    parser.add_argument("--record", default=None, help="Ghi video da ve ra file .mp4")
    parser.add_argument("--loop", action="store_true", help="Lap lai file video khi ket thuc")
    parser.add_argument("--max-frames", type=int, default=0, help="Dung sau N khung (0 = vo han)")
    parser.add_argument("--rotate", type=int, default=0, choices=[0, 90, 180, 270], help="Xoay khung hinh (0, 90, 180, 270 do theo chieu kim dong ho)")
    parser.add_argument("--jpeg-quality", type=int, default=_JPEG_QUALITY, help="Chat luong JPEG cho stream")
    args = parser.parse_args()

    import cv2
    import torch
    from ultralytics import YOLO

    if not os.path.exists(args.weights):
        print(f"Khong tim thay checkpoint: {args.weights}")
        return 2

    source = parse_source(args.source)
    model = YOLO(args.weights)
    class_names = validate_class_names(model.names)

    if args.device == "auto":
        device = 0 if torch.cuda.is_available() else "cpu"
    else:
        device = args.device if args.device == "cpu" else int(args.device)
    device_label = torch.cuda.get_device_name(0) if device == 0 else "CPU"

    capture = open_capture(cv2, source)
    if not capture.isOpened():
        print(f"Khong mo duoc nguon video: {args.source}")
        return 2

    source_fps = capture.get(cv2.CAP_PROP_FPS) or 0.0
    is_file = isinstance(source, str) and os.path.isfile(source)
    frame_interval = 1.0 / source_fps if is_file and source_fps > 1 else 0.0
    writer = None
    if args.record:
        os.makedirs(os.path.dirname(os.path.abspath(args.record)), exist_ok=True)

    latest = LatestFrame()
    stats_lock = threading.Lock()
    stats = {
        "model_classes": class_names,
        "weights": os.path.abspath(args.weights),
        "device": device_label,
        "provenance": "PC_REFERENCE",
        "frames": 0,
        "fps": 0.0,
        "infer_ms": 0.0,
        "detections": {"person": 0, "lifebuoy": 0},
        "last_boxes": 0,
    }

    def read_stats():
        with stats_lock:
            return copy.deepcopy(stats)

    server = None
    if not args.no_serve:
        try:
            server = start_server(args.host, args.port, latest, read_stats)
            print(f"MJPEG da ve: http://{args.host}:{args.port}/  (snapshot: /snapshot.jpg)")
        except OSError as exc:
            print(f"Khong mo duoc cong {args.port}: {exc}")

    print("=" * 68)
    print(" KVC - NHAN DIEN THOI GIAN THUC (PC_REFERENCE, KHONG PHAI FPGA)")
    print(f" Model      : {args.weights}")
    print(f" SHA256     : {sha256_file(args.weights)}")
    print(f" Lop        : {class_names}")
    print(f" Nguon      : {args.source} | {device_label}")
    print("=" * 68)

    frame_index = 0
    started = time.time()
    last_tick = started
    fps_ema = 0.0
    infer_ms_ema = 0.0
    written_frames = 0
    exit_code = 0
    last_seq = -1
    is_realtime = hasattr(capture, "read_latest")

    try:
        while True:
            loop_start = time.time()
            if is_realtime:
                ok, frame, seq = capture.read_latest(last_seq, timeout=1.0)
                if not ok or frame is None or seq == last_seq:
                    continue
                last_seq = seq
            else:
                ok, frame = capture.read()
                if not ok or frame is None:
                    if is_file and args.loop:
                        capture.set(cv2.CAP_PROP_POS_FRAMES, 0)
                        continue
                    break

            if args.rotate == 90:
                frame = cv2.rotate(frame, cv2.ROTATE_90_CLOCKWISE)
            elif args.rotate == 180:
                frame = cv2.rotate(frame, cv2.ROTATE_180)
            elif args.rotate == 270:
                frame = cv2.rotate(frame, cv2.ROTATE_90_COUNTERCLOCKWISE)

            frame_index += 1
            height, width = frame.shape[:2]
            infer_started = time.perf_counter()
            results = model.predict(
                source=frame, conf=args.conf, imgsz=args.imgsz, device=device, verbose=False
            )
            infer_ms = (time.perf_counter() - infer_started) * 1000.0
            if infer_ms_ema == 0.0:
                infer_ms_ema = infer_ms
            else:
                infer_ms_ema = infer_ms_ema * 0.9 + infer_ms * 0.1
            payloads, rejected = describe_detections(results[0].boxes, width, height, frame_index)
            for index, reason in rejected:
                print(f"REJECTED frame {frame_index} box {index}: {reason}", file=sys.stderr)

            draw_detections(cv2, frame, payloads)

            now = time.time()
            delta = now - last_tick
            last_tick = now
            if delta > 0:
                fps_ema = 1.0 / delta if fps_ema == 0 else fps_ema * 0.9 + (1.0 / delta) * 0.1

            counts = {"person": 0, "lifebuoy": 0}
            for payload in payloads:
                counts[payload["class_name"]] += 1
            # Tach ro hai con so tren HUD. Truoc day chi co MOT con FPS, nen khi
            # nguon chi ve 0,7 khung/s nguoi doc tuong model chay 0,7 FPS va di
            # toi uu model — trong khi model chi mat ~12 ms/khung. `SRC` la toc
            # do lay duoc khung MOI tu nguon; `INFER` la thoi gian suy luan.
            draw_hud(
                cv2,
                frame,
                [
                    f"KVC AI | SRC {fps_ema:.1f} FPS | INFER {infer_ms_ema:.1f} ms | {device_label}",
                    f"person: {counts['person']}  lifebuoy: {counts['lifebuoy']}  frame {frame_index}",
                ],
            )

            ok_jpeg, encoded = cv2.imencode(
                ".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, args.jpeg_quality]
            )
            if ok_jpeg:
                latest.publish(encoded.tobytes())

            if args.record:
                if writer is None:
                    out_fps = source_fps if source_fps and source_fps > 1 else 25.0
                    writer = cv2.VideoWriter(
                        args.record, cv2.VideoWriter_fourcc(*"mp4v"), out_fps, (width, height)
                    )
                writer.write(frame)
                written_frames += 1

            with stats_lock:
                stats["frames"] = frame_index
                stats["fps"] = round(fps_ema, 2)
                stats["infer_ms"] = round(infer_ms_ema, 2)
                stats["last_boxes"] = len(payloads)
                for name, count in counts.items():
                    stats["detections"][name] += count

            if args.display:
                try:
                    cv2.imshow("KVC AI - person/lifebuoy (q/ESC de thoat)", frame)
                    key = cv2.waitKey(1) & 0xFF
                    if key in (ord("q"), 27):
                        break
                except cv2.error:
                    print("Khong mo duoc cua so OpenCV; tiep tuc o che do headless.")
                    args.display = False

            if args.max_frames > 0 and frame_index >= args.max_frames:
                break
            if frame_interval:
                elapsed = time.time() - loop_start
                if elapsed < frame_interval:
                    time.sleep(frame_interval - elapsed)
    except KeyboardInterrupt:
        print("Da nhan Ctrl+C.")
    finally:
        capture.release()
        if writer is not None:
            writer.release()
        if server is not None:
            server.shutdown()
            server.server_close()
        if args.display:
            try:
                cv2.destroyAllWindows()
            except cv2.error:
                pass

        total_counts = read_stats()["detections"]
        elapsed = time.time() - started
        print("=" * 68)
        print(f" Khung da xu ly : {frame_index}")
        print(f" Thoi gian      : {elapsed:.2f} s ({frame_index / elapsed if elapsed else 0:.2f} FPS)")
        print(f" Infer trung binh: {infer_ms_ema:.2f} ms/khung")
        print(f" person         : {total_counts['person']} luot")
        print(f" lifebuoy       : {total_counts['lifebuoy']} luot")
        if args.record:
            print(f" Video da ve    : {os.path.abspath(args.record)} ({written_frames} khung)")
        print("=" * 68)

    return exit_code


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    raise SystemExit(main())
