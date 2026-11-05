# KVC — BỘ CÂU HỎI PHẢN BIỆN & KỊCH BẢN TRẢ LỜI BAN GIÁM KHẢO
## TÀI LIỆU CHIẾN THUẬT PHÒNG THỦ & TẠO ĐIỂM NHẤN CÔNG NGHỆ (2026)

> **Cuộc thi:** Thiết kế Vi mạch FPGA và Hệ thống Nhúng MCU mở rộng khu vực Miền Trung 2026
> **Đơn vị:** Nhóm nghiên cứu KVC — Đại học Bách Khoa, Đại học Đà Nẵng
> **Thành viên cốt lõi:** Lê Viết Vững (FPGA) • Nguyễn Tá Duy Phong (MCU) • Thịnh (Gateway) • Kiên (Camera) • Cường (Data/AI)
> **Mục tiêu:** Giúp từng thành viên nắm chắc câu hỏi "xoáy" của Ban Giám Khảo (BGK), trả lời tự tin, chuẩn xác từng số liệu, minh bạch khoa học và biến điểm yếu thành lợi thế công nghệ.

---

## PHẦN 1: NGUYÊN TẮC VÀNG TRONG PHÒNG THI & TÂM LÝ BAN GIÁM KHẢO

### 1.1 Tâm Lý Ban Giám Khảo Các Cuộc Thi Vi Mạch & Nhúng
* **Họ ghét điều gì nhất?** BGK chuyên môn cực kỳ dị ứng với các đề tài "nổ", dùng từ đao to búa lớn (ví dụ: "chạy Deep Learning siêu khủng thời gian thực trên chip FPGA giá rẻ") nhưng thực chất là gọi API đám mây hoặc chạy ngầm trên laptop.
* **Họ đánh giá cao điều gì nhất?**
  1. **Hiểu bản chất vật lý & kiến trúc:** Thí sinh giải thích được luồng xung nhịp (clock), đường truyền bus, cách chống tràn bộ đệm và tính toán dung lượng bộ nhớ.
  2. **Minh bạch bằng chứng:** Phân biệt rành mạch giữa cái **đã đo thật trên bo (`HARDWARE-VERIFIED`)** và cái **đang mô phỏng (`SIMULATED`)** hoặc **mục tiêu thiết kế (`DESIGN`)**.
  3. **Khả năng tự viết (Bare-metal):** Không phụ thuộc mù quáng vào thư viện có sẵn của hãng; tự viết RTL, tự viết driver ngắt UART, tự giải thuật toán hình học.

### 1.2 Nguyên Tắc "3 KHÔNG" & "3 CÓ" Khi Trả Lời
* **3 KHÔNG:**
  * ❌ *KHÔNG nhận vơ:* Chưa đo thì nói là chưa đo, đang mô phỏng thì nói là mô phỏng.
  * ❌ *KHÔNG bịa thông số:* Không tự bịa cự ly LoRa 5 km hay FPS 60 khi chưa có log đo thực địa.
  * ❌ *KHÔNG đổ lỗi thiết bị:* Khi mạch trục trặc, bình tĩnh giải thích theo cơ chế an toàn (Fail-Safe), không nói "do bo hỏng hay dây lỏng".
* **3 CÓ:**
  * ✅ *CÓ số liệu cụ thể:* Nhớ chính xác các mốc: Fmax 113 MHz, khung IF-01 18B, gói LoRa 32B, Ring buffer 4096B, Airtime SF7 71,9 ms.
  * ✅ *CÓ cơ chế an toàn dự phòng:* Luôn giải thích tại sao hệ thống có hành vi đó (ví dụ: không có GPS thì báo N/A để không chỉ điểm sai).
  * ✅ *CÓ lộ trình kỹ thuật rõ ràng:* Trình bày mạch lạc hướng phát triển giai đoạn tiếp theo.

---

## PHẦN 2: BỘ CÂU HỎI PHÂN HỆ FPGA & THIẾT KẾ VI MẠCH (VỮNG & PHONG)

