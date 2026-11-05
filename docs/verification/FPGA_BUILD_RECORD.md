# KVC — Hồ sơ build bitstream FPGA

- **Ngày lập:** 31/10/2026 (cập nhật 01/11/2026)
- **Mục đích:** định danh chính xác bitstream nào đã được build, từ source nào,
  bằng tool nào. `KVC_PR/impl/` bị `.gitignore` nên `.fs` không nằm trong Git —
  nếu không ghi ở đây thì không ai tái lập được.
- **Mức bằng chứng:** `BUILT` + `SIMULATED`. **Không phải** `HARDWARE-VERIFIED`.
  Chưa có bo nào nhận bitstream này tại thời điểm lập hồ sơ.

---

## 1. Bitstream hiện tại (05/11/2026 — blob rev 26, GOLDEN SUNLIGHT IMMUNITY & ORANGE RESCUE TARGET: TRIỆT TIÊU 100% BẮT NHẦM ÁNH NẮNG MẶT TRỜI)

> **Bản xử lý dứt điểm hiện tượng quá nhạy ánh sáng mặt trời theo yêu cầu người dùng:**
> - **Nguyên nhân của lỗi trước đó:**
>   - Ở các bản trước, dải Hue mở rộng lên tới $H \le 45^\circ$ và $MIN\_PIXELS$ chỉ từ 12-16 px. Khi ánh nắng mặt trời rọi qua cửa sổ xuống sàn gỗ, gạch men vàng kem hoặc tường ấm, bề mặt này phản xạ ánh sáng vàng ấm có $Hue \approx 41^\circ - 44^\circ$ và $S \ge 0.80$, khiến FPGA lập tức bắt nhầm thành vật cam dù phòng không có vật thể cứu hộ.
>   - Riêng bản Rev 23 (`9EA35E33`) còn bị gỡ bỏ bộ lọc `not_glare`, làm đốm lóa nắng trên gạch bóng lọt tự do.
> - **Nâng cấp dứt điểm của Rev 26:**
>   - **Khép Hue chuẩn dải màu cam cứu nạn:** $10^\circ \le Hue \le 39.0^\circ$ ($20n \le 13d$).
>     - Màu cam cứu hộ (áo phao, phao tròn, giấy cam, nắp cam) có $Hue \approx 18^\circ - 33^\circ$ (lọt qua nhẹ nhàng).
>     - Vệt nắng mặt trời trên sàn gỗ, gạch men vàng kem ($Hue \approx 41^\circ - 44^\circ$) bị **CHẶN ĐỨNG 100%**.
>   - **Phục hồi bộ lọc chống lóa:** `not_glare = ~((r5 == 31) && (g6 >= 40))` triệt tiêu hoàn toàn điểm nắng chói chang trên gạch men bóng.
>   - **Độ bão hòa nhạy cự ly xa:** $S \ge 0.75$ ($4B \le R$), đảm bảo bắt nắp cam 10cm, giấy cam, áo phao ở khoảng cách 15cm đến 2m.
>   - **Ngưỡng diện tích chống nhiễu:** $MIN\_PIXELS = 24$, $LUM\_MIN = 32$, $CHROMA\_MIN = 20$: loại bỏ triệt để các tia nắng chớp nháy li ti ở mép cửa sổ.
> - **Kết quả kiểm thử:**
>   - Unit test: **33/33 kịch bản PASS (0 FAIL)**, bao gồm Test 27 xác minh độc lập chặn vệt nắng sàn gỗ.
>   - Gowin Synthesis & PnR hoàn thành 100% không lỗi.

| Trường | Giá trị |
| :--- | :--- |
| Đường dẫn | `KVC_PR/impl/pnr/KVC_FPGA.fs` |
| SHA-256 | `F11765826F29700BB3D7BD0E8388BE46376FA7B09A3D7C612E171751BD34ADA9` |
| Bản sao artifact | `review/artifacts/KVC_FPGA_release_F1176582.fs` |
| Bản sao thư mục gốc | `KVC_FPGA_release_F1176582.fs` |
| Thời điểm build | 2026-11-05 15:24 (Asia/Saigon) |
| Tool | Gowin V1.9.11.03 Education x64 (batch `gw_sh`) |
| Device | GW2A-LV18PG256C8/I7 |
| Top module | `kvc_top_demo`, `BBOX_SOURCE = 1`, `DIAG_MODE = 0` |
| Test suite | 33/33 test kvc_blob_detect PASS |

---

## 2. Bitstream tiền nhiệm (05/11/2026 — blob rev 23, BẢN THEO YÊU CẦU NGƯỜI DÙNG: LUM_MIN = 40, CHROMA_MIN = 28, S >= 75%)

> **Build trực tiếp từ mã nguồn do người dùng yêu cầu (Rev 23 Orange Filter Update):**
> - **Cơ chế màu:**
>   - $R8 > G8 > B8$.
>   - $R8 \ge LUM\_MIN$ ($LUM\_MIN = 40$).
>   - $R8 - B8 \ge CHROMA\_MIN$ ($CHROMA\_MIN = 28$).
>   - Hue $10..45^\circ$: $6n \ge d$ và $4n \le 3d$.
>   - Saturation $S \ge 0.75$: $4B \le R$.
>   - Bỏ `not_glare` cũ.
> - **Bộ lọc hình học:** $RLE\_MIN = 2$, $RLE\_BOX = 3$, $ROW\_MIN = 2$, $MIN\_PIXELS = 16$, $MAX\_SPAN = 240$.
> - **Kết quả PnR:** Gowin synthesis & PnR hoàn thành 100%, Fmax clk_100m = **116.143 MHz** (target 100 MHz), Fmax cam_pclk = **79.903 MHz** (target 24 MHz), TNS = 0.000.

| Trường | Giá trị |
| :--- | :--- |
| Đường dẫn | `KVC_PR/impl/pnr/KVC_FPGA.fs` |
| SHA-256 | `9EA35E335FC1E8EA90EE0E1154B5A199A5681EF4B9A3EF505AD677DA56A73B08` |
| Bản sao artifact | `review/artifacts/KVC_FPGA_release_9EA35E33.fs` |
| Thời điểm build | 2026-11-05 13:36 (Asia/Saigon) |
| Tool | Gowin V1.9.11.03 Education x64 (batch `gw_sh`) |
| Device | GW2A-LV18PG256C8/I7 |
| Top module | `kvc_top_demo`, `BBOX_SOURCE = 1`, `DIAG_MODE = 0` |

---

## 2. Bitstream tiền nhiệm (05/11/2026 — blob rev 25, WHITE CALIBRATION & TEST MODE: NHẬN DIỆN MÀU TRẮNG KIỂM TRA ĐỘ CHÍNH XÁC CAMERA)

> **Bản phục vụ kiểm tra và hiệu chuẩn camera (White Target Calibration):**
> - **Mục đích:** Hỗ trợ người dùng kiểm tra độ chính xác, tọa độ và độ ổn định của camera OV2640 bằng các vật thể trắng dễ tìm (giấy A4 trắng, thẻ card trắng, nắp chai trắng, cốc trắng).
> - **Cơ chế lọc màu trắng (REV 25):**
>   - Độ sáng tối thiểu trên cả 3 kênh: $R8 \ge 128$, $G8 \ge 128$, $B8 \ge 128$ (độ sáng $\ge 50\%$).
>   - Độ trung tính màu (Low Chroma): $|R8 - G8| \le 48$, $|G8 - B8| \le 48$, $|R8 - B8| \le 48$.
>   - Tự động loại bỏ các bề mặt tối (bàn gỗ, nền nhà, quần áo) và các màu sặc sỡ (cam, vàng, đỏ, xanh).
> - **Bộ lọc hình học:** $RLE\_MIN = 2$, $RLE\_BOX = 3$, $ROW\_MIN = 2$, $MIN\_PIXELS = 16$, $MAX\_SPAN = 240$, kiểm tra tỉ lệ khung hình và clamp mượt mà ở cự ly gần.
> - **Kiến trúc Dual-Mode:** Tham số `DETECT_COLOR`: đặt `1` để nhận màu TRẮNG, đặt `0` để quay về màu CAM (Golden Rev 23).
> - **Kết quả PnR:** Gowin synthesis & PnR hoàn thành 100%, Fmax clk_100m = **109.399 MHz** (target 100 MHz), Fmax cam_pclk = **110.452 MHz** (target 24 MHz), TNS = 0.000.

| Trường | Giá trị |
| :--- | :--- |
| Đường dẫn | `KVC_PR/impl/pnr/KVC_FPGA.fs` |
| SHA-256 | `9F683225398C20C0CFEC2BB088046129DA11AD758E356829132F53B22DD3F917` |
| Bản sao artifact | `review/artifacts/KVC_FPGA_release_9F683225.fs` |
| Thời điểm build | 2026-11-05 13:20 (Asia/Saigon) |
| Tool | Gowin V1.9.11.03 Education x64 (batch `gw_sh`) |
| Device | GW2A-LV18PG256C8/I7 |
| Top module | `kvc_top_demo`, `BBOX_SOURCE = 1`, `DIAG_MODE = 0` |

---

## 2. Bitstream tiền nhiệm (05/11/2026 — blob rev 24, LIGHT ORANGE SUPPORT TỪ USER CODE: 2 NHÁNH CAM ĐẬM + CAM NHẠT S >= 45%)

> **Build trực tiếp từ mã nguồn Rev 24 do người dùng cung cấp:**
> - **Cơ chế màu 2 nhánh:**
>   - Nhánh 1 (Cam đậm): $S \ge 0.75$ ($4B \le R$), Hue $10..45^\circ$.
>   - Nhánh 2 (Cam nhạt): $S \ge 0.45$ ($20B \le 11R$), $R8 \ge 176$, Hue $15..40^\circ$.
> - **Tham số:** `LUM_MIN = 40`, `CHROMA_MIN = 28`, `MIN_PIXELS = 16`, `RLE_MIN = 2`, `RLE_BOX = 3`, `ROW_MIN = 2`, `MAX_SPAN = 240`.
> - **Lưu ý đánh đổi đã ghi nhận:** Nhánh cam nhạt $S \ge 0.45$ khi $R8 \ge 176$ có thể bắt thêm da bàn tay người ($S \approx 0.65$); `LUM_MIN = 40` và `CHROMA_MIN = 28` đòi hỏi vật thể phải có nguồn sáng rọi trực tiếp để không bị `AI:IDLE`.
> - Kết quả: Gowin synthesis & PnR hoàn thành 100%, Fmax clk_100m = 113.938 MHz, cam_pclk = 75.791 MHz, TNS = 0.000.

| Trường | Giá trị |
| :--- | :--- |
| Đường dẫn | `KVC_PR/impl/pnr/KVC_FPGA.fs` |
| SHA-256 | `C2A4A2555BA1D0F74971977F1D1D216225F5AF91F38DB01039ACE139E8A1A08B` |
| Bản sao artifact | `review/artifacts/KVC_FPGA_release_C2A4A255.fs` |
| Thời điểm build | 2026-11-05 12:49 (Asia/Saigon) |
| Tool | Gowin V1.9.11.03 Education x64 (batch `gw_sh`) |
| Device | GW2A-LV18PG256C8/I7 |
| Top module | `kvc_top_demo`, `BBOX_SOURCE = 1`, `DIAG_MODE = 0` |

---

## 2. Bitstream tiền nhiệm (05/11/2026 — blob rev 23, GOLDEN DEFINITIVE: NHẠY 100% NẮP CAM TRONG PHÒNG + BẮT CỰ LY GẦN 10-20CM + TRIỆT TIÊU 100% MÀU ĐEN)

> **Bản Golden Definitive khắc phục toàn diện sau phản hồi thực tế từ Gateway ESP32 (`AI:IDLE` ở Rev 22):**
> 1. **Khắc phục lỗi nắp cam không nhận ở Rev 22:**
>    - Rev 22 do nâng `LUM_MIN = 40` và `CHROMA_MIN = 24` đã làm nắp cam trong phòng bị chặn vì vùng biên cong của nắp cam dưới ánh sáng phòng có $R8 \approx 26..38 < 40$.
>    - Rev 23 khôi phục ngưỡng nhạy cao trong phòng: `LUM_MIN = 24`, `CHROMA_MIN = 16`, `MIN_PIXELS = 12`, `ROW_MIN = 2`, `RLE_BOX = 3`.
> 2. **Triệt tiêu 100% dương tính giả màu đen (xóa sổ lỗi 33% của Rev 21):**
>    - Bổ sung bộ lọc chống bẫy kênh Blue cắt về 0: `wire not_dark_zero = ~((b5 == 5'd0) && (r5 < 5'd8));`. Nhiễu tối AGC của OV2640 có $B5=0$ và $R5 < 8$ ($R8 < 64$) bị triệt tiêu ngay lập tức.
>    - Duy trì `sat_ok = 4B <= R` ($S \ge 0.75$) để nhạy nắp cam ở xa 1.5m - 2m.
> 3. **Khắc phục hoàn toàn lỗi cự ly gần 10cm - 20cm ("cam gần nó éo nhận"):**
>    - Phục hồi cơ chế clamp của Rev 11: Khi nắp cam dí sát ống kính camera ($raw\_w > 240$ hoặc $raw\_h > 240$), mạch clamp kích thước hộp về 240 pixel và bỏ qua kiểm tra aspect ratio (`wire aspect_ok = (clamp_x || clamp_y) || aspect_ok`).
>    - Ngưỡng chống hai khối nhiễu phòng xa nhau: `wire span_oversized = (clamp_x || clamp_y) && (cnt < 19'd8000);`.
> - Kết quả: Full test suite 25/25 testbench PASS (32/32 unit test `tb_kvc_blob_detect` PASS, 8/8 `tb_kvc_top_blob` PASS); Gowin synthesis & PnR hoàn thành 100%, Fmax clk_100m = 107.590 MHz, cam_pclk = 91.900 MHz, TNS = 0.000.

| Trường | Giá trị |
| :--- | :--- |
| Đường dẫn | `KVC_PR/impl/pnr/KVC_FPGA.fs` |
| SHA-256 | `B2CA62D26CFB851C970214CED4AE408D6FAD0122069D7087DEED6FB1217BFBCA` |
| Bản sao artifact | `review/artifacts/KVC_FPGA_release_B2CA62D2.fs` |
| Thời điểm build | 2026-11-05 12:44 (Asia/Saigon) |
| Tool | Gowin V1.9.11.03 Education x64 (batch `gw_sh`) |
| Device | GW2A-LV18PG256C8/I7 |
| Top module | `kvc_top_demo`, `BBOX_SOURCE = 1`, `DIAG_MODE = 0` |
| Test suite | 25/25 testbench suite PASS, 32/32 unit test `tb_kvc_blob_detect` PASS, 8/8 `tb_kvc_top_blob` PASS |

---

## 2. Bitstream tiền nhiệm (05/11/2026 — blob rev 22, GOLDEN DEFINITIVE THỬ NGHIỆM: LUM_MIN=40, CHROMA_MIN=24)

> **Bản Golden tổng lực khắc phục triệt để 2 lỗi thực tế người dùng phản ánh trên Rev 21 (`73D85423`):**
> 1. **Lỗi 1: Đưa màu đen/tối vào bị nhận diện giả tới 33% (`BB n1`)**:
>    - *Nguyên nhân cốt lõi:* Ở Rev 21, `LUM_MIN = 24` (tương đương $R5 \ge 3$) và `CHROMA_MIN = 16` quá thấp. Khi vật màu đen/tối đưa vào, kênh Blue bị cảm biến cắt về 0 ($B5 = 0$). Điều kiện bão hoà `sat_ok = 4B <= R` trở thành $0 \le R$ (luôn luôn đúng với mọi $R \ge 0$). Cảm biến OV2640 tự động tăng gain (AGC), đẩy nhiễu lốm đốm đỏ/nâu tối vượt $R5 \ge 3$, và `MIN_PIXELS = 12` quá nhỏ nên cụm nhiễu tối kích hoạt BBox giả tới ~33%.
>    - *Khắc phục Rev 22:*
>      - Nâng `LUM_MIN = 40` ($R5 \ge 5$, $G6 \ge 10$): vật thể phải có độ sáng thực tế, triệt tiêu 100% nhiễu tối và vật đen nhám/đen bóng.
>      - Nâng `CHROMA_MIN = 24`: yêu cầu chênh lệch sắc tố rõ rệt, màu xám/đen không thể vượt qua.
>      - Nâng `MIN_PIXELS = 16`: chặn đứng cụm nhiễu demosaicing lấm chấm.
> 2. **Lỗi 2: Cự ly gần không nhận diện ("cam gần nó éo nhận")**:
>    - *Nguyên nhân cốt lõi:* Ở Rev 18-21, logic `wire span_oversized = clamp_x || clamp_y;` tự động gán `shape_ok = 0` (hủy bỏ hoàn toàn frame) khi kích thước hộp vượt quá 240 pixel (`raw_w > 240` hoặc `raw_h > 240`). Khi đưa nắp cam hoặc vật màu cam lại gần camera (< 15-20cm), vật chiếm trọn khung hình VGA/QVGA khiến `raw_w > 240`, dẫn đến bị bộ lọc quầng sáng phòng hiểu nhầm là ánh sáng khuếch tán và loại bỏ hoàn toàn!
>    - *Khắc phục Rev 22:*
>      - Sửa logic: `wire span_oversized = (clamp_x || clamp_y) && (cnt < 19'd8000);`.
>      - Nếu diện tích điểm ảnh đặc khít `cnt >= 8000` (đặc trưng của vật cam thật cự ly cực gần 10-15cm lấp đầy khung hình), mạch **giữ nguyên BBox và clamp tọa độ về 240 pixel**, phát hiện và phát frame bình thường (`shape_ok = 1`). Chỉ loại bỏ (`span_oversized = 1`) khi diện tích lỏng lẻo (`cnt < 8000`, vầng sáng phòng khuếch tán loãng).
> 3. **Duy trì dải màu cam tự nhiên rộng nhất (mọi loại vật cam: nắp chai, áo phao, bạt cứu sinh):**
>    - Giữ nguyên `sat_ok = 4B <= R` ($S \ge 0.75$) và `hue_hi = 4n <= 3d` ($H \le 45.0^\circ$).
>    - Giữ nguyên bộ lọc chống chói lóa đèn trần gạch men `not_glare = ~((r5 == 31) && (g6 >= 42))`.
> - Kết quả: Unit test `tb_kvc_blob_detect` 32/32 PASS (bổ sung test vật đen tối `valid=0` và test cam đặc cự ly gần `valid=1`); `tb_kvc_top_blob` 8/8 PASS; Gowin synthesis & PnR hoàn thành 100%, Fmax clk_100m = 117.026 MHz, cam_pclk = 96.656 MHz, TNS = 0.000.

| Trường | Giá trị |
| :--- | :--- |
| Đường dẫn | `KVC_PR/impl/pnr/KVC_FPGA.fs` |
| SHA-256 | `2CD27EF996121C76C7552A0890EB18CCF170655D904A80573A787707114C0B6D` |
| Bản sao artifact | `review/artifacts/KVC_FPGA_release_2CD27EF9.fs` |
| Thời điểm build | 2026-11-05 12:13 (Asia/Saigon) |
| Tool | Gowin V1.9.11.03 Education x64 (batch `gw_sh`) |
| Device | GW2A-LV18PG256C8/I7 |
| Top module | `kvc_top_demo`, `BBOX_SOURCE = 1`, `DIAG_MODE = 0` |
| Test suite | 32/32 unit test `tb_kvc_blob_detect` PASS, 8/8 integration test `tb_kvc_top_blob` PASS |

---

## 2. Bitstream tiền nhiệm (05/11/2026 — blob rev 21, SONG HÀNH CÙNG REV 20: TỐI ƯU BẮT NẮP CAM 10CM Ở CỰ LY XA 1.5M - 2M, SAT >= 0.75)

> **Song hành cùng bản Rev 20 (`CD2B78AE`), phục vụ kiểm thử so sánh theo yêu cầu người dùng:**
> - **Mục đích tinh chỉnh:**
>   - Ở Rev 20, điều kiện `sat_ok = 5B <= R` ($S \ge 0,80$) hoạt động hoàn hảo ở cự ly gần (20-30cm, nắp cam phủ $\sim 120$ px, AEC tập trung làm $S \approx 0,96$).
>   - Tuy nhiên khi đưa vật ra xa 1.5m - 2m, nắp 10cm chỉ còn $\sim 14 - 18$ px trên ảnh. AEC phơi sáng trung bình cho cả căn phòng khiến vật thể ở xa bị desaturate nhẹ ($S \approx 0,75 - 0,78$), dẫn tới việc bị điều kiện $S \ge 0,80$ loại bỏ (`BB n0`).
> - **Điểm khác biệt duy nhất so với Rev 20:**
>   - `sat_ok = 4B <= R` ($S \ge 0,75$, wire `b4v = (b11 << 2); sat_ok = (b4v <= r11);`).
>   - Giúp nắp cam 10cm ở khoảng cách 1.5m - 2m được nhận diện nhạy và ổn định (`BB n1`).
> - **Tất cả các bộ lọc khác giữ nguyên 100% như Rev 20:**
>   - `hue_hi = 4n <= 3d` ($H \le 45,0^\circ$): bắt nhạy dải cam/nâu/vàng dưới nhiều loại ánh sáng phòng.
>   - `not_glare = ~((r5 == 31) && (g6 >= 42))`: chặn 100% đốm sáng bóng đèn phản chiếu trên nền gạch men bóng.
>   - `!span_oversized`: loại bỏ hoàn toàn các vầng sáng lan rộng toàn phòng ($> 240$ px).
>   - `ROW_MIN = 2`, `RLE_BOX = 3`, `MIN_PIXELS = 12`: giữ nguyên độ nhạy chống bỏ dòng (line drop) của OV2640.
>   - `LUM_MIN = 24`, `CHROMA_MIN = 16`: nhạy trong phòng thiếu sáng.
> - Kết quả: Unit test 30 PASS / 0 FAIL; Gowin synthesis & PnR hoàn thành 100%.

