# Đặc tả dự thảo: Camera Quang học ↔ FPGA OneKiwi Primer 20K

- **Mã giao diện:** `IF-CAM`
- **Hai đầu kết nối:** Cụm Camera quang học (**Trương Trung Kiên** - Chọn cáp, nguồn, gá lắp) ↔ Bo FPGA OneKiwi Primer 20K V1.1 (**Nguyễn Tất Vững** - Nhận luồng pixel và cấu hình)
- **Trạng thái:** `DRAFT / CHƯA DUYỆT`; `OV2640 DVP` là candidate chi phí thấp để bring-up giao tiếp và pipeline ảnh; `OV9782 DVP 8-bit` vẫn là candidate cần cân nhắc cho UAV chuyển động nhờ global shutter. Chưa chốt camera chính. Module, adapter, rail, VCCIO, pin map và khả năng truy cập DDR3 trên board thực chưa được hardware-verified; tài liệu này không phải hướng dẫn đấu dây.

> **Task:** `KVC-CAM-CANDIDATE-20261019-001` · Owner: Codex · Scope: cập nhật lựa chọn camera PoC và đối chiếu thông tin bộ nhớ OneKiwi giữa tài liệu · Allowed files: `docs/interfaces/IF_CAMERA_FPGA.md`, `docs/architecture/KVC_ThietKeHeThong.md`, `docs/architecture/KVC_PROJECT_STATUS.md`, `docs/hardware/fpga/CHIP_ONEKIWI_20K_GOWIN_GW2A.md` · Acceptance: phân biệt PoC giá thấp với candidate cho UAV chuyển động; ghi rõ DDR3 còn mâu thuẫn giữa trang hãng và schematic cục bộ; không chốt pinout/rail hoặc tuyên bố hardware-verified · Status: `DOC UPDATE COMPLETE` · Verification: đối chiếu Markdown/nguồn hoàn tất; `git diff --check` PASS (exit 0; chỉ cảnh báo chuẩn hóa LF/CRLF); build/test và kiểm tra camera trên board `NOT RUN` vì task chỉ cập nhật tài liệu.

---

## 1. Kết nối vật lý và Cáp giao tiếp (Physical Connector)