### Câu 1: "Tên đề tài ghi AI trên FPGA, vậy mô hình YOLO11n trên Gowin GW2A đâu? Sao trong bitstream lại chạy Blob detect?"
* **Ý đồ của BGK:** Kiểm tra xem nhóm có "treo đầu dê bán thịt chó" không; kiểm tra khả năng ước lượng tài nguyên vi mạch.
* **Kịch bản trả lời chuẩn:**
  > *"Kính thưa Ban Giám Khảo, dòng chip Gowin GW2A-18C trang bị 828 Kbit Block RAM nội bộ (tương đương khoảng 103 KB). Một khung ảnh VGA RGB565 đã chiếm 614 KB bộ nhớ, và mô hình YOLO11n rút gọn dạng INT8 cần tối thiểu vài Megabyte trọng số. Vì bo Primer 20K V1.1 không tích hợp chip RAM DDR ngoài chuyên dụng, nhóm đã hoạch định lộ trình 2 giai đoạn rất rõ ràng:*
  > *1. **Ở giai đoạn 1 (Bitstream nạp bo hôm nay):** Nhóm tự thiết kế kiến trúc vi mạch Streaming Blob Detection (`kvc_blob_detect.v`) chạy trực tiếp trên từng pixel quét từ camera OV2640. Thuật toán này tiêu thụ đúng **0 BSRAM và 0 DSP**, chỉ chiếm 7% LUTs, đạt Fmax 113,277 MHz, giúp trích xuất tọa độ BBox của phao và áo cứu sinh màu cam ở tốc độ thực tế của camera để đưa vào MCU Sonix.*
  > *2. **Ở giai đoạn 2 (Mô hình CNN):** Nhóm đã hoàn thành thiết kế RTL cho 88 lớp trọng số và kiểm chứng toàn bộ 6 toán tử đồ thị (MaxPooling, Concat, Split, Upsample, Residual, SPPF) trong bộ testbench mô phỏng (`KVC_PR/verification/tb/`). Khối CNN này đang trong quá trình nối với bộ nạp SPI Flash ngoài. Để chứng minh năng lực nhận diện của mô hình học sâu, nhóm duy trì một mô hình YOLO11n tham chiếu chạy song song trên trạm mặt đất qua kênh quan sát phụ."*

---

### Câu 2: "Thuật toán Blob detect streaming trên FPGA hoạt động thế nào trên từng pixel? Làm sao để không cần dùng BSRAM và DSP?"
* **Ý đồ của BGK:** Kiểm tra kiến trúc vi mạch số (Digital Architecture) có thực sự do sinh viên viết hay không.
* **Kịch bản trả lời chuẩn:**
  > *"Dạ thưa thầy/cô, thay vì lưu toàn bộ khung ảnh vào RAM để xử lý như các thuật toán Connected Component Labeling (CCL) truyền thống, nhóm xử lý trực tiếp theo luồng quét điểm ảnh (Single-pass Streaming):*
  > *1. **Phân ngưỡng màu (Color Dominance):** Khi pixel 16-bit RGB565 đi vào từ `camera_rx`, mạch tổ hợp mở rộng thành các kênh 8-bit R8, G8, B8. Nhóm không dùng phép chia hay phép nhân số thực (tiêu tốn DSP) mà dùng hoàn toàn phép dịch bit và so sánh số nguyên: điều kiện màu cam là $R8 > G8 > B8$, độ bão hòa $S \ge 0.75$ được biến đổi thành $4 \cdot B8 \le R8$ (dịch trái 2 bit), và góc Hue được kiểm tra qua các phép cộng trừ đơn giản.*
  > *2. **Bộ mã hóa độ dài chuỗi (Run-Length Encoding):** Mạch đếm số pixel liên tiếp thỏa mãn điều kiện màu cam trên một dòng quét (`rle_cnt`). Khi chuỗi đủ dài ($\text{RLE} \ge 2$), mạch ghi nhận đoạn này thuộc về mục tiêu.*
  > *3. **Cập nhật Bounding Box On-the-fly:** Mạch dùng 4 thanh ghi thanh ghi cực biên `min_x, max_x, min_y, max_y`. Mỗi khi có pixel hợp lệ, các giá trị này được cập nhật tức thì bằng bộ so sánh logic. Khi xung VSYNC kết thúc khung xuất hiện, BBox được chốt và đưa vào bộ đóng gói UART.*
  > *Nhờ xử lý trực tiếp theo luồng đến đâu tính đến đó, thuật toán hoàn toàn không cần lưu trữ ma trận điểm ảnh, do đó tiêu thụ đúng 0 BSRAM và 0 DSP."*