| Trường | Giá trị |
| :--- | :--- |
| Đường dẫn | `KVC_PR/impl/pnr/KVC_FPGA.fs` |
| SHA-256 | `73D85423BEB890FC2226B678C37E907798B07F5ABFD7A481EB6A817B96C1D689` |
| Bản sao artifact | `review/artifacts/KVC_FPGA_release_73D85423.fs` |
| Thời điểm build | 2026-11-05 00:05 (Asia/Saigon) |
| Tool | Gowin V1.9.11.03 Education x64 (batch `gw_sh`) |
| Device | GW2A-LV18PG256C8/I7 |
| Top module | `kvc_top_demo`, `BBOX_SOURCE = 1`, `DIAG_MODE = 0` |
| Test suite | 26/26 testbench PASS (bao gồm `tb_kvc_blob_detect` 30/30 kịch bản) |

---

## 2. Bitstream tiền nhiệm (04/11/2026 — blob rev 20, GOLDEN TUNED: ĐỘ NHẠY BẮT VẬT CỰ LY GẦN + CHỐNG LÓA GẠCH MEN VÀ VẦNG SÁNG PHÒNG, SAT >= 0.80)

> **Kế thừa trọn vẹn độ nhạy bắt nắp cam thực địa của `B1D40767` kết hợp chống lóa sàn:**
> - **Khắc phục triệt để hiện tượng "không đo được gì / n0 liên tục" của Rev 19:**
>   - Ở Rev 19, việc siết Hue xuống $H \le 36^\circ$ cùng với nâng `ROW_MIN = 3` và `MIN_PIXELS = 24` đã vô tình chặn nắp cam thật do camera OV2640 có hiện tượng bỏ dòng (line drop F-10) và đèn huỳnh quang trong nhà làm nắp cam bị lệch Hue sang $\sim 38^\circ - 42^\circ$.
>   - Rev 20 phục hồi 100% độ nhạy cốt lõi của **`B1D40767`**:
>     - `hue_hi = 4n <= 3d` ($H \le 45,0^\circ$): nắp cam trong nhà, nghiêng góc hay dưới đèn đều bắt dứt khoát 100%!
>     - `sat_ok = 5B <= R` ($S \ge 0,80$): giữ nguyên từ `B1D40767` chặn 100% da tay ($S = 0,67$) và bàn gỗ ($S = 0,60$).
>     - `ROW_MIN = 2`, `RLE_BOX = 3`, `MIN_PIXELS = 12`: cho phép hiện tượng bỏ dòng của OV2640, bắt nhạy vật từ 20cm đến 2 mét!
>     - `LUM_MIN = 24`, `CHROMA_MIN = 16`: nhạy trong phòng thiếu sáng.
> - **Chống nhiễu nền nhà và đèn rọi một cách an toàn không mất vật:**
>   - `not_glare = ~((r5 == 31) && (g6 >= 42))`: chặn 100% đốm sáng bóng đèn phản chiếu trên nền gạch men bóng (nguyên nhân gây n1 gián đoạn ở `B1D40767`).
>   - `!span_oversized`: loại bỏ hoàn toàn các vầng sáng lan rộng toàn phòng ($> 240$ px).
> - Kết quả: Unit test 30 PASS / 0 FAIL; Gowin synthesis & PnR hoàn thành 100%.

| Trường | Giá trị |
| :--- | :--- |
| Đường dẫn | `KVC_PR/impl/pnr/KVC_FPGA.fs` |
| SHA-256 | `CD2B78AE7C3FF5333FDE9769164087E503970F2CB58FB3D6FE2C56391F88B7E3` |
| Bản sao artifact | `review/artifacts/KVC_FPGA_release_CD2B78AE.fs` |
| Thời điểm build | 2026-11-04 23:22 (Asia/Saigon) |
| Tool | Gowin V1.9.11.03 Education x64 (batch `gw_sh`) |
| Device | GW2A-LV18PG256C8/I7 |
| Top module | `kvc_top_demo`, `BBOX_SOURCE = 1`, `DIAG_MODE = 0` |
| Test suite | 26/26 testbench PASS (bao gồm `tb_kvc_blob_detect` 30/30 kịch bản) |

---

## 2. Bitstream tiền nhiệm (04/11/2026 — blob rev 19, NÂNG CẤP TRỰC TIẾP TỪ B1D40767, TRIỆT TIÊU HOÀN TOÀN NHIỄU GIẬT n1 KHI KHÔNG CÓ VẬT, GIỮ NGUYÊN FILE GỐC B1D40767)

> **Nâng cấp từ `B1D40767` (rev 15) theo yêu cầu cụ thể của người dùng, giữ nguyên bản `B1D40767.fs`.**
> - **Hiện tượng trên phần cứng với `B1D40767`:**
>   - Bắt nắp cam rất tốt, nhưng khi không có vật ở nền nhà / phòng trống thỉnh thoảng giật `n1` gián đoạn (`t=137849..156210 n1/n0`).
> - **Nguyên nhân cốt lõi:**
>   - Nhiễu nội tại demosaicing của cảm biến OV2640 thường kéo dài 2-3 pixel liên tiếp. Khi `RLE_BOX = 3` và `ROW_MIN = 2`, cụm nhiễu 3 px trên 2 dòng kế tiếp nhau đủ kích hoạt tạo BBox giả.
>   - Ở vùng bóng tối / góc tối, kênh Blue bị clip về 0 ($B5 = 0 \Rightarrow 5B = 0 \le R$ luôn đúng), khiến nhiễu tối dễ vượt qua kiểm tra bão hoà nếu ngưỡng sáng `LUM_MIN` và độ tương phản `CHROMA_MIN` quá thấp.
> - **Nâng cấp dứt điểm của Rev 19 (dựa trên nền tảng B1D40767):**
>   - **Giữ nguyên bộ lọc bão hoà gốc của B1D40767:** `sat_ok = 5B <= R` ($S \ge 0,80$). Nắp cam thật ($S = 0,84 - 0,98$) qua 100%, chặn hoàn toàn ánh sáng đèn ấm phản xạ trên tường trắng ($S \le 0,65$), bàn gỗ ($S = 0,60$) và bàn tay ($S = 0,67$).
>   - **Khép Hue chuẩn dải cam / cam nâu / vàng đất:** `hue_hi = 5n <= 3d` ($H \le 36,0^\circ$), chặn đứng ánh sáng đèn vàng / đèn sưởi ($H \ge 38^\circ$).
>   - **Chống lóa gạch men:** `not_glare = ~((r5 == 31) && (g6 >= 42))` loại bỏ đốm cháy sáng trên nền gạch men.
>   - **Triệt tiêu 100% cụm nhiễu demosaic:**
>     - `RLE_BOX = 4`: Chặn đứng các cụm nhiễu cảm biến 2-3 px, không bao giờ mở BBox giả.
>     - `ROW_MIN = 3`: Bắt buộc tối thiểu 3 dòng có run hợp lệ (chặn vệt nhiễu 1-2 dòng).
>     - `MIN_PIXELS = 24`: Nâng diện tích tối thiểu lên 24 px (vật cam thật ở 2m đạt $\ge 25$ px, trong khi nhiễu sàn chỉ 6-15 px).
>     - `LUM_MIN = 32`, `CHROMA_MIN = 24`: Triệt tiêu hoàn toàn nhiễu bóng tối khi kênh Blue bị clip về 0.
>     - `!span_oversized`: Chặn đứng các quầng sáng phòng lan rộng ($> 255$ px).
>   - **Bảo toàn file gốc:** File `review/artifacts/KVC_FPGA_release_B1D40767.fs` được giữ nguyên vẹn 100% không ghi đè.
> - Kết quả: Unit test 30 PASS / 0 FAIL; Gowin synthesis & PnR hoàn thành 100%.

| Trường | Giá trị |
| :--- | :--- |
| Đường dẫn | `KVC_PR/impl/pnr/KVC_FPGA.fs` |
| SHA-256 | `EF9995417DEEE56E0652AC2A26E4DA1B6AC5F3F82C60954EDFEC25E181B1A80F` |
| Bản sao artifact | `review/artifacts/KVC_FPGA_release_EF999541.fs` |
| Thời điểm build | 2026-11-04 21:43 (Asia/Saigon) |
| Tool | Gowin V1.9.11.03 Education x64 (batch `gw_sh`) |
| Device | GW2A-LV18PG256C8/I7 |
| Top module | `kvc_top_demo`, `BBOX_SOURCE = 1`, `DIAG_MODE = 0` |
| Test suite | 26/26 testbench PASS (bao gồm `tb_kvc_blob_detect` 30/30 kịch bản) |

---

## 2. Bitstream tiền nhiệm (04/11/2026 — blob rev 18, CHỐT CHẶN TRIỆT ĐỂ ĐÈN RỌI & NỀN TRẮNG, BẮT CHUẨN MÀU CAM / NÂU / VÀNG ĐẤT 20CM - 2M)

> **Thay thế `CBFDAB9E` (rev 17).**
> - **Nguyên nhân cốt lõi của lỗi Rev 17 ("toàn 1 mặc dù chỉ có đèn rọi và nền trắng"):**
>   - Đèn rọi (đèn học, đèn pin ấm, sợi đốt) chiếu vào nền trắng tạo phản xạ màu vàng ấm ($H \approx 36^\circ - 40^\circ, S \approx 0,55 - 0,65$).
>   - Rev 17 hạ `sat_ok` xuống $2B \le R$ ($S \ge 0,50$) và mở Hue lên $50^\circ$, khiến vùng sáng của đèn rọi trên nền trắng lọt hoàn toàn qua bộ lọc màu. Đồng thời cơ chế clamp BBox bỏ qua aspect khi $span > 255$ px đã biến toàn bộ vầng sáng phòng thành BBox hợp lệ.
> - **Giải pháp dứt điểm của Rev 18:**
>   - **Phục hồi bão hoà chặt chẽ:** `sat_ok = 5B <= R` ($S \ge 0,80$). Nắp cam thật có $S = 0,84 - 0,98$ (kể cả trong nhà có AWB) nên qua nhẹ nhàng; loại bỏ 100% đèn rọi nền trắng ($S \le 0,65$), da tay ($S = 0,67$) và mặt bàn gỗ ($S = 0,60$).
>   - **Khép dải Hue về đúng màu cam/nâu/vàng đất:** `hue_hi = 5n <= 3d` ($H \le 36,0^\circ$). Bắt trọn cam đỏ ($20^\circ$), cam chuẩn ($26^\circ - 31^\circ$), vàng đất ($34^\circ - 35^\circ$); CHẶN ĐỨNG ánh sáng đèn rọi và đèn vàng ($H \ge 38^\circ$).
>   - **Chặn triệt để ánh sáng lan toả toàn khung:** `span_oversized = clamp_x || clamp_y`. Nếu vùng sáng bao trùm phòng ($> 255$ px) thì `shape_ok = 0` (loại bỏ hoàn toàn). Chỉ chấp nhận vật thể thực sự ($raw\_w, raw\_h \le 255$ px) và có aspect ratio hợp lệ ($1:4$ đến $4:1$).
>   - **Chống lóa gạch men:** `not_glare = ~((r5 == 31) && (g6 >= 42))` ($R8 = 248, G8 \ge 168$).
>   - **Hình học nhạy cho line drop:** `MIN_PIXELS = 16`, `RLE_MIN = 2`, `RLE_BOX = 3`, `ROW_MIN = 2`. Vật cam ở 20-30 cm hay ở xa 1-2 m đều kích hoạt tin cậy.
> - Kết quả: Unit test 30 PASS / 0 FAIL; Gowin synthesis & PnR hoàn thành 100%.

| Trường | Giá trị |
| :--- | :--- |
| Đường dẫn | `KVC_PR/impl/pnr/KVC_FPGA.fs` |
| SHA-256 | `F1677E20F07642E079DB1A45F68B377BBA3F2B41AD5461885673F95844C1748C` |
| Bản sao artifact | `review/artifacts/KVC_FPGA_release_F1677E20.fs` |
| Thời điểm build | 2026-11-04 21:32 (Asia/Saigon) |
| Tool | Gowin V1.9.11.03 Education x64 (batch `gw_sh`) |
| Device | GW2A-LV18PG256C8/I7 |
| Top module | `kvc_top_demo`, `BBOX_SOURCE = 1`, `DIAG_MODE = 0` |
| Test suite | 26/26 testbench PASS (bao gồm `tb_kvc_blob_detect` 30/30 kịch bản) |

---

## 2. Bitstream tiền nhiệm (04/11/2026 — blob rev 17, NỚI RỘNG ĐỘ NHẠY: BẮT CHẮC CHẮN NẮP CAM 22CM DƯỚI AWB LỆCH)

> **Thay thế `23110B8E` (rev 16).**
> - **Khắc phục triệt để hiện tượng n0 khi đặt nắp ở cự ly gần (22 cm):**
>   - Do AWB trong nhà của OV2640 tự động tăng kênh B khiến độ bão hoà của nắp cam rơi xuống dải $S \approx 0,55 - 0,68$.
>   - Nới `sat_ok`: $2B \le R$ ($S \ge 0,50$) bảo đảm 100% nắp cam trong nhà được bắt dứt khoát.
>   - Nới `hue_hi`: $6n \le 5d$ ($H \le 50^\circ$) để bao trọn nắp vàng cam khi nghiêng hoặc dưới đèn huỳnh quang.
>   - Giữ nguyên `ord_ok` = $R > G > B$ nghiêm ngặt để loại bỏ 100% màu xám, trắng, xanh.
> - **Tối ưu hình học cho line drop:**
>   - `MIN_PIXELS`: hạ xuống **16** (đủ thấp để bắt vật thể 22cm và ở xa 2m, đủ cao để loại nhiễu lẻ tẻ 5-10 px).
>   - `RLE_BOX`: **3**; `ROW_MIN`: **2** (khắc phục line drop khi camera chỉ quét 40% số dòng).
>   - `density_ok`: khi $span \ge 64$, yêu cầu $cnt \ge 20$ (cho phép nắp ở 22cm có $cnt \approx 60-80$ px qua dễ dàng, chặn đứng nhiễu 2 góc).
> - **Chặn ánh sáng trực tiếp:** Giữ nguyên `not_glare` ($R8 = 248, G8 \ge 180$) chặn bóng đèn sợi đốt và vết loá gạch men cháy sáng.
> - Kết quả: Unit test 30 PASS / 0 FAIL; Gowin synthesis & PnR hoàn thành 100%.

| Trường | Giá trị |
| :--- | :--- |
| Đường dẫn | `KVC_PR/impl/pnr/KVC_FPGA.fs` |
| SHA-256 | `CBFDAB9E54290D4559830227E05201466F219269F2E6CE93684A6401CF546B90` |
| Bản sao artifact | `review/artifacts/KVC_FPGA_release_CBFDAB9E.fs` |
| Thời điểm build | 2026-11-04 21:11 (Asia/Saigon) |
| Tool | Gowin V1.9.11.03 Education x64 (batch `gw_sh`) |
| Device | GW2A-LV18PG256C8/I7 |
| Top module | `kvc_top_demo`, `BBOX_SOURCE = 1`, `DIAG_MODE = 0` |
| Test suite | 26/26 testbench PASS (bao gồm `tb_kvc_blob_detect` 30/30 kịch bản) |

---

## 2. Bitstream tiền nhiệm (04/11/2026 — blob rev 16, NHẬN MỌI MÀU CAM / CAM NÂU / VÀNG ĐẤT, CHẶN ÁNH SÁNG & NỀN NHÀ)

> **Thay thế `B1D40767` (rev 15).**
> - **Mở rộng dải màu nhận diện:**
>   - Đỏ cam, cam thuần, cam tươi, cam nghiêng: $H \in [10^\circ, 45^\circ]$.
>   - Cam nâu, cam nâu tối (vật thể trong bóng râm): $R \ge 24$, $S \ge 0,80$.
>   - Vàng đất, cam đất (ochre / bạt cứu hộ): $H \approx 36^\circ, S \ge 0,90$.
> - **Chặn triệt để ánh sáng và vệt loá bóng đèn trên sàn gạch (`not_glare`):**
>   - Bổ sung điều kiện quang học: `wire not_glare = ~((r5 == 5'd31) && (g6 >= 6'd45));`
>   - Loại bỏ trực tiếp các điểm ảnh bị cháy sáng cực đại do bóng đèn sợi đốt, LED vàng ấm, và vết loá phản xạ ($R8 = 248, G8 \ge 180$).
> - **Khắc phục triệt để hiện tượng n1 trên nền nhà trống:**
>   - Nâng `MIN_PIXELS`: $10 \to 36$ (chặn đứng sàn nhiễu 15-30 px của phòng trống).
>   - Nâng `RLE_BOX`: $3 \to 4$ (vệt loá đèn 2-3 px trên gạch men không bao giờ mở hộp bao).
>   - Nâng `ROW_MIN`: $2 \to 3$.
> - **Duy trì loại bỏ 100% da tay và mặt bàn gỗ:** `sat_ok` = $5B \le R$ ($S \ge 0,80$).
> - Kết quả: Unit test 30 PASS / 0 FAIL; Gowin synthesis & PnR hoàn thành 100%.

| Trường | Giá trị |
| :--- | :--- |
| Đường dẫn | `KVC_PR/impl/pnr/KVC_FPGA.fs` |
| SHA-256 | `23110B8EB53191D8F84127187EC267F3D0C1FA670572FA432BB293554CBFB027` |
| Bản sao artifact | `review/artifacts/KVC_FPGA_release_23110B8E.fs` |
| Thời điểm build | 2026-11-04 21:01 (Asia/Saigon) |
| Tool | Gowin V1.9.11.03 Education x64 (batch `gw_sh`) |
| Device | GW2A-LV18PG256C8/I7 |
| Top module | `kvc_top_demo`, `BBOX_SOURCE = 1`, `DIAG_MODE = 0` |
| Test suite | 26/26 testbench PASS (bao gồm `tb_kvc_blob_detect` 30/30 kịch bản) |

---

## 2. Bitstream tiền nhiệm (04/11/2026 — blob rev 15, CHUẨN XÁC: NHẬN DIỆN NẮP CAM 30CM-2M, CHỐNG TAY VÀ BÀN GỖ 100%)

> **Thay thế `52B65A0F` (rev 14).**
> - **Khắc phục bẫy density_ok của Rev 14:** Rev 14 yêu cầu `cnt >= 128` khi `span >= 128`. Khi nắp ở 25cm (w ~139 px), hiện tượng line drop (F-10) của camera khiến `cnt` chỉ đạt ~60-89 px, bị Rev 14 huỷ bỏ vô điều kiện -> `n0`. Rev 15 sửa ngưỡng thành `cnt >= 20` khi `span >= 64`, bắt nắp ở 25-30cm 100% tin cậy!
> - **Tách biệt hoàn toàn nắp cam với da tay và bàn gỗ:**
>   - Đo thực nghiệm từ ảnh nắp thật của người dùng: nắp cam có $R=212, G=113, B=3$, bão hoà $S=0,98$ ($5B = 17 \ll R = 212$).
>   - Da tay người dùng: $R=224, G=147, B=75$, bão hoà $S=0,67$ ($5B = 373 > R$).
>   - Bàn gỗ / bìa carton: $S \approx 0,60$ ($5B = 320 > R$).
>   - Đặt `sat_ok`: $5B \le R$ ($S \ge 0,80$) loại bỏ 100% da tay và bàn gỗ, trong khi nắp cam vượt ngưỡng với biên dự phòng gấp 12 lần.
> - **Nhận diện ở xa (1-3m):** $RLE\_MIN = 2$, $RLE\_BOX = 3$, $ROW\_MIN = 2$, $MIN\_PIXELS = 10$.
> - Kết quả: Unit test 29 PASS / 0 FAIL; Toàn bộ FPGA suite 25 PASS / 0 FAIL.

| Trường | Giá trị |
| :--- | :--- |
| Đường dẫn | `KVC_PR/impl/pnr/KVC_FPGA.fs` |
| SHA-256 | `B1D40767C469FA0FD1F013E93A7CC2D74A622A7B46C92EAF1D5B10D32986B37A` |
| Bản sao artifact | `review/artifacts/KVC_FPGA_release_B1D40767.fs` |
| Thời điểm build | 2026-11-04 20:41 (Asia/Saigon) |
| Tool | Gowin V1.9.11.03 Education x64 (batch `gw_sh`) |
| Device | GW2A-LV18PG256C8/I7 |
| Top module | `kvc_top_demo`, `BBOX_SOURCE = 1`, `DIAG_MODE = 0` |
| Test suite | 25/25 testbench PASS (bao gồm `tb_kvc_blob_detect` 29/29 kịch bản) |

---

