import os
import sys
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.enum.text import PP_ALIGN
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE

# Initialize 16:9 widescreen presentation
prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)

# Color Palette: Clean Engineering White Theme
C_BG = RGBColor(255, 255, 255)          # Pure White
C_CARD_BG = RGBColor(248, 250, 252)     # #F8FAFC Subtle Gray Card
C_CARD_BORDER = RGBColor(203, 213, 225) # #CBD5E1 Slate Border
C_TEXT_MAIN = RGBColor(15, 23, 42)      # #0F172A Near Black
C_TEXT_MUTED = RGBColor(71, 85, 105)    # #475569 Slate Muted
C_TEXT_LIGHT = RGBColor(100, 116, 139)  # #64748B Light Slate
C_ACCENT = RGBColor(234, 88, 12)        # #EA580C Rescue Orange
C_BLUE = RGBColor(2, 132, 199)          # #0284C7 Tech Blue
C_GREEN = RGBColor(22, 163, 74)         # #16A34A Verified Green
C_LINE = RGBColor(15, 23, 42)

blank_layout = prs.slide_layouts[6]

def add_clean_slide(badge_text, title_text, slide_num_str, time_str=""):
    slide = prs.slides.add_slide(blank_layout)
    
    # White background
    bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(0), Inches(13.333), Inches(7.5))
    bg.fill.solid()
    bg.fill.fore_color.rgb = C_BG
    bg.line.fill.background()

    # Header textbox
    tb = slide.shapes.add_textbox(Inches(0.8), Inches(0.4), Inches(10.2), Inches(1.1))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0
    
    # Category badge
    p_badge = tf.paragraphs[0]
    p_badge.text = badge_text.upper()
    p_badge.font.size = Pt(10)
    p_badge.font.bold = True
    p_badge.font.color.rgb = C_ACCENT
    
    # Slide Title
    p_title = tf.add_paragraph()
    p_title.text = title_text
    p_title.font.size = Pt(21)
    p_title.font.bold = True
    p_title.font.color.rgb = C_TEXT_MAIN

    # Right indicator (time + slide number)
    num_box = slide.shapes.add_textbox(Inches(11.0), Inches(0.4), Inches(1.533), Inches(0.8))
    ntf = num_box.text_frame
    ntf.margin_left = ntf.margin_top = ntf.margin_right = ntf.margin_bottom = 0
    np = ntf.paragraphs[0]
    np.text = f"{time_str}  |  {slide_num_str}" if time_str else slide_num_str
    np.alignment = PP_ALIGN.RIGHT
    np.font.size = Pt(11)
    np.font.bold = True
    np.font.color.rgb = C_TEXT_MUTED

    # Clean dividing line
    line = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.8), Inches(1.45), Inches(11.733), Inches(0.015))
    line.fill.solid()
    line.fill.fore_color.rgb = C_LINE
    line.line.fill.background()

    return slide

def add_card(slide, left, top, width, height, title, items, border_color=C_CARD_BORDER, left_bar_color=None):
    # Main card shape
    card = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(left), Inches(top), Inches(width), Inches(height))
    card.fill.solid()
    card.fill.fore_color.rgb = C_CARD_BG
    card.line.color.rgb = border_color
    card.line.width = Pt(1)

    # Left accent bar if specified
    if left_bar_color:
        bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(left), Inches(top), Inches(0.08), Inches(height))
        bar.fill.solid()
        bar.fill.fore_color.rgb = left_bar_color
        bar.line.fill.background()

    tb = slide.shapes.add_textbox(Inches(left + 0.25), Inches(top + 0.18), Inches(width - 0.45), Inches(height - 0.36))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0

    p_head = tf.paragraphs[0]
    p_head.text = title
    p_head.font.size = Pt(14)
    p_head.font.bold = True
    p_head.font.color.rgb = C_TEXT_MAIN
    p_head.space_after = Pt(8)

    for item in items:
        p = tf.add_paragraph()
        p.text = "• " + item
        p.font.size = Pt(11)
        p.font.color.rgb = C_TEXT_MUTED
        p.space_after = Pt(5)

# ==========================================
# SLIDE 1: BÌA ĐỊNH VỊ ĐỀ TÀI
# ==========================================
s1 = prs.slides.add_slide(blank_layout)
bg1 = s1.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(0), Inches(13.333), Inches(7.5))
bg1.fill.solid()
bg1.fill.fore_color.rgb = C_BG
bg1.line.fill.background()

tb1 = s1.shapes.add_textbox(Inches(1.0), Inches(1.2), Inches(11.333), Inches(5.0))
tf1 = tb1.text_frame
tf1.word_wrap = True

p = tf1.paragraphs[0]
p.text = "CUỘC THI THIẾT KẾ FPGA VÀ MCU MỞ RỘNG KHU VỰC MIỀN TRUNG 2026"
p.font.size = Pt(11)
p.font.bold = True
p.font.color.rgb = C_ACCENT
p.space_after = Pt(14)

p2 = tf1.add_paragraph()
p2.text = "KVC — HỆ THỐNG TẢI NHIỆM VỤ UAV TÌM KIẾM CỨU NẠN BÃO LŨ"
p2.font.size = Pt(28)
p2.font.bold = True
p2.font.color.rgb = C_TEXT_MAIN
p2.space_after = Pt(10)