---

### Câu 3: "Hai miền xung nhịp PCLK của Camera (12–24 MHz) và xung hệ thống clk_100m (100 MHz) lệch nhau, nhóm xử lý đồng bộ miền xung (CDC) thế nào?"
* **Ý đồ của BGK:** Kiểm tra kiến thức Clock Domain Crossing (CDC) — lỗi sơ đẳng nhất của người làm FPGA.
* **Kịch bản trả lời chuẩn:**
  > *"Dạ, camera OV2640 phát xung `cam_pclk` phụ thuộc vào bộ chia tần nội và dao động thạch anh camera (khoảng 12 đến 24 MHz), hoàn toàn bất đồng bộ với xung xử lý chính `clk_100m` (100 MHz) tạo từ PLL của chip Gowin.*
  > *Để tránh hiện tượng tranh chấp trạng thái giả bền (Metastability), nhóm sử dụng cấu trúc **Asynchronous FIFO** với mạch đồng bộ 2 tầng Flip-Flop (2-FF Synchronizer) cho các con trỏ ghi/đọc được chuyển đổi sang mã Gray (Gray Code). Dữ liệu pixel ghi vào FIFO theo nhịp `cam_pclk`, và khối xử lý đọc ra an toàn theo nhịp `clk_100m`. Nhờ đó, đường truyền hoàn toàn không có vi phạm thời gian, đạt chỉ số $\text{TNS} = 0.000$ trong báo cáo Timing Analyzer."*

---

### Câu 4: "Nhóm từng gặp lỗi gì nghiêm trọng nhất trong thiết kế RTL và đã khắc phục bằng cách nào?"
* **Ý đồ của BGK:** Xem dự án có làm thật, va chạm thật hay không.
* **Kịch bản trả lời chuẩn (Kể về lỗi UART Stop Bit ngày 31/10/2026):**
  > *"Dạ, lỗi nghiêm trọng nhất mà nhóm gặp phải trong quá trình đo kiểm thực tế là **lỗi thiếu Stop bit của khối `uart_tx.v`**. Trong mô phỏng testbench ban đầu, bộ thu UART lý tưởng chấp nhận khung tin mà không bắt lỗi. Nhưng khi nối sang chân UART thật của MCU Sonix và chip USB-UART trên PC, bộ thu báo lỗi Framing Error 100% (926/1.053 byte bị hỏng).*
  > *Khi soi lại mã nguồn RTL, nhóm phát hiện biến đếm `bit_cnt` chỉ đếm từ 0 đến 8 và hạ cờ `tx_busy` ngay tại thời điểm bắt đầu Stop bit thay vì giữ hết độ rộng bit, khiến mỗi byte truyền đi chỉ tồn tại 9 bit-time thay vì đủ 10 bit-time (1 Start + 8 Data + 1 Stop). Nhóm đã sửa bộ đếm đếm đủ 10 trạng thái (0 đến 9), viết thêm testbench `tb_kvc_top_demo_uartlink` kiểm tra nghiêm ngặt Stop bit, và kết quả đo lại trên phần cứng đạt 197.844 byte truyền liên tiếp với $\text{Framing Error} = 0$ tuyệt đối."*

---

