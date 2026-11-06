import os
import sys

# Chế độ Offline hoàn toàn (không kết nối internet)
os.environ["YOLO_OFFLINE"] = "true"

from ultralytics import YOLO

def main():
    print("=" * 60)
    print(" KVC UAV PAYLOAD - FINE-TUNE YOLO11n 160x160 (OFFLINE)")
    print("=" * 60)
    
    root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    weights_path = os.path.join(root_dir, "ai", "weights", "yolo11n_2class_best.pt")
    if not os.path.exists(weights_path):
        weights_path = r"D:\Project_UAV_KVC\ai_training\weights\yolo11n_2class_best.pt"
    
    data_yaml = os.path.join(root_dir, "ai", "datasets", "data.yaml")
    if not os.path.exists(data_yaml):
        data_yaml = r"D:\Project_UAV_KVC\ai_training\dataset_4k_yolo\data.yaml"
    
    project_dir = os.path.join(root_dir, "ai", "runs")
    run_name = "yolo11n_160_kvc"
    
    if not os.path.exists(weights_path):
        print(f"[ERROR] Khong tim thay file weights: {weights_path}")
        sys.exit(1)
        
    if not os.path.exists(data_yaml):
        print(f"[ERROR] Khong tim thay file data: {data_yaml}")
        sys.exit(1)
        
    print(f"[*] Base model: {weights_path}")
    print(f"[*] Dataset:    {data_yaml}")
    print(f"[*] Resolution: 160x160 (Chuan FPGA OneKiwi Primer 20K)")
    print(f"[*] Bat dau huan luyen tren GPU...")
    print("-" * 60)
    
    # Load model
    model = YOLO(weights_path)
    
    # Train
    results = model.train(
        data=data_yaml,
        imgsz=160,
        epochs=40,
        batch=32,
        device=0,           # Dung GPU NVIDIA (CUDA)
        workers=4,          # DataLoader workers
        mosaic=1.0,         # Tang cuong hoc vat the bi che khuat / bien dang
        mixup=0.15,
        project=project_dir,
        name=run_name,
        exist_ok=True,
        verbose=True
    )
    
    best_pt = os.path.join(project_dir, run_name, "weights", "best.pt")
    print("=" * 60)
    print("[SUCCESS] Huan luyen hoan tat!")
    print(f"[*] Model tot nhat luu tai: {best_pt}")
    print("=" * 60)

if __name__ == '__main__':
    main()

