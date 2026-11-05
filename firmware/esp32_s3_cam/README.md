# KVC — Firmware ESP32-S3-CAM (IF-05)

Camera quan sát phụ của hệ thống KVC. Thiết bị này **phát MJPEG cho backend**,
**không sinh tọa độ**, **không chạy AI**, **không gửi LoRa**.

Nguồn tọa độ duy nhất của KVC vẫn là `OV2640 → FPGA blob → IF-01 → MCU → IF-02`.

| Trường | Giá trị |
| :--- | :--- |
| Mã task | `KVC-S3CAM-A1` |
| Phiên bản | `b1.5.2` |
| Trạng thái | `SOURCE-VERIFIED` + `BUILT`; **`HARDWARE-VERIFIED` chỉ cho q22/b1.5.1** — q26/b1.5.2 **CHƯA đo trên bo** |
| Biến thể (H2) | ESP32-S3-CAM N16R8, cảm biến **OV3660** |
| Topology (H3) | S3 **Station** → hotspot 2.4 GHz của laptop/router |
| Độ phân giải | **HVGA 480×320** JPEG, quality **26** |
| Framebuffer | 3, trong PSRAM |
| Cổng HTTP | 81 (`/stream`, `/status`, `/`), TCP_NODELAY bật |

### Evidence — đo trên bo thật (OV3660, COM10)

> **Đọc kỹ:** toàn bộ số dưới đây đo ở **q22 (b1.5.1)**. Bản `b1.5.2` chỉ đổi
> `KVC_CAM_JPEG_QUALITY` 22 → 26; **chưa có phép đo nào cho q26**. Không được
> suy ra kết quả q26 từ bảng này.

**A. Cửa sổ tốt nhất (soak 3789 khung, IP 192.168.137.220, q22):**

| Chỉ số | Đo được | Ngưỡng | Kết quả |
| :--- | :--- | :--- | :---: |
| `fps` | 16,94 – 20,97 | 12 – 20 | **ĐẠT** |
| `tx` | 41 – 53 ms | 30 – 70 ms | **ĐẠT** |
| `bytes` | 4390 – 5158 | ≤ 5744 | **ĐẠT** |
| `kbps` | 83 – 121 KB/s | 80 – 150 | **ĐẠT** |
| `wait` | 3 – 5 ms | < 50 ms | **ĐẠT** |
| `fail` / `null` | 0 / 0 | 0 | **ĐẠT** |

**B. Toàn bộ 66 cửa sổ log liên tiếp (IP 192.168.137.189, q22) — số thật, đầy đủ:**

| Chỉ số | Đo được | Ngưỡng | Kết quả |
| :--- | :--- | :--- | :---: |
| `fps` | **0,79 – 24,19** | 12 – 20 | **KHÔNG ĐẠT** (có cửa sổ rơi) |
| `tx` | **31 – 2360 ms** | 30 – 70 ms | **KHÔNG ĐẠT** (11 cửa sổ > 150 ms) |
| `bytes` | **3886 – 7206** | ≤ 5744 | **KHÔNG ĐẠT** (13/66 = 20% vượt trần) |
| `kbps` | 2 – 174 KB/s | ổn định 80–150 | **KHÔNG ĐẠT** (có cửa sổ 2, 15, 18) |
| `wait` | 0 – 21 ms | < 50 ms | **ĐẠT** |
| `fail` / `null` | 0 / 0 | 0 | **ĐẠT** |
| `send_fail` | 1 (`errno=104` ECONNRESET, khung 5658 B) | — | client đóng giữa khung |

**Kết luận trung thực:** bo **đã chạy thật** và stream hoạt động liên tục qua
hàng nghìn khung. Nhưng `bytes` **phụ thuộc nội dung cảnh** và dao động
3886–7206 byte ở q22. Khoảng 20% cửa sổ vượt trần buffer 5744 byte ⇒ rơi vào
RTO 3 s ⇒ `tx` dội lên 2360 ms và `fps` xuống 0,79.

### Vì sao b1.5.2 đổi q22 → q26 (CHƯA đo)