p3 = tf1.add_paragraph()
p3.text = "Thiết kế tích hợp FPGA Gowin GW2A (Thị giác biên) và MCU Sonix SN34F788 (Định vị 3D) kết hợp truyền tin vô tuyến LoRa 433 MHz"
p3.font.size = Pt(15)
p3.font.color.rgb = C_TEXT_MUTED
p3.space_after = Pt(24)

p4 = tf1.add_paragraph()
p4.text = "BA ĐỊNH VỊ CỐT LÕI:\n• Tải nhiệm vụ (Payload) độc lập, không can thiệp Flight Controller\n• Vận hành 100% Offline, không phụ thuộc Internet mặt đất\n• Gói tin 32 byte nhị phân thay cho luồng video băng thông cao"
p4.font.size = Pt(12)
p4.font.color.rgb = C_TEXT_MAIN
p4.space_after = Pt(24)

p5 = tf1.add_paragraph()
p5.text = "Đơn vị: Đội KVC — Đại học Bách Khoa – Đại học Đà Nẵng\nThành viên: Nguyễn Tất Vững (Lead) • Duy Phong • Trường Thịnh • Trung Kiên • Mạnh Cường"
p5.font.size = Pt(11.5)
p5.font.color.rgb = C_TEXT_LIGHT

# ==========================================
# SLIDE 2: BÀI TOÁN & RÀNG BUỘC
# ==========================================
s2 = add_clean_slide("Khối 1: Tổng quan", "Bài toán cứu nạn thực địa và ràng buộc thiết kế", "02/15", "1:30")
add_card(s2, 0.8, 1.8, 5.65, 5.0, "Ba nút thắt cứu nạn bão lũ miền Trung", [
    "Hạ tầng tê liệt: Mất điện lưới, trạm BTS ngập úng, không có sóng 4G/5G/Internet.",
    "Nghịch lý video số: Video HD cần hàng Mbps, sóng cao tần bị mưa bão suy hao cực nặng, trễ lớn hoặc đứt sóng.",
    "Áp lực thời gian: Cứu hộ viên cần tọa độ trong vài phút, không cần video đẹp; mắt người không quét kịp diện rộng.",
    "So sánh băng thông: Truyền video HD (Mbps) vs Truyền tọa độ biên (vài chục bps)."
], left_bar_color=C_ACCENT)

add_card(s2, 6.85, 1.8, 5.65, 5.0, "Ràng buộc thiết kế & Phạm vi PoC", [
    "Ràng buộc kỹ thuật: Xử lý ảnh tại biên; gói tin siêu nhỏ (Zero-Video); trạm đất tự chủ nguồn pin; offline hoàn toàn.",
    "Phạm vi trong PoC (Có thể kiểm chứng):",
    "  • Nhận diện trên video lũ có sẵn [SOURCE-VERIFIED]",
    "  • Thử nghiệm bể bơi chứng minh luồng [SIMULATED]",
    "  • Vận hành trực tiếp tại bàn thi, KHÔNG DÙNG SA BÀN.",
    "Ngoài phạm vi PoC: Khung bay drone, chứng nhận hàng không DO-254/DO-178C, chống nước IP67."
], left_bar_color=C_BLUE)

# ==========================================
# SLIDE 3: KIẾN TRÚC TỔNG THỂ HAI NỬA
# ==========================================
s3 = add_clean_slide("Khối 1: Tổng quan", "Kiến trúc tổng thể: Hai nửa hệ thống và bus vật lý", "03/15", "2:00")
add_card(s3, 0.8, 1.8, 5.65, 5.0, "Phân định phần cứng & Bus truyền dẫn", [
    "AIR UNIT (TẢI UAV):",
    "  ① Camera OV2640 DVP 8-bit nối FPGA OneKiwi 20K.",
    "  ② FPGA nối MCU Sonix qua UART 38.400 bps + DATA_READY.",
    "  ③ Cảm biến: Siêu âm (UART 9600), IMU (I2C0 400k), GNSS (UART 9600).",
    "  ④ MCU nối module LoRa Ra-02 TX qua SPI + DIO0.",
    "KÊNH VÔ TUYẾN: Sóng LoRa 433 MHz (Khung nhị phân 32 byte).",
    "GROUND STATION (TRẠM ĐẤT):",
    "  ⑤ LoRa Ra-02 RX nối Gateway ESP32-C3 qua SPI.",
    "  ⑥ ESP32-C3 nối Laptop GCS qua Wi-Fi SoftAP / WebSocket v1.",
    "Kênh phụ IF-05: ESP32-S3-CAM phát MJPEG Wi-Fi (nét đứt, không qua LoRa)."
], left_bar_color=C_BLUE)

add_card(s3, 6.85, 1.8, 5.65, 5.0, "Bảng phân công nhiệm vụ 5 khối cốt lõi", [
    "FPGA Primer 20K: Trích xuất BBox streaming từ pixel [HARDWARE-VERIFIED]",
    "MCU Sonix M4F: Dung hợp cảm biến, giải định vị 3D [BUILT]",
    "LoRa Ra-02 (SX1278): Truyền telemetry 32 byte xuyên bão [HARDWARE-VERIFIED TX]",
    "ESP32-C3 Gateway: Thu RF, OLED hiện trường, SoftAP [BUILT]",
    "Laptop GCS: Dashboard, SQLite WAL, Nhật ký phiên [SOURCE-VERIFIED]",
    "Kênh phụ IF-05: Mắt nhìn video phụ trợ, không sinh tọa độ."
], left_bar_color=C_GREEN)

