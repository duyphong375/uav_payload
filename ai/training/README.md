# KVC AI — dữ liệu và suy luận tham chiếu PC

Cập nhật 14/10/2026, audit KVC-MAINT-20261014-001. **SOURCE-VERIFIED / kiểm thử adapter bằng dữ liệu giả**; chưa HARDWARE-VERIFIED. Model class 0 (person) → wire ID 1, class 1 (lifebuoy) → wire ID 2 là mapping trong adapter; không chứng minh telemetry 32 byte đã chạy trên FPGA/MCU.

## Mô hình thống nhất

KVC chọn **Ultralytics YOLO11n** cho detection hai lớp: 0=person, 1=lifebuoy. Dùng tên YOLO11 cho họ mô hình và YOLO11n cho cấu hình nano; kiến trúc `yolo11n`, model nền `yolo11n.pt` theo [Ultralytics](https://docs.ultralytics.com/models/yolo11/).

Script train hiện khởi tạo từ `ai_training/weights/yolo11n_2class_best.pt`; tên file/run không chứng minh kiến trúc. Cần kiểm metadata/graph và hash checkpoint trước train/export hoặc công bố release. Model legacy YOLO26 đã được loại khỏi thư mục weights; không dùng hoặc đổi tên checkpoint legacy thành YOLO11n.

Lượt đồng nhất chỉ cập nhật tài liệu và nhãn UI; chưa train lại, nạp weights để xác minh kiến trúc hoặc chứng minh GoAI chạy YOLO11n trên OneKiwi.

## Thành phần và dữ liệu hiện có

```text
ai_training/
├── inference_adapter.py      # Module adapter mapping lớp (0: person, 1: lifebuoy) & tọa độ BBox
├── ontology.yaml             # Đặc tả ontology phân lớp dữ liệu cứu hộ KVC
├── dataset_4k_yolo/          # Tập dữ liệu ảnh & nhãn định dạng YOLO (train/val 2 lớp)
├── manifests/                # Manifests quản lý collection, session, hash SHA-256 ảnh
├── weights/                  # Checkpoints trọng số mô hình tham chiếu (best.pt, best.onnx)
├── runs/                     # Nhật ký huấn luyện và biểu đồ đánh giá (yolo11n_rtx4060_80ep...)
├── releases/                 # Template phát hành phiên bản mô hình (model_release_template.json)
├── raw_images/               # (Git ignored) Thư mục chứa ảnh thô trước tiền xử lý
├── raw_videos/               # (Git ignored) Thư mục chứa video nguồn
├── dataset_exports/          # (Git ignored) Dữ liệu xuất phục vụ kiểm thử
└── README.md                 # Tài liệu chỉ dẫn này
```

- inference_adapter.py: mapping lớp/confidence, tọa độ original-image hoặc letterbox, provenance PC_REFERENCE và NOT_TRACKED.
- dataset_4k_yolo/: ảnh, nhãn 2 lớp và labels_5class_backup. Script remap dùng nhãn gốc swimmer/boat/jetski/life_saving_appliances/buoy; backup này không phải pc_reference_profile trong ontology.
- manifests/: collection/session/image/calibration manifests. Đây là hồ sơ cần kiểm lại provenance, không mặc định là dữ liệu đã QA.
- runs/, weights/: kết quả train/evaluation, checkpoints cục bộ. File tồn tại hoặc báo cáo ghi metrics chưa chứng minh độ chính xác trên FPGA.
- raw_images/, raw_videos/, dataset_exports/, evaluation_videos/: dữ liệu nguồn/đánh giá cục bộ, không commit theo quy tắc dự án.
- releases/model_release_template.json: template release, chưa phải release đã nghiệm thu.

Kiểm nhãn chỉ đọc ngày 14/10:

| Split | File nhãn | Nhãn rỗng | person boxes | lifebuoy boxes |
| --- | ---: | ---: | ---: | ---: |
| train | 4.800 | 822 (17,13%) | 21.308 | 2.390 |
| val | 1.547 | 258 (16,68%) | 6.206 | 330 |

Audit lịch sử ghi 6.347 ảnh có SHA-256 khác nhau và không thấy trùng byte trong/giữa hai split. Kết quả này chưa được gắn với manifest/version input tái lập cho release hiện tại. Kiểm cấu trúc nhãn lịch sử không thấy class ngoài 0/1, số không hữu hạn hoặc trường tọa độ ngoài [0,1]. Các phép này không xác nhận nhãn đúng ngữ nghĩa, không loại trừ frame gần nhau hoặc rò rỉ cùng phiên. Số 4.000 train trong hồ sơ cũ là baseline trước tăng cường 800 ảnh.

## Giới hạn provenance cần giải quyết

image_manifest.csv lịch sử có 100 dòng dữ liệu; hash là INDEXED_FROM_DATASET và trạng thái QA không có evidence độc lập. Generator hiện tại mặc định dry-run, tính SHA-256 thật nhưng để session/provenance/human-QA ở trạng thái chưa xác minh; chỉ ghi file khi truyền `--write` và không ghi đè nếu thiếu `--force`. Không dùng output inventory như bằng chứng QA.

Cần truy lại nguồn/license và session gốc, tính hash thật, QA ngữ nghĩa person/lifebuoy/negative rồi mới khóa split và đánh giá. Nhãn rỗng không đủ chứng minh ảnh không có người/phao. ontology.yaml có số phân bố cũ; bảng trên là thống kê file hiện tại, không tự đổi class mapping hay ABI.

Kiểm tra evidence read-only, không sửa dataset/manifests:

~~~powershell
.venv/Scripts/python.exe -B scripts/data/validate_ai_evidence.py
~~~

Exit `0` chỉ khi session/provenance/license, file hash, human-QA evidence, locked-test và calibration đều hợp lệ. Exit `1` với `AI_EVIDENCE_BLOCKED` là kết quả mong đợi cho hồ sơ hiện tại cho đến khi các bằng chứng thật được cung cấp.

Báo cáo trong runs/ là lịch sử PC_REFERENCE, chưa tái đo trong audit. Offset epoch +15 không chứng minh checkpoint thực sự đã học 15 epoch trước đó. Detection count/confidence không thay precision/recall có ground truth; giảm mAP của phao không được gọi là cải thiện độ chính xác chỉ vì số phát hiện tăng.

## Kiểm thử và vận hành

Từ root:

~~~powershell
.venv/Scripts/python.exe -B -m pytest tests -q -p no:cacheprovider
~~~

Các test dùng boxes giả và adapter, không nạp weights hoặc mở camera. Script `scripts/manual/run_video.py` và `scripts/manual/run_webcam.py` chỉ import OpenCV/NumPy/PyTorch/Ultralytics khi chạy chức năng tương ứng; runtime AI chưa có dependency manifest riêng được khóa. Requirements backend không phải bộ cài AI. Chưa chạy train, export/quantization, video/webcam trong audit.

Giữ nguồn, quyền sử dụng, mã phiên; chia theo session trước lấy frame. Tách kết quả real/scale_model/synthetic. Không commit ảnh/video gốc, secrets, weights, model exports; xem [chuẩn bị dữ liệu](../docs/ai/KVC_AI_DATA_PREPARATION.md). Không xóa nhãn backup hoặc báo cáo lịch sử như file trùng.