### Câu 5: "Tần số khung hình đo được thực tế của đường Blob là bao nhiêu? Tại sao không phải 30 FPS hay 100 FPS?"
* **Ý đồ của BGK:** Bẫy thông số lý thuyết và thực tế.
* **Kịch bản trả lời chuẩn:**
  > *"Dạ, trên testbench mô phỏng hoặc đường mock nội bộ (`BBOX_SOURCE=0`), tốc độ phát khung có thể đạt 100 FPS do xung kích nội bộ 200 Hz. Nhưng trên đường chạy thực tế từ camera OV2640 (`BBOX_SOURCE=1`), nhịp phát khung phụ thuộc hoàn toàn vào xung VSYNC vật lý của camera.*
  > *Kết quả đo kiểm thực nghiệm bằng script `fpga_uart_capture.py` trên bo mạch ghi nhận tốc độ thực tế đạt **5,08 đến 7,48 FPS**. Nguyên nhân là module camera OV2640 trong điều kiện ánh sáng phòng lab tự động bật thuật toán điều khiển phơi sáng tự động (Auto Exposure Control - AEC), khi ánh sáng yếu, cảm biến kéo dài thời gian tích lũy điện tích cho mỗi dòng quét, làm giãn chu kỳ VSYNC từ 33 ms lên khoảng 133–197 ms. Nhóm đã ghi nhận đây là đặc tính vật lý của cảm biến quang học, hoàn toàn đáp ứng tốt tần suất cập nhật vị trí cứu nạn 1 Hz của hệ thống."*

---

## PHẦN 3: BỘ CÂU HỎI PHÂN HỆ MCU & ĐỊNH VỊ 3D (DÀNH RIÊNG CHO DUY PHONG)

### Câu 6: "Thuật toán chiếu tia 3D Ray-Plane Intersection giải phương trình gì? Công thức cụ thể như thế nào?"
* **Ý đồ của BGK:** Kiểm tra năng lực toán học và thuật toán định vị nhúng của Phong.
* **Kịch bản trả lời chuẩn:**
  > *"Kính thưa Ban Giám Khảo, thuật toán `kvc_georef.c` của nhóm giải bài toán tìm giao điểm giữa tia quang học đi qua tâm mục tiêu trên ảnh với mặt phẳng nằm ngang của mặt nước ($Z = 0$):*
  > *1. Từ tọa độ tâm BBox $(u, v)$ trên ảnh, nhóm trích xuất vector tia nhìn trong hệ quy chiếu camera $v_{cam} = [(u - c_x)/f_x, \ (v - c_y)/f_y, \ 1]^T$.*
  > *2. Sử dụng ma trận xoay Euler từ góc Roll và Pitch đọc từ cảm biến IMU GY-87, nhóm biến đổi vector tia nhìn sang hệ quy chiếu địa phương NED (North-East-Down): $v_{ned} = R_{IMU} \cdot v_{cam}$.*
  > *3. Giả định UAV đang ở độ cao $h$ so với mặt nước (đo bởi cảm biến siêu âm AJ-SR04M), vị trí camera là $t_{cam} = [0, 0, -h]^T$. Phương trình đường thẳng tia quang học là $p( \lambda ) = t_{cam} + \lambda \cdot v_{ned}$.*
  > *4. Để tia cắt mặt nước tại cao độ $Z = 0$, ta giải phương trình: $-h + \lambda \cdot v_{ned\_z} = 0 \implies \lambda = h / v_{ned\_z}$.*
  > *5. Tọa độ mét cục bộ là $x_{local} = \lambda \cdot v_{ned\_x}$ và $y_{local} = \lambda \cdot v_{ned\_y}$. Sau đó, kết hợp với góc định hướng Yaw từ GNSS, hệ thống cộng bù vào tọa độ GPS của UAV để ra tọa độ toàn cầu WGS-84 của nạn nhân."*

---