# ==========================================
# SLIDE 4: NGUYÊN LÝ CỐT LÕI
# ==========================================
s4 = add_clean_slide("Khối 1: Tổng quan", "Nguyên lý cốt lõi: Chỉ truyền kết luận, không truyền video", "04/15", "1:15")
add_card(s4, 0.8, 1.8, 5.65, 5.0, "Linh hồn thiết kế của đề tài KVC", [
    "CÂU CHỐT CỐT LÕI:\n'Biến một luồng video thành một tọa độ trong 32 byte.'",
    "Ba tầng giá trị thiết kế:",
    "  • Giảm băng thông 5 bậc độ lớn: từ hàng triệu bps xuống đúng 256 bps.",
    "  • Giảm phụ thuộc chất lượng sóng: đường truyền video mất, cứu hộ vẫn chạy.",
    "  • Vẫn bảo đảm đủ 100% dữ liệu để triển khai đội cứu nạn.",
    "Ranh giới an toàn: Payload không can thiệp điều khiển bay, không arm/disarm, không waypoint."
], left_bar_color=C_ACCENT)

add_card(s4, 6.85, 1.8, 5.65, 5.0, "Chuỗi chuyển hóa 4 bước dữ liệu", [
    "1. Ảnh quang học thô: OV2640 DVP 640×480 RGB565 (~614 KB/khung).",
    "2. Tọa độ BBox: Trích xuất song song trên FPGA (Khung 18 Byte IF-01).",
    "3. Tọa độ cứu nạn 3D: MCU giải giao điểm mặt nước (Khung 32 Byte IF-02).",
    "4. Hành động cứu hộ: Xuất ca-nô tiếp cận nạn nhân tức thì.",
    "Ẩn dụ kiến trúc:",
    "  • FPGA = Mắt & Não trích xuất | MCU = Định vị & Đóng gói",
    "  • LoRa = Dây dẫn vô tuyến | ESP32 = Cổng vào | Laptop = Bản đồ chỉ huy"
], left_bar_color=C_BLUE)

# ==========================================
# SLIDE 5: TẢI UAV (1) - FPGA
# ==========================================
s5 = add_clean_slide("Khối 2: Thiết kế tải UAV", "Tải UAV (1) — FPGA OneKiwi Primer 20K + OV2640", "05/15", "2:15")
add_card(s5, 0.8, 1.8, 5.65, 5.0, "Pipeline xử lý RTL & Số đo thực nghiệm", [
    "Pipeline: OV2640 DVP -> Camera RX -> Resize 160×160 -> kvc_blob_detect -> NMS MAX_BOXES=12 -> FIFO CDC -> UART 38.400 bps.",
    "Thuật toán kvc_blob_detect.v: Phân ngưỡng RGB565 + color dominance streaming từ pixel thật (không mock).",
    "Tài nguyên tối ưu: Tiêu thụ đúng 0 BSRAM, 0 khối DSP (1.616 LUTs / 20.736).",
    "Số đo Timing: Fmax 113,277 MHz, TNS = 0. Suite 22/22 Testbench PASS.",
    "Đo kiểm bo thật: MCU nhận 720 Byte (BB v1 crc0), fe=0, oe=0, drop=0. [HARDWARE-VERIFIED]"
], left_bar_color=C_GREEN)

add_card(s5, 6.85, 1.8, 5.65, 5.0, "Giới hạn kỹ thuật trung thực (Bắt buộc công bố)", [
    "Bitstream chưa chứa YOLO11n: Hiện chạy thuật toán Blob detect streaming; mô hình YOLO11n INT8 đang hoàn thiện pipeline nạp Flash.",
    "Nhận diện đối tượng: Blob hiện chỉ nhận vùng màu cam, luôn gán class_id = 2; chưa nhận diện hình dáng 'người'.",
    "Dải phát hiện thực tế: 1,5 – 15,0 m AGL [SIMULATED] (tính theo mô hình hình học).",
    "Nhịp khung hình thực tế: Đường blob đạt 5,08 – 7,48 frame/s do nhịp VSYNC camera quyết định (không phải 100 Hz của mock)."
], left_bar_color=C_ACCENT)

# ==========================================
# SLIDE 6: TẢI UAV (2) - MCU & ĐỊNH VỊ
# ==========================================
s6 = add_clean_slide("Khối 2: Thiết kế tải UAV", "Tải UAV (2) — MCU Sonix + Cảm biến + Định vị 3D", "06/15", "2:15")
add_card(s6, 0.8, 1.8, 5.65, 5.0, "Thuật toán chiếu tia 3D (Ray-Plane Intersection)", [
    "Công thức cốt lõi:\n  p_local = t_cam + λ · R_cam · v_pixel\n(Trong đó λ giải từ giao điểm tia quang học với mặt nước Z = 0).",
    "Luồng xử lý bare-metal: Parser UART1 + Ring buffer SPSC 4096B -> Đồng bộ timestamp -> AHRS MPU-6050 -> Chiếu tia 3D -> Đóng gói LoRa.",
    "Bù góc nghiêng IMU: Chùm siêu âm mở rộng ~75° (vệt đo 4,6 m @ 3 m). Cần Roll/Pitch để triệt tiêu chao đảo cánh bay.",
    "Quy tắc an toàn: Thiếu điều kiện -> POS_VALID = 0 -> Hiển thị INVALID/N/A, tuyệt đối không gán tọa độ giả."
], left_bar_color=C_BLUE)