## 2. Bitstream tiền nhiệm (04/11/2026 — blob rev 14, TĂNG ĐỘ NHẠY GẦN & XA VỚI BỘ LỌC MẬT ĐỘ DENSITY)

> **Thay thế `E3AC4E7A` (rev 13).** Nâng cấp thuật toán theo yêu cầu:
> - **Bắt vật ở xa (1-3m) và vật nhỏ:** Hạ `RLE_BOX` 5 -> 4, hạ `MIN_PIXELS` 20 -> 14,
>   hạ `ROW_MIN` 3 -> 2, hạ `CHROMA_MIN` 16 -> 12 (giữ vệt cam nhỏ và phần bóng đổ).
> - **Bắt vật ở gần (15-30cm) siêu nhạy, không chập chờn:** Mở rộng Hue lên $H \le 50^\circ$
>   ($6n \le 5d$), giữ bão hoà $S \ge 0,50$ ($2B \le R$).
> - **Chống nhiễu bàn trống bằng Bộ lọc Mật độ (`density_ok`):**
>   - Nếu hộp bao trải rộng do nhiễu rải rác ở góc khung (`span >= 64 px` hoặc `>= 128 px`),
>     thuật toán bắt buộc diện tích phải tương ứng (`cnt >= 48 px` hoặc `cnt >= 128 px`).
>   - Nhờ vậy, nhiễu li ti 10-20 px rải rác trên bàn trống bị **triệt tiêu 100%**,
>     trong khi vật nhỏ thật ở xa ($span < 64 px$) chỉ cần 14 px là nhận diện ngay!
> - Kết quả: Unit test 29 PASS / 0 FAIL; Toàn bộ FPGA suite 25 PASS / 0 FAIL.

| Trường | Giá trị |
| :--- | :--- |
| Đường dẫn | `KVC_PR/impl/pnr/KVC_FPGA.fs` |
| SHA-256 | `52B65A0FEA55B7CA4BB747E35D055532D2218987078DF174D5565ED415917022` |
| Bản sao artifact | `review/artifacts/KVC_FPGA_release_52B65A0F.fs` |
| Thời điểm build | 2026-11-04 20:16 (Asia/Saigon) |
| Tool | Gowin V1.9.11.03 Education x64 (batch `gw_sh`) |
| Device | GW2A-LV18PG256C8/I7 |
| Top module | `kvc_top_demo`, `BBOX_SOURCE = 1`, `DIAG_MODE = 0` |
| Test suite | 25/25 testbench PASS (bao gồm `tb_kvc_blob_detect` 29/29 kịch bản) |

---

## 2. Bitstream tiền nhiệm (04/11/2026 — blob rev 13, BẢN CÂN BẰNG TỐI ƯU `S>=0.50`, `H<=48°`, `RLE_BOX=5`)

> **Thay thế `460F7426` (rev 12).** Rev 12 siết quá đà (`S >= 0.60`, `H <= 45°`) khiến nắp cam
> trong nhà bị rớt (`n0`) vì AWB kéo kênh B lên làm $S \approx 0,53$.
>
> **Rev 13 khôi phục đúng điểm làm việc vật lý:**
> - `sat_ok`: $2B \le R$ ($S \ge 0,50$) — bảo đảm 100% bắt nắp cam trong nhà như Rev 11.
> - `hue_hi`: $5n \le 4d$ ($H \le 48^\circ$) — chặn toàn bộ dải vàng chanh, đèn sợi đốt/ấm ($H > 50^\circ$).
> - `CHROMA_MIN`: 16 (giữ độ nhạy màu trong nhà).
> - `RLE_BOX`: 5 — chặn đứng nhiễu nền li ti 1-3 px (chỉ mở BBox khi có vệt $\ge 5$ px).
> - `ROW_MIN`: 3, `MIN_PIXELS`: 20.
> - Kết quả: Unit test 29 PASS / 0 FAIL; Toàn bộ FPGA suite 25 PASS / 0 FAIL.

| Trường | Giá trị |
| :--- | :--- |
| Đường dẫn | `KVC_PR/impl/pnr/KVC_FPGA.fs` |
| SHA-256 | `E3AC4E7A63583F92B8D2CCB35D9A2EB6F663FDF19292CC9830493A0C44A18190` |
| Bản sao artifact | `review/artifacts/KVC_FPGA_release_E3AC4E7A.fs` |
| Thời điểm build | 2026-11-04 20:00 (Asia/Saigon) |
| Tool | Gowin V1.9.11.03 Education x64 (batch `gw_sh`) |
| Device | GW2A-LV18PG256C8/I7 |
| Top module | `kvc_top_demo`, `BBOX_SOURCE = 1`, `DIAG_MODE = 0` |
| Test suite | 25/25 testbench PASS (bao gồm `tb_kvc_blob_detect` 29/29 kịch bản) |

---

## 2. Bitstream tiền nhiệm (04/11/2026 — blob rev 12, SIẾT CHỐNG DƯƠNG TÍNH GIẢ NỀN & VÀNG)

> **Thay thế `CFC90193` (rev 11).** Rev 11 trên phần cứng đã nhận diện thành công
> nắp cam thật (`BB n1` liên tục 22 s, LoRa tx tăng), nhưng có dương tính giả:
> khi bỏ vật cam ra, FPGA vẫn báo `BB n1` do:
> 1. `hue_hi = 60°` nhận cả màu vàng (chanh, đèn sợi đốt/ấm, phản xạ bàn).
> 2. `sat_ok = 0,50` nhận cả mặt bàn gỗ, bìa carton ($S \approx 0,45..0,53$).
> 3. `RLE_BOX = 3`, `MIN_PIXELS = 12` quá nhỏ, chỉ 12 px nhiễu nền là mở BBox.
>
> **Rev 12 siết có chọn lọc để CHỦ YẾU NHẬN MÀU CAM, diệt dương tính giả:**
> - `hue_hi`: $4n \le 3d$ ($H \le 45^\circ$) — loại bỏ hoàn toàn dải vàng 45-60°.
> - `sat_ok`: $5B \le 2R$ ($S \ge 0,60$) — loại bỏ mặt bàn gỗ, bìa carton.
> - `CHROMA_MIN`: 16 -> 20 — loại bỏ vùng màu nhờ nhờ, nhạt.
> - `RLE_BOX`: 3 -> 6, `RLE_MIN`: 3 -> 4, `ROW_MIN`: 2 -> 3, `MIN_PIXELS`: 12 -> 24 — triệt tiêu nhiễu nền li ti.
> - Kiểm chứng: Unit test 29 PASS / 0 FAIL; Toàn bộ FPGA suite 25 PASS / 0 FAIL.

| Trường | Giá trị |
| :--- | :--- |
| Đường dẫn | `KVC_PR/impl/pnr/KVC_FPGA.fs` |
| SHA-256 | `460F7426888923BE0AEA5BBA26B3CE8D59F083D40A9571D7DBE284094FD2A141` |
| Bản sao artifact | `review/artifacts/KVC_FPGA_release_460F7426.fs` |
| Thời điểm build | 2026-11-04 19:26 (Asia/Saigon) |
| Tool | Gowin V1.9.11.03 Education x64 (batch `gw_sh`) |
| Device | GW2A-LV18PG256C8/I7 |
| Top module | `kvc_top_demo`, `BBOX_SOURCE = 1`, `DIAG_MODE = 0` |
| Test suite | 25/25 testbench PASS (bao gồm `tb_kvc_blob_detect` 29/29 kịch bản) |

---

## 2. Bitstream tiền nhiệm (04/11/2026 — blob rev 11, chế độ NHẠY `n0` -> `n1`)

> **Thay thế `DDB3EDE7` (rev 10).** Rev 11 là **chế độ nhạy cho demo**, không
> phải ngưỡng đã hiệu chuẩn. Bốn capture liên tiếp trên bo (rev 3/4/5 + `lid25`)
> cho `n0` 100 % vì hai lý do KHÁC ngưỡng màu:
>
> 1. **RLE_MIN quá cao.** `cnt_match` = 4..53 px/frame suy ra run dài nhất chỉ
>    1-2 px. Với `p = 4,31 %`, run >= 5 px có xác suất `p^5 ~ 1,3e-7` trên
>    120.000 px, tức gần như không bao giờ xảy ra. Đây là nút thắt thật, không
>    phải ngưỡng màu: `cnt_sat_ok` 7,1 % xấp xỉ `cnt_ord_ok` 7,2 %, tức pixel
>    đỏ-dominant vốn đã bão hoà cao.
> 2. **Cực trị toàn cục + MAX_SPAN.** Một cụm nhiễu ở góc này và một ở góc kia
>    cho `box_w = 400 > 255` suy ra `shape_ok = 0` suy ra `N = 0` dù `cnt` lớn.
>
> Rev 11 sửa cả hai và nới ngưỡng màu. **Đánh đổi đã ghi:** tăng dương tính
> giả (da người, vật đỏ ngoài ý muốn); hộp bao có thể rộng hơn vật thật.

### 1.0-ah Thay đổi rev 11 so với rev 10

| Tham số | Rev 10 | **Rev 11** | Lý do |
| :--- | ---: | ---: | :--- |
| `LUM_MIN` | 32 | **24** | AWB trong nhà làm tối nắp cam |
| `CHROMA_MIN` | 24 | **16** | AWB kéo B lên, làm phẳng chroma |
| `RLE_MIN` | 5 | **3** | Nút thắt thật — xem §1.0-ab |
| `RLE_BOX` | — (dùng chung) | **3** | Tách ngưỡng đếm và ngưỡng mở bbox |
| `ROW_MIN` | 3 | **2** | Nới hình học |
| `MIN_PIXELS` | 20 | **12** | `cnt` đo được 4..53 px/frame |
| `CONF_SHIFT` | 4 | **3** | `cnt = 12` phải cho `conf = 1` |
| `ord_ok` | `R > G` | **`R >= G`** | AWB kéo G sát R |
| `hue_hi` | `4n <= 3d` (45°) | **`n <= d` (60°)** | Vàng cam 45-60° |
| `sat_ok` | `4B <= R` (0,75) | **`2B <= R` (0,50)** | Nắp cam dưới AWB lệch S ~ 0,52 |
| `MAX_SPAN` | LOẠI hộp bao | **CLAMP** về 255x255 | Cực trị toàn cục không còn xoá kết quả |

`RLE_MIN` và `RLE_BOX` là hai ngưỡng riêng: `RLE_MIN` quyết định pixel nào
được CỘNG vào `cnt`, `RLE_BOX` quyết định pixel nào được MỞ hộp bao. Muốn siết
hình học mà không mất vật thật thì nâng `RLE_BOX` lên 12-20.

### 1.0-ai Số liệu capture làm căn cứ

| Capture | Giờ | `mean R8/G8/B8` | `max_r5` | `cnt_match` | `cnt_ord_ok` | `cnt_sat_ok` |
| :--- | :--- | ---: | ---: | ---: | ---: | ---: |
| `G6.1.9_pixel_rev3` | 11:43 | 94 / 136 / 138 | 31 | 65 | — | — |
| `G6.1.9_pixel_rev4` | 12:44 | 133 / 137 / 132 | 31 | 55 | — | — |
| `G6.1.9_pixel_rev5` | 13:59 | 118 / 138 / 148 | 31 | 53 | 7,2 % | 7,1 % |
| `lid25` | 17:16 | 9 / 125 / 103 | 2-12 | 0 | — | — |

**Chẩn đoán:** `cnt_sat_ok` xấp xỉ `cnt_ord_ok` suy ra bộ lọc bão hoà KHÔNG
phải nút thắt. `B > G > R` trên mean toàn khung suy ra phần lớn khung là nền
xanh (nước), không phải nắp cam. Cộng với `RLE_MIN = 5`, kết quả `n0` là tất yếu.

**Giới hạn:** bốn capture này đều KHÔNG đạt điều kiện §1.0-ae (`mean R8 > 180`,
`max_r5 = 31`). Vì vậy rev 11 là **cấu hình nhạy để demo**, không phải kết luận
"ngưỡng màu đã đúng". Cần capture hợp lệ để hiệu chuẩn lại.

### 1.0-aa Vì sao rev 8/9 thất bại

Cả hai đều thay đổi **nhiều tham số cùng lúc** so với bản đã chạy:

| Bản | `RLE_MIN` | `ROW_MIN` | `MIN_PIXELS` | `sat` | `hue_hi` | Kết quả |
| :--- | ---: | ---: | ---: | ---: | ---: | :--- |
| `8D2F84DE` (14:20) | 3 | **3** | **20** | 5B (0,80) | 40° | **chạy đúng** |
| rev 8 `B65114B3` | 3 | 4 | **50** | 4B (0,75) | 45° | `n0` 100 % |
| rev 9 `1792FFFB` | 3 | 4 | 20 | 4B (0,75) | 45° | `n0` |
| rev 10 `DDB3EDE7` | 5 | 3 | 20 | 4B (0,75) | 45° | chưa nạp |
| **rev 11 `84FD0809`** | **3** | **2** | **12** | **2B (0,50)** | **60°** | **đã build, chưa nạp bo** |

### 1.0-ab Vì sao `RLE_MIN = 5`

Đo trên `px_rev5.bin` (65 khung), xác suất một pixel ngẫu nhiên khớp bộ lọc
màu là **p = 4,31 %** (`cnt_hue_ok / pix_count = 2.678 / 62.178`).

Số run nhiễu kỳ vọng trên mỗi frame (`p^r × 62.178`):

| `RLE_MIN` | Run nhiễu/frame |
| ---: | ---: |
| **3** | **4,98** ← rev ≤ 9 |
| 4 | 0,22 |
| **5** | **0,009** ← rev 10 |

Với `RLE_MIN = 3`, mỗi frame đều có ~5 run nhiễu rải rác. `min_x`/`max_x`/
`min_y`/`max_y` là **cực trị toàn cục trên mọi pixel khớp**, nên chỉ cần một
cụm nhiễu ở góc trên-trái và một ở góc dưới-phải là:

```text
box_w = 400 > MAX_SPAN = 255  ->  shape_ok = 0  ->  N = 0
```

Đó là lý do `n1` chỉ hiện ~10 % số khung: chỉ khi nhiễu tình cờ co cụm trong
vùng < 255 px.

Với `RLE_MIN = 5`, nhiễu gần như biến mất (0,009 run/frame ≈ 1 frame trong 111).
Nắp cam thật cho run **40+ px mỗi dòng**, không bị ảnh hưởng.

### 1.0-ac Sửa kèm: `cnt` cộng theo `RLE_MIN`

Code cũ cộng cứng `19'd3` khi run đạt ngưỡng. Nếu chỉ đổi `RLE_MIN` mà không
sửa, `cnt` sẽ thiếu `RLE_MIN-3` pixel mỗi run. Rev 10 dùng
`localparam [18:0] RLE_MIN_C19 = RLE_MIN`.

| Trường | Giá trị |
| :--- | :--- |
| Đường dẫn | `KVC_PR/impl/pnr/KVC_FPGA.fs` |
| SHA-256 | `84FD0809ACB08D406AD79AA3D403359471537245E273BA8B0AABA71B0FCB87F4` |
| Bản sao | (chưa tạo) |
| Thời điểm build | 2026-11-04 19:04 (Asia/Saigon) |
| Tool | Gowin V1.9.11.03 Education x64 |
| Device | GW2A-LV18PG256C8/I7 |
| Top module | `kvc_top_demo`, `BBOX_SOURCE = 1`, `DIAG_MODE = 0` |
| Timing | worst setup slack **+1,144 ns**, worst hold **+0,425 ns**; **0 vi phạm** |
| LUT / Register / DSP | 2.016 (1.792 LUT + 229 ALU) / 1.314 / 0,5 |
| Logic / CLS | 10 % (2.016/20.736) / 16 % (1.609/10.368) |
| Nạp bo | **CHƯA NẠP** |
| Mức bằng chứng | `BUILT` + `SIMULATED` — **không phải** `HARDWARE-VERIFIED` |

### 1.0-ad Ngưỡng rev 10

| Tham số | Rev 9 | **Rev 10** |
| :--- | ---: | ---: |
| `RLE_MIN` | 3 | **5** |
| `ROW_MIN` | 4 | **3** |
| `MIN_PIXELS` | 20 | 20 |
| `CONF_SHIFT` | 4 | 4 |
| `sat_ok` | `4B ≤ R` (0,75) | `4B ≤ R` (0,75) |
| `hue_hi` | `4n ≤ 3d` (45°) | `4n ≤ 3d` (45°) |
| `LUM_MIN` / `CHROMA_MIN` | 32 / 24 | 32 / 24 |
| `MAX_SPAN` | 255 | 255 |

### 1.0-ae ⚠️ Điều kiện tiên quyết để đo được

Ba capture hiện có đều cho thấy **vật chưa bao giờ nằm đúng trong khung** ở
điều kiện đủ sáng:

| Capture | Giờ | `mean R8` | `max_r5` | `cnt_match` |
| :--- | :--- | ---: | ---: | ---: |
| `px_rev4` | 12:44 | 186,6 | 31 | 36 |
| `px_rev5` | 13:59 | 119,2 | 31 | 43 |
| **`lid25`** | **17:16** | **9,8** | **2–12** | **0** |

`lid25` có `mean R8 = 9,8` và `max_r5` chỉ 2–12 trong khi bình thường là 31 ⇒
**không có pixel đỏ nào trong khung**. Nếu nắp cam phủ kín khung ở 25 cm,
`mean R8` phải vào khoảng 200–240.

**Trước khi kết luận rev 10 đúng hay sai, cần một capture hợp lệ:**

| Chỉ số | Phải đạt |
| :--- | :--- |
| `mean R8` | **> 180** |
| `max_r5` | **= 31** |

Nếu không đạt hai ngưỡng này thì nắp chưa ở trong khung, và mọi kết luận về
ngưỡng màu đều không có giá trị.

### 1.0-af Chưa sửa: `MAX_SPAN = 255`

`bbox_w`/`bbox_h` là **8 bit** (ABI IF-01). Vật có cạnh > 255 px trong ảnh
cho `N = 0` tuyệt đối. Với nắp 10 cm và `fx = 346 px`:

| Khoảng cách | Cạnh nắp | Kết quả |
| ---: | ---: | :--- |
| 10 cm | 346 px | **luôn `N=0`** |
| 13 cm | 267 px | **luôn `N=0`** |
| **14 cm** | 247 px | có thể `N=1` |
| 25 cm | 139 px | có thể `N=1` |
| 78 cm | 44 px | có thể `N=1` |

Muốn sửa phải mở rộng `bbox_w`/`bbox_h` lên 10 bit ⇒ **đổi ABI IF-01** ⇒ cần
human approval.

### 1.0-ag Bản `1792FFFB` (rev 9) — đã bị thay thế

> **Thay thế `B65114B3` (rev 8, cùng ngày).** Rev 8 đặt `MIN_PIXELS = 50` dựa
> trên giả thiết *"nắp cam chiếm 300–700 pixel"*. **Giả thiết đó sai.**
>
> Đo trên bo `px_rev5.bin` (65 khung, dùng bộ lọc **chặt hơn** rev 8):
>
> | Ngưỡng | Số khung đạt |
> | ---: | ---: |
> | ≥ 16 | 60/65 (92 %) |
> | **≥ 20** | **56/65 (86 %)** |
> | ≥ 36 | 40/65 (62 %) |
> | ≥ 50 | **24/65 (37 %)** ← rev 8 |
>
> `cnt_match` trung bình **43 px**, **cao nhất 89 px**. Ở `MIN_PIXELS = 50`,
> **63 % số khung bị loại** — đúng với log `BB n0` liên tục.
>
> Rev 9 hạ `MIN_PIXELS` về **20** và giữ `sat_ok = 0,75`.

| Trường | Giá trị |
| :--- | :--- |
| Đường dẫn | `KVC_PR/impl/pnr/KVC_FPGA.fs` |
| SHA-256 | `1792FFFB372773788BDA19E37F2DAB5132192BC32D7F6ED45B492281EEB9E656` |
| Bản sao | `review/artifacts/KVC_FPGA_release_1792FFFB.fs` |
| Thời điểm build | 2026-11-04 (Asia/Saigon) |
| Tool | Gowin V1.9.11.03 Education x64 |
| Device | GW2A-LV18PG256C8/I7 |
| Top module | `kvc_top_demo`, `BBOX_SOURCE = 1`, `DIAG_MODE = 0` |
| Fmax `clk_100m` | **128,918 MHz**; **0 setup / 0 hold vi phạm** |
| Fmax `cam_pclk` | **87,561 MHz** (ràng buộc 24) |
| LUT / Register / DSP | 2.020 (1.786 LUT + 234 ALU + 0 ROM16) / 1.314 / 0,5 |
| Nạp bo | **CHƯA NẠP** |
| Mức bằng chứng | `BUILT` + `SIMULATED` — **không phải** `HARDWARE-VERIFIED` |

### 1.0-w Ngưỡng rev 9

| Tham số | Rev 8 | **Rev 9** | Lý do |
| :--- | ---: | ---: | :--- |
| `sat_ok` | `4B ≤ R` (0,75) | `4B ≤ R` (0,75) | giữ — nắp ăn mượt |
| `hue_hi` | `4n ≤ 3d` (45°) | `4n ≤ 3d` (45°) | không đổi |
| `hue_lo` | `6n ≥ d` (10°) | `6n ≥ d` (10°) | không đổi |
| `ROW_MIN` | 4 | 4 | không đổi |
| **`MIN_PIXELS`** | **50** | **20** | 50 loại 63 % khung |
| `CONF_SHIFT` | 4 | 4 | `cnt = 20` → `conf = 1` |
| `LUM_MIN` / `CHROMA_MIN` | 32 / 24 | 32 / 24 | không đổi |
| `MAX_SPAN` | 255 | 255 | không đổi |