### Câu 7: "Tại sao khi chạy demo trực tiếp tại bàn thi, tọa độ mục tiêu trên bản đồ lại hiển thị N/A hoặc POS_VALID = 0?"
* **Ý đồ của BGK:** Xem thí sinh có bị bối rối khi thấy giao diện không hiện kinh độ vĩ độ hay không.
* **Kịch bản trả lời chuẩn:**
  > *"Dạ thưa Ban Giám Khảo, đây chính là **Cơ chế An toàn Bắt buộc (Fail-Safe)** do nhóm chủ động thiết kế trong mã nguồn `kvc_georef.c`. Để tính toán được tọa độ WGS-84 hợp lệ, hệ thống bắt buộc phải hội tụ đủ 3 điều kiện:*
  > *1. Cảm biến siêu âm đo được độ cao nước hợp lệ ($20 \le h \le 700 \ \text{cm}$).*
  > *2. Module GNSS NEO-M10N có tín hiệu vệ tinh hợp lệ (GNSS Fix).*
  > *3. UAV phải bay ngang với vận tốc $\ge 0,5 \ \text{knot}$ để trích xuất góc định hướng Yaw từ hướng chuyển động Course-over-ground.*
  > *Tại bàn thi trong phòng kín, module GPS không thể bắt sóng vệ tinh xuyên qua bê tông, và bộ kit đặt đứng yên nên vận tốc bằng 0 (không có Yaw). Lúc này thuật toán lập tức ngắt cờ `POS_VALID = 0` và gán tọa độ bằng 0. Cờ `AI_DETECTED` vẫn bật để báo có vật thể nhưng không sinh tọa độ rác. Trong cứu hộ bão lũ, việc thà báo 'chưa đủ dữ liệu định vị' tốt hơn gấp vạn lần việc chỉ điểm một tọa độ sai lệch khiến ca-nô cứu hộ đi lạc."*

---

### Câu 8: "Cơ chế Ring Buffer ngắt UART1 của MCU Sonix hoạt động ra sao? Làm thế nào chống mất byte khi MCU bận phát LoRa?"
* **Ý đồ của BGK:** Kiểm tra kỹ năng lập trình hệ thống nhúng bare-metal.
* **Kịch bản trả lời chuẩn:**
  > *"Dạ, quá trình phát một gói tin LoRa qua module Ra-02 bằng lệnh SPI có thể chiếm thời gian từ 70 đến 130 ms. Nếu MCU chờ phát xong mới đọc UART thì chắc chắn bộ đệm phần cứng 16 byte của UART1 sẽ bị tràn (Overrun Error).*
  > *Nhóm đã thiết kế cấu trúc **Ring Buffer SPSC (Single-Producer Single-Consumer)** kích thước 4.096 byte nằm trong bộ nhớ RAM của MCU. Trình phục vụ ngắt `UART1_IRQHandler` đóng vai trò Producer (chỉ mất vài chu kỳ lệnh để đọc thanh ghi dữ liệu và cất vào buffer rồi thoát ngay). Vòng lặp chính `main()` đóng vai trò Consumer, lấy dữ liệu ra giải mã khi rảnh rỗi. Với tốc độ UART 38.400 bps (khoảng 3.840 byte/giây), bộ đệm 4.096 byte có khả năng lưu trữ dữ liệu an toàn trong hơn 1,06 giây mà không bị tràn. Kết quả bài test ngâm (Soak test) 30 phút với 76.750 byte nhận từ FPGA ghi nhận $\text{drop} = 0, \text{oe} = 0$ tuyệt đối."*

---

### Câu 9: "Sóng siêu âm AJ-SR04M phát xuống mặt nước gợn sóng có tin cậy không? Xử lý góc nghiêng UAV thế nào?"
* **Ý đồ của BGK:** Kiểm tra hiểu biết thực địa về môi trường thủy văn.
* **Kịch bản trả lời chuẩn:**
  > *"Dạ, cảm biến AJ-SR04M có góc mở chùm sóng âm khoảng $75^\circ$. Khi phát từ độ cao 3 m, vệt sóng âm phủ một vùng đường kính khoảng 4,6 m trên mặt nước. Sóng âm sẽ bắt vào điểm gần nhất có phản xạ vuông góc.*
  > *Để chống nhiễu, nhóm áp dụng bộ lọc 3 tầng:*
  > *1. **Bộ lọc dải vật lý:** Loại bỏ mọi giá trị dưới 20 cm và vượt quá trần 700 cm.*
  > *2. **Bộ lọc trung vị (Median Filter) 5 mẫu:** Triệt tiêu các gai nhọn do bọt nước hoặc gợn sóng nhấp nhô gây ra.*
  > *3. **Phân loại chất lượng `alt_quality` (GOOD / FAIR / POOR):** Dựa trên phương sai của chuỗi đo liên tiếp. Nếu UAV chao lắc góc nghiêng vượt quá $25^\circ$ hoặc mặt nước động mạnh làm mất phản xạ, hệ thống chuyển sang mức POOR và từ chối giải định vị."*

---

