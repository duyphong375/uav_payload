import os
import sys
import time
from collections import Counter, defaultdict

# Tich hop adapter chuyen doi Model -> Wire/GCS protocol
# scripts/manual/<file>.py -> len hai cap de lay workspace root
WORKSPACE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if WORKSPACE_DIR not in sys.path:
    sys.path.insert(0, WORKSPACE_DIR)
from scripts.manual.run_webcam import get_default_weights
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

def test_video(video_path, weights_path, output_dir, conf_thresh=0.25):
    import cv2
    import numpy as np
    import torch
    from ultralytics import YOLO

    print("=" * 65)
    print(" KVC SAR UAV - PC_REFERENCE VIDEO INFERENCE (KHÔNG PHẢI FPGA)")
    print("=" * 65)
    print(f"📁 Video đầu vào: {video_path}")
    print(f"🧠 Trọng số Model: {weights_path}")
    print(f"🎯 Ngưỡng Confidence: {conf_thresh}")

    device = 0 if torch.cuda.is_available() else 'cpu'
    if device == 0:
        gpu_name = torch.cuda.get_device_name(0)
        print(f"🚀 Thiết bị tăng tốc: CUDA (GPU: {gpu_name})")
    else:
        print("⚠️ Thiết bị tăng tốc: CPU")

    model = YOLO(weights_path)
    class_names = model.names
    print(f"🏷️ Các lớp mục tiêu (Model classes): {class_names}")

    os.makedirs(output_dir, exist_ok=True)

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"❌ Không thể mở video: {video_path}")
        return

    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    duration = total_frames / fps if fps > 0 else 0

    print(f"📊 Thông số Video: {width}x{height} | {fps:.2f} FPS | {total_frames} frames ({duration:.2f}s)")
    print("-" * 65)
    print("⏳ Đang tiến hành chạy suy luận trên từng khung hình...")

    video_stem = os.path.splitext(os.path.basename(video_path))[0]
    output_video_path = os.path.join(output_dir, f"{video_stem}_detected.mp4")
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(output_video_path, fourcc, fps, (width, height))

    frame_idx = 0
    frames_with_detections = 0
    class_detection_counts = Counter()
    class_confidences = defaultdict(list)
    total_boxes = 0
    inference_times = []

    start_time = time.time()
    best_frame_with_most_dets = None
    max_dets_in_frame = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        t0 = time.time()
        results = model.predict(source=frame, conf=conf_thresh, imgsz=640, device=device, verbose=False)
        t_infer = (time.time() - t0) * 1000
        inference_times.append(t_infer)

        boxes = results[0].boxes
        annotated_frame = results[0].plot()

        num_dets = len(boxes)
        valid_dets_in_frame = 0
        if num_dets > 0:
            for box_index, box in enumerate(boxes):
                # Results.boxes.xyxy is already in original-frame pixels for this
                # normal numpy-frame predict path; do not unletterbox it again.
                try:
                    wire_payload = adapt_result_box(
                        box,
                        width,
                        height,
                        f"video-frame-{frame_idx}-detection-{box_index}",
                    )
                    cname = wire_payload["class_name"]
                    conf = wire_payload["confidence_float"]
                except (AttributeError, IndexError, TypeError, ValueError) as exc:
                    print(
                        f"REJECTED detection at frame {frame_idx}, index {box_index}: {exc}",
                        file=sys.stderr,
                    )
                    continue

                class_detection_counts[cname] += 1
                class_confidences[cname].append(conf)
                total_boxes += 1
                valid_dets_in_frame += 1

            if valid_dets_in_frame > 0:
                frames_with_detections += 1
                if valid_dets_in_frame > max_dets_in_frame:
                    max_dets_in_frame = valid_dets_in_frame
                    best_frame_with_most_dets = annotated_frame.copy()

        # Ghi video
        out.write(annotated_frame)
        frame_idx += 1

        if frame_idx % 100 == 0 or frame_idx == total_frames:
            elapsed = time.time() - start_time
            curr_fps = frame_idx / elapsed if elapsed > 0 else 0
            print(f"  Frame [{frame_idx}/{total_frames}] ({frame_idx/total_frames*100:.1f}%) - Tốc độ: {curr_fps:.1f} FPS - Box: {total_boxes}")

    cap.release()
    out.release()
    total_elapsed = time.time() - start_time
    avg_fps = total_frames / total_elapsed if total_elapsed > 0 else 0
    avg_infer_ms = np.mean(inference_times) if inference_times else 0

    # Lưu ảnh tiêu biểu
    sample_img_path = os.path.join(output_dir, "keyframe_detection.jpg")
    if best_frame_with_most_dets is not None:
        cv2.imwrite(sample_img_path, best_frame_with_most_dets)
        print(f"📸 Đã lưu ảnh tiêu biểu có nhiều phát hiện nhất ({max_dets_in_frame} mục tiêu): {sample_img_path}")

    print("=" * 65)
    print("🎉 HOÀN TẤT KIỂM THỬ VIDEO!")
    print("=" * 65)
    print("📈 KẾT QUẢ ĐO LƯỜNG HIỆU NĂNG SUY LUẬN (PERFORMANCE):")
    print(f"  - Tổng số khung hình xử lý: {total_frames} frames")
    print(f"  - Tổng thời gian chạy: {total_elapsed:.2f} giây")
    print(f"  - Tốc độ trung bình (End-to-end FPS): {avg_fps:.2f} FPS")
    print(f"  - Thời gian suy luận mô hình trung bình (Inference): {avg_infer_ms:.2f} ms/frame (~ {1000/avg_infer_ms:.1f} FPS raw inference)")
    print()
    print("🔍 KẾT QUẢ NHẬN DIỆN MỤC TIÊU (DETECTIONS):")
    print(f"  - Số frame phát hiện mục tiêu: {frames_with_detections}/{total_frames} ({frames_with_detections/total_frames*100:.1f}%)")
    print(f"  - Tổng số đối tượng phát hiện (Total detections): {total_boxes}")
    print("  - Thống kê chi tiết theo từng lớp (Class breakdown):")
    if total_boxes == 0:
        print("    (Không phát hiện mục tiêu nào với ngưỡng conf >= {conf_thresh})")
    else:
        for cname in sorted(class_detection_counts.keys()):
            cnt = class_detection_counts[cname]
            confs = class_confidences[cname]
            avg_c = np.mean(confs)
            min_c = np.min(confs)
            max_c = np.max(confs)
            print(f"    + {cname:22s}: {cnt:4d} lượt | Conf TB: {avg_c*100:.1f}% (Min: {min_c*100:.1f}%, Max: {max_c*100:.1f}%)")
    print()
    print(f"💾 Video kết quả đã lưu tại: {output_video_path}")
    print("=" * 65)

if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    import argparse
    parser = argparse.ArgumentParser(description="KVC SAR UAV - PC_REFERENCE video inference")
    parser.add_argument('--video', type=str, default=os.path.join(WORKSPACE_DIR, 'media', 'watermarked_preview.mp4'), help='Đường dẫn video đầu vào')
    parser.add_argument('--weights', type=str, default=get_default_weights(), help='Đường dẫn trọng số best.pt')
    parser.add_argument('--output-dir', type=str, default=os.path.join(WORKSPACE_DIR, 'ai', 'runs', 'test_eval_best'), help='Thư mục lưu video và ảnh kết quả')
    parser.add_argument('--conf', type=float, default=0.25, help='Ngưỡng confidence (mặc định 0.25)')
    args = parser.parse_args()

    test_video(args.video, args.weights, args.output_dir, conf_thresh=args.conf)
