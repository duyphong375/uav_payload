"""
KVC SAR UAV - Kiểm Thử Nhận Diện Thời Gian Thực Qua Webcam / Camera Điện Thoại
==============================================================================
Hỗ trợ:
  1. Camera USB / Webcam Laptop (index 0, 1, 2...)
  2. Camera điện thoại qua ứng dụng ảo (Iriun Webcam, DroidCam, EpocCam)
  3. Camera điện thoại qua luồng mạng WiFi IP Webcam (http://192.168.x.x:8080/video, rtsp://...)
  4. Tự động hiển thị nhãn theo chuẩn Wire Contract phần cứng KVC (person=1, lifebuoy=2).
"""

import os
import sys
import time
import argparse

# scripts/manual/<file>.py -> len hai cap de lay workspace root
WORKSPACE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if WORKSPACE_DIR not in sys.path:
    sys.path.insert(0, WORKSPACE_DIR)
from ai.inference.inference_adapter import (
    ORIGINAL_IMAGE_XYXY,
    adapt_detection_to_wire,
)



def adapt_result_box(box, orig_w, orig_h, detection_id):
    """Convert one normal Ultralytics Results box without re-unletterboxing it."""
    cls_id = int(box.cls[0].item())
    confidence = float(box.conf[0].item())
    xyxy = box.xyxy[0].tolist()
    return adapt_detection_to_wire(
        model_class_id=cls_id,
        confidence=confidence,
        box_xyxy=xyxy,
        orig_w=orig_w,
        orig_h=orig_h,
        coordinate_space=ORIGINAL_IMAGE_XYXY,
        detection_id=detection_id,
    )