q22 không giữ được mọi khung dưới trần 5744 byte ở cảnh nhiều chi tiết. q26 nén
mạnh hơn nên khung nhỏ hơn, kỳ vọng kéo cả cảnh phức tạp xuống dưới trần.

**Tiêu chí nghiệm thu cho q26** (phải đo, chưa đạt được bằng suy luận):

| Điều kiện | Ngưỡng |
| :--- | :--- |
| `bytes` max, cả cảnh thường **và** cảnh nhiều chi tiết | ≤ 5744 |
| `tx` | < 150 ms trong ≥ 30 phút soak |
| `fps` | ≥ 12 |
| `fail` / `null` / `restarts` | 0 / 0 / 0 |

**Đánh đổi cần biết:** q26 nén mạnh hơn nên mất chi tiết (block JPEG rõ hơn ở
vùng phẳng). Nếu ảnh quá mờ cho nhận dạng mục tiêu, cân nhắc q24 thay vì q26.

> **Wi-Fi (chuẩn H3):** `KVC_WIFI_USE_SOFTAP = 0`. S3 chạy STA thuần, nối hotspot
> 2.4 GHz bằng credential trong `include/wifi_secrets.h`. Nhờ vậy laptop một card
> Wi-Fi vừa nhận telemetry gateway vừa xem video.
> mDNS: `http://kvc-s3cam.local:81/stream`. Ghim IP bằng `KVC_STA_USE_STATIC_IP 1`.

> **Phạm vi trạng thái:** `HARDWARE-VERIFIED` áp dụng cho **b1.5.1/q22**. Bản
> `b1.5.2/q26` chỉ mới `BUILT` — chưa nạp bo, chưa đo. Không đo nhiều client,
> không đo độ trễ slow-motion.

---

## 1. Vì sao cấu hình này chạy mượt

Các tham số dưới đây **đã đo trên bo thật**, không phải suy đoán. Đổi chúng mà
không đo lại sẽ làm stream giật hoặc rơi vào retransmission timeout.

### `fb_count = 3` — không được hạ

Driver `esp32-camera` với `CAMERA_GRAB_LATEST` tạo queue framebuffer dài
`fb_count - 1` (`driver/cam_hal.c:400-403`).

| fb_count | Queue | Kết quả đo |
| :---: | :---: | :--- |
| 3 | 2 slot | **10–20 FPS** |
| 2 | 1 slot | **0,4 FPS** — DVP dừng mỗi khung |

Với 2 buffer: handler giữ 1 fb để gửi TCP ⇒ không còn buffer trống ⇒
`cam_start_frame()` thất bại ⇒ driver gọi `ll_cam_stop()` và về `CAM_STATE_IDLE`
(`cam_hal.c:77-88, 218-220`) ⇒ phải chờ VSYNC khởi động lại **mỗi khung**.

Muốn giảm độ trễ: giảm `jpeg_quality` hoặc độ phân giải. **Không hạ `fb_count`.**

### `jpeg_quality = 26` với HVGA 480×320

Đo ở q22: khung **3886–7206 byte tuỳ nội dung cảnh** (trung vị ~4,7 KB). Đây
không phải lựa chọn thẩm mỹ mà là ràng buộc kỹ thuật — xem mục 3 về buffer gửi
5744 byte của lwIP.

Số lớn hơn = nén mạnh hơn = khung nhỏ hơn = ít nghẽn hơn, nhưng mất chi tiết.
b1.5.2 chốt **q26** để lấy biên an toàn; nếu ảnh quá mờ, hạ về q24 nhưng PHẢI
đo lại `bytes` và xác nhận vẫn dưới 5744.

Lưu ý driver đã tự giới hạn `recv_size = width*height/5` (VGA = 61440 byte),
nên khung vượt 60 KiB bị chính driver bỏ (`FB-OVF`) trước khi tới hạn mức
firmware.

### AEC2 = 0 là công tắc FPS thật; AE_LEVEL thì không

`AEC2 = 0` tắt night mode — night mode cho phép cảm biến tăng VTS (giảm FPS) để
gom sáng, nên đây mới là thứ kiểm soát FPS của cảm biến.