* **Candidate chi phí thấp cho bring-up:** module **OV2640 DVP** có breakout chân 2.54 mm, nếu đúng phiên bản đưa ra bus DVP song song. OV2640 hỗ trợ các định dạng RGB565/YUV và JPEG; RGB/YUV có thể giảm phần xử lý màu so với RAW Bayer, nhưng không chứng minh pipeline hoặc AI đã chạy. Đây là lựa chọn thử nghiệm giao tiếp, chưa phải quyết định camera chính cho UAV.
* **Candidate cho UAV chuyển động:** module **OV9782 DVP 8-bit** vẫn cần được cân nhắc vì global shutter; cần xử lý RAW Bayer. Cả OV2640 lẫn OV9782 đều chưa hardware-verified trên board này. Nếu mục tiêu là ảnh khi UAV di chuyển, không kết luận OV2640 “chuẩn nhất” chỉ từ giá.
* **Kết nối với OneKiwi:** ảnh board và hồ sơ đang có cho thấy HDMI RX/TX cùng header mở rộng, chưa xác nhận socket DVP camera chuyên dụng. Camera DVP cần adapter/cáp tới GPIO sau khi pin map được kiểm tra và phê duyệt. Module camera thay thế cho ESP32-CAM có thể là cáp FPC, không đồng nghĩa có breakout chân 2.54 mm. Không mua module MIPI-only khi cần DVP.
* **Điều kiện chọn đúng module:** xác nhận module carrier đưa ra D[7:0], PCLK, HREF, VSYNC, SCCB và clock cần thiết; xác nhận nguồn, mức logic, pull-up/level shifting và VCCIO đúng bank trước khi nối. Không suy ra pinout từ thứ tự chân header. OV2640 có thể xuất JPEG, nhưng dùng JPEG không loại bỏ yêu cầu giải mã/tiền xử lý ảnh cho model.
* **Bộ nhớ khung hình:** GW2A có 828 Kbit BSRAM nội (xấp xỉ 100 KiB); một frame VGA RGB565 cần 614.400 byte, nên BSRAM không chứa được full frame này. Trang sản phẩm OneKiwi hiện ghi 512 MB DDR3 trên board, trong khi schematic cục bộ được ghi nhận không thể hiện chip DDR3. Xem [ghi chú phần cứng](../hardware/fpga/CHIP_ONEKIWI_20K_GOWIN_GW2A.md); chỉ thiết kế dựa trên DDR3 sau khi xác minh đúng revision, linh kiện đã lắp, pin map và controller. Streaming/line buffer là phương án khác nhưng vẫn cần đánh giá RTL/tài nguyên.
* **Giá tham khảo:** mức 45.000–85.000₫ trong báo giá người dùng gửi không đủ để xác nhận đó là breakout DVP chân 2.54 mm còn hàng. Một listing OV2640 tại [Thế Giới Module](https://thegioimodule.com/module-camera-ov2640) hiển thị 220.000₫ lúc đối chiếu ngày 19/10/2026; giá và tồn kho thay đổi, cần xem ảnh/module pinout trước khi mua. Đây không phải giá BOM đã chốt.
* **Căn cứ:** [OV2640 module guide](https://wiki.sipeed.com/soft/Tang/en/Analogic/Tang_primer/hardware-overview/OV2640-camera.html) liệt kê RGB565/YUV và điện áp module tham khảo; thông số đó không xác nhận carrier đang bán. [OneKiwi Kiwi Primer 20K](https://onekiwi.vn/san-pham/kiwi-primer-20k-fpga-board/) ghi DDR3 onboard 512 MB; cần đối chiếu với schematic/revision V1.1 cục bộ trước thiết kế.

---

## 2. Bảng tín hiệu DVP tham khảo (không phải pinout OneKiwi đã xác minh)

> Bảng dưới chỉ liệt kê tên tín hiệu điển hình của đường DVP, không phải pinout hay mức điện áp của module OV2640/OV9782 cụ thể hoặc của OneKiwi. Không dùng bảng để đấu dây/cấp nguồn. Xác minh schematic/revision OneKiwi, module carrier, connector, VCCIO, mức logic và pin assignment trước khi tạo wiring hoặc constraint.

| Tín hiệu | Hướng | Mức điện áp | Mô tả chức năng |
| :--- | :---: | :---: | :--- |
| **GND** | — | 0 V | Nối đất chung theo sơ đồ kết nối đã duyệt |
| **DOVDD / AVDD / DVDD** | Nguồn | Theo module carrier | Rail I/O, analog và lõi; lấy từ carrier theo tài liệu nhà sản xuất, không cấp từ GPIO |
| **SCCB SDA / SCL** | Hai chiều / FPGA ➔ camera | Theo carrier/VCCIO đã xác minh | Cấu hình thanh ghi sensor; pull-up/level shifting theo module |
| **RESET / PWDN** | FPGA ➔ camera | Theo carrier/VCCIO đã xác minh | Tín hiệu tùy module, chỉ dùng nếu được đưa ra và đã xác nhận cực tính |
| **VSYNC / HREF** | Camera ➔ FPGA | Theo DOVDD/VCCIO đã xác minh | Đồng bộ khung và dòng ảnh |
| **D[7:0]** | Camera ➔ FPGA | Theo DOVDD/VCCIO đã xác minh | Bus dữ liệu DVP 8-bit; nội dung pixel tùy format sensor đã cấu hình |
| **PCLK** | Camera ➔ FPGA | Theo DOVDD/VCCIO đã xác minh | Clock pixel do camera phát |
| **XCLK / MCLK** | FPGA ➔ camera | Theo carrier/VCCIO đã xác minh | Clock tham chiếu camera; tần số chốt theo datasheet/module và bring-up |

---

## 3. Cấu hình chế độ hoạt động (Camera Operating Mode)

1. **Khởi tạo và cấu hình (I2C / SCCB):**
    - Với OV2640 hoặc OV9782, xác minh địa chỉ SCCB và register sequence theo đúng sensor, module và datasheet trước khi triển khai; không dùng cấu hình của module khác như bằng chứng tương thích.
    - Bring-up ban đầu ở **VGA (640 × 480)**. Crop/resize sang kích thước tensor AI là bước xử lý riêng; không giả định sensor xuất trực tiếp 640 × 640.
    - Chưa chốt tốc độ khung hình; đo theo timing, tài nguyên và pipeline thực tế trước khi ghi KPI.
2. **Định dạng dữ liệu Pixel:**
   - OV2640 có thể cấu hình RGB565/YUV/JPEG theo module/tài liệu tương ứng; ưu tiên kiểm tra RGB565/YUV cho pipeline thử nghiệm, không mặc định chế độ JPEG dùng trực tiếp cho AI.
   - OV9782 candidate xuất RAW Bayer; cần xác định thứ tự Bayer và thiết kế demosaic/đầu vào model. Không gộp hai định dạng đầu ra này thành một pipeline.

---

## 4. Trách nhiệm phối hợp giữa Kiên và Vững

* **Kiên (Phần cứng):**
  - Nếu mua PoC giá thấp, chọn đúng module OV2640 DVP breakout 2.54 mm; nếu đánh giá UAV chuyển động, so sánh với carrier OV9782 DVP. Thiết kế adapter tới header OneKiwi chỉ sau khi có pinout được duyệt; không giả định FPC cắm trực tiếp lên bo.
  - Cố định gá camera vững chắc trên thân tải, không để rung lắc hoặc gập gãy cáp khi UAV di chuyển.
  - Đối chiếu rail/logic theo datasheet đúng sensor và schematic carrier; đo điện áp trước khi nối FPGA, kiểm tra tương thích với VCCIO của GPIO bank.
* **Vững (FPGA):**
  - Chỉ tạo clock/configuration sau khi xác minh camera và pin map đã chọn.
  - Đánh giá buffering bằng bộ nhớ đã xác minh trên board thực; xử lý mâu thuẫn giữa trang sản phẩm OneKiwi (512 MB DDR3) và schematic V1.1 cục bộ trước khi chốt frame-buffer/controller. Nếu DDR3 chưa được xác minh, thiết kế thử nghiệm phải ghi rõ giả định và giới hạn BSRAM.