## PHẦN 4: BỘ CÂU HỎI VÔ TUYẾN LORA & GATEWAY TRẠM ĐẤT (THỊNH & PHONG)

### Câu 10: "Tại sao nhóm chọn LoRa 433 MHz mà không dùng Wi-Fi công suất cao, 4G/5G hay các bộ truyền hình ảnh 5.8 GHz?"
* **Ý đồ của BGK:** Kiểm tra tính thực tế và lập luận lựa chọn công nghệ.
* **Kịch bản trả lời chuẩn:**
  > *"Dạ thưa Ban Giám Khảo, trong bối cảnh bão lũ miền Trung:*
  > *1. Sóng 4G/5G hoàn toàn phụ thuộc vào hạ tầng trạm phát sóng di động mặt đất — vốn bị mất điện hoặc ngập úng đầu tiên khi có thiên tai.*
  > *2. Sóng Wi-Fi 2.4 GHz và truyền hình ảnh 5.8 GHz có bước sóng rất ngắn (vài cm), năng lượng sóng bị hấp thụ và tán xạ cực kỳ mạnh bởi các hạt mưa lớn và hơi sương dày đặc, cự ly thực tế giảm từ vài km xuống chỉ còn vài trăm mét.*
  > *3. Sóng LoRa 433 MHz có bước sóng dài xấp xỉ 69 cm, khả năng đâm xuyên qua tán cây, mưa bão và vượt chướng ngại vật địa hình vượt trội. Với công nghệ điều chế trải phổ Chirp Spread Spectrum (CSS), LoRa có thể giải mã tín hiệu dưới mức sàn nhiễu (SNR xuống tới -12,5 dB tại SF8), đảm bảo gói tin tọa độ 32 byte luôn về đích an toàn."*

---

### Câu 11: "Tính toán Airtime của gói tin 32 byte tại SF7 và SF8? Nhóm phát 1 Hz có vi phạm quy định vô tuyến không?"
* **Ý đồ của BGK:** Kiểm tra kiến thức chuyên sâu về chuẩn vô tuyến và tính toán băng thông.
* **Kịch bản trả lời chuẩn:**
  > *"Dạ, với cấu hình gói tin cố định 32 byte, băng thông $\text{BW} = 125 \ \text{kHz}$, tỷ lệ sửa lỗi $\text{CR} = 4/5$, Preamble 8 ký hiệu và bật CRC phần cứng:*
  > * Thời gian chiếm sóng (Time-on-Air) tính theo công thức chuẩn của Semtech là đúng **$71,9 \ \text{ms}$ tại SF7** và **$133,6 \ \text{ms}$ tại SF8**.*
  > * Tại tần suất phát nhịp tim 1 giây/lần ($1 \ \text{Hz}$), tỷ lệ chiếm dụng kênh truyền (Duty Cycle) là $71,9 \ \text{ms} / 1000 \ \text{ms} = 7,19\%$ (tại SF7). Theo quy chuẩn kỹ thuật quốc gia về thiết bị vô tuyến cự ly ngắn dải tần ISM 433 MHz, chu kỳ này hoàn toàn nằm trong ngưỡng an toàn cho phép, bảo đảm kênh truyền không bị nghẽn và tiết kiệm tối đa năng lượng pin trên UAV."*

---

### Câu 12: "Tại sao Gateway ESP32 lại phải có nguồn pin riêng và màn hình OLED độc lập với Laptop?"
* **Ý đồ của BGK:** Kiểm tra tư duy thiết kế hệ thống dã chiến (Field Readiness).
* **Kịch bản trả lời chuẩn:**
  > *"Dạ, triết lý thiết kế của Gateway là: **'Hệ thống không được phép chết khi Laptop chết'**.*
  > *Trong môi trường mưa bão cứu hộ, laptop dã chiến có nguy cơ hết pin rất nhanh, bị ẩm ướt hoặc sập nguồn đột ngột. Nếu Gateway phụ thuộc vào nguồn USB laptop và chỉ gửi dữ liệu lên phần mềm máy tính, toàn bộ chiến dịch cứu nạn sẽ bị tê liệt.*
  > *Gateway KVC được tích hợp 2 cell pin Li-ion 18650 riêng biệt và màn hình OLED SSD1306. Ngay cả khi không có laptop, cứu hộ viên cầm chiếc Gateway nhỏ gọn trên tay vẫn đọc được trực tiếp chỉ số sóng RSSI, SNR và đặc biệt là tọa độ Vĩ độ/Kinh độ của nạn nhân hiển thị rõ ràng trên màn hình để điều động ca-nô tiếp cận."*