`AE_LEVEL = -2` **không tăng FPS**. Với rolling shutter, phơi sáng tối đa bằng
một chu kỳ khung; AEC chỉ điều tiết trong giới hạn đó. Khi `AEC2 = 0`, VTS cố
định ⇒ FPS cố định, không phụ thuộc `AE_LEVEL`.

Lợi ích **thật** của `AE_LEVEL` âm: exposure ngắn hơn ⇒ ít nhoè chuyển động hơn,
đổi lại ảnh tối và nhiễu hơn. Với camera quan sát cứu nạn bão lũ, cân nhắc khi
trời mưa hoặc thiếu sáng.

Bằng chứng phản bác giả thuyết "màn trập làm giảm FPS": `wait=0ms` ở **mọi** cửa
sổ log đo được. `wait` là thời gian chờ `esp_camera_fb_get()`; bằng 0 nghĩa là
luôn có khung sẵn trong queue — cảm biến không hề chậm. Nút thắt FPS nằm ở TCP.

### `xclk = 20 MHz`

`cam_hal.c:371` đặt `psram_mode = (xclk_freq_hz == 16000000)`. Ở 20 MHz driver
tắt EDMA và copy qua SRAM nội; 16 MHz bật EDMA nhưng `esp32-camera` ghi rõ là
**"EXPERIMENTAL"**. Chưa đo trên bo này ⇒ **giữ 20 MHz**. Nếu muốn thử, đo
`wait=` trước/sau trong log 5 giây.

### Giới hạn 2 stream song song

Mỗi handler `/stream` giữ một framebuffer trong lúc gửi TCP. Với 3 buffer, chỉ 2
handler chạy song song mà không làm driver dừng DVP. Client thứ ba bị trả **503**
thay vì được nhận rồi kéo cả ba cùng chậm. Backend đã fan-out một kết nối duy
nhất (`video_relay.py`) nên giới hạn này là an toàn.

### Watchdog chỉ chạy khi có client

`esp_camera_fb_get()` chỉ được gọi khi có handler `/stream`. Không có client thì
mọi bộ đếm stall đều vô nghĩa, nên watchdog bỏ qua và reset bộ đếm. Mốc thời gian
là khung đầu tiên **của phiên hiện tại**, không phải khung cuối phiên trước —
nếu không, client mới kết nối sau >10 s uptime bị đá ra ngay khung đầu.

Khi stall thật: watchdog đặt cờ → handler tự đóng stream và nhả framebuffer →
**sau khi** `active_streams = 0` mới `deinit/init`. Không có use-after-free.

---

## 2. Nạp firmware

```powershell
# 1) Credential Wi-Fi (bắt buộc với chế độ STA)
Copy-Item firmware\esp32_s3_cam\include\wifi_secrets.h.example `
          firmware\esp32_s3_cam\include\wifi_secrets.h
notepad firmware\esp32_s3_cam\include\wifi_secrets.h

# 2) Build
& "$env:USERPROFILE\.platformio\penv\Scripts\pio.exe" run -d firmware/esp32_s3_cam

# 3) Nạp
& "$env:USERPROFILE\.platformio\penv\Scripts\pio.exe" run -d firmware/esp32_s3_cam -t upload --upload-port COM5