add_card(s6, 6.85, 1.8, 5.65, 5.0, "Cụm cảm biến & Bằng chứng kiểm thử", [
    "AJ-SR04M: Siêu âm chống nước IP67; trần đo nâng 700 cm (B-7); cờ alt_quality GOOD/FAIR/POOR. [HARDWARE-VERIFIED]",
    "GY-87 (MPU-6050): I2C0 400k, Roll/Pitch bù nghiêng; hoãn la bàn HMC; loại bỏ BMP180. [BUILT]",
    "NEO-M10: UART 9600, WGS-84, tính Yaw từ course khi bay ngang >= 0,5 knot. [BUILT]",
    "Hiện trạng Firmware: Keil rebuild 0 Error / 8 Warning; Host test 9/9 PASS; Đã bring-up kit Sonix thật."
], left_bar_color=C_CARD_BORDER)

# ==========================================
# SLIDE 7: TẢI UAV (3) - LORA 32 BYTE
# ==========================================
s7 = add_clean_slide("Khối 2: Thiết kế tải UAV", "Tải UAV (3) — Đóng gói LoRa 32 byte (Hợp đồng IF-02)", "07/15", "1:30")
add_card(s7, 0.8, 1.8, 5.65, 5.0, "Bố cục khung wire IF-02 (32 byte Little-Endian)", [
    "Byte 0–1: Sync Header 0xAA 0x55",
    "Byte 2–3: Msg ID (0x01/0x02) & Sequence (0..255)",
    "Byte 4–7: Timestamp MCU tải (ms)",
    "Byte 8–15: Tọa độ WGS-84 mục tiêu (Lat / Lon x 10^7)",
    "Byte 16–19: Tọa độ Local mục tiêu X / Y (cm)",
    "Byte 20–21: Cự ly siêu âm đo nước (cm, trần 700 cm)",
    "Byte 22–23: Class ID (1=person, 2=lifebuoy) & Conf (0..100)",
    "Byte 24–25: Cờ trạng thái 8-bit & Status Reserved (luôn 0, bỏ đo pin)",
    "Byte 26–29: Dự phòng góc IMU | Byte 30–31: Checksum CRC-16",
    "ABI phê duyệt: HUMAN duyệt 29/10/2026. Golden vector: 0xE260."
], left_bar_color=C_CARD_BORDER)

add_card(s7, 6.85, 1.8, 5.65, 5.0, "Tính toán Airtime & Kỷ luật truyền thông", [
    "Cấu hình RF 433 MHz: BW = 125 kHz, SF7/SF8, CR = 4/5, Preamble 8, Ra-02 SX1278.",
    "Thời gian chiếm sóng (Airtime):",
    "  • Tại SF7: Đúng 71,9 ms/gói 32 byte.",
    "  • Tại SF8: Đúng 133,6 ms/gói 32 byte.",
    "Tần suất phát quy định:",
    "  • Heartbeat: 1 Hz (đang chạy trong firmware).",
    "  • Target Event: 2–5 Hz khi có mục tiêu [DESIGN].",
    "Cảnh báo kỹ thuật: Không phát 10 Hz — 10 Hz chiếm tới 71,9% airtime (SF7) và vượt 100% (SF8), gây nghẽn vô tuyến."
], left_bar_color=C_ACCENT)

# ==========================================
# SLIDE 8: GATEWAY (1) - ESP32-C3
# ==========================================
s8 = add_clean_slide("Khối 3: Thiết kế trạm mặt đất", "Gateway (1) — ESP32-C3 + LoRa RX: Độc lập dã chiến", "08/15", "1:30")
add_card(s8, 0.8, 1.8, 5.65, 5.0, "Nguyên tắc: 'Hệ thống không chết khi Laptop chết'", [
    "Nguồn điện độc lập: Pin Li-ion 18650 2S (7.4V) + Buck MP1584 5V + Tụ lọc 220 µF. Không lấy nguồn từ laptop.",
    "Màn hình OLED 0.96 inch: Đọc trực tiếp phần cứng RSSI (0x1A), SNR (0x19), số gói nhận và tọa độ cứu hộ ngoài trời.",
    "Chuỗi xử lý ngắt: DIO0 IRQ -> SPI đọc 32B -> Kiểm CRC-16 -> Đọc RSSI/SNR -> Xuất OLED -> Đẩy WebSocket v1.",
    "Tác dụng thực địa: Cứu hộ viên đọc được tọa độ nạn nhân ngay trên tay mà chưa cần mở máy tính."
], left_bar_color=C_GREEN)