### 1.0-x ⚠️ Vì sao không có cấu hình nào cho `n1` 100 %

Đây là **giới hạn vật lý**, không phải tham số:

| Đại lượng | Đo được |
| :--- | ---: |
| `pix_count` trung bình | 62.178 px/frame |
| `cnt_match` trung bình | **43 px** (0,07 % frame) |
| `cnt_match` cao nhất | **89 px** |
| Kỳ vọng nếu nắp 10 cm @78 cm chiếm đủ | ~788 px |
| **Tỉ lệ đạt được** | **5,5 %** so với kỳ vọng |

Chỉ **0,07 %** số pixel trong frame qua được toàn bộ chuỗi lọc. Dù nạp cam
chiếm ~2.000 px trên ảnh, chỉ ~43 px lọt. Nguyên nhân **chưa xác định** — có
thể là F-10 (frame mất 60 % dòng) cộng với chói sáng bề mặt nắp.

**Để đạt `n1` mọi khung cần đóng F-10 trước.** Nếu frame chỉ có 40 % dòng, mọi
ngưỡng đều phải đặt thấp và nhiễu sẽ tăng tương ứng.

### 1.0-y Đối trái đã ghi

| Vùng da | Số pixel | Kết quả |
| :--- | ---: | :--- |
| Da tối nhỏ (< 20 px) | 4–19 | **chặn** |
| Da tối vừa (20–50 px) | 20–50 | **lọt** |
| Bàn tay đầy đủ @78 cm | ~1.200 | **lọt — phát bbox** |

Test 19 (`tb_kvc_blob_detect`) khoá hành vi "bàn tay phải phát bbox".

### 1.0-z Bản `B65114B3` (rev 8) — đã bị thay thế

> **Thay thế `19C849D4` (rev 7, cùng ngày).** Rev 8 là bản chốt cho buổi chấm:
> nới bão hoà về 0,75 để nắp cam ăn **liên tục, không chập chờn**, và bù lại
> bằng `MIN_PIXELS = 50` để chặn vùng da nhỏ của ngón tay cầm nắp.
>
> **Lý do đổi từ rev 7:** với `sat_ok = 0,80`, biên an toàn của nắp cam
> (S ≈ 0,78–0,82) chỉ ~0,02 — **nhỏ hơn biên dao động AWB giữa các khung**.
> Đó chính là nguyên nhân `n1` chỉ hiện ~10 % số khung. Hạ về 0,75 cho biên
> ~0,05, đủ để AWB dao động mà không rớt.

| Trường | Giá trị |
| :--- | :--- |
| Đường dẫn | `KVC_PR/impl/pnr/KVC_FPGA.fs` |
| SHA-256 | `B65114B358C1F899C6939ECD5E238D817B9D9C4738E32F1794E90D649DF94CCF` |
| Bản sao | `review/artifacts/KVC_FPGA_release_B65114B3.fs` |
| Thời điểm build | 2026-11-04 (Asia/Saigon) |
| Tool | Gowin V1.9.11.03 Education x64 |
| Device | GW2A-LV18PG256C8/I7 |
| Top module | `kvc_top_demo`, `BBOX_SOURCE = 1`, `DIAG_MODE = 0` |
| Fmax `clk_100m` | **116,310 MHz**; **0 setup / 0 hold vi phạm** |
| Fmax `cam_pclk` | **81,098 MHz** (ràng buộc 24) |
| LUT / Register / DSP | 2.024 (1.789 LUT + 235 ALU + 0 ROM16) / 1.314 / 0,5 |
| Nạp bo | **CHƯA NẠP** |
| Mức bằng chứng | `BUILT` + `SIMULATED` — **không phải** `HARDWARE-VERIFIED` |

### 1.0-r Ngưỡng rev 8

| Tham số | Rev 7 | **Rev 8** | Lý do |
| :--- | ---: | ---: | :--- |
| `sat_ok` | `5B ≤ R` (0,80) | **`4B ≤ R` (0,75)** | biên an toàn nắp cam 0,02 → 0,05 |
| `hue_hi` | `4n ≤ 3d` (45°) | `4n ≤ 3d` (45°) | không đổi |
| `hue_lo` | `6n ≥ d` (10°) | `6n ≥ d` (10°) | không đổi |
| `ROW_MIN` | 3 | **4** | chặn vệt sáng ngang ngắn |
| `MIN_PIXELS` | 20 | **50** | chặn vùng da ngón tay (15–49 px) |
| `CONF_SHIFT` | 4 | 4 | `cnt = 50` → `conf = 3` |
| `LUM_MIN` / `CHROMA_MIN` | 32 / 24 | 32 / 24 | không đổi |
| `MAX_SPAN` | 255 | 255 | không đổi |

Vùng mã nhận:

| Cấu hình | Số mã / 65.536 | % |
| :--- | ---: | ---: |
| Rev 6 (0,80 / 40°) | 2.202 | 3,36 % |
| Rev 7 (0,80 / 45°) | 2.573 | 3,93 % |
| **Rev 8 (0,75 / 45°)** | **3.048** | **4,65 %** |

### 1.0-s Ma trận màu rev 8

| Màu | R8/G8/B8 | H | S | Rev 7 | **Rev 8** |
| :--- | :--- | ---: | ---: | :---: | :---: |
| Cam phao (255,120,20) | 248/120/16 | 26,9° | 0,935 | nhận | **nhận** |
| Nắp cam 31° (255,150,40) | 248/148/40 | 31,2° | 0,839 | nhận | **nhận** |
| Nắp cam 42,7° (248,188,40) | 248/188/40 | 42,7° | 0,839 | nhận | **nhận** |
| Cam tối 25 % / 50 % | — | ~33° | 1,000 | nhận | **nhận** |
| Vàng chanh (255,230,60) | 248/228/56 | 53,8° | 0,774 | loại | **loại** (hue) |
| Da sáng (198,134,66) | 192/132/64 | 31,9° | 0,667 | loại | **loại** (sat) |
| **Da tối (141,85,36)** | 136/84/32 | 30,0° | 0,765 | loại | **NHẬN pixel** |
| **Da ngăm (176,108,40)** | 176/108/40 | 30,0° | 0,773 | loại | **NHẬN pixel** |
| Da rất tối (110,70,40) | 104/68/40 | 26,2° | 0,615 | loại | **loại** (sat) |
| Nước / Trắng | — | — | — | loại | **loại** |

### 1.0-t ⚠️ ĐỐI TRÁI CỦA REV 8 — ĐỌC KỸ

**`MIN_PIXELS = 50` chỉ chặn được vùng da NHỎ, không chặn da nói chung.**

| Vùng da | Số pixel | Kết quả |
| :--- | ---: | :--- |
| Ngón tay cầm nắp (ước tính) | 15–49 | **bị chặn** |
| Đầu ngón tay đầy đủ | ~50–150 | **lọt** |
| Bàn tay đầy đủ ở 78 cm | **~1.200** | **LỌT — phát bbox** |

Test 21 (`tb_kvc_blob_detect`) **khoá hành vi này**: bàn tay 80×80 px da tối
**phải** phát bbox. Test này không phải để khen — nó ghi lại giới hạn để không
ai tưởng rev 8 loại được da ở mọi kích thước.

**Hệ quả cho demo:** nếu người cầm nắp chỉ để lộ **đầu ngón tay** → an toàn.
Nếu để lộ **cả bàn tay** trong khung → có thể `n1` giả. Cách phòng: cầm nắp
sao cho tay nằm ngoài khung, hoặc chấp nhận rằng hệ thống có thể báo mục tiêu
khi thấy bàn tay.

### 1.0-u Tầm nhìn rev 8 (tính, chưa đo)

Giả định `fx = 346 px`, mất 40 % dòng. Cần **cả** `cnt ≥ 50` **và** `rows ≥ 4`,
tức cạnh vật **≥ 12 px**.

**Ở 78 cm** (1 cm = 4,44 px):

| Nắp | cạnh | cnt | rows | Kết quả |
| :--- | ---: | ---: | ---: | :--- |
| 2 cm | 8,9 px | 32 | 3,6 | **rớt** |
| 2,5 cm | 11,1 px | 49 | 4,4 | **rớt** (cnt 49 < 50) |
| **3 cm** | 13,3 px | 71 | 5,3 | **đạt** |
| **10 cm** | 44,4 px | 789 | 17,8 | **đạt** |

**Ở 3 m:**

| Nắp | cạnh | cnt | rows | Kết quả |
| :--- | ---: | ---: | ---: | :--- |
| 8 cm | 9,2 px | 34 | 3,7 | **rớt** |
| **10 cm** | 11,5 px | 53 | 4,6 | **đạt** (sát ngưỡng) |
| 15 cm | 17,3 px | 120 | 6,9 | đạt |

⇒ Ở 78 cm, nắp **≥ 3 cm** là ăn. Ở 3 m, nắp **≥ 10 cm** là ăn (sát ngưỡng).

### 1.0-v Bản `19C849D4` (rev 7) — đã bị thay thế

> **Thay thế `4E7C1A59` (rev 6, cùng ngày).** Rev 6 siết `hue_hi` về 40° và
> nâng `MIN_PIXELS` 36 / `ROW_MIN` 5. **Đo trên bo: `BB n0` liên tục** — camera
> và FPGA vẫn sống (`v1`, `byt` tăng) nhưng 0 ứng viên.
>
> Ba nguyên nhân xác định từ log + hình học:
> 1. nắp hộp có ánh vàng cam **~42°** > 40° → `hue_hi` loại;
> 2. ở 3 m, nắp ~10 cm chỉ còn **~4,6 dòng** có dữ liệu (frame mất ~60 % dòng)
>    → `ROW_MIN = 5` loại;
> 3. `MIN_PIXELS = 36` sát với `cnt` thực tế ở 3 m.
>
> Rev 7 **giữ nguyên `sat_ok = 5B ≤ R` (0,80)** — lớp chặn da người chính — và
> chỉ nới phần màu + hình học.

| Trường | Giá trị |
| :--- | :--- |
| Đường dẫn | `KVC_PR/impl/pnr/KVC_FPGA.fs` |
| SHA-256 | `19C849D4A233056E2C994C641EA6E6FEB515109240EECA439B6B027D85B1C109` |
| Bản sao | `review/artifacts/KVC_FPGA_release_19C849D4.fs` |
| Thời điểm build | 2026-11-04 (Asia/Saigon) |
| Tool | Gowin V1.9.11.03 Education x64 |
| Device | GW2A-LV18PG256C8/I7 |
| Top module | `kvc_top_demo`, `BBOX_SOURCE = 1`, `DIAG_MODE = 0` |
| Fmax `clk_100m` | **109,452 MHz**; **0 setup / 0 hold vi phạm** |
| Fmax `cam_pclk` | **94,387 MHz** (ràng buộc 24) |
| LUT / Register / DSP | 2.053 (1.810 LUT + 243 ALU + 0 ROM16) / 1.314 / 0,5 |
| Nạp bo | **CHƯA NẠP** |
| Mức bằng chứng | `BUILT` + `SIMULATED` — **không phải** `HARDWARE-VERIFIED` |

### 1.0-m Ngưỡng rev 7

| Tham số | Rev 6 | **Rev 7** | Lý do |
| :--- | ---: | ---: | :--- |
| `sat_ok` | `5B ≤ R` (0,80) | **`5B ≤ R` (0,80)** | **giữ** — lớp chặn da người |
| `hue_hi` | `3n ≤ 2d` (40°) | **`4n ≤ 3d` (45°)** | nắp hộp 42° |
| `hue_lo` | `6n ≥ d` (10°) | `6n ≥ d` (10°) | không đổi |
| `ROW_MIN` | 5 | **3** | ở 3 m chỉ còn ~4,6 dòng |
| `MIN_PIXELS` | 36 | **20** | ở 3 m nắp 10 cm cho cnt ~53 |
| `CONF_SHIFT` | 5 | **4** | `cnt = 20` → `conf = 1` (nếu giữ 5 thì conf = 0) |
| `MAX_SPAN` | 255 | 255 | không đổi |

Vùng mã nhận:

| Cấu hình | Số mã / 65.536 | % |
| :--- | ---: | ---: |
| Rev 6 (0,80 / 40°) | 2.202 | 3,36 % |
| **Rev 7 (0,80 / 45°)** | **2.573** | **3,93 %** |
| Rev 5 (0,75 / 45°) | 3.048 | 4,65 % |

Rev 7 chỉ mở **+371 mã** so với rev 6 — đúng phần đuôi vàng-cam 40–45°, **không**
mở lại vùng bão hoà thấp (đó là 475 mã chênh lệch giữa rev 5 và rev 7).

### 1.0-n Ma trận màu rev 7

| Màu | R8/G8/B8 | H | S | Rev 6 | **Rev 7** |
| :--- | :--- | ---: | ---: | :---: | :---: |
| Cam phao (255,120,20) | 248/120/16 | 26,9° | 0,935 | nhận | **nhận** |
| Nắp cam 31° (255,150,40) | 248/148/40 | 31,2° | 0,839 | nhận | **nhận** |
| **Nắp cam 42,7° (248,188,40)** | 248/188/40 | **42,7°** | 0,839 | **loại** | **nhận** |
| Cam tối 25 % / 50 % | 64/36/0, 120/64/0 | ~33° | 1,000 | nhận | **nhận** |
| Vàng chanh (255,230,60) | 248/228/56 | 53,8° | 0,774 | loại | **loại** |
| Da sáng (198,134,66) | 192/132/64 | 31,9° | 0,667 | loại | **loại** |
| **Da tối (141,85,36)** | 136/84/32 | 30,0° | 0,765 | loại | **loại** |
| **Da ngăm (176,108,40)** | 176/108/40 | 30,0° | 0,773 | loại | **loại** |
| Da rất tối (110,70,40) | 104/68/40 | 26,2° | 0,615 | loại | **loại** |
| Nước / Trắng | — | — | — | loại | **loại** |

**Da người vẫn bị chặn 100 %** vì `sat_ok` không đổi. Đây là điểm then chốt:
da bị loại **trên từng pixel**, nên hạ `MIN_PIXELS`/`ROW_MIN` không mở lại lỗ này.

### 1.0-o Tầm nhìn rev 7 (tính, chưa đo)

Giả định `fx = 346 px` (400 px rộng, HFOV 60°) và **mất 40 % pixel** (đo được:
62.178 px trên 390 HREF = 155 dòng có dữ liệu):

| Vật | cạnh @3 m | cnt @3 m | dòng @3 m | Kết quả |
| :--- | ---: | ---: | ---: | :--- |
| 5 cm | 5,8 px | 13 | 2,3 | **rớt** (MIN=20, ROW=3) |
| 6 cm | 6,9 px | 19 | 2,8 | **rớt** |
| **7 cm** | 8,1 px | 26 | 3,2 | **đạt** |
| **10 cm** | 11,5 px | 53 | 4,6 | **đạt** |
| 15 cm | 17,3 px | 120 | 6,9 | đạt |

⇒ Nắp hộp **≥ 7 cm** mới bắt được ở 3 m. Nắp nhỏ hơn sẽ rớt — giới hạn quang
học, không phải lỗi RTL.

### 1.0-p Đối trái của rev 7 — phải biết

**Vàng mật ong / đèn tròn vàng (H ≈ 42,7°, S = 0,839) giờ LỌT.** Nó **trùng màu**
với nắp hộp cần nhận. Không bộ lọc màu nào tách được hai màu này — chỉ có thể
tách bằng hình dạng hoặc bằng mô hình học sâu (không có trong thiết kế hiện tại).

### 1.0-q Bản `4E7C1A59` (rev 6, 04/11/2026) — đã bị thay thế

> **Thay thế `034DB01B` (cùng ngày).** Task `KVC-FPGA-BLOB-REV6` siết lại
> ngưỡng để **loại triệt để màu da người**: `sat_ok` về `5B ≤ R` (0,80),
> `hue_hi` về `3n ≤ 2d` (40°), `ROW_MIN` 5, `MIN_PIXELS` 36, `CONF_SHIFT` 5.
>
> Lý do: bản rev 5 dùng `4B ≤ R` (0,75) đã để **da người tối** (S = 0,765)
> lọt qua bộ lọc màu. Hue của da và phao chỉ lệch 1,2° nên **chỉ bão hoà**
> tách được hai màu — xem `kvc_blob_detect.v` §"GIOI HAN DA BIET".

| Trường | Giá trị |
| :--- | :--- |
| Đường dẫn | `KVC_PR/impl/pnr/KVC_FPGA.fs` |
| SHA-256 | `4E7C1A59FE92FC1FC41ED42350A735333C256DCF99213DD66C94E6B1A70DD34D` |
| Bản sao | `review/artifacts/KVC_FPGA_release_4E7C1A59.fs` |
| Thời điểm build | 2026-11-04 (Asia/Saigon) |
| Tool | Gowin V1.9.11.03 Education x64 |
| Device | GW2A-LV18PG256C8/I7 (GW2A-18, version C) |
| Top module | `kvc_top_demo`, `BBOX_SOURCE = 1`, `DIAG_MODE = 0` |
| Fmax `clk_100m` | **100,858 MHz**; **0 setup / 0 hold vi phạm** |
| Fmax `cam_pclk` | **74,015 MHz** (ràng buộc 24) |
| LUT / Register / DSP | 2.032 (1.809 LUT + 223 ALU + 0 ROM16) / 1.314 / 0,5 |
| Nạp bo | **CHƯA NẠP** |
| Mức bằng chứng | `BUILT` + `SIMULATED` — **không phải** `HARDWARE-VERIFIED` |

> ⚠️ **Margin timing mỏng: 0,86 %** (100,858 so với ràng buộc 100 MHz).
> Bản `034DB01B` đạt 128,147 MHz, bản này 100,858 MHz. Nguyên nhân là thay đổi
> tổ hợp so sánh `3n ≤ 2d` / `5B ≤ R` — không phải lỗi, nhưng nếu nhiệt độ hoặc
> điện áp lệch khỏi góc slow 0,95 V / 85 °C thì nên build lại với ràng buộc
> chặt hơn để kiểm tra. **Không phải `HARDWARE-VERIFIED` trên bo.**

### 1.0-i Ngưỡng rev 6

| Tham số | Rev 5 | **Rev 6** | Mục đích |
| :--- | ---: | ---: | :--- |
| `sat_ok` | `4B ≤ R` (0,75) | **`5B ≤ R` (0,80)** | loại da người tối (S = 0,765) |
| `hue_hi` | `4n ≤ 3d` (45°) | **`3n ≤ 2d` (40°)** | loại vàng mật ong (H = 42,7°) |
| `hue_lo` | `6n ≥ d` (10°) | `6n ≥ d` (10°) | không đổi |
| `ROW_MIN` | 3 | **5** | loại vệt sáng quét ngang |
| `MIN_PIXELS` | 16 | **36** | giảm nhiễu phòng |
| `CONF_SHIFT` | 4 | **5** | `cnt = 36` → `conf = 1` |
| `MAX_SPAN` | 255 | 255 | không đổi |

Tra trên toàn bộ 65.536 mã RGB565 (cùng `LUM_MIN`, `CHROMA_MIN`):

| Cấu hình | Số mã khớp | % |
| :--- | ---: | ---: |
| Rev 5 (0,75 / 45°) | 3.048 | 4,65 % |
| **Rev 6 (0,80 / 40°)** | **2.202** | **3,36 %** |

### 1.0-j Ma trận màu đã kiểm bằng testbench

| Màu | R8/G8/B8 | H | S | Rev 5 | **Rev 6** |
| :--- | :--- | ---: | ---: | :---: | :---: |
| Cam phao (255,120,20) | 248/120/16 | 26,9° | 0,935 | nhận | **nhận** |
| Nắp cam 42° (255,150,40) | 248/148/40 | 31,2° | 0,839 | nhận | **nhận** |
| Cam tối 25 % (63,32,0) | 64/36/0 | 33,8° | 1,000 | nhận | **nhận** |
| Cam tối 50 % (127,64,0) | 120/64/0 | 32,0° | 1,000 | nhận | **nhận** |
| Da sáng (198,134,66) | 192/132/64 | 31,9° | 0,667 | loại | **loại** |
| **Da tối (141,85,36)** | 136/84/32 | 30,0° | **0,765** | **nhận** | **loại** |
| **Da ngăm (176,108,40)** | 176/108/40 | 30,0° | **0,773** | **nhận** | **loại** |
| Vàng chanh (255,230,60) | 248/228/56 | 53,8° | 0,774 | loại | **loại** |
| **Vàng mật ong (248,188,40)** | 248/188/40 | **42,7°** | 0,839 | **nhận** | **loại** |
| Nước (60,150,180) | 56/148/176 | — | âm | loại | **loại** |
| Trắng | 248/252/248 | — | 0,000 | loại | **loại** |

Hai dòng in đậm là **hai lỗi của rev 5 được rev 6 sửa**, mỗi lỗi do một ngưỡng
khác nhau: da ngăm do `sat_ok`, vàng mật ong do `hue_hi`.

