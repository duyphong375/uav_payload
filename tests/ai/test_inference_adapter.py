"""
Unit tests for KVC AI Inference to Wire / GCS Protocol Adapter
=============================================================
Kiem thu toan dien:
  1. Anh xa model class sang wire id (person: 0->1, lifebuoy: 1->2) va nguoc lai.
  2. Chuan hoa confidence sang phan tram nguyen (0.92 -> 92, 0.0 -> 0, 1.0 -> 100).
  3. Tinh toan letterbox va phuc hoi toa do unletterbox ve khung hinh goc (1920x1080, 1280x720, 640x640).
  4. Golden vectors va kiem tra gioi han clamp bien.
  5. Dong goi goi tin hoan chinh adapt_detection_to_wire.
"""

import math
import sys
import os
import unittest

# Them duong dan goc vao sys.path de import
WORKSPACE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if WORKSPACE_DIR not in sys.path:
    sys.path.insert(0, WORKSPACE_DIR)

from ai.inference.inference_adapter import (
    LETTERBOX_640_XYXY,
    NOT_TRACKED,
    ORIGINAL_IMAGE_XYXY,
    PC_REFERENCE,
    model_class_to_wire,
    wire_class_to_model,
    confidence_to_wire_pct,
    compute_letterbox_params,
    unletterbox_box,
    xywhn_to_xyxy_pixels,
    xyxy_pixels_to_xywhn,
    adapt_detection_to_wire,
    MODEL_TO_WIRE_CLASS,
    WIRE_TO_MODEL_CLASS,
)


