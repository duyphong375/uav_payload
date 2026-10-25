"""
KVC SAR UAV - AI Inference to Hardware Wire / GCS Protocol Adapter
==================================================================
Mo ta:
  Module chuan hoa chuyen doi giua dau ra mo hinh YOLO (2 lop: person=0, lifebuoy=1)
  va giao thuc truyen tin (Telemetry wire contract: person=1, lifebuoy=2).
  Phan biet ro hop bao da o pixel anh goc voi hop bao con o khong gian letterbox
  640x640, va chuan hoa do tin cay confidence ve ty le % (0..100).

Quy uoc anh xa:
  - Model class 0 (person)   -> Wire ID 1
  - Model class 1 (lifebuoy) -> Wire ID 2
  - Confidence float [0.0, 1.0] -> int [0, 100]
  - Letterbox color: (114, 114, 114)
"""

from typing import Any, Dict, Sequence, Tuple
import math


# Bang anh xa lop: Model YOLO -> Hardware Wire ID
MODEL_TO_WIRE_CLASS: Dict[int, int] = {
    0: 1,  # person -> Wire 1
    1: 2,  # lifebuoy -> Wire 2
}

# Bang anh xa nguoc: Hardware Wire ID -> Model YOLO class
WIRE_TO_MODEL_CLASS: Dict[int, int] = {
    1: 0,  # Wire 1 -> person (0)
    2: 1,  # Wire 2 -> lifebuoy (1)
}

# Ten lop theo chuan phan cung
CLASS_NAMES: Dict[int, str] = {
    0: "person",
    1: "lifebuoy",
}

WIRE_CLASS_NAMES: Dict[int, str] = {
    1: "person",
    2: "lifebuoy",
}

# Coordinate spaces accepted by adapt_detection_to_wire. Ultralytics Results.boxes.xyxy
# from normal image/video predict calls uses original-image pixels in the installed
# version; LETTERBOX_640_XYXY is reserved for explicit external preprocessing paths.
ORIGINAL_IMAGE_XYXY = "ORIGINAL_IMAGE_PIXELS"
LETTERBOX_640_XYXY = "LETTERBOX_640_PIXELS"
PC_REFERENCE = "PC_REFERENCE"
NOT_TRACKED = "NOT_TRACKED"


def model_class_to_wire(model_class_id: int) -> int:
    """
    Chuyen doi class ID tu YOLO model (0, 1) sang Wire ID (1, 2).
    Nem ValueError neu class ID khong hop le.
    """
    if type(model_class_id) is not int or model_class_id not in MODEL_TO_WIRE_CLASS:
        raise ValueError(
            f"Unsupported model class_id {model_class_id!r}; "
            "only 0 (person) and 1 (lifebuoy) are valid wire targets."
        )
    return MODEL_TO_WIRE_CLASS[model_class_id]


def wire_class_to_model(wire_class_id: int) -> int:
    """
    Chuyen doi Wire ID (1, 2) sang Model class ID (0, 1).
    Nem ValueError neu wire class ID khong hop le.
    """
    if wire_class_id not in WIRE_TO_MODEL_CLASS:
        raise ValueError(f"Wire class_id {wire_class_id} khong hop le. Chi chap nhan 1 (person) hoac 2 (lifebuoy).")
    return WIRE_TO_MODEL_CLASS[wire_class_id]


def confidence_to_wire_pct(conf: float) -> int:
    """
    Chuyen doi confidence float [0.0, 1.0] sang ty le phan tram so nguyen [0, 100]
    de dong goi vao truong do tin cay telemetry/wire.
    """
    try:
        numeric_conf = float(conf)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Gia tri confidence khong hop le: {conf!r}") from exc
    if math.isnan(numeric_conf) or math.isinf(numeric_conf):
        raise ValueError(f"Gia tri confidence khong hop le: {conf}")
    clamped = max(0.0, min(1.0, numeric_conf))
    return int(round(clamped * 100.0))