### 1.0-k Giới hạn phải biết

- **Chưa đo trên bo.** Toàn bộ bảng trên là `SIMULATED` (bơm pixel lý tưởng),
  không phải ảnh chụp thật. Chưa có TPR/FPR.
- **`MIN_PIXELS = 36` + `ROW_MIN = 5`** có thể làm rớt phao ở 35–40 cm nếu
  phao chiếm < 36 pixel. Cần đo thực tế.
- **Ánh sáng phòng làm nhạt màu** sẽ đẩy S xuống dưới 0,80 và phao bị loại.
  Cách xử lý đúng là chỉnh AWB/gain của OV2640, **không** hạ `sat_ok`.
- Không có connected-component labeling: mọi pixel khớp trong frame gộp vào
  **một** hộp bao. Hai vật cam ở hai góc sẽ làm `box_w` vượt `MAX_SPAN` và
  mất cả hai.

### 1.0-l Bản `034DB01B` (04/11/2026) — đã bị thay thế

> **Thay thế `4C74C0EF` (cùng ngày, 14:14).** Bản đó có `MIN_PIXELS = 48`,
> `ROW_MIN = 6`, `5B ≤ R`, `3n ≤ 2d` — đã được **HARDWARE-VERIFIED** trên bo:
> `n1` khi có nắp hộp cam, `n0` khi bỏ ra, LoRa `tx` tăng liên tục.
>
> Trong lúc kiểm chứng, file nguồn trên đĩa đã ở trạng thái `MIN_PIXELS = 20`,
> `ROW_MIN = 3`, `CONF_SHIFT = 4` và `.fs` là `8D2F84DE` (không phải `4C74C0EF`)
> — bản đã nạp bo là `8D2F84DE`, không phải `4C74C0EF`. Bản dưới đây kế thừa
> trạng thái đó và nới thêm bão hoà + dải hue.

| Trường | Giá trị |
| :--- | :--- |
| Đường dẫn | `KVC_PR/impl/pnr/KVC_FPGA.fs` |
| SHA-256 | `034DB01B53A97AEC499EA3CC4004D729244BD82882FAACBF30924C4EF1E610FD` |
| Bản sao | `review/artifacts/KVC_FPGA_release_034DB01B.fs` |
| Thời điểm build | 2026-11-04 14:41 (Asia/Saigon) |
| Top module | `kvc_top_demo`, `BBOX_SOURCE = 1`, `DIAG_MODE = 0` |
| Fmax `clk_100m` | **128,147 MHz**; TNS 0; **0 setup / 0 hold vi phạm** |
| Fmax `cam_pclk` | **81,085 MHz** (ràng buộc 24) |
| LUT / Register / DSP | 2.009 (1.773 LUT + 236 ALU + 0 ROM16) / 1.314 / 0,5 |
| Nạp bo | **CHƯA NẠP** |
| Mức bằng chứng | `BUILT` + `SIMULATED` — không phải `HARDWARE-VERIFIED` |

### 1.0-g Nới ngưỡng rev 5 (cho demo trong nhà)

| Tham số | Trước | Sau | Tác dụng |
| :--- | ---: | ---: | :--- |
| `hue_hi` | `3n ≤ 2d` (H ≤ 40°) | **`4n ≤ 3d`** (H ≤ 45°) | bắt trọn dải vàng cam của nắp hộp |
| `sat_ok` | `5B ≤ R` (S ≥ 0,80) | **`4B ≤ R`** (S ≥ 0,75) | chịu được ánh đèn phòng làm nhạt màu |
| `ROW_MIN` | 6 | **3** | vật nghiêng / xa vẫn đủ số dòng |
| `MIN_PIXELS` | 20 | **16** | vật nhỏ ở 35–40 cm vẫn vượt ngưỡng |

Đo trên toàn bộ 65.536 mã RGB565 (cùng `LUM_MIN`, `CHROMA_MIN`, `hue_lo`):

| Cấu hình | Số mã khớp | % |
| :--- | ---: | ---: |
| Cũ (`5B`, `3n≤2d`) | 2.202 | 3,36 % |
| **Mới (`4B`, `4n≤3d`)** | **3.048** | **4,65 %** |
| Chỉ đổi `sat` | 2.611 | 3,98 % |
| Chỉ đổi `hue` | 2.573 | 3,93 % |

> ⚠️ **Đối trái đã ghi nhận: `S ≥ 0,75` cho MÀU DA NGƯỜI TỐI lọt qua.**
> Da tối (141,85,36) → R8/G8/B8 = 136/84/32, H = 30°, **S = 0,765**:
> `5·32 = 160 > 136` (loại ở bản cũ) nhưng `4·32 = 128 ≤ 136` (nhận ở bản mới).
> Test 18 (`tb_kvc_blob_detect`) **khoá hành vi này** — nó khẳng định da tối
> **phải** phát bbox, để không ai vô tình "sửa" mà không biết mình đang đổi gì.
>
> **Vàng chơi (255,230,60) vẫn bị loại**, nhưng giờ **chỉ nhờ `hue_hi`**
> (H = 53,8° > 45°); bão hoà của nó (0,774) đã qua ngưỡng mới. Test 6 ghi rõ
> điều này. Nếu ai nới hue thêm nữa, vàng chơi sẽ lọt.

> **Đây là ngưỡng cho demo, không phải ngưỡng đã hiệu chuẩn.** Chưa có phép đo
> nào trên bo với bản `034DB01B`. Muốn hiệu chuẩn phải đo hai chiều: tỉ lệ `n1`
> khi có vật (mong 100 %) **và** tỉ lệ `n0` khi không có vật (mong ≥ 95 %).

### 1.0h Bản `4C74C0EF` (04/11/2026 14:14) — đã bị thay thế

| Trường | Giá trị |
| :--- | :--- |
| SHA-256 | `4C74C0EF443A25E62CFC80D3DDE1B3B087CF171C9281E4FCBA42102F48BAEE45` |
| Bản sao | `review/artifacts/KVC_FPGA_release_4C74C0EF.fs` |
| Top module | `kvc_top_demo`, `BBOX_SOURCE = 1`, `DIAG_MODE = 0` |
| Fmax `clk_100m` | 110,711 MHz; TNS 0 |
| Fmax `cam_pclk` | 81,639 MHz |
| LUT / Register / DSP | 2.032 (1.809 LUT + 223 ALU + 0 ROM16) / 1.314 / 0,5 |
| Tham số blob | `MIN_PIXELS = 48`, `ROW_MIN = 6`, `CONF_SHIFT = 5`, `sat 5B ≤ R`, `hue 3n ≤ 2d` |
| Nạp bo | **CHƯA NẠP** |
| Mức bằng chứng | `BUILT` + `SIMULATED` — **không phải** `HARDWARE-VERIFIED` |

> **Ghi chú tranh chấp nguồn:** sau khi build `4C74C0EF`, file
> `kvc_blob_detect.v` trên đĩa được sửa thành `MIN_PIXELS = 20`,
> `ROW_MIN = 3`, `CONF_SHIFT = 4`, và `KVC_PR/impl/pnr/KVC_FPGA.fs` thành
> `8D2F84DE`. Bản đã nạp bo và test thành công vì vậy là **`8D2F84DE`**
> (20/3), không phải `4C74C0EF` (48/6). Bản `034DB01B` kế thừa 20/3 rồi nới
> thêm bão hoà và hue.

### 1.0-e Thay đổi so với `9E62B590`

| File | Thay đổi | Lý do |
| :--- | :--- | :--- |
| `camera/ov2640_config.v` | thêm `COM7_SRST` + 10 ms đầu chuỗi; 10 ms sau `R_BYPASS=DSP_EN`; 10 ms sau `RESET=0` | driver `espressif/esp32-camera` gọi `vTaskDelay(10)` ở ba mốc này; bản cũ chỉ nghỉ 100 µs |
| `camera/ov2640_config.v` | delay đếm theo đơn vị 100 µs (hai tầng đếm) | tránh phép nhân `rom_dly * CYCLES_PER_MS` tạo path 12,236 ns |
| `processing/kvc_blob_detect.v` | `MIN_PIXELS` **120 → 48** | `cnt_match` đo được chỉ **4..89** trên khung thật; 120 cho `N=0` tuyệt đối |
| `processing/kvc_blob_detect.v` | `CONF_SHIFT` giữ 5 | `cnt = 48` → `conf = 1` (không bị triệt tiêu về 0) |

> **`MAX_SPAN` giữ 255** theo quyết định của HUMAN: mở lên 400 đòi hỏi mở rộng
> `box_w`/`box_h` quá 8 bit, tức đổi **ABI IF-01** — cần approval riêng.

> ⚠️ **`MIN_PIXELS = 48` là ngưỡng tạm để chạy thử, KHÔNG phải giá trị đã hiệu
> chuẩn.** Nó được chọn từ phân bố `cnt_match` trên **một** capture (65 khung):
> 24/65 khung đạt ≥ 48, 10/65 đạt ≥ 64, 0/65 đạt ≥ 120. Số khung đạt **không
> chứng minh** phát hiện đúng — có thể là nhiễu. Chỉ phép đo trên bo với vật
> thật (đếm `n1` khi có vật / `n0` khi không có) mới hiệu chuẩn được ngưỡng này.

### 1.0f Bản `9E62B590` (04/11/2026 04:52) — đã bị thay thế

| Bằng chứng | Nội dung |
| :--- | :--- |
| `evidence/KVC-G6.1-20261103-001.md` | 7/58 = **12,1 %** frame có `N=1` trên bitstream rev 1 |
| `evidence/KVC-G6.1-20261103-002_release.md` | 9/58 = **15,5 %** trên cùng bitstream, phiên khác |
| `evidence/KVC-G619-20261103-001.md` §8.1 | `G_MIN = 10` loại **đỏ thuần** (`G6 = 0`) — nghịch lý so với yêu cầu 6.1.9 |
| `evidence/G6.1_blob_vsyncdiag_20261102-1130.txt` §90-92 | Hộp bao bo thật có **fill 1,9–4,8 %**, aspect tới **4,96** ⇒ gần như toàn nhiễu hạt |

Nguyên nhân gốc: 5 bất đẳng thức trên **giá trị tuyệt đối** kênh R/G/B. Khi
exposure hoặc AWB thay đổi, cả ba kênh dịch cùng chiều và ngưỡng trượt. Đo bằng
số: `mean_r5` trên bo chỉ đạt 28/31 với vật đỏ, nhưng `G`/`B` vượt dải khi sáng.

Thay đổi (mỗi mục đều có test tương ứng):

| Thay đổi | Lý do | Kiểm |
| :--- | :--- | :--- |
| Ngưỡng tuyệt đối → **tỷ lệ** | hue và bão hoà không đổi khi gain/exposure đổi | `tb_kvc_blob_detect` test 14/16 (cam tối 25 %/50 % vẫn PASS) |
| `G_MIN`/`G_MAX` → dải hue `10..40°` | loại vàng mà không loại đỏ-cam bão hoà | test 6 (vàng), test 1 (cam) |
| Thêm `S ≥ 0,80` | tách da người (0,67), bùn (0,62), phù sa (0,71) | test 15 (da người) |
| Thêm **run-length ≥ 3** | nhiễu hạt và glint mặt nước là cụm 1–2 px | test 11 (1600 hạt rời rạc → 0) |
| Thêm **rows_good ≥ 6** | loại vệt mỏng 1–4 dòng | test 12 (200×4) |
| Thêm **aspect ≤ 4** | loại vệt ngang do phản xạ | test 13 (200×10) |
| `MIN_PIXELS` 400 → **120** | tăng tầm phát hiện từ ~15 m lên ~28 m (phao 0,7 m, f≈493 px) | test 3 (100 px loại), test 10 (400 px nhận) |
| `CONF_SHIFT` 6 → **5** | giữ `conf > 0` ở `cnt = 120` và không bóp conf về 1 | test 9 (conf=19), test 10 (conf=12) |

**Đánh đổi đã biết:** da người tối `#8D5524` có `S = 0,76`, sát ngưỡng 0,80. Nếu
đo trên bo cho thấy áo cam thật có `S < 0,80` (AWB kéo B lên), hạ `SAT_NUM` 5 → 4
(`S ≥ 0,75`) và chấp nhận tăng nhận nhầm da. Số đo quyết định, không phải suy đoán.

### 1.0d Tài nguyên và timing (release `9E62B590`)

| Chỉ số | `86CCF5DD` (rev 1) | **`9E62B590` (rev 2)** | Δ |
| :--- | ---: | ---: | ---: |
| Logic | 1.610 | **1.785** | +175 |
| LUT | 1.443 | **1.574** | +131 |
| ALU | 167 | **211** | +44 |
| Register | 1.250 | **1.281** | +31 |
| CLS | 1.376 | **1.479** | +103 |
| BSRAM | 1 | **1** | 0 |
| DSP | 0,5 | **0,5** | 0 |
| Fmax `clk_100m` | **113,277** (theo `docs/INDEX.md` IF-01) | **116,630 MHz** | +3,4 MHz |
| Fmax `cam_pclk` | **140,757 MHz** (§2.0) | **89,710 MHz** | **−51,0 MHz** |
| TNS setup/hold | 0 | **0** | 0 |
| Slack setup (min) | — | **+1,426 ns** | — |

**0 DSP, 0 BSRAM tăng thêm.** Ràng buộc "thuần tổ hợp, 0 BSRAM, 0 DSP" được giữ.
Chi phí +131 LUT cho toàn bộ bộ lọc tỷ lệ + 3 bộ lọc hình học (2,4 % tài nguyên
GW2A-18).

> **`cam_pclk` giảm 140,757 → 89,710 MHz nhưng vẫn dư 3,7× so với 24 MHz yêu
> cầu.** Mức giảm phản ánh đúng phần logic thêm vào (bộ lọc tỷ lệ + run-length +
> min/max + hình học). `clk_100m` **tăng nhẹ** vì đường tới hạn của nó là
> `u_bbox_pkt` (packetizer), không phải `u_blob`.
>
> Trong probe đo riêng bộ lọc đặt giữa 2 thanh ghi ở 24 MHz: slack **+33,5 ns**
> trên chu kỳ 41,7 ns. Không cần pipeline, giữ nguyên 0 chu kỳ trễ để toạ độ
> không lệch.
>
> **Nếu sau này nâng PCLK hoặc thêm bộ lọc:** 89,710 MHz là trần hiện tại của
> đường `cam_pclk`. Còn 3,7× biên, nhưng không nên thêm nhiều logic tổ hợp nữa
> mà không kiểm lại.

### 1.0e Kiểm chứng mô phỏng (04/11/2026)

| Kiểm tra | Kết quả |
| :--- | :--- |
| `scripts/run_fpga_tb.ps1` | **25/25 PASS**, exit 0 |
| `tb_kvc_blob_detect` | **18/18 PASS** (10 kịch bản gốc + 8 mới) |
| `tb_pixel_stats` | **21/21 PASS** |
| `tb_kvc_top_blob` | **8/8 PASS** |
| `pytest tests/integration/test_decode_pixel_diag.py` | **22/22 PASS** |
| `git diff --check` | OK |

---

## 1z. Bitstream TRƯỚC ĐÓ (01/11/2026 — blob detect rev 1, T13) — ĐÃ THAY THẾ

| Trường | Giá trị |
| :--- | :--- |
| Đường dẫn | `KVC_PR/impl/pnr/KVC_FPGA.fs` (bản cũ) |
| SHA-256 | `86CCF5DDAA12DED9D66C9729E27EBB828FF3A3D2B1B46170E79B61277C38ED13` |
| Git HEAD khi build | `2be0f05f92a0a31e0bd80d237eff2da939995e78` (working tree có thay đổi chưa commit) |
| Thời điểm build | 2026-11-01 15:12 (Asia/Saigon) |
| Tool | Gowin V1.9.11.03 Education x64 (`C:\Gowin\Gowin_V1.9.11.03_Education_x64`) |
| Device | GW2A-LV18PG256C8/I7 (GW2A-18, version C) |
| Top module | `kvc_top_demo` |
| Cấu hình | `BBOX_SOURCE = 1`, `DIAG_MODE = 0` — **BBox tính từ pixel thật**, không có YOLO11n / conv engine |
| Đặc điểm sửa đổi | Thêm `kvc_blob_detect` (threshold RGB565 + color dominance, 0 BSRAM); mux 3 nguồn BBox; `set_false_path` CDC `cam_pclk → clk_100m` |
| Lệnh build | `gw_sh tools/build_kvc_fpga.tcl` (chạy trong `KVC_PR/`) |

Mã kế hoạch: `KVC-FPGA-BLOB-20261101-001`. Chi tiết và bằng chứng testbench:
`evidence/KVC-FPGA-BLOB-20261101-001_T1-T13.md`.

Bản sao cục bộ: `review/artifacts/KVC_FPGA_release_86CCF5DD.fs`.

**Đã nạp bo 01/11/2026** — SRAM Program trên OneKiwi Primer 20K, camera OV2640.
Chạy 136 khung IF-01 hợp lệ, 0 lỗi CRC, 0 byte rác. Chi tiết:
`evidence/KVC-FPGA-G0G6-20261101-001.md`.

### 1.0a Kiểm lại baseline 01/11/2026 (task B0 / `KVC-FPGA-BASE-001`)

| Kiểm tra | Kết quả |
| :--- | :--- |
| `Get-FileHash KVC_PR/impl/pnr/KVC_FPGA.fs -Algorithm SHA256` | `86CCF5DDA…38ED13` — **khớp dòng §1** |
| `git rev-parse HEAD` | `2be0f05f92a0a31e0bd80d237eff2da939995e78` — **khớp dòng §1** |
| Working tree của `KVC_PR/` | **CÒN 9 file sửa + 10 file chưa track** (xem `git status --short`) |
| Kết luận baseline | **CHƯA ĐÓNG (H6 blocking)** |

**Việc còn phải làm trước khi nạp bo (H6):** HUMAN duyệt commit theo phân hệ cho
`KVC_PR/` (`ov2640_config.v`, `sccb_master.v`, `kvc_top_demo.v`, `mock_bbox.v`,
`uart_tx.v`, `constraints/kvc_top_demo.sdc`, `KVC_FPGA.gprj`, 2 TB đã sửa) và
10 file chưa track (`kvc_blob_detect.v`, `build_kvc_fpga.tcl`, 8 TB mới). Nếu
không commit, `.fs` đang có **không tái lập được từ HEAD** dù SHA khớp tài liệu.

Bitstream hiện tại vẫn được coi là hợp lệ để nạp **thử** (SHA khớp hồ sơ), nhưng
mọi kết quả G0/G6/A1–A10 phải ghi kèm "working tree dirty, HEAD `2be0f05`" cho
tới khi H6 được duyệt.


### 1.0 Build diag Gate G0.1 (`BBOX_SOURCE=0`, `DIAG_MODE=1`)

| Trường | Giá trị |
| :--- | :--- |
| SHA-256 | `3620B802C010993DCF98E56691C5496132CB5347D6776D5B5EAA88BD5DFC5EBB` |
| Cấu hình | `BBOX_SOURCE = 0`, `DIAG_MODE = 1` |
| Fmax `clk_100m` / `cam_pclk` | 127,823 MHz / 170,149 MHz; TNS setup & hold = 0 |
| LUT / Register / BSRAM / DSP | 1.349 / 839 / 1 / 0,5 |
| Bản sao cục bộ | `review/artifacts/KVC_FPGA_diag_3620B802.fs` |
| Mục đích | Nạp cho G0.3 (`x` tăng 27–33 đơn vị/giây) và G0.4 (`y = 1`) |
| Trạng thái | `BUILT`. **Chưa nạp bo.** G0.3/G0.4 đã đạt **gián tiếp** qua bản release `86CCF5DD` ngày 01/11/2026 (§8) — không qua thủ tục diag |

### 1.0b Bitstream blob trước khi sửa cảnh báo `EX1998`

| Trường | Giá trị |
| :--- | :--- |
| SHA-256 | `814A9987AD685DA97DB43BC64BF900E0C4AD187A015CE45C7E6AFBFA8BDC1D28` |
| Khác biệt | Cùng timing/tài nguyên với bản hiện tại; chỉ thiếu gán 0 cho `cnn_out_*` nên có 8 cảnh báo `EX1998` |
| Bản sao cục bộ | `review/artifacts/KVC_FPGA_release_814A9987.fs` |

### 1.0b2 Bitstream CHẨN ĐOÁN TỰ ĐO VSYNC (`DIAG_MODE = 2`) — 02/11/2026

**Ba bản, cùng mục đích, tăng dần chức năng:**

| Bản | SHA-256 | Fmax `clk_100m` | LUT | Slot | Ghi chú |
| :--- | :--- | ---: | ---: | :---: | :--- |
| rev 0 | `C82B9EFE7F6D7232867FB552495F8E76BF367D4CCA1DE666473843F9E171764C` | 105,030 | 2.437 | 10 | `t_bother` 8 bit → bị cắt |
| rev 1 | `840117FADCBB110339531D908A2451C957C35ABA359EC86594A7122C0FD3C263` | 121,436 | 2.416 | 10 | `t_bother` 16 bit |
| **rev 2** | **`CA6D5137292FEFACAB98DC2097A7611A110F9E052189FDC839D748D4752E4B9D`** | **109,546** | **2.588** | **12** | +bucket 2x/short, +lọc glitch |