---

## PHẦN 5: BỘ CÂU HỎI TRẠM MẶT ĐẤT GCS & AI THAM CHIẾU (CƯỜNG & KIÊN)

### Câu 13: "Tại sao hệ thống lại có 2 camera? Sao không dùng 1 camera vừa định vị vừa truyền video về laptop?"
* **Ý đồ của BGK:** Kiểm tra tính hợp lý của kiến trúc phần cứng.
* **Kịch bản trả lời chuẩn:**
  > *"Dạ thưa Ban Giám Khảo, việc tách thành 2 camera là **quyết định kiến trúc phân tầng năng lực** đã được đội tính toán kỹ lưỡng:*
  > *1. **Camera 1 (OV2640 DVP) trên Tải bay:** Đây là **Kênh Tọa Độ Cốt Lõi**. Camera này nối trực tiếp vào FPGA để xử lý ảnh theo thời gian thực (Zero-Latency), tạo tọa độ gửi qua LoRa tầm xa. Nó không cần độ phân giải cao mà cần tốc độ và sự ổn định.*
  > *2. **Camera 2 (OV3660 MJPEG) trên ESP32-S3-CAM:** Đây là **Kênh Quan Sát Phụ Trợ**. Camera này dùng Wi-Fi truyền hình ảnh màu góc rộng về laptop khi UAV hoạt động trong cự ly gần để cứu hộ viên có cái nhìn toàn cảnh hiện trường.*
  > *Nếu gộp chung 1 camera truyền video, khi UAV bay xa ngoài tầm sóng Wi-Fi hoặc khi trời mưa to làm mất luồng video, toàn bộ tính năng định vị tọa độ cứu nạn cũng sẽ bị chết theo. Tách rời hai kênh giúp kênh tọa độ LoRa luôn sống sót độc lập trong mọi tình huống."*

---

### Câu 14: "Tại sao nhóm tuyệt đối không vẽ đè Bounding Box từ FPGA lên luồng video của camera phụ ESP32-S3?"
* **Ý đồ của BGK:** Kiểm tra tính trung thực khoa học và hiểu biết về hình học quang học.
* **Kịch bản trả lời chuẩn:**
  > *"Dạ, nhóm kiên quyết giữ cờ `has_overlay = false` vì hai lý do khoa học bất biến:*
  > *1. **Sai lệch hình học (Geometric Parallax):** Hai cảm biến OV2640 và OV3660 có tiêu cự quang học, kích thước ma trận pixel và trường nhìn (FOV) khác nhau hoàn toàn, lại được đặt ở hai vị trí vật lý cách nhau trên thân gá. Một hộp bao tính trên ảnh OV2640 không thể khớp chuẩn xác với ảnh của OV3660 nếu không có ma trận biến đổi đồng phẳng (Homography).*
  > *2. **Lệch pha thời gian (Clock Jitter):** Hai vi điều khiển chạy trên hai thạch anh độc lập, độ trễ truyền dẫn giữa đường UART và đường Wi-Fi có độ lệch pha từ 100 đến 500 ms.*
  > *Nếu vẽ đè BBox lên video mà không đồng bộ thời gian tuyệt đối sẽ dẫn tới hiện tượng 'hộp đi trước, hình theo sau', làm giảm tính chính xác khoa học. Nhóm chọn giải pháp minh bạch: hiển thị BBox trên sơ đồ Radar và Bản đồ, còn khung video hiển thị trung thực bối cảnh quan sát."*

---