def compute_letterbox_params(
    orig_w: int,
    orig_h: int,
    target_w: int = 640,
    target_h: int = 640,
) -> Tuple[float, float, float, int, int]:
    """
    Tinh toan cac thong so letterbox can bang ty le (aspect ratio preserving):
    Returns:
      (scale_ratio, pad_x, pad_y, scaled_w, scaled_h)
    """
    if orig_w <= 0 or orig_h <= 0 or target_w <= 0 or target_h <= 0:
        raise ValueError(f"Kich thuoc anh phai duong: orig=({orig_w},{orig_h}), target=({target_w},{target_h})")

    r = min(target_w / orig_w, target_h / orig_h)
    scaled_w = int(round(orig_w * r))
    scaled_h = int(round(orig_h * r))

    # Match the top/left integer padding used by Ultralytics LetterBox/scale_boxes.
    # The -0.1 tie-break is relevant when the total padding is odd.
    pad_x = float(round((target_w - scaled_w) / 2.0 - 0.1))
    pad_y = float(round((target_h - scaled_h) / 2.0 - 0.1))

    return r, pad_x, pad_y, scaled_w, scaled_h


def unletterbox_box(
    box_xyxy_640: Sequence[float],
    orig_w: int,
    orig_h: int,
    target_w: int = 640,
    target_h: int = 640,
) -> Tuple[float, float, float, float]:
    """
    Chuyen doi toa do hop bao (x1, y1, x2, y2) trong khong gian letterbox (mac dinh 640x640)
    tro ve khong gian pixel thuc te cua anh goc (orig_w, orig_h).
    Tu dong cat tia (clamp) ve bien [0, orig_w] va [0, orig_h].
    """
    r, pad_x, pad_y, _, _ = compute_letterbox_params(orig_w, orig_h, target_w, target_h)

    x1, y1, x2, y2 = _validated_xyxy(box_xyxy_640)

    x1_orig = (x1 - pad_x) / r
    y1_orig = (y1 - pad_y) / r
    x2_orig = (x2 - pad_x) / r
    y2_orig = (y2 - pad_y) / r

    # Clamp ve bien anh goc
    x1_clamped = max(0.0, min(float(orig_w), x1_orig))
    y1_clamped = max(0.0, min(float(orig_h), y1_orig))
    x2_clamped = max(0.0, min(float(orig_w), x2_orig))
    y2_clamped = max(0.0, min(float(orig_h), y2_orig))

    return x1_clamped, y1_clamped, x2_clamped, y2_clamped


def _validated_xyxy(box_xyxy: Sequence[float]) -> Tuple[float, float, float, float]:
    """Validate and coerce one finite, ordered xyxy box."""
    if isinstance(box_xyxy, (str, bytes)):
        raise ValueError("bbox xyxy must be a sequence of four numbers")
    try:
        values = tuple(float(value) for value in box_xyxy)
    except (TypeError, ValueError) as exc:
        raise ValueError("bbox xyxy must be a sequence of four numbers") from exc
    if len(values) != 4:
        raise ValueError(f"bbox xyxy must contain four values, got {len(values)}")
    if not all(math.isfinite(value) for value in values):
        raise ValueError(f"bbox xyxy must contain finite values, got {values!r}")
    x1, y1, x2, y2 = values
    if x2 < x1 or y2 < y1:
        raise ValueError(f"bbox xyxy must be ordered, got {values!r}")
    return x1, y1, x2, y2


def _clip_box_to_image(
    box_xyxy: Sequence[float],
    orig_w: int,
    orig_h: int,
) -> Tuple[float, float, float, float]:
    """Clip an original-image xyxy box to inclusive image extents."""
    if orig_w <= 0 or orig_h <= 0:
        raise ValueError(f"Kich thuoc anh phai duong: orig=({orig_w},{orig_h})")
    x1, y1, x2, y2 = _validated_xyxy(box_xyxy)
    return (
        max(0.0, min(float(orig_w), x1)),
        max(0.0, min(float(orig_h), y1)),
        max(0.0, min(float(orig_w), x2)),
        max(0.0, min(float(orig_h), y2)),
    )