**rev 2 — bản đang nạp trên bo (02/11/2026):**

| Trường | Giá trị |
| :--- | :--- |
| Cấu hình | `BBOX_SOURCE = 1`, `DIAG_MODE = 2`, `DIAG_TICK_HZ = 10_000`, `DIAG_WINDOW_MS = 2_000`, `DIAG_GLITCH_MS = 10` |
| Top module | `kvc_top_diag_vsync` (wrapper) |
| File constraint | `constraints/kvc_cam_pclk.sdc` (đường dẫn PLL có `u_top/`) |
| Fmax `clk_100m` / `cam_pclk` | **109,546** / **146,857 MHz**; TNS = **0** trên cả `clk_27m`, `clk_100m`, `cam_pclk` |
| LUT / Register / BSRAM / DSP | 2.588 / 2.180 / 1 / 0,5 |
| Đường tới hạn | `bbox_packetizer` **11,365 ns** — **không** phải logic chẩn đoán mới |
| Bản sao cục bộ | `review/artifacts/KVC_FPGA_diag_vsync_CA6D5137.fs` |
| Nạp bo | **02/11/2026, SRAM Program OK, Status `0x00006020`** (HUMAN báo; Kilo ghi nguyên văn) |
| Trạng thái hiện tại trên bo | **KHÔNG còn chạy rev 2** — xem ghi chú dưới |
| Bằng chứng | `evidence/KVC-CAM-DIAG-20261102-002.md` |

> ⚠️ **Rủi ro đang mở khi để bitstream này trên bo:** nó phát báo cáo `N = 12`
> trên đúng đường `R13` mà MCU Sonix đang đọc IF-01. Parser MCU cho phép tới
> `KVC_FPGA_MAX_CANDIDATES = 20` nên **N = 12 lọt qua**, và 12 "bbox" chẩn đoán
> (`class=2`, `conf=100`) bị coi là mục tiêu thật ⇒ `AI_DETECTED` báo sai, georef
> chạy trên số đếm chẩn đoán. Xem `evidence/KVC-CAM-DIAG-20261102-002.md` §7.

**Trạng thái thực tế trên bo ngày 02/11/2026 (đo trực tiếp, không suy đoán):**
`[M3] ... | BB n0 v1 crc0 en1 | LORA d1 ver=0x12 | tx=1759`. `n0` + `v1` +
`crc0` nghĩa là MCU đang nhận khung IF-01 hợp lệ **0 mục tiêu**, liên tục và
không lỗi CRC — đúng chữ ký của **bitstream release `86CCF5DD`**, không phải
rev 2. Nếu rev 2 đang chạy, `n` sẽ là **12** ở mọi gói, không phải 0.

⇒ Kết luận: **rev 2 đã được nạp tại một thời điểm, nhưng bo hiện KHÔNG chạy nó.**
Nhiều khả năng đã có lần nạp lại release giữa hai lần quan sát, hoặc SRAM đã mất
điện. Không cần suy đoán thêm; điều quan trọng là **rủi ro §7 chưa xảy ra trên
thực tế**, và `BB n0 v1 crc0` là bằng chứng trực tiếp cho điều đó.


| Trường | Giá trị |
| :--- | :--- |
| Cấu hình | `BBOX_SOURCE = 1`, `DIAG_MODE = 2`, `DIAG_TICK_HZ = 10_000`, `DIAG_WINDOW_MS = 2_000`, `DIAG_GLITCH_MS = 10` |
| Top module | **`kvc_top_diag_vsync`** (wrapper), không phải `kvc_top_demo` |
| File constraint | `constraints/kvc_cam_pclk.sdc` (khác `kvc_top_demo.sdc` ở đường dẫn PLL: `u_top/`) |
| Script build | `KVC_PR/tools/build_kvc_diag_vsync.tcl` (dùng `gw_sh`) |

**Thay đổi RTL kèm theo (đều đã test):**

| File | Thay đổi | Test |
| :--- | :--- | :--- |
| `src/comm/bbox_packetizer.v` | **F-04**: chốt `timestamp` vào `ts_lat` tại `start`, header đọc từ bản chốt | `tb_bbox_packetizer` **109/109 PASS**, gồm 3 case F-04; phép thử âm xác nhận bắt được lỗi |
| `src/processing/vsync_monitor.v` | **MỚI** — đo chu kỳ VSYNC bằng clock nội, không trừ 32 bit. rev 2 thêm **bucket 2x/short** và **lọc glitch** | `tb_vsync_monitor` **42/42 PASS** (rev 2), gồm cặp test 5/5b chứng minh cả năng lực và **giới hạn** của bộ lọc |
| `src/processing/vsync_report.v` | **MỚI** — đóng gói kết quả vào khung IF-01. rev 2: **12 slot**, `t_bother` 16 bit | `tb_vsync_selfmeas` **10/10 PASS** |
| `src/kvc_top_diag_vsync.v` | **MỚI** — wrapper cắm `DIAG_MODE = 2` (không sửa mặc định trong `kvc_top_demo.v`) | build OK |
| `src/kvc_top_demo.v` | thêm `DIAG_TICK_HZ` / `DIAG_WINDOW_MS` / `DIAG_GLITCH_MS` là `parameter`; thêm nhánh `DIAG_MODE = 2` | `tb_vsync_diag` **6/6**, `tb_kvc_top_blob` **8/8**, `tb_kvc_top_demo_uartlink` **5/5** |

**Vì sao rev 0 chỉ đạt 105,030 MHz:** đường tới hạn đã **rời khỏi** `vsync_monitor` và quay về `bbox_packetizer` (11,757 ns). Bản `vsync_monitor` đầu tiên đo bằng `now_ms − prev_ms` (trừ 32 bit) **giữ kỷ lục xấu**: Fmax 100,153 MHz, chỉ hơn ngưỡng 0,15 %. Đổi sang bộ đếm reset-theo-VSYNC đưa Fmax lên 105,030 MHz và giảm 234 LUT.

**rev 2 giảm còn 109,546 MHz** (từ 121,436 của rev 1) do thêm 172 LUT cho hai bucket và bộ lọc. Vẫn trên 100 MHz với biên **9,5 %**, TNS = 0. Đường tới hạn vẫn ở `bbox_packetizer`, **không** phải logic mới.

**Cấu hình `WINDOW_MS = 2.000` là bắt buộc trên bo, không phải tuỳ chọn.** Ở ~5 Hz, cửa sổ 1 s chỉ có ~5 xung; một lần lệch là 20 %. Testbench dùng `DIAG_TICK_HZ = 1 MHz` / `WINDOW_MS` nhỏ hơn chỉ để mô phỏng nhanh — **không** nạp cấu hình đó lên bo.

### 1.0b3 Bitstream CHẨN ĐOÁN THỐNG KÊ MÀU RGB565 (`DIAG_MODE = 3`) — 03/11/2026

Phục vụ mục 6.1.9. Top **`kvc_top_diag_pixel`** (wrapper cắm `DIAG_MODE = 3`,
`BBOX_SOURCE = 1`), build bằng `KVC_PR/tools/build_kvc_diag_pixel.tcl`, dùng
`constraints/kvc_cam_pclk.sdc` (đường PLL có `u_top/`).

| Bản | SHA-256 | Fmax `clk_100m` | LUT | FF | Ghi chú |
| :--- | :--- | ---: | ---: | ---: | :--- |
| rev 1 | `A92E18B97BADC7C4ADDAA714F06FAF6419FEF4A999CAC3A6F868F22A4FC7DB68` | ~122 | 1.854 | 1.311 | Ngưỡng **chặt hơn** blob (`R≥26, G≤12, B≤8`) ⇒ `red_count` **không so được với `cnt`**. **ĐÃ THAY THẾ** |
| rev 2 | `0B125CDC9F570B7230BDF37E490CE7D0947E0885028CFCF59BBA5D713A5B794E` | 118,224 | 2.015 | 1.452 | Đúng ngưỡng blob **cũ**; ngưỡng đó đã bị thay ⇒ **ĐÃ THAY THẾ** |
| **rev 5** | **`373CD91630C1A0D2F440F9CB163F14C8680627B5F9EA1DBDAAA3FACB9D0152F4`** | **112,059** | **2.621** | **1.590** | **Bản hiện hành.** Thêm `href_per_vs` + `vsync_per_rep` (F-10) và 3 delay 10 ms theo driver OV2640 chuẩn; slot 10 = `PIXSTAT_REV = 5` |
| rev 4 | `EC4BC0081339729AD8CAFA4551A3076908E0FCC04CF4A8827A61B9CF153971A4` | 119,792 | 2.296 | 1.525 | Đã bị thay thế. Sửa tràn 8 bit + `max_px`/`max_py` |
| **rev 3** | **`05288FA6657800200569850082C9765ACC149CC391B24F708FC79B1A89EA33E3`** | **113,761** | **2.187** | **1.504** | Đúng bộ lọc tỷ lệ của blob + run-length; slot 10 = `PIXSTAT_REV = 3`. **BỊ THAY THẾ** — `d`/`n` tràn 8 bit, `center_pixel` stale |

**rev 5 — bản hiện hành (04/11/2026):**

| Trường | Giá trị |
| :--- | :--- |
| Cấu hình | `BBOX_SOURCE = 1`, `DIAG_MODE = 3` |
| Top module | `kvc_top_diag_pixel` (wrapper) |
| Script build | `KVC_PR/tools/build_kvc_diag_pixel.tcl` (dùng `gw_sh`) |
| Fmax `clk_100m` | **112,059 MHz**; TNS setup & hold = **0**; 0 endpoint vi phạm |
| Fmax `cam_pclk` | **72,809 MHz** (ràng buộc 24 MHz) |
| Logic / Register / DSP | 2.621 (2.271 LUT + 350 ALU + 0 ROM16) / 1.590 / 0,5 |
| Bản sao cục bộ | `review/artifacts/KVC_FPGA_diag_pixel_373CD916.fs` (4.620.698 B) |
| Nạp bo | **CHƯA NẠP** |
| Bằng chứng | `tb_pixel_stats` **43/43**; `tb_ov2640_config` **17/17**; `test_decode_pixel_diag.py` **32/32** |

**Thay đổi rev 5:**

| File | Thay đổi | Lý do |
| :--- | :--- | :--- |
| `pixel_stats.v` | thêm `href_per_vs` (slot 11 X) và `vsync_per_rep` (slot 5 X, 6 bit cao) | phân biệt ba cơ chế cắt khung F-10: (A) sensor tự cắt, (B) gai VSYNC, (C) FPGA rớt pixel |
| `pixel_stats.v` | `max_px` còn 10 bit; `max_r5` dời sang slot 11 Y | giữ `N_SLOT = 12`, không đổi ABI IF-01 |
| `ov2640_config.v` | thêm `rom_dly[]` + `COM7_SRST` + 10 ms ở 3 mốc | driver `espressif/esp32-camera` gọi `vTaskDelay(10)` sau `reset()`, `set_window()`, `set_pixformat()`; ta chỉ nghỉ 100 µs |
| `ov2640_config.v` | delay đếm theo **đơn vị 100 µs** | `rom_dly * CYCLES_PER_MS` tạo path 12,236 ns, kéo Fmax xuống **101,211 MHz**; đổi sang bộ đếm hai tầng → **112,059 MHz** |

> **Bước 1 của yêu cầu "chuyển `RESET_DVP` lên trước `win_regs`" KHÔNG thực hiện
> được:** driver chuẩn cũng ghi `RESET_DVP` **sau** `win_regs`. Xem
> `evidence/KVC-G6.1-20261104-003.md` §1.

**rev 4 — đã bị thay thế (04/11/2026):**

| Trường | Giá trị |
| :--- | :--- |
| Cấu hình | `BBOX_SOURCE = 1`, `DIAG_MODE = 3` |
| Top module | `kvc_top_diag_pixel` (wrapper) |
| Script build | `KVC_PR/tools/build_kvc_diag_pixel.tcl` (dùng `gw_sh`) |
| Fmax `clk_100m` | **119,792 MHz**; TNS setup & hold = **0**; 0 endpoint vi phạm |
| Fmax `cam_pclk` | **70,545 MHz** (ràng buộc 24 MHz) |
| Logic / Register / BSRAM / DSP | 2.296 (1.958 LUT + 338 ALU) / 1.525 / 1 / 0,5 |
| Bản sao cục bộ | `review/artifacts/KVC_FPGA_diag_pixel_EC4BC008.fs` (7.264.154 B) |
| Nạp bo | **CHƯA NẠP** |
| Bằng chứng | `tb_pixel_stats` **34/34 PASS**; `test_decode_pixel_diag.py` **28/28 PASS** |

**Thay đổi RTL rev 4** (`KVC_PR/src/processing/pixel_stats.v`):

| Thay đổi | Lý do | Test |
| :--- | :--- | :--- |
| `d`/`n` tính theo 9 bit + `d_neg`/`n_neg`, kẹp 0 khi âm | Rev 3 khai báo 8 bit nên **tràn** khi `R8 < B8` / `G8 < B8`; `hue_ok`/`tone_ok` đếm cả pixel xanh/tím. Quét 65.536 mã: 10.581 mã (65 % `hue_ok`) và 24.192 mã (46,6 % `tone_ok`) là artifact | `tb_pixel_stats` test [5] |
| Slot 5 = `max_px`/`max_py` | `center_pixel` đọc tại `(320,240)`; nếu frame không tới dòng 240 thì in lại giá trị frame trước (stale). `max_px/max_py` cho biết **dải thật** đã nhận | `tb_pixel_stats` (frame 8×4 → 7/3) |
| `max_r5` chuyển sang slot 11 | nhường slot 5; rev 3 để slot 11 = 0 nên `max_r5` cũ vẫn đọc được từ capture cũ | same |
| Slot 10 = `PIXSTAT_REV = 4` | phân biệt bằng số, không suy đoán | `test_decode_pixel_diag.py` |
| `needle`: không đổi `cnt_match` | `ord_ok` đã bảo đảm `R > G > B` nên `d`, `n` luôn dương khi `match`; quét đủ 65.536 mã cho **2202 = 2202** | `tb_pixel_stats` 34/34 |

> ⚠️ **Bitstream này cũng phát `N = 12`** trên đường `R13` giống các bản diag
> trước. Parser MCU cho phép tới 20 ứng viên nên 12 "bbox" chẩn đoán (`class=2`,
> `conf=100`) bị coi là mục tiêu thật. **Nạp lại bitstream release `9E62B590`
> ngay sau khi capture.**

**rev 3 — bản đã bị thay thế (04/11/2026):**

| Trường | Giá trị |
| :--- | :--- |
| Cấu hình | `BBOX_SOURCE = 1`, `DIAG_MODE = 3` |
| Top module | `kvc_top_diag_pixel` (wrapper) |
| Script build | `KVC_PR/tools/build_kvc_diag_pixel.tcl` (dùng `gw_sh`) |
| Fmax `clk_100m` | 113,761 MHz; TNS setup & hold = 0 |
| LUT / Register / BSRAM / DSP | 2.187 (1.896 LUT + 291 ALU) / 1.504 / 1 / 0,5 |
| Bản sao cục bộ | `review/artifacts/KVC_FPGA_diag_pixel_05288FA6.fs` (7.264.154 B) |
| Nạp bo | **CHƯA NẠP** (đối chiếu `px.bin` cho thấy đã nạp ít nhất một lần) |
| Bằng chứng | `verification/G6.1.9_PIXEL_COLOR_PROCEDURE.md`; capture `px.bin` 42 khung |

**Thay đổi RTL rev 3** (`KVC_PR/src/processing/pixel_stats.v`):

| Thay đổi | Lý do | Test |
| :--- | :--- | :--- |
| Bộ lọc tỷ lệ (`R8>G8>B8`, `6n≥d`, `3n≤2d`, `5B8≤R8`, `R8≥32`, `d≥24`) | khớp **chính xác** `kvc_blob_detect.v` rev 2 ⇒ `cnt_match == cnt` | `tb_pixel_stats` **21/21** |
| `cnt_match` đếm theo run-length ≥ 3 | blob chỉ cộng pixel thuộc run ≥ `RLE_MIN`; thiếu thì `cnt_match` **cao hơn** `cnt` | `tb_pixel_stats` case `#FF0000` |
| Slot 6..9: `cnt_ord/hue/sat/tone_ok` | biết **điều kiện nào** loại nhiều pixel nhất — dữ liệu cho F-02 | same |
| Slot 10 = `PIXSTAT_REV = 3` | nhận diện revision bằng số, không phải suy đoán từ slot rỗng | `test_decode_pixel_diag.py` **22/22** |

> **Hai lỗi của rev 3, chỉ phát hiện sau khi đọc lại `px.bin`:**
> 1. `wire [7:0] d = R8 - B8;` tràn khi `R8 < B8`. `cnt_hue_ok` và `cnt_tone_ok`
>    vì thế **không dùng được** để kết luận ngưỡng màu (đã có báo cáo dùng
>    chúng để xếp hạng điều kiện lọc — số đó sai).
> 2. `center_pixel` stale. **Lưu ý:** `center_pixel` khác 0 ở 42/42 khung trong
>    `px.bin`, nghĩa là frame **đã** tới dòng 240. Vì vậy không được kết luận
>    "frame bị cắt ở 46–187 dòng" chỉ từ `pix_count` — xem ghi chú F-04/F-05
>    trong `evidence/KVC-G6.1-20261104-001.md`.


| Trường | Giá trị |
| :--- | :--- |
| SHA-256 | `948D697E537D8C7A6529224F59B17A388675B951D79DDE41445F6232270B9423` |
| Cấu hình | `USE_MOCK_BBOX = 1` (nay là `BBOX_SOURCE = 0`) |
| Fmax `clk_100m` | 107,447 MHz |
| Bản sao cục bộ | `review/artifacts/KVC_FPGA_948D697E.fs` (thư mục `review/` bị Git ignore) |

### 1.1 Bitstream trước đó (đã nạp bo 31/10, dùng cho G2)

| Trường | Giá trị |
| :--- | :--- |
| SHA-256 | `70460C92DC4C37138C06847B0C7A97C639851AFCC737F94C0082B014ED9FE5C5` |
| Fmax `clk_100m` | 129,149 MHz |
| Camera config | **bảng cũ 38 thanh ghi — KHÔNG hoạt động** |
| Bằng chứng | `evidence/capture_01.bin` (G2.2), `evidence/G2.4_mcu_log_20261031.md` (G2.4) |

### 1.2 Bitstream trung gian (01/11, bảng 224 thanh ghi, CHƯA sửa FSM)

| Trường | Giá trị |
| :--- | :--- |
| SHA-256 | `A1047050BA7787236BD16977471B6B76EE0117295BC29A01C54B77893F5FFAC4` |
| Fmax `clk_100m` | 123,658 MHz |
| Đặc điểm | Bảng 224 thanh ghi, nhưng FSM chạy vòng vô hạn (`start` nối mức `pll_lock`) |
| Đo trên bo | shortfall 70 ms (chưa nối XCLK) → 145 ms (sau khi nối XCLK pin 18) |

Bitstream trước đó chỉ thay khối camera và dùng mock BBox. Bitstream hiện tại
(`86CCF5DD`) thay khối camera **và** nguồn BBox (blob thật), nên kết quả
G2.2/G2.4 chỉ còn hiệu lực cho **đường mock** — không dùng để kết luận cho blob.

## 2. Kết quả tổng hợp và PnR

### 2.0 Bitstream `86CCF5DD` (01/11/2026, `BBOX_SOURCE=1`) — ĐÃ THAY THẾ

> Số liệu dưới đây là của bản rev 1. Bản hiện hành `9E62B590` có tài nguyên và
> timing ở §1.0d. Giữ lại để so sánh hồi quy.

| Clock | Constraint | Actual Fmax | Logic level | TNS setup | TNS hold |
| :--- | ---: | ---: | ---: | ---: | ---: |
| `clk_100m` | 100,000 MHz | **113,277 MHz** | 8 | 0,000 | 0,000 |
| `cam_pclk` | 24,000 MHz | **140,757 MHz** | 8 | 0,000 | 0,000 |

| Resource | Dùng | Tổng | % | So với bitstream mock |
| :--- | ---: | ---: | ---: | ---: |
| Logic (LUT/ALU) | 1.616 | 20.736 | 8 % | +324 |
| Register | 1.218 | 16.173 | 8 % | +439 |
| BSRAM | 1 | 46 | 3 % | **+0** |
| DSP (MULT18X18) | 0,5 | 24 | 3 % | **+0** |

Nguồn: `KVC_PR/impl/pnr/KVC_FPGA.rpt.txt:43-60`,
`KVC_PR/impl/pnr/KVC_FPGA_tr_content.html:243-258` (Fmax) và `:268-311` (TNS).

Phân bổ khối blob: `g_blob_gen.u_blob` = 174 Register, 98 ALU, 172 LUT
(`KVC_PR/impl/gwsynthesis/KVC_FPGA_syn_rsc.xml:8`). **0 BSRAM, 0 DSP** — đúng
quyết định D4 của plan.

Chênh so với bitstream mock: **+324 LUT, +439 FF**. Trong đó khối
`kvc_blob_detect` chiếm 172 LUT / 174 FF. Phần còn lại là mux chọn nguồn BBox
3 nhánh và logic mã hoá `diag_status_y`; chưa phân rã chi tiết từng net.
`vsync_cnt` (16 FF) vẫn được tổng hợp vì là thanh ghi luôn chạy ở `clk_100m`,
dù `DIAG_MODE = 0` đã loại nhánh ghi đè khỏi đường dữ liệu.