add_card(s8, 6.85, 1.8, 5.65, 5.0, "Chính sách mạng & Trạng thái thẩm định", [
    "Chính sách mạng hai tầng linh hoạt:",
    "  • Ưu tiên 1 (STA Mode): Tự bắt vào Wi-Fi trạm cứu hộ.",
    "  • Ưu tiên 2 (SoftAP Fallback): Tự phát mạng KVC_GROUND_STATION (192.168.4.1), tự đóng khi STA nối lại.",
    "Phương án cắm dây: Cắm cáp USB Serial trực tiếp vào laptop khi không dùng Wi-Fi.",
    "Hiện trạng xác thực:",
    "  • Host test rf_decode / net_policy PASS. PlatformIO build 0 Error.",
    "  • LoRa TX tải bay: [HARDWARE-VERIFIED] (TxDone ok=17, fail=0).",
    "  • Gateway RX nhận sóng: [BUILT] (chờ bàn giao bo Gateway từ Thịnh)."
], left_bar_color=C_BLUE)

# ==========================================
# SLIDE 9: GATEWAY (2) - GCS BACKEND & DASHBOARD
# ==========================================
s9 = add_clean_slide("Khối 3: Thiết kế trạm mặt đất", "Gateway (2) — GCS Backend + Web Dashboard Offline", "09/15", "1:45")
add_card(s9, 0.8, 1.8, 5.65, 5.0, "Kiến trúc phần mềm & Bảo vệ dữ liệu", [
    "Luồng dữ liệu: Ingress WebSocket -> State Reducer -> WebSocket local -> Web UI.",
    "SQLite WAL mode: synchronous=FULL, commit tức thời theo sự kiện mục tiêu; chống mất dữ liệu khi mất nguồn.",
    "Nhật ký phiên (Thay Replay từ 02/11/2026): Đọc phiên đã commit, lọc actor/mức/nguồn, ẩn mục, xuất CSV.",
    "100% Offline: Thư viện Leaflet, fonts, assets đóng gói local, không gọi CDN Internet."
], left_bar_color=C_CARD_BORDER)

add_card(s9, 6.85, 1.8, 5.65, 5.0, "Giao diện Dashboard chỉ huy & Kiểm thử", [
    "Ba vùng hiển thị tác chiến trực quan:",
    "  • Radar Local: Khoảng cách và góc tương đối quanh UAV (cm).",
    "  • Bản đồ WGS-84: Tọa độ toàn cầu, ghim vị trí mục tiêu.",
    "  • Bảng danh sách mục tiêu & Cảnh báo âm thanh.",
    "Minh bạch dữ liệu: Nhãn REAL / MOCK / RELAY hiển thị trên UI.",
    "Chỉ số kiểm thử tự động:",
    "  • Frontend: 173 test / 27 file PASS, Typecheck exit 0, Lint 0 error.",
    "  • Backend: 84 test PASS (bao gồm 17 test hợp đồng IF-05)."
], left_bar_color=C_BLUE)

# ==========================================
# SLIDE 10: GATEWAY (3) - ESP32-S3-CAM
# ==========================================
s10 = add_clean_slide("Khối 3: Thiết kế trạm mặt đất", "Gateway (3) — ESP32-S3-CAM: Phân tầng năng lực hai camera", "10/15", "1:15")
add_card(s10, 0.8, 1.8, 5.65, 5.0, "Phân tầng năng lực (HUMAN duyệt 02/11)", [
    "KÊNH TỌA ĐỘ (CỐT LÕI): OV2640 -> FPGA -> MCU -> LoRa. Khóa 1 nạn nhân ưu tiên để giải định vị.",
    "KÊNH VIDEO (PHỤ TRỢ): ESP32-S3-CAM -> Wi-Fi -> GCS Relay. Hỗ trợ quan sát nhiều đối tượng bằng YOLO11n trên laptop [PC_REFERENCE], KHÔNG sinh tọa độ.",
    "Ràng buộc hình học: has_overlay luôn false — BBox từ FPGA không đúng hình học với OV3660, và hai đồng hồ lệch 100–500 ms.",
    "Nguyên tắc: Tuyệt đối không vẽ đè BBox lên video rồi coi là đồng bộ."
], left_bar_color=C_ACCENT)

add_card(s10, 6.85, 1.8, 5.65, 5.0, "Đường truyền Relay 3 tầng & Hiện trạng", [
    "Luồng dữ liệu: S3-CAM --[MJPEG cổng 81]--> Backend (video_relay.py) --[Same-Origin]--> Trình duyệt.",
    "Bảo vệ quá tải: Laptop gánh số lượng người xem, bảo vệ chip S3 trên drone không bị sập RAM.",
    "Nguồn cấp: 5V riêng LM2596 (600–800 mA).",
    "Hiện trạng xác thực:",
    "  • Build firmware: [BUILT] PlatformIO biên dịch sạch exit 0.",
    "  • Mô phỏng: [SIMULATED] Đo đạt 29,75/30 fps trên camera TCP giả.",
    "  • Bo thật: Chưa HARDWARE-VERIFIED."
], left_bar_color=C_BLUE)