# 4) Log
& "$env:USERPROFILE\.platformio\penv\Scripts\pio.exe" device monitor -d firmware/esp32_s3_cam --port COM5
```

`wifi_secrets.h` đã nằm trong `.gitignore` — không commit SSID/mật khẩu thật.
Thiếu file này firmware vẫn build và chạy nhưng log báo thiếu credential và
không có mạng, không có stream.

### Log khởi động kỳ vọng

```text
[CAM][I] KVC-ESP32S3-CAM b1.5.2
[CAM][I] Vai tro: camera quan sat (IF-05). KHONG sinh toa do.
[CAM][I] Chip: ESP32-S3 rev 0, 240 MHz, flash 16 MB
[CAM][I] PSRAM: 8388608 byte
[CAM][I] Cam bien: OV3660 (PID=0x3660)
[CAM][I] Cau hinh: 480x320 JPEG q=26, fb_count=3, PSRAM, xclk=20 MHz
[CAM][I] Wi-Fi: dang ket noi SSID "..." (STA)
[CAM][I] HTTP server: cong 81, toi da 6 socket, 2 stream song song
[CAM][I] Wi-Fi: da ket noi AP, dang cho DHCP
[CAM][I] Wi-Fi: IP = 192.168.x.y, RSSI = -NN dBm
[CAM][I] mDNS: http://kvc-s3cam.local:81/stream (ip 192.168.x.y)
[CAM][I] San sang.
```

Phân biệt bản build bằng dòng `Cau hinh:`:
- `480x320 ... q=26 ... fb_count=3` → bản này (b1.5.2, HVGA/q26 — **chưa đo bo**).
- `480x320 ... q=22 ... fb_count=3` → b1.5.1 (HVGA/q22 — đã đo, HARDWARE-VERIFIED).
- `320x240 ... q=16 ... fb_count=3` → b1.4.0 (QVGA).
- `640x480 ... q=16 ... fb_count=3` → b1.2.0/b1.3.0 (VGA, bị congestion collapse).
- `640x480 ... q=16 ... fb_count=2` → bản lỗi 0,4 FPS, nạp lại.
- `640x480 ... q=14 ... fb_count=3` → bản a1.1.0.
- `800x600 ... fb_count=2` → firmware trước 03/11/2026.

---

## 3. Đọc log để tìm nút thắt

Mỗi 5 giây:

```text
[CAM][I] ip=192.168.137.170 rssi=-17 heap=... psram=... | frames=130 fps=7.18
         wait=12ms tx=118ms bytes=18000 kbps=149 | fail=0 null=0 oversize=0
         send_fail=0 lock_to=0 rejected=0 stall=0 restarts=0
         | active=1/2 phase=ranh 0ms
