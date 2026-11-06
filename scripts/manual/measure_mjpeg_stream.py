#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""measure_mjpeg_stream.py — Do THAT kenh MJPEG cua ESP32-S3-CAM (IF-05, task A5).

Script nay la client MJPEG doc lap, KHONG di qua backend. Muc dich la co so do
that thay vi suy tu `frame_count` cua relay.

DO GI:
  - so khung/giay TRONG cua so do (khong phai trung binh toan bo phien)
  - p50/p95 khoang cach giua hai khung lien tiep
  - byte/giay va phan bo kich thuoc khung JPEG
  - so khung vuot nguong `_MAX_FRAME_BYTES` (512 KiB) cua backend

KHONG DO GI:
  - FPS hien thi tren UI. UI luon ghi `FPS: N/A` theo hop dong P6; so do o day
    chi nam trong bao cao evidence, khong dua len dashboard.
  - Do tre end-to-end. Do tre phai do bang slow-motion dien thoai + canh that,
    khong suy tu timestamp cua backend (hai dong ho khac nhau).

CACH TACH KHUNG: quet marker SOI `FF D8` / EOI `FF D9`, giong
`gcs/backend/video_relay.py:FrameExtractor`. KHONG parse boundary, vi payload
JPEG nen co the chua chuoi giong boundary. Nho vay so khung o day dem cung mot
cach voi backend, nen so sanh duoc.

GIOI HAN DO CHINH XAC (phai ghi vao bao cao):
  - Moc thoi gian la luc script NHAN duoc chunk tu socket, khong phai luc
    camera chup khung. Nhieu khung co the den trong cung mot `recv`, nen cac
    khung do dung chung mot moc thoi gian va khoang cach giua chung la 0 ms.
    Vi vay p50/p95 la can DUOI cua khoang cach khung that; so khung/giay va
    byte/giay van dung vi chung chi can cua so do.
  - Do tre end-to-end khong do duoc bang script nay.

Chi dung thu vien chuan cua Python 3.8+ (khong can httpx/opencv).

Vi du:
  python scripts/manual/measure_mjpeg_stream.py --url http://192.168.4.2:81/stream --seconds 60
  python scripts/manual/measure_mjpeg_stream.py --url http://192.168.4.2:81/stream --seconds 120 --out measure.csv
  python scripts/manual/measure_mjpeg_stream.py --url http://127.0.0.1:8099/stream --seconds 5 --fake-camera