# ==========================================
# SLIDE 11: GIAO TIẾP VÀ TÍCH HỢP MA TRẬN IF
# ==========================================
s11 = add_clean_slide("Khối 4: Tích hợp & Đánh giá", "Giao tiếp & Tích hợp: Kỷ luật hợp đồng ma trận IF-01…IF-05", "11/15", "1:30")
add_card(s11, 0.8, 1.8, 7.5, 5.0, "Ma trận 5 giao diện chuẩn hóa của hệ thống KVC", [
    "IF-01 (FPGA ↔ MCU): UART 38.400 bps, 8N1, N≤12, CRC-16 [HARDWARE-VERIFIED]",
    "IF-02 (MCU ↔ ESP32): LoRa 433 MHz, gói cố định 32 byte [HARDWARE-VERIFIED TX]",
    "IF-03 (ESP32 ↔ Laptop): WebSocket v1, 7 trường JSON chuẩn [SOURCE-VERIFIED]",
    "IF-04 (Backend ↔ UI): REST + WebSocket nội bộ laptop [SOURCE-VERIFIED]",
    "IF-05 (S3-CAM ↔ Backend): HTTP MJPEG cổng 81 [SIMULATED + BUILT]",
    "Ranh giới bất biến: Không tự đổi baud, layout, CRC, IRQ, pinout khi chưa có phê duyệt.",
    "Lỗi thật đã sửa (L-01): Sửa lỗi FrameExtractor ghép khung MJPEG bị cắt làm sai frame_count."
], left_bar_color=C_BLUE)

add_card(s11, 8.7, 1.8, 3.8, 5.0, "Kết quả bài Soak 30 phút", [
    "Số gói LoRa phát: 1.466 gói.",
    "Tỷ lệ mất gói: 0 fail.",
    "FPGA xuất UART: 76.750 B.",
    "Lỗi ngoại vi: fe=oe=drop=0.",
    "Reset ngoài ý muốn: 0 lần.",
    "Trạng thái: Hoạt động bền bỉ."
], left_bar_color=C_GREEN)

# ==========================================
# SLIDE 12: TRIỂN KHAI & MỨC BẰNG CHỨNG
# ==========================================
s12 = add_clean_slide("Khối 4: Tích hợp & Đánh giá", "Triển khai & Mức bằng chứng: Tạo uy tín bằng số đo thật", "12/15", "1:30")
add_card(s12, 0.8, 1.8, 5.65, 5.0, "Hạng mục ĐÃ CÓ BẰNG CHỨNG đo đạc", [
    "RTL FPGA: 22/22 TB PASS, Fmax 113,277 MHz TNS=0.",
    "FPGA -> PC (IF-01): 1.102/1.102 frame không lỗi CRC (capture_01.bin).",
    "FPGA -> MCU (IF-01): Nhận 720 B (blob) và 197.844 B (mock) fe=oe=drop=0.",
    "LoRa TX: MCU phát SX1278 TxDone ok=17, fail=0; GV-02 PASS.",
    "Soak test: Chạy ổn định 30 phút liên tục.",
    "Phần mềm GCS: 173 frontend test, 84 backend test, 9 MCU test PASS."
], left_bar_color=C_GREEN)

add_card(s12, 6.85, 1.8, 5.65, 5.0, "Hạng mục CÒN THIẾU (Minh bạch khoa học)", [
    "Mô hình AI: Bitstream hiện tại chưa nạp YOLO11n (đang chạy blob detect).",
    "Ảnh camera thật: Chờ đo xung nhịp VSYNC/PCLK trên bo thật (G6.1).",
    "Bắt gói LoRa thật: Chưa có capture frame thật giữa MCU ↔ ESP32-C3.",
    "Gateway trạm đất: ESP32-C3 nhận sóng thật chưa hoàn thành (NOT RUN).",
    "Camera phụ: ESP32-S3-CAM chưa nạp bo thật; AI chưa qua locked-test.",
    "THÔNG ĐIỆP: 'Không có tỷ lệ % hoàn thành mơ hồ — chỉ có mức bằng chứng.'"
], left_bar_color=C_ACCENT)

# ==========================================
# SLIDE 13: ĐÁNH GIÁ KẾT QUẢ - KỊCH BẢN 3 BƯỚC
# ==========================================
s13 = add_clean_slide("Khối 4: Tích hợp & Đánh giá", "Đánh giá kết quả: Kịch bản 3 hoạt động minh chứng", "13/15", "1:30")
add_card(s13, 0.8, 1.8, 3.65, 5.0, "1. Video lũ lụt có sẵn", [
    "Phân loại: [PC_REFERENCE]",
    "Nội dung: Chiếu video lũ lụt thực tế có đối tượng trôi dạt, hiển thị BBox/Conf.",
    "Đo kiểm âm tính: Có đoạn video không có người để xem báo động giả.",
    "Giới hạn: Suy luận trên laptop; không suy ra tọa độ địa lý."
], left_bar_color=C_CARD_BORDER)

add_card(s13, 4.84, 1.8, 3.65, 5.0, "2. Video thử bể bơi", [
    "Phân loại: [SIMULATED]",
    "Nội dung: Quay toàn cảnh lắp đặt gá tải thật + màn hình Dashboard cùng phiên.",
    "Minh chứng luồng: Camera -> Tải -> LoRa -> ESP32 -> Dashboard.",
    "Giới hạn: Kênh video S3-CAM là kênh riêng, không vẽ qua LoRa."
], left_bar_color=C_BLUE)

