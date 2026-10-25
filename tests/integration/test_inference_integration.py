"""Side-effect-free caller-to-adapter checks using fake Ultralytics boxes."""

import unittest
import subprocess
import sys
from pathlib import Path

from scripts.manual.run_video import adapt_result_box as adapt_video_result_box
from scripts.manual.run_webcam import adapt_result_box as adapt_webcam_result_box


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


class FakeUltralyticsBox:
    """Only the Results box surface used by the two PC callers."""

    def __init__(self, class_id, confidence, xyxy):
        self.cls = [FakeScalar(class_id)]
        self.conf = [FakeScalar(confidence)]
        self.xyxy = [FakeVector(xyxy)]


class TestInferenceCallerIntegration(unittest.TestCase):
    def test_callers_import_without_site_packages_or_stdout_reconfiguration(self):
        code = (
            "import io, sys; sys.stdout = io.StringIO(); "
            "from scripts.manual.run_video import adapt_result_box; "
            "from scripts.manual.run_webcam import adapt_result_box; "
            "assert not ({'cv2', 'torch', 'ultralytics', 'numpy'} & sys.modules.keys())"
        )
        result = subprocess.run(
            [sys.executable, "-S", "-B", "-c", code],
            cwd=Path(__file__).resolve().parents[2],
            capture_output=True, text=True, timeout=10,
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_callers_preserve_original_space_box_on_non_square_frame(self):
        box = FakeUltralyticsBox(0, 0.92, (900.0, 480.0, 1020.0, 660.0))
        expected_pixels = {"x1": 900.0, "y1": 480.0, "x2": 1020.0, "y2": 660.0}

        for caller in (adapt_video_result_box, adapt_webcam_result_box):
            with self.subTest(caller=caller.__module__):
                payload = caller(box, 1920, 1080, "frame-7-detection-2")
                self.assertEqual(payload["bbox_orig_pixels"], expected_pixels)
                self.assertEqual(payload["bbox_orig_normalized"]["cx"], 0.5)
                self.assertEqual(payload["bbox_orig_normalized"]["cy"], 0.527778)
                self.assertEqual(payload["wire_class_id"], 1)
                self.assertEqual(payload["confidence_pct"], 92)
                self.assertFalse(payload["target_confirmed"])
                self.assertEqual(payload["tracking_status"], "NOT_TRACKED")
                self.assertEqual(payload["inference_provenance"], "PC_REFERENCE")
                self.assertNotIn("track_id", payload)

    def test_lifebuoy_mapping_is_preserved_by_both_callers(self):
        box = FakeUltralyticsBox(1, 0.88, (100.0, 40.0, 300.0, 140.0))
        for caller in (adapt_video_result_box, adapt_webcam_result_box):
            payload = caller(box, 1280, 720, "frame-8-detection-0")
            self.assertEqual(payload["wire_class_id"], 2)
            self.assertEqual(payload["class_name"], "lifebuoy")
            self.assertEqual(payload["bbox_orig_pixels"]["x1"], 100.0)

    def test_unsupported_class_is_rejected_with_diagnostic(self):
        unsupported = FakeUltralyticsBox(7, 0.99, (10.0, 20.0, 30.0, 40.0))
        for caller in (adapt_video_result_box, adapt_webcam_result_box):
            with self.subTest(caller=caller.__module__):
                with self.assertRaisesRegex(ValueError, "Unsupported model class_id 7"):
                    caller(unsupported, 1280, 720, "frame-9-detection-0")


if __name__ == "__main__":
    unittest.main()
