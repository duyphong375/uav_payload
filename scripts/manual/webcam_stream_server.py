"""
KVC SAR UAV - Webcam & Synthetic MJPEG Stream Server
====================================================
Mục đích:
  Giả lập luồng video ESP32-S3-CAM (MJPEG stream) bằng:
    1. Webcam thật của Laptop (--cam 0)
    2. Hoặc luồng tổng hợp SAR nước lũ biển có phao và người (--synthetic)
  để kiểm tra toàn chuỗi Backend Video Relay -> Frontend VideoPanel trên Web Dashboard.

Cách chạy:
  python scripts/manual/webcam_stream_server.py --port 8081 --synthetic
  python scripts/manual/webcam_stream_server.py --port 8081 --cam 0
"""

import argparse
import math
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

import cv2
import numpy as np

BOUNDARY = "123456789000000000000987654321"
camera = None
synthetic_mode = False


def make_synthetic_sar_frame(idx: int) -> np.ndarray:
    """Tạo khung hình giả lập cứu nạn lũ lụt (800x600) với mặt nước, phao và người."""
    img = np.zeros((600, 800, 3), dtype=np.uint8)
    # Nền nước biển/lũ màu xanh rêu tối
    img[:] = (85, 45, 20)

    # Các gợn sóng nhấp nhô
    for y in range(0, 600, 35):
        offset = int(8 * math.sin((y + idx * 3) * 0.05))
        cv2.line(img, (0, y + offset), (800, y + offset), (110, 60, 30), 1)

    # 1. Phao cứu sinh (Mục tiêu 1 do FPGA phát hiện - Màu cam nổi bật)
    bx = 280 + int(6 * math.sin(idx * 0.08))
    by = 220 + int(5 * math.cos(idx * 0.08))
    cv2.circle(img, (bx, by), 40, (0, 140, 255), 14)  # Vòng tròn cam
    cv2.circle(img, (bx, by), 40, (255, 255, 255), 2)  # Viền trắng
    # Vạch phản quang trắng trên phao
    cv2.line(img, (bx - 40, by), (bx - 26, by), (255, 255, 255), 4)
    cv2.line(img, (bx + 26, by), (bx + 40, by), (255, 255, 255), 4)
    cv2.putText(img, "LIFEBUOY (FPGA)", (bx - 55, by - 50), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 200, 255), 1)

    # 2. Người gặp nạn (Mục tiêu 2 do Laptop YOLO11n phát hiện)
    px = 480 + int(8 * math.cos(idx * 0.06))
    py = 320 + int(6 * math.sin(idx * 0.06))
    # Đầu người nhấp nhô trên mặt nước
    cv2.circle(img, (px, py), 16, (180, 180, 220), -1)
    # Áo phao màu cam
    cv2.ellipse(img, (px, py + 22), (26, 12), 0, 0, 360, (0, 165, 255), -1)
    cv2.putText(img, "PERSON (YOLO11n)", (px - 60, py - 30), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (50, 255, 50), 1)

    # HUD OSD hiển thị thông số camera
    cv2.putText(img, "KVC SAR CAMERA STREAM [ESP32-S3-CAM IF-05]", (20, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
    time_str = time.strftime("%Y-%m-%d %H:%M:%S")
    cv2.putText(img, f"LIVE FEED | {time_str} | SVGA 800x600", (20, 580), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (200, 200, 200), 1)

    return img


class CameraStreamHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path in ("/stream", "/", "/video"):
            self.send_response(200)
            self.send_header(
                "Content-Type", f"multipart/x-mixed-replace; boundary={BOUNDARY}"
            )
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
            self.send_header("Pragma", "no-cache")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()

            frame_idx = 0
            while True:
                try:
                    if synthetic_mode:
                        frame = make_synthetic_sar_frame(frame_idx)
                        frame_idx += 1
                    else:
                        if camera is None or not camera.isOpened():
                            break
                        success, frame = camera.read()
                        if not success:
                            time.sleep(0.05)
                            continue

                    # Nén JPEG chất lượng 70 (giống OV3660 SVGA trên ESP32-S3-CAM)
                    ret, jpeg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
                    if not ret:
                        continue

                    data = jpeg.tobytes()

                    # Chuẩn format boundary RFC 2046 tương thích KVC FrameExtractor
                    header = (
                        f"--{BOUNDARY}\r\n"
                        f"Content-Type: image/jpeg\r\n"
                        f"Content-Length: {len(data)}\r\n\r\n"
                    ).encode("ascii")

                    self.wfile.write(header)
                    self.wfile.write(data)
                    self.wfile.write(b"\r\n")

                    # Khống chế nhịp khung ~25 fps
                    time.sleep(0.04)
                except (BrokenPipeError, ConnectionResetError):
                    break
                except Exception:
                    break
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        # Tắt log spam mỗi request để console sạch
        return


def main():
    global camera, synthetic_mode
    parser = argparse.ArgumentParser(description="KVC Laptop Webcam / Synthetic MJPEG Server")
    parser.add_argument("--port", type=int, default=8081, help="Cổng stream (mặc định 8081)")
    parser.add_argument("--cam", type=int, default=0, help="Index webcam (mặc định 0)")
    parser.add_argument("--synthetic", action="store_true", help="Chạy luồng video giả lập SAR mặt nước")
    args = parser.parse_args()

    synthetic_mode = args.synthetic

    if not synthetic_mode:
        print(f"[*] Đang thử mở Webcam laptop (index {args.cam})...")
        camera = cv2.VideoCapture(args.cam)
        if not camera.isOpened():
            print(f"[!] Không thể mở Webcam index {args.cam}! Tự động chuyển sang chế độ SYNTHETIC...")
            synthetic_mode = True
        else:
            camera.set(cv2.CAP_PROP_FRAME_WIDTH, 800)
            camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 600)
            print("[+] Mở Webcam thành công.")

    mode_label = "MẶT NƯỚC GIẢ LẬP (SYNTHETIC SAR FEED)" if synthetic_mode else f"WEBCAM LAPTOP (CAM {args.cam})"
    print(f"[+] Server video đang phát tại: http://127.0.0.1:{args.port}/stream (Chế độ: {mode_label})")
    print("[*] Nhấn Ctrl+C để dừng server.")

    server = ThreadingHTTPServer(("0.0.0.0", args.port), CameraStreamHandler)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[*] Đang dừng Video Server...")
    finally:
        if camera:
            camera.release()
        server.server_close()
        print("[+] Đã giải phóng tài nguyên.")


if __name__ == "__main__":
    main()