`--fake-camera` chi dung de TU KIEM script: no dung mot server MJPEG noi bo
phat khung gia. Khong dung co nay cho so do that.
"""

import argparse
import csv
import io
import os
import socket
import statistics
import sys
import threading
import time
from urllib.parse import urlsplit

if sys.platform == "win32" and hasattr(sys.stdout, "buffer"):
    try:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8",
                                      errors="replace", line_buffering=True)
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8",
                                      errors="replace", line_buffering=True)
    except Exception:
        pass

SOI = b"\xff\xd8"
EOI = b"\xff\xd9"
MAX_FRAME_BYTES = 512 * 1024


# --------------------------------------------------------------------------- #
# Tach khung — phai giong FrameExtractor cua backend
# --------------------------------------------------------------------------- #
class FrameSplitter:
    """Tach JPEG theo SOI/EOI. Sao chep logic cua `video_relay.FrameExtractor`."""

    def __init__(self) -> None:
        self.buf = bytearray()
        self.oversize = 0

    def feed(self, chunk: bytes):
        frames = []
        self.buf.extend(chunk)
        while True:
            start = self.buf.find(SOI)
            if start < 0:
                if len(self.buf) > 1:
                    del self.buf[:-1]
                break
            if start > 0:
                del self.buf[:start]
            end = self.buf.find(EOI, 2)
            if end < 0:
                if len(self.buf) > MAX_FRAME_BYTES:
                    self.oversize += 1
                    self.buf.clear()
                break
            frames.append(bytes(self.buf[: end + 2]))
            del self.buf[: end + 2]
        return frames


# --------------------------------------------------------------------------- #
# Doc HTTP tho qua socket de kiem soat chunk/chunked
# --------------------------------------------------------------------------- #
class MjpegConnection:
    def __init__(self, url: str, timeout: float = 10.0):
        parts = urlsplit(url)
        if parts.scheme != "http":
            raise SystemExit(f"[LOI] Chi ho tro http://, nhan duoc: {parts.scheme!r}")
        self.host = parts.hostname or "127.0.0.1"
        self.port = parts.port or 80
        self.path = parts.path or "/"
        if parts.query:
            self.path += "?" + parts.query
        self.timeout = timeout
        self.sock = None
        self.chunked = False
        self.content_length = None
        self.content_type = ""
        self.boundary = None
        self._pending = b""
        self._raw_remaining = None
        # Trang thai giai ma chunked: None = dang cho dong kich thuoc,
        # so nguyen >= 0 = dang cho dung bay nhieu byte du lieu (+ CRLF).
        self._chunk_remaining = None
        self._chunk_buf = b""

    def open(self):
        self.sock = socket.create_connection((self.host, self.port), timeout=self.timeout)
        self.sock.settimeout(self.timeout)
        request = (
            f"GET {self.path} HTTP/1.1\r\n"
            f"Host: {self.host}:{self.port}\r\n"
            "Accept: multipart/x-mixed-replace, image/jpeg, */*\r\n"
            "Connection: close\r\n"
            "User-Agent: kvc-measure-mjpeg/1.0\r\n\r\n"
        )
        self.sock.sendall(request.encode("ascii"))
        self._read_headers()
        if not self.chunked:
            self._raw_remaining = self.content_length

    def _read_headers(self):
        raw = bytearray()
        while b"\r\n\r\n" not in raw:
            piece = self.sock.recv(4096)
            if not piece:
                raise SystemExit("[LOI] Server dong ket noi truoc khi tra header")
            raw.extend(piece)
            if len(raw) > 65536:
                raise SystemExit("[LOI] Header qua lon")
        head, _, rest = bytes(raw).partition(b"\r\n\r\n")
        lines = head.decode("iso-8859-1").split("\r\n")
        status = lines[0]
        if " 200 " not in status + " ":
            raise SystemExit(f"[LOI] Server tra: {status}")
        headers = {}
        for line in lines[1:]:
            key, _, value = line.partition(":")
            headers[key.strip().lower()] = value.strip()
        self.content_type = headers.get("content-type", "")
        if "chunked" in headers.get("transfer-encoding", "").lower():
            self.chunked = True
        elif "content-length" in headers:
            self.content_length = int(headers["content-length"])
        marker = "boundary="
        lower = self.content_type.lower()
        if marker in lower:
            self.boundary = self.content_type[lower.index(marker) + len(marker):].strip().strip('"')
        self._pending = rest

    def chunks(self):
        """Sinh cac chunk du lieu da giai ma, khong gom header/chunk-size."""
        if self._pending:
            pending, self._pending = self._pending, b""
            yield from (self._decode(pending) if self.chunked else self._emit_raw(pending))
        while True:
            try:
                piece = self.sock.recv(65536)
            except socket.timeout:
                raise TimeoutError("read timeout") from None
            if not piece:
                return
            yield from (self._decode(piece) if self.chunked else self._emit_raw(piece))

    def _emit_raw(self, piece: bytes):
        if self._raw_remaining is not None:
            piece = piece[: self._raw_remaining]
            self._raw_remaining -= len(piece)
        if piece:
            yield piece
        if self._raw_remaining == 0:
            raise _StreamEnded()

    def _decode(self, piece: bytes):
        """Giai ma `Transfer-Encoding: chunked`, giu trang thai qua cac lan recv."""
        buf = self._chunk_buf + piece
        out = bytearray()
        while True:
            if self._chunk_remaining is None:
                if b"\r\n" not in buf:
                    break
                size_line, _, buf = buf.partition(b"\r\n")
                try:
                    size = int(size_line.split(b";")[0].strip(), 16)
                except ValueError:
                    raise SystemExit(f"[LOI] Chunk-size khong hop le: {size_line!r}")
                if size == 0:
                    # Het stream: bo qua trailer (neu co) va dung.
                    self._chunk_buf = b""
                    self._chunk_remaining = None
                    if out:
                        yield bytes(out)
                    raise _StreamEnded()
                self._chunk_remaining = size
            # Dang cho `_chunk_remaining` byte du lieu + CRLF.
            take = min(len(buf), self._chunk_remaining)
            if take:
                out += buf[:take]
                buf = buf[take:]
                self._chunk_remaining -= take
            if self._chunk_remaining > 0:
                break
            if len(buf) < 2:
                # CRLF cua chunk bi chia cat: giu lai cho lan sau.
                break
            buf = buf[2:]
            self._chunk_remaining = None
        self._chunk_buf = buf
        if out:
            yield bytes(out)

    def close(self):
        if self.sock is not None:
            try:
                self.sock.close()
            finally:
                self.sock = None


class _StreamEnded(Exception):
    pass


# --------------------------------------------------------------------------- #
# Do
# --------------------------------------------------------------------------- #
def measure(url: str, seconds: float, warmup: float, timeout: float):
    splitter = FrameSplitter()
    conn = MjpegConnection(url, timeout=timeout)
    samples = []            # (monotonic, size)
    started = None
    window_start = None
    window_end = None
    oversize_frames = 0
    error = None

    print(f"[*] Ket noi: {url}")
    conn.open()
    print(f"[*] Content-Type: {conn.content_type or '(khong co)'}")
    if conn.boundary:
        print(f"[*] Boundary khai bao: {conn.boundary}")
    else:
        print("[!] Khong thay tham so boundary trong Content-Type.")
    print(f"[*] Che do truyen: {'chunked' if conn.chunked else 'raw'}")
    print(f"[*] Warm-up {warmup:.1f} s, cua so do {seconds:.1f} s")

    try:
        for chunk in conn.chunks():
            now = time.monotonic()
            if started is None:
                started = now
            if window_start is None and (now - started) >= warmup:
                window_start = now
            for frame in splitter.feed(chunk):
                if len(frame) > MAX_FRAME_BYTES:
                    oversize_frames += 1
                if window_start is not None:
                    samples.append((now, len(frame)))
            if window_start is not None and (now - window_start) >= seconds:
                window_end = now
                break
    except _StreamEnded:
        window_end = time.monotonic()
    except TimeoutError as exc:
        error = str(exc)
    except OSError as exc:
        error = f"{type(exc).__name__}: {exc}"
    finally:
        conn.close()

    if window_start is None:
        raise SystemExit("[LOI] Khong co khung nao trong thoi gian warm-up")

    elapsed = (window_end or time.monotonic()) - window_start
    return {
        "samples": samples,
        "window_sec": elapsed,
        "oversize_frames": oversize_frames,
        "splitter_oversize": splitter.oversize,
        "error": error,
        "boundary": conn.boundary,
        "content_type": conn.content_type,
        "chunked": conn.chunked,
    }


def summarize(result, url, args):
    samples = result["samples"]
    elapsed = result["window_sec"]
    if not samples or elapsed <= 0:
        raise SystemExit("[LOI] Cua so do rong — khong ket luan duoc")

    times = [s[0] for s in samples]
    sizes = [s[1] for s in samples]
    gaps = [(times[i + 1] - times[i]) * 1000.0 for i in range(len(times) - 1)]
    fps = len(samples) / elapsed
    total_bytes = sum(sizes)

    def pct(values, p):
        if not values:
            return float("nan")
        ordered = sorted(values)
        k = max(0, min(len(ordered) - 1, int(round((p / 100.0) * (len(ordered) - 1)))))
        return ordered[k]

    stalls = sum(1 for g in gaps if g > 1000.0)

    print("\n================ KET QUA DO (MEASURED) ================")
    print(f"URL                 : {url}")
    print(f"Boundary khai bao   : {result['boundary'] or '(khong co)'}")
    print(f"Content-Type        : {result['content_type'] or '(khong co)'}")
    print(f"Cua so do           : {elapsed:.3f} s")
    print(f"Warm-up bo qua      : {args.warmup:.1f} s")
    print(f"So khung trong cua so: {len(samples)}")
    print(f"Khung/giay (trong cua so, MEASURED): {fps:.2f}")
    print(f"Khoang cach khung p50 / p95: {pct(gaps, 50):.1f} ms / {pct(gaps, 95):.1f} ms")
    print(f"Khoang cach lon nhat: {max(gaps) if gaps else float('nan'):.1f} ms")
    print(f"So khoang > 1000 ms : {stalls}")
    print(f"Kich thuoc khung min/trung vi/max: {min(sizes)} / {int(statistics.median(sizes))} / {max(sizes)} byte")
    print(f"Tong byte           : {total_bytes} ({total_bytes / elapsed:.0f} byte/s)")
    print(f"Khung > {MAX_FRAME_BYTES} byte (nguong backend): {result['oversize_frames']}")
    if result["error"]:
        print(f"Ket thuc som        : {result['error']}")
    print("=======================================================\n")
    print("GHI CHU: con so tren la do TRONG CUA SO nay, khong phai FPS hien thi")
    print("tren dashboard va khong phai do tre end-to-end.")
    print("Khoang cach khung la can DUOI: nhieu khung den trong cung mot lan recv")
    print("thi dung chung mot moc thoi gian (gap = 0 ms). So khung/giay van dung.")

    if args.out:
        _write_csv(args.out, samples, sizes, elapsed, url, args, fps, result)

    ok = len(samples) >= 1000 if args.seconds >= 60 else True
    if not ok:
        print(f"[!] Chua dat >= 1000 khung (co {len(samples)}). Chay lai voi --seconds lon hon.")
    if result["oversize_frames"]:
        print("[!] Co khung vuot nguong backend: stream can giam resolution/quality.")
    return 0 if ok else 2


def _write_csv(path, samples, sizes, elapsed, url, args, fps, result):
    parent = os.path.dirname(os.path.abspath(path))
    if parent and not os.path.isdir(parent):
        os.makedirs(parent, exist_ok=True)
    t0 = samples[0][0]
    with open(path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow([
            "# url", url, "window_sec", f"{elapsed:.3f}",
            "measured_fps", f"{fps:.3f}", "boundary", result["boundary"] or "",
            "content_type", result["content_type"] or "",
        ])
        writer.writerow(["index", "elapsed_ms", "gap_ms", "size_bytes"])
        prev = None
        for index, (stamp, size) in enumerate(samples):
            elapsed_ms = (stamp - t0) * 1000.0
            gap_ms = "" if prev is None else f"{(stamp - prev) * 1000.0:.3f}"
            writer.writerow([index, f"{elapsed_ms:.3f}", gap_ms, size])
            prev = stamp
    print(f"[*] Da ghi CSV: {path}")


# --------------------------------------------------------------------------- #
# Server MJPEG gia — chi de tu kiem script
# --------------------------------------------------------------------------- #
def run_fake_camera(seconds: float, fps: float, port: int = 0):
    """Dung server MJPEG toi gian trong thread nen. Tra (port, stop_event)."""
    import http.server

    frame = SOI + (b"\x01\x02\x03\x04" * 512) + EOI
    interval = 1.0 / fps
    stop = threading.Event()

    class Handler(http.server.BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, *_args):  # tat log
            pass

        def do_GET(self):
            self.send_response(200)
            self.send_header(
                "Content-Type",
                "multipart/x-mixed-replace; boundary=123456789000000000000987654321",
            )
            self.send_header("Connection", "close")
            self.end_headers()
            deadline = time.monotonic() + seconds
            try:
                while time.monotonic() < deadline and not stop.is_set():
                    self.wfile.write(
                        b"--123456789000000000000987654321\r\n"
                        b"Content-Type: image/jpeg\r\n"
                        + f"Content-Length: {len(frame)}\r\n\r\n".encode()
                        + frame
                        + b"\r\n"
                    )
                    time.sleep(interval)
            except (BrokenPipeError, ConnectionResetError):
                pass

    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler)
    actual_port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, actual_port, stop


def main(argv=None):
    parser = argparse.ArgumentParser(description="Do kenh MJPEG ESP32-S3-CAM (IF-05 / A5)")
    parser.add_argument("--url", help="URL stream, vd http://192.168.4.2:81/stream")
    parser.add_argument("--seconds", type=float, default=60.0, help="Cua so do (giay), mac dinh 60")
    parser.add_argument("--warmup", type=float, default=3.0, help="Bo qua N giay dau, mac dinh 3")
    parser.add_argument("--timeout", type=float, default=10.0, help="Timeout doc socket (giay)")
    parser.add_argument("--out", help="Ghi CSV chi tiet ra file nay")
    parser.add_argument("--fake-camera", action="store_true",
                        help="CHI DE TU KIEM: dung server MJPEG noi bo")
    args = parser.parse_args(argv)

    if args.seconds <= 0:
        parser.error("--seconds phai > 0")
    if args.warmup < 0:
        parser.error("--warmup phai >= 0")
    if not args.url and not args.fake_camera:
        parser.error("can --url (hoac --fake-camera de tu kiem)")

    server = None
    stop = None
    url = args.url
    try:
        if args.fake_camera:
            server, port, stop = run_fake_camera(
                seconds=args.warmup + args.seconds + 3.0, fps=30.0
            )
            url = url or f"http://127.0.0.1:{port}/stream"
            print(f"[*] Fake camera tai {url}")
            time.sleep(0.2)
        result = measure(url, args.seconds, args.warmup, args.timeout)
        return summarize(result, url, args)
    finally:
        if stop is not None:
            stop.set()
        if server is not None:
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    sys.exit(main())