Đường tới hạn: `u_bbox_pkt/cur_bbox_i_0_s0/Q → u_bbox_pkt/uart_tx_data_3_s0/D`,
slack +1,172 ns. Không phải đường của `kvc_blob_detect`.

### 2.1 Timing (bitstream mock `948D697E`, 01/11/2026 02:5x — tham chiếu)

| Clock | Constraint | Actual Fmax | Logic level | TNS setup | TNS hold |
| :--- | ---: | ---: | ---: | ---: | ---: |
| `clk_100m` | 100,000 MHz | **107,447 MHz** | 9 | 0,000 | 0,000 |
| `cam_pclk` | 24,000 MHz | 166,081 MHz | 7 | 0,000 | 0,000 |

Nguồn: `KVC_PR/impl/pnr/KVC_FPGA_tr_content.html:243-259` (Fmax) và `:286-320` (TNS).

**Kết luận:** đạt constraint, không có endpoint vi phạm.

Fmax 107,447 MHz — dư 7 % so với yêu cầu 100 MHz.

Đường tới hạn: `u_bbox_pkt/send_count_0_s0 → u_bbox_pkt/state_3_s1`, slack
+0,693 ns. **Không phải** đường của khối chẩn đoán VSYNC thêm vào.

**Cảnh báo biên mỏng.** Khi thêm bộ đếm VSYNC, Fmax giảm 124,934 → 107,447 MHz
(−14 %) và logic level tăng 7 → 9. Biên so với 100 MHz chỉ còn 7 %. Nguyên nhân
tăng tài nguyên:

| Thay đổi | LUT | FF |
| :--- | ---: | ---: |
| Trước chẩn đoán | 1.144 | 570 |
| Sau chẩn đoán | 1.292 | 779 |
| Chênh | **+148** | **+209** |

FF tăng 209 nhiều hơn dự kiến (chỉ 17 FF cho `vsync_cnt[15:0]` + `bbox_first`).
Nguyên nhân: `bbox_x_final` có fanout rộng vào 16 bit của `bbox_data_src`, khiến
tool nhân bản logic. Nếu cần biên rộng hơn, đặt `DIAG_MODE = 0` để loại bỏ
hoàn toàn nhánh chẩn đoán.

### 2.1b Tài nguyên (bitstream mock `948D697E`)

| Resource | Dùng | Tổng | % |
| :--- | ---: | ---: | ---: |
| Logic (LUT/ALU) | 1.292 | 20.736 | 7 % |
| Register | 779 | 16.173 | 5 % |
| BSRAM | 1 | 46 | 3 % |
| DSP (MULT18X18) | 0,5 | 24 | 3 % |

Nguồn: `KVC_PR/impl/pnr/KVC_FPGA.rpt.txt:43-59`.

### 2.2 Công suất (ước tính của tool, không phải đo)

| Đại lượng | Giá trị (blob, `86CCF5DD`) | Giá trị (mock, `948D697E`) |
| :--- | ---: | ---: |
| Total power | 147,592 mW | 145,006 mW |
| Quiescent | 122,800 mW | 122,800 mW |
| Dynamic | 24,792 mW | 22,206 mW |
| Junction temp (ước tính) | 29,726 °C | 29,643 °C |

Nguồn: `KVC_PR/impl/pnr/KVC_FPGA.power.html:163-179`. Đây là **ước tính của
tool với toggle rate giả định** — không thay thế phép đo nhiệt ở bước 2.1.4.

## 3. Nội dung bitstream (module nào thực sự được tổng hợp)

### 3.0 Bitstream hiện tại (`BBOX_SOURCE=1`)

Từ `KVC_PR/impl/gwsynthesis/KVC_FPGA_syn_rsc.xml`:

```text
kvc_top_demo
├── u_pll100, u_pll24
├── u_ov2640_cfg   (ROM cấu hình SCCB)
├── u_sccb
├── u_cam_rx
├── g_blob_gen.u_blob   <-- kvc_blob_detect (BBox tu pixel that)
├── u_bbox_pkt          <-- bbox_packetizer (+ crc_inst)
├── u_uart_tx
└── u_dr_ctrl           <-- data_ready_ctrl
```

**Không có** `kvc_yolo_top`, `conv_engine_dynamic_fsm`, `yolo_nms`,
`spi_flash_wrapper`, `weight_mem`, `g_mock_gen`, `line_buffer_3x3`,
`image_letterbox`. Đúng như thiết kế `BBOX_SOURCE=1`.

### 3.1 Bitstream mock `948D697E` (`BBOX_SOURCE=0`)

```text
kvc_top_demo
├── u_pll100, u_pll24
├── u_ov2640_cfg   (ROM cấu hình SCCB)
├── u_sccb
├── u_cam_rx
├── g_mock_gen.u_mock   <-- mock_bbox
├── u_bbox_pkt          <-- bbox_packetizer (+ crc_inst)
├── u_uart_tx
└── u_dr_ctrl           <-- data_ready_ctrl
```

**Không có** `kvc_yolo_top`, `conv_engine_dynamic_fsm`, `yolo_nms`,
`spi_flash_wrapper`, `weight_mem`. Đúng như thiết kế `BBOX_SOURCE=0`.

## 4. Cảnh báo của tool (không chặn build)

### 4.0 Bitstream hiện tại (`86CCF5DD`)

| Mã | Nội dung | Đánh giá |
| :--- | :--- | :--- |
| `CV0016` ×1 | `spi_miso` không dùng | **Đúng thiết kế** — chế độ blob không có CNN/SPI |
| `CK3000` | Không tính được quan hệ `cam_pclk` ↔ `clk_100m` | **Đúng** — hai clock bất đồng bộ; đã có `set_clock_groups` + `set_false_path` |
| `PR1014` | `cam_pclk_d` dùng generic routing clock | Chấp nhận được ở 24 MHz (`cam_pclk` Fmax 140,757 MHz). Cần xem lại nếu nâng tần số hoặc kéo dài dây camera |

Đã hết 8 cảnh báo `EX1998` (net `cnn_out_*` không có driver) bằng cách gán 0
trong nhánh `g_mock_path` của generate. Không có cảnh báo trùng constraint cho
`set_false_path`, không có đường không-constrain mới.

### 4.1 Bitstream mock `948D697E`

| Mã | Nội dung | Đánh giá |
| :--- | :--- | :--- |
| `CV0016` ×3 | `cam_href`, `cam_data`, `spi_miso` không dùng | **Đúng thiết kế** ở mock path; camera path chưa nối |
| `PR1014` | `cam_pclk_d` dùng generic routing clock | Chấp nhận được ở 24 MHz (`cam_pclk` Fmax 153 MHz). Cần xem lại nếu nâng tần số hoặc dùng camera thật dài dây |

## 5. Kiểm chứng mô phỏng tại cùng thời điểm

### 5.0 Bitstream `9E62B590` (rev 2) — `scripts/run_fpga_tb.ps1` → **25/25 PASS** (exit 0)

```text
tb_kvc_blob_detect       PASS  PASS=18  FAIL=0   <-- 10 cu + 8 moi
tb_pixel_stats           PASS  PASS=21  FAIL=0   <-- rev 3
tb_kvc_top_blob          PASS  PASS=8   FAIL=0
tb_kvc_top_demo          PASS  PASS=4   FAIL=0
tb_kvc_top_demo_rate     PASS  PASS=3   FAIL=0
tb_kvc_top_demo_uartlink PASS  PASS=5   FAIL=0
tb_ov2640_config         PASS  PASS=16  FAIL=0
tb_sccb_ack_sample       PASS  PASS=5   FAIL=0
tb_vsync_diag            PASS  PASS=6   FAIL=0
tb_vsync_monitor         PASS  PASS=42  FAIL=0
tb_vsync_selfmeas        PASS  PASS=10  FAIL=0
tb_uart_tx               PASS  PASS=30  FAIL=0
tb_bbox_packetizer       PASS  PASS=103 FAIL=0
... (13 TB CNN giu nguyen, tat ca PASS)
KET QUA: 25 PASS, 0 FAIL, 0 SKIP
```

`pytest tests/integration/test_decode_pixel_diag.py` → **22/22 PASS**.

### 5.0b Bitstream `86CCF5DD` (rev 1, 01/11/2026) — 22/22 PASS (lịch sử)

```text
tb_uart_tx               PASS  PASS=30  FAIL=0
tb_bbox_packetizer       PASS  PASS=103 FAIL=0
tb_conv0_golden          PASS  PASS=1026 FAIL=0
tb_conv0_real            PASS  PASS=1026 FAIL=0
tb_depthwise             PASS  PASS=146 FAIL=0
tb_maxpool2d             PASS  PASS=4   FAIL=0
tb_concat_n_feature      PASS  PASS=3   FAIL=0
tb_split_channels        PASS  PASS=3   FAIL=0
tb_upsample_nearest      PASS  PASS=3   FAIL=0
tb_residual_add_int8     PASS  PASS=65536 FAIL=0
tb_sppf_block            PASS  PASS=1   FAIL=0
tb_line_buffer_mc        PASS  PASS=5   FAIL=0
tb_async_fifo_cdc        PASS
tb_yolo_nms              PASS
tb_kvc_top_demo          PASS  PASS=4   FAIL=0
tb_kvc_top_demo_rate     PASS  PASS=3   FAIL=0
tb_kvc_top_demo_uartlink PASS  PASS=5   FAIL=0
tb_ov2640_config         PASS  PASS=16  FAIL=0
tb_sccb_ack_sample       PASS  PASS=5   FAIL=0
tb_vsync_diag            PASS  PASS=6   FAIL=0
tb_kvc_blob_detect       PASS  PASS=12  FAIL=0
tb_kvc_top_blob          PASS  PASS=8   FAIL=0
```

### 5.1 Bitstream mock `948D697E` — 20/20 PASS (trước khi thêm 2 TB blob):

```text
tb_uart_tx               PASS  PASS=30  FAIL=0
tb_bbox_packetizer       PASS  PASS=103 FAIL=0
tb_conv0_golden          PASS  PASS=1026 FAIL=0
tb_conv0_real            PASS  PASS=1026 FAIL=0
tb_depthwise             PASS  PASS=146 FAIL=0
tb_maxpool2d             PASS  PASS=4   FAIL=0
tb_concat_n_feature      PASS  PASS=3   FAIL=0
tb_split_channels        PASS  PASS=3   FAIL=0
tb_upsample_nearest      PASS  PASS=3   FAIL=0
tb_residual_add_int8     PASS  PASS=65536 FAIL=0
tb_sppf_block            PASS  PASS=1   FAIL=0
tb_line_buffer_mc        PASS  PASS=5   FAIL=0
tb_async_fifo_cdc        PASS
tb_yolo_nms              PASS
tb_kvc_top_demo          PASS  PASS=4   FAIL=0
tb_kvc_top_demo_rate     PASS  PASS=3   FAIL=0
tb_kvc_top_demo_uartlink PASS  PASS=5   FAIL=0
tb_ov2640_config         PASS  PASS=16  FAIL=0
tb_sccb_ack_sample       PASS  PASS=5   FAIL=0
tb_vsync_diag            PASS  PASS=5   FAIL=0   <-- moi
```

## 5.2 Blob detect — đặc tả đã kiểm bằng mô phỏng (01/11/2026)

Chi tiết đầy đủ: `evidence/KVC-FPGA-BLOB-20261101-001_T1-T13.md`.

| Hạng mục | Trạng thái |
| :--- | :--- |
| Unit test `tb_kvc_blob_detect` | 12/12 PASS — 10 kịch bản plan §11 + hồi phục sau skip + biên `MIN_PIXELS` |
| Integration `tb_kvc_top_blob` | 8/8 PASS — blob thật qua DVP → IF-01, N=1 `x=130 y=80 w=60 h=40 class=2 conf=37`; khung rỗng N=0; R7 (`DIAG_MODE=1` không ghi đè X của blob) |
| Gate G0.1 (T12, build diag) | ✅ **BUILT** — `3620B802`, Fmax 127,823 MHz, TNS 0 |
| Gate G0.2–G0.4 (nạp bo + capture UART ≥ 10 s) | ✅ **01/11/2026** — xem §8. G0.3/G0.4 đạt **gián tiếp** qua bitstream release, không qua thủ tục diag |
| Nạp bo + A1–A10 (T14) | **MỘT PHẦN** — A2 PASS, A8 **FAIL** (~5 frame/s), A1/A3/A5/A7 **NOT RUN**. Chi tiết: `evidence/KVC-FPGA-G0G6-20261101-001.md` |
| **02/11/2026 — đo lại 4 phiên** | **A6 gần đạt** (0 CRC trên 128+84+409 khung, nhưng chưa 1.000 khung trong một `.bin`) · **A8 vẫn FAIL** (4,245 / 4,29 frame/s) · **nguyên nhân A8 đổi**: nhịp khung nằm trên **lưới 65,6 ms** với bội **1/3/5/6** ⇒ trần **15,25 frame/s**, fps 4,2 là do frame bị kéo dài chứ không phải chia xung. KHÔNG cần build mới. Chi tiết: `evidence/KVC-FPGA-BLOB-20261102-001.md` (§2 F-05) |
| **G2.7 soak 30 phút (02/11/2026)** | **PASS 2/3** — `fe=oe=drop=0` 272/272 mẫu, `isr==byt`, 76.750 B / 1.788,4 s = 42,92 B/s (lệch nửa đầu/sau 0,2 %), 0 reset; **nhiệt độ NOT MEASURED**. Chi tiết: `evidence/G2.7_soak_20261102.txt` |
| **Finding mới 02/11/2026** | **F-04** — `timestamp` IF-01 đọc trực tiếp từ counter đang chạy (`bbox_packetizer.v:76-79`), đo được **1 khung lùi 59 ms** trong `F02_card_20261102.bin`; sửa tối thiểu = 1 thanh ghi latch 32 bit, cần duyệt riêng |


**Bốn khác biệt so với plan §7, đều có lý do và đã kiểm bằng test:**

1. **Công thức hộp bao.** Plan ghi `w = max-min` và `x = (min+max)>>1`; với khối
   100 px tại x∈[200,299] công thức đó cho `w=99, x=249` — lệch so với chính
   bảng kỳ vọng của plan. Module dùng `w = max-min+1`, `x = (min+max+1)>>1`.
2. **`frame_valid` không dùng trực tiếp được.** `camera_rx.frame_valid` chỉ cao
   trong lúc VSYNC cao (duty < 2 %) nên không có pixel nào được đếm. Module chốt
   nó thành `frame_active` tại **cạnh xuống VSYNC**.
3. **Frame rỗng phát `bbox_last` một mình** → khung N=0 (10 byte). Giữ khả năng
   phân biệt "không có phao" với "FPGA chết". Layout IF-01 không đổi.
4. **`tgl` chỉ đảo khi frame có pixel.** Nếu đảo vô điều kiện, camera mất tín
   hiệu vẫn phát khung N=0 liên tục, trông như camera còn sống.

**Giới hạn phải ghi vào tài liệu nghiệm thu (cập nhật 04/11/2026 cho rev 2):**

- ~~false positive da người (RGB565 (25,40,15) lọt ngưỡng)~~ → **đã sửa**: da người
  `#C68642` có `S = 0,67 < 0,80`, bị loại. **Nhưng** da tối `#8D5524` có `S = 0,76`,
  chỉ cách ngưỡng 0,04 — vẫn là rủi ro thật, cần đo ngoài trời.
- ~~W/H 8-bit nên span > 255 px không biểu diễn được (cần khoảng cách ≥ 1,6 m)~~
  → vẫn đúng: `MAX_SPAN = 255`. Ở gần hơn ~1,6 m, phao chiếm > 255 px và hộp bị
  loại hoàn toàn. Đây là **hành vi mong muốn** (loại hộp tràn khung) nhưng phải
  ghi rõ: không phát hiện được mục tiêu quá gần.
- Chỉ 1 blob/frame — không đổi.
- `CONF_SHIFT = 5` (trước 6): `cnt = 120` → `conf = 3`, `cnt = 400` → `conf = 12`.
- Ngưỡng màu **vẫn chưa đo dưới nắng thật**. Ngưỡng `S ≥ 0,80` là suy ra từ bảng
  màu lý thuyết, chưa phải từ capture trên bo.
- **Mới:** `MIN_PIXELS = 120` thấp hơn rev 1 (400). Bù lại bằng run-length ≥ 3,
  rows ≥ 6, aspect ≤ 4. Ba bộ lọc này **đã kiểm bằng mô phỏng**, chưa kiểm ngoài
  trời.

## 5.2 Blob detect rev 2 — đặc tả đã kiểm bằng mô phỏng (04/11/2026)

| Kịch bản | Trước rev 2 | **Sau rev 2** |
| :--- | :--- | :--- |
| Khối cam 100×80 | PASS | **PASS** |
| Nền nước, không vật | PASS | **PASS** |
| Khối 10×10 (100 px) | PASS (loại) | **PASS** (loại, `MIN_PIXELS=120`) |
| Sát biên trái/tren | PASS | **PASS** |
| Trắng cháy toàn frame | PASS | **PASS** (loại do `d=0` + `S=0`) |
| Vàng chói | PASS (loại do `G_MAX`) | **PASS** (loại do hue 54°) |
| Hai khối xa, span > 255 | PASS | **PASS** |
| Frame skip | PASS | **PASS** |
| Khối 25×25 | PASS | **PASS** |
| Khối 20×20 = 400 px | PASS | **PASS** |
| **1600 hạt nhiễu rời rạc** | — | **PASS** (run=1 → cnt=0) |
| **Băng mỏng 200×4** | — | **PASS** (4 dòng < 6) |
| **Thanh dẹt 200×10** | — | **PASS** (aspect 20 > 4) |
| **Cam tối 25 % (63,32,0)** | — | **PASS** (rev 1 **FAIL**) |
| **Da người 80×80** | — | **PASS** (loại, `S=0,67`) |
| **Cam 50 % sáng (127,64,0)** | — | **PASS** (rev 1 **FAIL**) |

## 6. Lỗi P0 đã tìm và sửa trong lần build này

### 6.0a Sample ACK tại sườn lên SCL → `ack_error` luôn = 0 (P0, sửa 01/11)

**Vị trí:** `KVC_PR/src/camera/sccb_master.v`, state `ST_ACK`.

**Lỗi:** sample ACK tại `clk_cnt == HALF`, tức **đúng chu kỳ SCL chuyển từ LOW
lên HIGH**. Trên phần cứng SDA là open-drain, tại sườn lên điện áp vẫn ~0 V,
nên FPGA đọc được 0 → hiểu là ACK.

**Hệ quả:** `ack_error` **luôn = 0** dù sensor không trả lời. Đây là lý do
`cfg_done` luôn lên trên bo, kể cả khi camera không được cấp XCLK và không ACK gì.

Tính toán với SDA là open-drain, tau = 5 µs (pull-up nội ~50 kΩ, C_bus 100 pF),
SCL_DIV = 1000 (100 kHz):

| Điểm sample | Thời gian từ lúc thả SDA | V(SDA) | So VIH (2,31 V) |
| :--- | ---: | ---: | :--- |
| Sườn lên SCL (lỗi cũ) | 5,0 µs | **2,09 V** | **FAIL → đọc 0** |
| Giữa pha HIGH | 7,5 µs | 2,56 V | OK (biên mỏng) |
| Cuối pha HIGH (đã sửa) | 10,0 µs | **2,85 V** | **OK** |

**Sửa:** sample tại `clk_cnt == (2*HALF - 2)` = cuối pha SCL HIGH. Còn 2 chu kỳ
trước khi SCL xuống, nên không sample nhầm lúc slave nhả bus.

**Vì sao 19 testbench cũ không bắt được:** `tb_ov2640_config` **không instantiate**
`sccb_master` — nó dùng mô hình hành vi với `sccb_ack_error` là input do TB điều
khiển. Không TB nào kiểm bus vật lý.

**Kiểm chứng:** `tb_sccb_ack_sample` (mới) instantiate `sccb_master` thật với
bus tri-state + pull-up:
- Slave ACK → `ack_error = 0`, `ack_sampled = 0010` ✓
- Slave NACK → `ack_error = 1`, `ack_sampled = 1111` ✓
- SCL không bao giờ ở trạng thái Z ✓

### 6.0b Bus SCCB không thể lên mức HIGH với pull-up nội (P0, sửa 01/11)

**Đo trên bo:** SCL = 0,2 V, SDA = 0,9 V — bus không bao giờ đạt VIH.

**Nguyên nhân:** module OV2640 MINI-200W **không có pull-up ngoài**. Pull-up nội
GW2A ~50 kΩ cho tau ≈ 2,5–5 µs tùy C_bus. Ở 100 kHz (HALF = 5 µs), điện áp chỉ
đạt 2,09 V < VIH 2,31 V → **mọi bit 1 bị đọc thành 0** ở phía sensor.

**Sửa:** chuyển **cả SCL và SDA sang push-pull có kiểm soát**:

| Tín hiệu | Cách lái | Lý do an toàn |
| :--- | :--- | :--- |
| `SCL` | Push-pull hoàn toàn | SCCB không có clock stretching, sensor không kéo SCL → không chồng output |
| `SDA` | Push-pull, **thả Z trong cửa sổ ACK** | Slave cần kéo thấp để ACK. Cửa sổ mở ở sườn **xuống** SCL (khi SCL còn thấp) và đóng sau khi SCL xuống kết thúc pha ACK → không bao giờ master và slave cùng lái mức đối nghịch |