```

| Trường | Ý nghĩa |
| :--- | :--- |
| `fps` | Khung/giây gửi thành công trong cửa sổ 5 s (số **đo**, không suy từ `frames` tích luỹ) |
| `wait` | ms chờ `esp_camera_fb_get()` — **nghẽn phía camera** nếu cao |
| `tx` | ms gửi một khung qua TCP — **nghẽn phía client/Wi-Fi** nếu cao |
| `bytes` | Byte JPEG trung bình mỗi khung |
| `kbps` | **Tốc độ đẩy thực đo** = tổng byte / tổng thời gian nằm trong `send()`, đơn vị KB/s |
| `fail` | Số lần handler thấy `fb_get` trả NULL |
| `null` | **Tổng** số lần `fb_get` trả NULL từ lúc boot — chỉ báo sức khoẻ camera |
| `oversize` | Khung vượt hạn mức firmware |
| `send_fail` | Client đứt khi đang gửi — bình thường khi đóng tab |
| `lock_to` | Không lấy được khoá camera trong 2 s |
| `rejected` | Client bị từ chối vì đã đủ 2 stream |
| `phase` | Handler đang ở pha nào: `ranh`, `cho-camera`, `dang-gui` |
| `<n>ms` sau `phase` | Đã ở pha đó bao lâu. **Tăng liên tục = handler đang treo** thật sự |
| `stall` | Handler tự đóng do watchdog phát hiện stall thật |
| `restarts` | Số lần `esp_camera_deinit/init` |
| `active` | Số stream đang chạy / giới hạn |

Quy tắc chẩn đoán:

| Hiện tượng | Kết luận | Việc cần làm |
| :--- | :--- | :--- |
| `fps` thấp, `wait` cao | Nghẽn camera/sensor | Thiếu sáng (AEC kéo dài phơi sáng) → tăng `KVC_CAM_AE_LEVEL`, hoặc hạ độ phân giải; đo lại nếu đổi XCLK |
| `fps` thấp, `tx` cao, `wait=0` | Nghẽn **số gói TCP**, không phải băng thông | Xem mục "Gộp khung thành một chunk" bên dưới |
| `fps` thấp, cả hai thấp, `bytes` lớn | Khung quá to | Tăng `jpeg_quality` (số lớn = nén mạnh hơn) |
| `fps` thấp, `rejected` tăng | Quá nhiều client | Dùng backend relay, không mở nhiều tab |
| `null` tăng, `send_fail` tăng, `restarts` tăng | Watchdog restart **oan**: camera khoẻ, lỗi nằm ở TCP | Đã sửa ở b1.2.0 — nếu vẫn gặp thì báo hồi quy |
| `phase=dang-gui` với số ms tăng dần | Handler **treo** trong `send()` | Client không đọc dữ liệu; xem `send_wait_timeout` |

`wait + tx ≈ 1000/fps` khi một client. Nếu `wait ≈ 0` thì camera luôn có khung
sẵn và nút thắt nằm ở TCP.

**Cảnh báo về cách đọc `wait`/`tx`/`bytes`:** ba số này được chia cho số khung
**gửi thành công** trong cửa sổ. Nếu cửa sổ đó có `frames=0` thì chúng bằng 0
— điều này **không** có nghĩa "không có lỗi", mà nghĩa là không có khung nào
hoàn tất. Khi thấy `frames=0` mà `active>0`, hãy đọc `send_fail`, `null` và
`phase` thay vì `wait`/`tx`.

### Gộp khung thành một chunk (b1.1.0)

Đo trên bo thật 03/11/2026 với bản a/b1.0.0: `wait=0ms` nhưng `tx` = **257–2574 ms**
cho khung ~10 KB, tức chỉ **~34 KB/s** và 0,4–3 FPS.

Nguyên nhân là **số lời gọi `send()`**, không phải băng thông. Gửi header và JPEG
bằng hai lời gọi `httpd_resp_send_chunk()` khiến httpd phát sinh khoảng **6 lần
`send()`** cho mỗi khung (dòng kích thước chunk + CRLF cho mỗi chunk). Mỗi gói nhỏ
phải chờ ACK và va vào delayed-ACK của Windows ⇒ nghẽn.

Bản b1.1.0 gộp `\r\n--boundary\r\n` + `Content-Type` + `Content-Length` + JPEG vào
**một** chunk, dùng bộ đệm PSRAM cấp phát một lần. Byte trên dây không đổi —
chunked framing bị lớp HTTP bóc đi, nên backend vẫn nhận đúng
`\r\n--boundary\r\nContent-Type...\r\n\r\n<jpeg>`.

Về `TCP_NODELAY`: b1.0.0 (6 lần send/khung) bật NODELAY thì FPS **tệ hơn**, nên
b1.1.0/b1.2.0 để tắt. Từ b1.3.0 chỉ còn ~3 lần send/khung nên đã bật lại để làm
thí nghiệm A/B; công tắc là `KVC_HTTP_TCP_NODELAY` trong `kvc_config.h`. Kết quả
đo ở b1.3.0 (xem mục dưới) cho thấy NODELAY **không** phải nguyên nhân — `tx`
vẫn 2600+ ms.

### Vì sao giảm độ phân giải (b1.4.0) — congestion collapse, không phải băng thông

Bối cảnh: b1.3.0 chạy VGA 640×480 q16 và stream sụp. Đo trên bo thật 03/11/2026
(IP 192.168.137.220), `kbps` theo từng cửa sổ
5 giây:

| Cửa sổ | `tx` | `kbps` |
| :--- | :--- | :--- |
| 1 | 91 ms | **118** |
| 2 | 2169 ms | 4 |
| 3 | 296 ms | 34 |
| 4 | 952 ms | 11 |
| 5 | 2606 ms | 4 |
| 6 | 2663 ms | 4 |
| 7 | 818 ms | 15 |
| 8 | 290 ms | 41 |
| 9 | 386 ms | 26 |

Hai kết luận từ chính các số này:

1. **Băng thông không phải nút thắt.** Cửa sổ đầu đạt 118 KB/s, tức đường
   truyền làm được 118 KB/s khi không mất gói.
2. **Đây là congestion collapse.** `tx` chạm 2606–2663 ms, gần đúng
   `CONFIG_LWIP_TCP_RTO_TIME = 3000`. Mất gói ⇒ congestion window sụp ⇒
   retransmission timeout 3 giây. RSSI −12…−31 dBm rất tốt nhưng RSSI cao
   **không** chứng minh không mất gói.

Gốc rễ nằm ở cấu hình lwIP của framework Arduino:

```text
CONFIG_LWIP_TCP_SND_BUF_DEFAULT = 5744 byte
CONFIG_LWIP_TCP_MSS             = 1436 byte   -> 4 segment
```

Khung VGA q16 ~10–12 KB **gấp đôi** buffer gửi ⇒ mỗi khung chia 8 segment và phải
chờ ACK nhiều vòng. Chỉ cần mất 1 segment là cả khung chờ RTO 3 giây. Đo được lúc
đó: `tx` 2606–2663 ms, `kbps` sụp về 4.

### Kết quả thật: HVGA 480×320 @ q22 (b1.5.1) — đạt một phần

Đây là **số đo của b1.5.1/q22**, giữ nguyên làm mốc so sánh cho b1.5.2/q26.

Cửa sổ tốt nhất (soak 3789 khung, IP 192.168.137.220):

```text
fps    16,94 – 20,97
tx     41 – 53 ms
bytes  4390 – 5158
kbps   83 – 121 KB/s
fail   0      null 0      wait 3–5 ms
```

Nhưng trên toàn bộ 66 cửa sổ log liên tiếp ở IP 192.168.137.189:

```text
fps    0,79 – 24,19
tx     31 – 2360 ms        (11 cửa sổ > 150 ms)
bytes  3886 – 7206         (13/66 = 20% vượt 5744)
kbps   2 – 174
```

**`bytes` phụ thuộc nội dung cảnh, không phải hằng số.** q22 chỉ đưa phần lớn
khung xuống dưới 5744 byte; khi cảnh nhiều chi tiết, khung vượt trần (cao nhất
7206 byte = vượt 1462 byte) và rơi vào RTO 3 s.

Đây là lý do kỹ thuật của HVGA (so với VGA 8 segment), nhưng **không phải bảo
đảm tuyệt đối**. Đó là lý do b1.5.2 tăng q22 → q26 để nén mạnh hơn.

**Quy tắc sống còn: `bytes ≤ 5744`.** Theo dõi trường `bytes` trong log 5 giây;
nếu thường xuyên vượt hoặc thấy `tx` > 300 ms, hạ độ phân giải về QVGA và đo lại.

Muốn quay lại VGA phải tăng `CONFIG_LWIP_TCP_SND_BUF_DEFAULT` (sửa `sdkconfig`
của framework, không sửa được từ `platformio.ini`) hoặc chấp nhận
retransmission.

---

## 4. Kiểm tra nhanh

```powershell
curl http://kvc-s3cam.local:81/status
ffplay -f mjpeg http://kvc-s3cam.local:81/stream
```

`/status` trả JSON gồm cấu hình hiện tại (`ver`, `sensor`, `jpeg_quality`,
`fb_count`, `xclk_hz`, `max_streams`) và toàn bộ bộ đếm. Dùng `ver` để biết bo
đang chạy bản nào — **không** dùng SHA của `firmware.bin` vì ESP-IDF nhúng
timestamp nên hai lần build sạch cho hai SHA khác nhau.

Trường mới so với bản a1.x: `fb_count`, `xclk_hz`, `max_streams`,
`rejected_clients`, `last_attempt_age_ms`.

---

## 5. Bảng chân

Mapping phổ biến nhất của module bán dưới tên "ESP32-S3-CAM" (N16R8, camera rời
qua cáp FPC 24 chân). Không phải mapping duy nhất.

### Xác minh chéo độc lập (Independent Pinout Cross-Verification)

Bảng dưới đây khớp **1:1** với nhánh `CAMERA_MODEL_ESP32S3_EYE` trong
`camera_pins.h` của ví dụ chính thức Espressif, được tái bản trong repo
[`ittipu/IoT_Bhai_Youtube_Channel` — Freenova ESP32-S3 Cam](https://github.com/ittipu/IoT_Bhai_Youtube_Channel/tree/main/Complete%20ESP32%E2%80%91CAM%20Tutorial%20Playlist/1.%20Getting%20Started%20with%20Freenova%20ESP32-S3%20Cam%20Setup%20%26%20Web%20Server/freenova_esp32s3_cam_setup_and_webserver).

Đây là **nguồn tham chiếu độc lập**, không phải suy đoán từ schematic của KVC:
13 tín hiệu (XCLK, SIOD, SIOC, Y2–Y9, VSYNC, HREF, PCLK) trùng khớp hoàn toàn.
Ngoài ra ví dụ đó cũng dùng cùng boundary token MJPEG
(`123456789000000000000987654321`) vì đều bắt nguồn từ `CameraWebServer` của
Espressif — nhưng **code của ví dụ đó không dùng được cho KVC** (fb_count=2,
SVGA, gửi 3 chunk; xem ghi chú trong `kvc_config.h`).

| Tín hiệu | GPIO | Ghi chú |
| :--- | :---: | :--- |
| XCLK | 15 | 20 MHz |
| SIOD (SDA) | 4 | SCCB |
| SIOC (SCL) | 5 | SCCB |
| D0 / Y2 | 11 | |
| D1 / Y3 | 9 | |
| D2 / Y4 | 8 | |
| D3 / Y5 | 10 | |
| D4 / Y6 | 12 | |
| D5 / Y7 | 18 | |
| D6 / Y8 | 17 | |
| D7 / Y9 | 16 | |
| VSYNC | 6 | |
| HREF | 7 | |
| PCLK | 13 | |
| PWDN | — | Không nối (`-1`) |
| RESET | — | Không nối (`-1`) |

Tránh dùng: GPIO 19/20 (USB), 43/44 (UART0 log), 0/3/45/46 (strapping).

| Mã lỗi `esp_camera_init` | Nghĩa | Kiểm tra đầu tiên |
| :--- | :--- | :--- |
| `0x105` / `0x107` | Không thấy cảm biến qua SCCB | SIOD/SIOC, cáp FPC, nguồn 3,3 V |
| `0x20004` / `0x20005` | Cấu hình DVP sai | D0–D7, PCLK, VSYNC, HREF |
| Init OK nhưng không có khung | XCLK hoặc PCLK | Đo XCLK chân 15 |

---

## 5b. Quy tắc vận hành phát liên tục 24/7 (operational envelope)

Bốn quy tắc cho đội bay. Vi phạm bất kỳ điều nào đều có thể làm stream đứng giữa
nhiệm vụ.

| # | Quy tắc | Lý do kỹ thuật | Cách kiểm |
| :---: | :--- | :--- | :--- |
| 1 | **Một kết nối duy nhất tới camera** — chỉ `video_relay.py`; mọi dashboard/script xem qua `http://localhost:8000/video/stream` | Mỗi handler `/stream` giữ 1 framebuffer; với `fb_count=3` chỉ 2 handler chạy song song. Client thứ ba bị 503. Mở nhiều client trực tiếp còn làm cạn socket (`accept` trả `errno` 128) | `curl /status` → `active_streams` phải là `1`, `rejected_clients` không tăng |
| 2 | **Nguồn 5 V / ≥2 A riêng** | Wi-Fi TX burst kéo dòng đỉnh; sụt áp gây brownout và reset giữa stream | Brownout in ra ở UART; đèn nguồn không nhấp nháy |
| 3 | **Tản nhiệt nhôm cho ESP32-S3** | Nhiệt cao làm Wi-Fi chập chờn và cảm biến tăng nhiễu (khung to hơn) | Sờ mặt chip sau 10 phút; nếu bỏng tay là quá nhiệt |
| 4 | **Khoá cấu hình HVGA 480×320 / q26** | Đây là cấu hình chốt cho vận hành. Đổi lên VGA sẽ vượt buffer 5744 B (`kvc_config.h`) | `/status` → `width=480`, `height=320`, `jpeg_quality=26` |

