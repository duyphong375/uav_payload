"""Kiem chung `scripts/manual/decode_pixel_diag.py` bang khung IF-01 GIA.

LY DO CO TEST NAY
    Tool nay la nguon so lieu duy nhat cho muc G6.1.9, va no phai phan biet
    duoc bitstream rev 1 (nguong chat hon blob) voi rev 2 (dung nguong blob).
    Neu nhan dien sai, nguoi doc se so `cnt_match` cua rev 1 voi `cnt` cua blob
    va ket luan sai ve F-02 — dung loi da mac trong phien 03/11/2026.

    Test dung khung IF-01 tong hop, khong can bo that va khong phu thuoc file
    capture nao. Khung duoc tao bang chinh `crc16_ccitt_false` cua tool, nen
    chi kiem logic giai ma/phan loai, khong kiem dinh dang CRC (da co
    `tb_bbox_packetizer` va `test_esp32_ingress` lo phia RTL/firmware).
"""

import io
import os
import struct
import sys
import unittest
from pathlib import Path

from scripts.manual.decode_pixel_diag import (
    PIXSTAT_SLOTS,
    crc16_ccitt_false,
    decode_report,
    evaluate,
    infer_file_rev,
    main,
    parse_frames,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
REV1_CAPTURE = REPO_ROOT / "docs" / "verification" / "evidence" / "G6.1.9_pixel_test.bin"

SYNC0, SYNC1 = 0x5A, 0xA5
VERSION = 1


def build_frame(ts, slots):
    """Tao mot khung IF-01: header 8 B, N x 8 B, CRC-16 CCITT-FALSE 2 B."""
    body = bytearray([SYNC0, SYNC1, VERSION, len(slots)])
    body += struct.pack("<I", ts)
    for x, y, w, h, cls, conf in slots:
        body += struct.pack("<HHBBBB", x, y, w, h, cls, conf)
    return bytes(body) + struct.pack("<H", crc16_ccitt_false(body))


def split32(value):
    return value & 0xFFFF, (value >> 16) & 0xFFFF


def build_pixel_report(ts, *, pix_count, sum_r, sum_g, sum_b, cnt_match,
                       center_pixel, max_r5, r_ok=None, g_ok=None,
                       b_ok=None, rg_ok=None, rev_slot=0, n_slots=12,
                       max_px=None, max_py=None):
    """Dung 12 slot bao cao pixel_stats.

    `rev_slot` la gia tri slot 10: 0 cho rev 1/2, 3 hoac 4 cho rev 3/4.
    Rev 4 doi nghia slot 5 thanh max_px/max_py va chuyen max_r5 sang slot 11;
    khi do truyen `max_px`/`max_py` va bo qua `center_pixel`.
    """
    values = [pix_count, sum_r, sum_g, sum_b, cnt_match]
    slots = []
    for i, v in enumerate(values):
        lo, hi = split32(v)
        slots.append((lo, hi, i, 0, 2, 100))
    if max_px is None:
        slots.append((center_pixel, max_r5, 5, 0, 2, 100))
    else:
        slots.append((max_px, max_py, 5, 0, 2, 100))
    for i, v in enumerate((r_ok or 0, g_ok or 0, b_ok or 0, rg_ok or 0), start=6):
        lo, hi = split32(v)
        slots.append((lo, hi, i, 0, 2, 100))
    slots.append((rev_slot, 0, 10, 0, 2, 100))
    while len(slots) < n_slots:
        i = len(slots)
        slots.append((max_r5, 0, i, 0, 2, 100) if i == 11 else (0, 0, i, 0, 2, 100))
    return build_frame(ts, slots[:n_slots])


def rev1_report(ts=1000, cnt_match=27):
    """Rev 1: 6 slot co nghia, slot 6..10 = 0, khong co chi tieu chan doan."""
    return build_pixel_report(
        ts, pix_count=1000, sum_r=20000, sum_g=20000, sum_b=10000,
        cnt_match=cnt_match, center_pixel=0x8C10, max_r5=28)


def rev2_report(ts=2000, cnt_match=8, r_ok=24, g_ok=16, b_ok=16, rg_ok=8):
    """Rev 2: them 4 slot chan doan nhung slot 10 = 0 (khong co dau hieu rev)."""
    return build_pixel_report(
        ts, pix_count=32, sum_r=872, sum_g=1000, sum_b=392,
        cnt_match=cnt_match, center_pixel=0, max_r5=31,
        r_ok=r_ok, g_ok=g_ok, b_ok=b_ok, rg_ok=rg_ok)


def rev3_report(ts=3000, cnt_match=8, r_ok=8, g_ok=8, b_ok=16, rg_ok=16):
    """Rev 3: bo loc ty le + slot 10 = 3. Slot 7/9 KHONG tin duoc (tran 8 bit)."""
    return build_pixel_report(
        ts, pix_count=32, sum_r=872, sum_g=1000, sum_b=392,
        cnt_match=cnt_match, center_pixel=0, max_r5=31,
        r_ok=r_ok, g_ok=g_ok, b_ok=b_ok, rg_ok=rg_ok, rev_slot=3)


def rev4_report(ts=4000, cnt_match=8, r_ok=8, g_ok=8, b_ok=16, rg_ok=16,
                max_px=399, max_py=299):
    """Rev 4: slot 10 = 4, slot 5 = max_px/max_py, slot 11 = max_r5."""
    return build_pixel_report(
        ts, pix_count=32, sum_r=872, sum_g=1000, sum_b=392,
        cnt_match=cnt_match, center_pixel=0, max_r5=31,
        r_ok=r_ok, g_ok=g_ok, b_ok=b_ok, rg_ok=rg_ok, rev_slot=4,
        max_px=max_px, max_py=max_py)


def rev5_report(ts=5000, cnt_match=8, pix_count=119903,
                vsync_per_rep=1, href_per_vs=300,
                max_px=399, max_py=299):
    """Rev 5: slot 5 = {vsync_per_rep[5:0], max_px[9:0]} + max_py;
    slot 11 = href_per_vs + max_r5."""
    slots = []
    for i, v in enumerate([pix_count, 872, 1000, 392, cnt_match]):
        lo, hi = split32(v)
        slots.append((lo, hi, i, 0, 2, 100))
    slots.append(((vsync_per_rep & 0x3F) << 10 | (max_px & 0x3FF), max_py,
                  5, 0, 2, 100))
    for i, v in enumerate((8, 8, 16, 16), start=6):
        lo, hi = split32(v)
        slots.append((lo, hi, i, 0, 2, 100))
    slots.append((5, 0, 10, 0, 2, 100))
    slots.append((href_per_vs, 31, 11, 0, 2, 100))
    return build_frame(ts, slots)


def decode_one(raw):
    frames, crc_err = parse_frames(raw)
    assert crc_err == 0, f"crc_err={crc_err}"
    assert len(frames) == 1, f"{len(frames)} khung"
    return decode_report(frames[0])


class TestFrameParsing(unittest.TestCase):
    def test_roundtrip_rev1_frame(self):
        rep = decode_one(rev1_report())

        self.assertIsNotNone(rep)
        self.assertEqual(rep["pix_count"], 1000)
        self.assertEqual(rep["sum_r"], 20000)
        self.assertEqual(rep["sum_g"], 20000)
        self.assertEqual(rep["sum_b"], 10000)
        self.assertEqual(rep["cnt_match"], 27)
        self.assertEqual(rep["center_pixel"], 0x8C10)
        self.assertEqual(rep["max_r5"], 28)
        self.assertTrue(rep["order_ok"])

    def test_bad_crc_is_rejected_not_decoded(self):
        raw = bytearray(rev1_report())
        raw[-1] ^= 0xFF
        frames, crc_err = parse_frames(bytes(raw))
        self.assertEqual(frames, [])
        self.assertEqual(crc_err, 1)

    def test_join16_reassembles_19_bit_counts(self):
        rep = decode_one(build_pixel_report(
            1, pix_count=307200, sum_r=9523200, sum_g=19353600, sum_b=9523200,
            cnt_match=307200, center_pixel=0, max_r5=31,
            r_ok=307200, g_ok=307200, b_ok=307200, rg_ok=307200))

        self.assertEqual(rep["pix_count"], 307200)
        self.assertEqual(rep["sum_r"], 9523200)
        self.assertEqual(rep["sum_g"], 19353600)
        self.assertEqual(rep["cnt_match"], 307200)
        self.assertEqual(rep["cnt_r_ok"], 307200)


class TestRevisionDetection(unittest.TestCase):
    def test_rev1_identified_by_cnt_match_with_zero_diagnostics(self):
        rep = decode_one(rev1_report(cnt_match=27))

        self.assertEqual(rep["rev"], 1)
        self.assertEqual(rep["cnt_r_ok"], 0)
        self.assertEqual(rep["cnt_g_ok"], 0)

    def test_rev2_identified_by_diagnostic_slots(self):
        rep = decode_one(rev2_report())

        self.assertEqual(rep["rev"], 2)
        self.assertEqual(rep["cnt_ord_ok"], 24)
        self.assertEqual(rep["cnt_hue_ok"], 16)
        self.assertEqual(rep["cnt_sat_ok"], 16)
        self.assertEqual(rep["cnt_tone_ok"], 8)

    def test_rev3_identified_by_explicit_rev_slot(self):
        rep = decode_one(rev3_report())

        self.assertEqual(rep["rev_slot"], 3)
        self.assertEqual(rep["rev"], 3)
        self.assertEqual(rep["cnt_match"], 8)
        self.assertFalse(rep["hue_tone_trusted"])

    def test_rev4_identified_by_explicit_rev_slot(self):
        rep = decode_one(rev4_report())

        self.assertEqual(rep["rev_slot"], 4)
        self.assertEqual(rep["rev"], 4)
        self.assertTrue(rep["hue_tone_trusted"])
        self.assertEqual(rep["max_px"], 399)
        self.assertEqual(rep["max_py"], 299)
        self.assertIsNone(rep["center_pixel"])
        self.assertEqual(rep["max_r5"], 31)

    def test_rev4_slot5_is_not_decoded_as_center_pixel(self):
        # (320, 240) la gia tri center_pixel cua rev 3. Neu tool con doc slot 5
        # theo nghia cu tren rev 4, no se bao max_px=320/max_py=240 (khung bi
        # cat) thay vi 639/479.
        rep = decode_one(rev4_report(max_px=320, max_py=240))

        self.assertEqual(rep["max_px"], 320)
        self.assertEqual(rep["max_py"], 240)
        self.assertIsNone(rep["center_pixel"])

    def test_no_evidence_gives_rev_zero_not_a_guess(self):
        # Mau la hoan toan: khong match va khong chi tieu nao dat. Khong du can cu
        # de noi la rev 1 hay rev 2 -> phai tra 0, khong duoc doan.
        rep = decode_one(build_pixel_report(
            1, pix_count=10, sum_r=10, sum_g=100, sum_b=100,
            cnt_match=0, center_pixel=0, max_r5=3))

        self.assertEqual(rep["rev"], 0)
        self.assertFalse(rep["rev_known"])

    def test_rev2_frame_with_all_zero_diagnostics_inherits_file_rev(self):
        # Frame rev 2 toan mau la: 4 chi tieu = 0. Bang chung rev phai lay tu
        # frame khac trong cung file (mot file = mot bitstream).
        zero_diag = (1, decode_report(parse_frames(
            build_pixel_report(1, pix_count=10, sum_r=10, sum_g=100, sum_b=100,
                               cnt_match=0, center_pixel=0, max_r5=3))[0][0]))
        clear = (2, decode_report(parse_frames(rev2_report())[0][0]))
        self.assertEqual(zero_diag[1]["rev"], 0)

        self.assertEqual(infer_file_rev([clear, zero_diag]), 2)
        self.assertEqual(infer_file_rev([zero_diag]), 0)

    def test_rev3_wins_over_older_revisions_in_same_file(self):
        rev2 = (1, decode_report(parse_frames(rev2_report())[0][0]))
        rev3 = (2, decode_report(parse_frames(rev3_report())[0][0]))
        self.assertEqual(infer_file_rev([rev2, rev3]), 3)

    def test_rev4_wins_over_older_revisions_in_same_file(self):
        rev3 = (1, decode_report(parse_frames(rev3_report())[0][0]))
        rev4 = (2, decode_report(parse_frames(rev4_report())[0][0]))
        self.assertEqual(infer_file_rev([rev3, rev4]), 4)

    def test_rev1_never_wins_when_file_has_rev2_evidence(self):
        rev1 = (1, decode_report(parse_frames(rev1_report())[0][0]))
        rev2 = (2, decode_report(parse_frames(rev2_report())[0][0]))
        self.assertEqual(infer_file_rev([rev1, rev2]), 2)

    def test_batch_inference_prefers_rev1_when_only_rev1_evidence(self):
        rev1 = (1, decode_report(parse_frames(rev1_report())[0][0]))
        unknown = (2, decode_report(parse_frames(build_pixel_report(
            3, pix_count=1, sum_r=0, sum_g=0, sum_b=0, cnt_match=0,
            center_pixel=0, max_r5=0))[0][0]))
        self.assertEqual(infer_file_rev([rev1, unknown]), 1)


class TestVerdicts(unittest.TestCase):
    def verdict(self, rep, name):
        for v in evaluate(rep):
            if v["name"] == name:
                return v
        raise AssertionError(f"khong co verdict {name!r}")

    def test_rev2_emits_channel_breakdown(self):
        rep = decode_one(rev2_report())
        rep["file_rev"] = 2

        names = {v["name"] for v in evaluate(rep)}
        self.assertIn("[thông tin] Loại theo dải hue 10..40 độ", names)
        self.assertIn("[thông tin] Loại theo bão hoà S>=0,80", names)
        self.assertNotIn("[thông tin] Đây là rev 1 — ngưỡng chặt hơn blob", names)

    def test_rev3_flags_hue_and_tone_as_untrustworthy(self):
        # Rev 3 tràn 8 bit: hue/tone đếm cả pixel lạnh. Tool phải nói rõ, không
        # được trình bày chúng như số liệu hợp lệ.
        rep = decode_one(rev3_report())
        rep["file_rev"] = 3

        verdicts = evaluate(rep)
        names = {v["name"] for v in verdicts}
        self.assertTrue(any("tràn 8 bit" in n for n in names), names)
        self.assertNotIn("[thông tin] Loại theo dải hue 10..40 độ", names)

        warn = [v for v in verdicts if "tràn 8 bit" in v["name"]][0]
        self.assertFalse(warn["ok"], "cảnh báo phải là FAIL, không phải thông tin")

    def test_rev4_reports_ratio_filter_breakdown(self):
        rep = decode_one(rev4_report())
        rep["file_rev"] = 4

        names = {v["name"] for v in evaluate(rep)}
        self.assertIn("[thông tin] Tỉ lệ khớp đủ điều kiện", names)
        self.assertIn("[thông tin] Loại theo dải hue 10..40 độ", names)
        self.assertIn("[thông tin] Loại theo độ sáng + chroma", names)
        details = {v["name"]: v["detail"] for v in evaluate(rep)}
        self.assertIn("cùng bộ lọc với blob",
                      details["[thông tin] Tỉ lệ khớp đủ điều kiện"])

    def test_rev4_flags_truncated_frame(self):
        rep = decode_one(rev4_report(max_px=399, max_py=186))
        rep["file_rev"] = 4

        verdict = self.verdict(rep, "Khung đầy đủ (max_px=399, max_py=299)")
        self.assertFalse(verdict["ok"])
        self.assertIn("187/300", verdict["detail"])
        self.assertIn("FRAME BỊ CẮT", verdict["detail"])

    def test_rev4_full_frame_passes_geometry_check(self):
        rep = decode_one(rev4_report(max_px=399, max_py=299))
        rep["file_rev"] = 4

        self.assertTrue(
            self.verdict(rep, "Khung đầy đủ (max_px=399, max_py=299)")["ok"])

    def test_rev5_decodes_vsync_and_href_slots(self):
        rep = decode_one(rev5_report(vsync_per_rep=2, href_per_vs=250))
        rep["file_rev"] = 5

        self.assertEqual(rep["rev"], 5)
        self.assertEqual(rep["max_px"], 399)
        self.assertEqual(rep["max_py"], 299)
        self.assertEqual(rep["vsync_per_rep"], 2)
        self.assertEqual(rep["href_per_vs"], 250)
        self.assertEqual(rep["max_r5"], 31)
        self.assertIsNone(rep["center_pixel"])

    def test_rev5_flags_vsync_glitch(self):
        # vsync_per_rep >= 2 = co xung VSYNC khong mang pixel -> co che (B).
        rep = decode_one(rev5_report(vsync_per_rep=2, href_per_vs=250))
        rep["file_rev"] = 5

        verdict = self.verdict(rep, "F-10: VSYNC giữa khung")
        self.assertFalse(verdict["ok"])
        self.assertIn("Cơ chế (B)", verdict["detail"])

    def test_rev5_flags_fpga_pixel_loss(self):
        # sensor phat 300 dong nhung chi 100 dong co pixel -> co che (C).
        rep = decode_one(rev5_report(vsync_per_rep=1, href_per_vs=300,
                                     pix_count=40000))
        rep["file_rev"] = 5

        verdict = self.verdict(rep, "F-10: sensor phát đủ dòng, FPGA rớt pixel")
        self.assertFalse(verdict["ok"])
        self.assertIn("Cơ chế (C)", verdict["detail"])

    def test_rev5_flags_sensor_self_truncation(self):
        # sensor chi phat 100 dong va ca 100 dong deu co pixel -> co che (A).
        rep = decode_one(rev5_report(vsync_per_rep=1, href_per_vs=100,
                                     pix_count=40000))
        rep["file_rev"] = 5

        verdict = self.verdict(rep, "F-10: sensor tự cắt frame")
        self.assertFalse(verdict["ok"])
        self.assertIn("Cơ chế (A)", verdict["detail"])

    def test_rev1_marks_count_as_incomparable_with_blob(self):
        rep = decode_one(rev1_report())
        rep["file_rev"] = 1

        names = {v["name"] for v in evaluate(rep)}
        self.assertIn("[thông tin] Đây là rev 1 — ngưỡng chặt hơn blob", names)
        self.assertNotIn("[thông tin] Loại theo kênh G", names)

    def test_perfect_red_frame_passes_all_three_criteria(self):
        rep = decode_one(build_pixel_report(
            1, pix_count=307200, sum_r=307200 * 31, sum_g=307200 * 4,
            sum_b=307200 * 1, cnt_match=307200, center_pixel=0xF800, max_r5=31,
            r_ok=307200, g_ok=307200, b_ok=307200, rg_ok=307200))
        rep["file_rev"] = 2

        for name in ("R trung binh > 240/255", "G trung binh < 32/255",
                     "B trung binh < 32/255"):
            self.assertTrue(self.verdict(rep, name)["ok"], name)

    def test_background_frame_fails_mean_criteria(self):
        rep = decode_one(rev1_report())
        rep["file_rev"] = 1

        self.assertFalse(self.verdict(rep, "R trung binh > 240/255")["ok"])


class TestCommandLine(unittest.TestCase):
    def run_main(self, tmpdir, raw, *extra):
        path = os.path.join(tmpdir, "capture.bin")
        with open(path, "wb") as fh:
            fh.write(raw)
        out = io.StringIO()
        old = sys.stdout
        sys.stdout = out
        try:
            code = main(["--file", path, *extra])
        finally:
            sys.stdout = old
        return code, out.getvalue()

    def test_rev1_file_prints_rev1_and_does_not_crash(self):
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            code, text = self.run_main(tmp, rev1_report() + rev1_report(ts=1001))

        self.assertEqual(code, 2)
        self.assertIn("rev 1", text)
        self.assertIn("KHÔNG so được với blob", text)
        self.assertNotIn("chẩn đoán", text)

    @unittest.skipUnless(sys.platform == "win32", "chi Windows co console cp1252")
    def test_unicode_report_does_not_raise_on_cp1252_console(self):
        """Loi da gap: print chu 'cung' tren console cp1252 lam tool crash.

        Chay that file script trong tien trinh con voi PYTHONIOENCODING=cp1252 de
        tai hien console Windows mac dinh. Truoc khi co wrapper UTF-8, lan chay
        nay nem UnicodeEncodeError o `print_report`.
        """
        import subprocess
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "capture.bin")
            with open(path, "wb") as fh:
                fh.write(rev2_report())
            env = dict(os.environ, PYTHONIOENCODING="cp1252")
            proc = subprocess.run(
                [sys.executable, "-B", str(REPO_ROOT / "scripts" / "manual"
                                            / "decode_pixel_diag.py"),
                 "--file", path],
                capture_output=True, env=env, check=False)

        stderr = proc.stderr.decode("utf-8", errors="replace")
        self.assertNotIn("UnicodeEncodeError", stderr)
        self.assertEqual(proc.returncode, 2, stderr)

    def test_rev2_file_prints_channel_diagnostics(self):
        import tempfile

        raw = rev2_report() + build_pixel_report(
            2001, pix_count=307200, sum_r=307200 * 31, sum_g=307200 * 4,
            sum_b=307200 * 1, cnt_match=307200, center_pixel=0xF800, max_r5=31,
            r_ok=307200, g_ok=307200, b_ok=307200, rg_ok=307200)
        with tempfile.TemporaryDirectory() as tmp:
            code, text = self.run_main(tmp, raw)

        self.assertEqual(code, 0)
        self.assertIn("rev 2", text)
        self.assertIn("chẩn đoán", text)

    def test_unknown_revision_refuses_to_conclude(self):
        import tempfile

        raw = build_pixel_report(
            1, pix_count=10, sum_r=10, sum_g=100, sum_b=100,
            cnt_match=0, center_pixel=0, max_r5=3)
        with tempfile.TemporaryDirectory() as tmp:
            code, text = self.run_main(tmp, raw)

        self.assertIn("KHONG xac dinh duoc rev", text)
        self.assertEqual(code, 2)

    def test_json_output_is_valid_and_contains_all_reports(self):
        import json
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            code, text = self.run_main(
                tmp, rev1_report() + rev1_report(ts=1001), "--json", "--all")

        self.assertEqual(code, 2)
        payload = json.loads(text[text.index("[", text.index("NHAC")):])
        self.assertEqual(len(payload), 2)
        self.assertEqual(payload[0]["report"]["pix_count"], 1000)


class TestRealRev1Capture(unittest.TestCase):
    """Bang chung that: capture 03/11/2026 phai nhan dien la rev 1."""

    @unittest.skipUnless(REV1_CAPTURE.is_file(), "khong co capture rev 1")
    def test_real_rev1_capture_is_identified(self):
        raw = REV1_CAPTURE.read_bytes()
        frames, crc_err = parse_frames(raw)
        reports = [(i, decode_report(fr)) for i, fr in enumerate(frames)]
        reports = [(i, r) for i, r in reports if r is not None and r["pix_count"] > 0]

        self.assertEqual(crc_err, 0)
        self.assertEqual(len(frames), 43)
        self.assertEqual(infer_file_rev(reports), 1)


if __name__ == "__main__":
    unittest.main()