add_card(s13, 8.88, 1.8, 3.65, 5.0, "3. Test trực tiếp bàn thi", [
    "Phân loại: [LIVE HARDWARE]",
    "Không dùng sa bàn: Cấp nguồn bộ kit thật, kết nối Dashboard offline.",
    "Quy trình: Đưa đầu vào -> Quan sát chuỗi -> Thử ngắt/khôi phục link -> Xuất CSV.",
    "Quy tắc: Thiếu GNSS fix để INVALID/N/A, không gán tọa độ giả."
], left_bar_color=C_GREEN)

# ==========================================
# SLIDE 14: HẠN CHẾ VÀ HƯỚNG PHÁT TRIỂN
# ==========================================
s14 = add_clean_slide("Khối 4: Tích hợp & Đánh giá", "Hạn chế kỹ thuật & Lộ trình hoàn thiện hệ thống", "14/15", "1:15")
add_card(s14, 0.8, 1.8, 5.65, 5.0, "Bốn nhóm hạn chế thực tế & Khắc phục", [
    "AI trên FPGA: Chưa có YOLO11n; blob chỉ nhận màu cam class_id=2 -> Hướng sửa: Đưa CNN vào top (BBOX_SOURCE=2), ước tính 4–6 tuần.",
    "Định vị 3D: fx_px=554 chưa hiệu chuẩn bàn cờ; Yaw chỉ có khi bay ngang -> Hướng sửa: Hiệu chuẩn camera (G6.3); bổ sung Yaw từ GNSS.",
    "Đa mục tiêu: Gói IF-02 mới khóa 1 mục tiêu ưu tiên -> Hướng sửa: Bổ sung track registry + Kalman filter trên GCS.",
    "Phần cứng: Chưa capture frame LoRa thật giữa MCU ↔ ESP32 -> Hướng sửa: Đo PRR thực địa và nạp bo S3-CAM."
], left_bar_color=C_ACCENT)

add_card(s14, 6.85, 1.8, 5.65, 5.0, "Lộ trình triển khai (3 mốc thời gian)", [
    "Ưu tiên 2 tuần tới: Hoàn tất nạp bitstream CNN lên FPGA -> Capture gói LoRa thật hai đầu -> Locked-test AI -> Tổng duyệt live.",
    "Kế hoạch 1 tháng: Tích hợp cảm biến Optical Flow để có góc Yaw khi UAV bay đứng yên; đóng gói gá in 3D chống rung.",
    "Mở rộng dài hạn: Bản đồ vệ tinh offline có license; giao thức LoRa ACK hai chiều; đóng gói vỏ chuẩn IP65.",
    "Mục tiêu tối thượng: Sản phẩm sẵn sàng bàn giao cho các đội cứu nạn địa phương."
], left_bar_color=C_BLUE)

# ==========================================
# SLIDE 15: KẾT LUẬN & Q&A
# ==========================================
s15 = add_clean_slide("Khối 4: Tích hợp & Đánh giá", "Kết luận đề tài & Sẵn sàng giải đáp phản biện", "15/15", "0:30")
add_card(s15, 0.8, 1.8, 5.65, 5.0, "Ba khẳng định kỹ thuật có bằng chứng", [
    "Kiến trúc End-to-End hoàn chỉnh: Thiết kế trọn vẹn chuỗi thu nhận ảnh, xử lý biên, định vị không gian và truyền tin dã chiến.",
    "Nền tảng đo kiểm thực tế: Fmax 113 MHz, 197k byte UART không lỗi, 84 backend tests và 173 frontend tests PASS.",
    "Minh bạch khoa học tuyệt đối: Mọi tuyên bố đều gắn nhãn DESIGN, SIMULATED, BUILT hoặc HARDWARE-VERIFIED.",
    "THÔNG ĐIỆP KẾT LUẬN:\n'KVC biến một luồng video thành một tọa độ cứu nạn trong 32 byte — và nói rõ phần nào đã chứng minh được.'"
], left_bar_color=C_ACCENT)

add_card(s15, 6.85, 1.8, 5.65, 5.0, "Sẵn sàng cho phần Demo trực tiếp & Q&A", [
    "Ba việc đội đang tiếp tục hoàn thiện:",
    "  1. Nạp mô hình CNN INT8 vào bitstream FPGA.",
    "  2. Bắt gói tin LoRa thật giữa MCU và Gateway.",
    "  3. Đo kiểm locked-test độc lập cho mô hình nhận diện.",
    "Nhóm xin chân thành cảm ơn Ban Giám Khảo và Ban Tổ Chức Cuộc thi!",
    "Kính mời Ban Giám Khảo đặt câu hỏi và thị phạm bộ thiết bị tại bàn thi."
], left_bar_color=C_BLUE)

# ==========================================
# SLIDE D1: DỰ PHÒNG 1 (UART CHI TIẾT)
# ==========================================
sd1 = add_clean_slide("Slide dự phòng D1 (Dùng khi hỏi về mất byte / Framing)", "Khung UART FPGA ↔ MCU chi tiết & Chống tràn bộ đệm", "D1/18")
add_card(sd1, 0.8, 1.8, 5.65, 5.0, "Đặc tả khung truyền kết quả AI (IF-01)", [
    "Định dạng gói: [Sync 0x5A 0xA5 (2B)] + [Ver 1B] + [Count N<=12 (1B)] + [Timestamp 4B] + [BBox list N*8B] + [CRC-16 2B].",
    "Cấu trúc mỗi BBox 8 byte: X_center (2B) + Y_center (2B) + Width (1B) + Height (1B) + Class_ID (1B) + Conf (1B).",
    "Kích thước khung: N=0 (10 byte), N=1 blob (18 byte), N=2 (26 byte).",
    "Baudrate: 38.400 bps 8N1 (tối ưu cho clock UCLK 12 MHz, sai số 0,16%)."
], left_bar_color=C_CARD_BORDER)