**Kiểm tra trước khi bay (30 giây):**

```powershell
curl http://kvc-s3cam.local:81/status
```

Phải thấy: `active_streams: 1`, `fb_count: 3`, `ver: "b1.5.2"`, `fail` và
`restarts` không tăng. Trong log 5 giây, `bytes` phải **thường xuyên** dưới
5744 — nếu vẫn vượt liên tục ở q26, hạ độ phân giải về QVGA 320×240 trước khi bay
(không còn q nào để tăng trong giới hạn thực dụng).

---

## 6. Nguồn và cơ khí (H5)

- **Rail 5 V riêng** từ LM2596, chịu **600–800 mA**. Không lấy nguồn từ FPGA hay
  MCU: dòng khởi động của cảm biến làm sụt áp rail chung, gây lỗi SCCB ngẫu nhiên.
- **Tụ gần module:** 100 µF electrolytic + 100 nF ceramic.
- **Gá chống rung.** Rung làm JPEG nhoè, tăng kích thước khung và dễ chạm trần
  của driver.
- **Không câu GPIO sang FPGA/MCU.** Hai hệ thống độc lập về điện.

---

## 7. Đo hiệu năng (A5)

```powershell
python scripts/manual/measure_mjpeg_stream.py `
    --url http://kvc-s3cam.local:81/stream --seconds 60 `
    --out docs/verification/evidence/IF-05_mjpeg_<ngày-giờ>.csv