### Câu 15: "Hệ thống trạm mặt đất GCS đảm bảo hoạt động 100% Offline như thế nào?"
* **Ý đồ của BGK:** Kiểm tra khả năng tác chiến thực địa không có mạng Internet.
* **Kịch bản trả lời chuẩn:**
  > *"Dạ, phần mềm GCS của nhóm được tối ưu hóa cho điều kiện cô lập mạng hoàn toàn:*
  > *1. Toàn bộ mã nguồn thư viện Leaflet, tile bản đồ nền WGS-84, font chữ Inter và các icon đồ họa được tải về và lưu trữ cục bộ trong thư mục `public/` của dự án.*
  > *2. Mã nguồn không chứa bất kỳ lời gọi nào tới các máy chủ CDN hay dịch vụ đám mây bên ngoài.*
  > *3. Cơ sở dữ liệu SQLite chạy chế độ WAL mode (Write-Ahead Logging) ghi trực tiếp trên ổ cứng laptop. Khi ngắt toàn bộ Wi-Fi và mạng Internet, phần mềm vẫn khởi động và vận hành bình thường 100%."*

---

## PHẦN 6: KỊCH BẢN XỬ LÝ CÁC TÌNH HUỐNG BẤT NGỜ TẠI BÀN THI

### Tình huống 1: "Đèn hội trường quá sáng hoặc quá tối làm camera FPGA nhận diện chập chờn"
* **Bình tĩnh xử lý:**
  1. Thưa với BGK: *"Dạ thưa thầy/cô, cảm biến OV2640 có thuật toán tự động cân bằng trắng (AWB) và phơi sáng (AEC) mất khoảng 2–3 giây để thích nghi với cường độ sáng mới của phòng thi."*
  2. Đưa vật thể mẫu (phao cam hoặc nắp cam) lại cự ly chuẩn khoảng 30–50 cm ngay dưới trục ống kính.
  3. Nếu phòng thi dùng ánh sáng trắng gắt, chuyển sang bản bitstream hiệu chuẩn `Rev 25 White Calibration` (nếu đã nạp sẵn) và dùng tờ giấy A4 trắng để minh chứng chuỗi nhận diện hoạt động hoàn hảo.

### Tình huống 2: "Gateway chưa nhận được gói tin LoRa từ MCU"
* **Bình tĩnh xử lý:**
  1. Kiểm tra ăng-ten 433 MHz trên cả hai bo xem đã vặn chặt chưa.
  2. Bấm nút Reset trên bo MCU Sonix để quan sát dòng log khởi động ban đầu trên cổng debug UART.
  3. Bật màn hình OLED của Gateway xem chỉ số trạng thái hiển thị `LORA: READY` hay `ERR`.
  4. Nếu cần, mở script `scripts/manual/mock_send_to_gcs.py` để chứng minh đường truyền từ Gateway lên Web Dashboard vẫn thông suốt.

### Tình huống 3: "Giám khảo yêu cầu chứng minh mã nguồn là do nhóm tự viết"
* **Bình tĩnh xử lý:**
  1. Mở ngay cây thư mục `KVC_PR/src/processing/kvc_blob_detect.v` chỉ cho giám khảo xem các khối tính toán logic sắc đỏ, độ bão hòa và mạch đếm RLE.
  2. Mở file `firmware/mcu_payload/src/kvc_georef.c` giải thích từng dòng code giải phương trình chiếu tia 3D và ma trận xoay.
  3. Mở terminal gõ lệnh chạy bộ testbench tự động: `pwsh scripts/run_fpga_tb.ps1` để cho BGK thấy 22 bài test Verilog chạy và PASS 100% ngay trước mắt họ.

---

## LỜI KẾT DÀNH CHO DUY PHONG VÀ ĐỘI KVC

> **Hãy nhớ rằng:** Ban Giám Khảo ngồi đối diện không phải để "đánh trượt" các bạn, mà họ đang tìm kiếm **những kỹ sư trẻ có thực lực, hiểu sâu bản chất kỹ thuật, trung thực và có tư duy giải quyết vấn đề**.
> Các bạn đã có một đề tài quá tốt, hệ thống tài liệu chuẩn mực và kết quả đo đạc thực tế đáng nể. Hãy tự tin, ngẩng cao đầu và trình diễn hết mình!

**CHÚC ĐỘI KVC THI ĐẤU THÀNH CÔNG RỰC RỠ!**