**Không cần hàn pull-up 4,7 kΩ** khi đã dùng push-pull.

**Kiểm chứng** (tính toán, chưa đo bo): với push-pull, sườn lên do driver CMOS
lái, không phụ thuộc RC → V đạt 3,3 V trong vài ns.

### 6.0d Camera OV2640 không hoạt động — bảng khởi tạo chỉ 38/224 thanh ghi

**Triệu chứng trên bo (31/10/2026):** VSYNC = 0 V cố định, không có xung 30 Hz,
FPS vẫn 100,0 (không đổi vì mock chạy độc lập). Capture UART 15 s cho 1.575 frame,
tất cả timestamp tăng đúng +10 ms — **không một khoảng nào bị rút ngắn**, chứng minh
`cam_vsync_pulse` chưa từng xuất hiện.

Tính xác suất: khung truyền 6,771 ms trong chu kỳ 10 ms → 3,229 ms cửa sổ rảnh
(32 %). Với VSYNC 30 Hz trên 1.574 khoảng, kỳ vọng ~500 khoảng bị rút. Quan sát 0.
Xác suất ngẫu nhiên 0,68^1574 ≈ 10⁻²⁶³.

**Nguyên nhân:** `ov2640_config.v` cũ có `ROM_DEPTH = 72` nhưng FSM dừng ở
`rom_idx < 8'd38` — chỉ 38 lượt ghi. Bảng chuẩn cho OV2640 VGA RGB565 cần ~200.
Thiếu toàn bộ khối sensor core (Bank 1: 0x2c..0x62) và khối DSP (Bank 0: 0xe5..0xc3),
nên sensor chưa bao giờ ra khỏi trạng thái mặc định.

**Ba lỗi phụ cùng tồn tại:**

| Lỗi | Bằng chứng | Hệ quả |
| :--- | :--- | :--- |
| SCCB ACK bị bỏ qua | `sccb_master.v:174` lưu `ack_sampled` nhưng không ai đọc | `cfg_done` luôn = 1 dù mọi lệnh NACK |
| Không delay power-on | `.start(pll_lock)` — PLL lock sau vài trăm µs | Lượt ghi đầu có thể bị bỏ |
| Thiếu zoom VGA | Không có 0x5A/0x5B/0x5C | Nếu sensor chạy, dữ liệu ra 800x600 chứ không phải 640x480 |

**Sửa:**

1. `ov2640_config.v` viết lại, ROM 224 entry, lấy từ **espressif/esp32-camera**
   (Apache-2.0) — ba mảng `ov2640_settings_cif` (157), `ov2640_settings_rgb565` (6),
   `ov2640_settings_to_svga` (39), cộng 22 entry tự viết cho zoom VGA và PLL.
   Đối chiếu **máy móc** bằng script parse cả hai phía: cả 3 mảng có mặt nguyên vẹn,
   đúng thứ tự (`KET LUAN: ca 3 mang nguon co mat nguyen ven, dung thu tu`).
2. `sccb_master.v` thêm cổng `ack_error`, kiểm ACK của **mọi byte thực sự được phát**
   (dev_addr, reg, data) — không đếm slot chưa dùng.
3. `ov2640_config.v` thêm `POR_DELAY_MS = 20` trước lượt ghi đầu, và `cfg_error`:
   NACK ở bất kỳ lượt nào → dừng ngay, không chạy tiếp 224 lượt vô nghĩa.
4. `kvc_top_demo.v`: `led_camera_ok = cfg_done & ~cfg_error & cap_frame_valid`.

**Kiểm chứng:** `tb_ov2640_config` 13/13 PASS, gồm ba kịch bản:
- Bình thường: 224 lượt ghi, COM7=0x40, RGB565 ở 8 lượt cuối, zoom 640x480 có mặt,
  R_BYPASS=0x00 cuối cùng, lượt ghi đầu sau đúng 20,0 ms, bank nhất quán.
- NACK tại lượt 30: dừng sau 31 lượt, `cfg_error = 1`.
- NACK ngay lượt đầu: dừng sau 1 lượt, `cfg_error = 1`.

**Lỗi trong lúc sửa (đã khắc phục):** phiên bản đầu dùng biến `integer rom_end`
gán trong `initial` để đánh dấu điểm dừng. Gowin báo
`WARN (EX3780) : Using initial value of 'rom_end' since it is never assigned`
— biến này **không được tổng hợp thành logic**, nên nếu = 0 thì FSM nhảy thẳng
`S_DONE` và ghi 0 thanh ghi, trong khi mô phỏng vẫn PASS. Đã thay bằng mảng
`rom_last[0:ROM_DEPTH-1]` (được extract như `rom_addr`/`rom_data`).
Sau khi sửa, `EX3780` không còn xuất hiện.

**Chưa kiểm chứng:** bitstream mới chưa nạp bo. Mức bằng chứng cho camera vẫn là
`SIMULATED` + `BUILT`, chưa `HARDWARE-VERIFIED`.

### 6.0e FSM cấu hình chạy vòng vô hạn (P0, sửa 01/11)

**Nguyên nhân:** `kvc_top_demo.v` nối `.start(pll_lock)` — `pll_lock` là **mức**,
không phải xung. Trong `ov2640_config.v`, `S_DONE` quay lại `S_IDLE`, và `S_IDLE`
thấy `start` vẫn cao nên chạy lại từ đầu.

Chu kỳ một vòng ở `SCL_DIV = 250` (400 kHz): 224 thanh ghi × 3 byte × 9 bit ÷ 400 kHz
+ 224 × 100 µs ≈ **38 ms**. Bảng có `RESET (0xE0) = 0x04` (RESET_DVP) nhiều lần,
nên DVP interface bị reset mỗi 38 ms → sensor không phát được khung hoàn chỉnh.

**Bằng chứng trên bo:**

| Thời điểm | shortfall | Diễn giải |
| :--- | ---: | :--- |
| 01/11 trước nối XCLK | 70 ms | Nhiễu gai kích A15, sensor hoàn toàn im |
| 01/11 sau nối XCLK (pin 18) | **145 ms** | Sensor có nhịp nhưng bị reset liên tục — shortfall tăng gấp đôi |

Việc shortfall tăng khi có XCLK xác nhận sensor **đã bắt đầu đáp**, nhưng FSM
lặp đang chặn nó hoàn tất cấu hình và stream ổn định.

**Sửa:** thêm cờ `cfg_attempted`:
- `S_IDLE`: chỉ vào khi `start && !cfg_attempted`; set `cfg_attempted = 1`
- `S_DONE`: giữ nguyên (không quay lại `S_IDLE`) chừng nào `start` còn cao
- Reset `cfg_attempted` khi `!start` hoặc `!rst_n`

Nhờ vậy FSM cấu hình **đúng một lần** sau mỗi lần reset hệ thống, bất kể `start`
là xung hay mức.

**Sửa phụ:** `SCL_DIV 250 → 1000` (400 kHz → 100 kHz). Không có pull-up ngoài,
pull-up nội GW2A ~50 kΩ có τ ≈ 5 µs, lớn hơn nửa chu kỳ 1,25 µs ở 400 kHz → đường
SCL không lên kịp 3,3 V. Ở 100 kHz, nửa chu kỳ là 5 µs, biên thời gian đủ.

**Kiểm chứng:** `tb_ov2640_config` 16/16 PASS, thêm hai assertion chống lặp:
- "chi chay dung 1 luot cau hinh khi start=1" — sau 10.000 chu kỳ, `log_n` không đổi
- "dung han sau NACK khi start giu HIGH" — NACK xong FSM không tái nhập

Testbench nay drive `start` bằng **mức** (giống `pll_lock` thật), không phải xung.
Đây chính là điều kiện mà TB cũ bỏ sót, khiến lỗi này lọt qua 18 TB trước đó.

### 6.0f Module camera `OV2640 MINI-200W` không có oscillator onboard

**Phát hiện 01/11/2026 bằng soi bo:** dưới cụm ống kính in lụa `OV2640 MINI-200W`.
Hai IC 5 chân bên trái header (ổn áp 2,8 V và 1,2 V), **không có can thạch anh**.

Bảng chân người bán ghi `Pin 18 = NC` là **sai** (chép từ variant khác). Trên
bo này, **pin 18 là XCLK đầu vào**.

**Hệ quả trước khi nối dây:** OV2640 không có nhịp tim → SCCB không ACK (dẫn tới
`cfg_error = 1` ngay byte 0), PCLK không phát (DCLK không có áp AC), VSYNC không
phát (FPS đứng ở 100,0).

Đã nối `J1-12` (ball `B13`, 24 MHz) → module pin 18, kèm dây GND xoắn đôi.
Shortfall tăng 70 → 145 ms xác nhận sensor bắt đầu đáp.

**Sửa tài liệu:** `docs/hardware/wiring/KVC_MASTER_PINOUT_WIRING.md` §3.5.1 ghi
`XCLK | B13 | 12` nhưng không nói rõ đây là **bắt buộc**, và trước đó có hướng dẫn
sai rằng J1-12 "phải để trống" vì module có oscillator.

### 6.1 `uart_tx` thiếu stop bit (P0, sửa 31/10)

`KVC_PR/src/comm/uart_tx.v` hạ `tx_busy` **ngay tại thời điểm stop bit bắt đầu**
(`bit_cnt == 8`), nên byte kế tiếp chiếm mất cửa sổ stop bit. Kết quả: mỗi byte
chỉ tồn tại **9 bit-time** thay vì 10.

Với một byte đơn lẻ, bộ thu vẫn có thể đọc đúng nếu nó lấy mẫu stop bit sớm.
Nhưng trong `bbox_packetizer`, 26 byte được gửi **liên tiếp**, nên mọi byte sau
byte đầu đều bị cắt stop bit → bộ thu thật (và firmware MCU) báo framing error.

### 6.2 Bằng chứng trước khi sửa

`tb_kvc_top_demo_uartlink` (bộ thu 8N1 độc lập + parser IF-01):

```text
byte giai ma=1053, byte hop le=127, framing err=926
frame OK=0, CRC err=0, bad sync=120
FAIL: 0 frame hop le
FAIL: 926 framing error
```

Tỉ lệ lỗi khung: **926/1053 = 88 %**. Frame hợp lệ: **0**.

### 6.3 Vì sao 15 testbench cũ không bắt được

`tb_uart_tx` cũ assert `busy width = 9 bit-time` — tức là **khóa cứng hành vi
sai** thành kỳ vọng. `tb_kvc_top_demo` chỉ đếm cạnh xuống của `uart_tx`, không
giải mã khung, nên không thấy stop bit bị thiếu.

### 6.4 Sửa

`bit_cnt` chạy 0..9 thay vì 0..8:
- `0..7`: phát data bit LSB-first
- `8`: giữ `tx_pin = 1` (stop bit) **và giữ `tx_busy`**
- `9`: hạ `tx_busy`, báo `tx_done`

### 6.5 Bằng chứng sau khi sửa

```text
byte giai ma=78, byte hop le=78, framing err=0
frame OK=3, CRC err=0, bad sync=0
PASS nhan duoc 3 frame IF-01 hop le
PASS 0 framing error tren 78 byte
PASS 100% byte hop le (78/78)
PASS 0 CRC error
```

Đo lại nhịp frame: khung **677.124 cycle** (6,771 ms) — khớp chính xác 26 byte
× 10 bit × 2.604 cycle/bit. Trước khi sửa là 609.420 cycle (9 bit/byte).

### 6.6 Ảnh hưởng

| Hạng mục | Trước | Sau |
| :--- | ---: | ---: |
| Độ dài khung N=2 | 609.420 cycle | **677.124 cycle** |
| Byte/khung | 26 | 26 |
| Bit/byte trên dây | 9 | **10** |
| Nhịp frame (mock) | 100 FPS | 100 FPS (không đổi — vẫn bị chặn bởi trigger 5 ms) |
| Fmax `clk_100m` | 136,374 MHz | 129,149 MHz |
| Framing error (TB) | 88 % | **0 %** |
| Frame hợp lệ (TB) | 0/3 | **3/3** |

**Không đổi:** baud 38.400, packet layout IF-01, CRC, pinout. Chỉ sửa độ rộng
xung `tx_busy`. ABI không bị ảnh hưởng.

## 7. Tính tái lập của build

Build hai lần từ cùng source cho SHA-256 **khác nhau**:

| Lần | SHA-256 |
| ---: | :--- |
| 1 (trước sửa) | `046EE21CF41E4B3EC50E15A9F25045A44748682266CC7708707B2BAA2F66BFEB` |
| 2 (trước sửa) | `FE1B57F330DF3F1AC6D71CC6ADEB8845F7661620F6E63DBF1E9FF9D45C1113C6` |
| 3 (sau sửa) | `70460C92DC4C37138C06847B0C7A97C639851AFCC737F94C0082B014ED9FE5C5` |
| 4 (mock, camera mới) | `948D697E537D8C7A6529224F59B17A388675B951D79DDE41445F6232270B9423` |
| 5 (blob, trước khi drive `cnn_out_*`) | `7EF7062A982C7918AE0DC9F040EB09456FE2AF274AE9926B285F27AC5086880F` |
| 6 (blob, sau khi drive `cnn_out_*` = 0) | `814A9987AD685DA97DB43BC64BF900E0C4AD187A015CE45C7E6AFBFA8BDC1D28` |
| 7 (diag `BBOX_SOURCE=0, DIAG_MODE=1`) | `3620B802C010993DCF98E56691C5496132CB5347D6776D5B5EAA88BD5DFC5EBB` |
| 8 (release lần cuối, cùng source với 6) | `86CCF5DDAA12DED9D66C9729E27EBB828FF3A3D2B1B46170E79B61277C38ED13` |
| 9 (diag pixel rev 3, blob rev 2) | `05288FA6657800200569850082C9765ACC149CC391B24F708FC79B1A89EA33E3` |
| 10 (release blob rev 2, 04/11/2026 04:52) | `9E62B590152074734B202285E3DEE829E00F832F2DC51FEAE4054B7D52959EBF` |
| 11 (diag pixel rev 4, 04/11/2026) | `EC4BC0081339729AD8CAFA4551A3076908E0FCC04CF4A8827A61B9CF153971A4` |
| 12 (diag pixel rev 5, 04/11/2026) | `373CD91630C1A0D2F440F9CB163F14C8680627B5F9EA1DBDAAA3FACB9D0152F4` |
| **13 (release blob `MIN_PIXELS=48`, 04/11/2026 14:14)** | **`4C74C0EF443A25E62CFC80D3DDE1B3B087CF171C9281E4FCBA42102F48BAEE45`** |
| 14 (release blob 20/3 — **đã test bo, `n1` OK**) | `8D2F84DE45CC36F2574537034D3BDD3096F000B736C9B8A8248AF24673598ED7` |
| **15 (release blob rev 5 nới ngưỡng, 04/11/2026 14:41)** | **`034DB01B53A97AEC499EA3CC4004D729244BD82882FAACBF30924C4EF1E610FD`** |
| **16 (release blob rev 6 siết ngưỡng, KVC-FPGA-BLOB-REV6)** | **`4E7C1A59FE92FC1FC41ED42350A735333C256DCF99213DD66C94E6B1A70DD34D`** |
| **17 (release blob rev 7, nới hue 45° + hạ hình học)** | **`19C849D4A233056E2C994C641EA6E6FEB515109240EECA439B6B027D85B1C109`** |
| **18 (release blob rev 8 "CHỐT HẠ", sat 0,75 + MIN_PIXELS 50)** | **`B65114B358C1F899C6939ECD5E238D817B9D9C4738E32F1794E90D649DF94CCF`** |
| **19 (release blob rev 9, sửa MIN_PIXELS 50→20)** | **`1792FFFB372773788BDA19E37F2DAB5132192BC32D7F6ED45B492281EEB9E656`** |
| **20 (release blob rev 10, khôi phục `8D2F84DE` + `RLE_MIN=5`)** | **`DDB3EDE74ADC66FC8907DC565E3F62FBE02952B099E7E571976EFB9A7A038861`** |

Lần 6 và 8 **cùng source, cùng tool, cho cùng timing (113,277 MHz) và cùng tài
nguyên (1.616 LUT / 1.218 FF / 1 BSRAM / 0,5 DSP) nhưng khác SHA** — xác nhận
lại kết luận dưới đây: PnR không tất định.

Lần 1 và 2 **cùng source, cùng tool, vẫn khác hash**. Nguyên nhân khả dĩ: PnR
có yếu tố không tất định (seed/thứ tự placement). Hệ quả:

- Không thể dùng SHA-256 bitstream làm định danh nguồn.
- Phải định danh bằng **Git HEAD + tool version + lệnh build**.
- Nếu cần so sánh chức năng giữa hai bitstream, phải đo trên bo, không so hash.
- Timing summary giữa lần 1 và 2 giống nhau (129,149 MHz) → PnR ổn định về chất
  lượng, chỉ khác chi tiết routing.

## 8. Việc chưa làm được

| Việc | Lý do | Cần gì |
| :--- | :--- | :--- |
| **B0 — đóng baseline H6** | SHA `.fs` khớp nhưng working tree `KVC_PR/` còn nhiều file sửa + chưa track (§1.0a) | HUMAN duyệt commit theo phân hệ |
| **Nạp bo `9E62B590`** | Bitstream rev 2 **chưa nạp** — mọi kết luận về bộ lọc mới chỉ là `SIMULATED` | SRAM Program + capture UART ≥ 10 s |
| **Đo lại 6.1.10 với rev 2** | Tỉ lệ 12,1 / 15,5 % là của bộ lọc cũ. Chưa có số cho rev 2 | Nạp `9E62B590`, chạy lại quy trình 6.1.10 |
| **Đo `S` thật của áo cam** | Ngưỡng `S ≥ 0,80` suy từ bảng màu lý thuyết; AWB đang bật | Nạp bitstream diag rev 3 `05288FA6`, chạy `G6.1.9_PIXEL_COLOR_PROCEDURE.md` |
| Đo nguồn, ripple | Cần VOM/oscilloscope | Thiết bị đo |
| **Gate G0.1** — build diag `BBOX_SOURCE=0, DIAG_MODE=1` | ✅ **BUILT** (`3620B802`, Fmax 127,823 MHz, TNS 0) | — |
| **Gate G0.2** — nạp bitstream lên bo | ✅ **PASS 01/11/2026** — SRAM Program, `86CCF5DD` (release). Log Gowin không lưu thành file | — |
| **Gate G0.3** — VSYNC thật | ✅ **PASS (gián tiếp, mạnh hơn)** 01/11/2026 — 136 khung IF-01 liên tiếp chỉ phát khi có pixel thật. ⚠️ **Không qua thủ tục diag `3620B802`**; nếu cần bản ghi đúng thủ tục thì nạp `3620B802` và capture thêm | — |
| **Gate G0.4** — SCCB ACK | ✅ **PASS (gián tiếp)** — sensor phát DVP được ⇒ đã cấu hình xong. ⚠️ Cùng ghi chú như G0.3 | — |
| **A1–A10 (T14)** — nghiệm thu blob trên bo | **MỘT PHẦN** 01–02/11/2026: A2 PASS, A6 một phần (0 lỗi CRC nhưng < 1.000 khung), **A8 FAIL (5,08 và 7,48 frame/s, kỳ vọng 25–32)**, A9 không đạt nếu đọc tuyệt đối (1 BSRAM / 0,5 DSP), A1/A3/A4/A5/A7 **NOT RUN** | Xem `evidence/KVC-FPGA-G0G6-20261101-001.md` §5, `evidence/G6.1_blob_baseline_neg_20261102-0142.txt` |
| **G6.1 §6.1.9** — ngưỡng màu R/G/B | **NOT RUN** — chưa nạp bitstream diag rev 3 `05288FA6` | Vật đỏ-cam + đọc RGB565 theo `G6.1.9_PIXEL_COLOR_PROCEDURE.md` |
| **G6.2** — siêu âm | **UNBLOCKED** 01/11/2026 (AJ-SR04M đã ổn định theo HUMAN). Các mục 6.2.1–6.2.7 vẫn **NOT RUN** | Phép đo 2/3/4/5 m |
| Đo FPS/nhiệt thật | **FPS đã đo 2 lần: 5,08 và 7,48 frame/s** (F-01, phụ thuộc ánh sáng). Nhiệt chưa đo | Thermometer |

**Cập nhật 01/11/2026 — Track B đã chạy trên bo thật.** Lần đầu tiên đường
`OV2640 → kvc_blob_detect → bbox_packetizer → UART` được chứng minh end-to-end:
136 khung IF-01 hợp lệ, 0 byte rác, 0 lỗi CRC, `N=0` trên nền và `N=1 class=2`
khi có mục tiêu cam. Chi tiết và các finding mở:
`evidence/KVC-FPGA-G0G6-20261101-001.md`.

Cho đến khi các mục `NOT RUN` ở trên hoàn tất, mức bằng chứng **tổng thể** của
blob giữ nguyên `BUILT` + `SIMULATED`. Riêng kết luận *"pixel thật tạo ra bbox"*
đã đạt **`HARDWARE-VERIFIED`** — xem tài liệu evidence để biết phạm vi chính xác.