class TestInferenceAdapter(unittest.TestCase):

    def test_class_mapping_person_and_lifebuoy(self):
        """Kiem tra anh xa lop chuan: person (0 -> Wire 1), lifebuoy (1 -> Wire 2)"""
        self.assertEqual(model_class_to_wire(0), 1)
        self.assertEqual(model_class_to_wire(1), 2)

        # Anh xa nguoc
        self.assertEqual(wire_class_to_model(1), 0)
        self.assertEqual(wire_class_to_model(2), 1)

    def test_invalid_class_mappings(self):
        """Kiem tra tu choi cac class ID ngoai pham vi 2 lop phan cung"""
        for invalid_id in [-1, 2, 3, 4, 10]:
            with self.assertRaises(ValueError):
                model_class_to_wire(invalid_id)

        for invalid_wire in [0, 3, 4, 99]:
            with self.assertRaises(ValueError):
                wire_class_to_model(invalid_wire)

    def test_confidence_conversion(self):
        """Kiem tra chuyen doi confidence float sang ty le % nguyen (Review diem 1)"""
        # Gia tri tieu bieu tu review: 0.92 -> 92%
        self.assertEqual(confidence_to_wire_pct(0.92), 92)
        self.assertEqual(confidence_to_wire_pct(0.924), 92)
        self.assertEqual(confidence_to_wire_pct(0.926), 93)

        # Cac gia tri bien
        self.assertEqual(confidence_to_wire_pct(0.0), 0)
        self.assertEqual(confidence_to_wire_pct(1.0), 100)
        self.assertEqual(confidence_to_wire_pct(0.50), 50)

        # Clamping neu ngoai pham vi
        self.assertEqual(confidence_to_wire_pct(-0.1), 0)
        self.assertEqual(confidence_to_wire_pct(1.5), 100)

        # Loi voi NaN va Inf
        with self.assertRaises(ValueError):
            confidence_to_wire_pct(float('nan'))
        with self.assertRaises(ValueError):
            confidence_to_wire_pct(float('inf'))

    def test_compute_letterbox_params_16_9(self):
        """Kiem tra tinh toan letterbox cho ty le 16:9 (1920x1080) sang 640x640"""
        r, pad_x, pad_y, scaled_w, scaled_h = compute_letterbox_params(1920, 1080, 640, 640)

        # 640 / 1920 = 1/3
        self.assertAlmostEqual(r, 640.0 / 1920.0, places=5)
        self.assertEqual(scaled_w, 640)
        self.assertEqual(scaled_h, 360)
        self.assertEqual(pad_x, 0.0)
        self.assertEqual(pad_y, 140.0)  # (640 - 360) / 2 = 140

    def test_compute_letterbox_params_square(self):
        """Kiem tra anh vuong 640x640 -> khong pad"""
        r, pad_x, pad_y, scaled_w, scaled_h = compute_letterbox_params(640, 640, 640, 640)
        self.assertEqual(r, 1.0)
        self.assertEqual(pad_x, 0.0)
        self.assertEqual(pad_y, 0.0)
        self.assertEqual(scaled_w, 640)
        self.assertEqual(scaled_h, 640)

    def test_golden_vector_unletterbox_box_center(self):
        """Golden vector: Hop o chinh giua anh 1920x1080 duoc unletterbox chinh xac"""
        orig_w, orig_h = 1920, 1080
        # Box goc: tam giua (960, 540), rong 120, cao 60 -> [900, 510, 1020, 570]
        box_orig_target = (900.0, 510.0, 1020.0, 570.0)

        # Bien doi sang 640x640 qua scale = 1/3, pad_y = 140
        r = 640.0 / 1920.0
        pad_y = 140.0
        box_640 = (
            900.0 * r,
            510.0 * r + pad_y,
            1020.0 * r,
            570.0 * r + pad_y,
        )

        unletterboxed = unletterbox_box(box_640, orig_w, orig_h, 640, 640)

        self.assertAlmostEqual(unletterboxed[0], box_orig_target[0], delta=0.5)
        self.assertAlmostEqual(unletterboxed[1], box_orig_target[1], delta=0.5)
        self.assertAlmostEqual(unletterboxed[2], box_orig_target[2], delta=0.5)
        self.assertAlmostEqual(unletterboxed[3], box_orig_target[3], delta=0.5)

    def test_independent_golden_vectors_across_aspect_ratios(self):
        """Hard-coded vectors cover landscape, square, portrait and padding."""
        vectors = (
            # orig_w, orig_h, letterbox xyxy, expected original xyxy
            (1920, 1080, (300.0, 310.0, 340.0, 350.0), (900.0, 510.0, 1020.0, 630.0)),
            (1280, 720, (50.0, 160.0, 150.0, 210.0), (100.0, 40.0, 300.0, 140.0)),
            (800, 800, (80.0, 160.0, 400.0, 480.0), (100.0, 200.0, 500.0, 600.0)),
            (720, 1280, (190.0, 100.0, 290.0, 300.0), (100.0, 200.0, 300.0, 600.0)),
        )
        for orig_w, orig_h, source_box, expected_box in vectors:
            with self.subTest(resolution=(orig_w, orig_h)):
                actual = unletterbox_box(source_box, orig_w, orig_h)
                for actual_value, expected_value in zip(actual, expected_box):
                    self.assertAlmostEqual(actual_value, expected_value, places=6)

                normalized = xyxy_pixels_to_xywhn(actual, orig_w, orig_h)
                expected_center_x = ((expected_box[0] + expected_box[2]) / 2) / orig_w
                expected_center_y = ((expected_box[1] + expected_box[3]) / 2) / orig_h
                expected_width = (expected_box[2] - expected_box[0]) / orig_w
                expected_height = (expected_box[3] - expected_box[1]) / orig_h
                for actual_value, expected_value in zip(
                    normalized,
                    (expected_center_x, expected_center_y, expected_width, expected_height),
                ):
                    self.assertAlmostEqual(actual_value, expected_value, places=6)

    def test_odd_padding_rounding_matches_ultralytics_top_edge(self):
        """Odd total padding uses the same top/left tie-break as scale_boxes."""
        ratio, pad_x, pad_y, scaled_w, scaled_h = compute_letterbox_params(1000, 333)
        self.assertEqual((scaled_w, scaled_h), (640, 213))
        self.assertEqual((pad_x, pad_y), (0.0, 213.0))
        self.assertAlmostEqual(ratio, 0.64)
        actual = unletterbox_box((0.0, 213.0, 640.0, 426.12), 1000, 333)
        self.assertEqual(actual, (0.0, 0.0, 1000.0, 333.0))

    def test_unletterbox_clamps_to_image_boundaries(self):
        """Kiem tra unletterbox cat tia dung bien anh goc khong bi vuot ngoai"""
        orig_w, orig_h = 1920, 1080
        # Box gia lap vuot ra ngoai vung letterbox hop le (vi du o vung pad den y < 140 hoac y > 500)
        box_out_of_bounds = (-50.0, 50.0, 700.0, 620.0)

        clamped = unletterbox_box(box_out_of_bounds, orig_w, orig_h, 640, 640)

        self.assertGreaterEqual(clamped[0], 0.0)
        self.assertGreaterEqual(clamped[1], 0.0)
        self.assertLessEqual(clamped[2], float(orig_w))
        self.assertLessEqual(clamped[3], float(orig_h))

    def test_xywhn_and_xyxy_roundtrip(self):
        """Kiem tra chuyen doi qua lai giua xywhn (YOLO) va xyxy (pixels)"""
        orig_xyxy = (100.0, 200.0, 500.0, 800.0)
        img_w, img_h = 1920, 1080

        xywhn = xyxy_pixels_to_xywhn(orig_xyxy, img_w, img_h)
        # cx, cy, w, h phai trong khoang [0, 1]
        self.assertTrue(0.0 <= xywhn[0] <= 1.0)
        self.assertTrue(0.0 <= xywhn[1] <= 1.0)
        self.assertTrue(0.0 <= xywhn[2] <= 1.0)
        self.assertTrue(0.0 <= xywhn[3] <= 1.0)

        recovered_xyxy = xywhn_to_xyxy_pixels(xywhn, img_w, img_h)
        self.assertAlmostEqual(recovered_xyxy[0], orig_xyxy[0], delta=0.01)
        self.assertAlmostEqual(recovered_xyxy[1], orig_xyxy[1], delta=0.01)
        self.assertAlmostEqual(recovered_xyxy[2], orig_xyxy[2], delta=0.01)
        self.assertAlmostEqual(recovered_xyxy[3], orig_xyxy[3], delta=0.01)

    def test_adapt_detection_to_wire_payload(self):
        """Kiem tra dong goi toan dien detection thanh payload chuan wire"""
        # Test person (class 0 -> wire 1, conf 0.925 -> 93%)
        payload_person = adapt_detection_to_wire(
            model_class_id=0,
            confidence=0.92,
            box_xyxy=(900.0, 480.0, 1020.0, 660.0),
            orig_w=1920,
            orig_h=1080,
            coordinate_space=ORIGINAL_IMAGE_XYXY,
            detection_id="frame-1-detection-0",
        )

        self.assertEqual(payload_person["model_class_id"], 0)
        self.assertEqual(payload_person["wire_class_id"], 1)
        self.assertEqual(payload_person["class_name"], "person")
        self.assertEqual(payload_person["confidence_pct"], 92)
        self.assertEqual(payload_person["detection_id"], "frame-1-detection-0")
        self.assertNotIn("track_id", payload_person)
        self.assertEqual(payload_person["tracking_status"], NOT_TRACKED)
        self.assertFalse(payload_person["target_confirmed"])
        self.assertEqual(payload_person["inference_provenance"], PC_REFERENCE)
        self.assertEqual(payload_person["bbox_input_space"], ORIGINAL_IMAGE_XYXY)
        self.assertEqual(
            payload_person["bbox_orig_pixels"],
            {"x1": 900.0, "y1": 480.0, "x2": 1020.0, "y2": 660.0},
        )
        self.assertEqual(payload_person["source_resolution"], [1920, 1080])

        # Test lifebuoy (class 1 -> wire 2, conf 0.88 -> 88%)
        payload_buoy = adapt_detection_to_wire(
            model_class_id=1,
            confidence=0.88,
            box_xyxy=(300.0, 300.0, 340.0, 360.0),
            orig_w=1280,
            orig_h=720,
            coordinate_space=LETTERBOX_640_XYXY,
            detection_id="frame-2-detection-0",
        )
        self.assertEqual(payload_buoy["model_class_id"], 1)
        self.assertEqual(payload_buoy["wire_class_id"], 2)
        self.assertEqual(payload_buoy["class_name"], "lifebuoy")
        self.assertEqual(payload_buoy["confidence_pct"], 88)
        self.assertFalse(payload_buoy["target_confirmed"])

    def test_bbox_contract_rejects_unknown_space_and_invalid_values(self):
        base = {
            "model_class_id": 0,
            "confidence": 0.92,
            "box_xyxy": (0.0, 0.0, 10.0, 10.0),
            "orig_w": 1920,
            "orig_h": 1080,
            "coordinate_space": ORIGINAL_IMAGE_XYXY,
            "detection_id": "frame-1-detection-0",
        }
        with self.assertRaisesRegex(ValueError, "coordinate_space"):
            adapt_detection_to_wire(**{**base, "coordinate_space": "AUTO"})
        with self.assertRaisesRegex(ValueError, "ordered"):
            adapt_detection_to_wire(**{**base, "box_xyxy": (10.0, 0.0, 0.0, 10.0)})
        with self.assertRaisesRegex(ValueError, "finite"):
            adapt_detection_to_wire(**{**base, "box_xyxy": (0.0, 0.0, math.inf, 10.0)})

    def test_original_pixel_box_is_only_clipped_not_unletterboxed(self):
        payload = adapt_detection_to_wire(
            model_class_id=0,
            confidence=0.92,
            box_xyxy=(-5.0, 0.0, 1925.0, 1080.0),
            orig_w=1920,
            orig_h=1080,
            coordinate_space=ORIGINAL_IMAGE_XYXY,
            detection_id="frame-1-detection-edge",
        )
        self.assertEqual(
            payload["bbox_orig_pixels"],
            {"x1": 0.0, "y1": 0.0, "x2": 1920.0, "y2": 1080.0},
        )


if __name__ == '__main__':
    unittest.main()