```

Script đo trên **đồng hồ của máy đo**, không dùng `frames` của firmware. Đây là
cách duy nhất tách lỗi firmware khỏi lỗi trình duyệt.

---

## 8. Điều KHÔNG được suy ra

| Không được nói | Vì sao |
| :--- | :--- |
| "`HARDWARE-VERIFIED` cho mọi điều kiện" | Chỉ chứng minh firmware **chạy được trên bo** với OV3660. Chưa đo nhiều client, chưa đo slow-motion, chưa soak nhiều giờ |
| "Đã triệt tiêu hoàn toàn congestion collapse" | **SAI**: 13/66 cửa sổ log đo được vẫn vượt trần 5744 byte (max 7206), `tx` vẫn dội 2360 ms |
| "`bytes` là hằng số ~4,4 KB" | **SAI**: dao động 3886–7206 byte theo nội dung cảnh trên cùng cấu hình |
| "Build xanh là đã kiểm phần cứng" | Build xanh không chứng minh cảm biến nhận cấu hình đúng — phải có log bo thật |
| "Video đồng bộ với bbox FPGA" | Hai camera vật lý, hai đồng hồ. `has_overlay` luôn `false` |
| "FPS = N" từ `frames` | `frames` là số đếm tích luỹ. Dùng trường `fps` trong log |
| "Đã đo độ trễ" | Cần quay slow-motion điện thoại + cảnh thật. Chưa làm |
| "16 MHz nhanh hơn" | Chưa đo trên bo này; là chế độ EXPERIMENTAL của driver |
| "`AE_LEVEL` tăng FPS" | Chỉ giảm nhoè chuyển động; FPS do VTS/AEC2 quyết định |
| "Chạy được ở VGA như cũ" | VGA vượt buffer 5744 byte ⇒ RTO 3 s (xem mục 3) |

---

## 9. Cấu trúc

```text
firmware/esp32_s3_cam/
├── platformio.ini            board N16R8, PSRAM OPI, 240 MHz
├── README.md
├── include/
│   ├── kvc_config.h          TẤT CẢ hằng số chỉnh được
│   ├── kvc_log.h             macro log
│   └── wifi_secrets.h.example  mẫu credential (file thật bị gitignore)
└── src/
    ├── main.cpp              setup/loop
    ├── kvc_camera.cpp/.h     driver OV3660 + mutex framebuffer
    ├── kvc_http.cpp/.h       esp_http_server, MJPEG :81
    ├── kvc_wifi.cpp/.h       STA (H3) + mDNS
    ├── kvc_health.cpp/.h     watchdog + log định kỳ
    └── kvc_stats.cpp/.h      bộ đếm atomic + cửa sổ đo
```

Kiểm thử hợp đồng dây dẫn với backend:
`gcs/backend/tests/test_s3cam_wire_contract.py` — dựng lại đúng chuỗi byte
firmware gửi và cho `FrameExtractor` thật phân tích. Boundary
`123456789000000000000987654321` và thứ tự header không đổi so với các bản trước.