def xywhn_to_xyxy_pixels(
    xywhn: Tuple[float, float, float, float],
    img_w: int,
    img_h: int,
) -> Tuple[float, float, float, float]:
    """
    Chuyen doi hop bao YOLO normalized center (cx, cy, w, h) trong khoang [0, 1]
    sang toa do pixel (x1, y1, x2, y2).
    """
    cx, cy, w, h = xywhn
    x1 = (cx - w / 2.0) * img_w
    y1 = (cy - h / 2.0) * img_h
    x2 = (cx + w / 2.0) * img_w
    y2 = (cy + h / 2.0) * img_h
    return max(0.0, min(float(img_w), x1)), max(0.0, min(float(img_h), y1)), max(0.0, min(float(img_w), x2)), max(0.0, min(float(img_h), y2))


def xyxy_pixels_to_xywhn(
    xyxy: Tuple[float, float, float, float],
    img_w: int,
    img_h: int,
) -> Tuple[float, float, float, float]:
    """
    Chuyen doi hop bao pixel (x1, y1, x2, y2) sang chuan YOLO normalized (cx, cy, w, h).
    """
    if img_w <= 0 or img_h <= 0:
        raise ValueError("img_w va img_h phai lon hon 0")
    x1, y1, x2, y2 = xyxy
    w = max(0.0, x2 - x1)
    h = max(0.0, y2 - y1)
    cx = x1 + w / 2.0
    cy = y1 + h / 2.0
    return cx / img_w, cy / img_h, w / img_w, h / img_h


def adapt_detection_to_wire(
    model_class_id: int,
    confidence: float,
    box_xyxy: Sequence[float],
    orig_w: int,
    orig_h: int,
    *,
    coordinate_space: str,
    detection_id: str,
) -> Dict[str, Any]:
    """
    Dong goi toan bo ket qua suy luan AI cua mot detection thanh goi du lieu
    chuan Wire/GCS hoan chinh, bao gom:
      - wire_class_id: 1 (person) hoac 2 (lifebuoy)
      - class_name: 'person' hoac 'lifebuoy'
      - confidence_pct: so nguyen 0..100
      - confidence_float: float 0.0..1.0
      - bbox_orig_pixels: (x1, y1, x2, y2) tren khung hinh goc
      - bbox_orig_normalized: (cx, cy, w, h) chuan hoa tren khung hinh goc
      - detection_id: dinh danh observation cua caller, khong phai track lien tuc
      - target_confirmed: luon False vi pipeline PC nay chua co tracker da xac minh
    """
    wire_id = model_class_to_wire(model_class_id)
    cname = CLASS_NAMES[model_class_id]
    conf_pct = confidence_to_wire_pct(confidence)

    if not isinstance(detection_id, str) or not detection_id.strip():
        raise ValueError("detection_id must be a non-empty observation identifier")

    if coordinate_space == ORIGINAL_IMAGE_XYXY:
        box_orig_pixels = _clip_box_to_image(box_xyxy, orig_w, orig_h)
    elif coordinate_space == LETTERBOX_640_XYXY:
        box_orig_pixels = unletterbox_box(box_xyxy, orig_w, orig_h, 640, 640)
    else:
        raise ValueError(
            f"Unsupported bbox coordinate_space {coordinate_space!r}; expected "
            f"{ORIGINAL_IMAGE_XYXY!r} or {LETTERBOX_640_XYXY!r}."
        )
    box_orig_normalized = xyxy_pixels_to_xywhn(box_orig_pixels, orig_w, orig_h)

    return {
        "model_class_id": model_class_id,
        "wire_class_id": wire_id,
        "class_name": cname,
        "confidence_pct": conf_pct,
        "confidence_float": round(float(confidence), 4),
        "bbox_orig_pixels": {
            "x1": round(box_orig_pixels[0], 2),
            "y1": round(box_orig_pixels[1], 2),
            "x2": round(box_orig_pixels[2], 2),
            "y2": round(box_orig_pixels[3], 2),
        },
        "bbox_orig_normalized": {
            "cx": round(box_orig_normalized[0], 6),
            "cy": round(box_orig_normalized[1], 6),
            "w": round(box_orig_normalized[2], 6),
            "h": round(box_orig_normalized[3], 6),
        },
        "detection_id": detection_id,
        "tracking_status": NOT_TRACKED,
        "target_confirmed": False,
        "inference_provenance": PC_REFERENCE,
        "bbox_input_space": coordinate_space,
        "source_resolution": [orig_w, orig_h],
    }