add_card(sd1, 6.85, 1.8, 5.65, 5.0, "Cơ chế chống nghẽn & Sửa lỗi UART", [
    "Ngắt & Bộ đệm: Phía MCU dùng ngắt UART1 kết hợp Ring Buffer SPSC 4096 byte; không mất byte khi bận phát LoRa.",
    "Đồng bộ: Chân DATA_READY từ FPGA kéo lên mức cao để báo có frame.",
    "Lỗi P0 đã khắc phục (P1-fix): Module uart_tx cũ hạ tx_busy sớm ở đầu stop bit khiến mỗi byte chỉ có 9 bit-time -> Sửa thành bit_cnt 0..9 (đủ 10 bit-time 8N1 chuẩn)."
], left_bar_color=C_BLUE)

# ==========================================
# SLIDE D2: DỰ PHÒNG 2 (OFFSET IF-02 CHI TIẾT)
# ==========================================
sd2 = add_clean_slide("Slide dự phòng D2 (Dùng khi hỏi về CRC / Endian)", "Bảng Offset đầy đủ giao thức IF-02 & Golden Vector GV-02", "D2/18")
add_card(sd2, 0.8, 1.8, 5.65, 5.0, "Bảng 32 Byte Wire ABI IF-02", [
    "0–1 (2B): Sync Header 0xAA 0x55",
    "2 (1B): Msg ID (0x01: Target, 0x02: Heartbeat) | 3 (1B): Seq Num",
    "4–7 (4B): Timestamp MCU (uint32 ms)",
    "8–15 (8B): Target Lat / Lon WGS-84 (int32 x 10^7)",
    "16–19 (4B): Target Local X / Y (int16 cm)",
    "20–21 (2B): Cự ly siêu âm (uint16 cm, trần 700 cm)",
    "22–23 (2B): Class ID & Confidence (0..100)",
    "24–25 (2B): Sensor Status Flags & Status Reserved (luôn 0)",
    "26–29 (4B): Reserved / IMU | 30–31 (2B): CRC-16 Checksum"
], left_bar_color=C_CARD_BORDER)

add_card(sd2, 6.85, 1.8, 5.65, 5.0, "Quy tắc Endian & Golden Vector GV-02", [
    "Thứ tự byte: Toàn bộ số nguyên nhiều byte lưu theo Little-Endian.",
    "Thuật toán CRC: CRC-16/CCITT-FALSE (Poly 0x1021, Init 0xFFFF) tính trên đúng 30 byte đầu (offset 0..29).",
    "Golden Vector GV-02: Frame chuẩn có byte 25 = 0 cho kết quả CRC-16 chuẩn hóa là 0xE260.",
    "Cả MCU và ESP32 đều kiểm tra khớp mã này trước khi chấp nhận gói."
], left_bar_color=C_ACCENT)

# ==========================================
# SLIDE D3: DỰ PHÒNG 3 (STATE MACHINE MẤT LINK)
# ==========================================
sd3 = add_clean_slide("Slide dự phòng D3 (Dùng khi hỏi về mất link / Timeout)", "State Machine Reconnect WebSocket & Chính sách Stale 3 giây", "D3/18")
add_card(sd3, 0.8, 1.8, 5.65, 5.0, "Cơ chế mạng Gateway ESP32-C3", [
    "Khởi động ESP32 -> Thử kết nối STA Wi-Fi trạm cứu hộ (2.4 GHz).",
    "Nếu thành công -> Giữ chế độ STA, mở WebSocket Server.",
    "Nếu thất bại / timeout -> Tự bật SoftAP 'KVC_GROUND_STATION' (192.168.4.1), mở WebSocket Server.",
    "Tự động đóng SoftAP ngay khi STA kết nối lại.",
    "ESP32 sinh gateway_session_id ngẫu nhiên lúc boot để laptop nhận diện gateway khởi động lại."
], left_bar_color=C_BLUE)

add_card(sd3, 6.85, 1.8, 5.65, 5.0, "Chính sách xử lý mất kết nối trên GCS", [
    "Chính sách Stale 3 giây: Nếu quá 3,0 giây không nhận được gói tin mới từ gateway, Dashboard lập tức chuyển sang trạng thái STALE và cảnh báo, không hiển thị dữ liệu cũ như dữ liệu mới.",
    "Tự động kết nối lại: Client GCS tự động reconnect với Exponential Backoff (1–5 giây).",
    "Bộ đệm chống mất gói: Thiết kế mục tiêu dự kiến bộ đệm FIFO 64 gói tại ESP32 khi laptop tạm thời ngắt kết nối."
], left_bar_color=C_CARD_BORDER)

# Save file
output_dir = "docs/presentation"
os.makedirs(output_dir, exist_ok=True)
output_path = os.path.join(output_dir, "KVC_Presentation_Deck.pptx")
prs.save(output_path)
print(f"SUCCESS: 18 slides saved to {output_path}")