def get_default_weights():
    candidates = [
        os.path.join(WORKSPACE_DIR, "ai", "weights", "yolo11n_2class_best.pt"),
        os.path.join(WORKSPACE_DIR, "ai", "runs", "yolo11n_2class_boosted", "weights", "best.pt"),
        os.path.join(WORKSPACE_DIR, "ai", "runs", "yolo11n_2class_hardware", "weights", "best.pt"),
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return candidates[0]


def scan_available_cameras(max_check=6):
    import cv2

    available = []
    for i in range(max_check):
        cap = cv2.VideoCapture(i)
        if cap.isOpened():
            ret, _ = cap.read()
            if ret:
                available.append(i)
            cap.release()
    return available


def main():
    import cv2
    import torch
    from ultralytics import YOLO

    parser = argparse.ArgumentParser(description="KVC SAR UAV - Realtime Webcam & Phone Camera Test")
    parser.add_argument(
        "--source",
        type=str,
        default="auto",
        help="Nguồn camera: index (0, 1, 2) hoặc URL IP Webcam điện thoại (vd: http://192.168.1.15:8080/video). Mặc định 'auto'",
    )
    parser.add_argument(
        "--weights",
        type=str,
        default=get_default_weights(),
        help="Đường dẫn file trọng số mô hình YOLO (mặc định: mô hình Boosted mới nhất)",
    )
    parser.add_argument(
        "--conf",
        type=float,
        default=0.25,
        help="Ngưỡng confidence nhận diện (mặc định 0.25)",
    )
    parser.add_argument(
        "--max-frames",
        type=int,
        default=0,
        help="Số khung hình tối đa cần chạy (0 = chạy liên tục cho đến khi bấm 'q' hoặc ESC)",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default=os.path.join(WORKSPACE_DIR, "ai", "runs", "eval_webcam"),
        help="Thư mục lưu ảnh chụp màn hình kiểm thử",
    )
    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)

    print("=" * 68)
    print("  KVC SAR UAV - PC_REFERENCE WEBCAM INFERENCE (KHÔNG PHẢI FPGA)")
    print("  Hợp đồng 2 lớp: Class 0 -> Wire 1 (person) | Class 1 -> Wire 2 (lifebuoy)")
    print("=" * 68)

    device = 0 if torch.cuda.is_available() else "cpu"
    gpu_desc = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU"
    print(f"🚀 Thiết bị suy luận: {device} ({gpu_desc})")
    print(f"🧠 Trọng số mô hình: {args.weights}")

    if not os.path.exists(args.weights):
        print(f"❌ Không tìm thấy file trọng số tại: {args.weights}")
        return

    model = YOLO(args.weights)

    # Xác định nguồn video
    source_val = args.source.strip()
    cap = None

    if source_val == "auto":
        print("\n🔍 Đang quét các cổng camera kết nối trên máy tính...")
        cams = scan_available_cameras()
        if not cams:
            print("❌ Không tìm thấy cổng camera nào!")
            print("💡 Hướng dẫn kết nối điện thoại làm webcam:")
            print("   Cách 1 (WiFi): Cài app 'IP Webcam' trên điện thoại -> Bấm Start Server")
            print("          Chạy lệnh: python scripts/manual/run_webcam.py --source http://<IP_DIEN_THOAI>:8080/video")
            print("   Cách 2 (USB/WiFi): Cài app 'Iriun Webcam' hoặc 'DroidCam' trên điện thoại và PC")
            print("          Sau khi kết nối, chạy lại: python scripts/manual/run_webcam.py --source 1")
            return

        print(f"✅ Tìm thấy các camera: {cams}")
        # Nếu có từ 2 camera trở lên (thường 0 là webcam máy tính, 1 là điện thoại)
        chosen_cam = cams[-1] if len(cams) > 1 else cams[0]
        print(f"👉 Tự động chọn camera: {chosen_cam}")
        cap = cv2.VideoCapture(chosen_cam)
    elif source_val.isdigit():
        cam_idx = int(source_val)
        print(f"👉 Mở camera cổng index: {cam_idx}")
        cap = cv2.VideoCapture(cam_idx)
    else:
        # Tự động chuẩn hóa đường dẫn nếu người dùng chỉ nhập IP (vd: 192.168.1.15:8080)
        norm_url = source_val
        if not norm_url.startswith(("http://", "https://", "rtsp://")):
            norm_url = "http://" + norm_url
        if ":8080" in norm_url and not any(norm_url.endswith(ep) for ep in ["/video", "/shot.jpg", "/videofeed"]):
            norm_url = norm_url.rstrip("/") + "/video"
        elif ":4747" in norm_url and not norm_url.endswith("/video"):
            norm_url = norm_url.rstrip("/") + "/video"

        print(f"👉 Đang kết nối luồng camera điện thoại qua mạng: {norm_url}")
        cap = cv2.VideoCapture(norm_url)

    if not cap or not cap.isOpened():
        print(f"❌ Không thể mở luồng video từ nguồn: {source_val}")
        print("Vui lòng kiểm tra lại địa chỉ IP hoặc quyền truy cập camera trên điện thoại.")
        return

    # Thiết lập độ phân giải camera (chỉ áp dụng với webcam cục bộ)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

    print("\n" + "=" * 68)
    print("🎥 CAMERA ĐÃ KẾT NỐI VÀ ĐANG PHÁT TRỰC TIẾP!")
    print("   - Nhấn phím 'q' hoặc 'ESC' trên cửa sổ video để THOÁT.")
    print("   - Nhấn phím 's' để LƯU ẢNH chụp màn hình kiểm định.")
    print("=" * 68 + "\n")

    prev_time = time.time()
    frame_count = 0
    total_detections = {"person": 0, "lifebuoy": 0}

    # Bắt đầu vòng lặp đọc và suy luận
    while True:
        ret, frame = cap.read()
        if not ret or frame is None:
            print("⚠️ Mất tín hiệu hình ảnh từ camera / luồng video đã ngắt kết nối.")
            break

        frame_count += 1
        h, w = frame.shape[:2]

        # Dự đoán với mô hình YOLO
        results = model.predict(source=frame, conf=args.conf, imgsz=640, device=device, verbose=False)
        annotated_frame = results[0].plot()

        # Tính FPS
        curr_time = time.time()
        fps = 1.0 / (curr_time - prev_time) if (curr_time - prev_time) > 0 else 0
        prev_time = curr_time

        # Phân tích các mục tiêu phát hiện và gắn nhãn theo Wire protocol
        boxes = results[0].boxes
        target_info = []
        for i, box in enumerate(boxes):
            try:
                payload = adapt_result_box(
                    box,
                    w,
                    h,
                    f"webcam-frame-{frame_count}-detection-{i}",
                )
                total_detections[payload["class_name"]] += 1
                target_info.append(f"Wire#{payload['wire_class_id']} ({payload['class_name']}): {payload['confidence_pct']}%")
            except (AttributeError, IndexError, TypeError, ValueError) as exc:
                print(
                    f"REJECTED detection at frame {frame_count}, index {i}: {exc}",
                    file=sys.stderr,
                )

        # OSD Header hiển thị thông số kiểm thử KVC
        header_text = f"KVC PC_REFERENCE AI | FPS: {fps:.1f} | {gpu_desc[:18]} | Frame #{frame_count}"
        if target_info:
            header_text += " | " + " | ".join(target_info[:2])

        cv2.rectangle(annotated_frame, (10, 10), (min(w - 10, 800), 50), (20, 20, 20), -1)
        cv2.putText(
            annotated_frame,
            header_text,
            (20, 38),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (0, 255, 128),
            2,
        )

        # Hiển thị cửa sổ GUI
        try:
            cv2.imshow("KVC AI - Realtime Camera Test (Nhan Q de thoat, S de chup anh)", annotated_frame)
            key = cv2.waitKey(1) & 0xFF
            if key == ord("q") or key == 27:
                print("🛑 Đã nhận lệnh thoát từ bàn phím.")
                break
            elif key == ord("s"):
                snap_path = os.path.join(args.output_dir, f"capture_{int(time.time())}.jpg")
                cv2.imwrite(snap_path, annotated_frame)
                print(f"📸 Đã lưu ảnh chụp kiểm định: {snap_path}")
        except Exception:
            # Trường hợp chạy trong môi trường không có DISPLAY GUI
            pass

        # Tự động chụp lưu frame đầu tiên có phát hiện để làm bằng chứng kiểm thử
        if target_info and frame_count % 150 == 1:
            auto_snap = os.path.join(args.output_dir, f"auto_detect_frame_{frame_count}.jpg")
            cv2.imwrite(auto_snap, annotated_frame)

        if args.max_frames > 0 and frame_count >= args.max_frames:
            print(f"🏁 Đã đạt giới hạn {args.max_frames} khung hình.")
            break

    cap.release()
    try:
        cv2.destroyAllWindows()
    except Exception:
        pass

    print("\n" + "=" * 68)
    print("📊 TỔNG KẾT PHIÊN KIỂM THỬ CAMERA:")
    print(f"  + Tổng số khung hình xử lý: {frame_count}")
    print(f"  + Lượt phát hiện 'person' (Người): {total_detections['person']}")
    print(f"  + Lượt phát hiện 'lifebuoy' (Phao cứu sinh): {total_detections['lifebuoy']}")
    print("=" * 68)


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    main()
