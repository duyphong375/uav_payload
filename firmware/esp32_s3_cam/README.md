# KVC — Firmware ESP32-S3-CAM (IF-05, task A1)

Camera quan sát phụ của hệ thống KVC. Thiết bị này **phát MJPEG cho backend**,
**không sinh tọa độ**, **không chạy AI**, **không gửi LoRa**.

Nguồn tọa độ duy nhất của KVC vẫn là `OV2640 → FPGA blob → IF-01 → MCU → IF-02`.

| Trường | Giá trị |
| :--- | :--- |
| Mã task | `KVC-S3CAM-A1` |
| Trạng thái | `SOURCE-VERIFIED` + `BUILT` — **chưa `HARDWARE-VERIFIED`** |
| Biến thể đã chốt (H2) | ESP32-S3-CAM, cảm biến **OV3660 3 MP** |
| Topology (H3) | S3 **Station** → hotspot laptop/router. Gateway C3 cắm USB Serial |
| Độ phân giải | SVGA 800×600 JPEG, quality 12 |
| Cổng HTTP | 81 (`/stream`, `/status`, `/`) |

---

## 1. Nạp firmware

```powershell
# 1) Cấu hình Wi-Fi (KHÔNG commit file này)
Copy-Item firmware\esp32_s3_cam\include\wifi_secrets.h.example `
          firmware\esp32_s3_cam\include\wifi_secrets.h
notepad firmware\esp32_s3_cam\include\wifi_secrets.h

# 2) Build
pio run -d firmware/esp32_s3_cam

# 3) Nạp (thay COMx bằng cổng thật)
pio run -d firmware/esp32_s3_cam -t upload --upload-port COM5

# 4) Xem log
pio device monitor -d firmware/esp32_s3_cam --port COM5
```

`wifi_secrets.h` đã nằm trong `.gitignore`. Nếu quên tạo file này, firmware vẫn
build và vẫn chạy nhưng log sẽ báo thiếu credential và không có mạng.

### Kiểm tra đã nạp đúng

Log khởi động phải có các dòng sau (thứ tự quan trọng):

```text
[CAM][I] KVC-ESP32S3-CAM a1.0.0
[CAM][I] Vai tro: camera quan sat (IF-05). KHONG sinh toa do.
[CAM][I] Chip: ESP32-S3 rev 0, 240 MHz, flash 16 MB
[CAM][I] PSRAM: 8388608 byte
[CAM][I] Cam bien: OV3660 (PID=0x3660)          <-- H2 xác nhận ở đây
[CAM][I] Cau hinh: 800x600 JPEG q=12, fb_count=2, PSRAM
[CAM][I] HTTP server: cong 81, toi da 6 socket, stack 8192
[CAM][I] Wi-Fi: IP = 192.168.x.y, RSSI = -NN dBm
[CAM][I] mDNS: http://kvc-s3cam.local:81/stream
[CAM][I] San sang.
```

Nếu `Cam bien:` ghi PID khác `0x3660`, firmware vẫn chạy nhưng in
`CANH BAO: ky vong OV3660 ...`. Ghi lại PID thực và báo trước khi đo màu —
hiệu chuẩn của biến thể khác không áp dụng.

### Kiểm tra nhanh không cần trình duyệt

```powershell
# Trạng thái (JSON)
curl http://kvc-s3cam.local:81/status

# Xem stream bằng ffplay (nếu có)
ffplay -f mjpeg http://kvc-s3cam.local:81/stream
```

`/status` trả các bộ đếm quan trọng:

| Trường | Ý nghĩa khi bất thường |
| :--- | :--- |
| `frames` | Tăng đều khi có người xem. Không tăng = không ai kết nối, hoặc `fb_get` lỗi |
| `fb_get_failures` | > 0 liên tục = driver/camera có vấn đề, không phải mạng |
| `oversize_drops` | > 0 = khung vượt 160 KiB. Giảm chất lượng hoặc độ phân giải |
| `send_failures` | Cao = client đóng liên tục. Bình thường khi đóng/mở tab nhiều |
| `lock_timeouts` | > 0 = nhiều client tranh nhau. Xem mục "Nhiều người xem" |
| `last_frame_age_ms` | `-1` = chưa từng có khung |

### Về SHA của `firmware.bin`

Hai lần build sạch từ cùng source cho **hai SHA khác nhau** — ESP-IDF nhúng
timestamp vào ảnh. Vì vậy:

- Đừng dùng SHA binary để chứng minh "đã nạp đúng bản". Thứ tái lập được là
  **source + `platformio.ini` + Git HEAD**.
- Muốn biết bo đang chạy bản nào: đọc `/status` → trường `ver`, khớp
  `KVC_FW_VERSION` trong `include/camera_config.h`. **Tăng số này mỗi lần đổi
  hành vi.**

---

## 2. Bảng chân

**Đây là mapping phổ biến nhất của module bán dưới tên "ESP32-S3-CAM"
(WROOM-1 N16R8, camera rời qua cáp FPC 24 chân). Không phải mapping duy nhất.**

| Tín hiệu | GPIO | Ghi chú |
| :--- | :---: | :--- |
| XCLK | 15 | Clock cấp cho cảm biến, 20 MHz |
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

**Nếu `esp_camera_init` lỗi:** sửa `include/camera_config.h`, không phải sửa
`main.cpp`.

| Mã lỗi | Nghĩa | Kiểm tra đầu tiên |
| :--- | :--- | :--- |
| `0x105` / `0x107` | Không thấy cảm biến qua SCCB | Chân SIOD/SIOC, cáp FPC, nguồn 3,3 V |
| `0x20004` / `0x20005` | Cấu hình DVP sai | Chân D0–D7, PCLK, VSYNC, HREF |
| Init OK nhưng không có khung | XCLK hoặc PCLK | Đo XCLK ở chân 15; thử hạ `KVC_CAM_XCLK_HZ` xuống 10 MHz |

---

## 3. Nguồn và cơ khí (quyết định H5)

- **Rail 5 V riêng** từ LM2596, chịu **600–800 mA** cho module camera.
  Không lấy nguồn từ FPGA hay MCU: dòng khởi động của cảm biến làm sụt áp
  rail chung và gây lỗi SCCB ngẫu nhiên.
- **Tụ gần chân module:** 100 µF electrolytic + 100 nF ceramic.
- **Gá chống rung.** Rung làm JPEG nhoè và tăng kích thước khung (nhiều chi
  tiết hơn), dễ vượt trần 160 KiB.
- **Không câu GPIO sang FPGA/MCU.** Hai hệ thống độc lập về điện.

---

## 4. Nhiều người xem

Firmware **serialize** việc lấy khung bằng một mutex. Hệ quả:

- `N` client cùng xem → mỗi client nhận ~`1/N` số khung.
- Backend mở `1 + số_người_xem` kết nối (xem `IF_ESP32_CAM_GCS.md` §3.1).

Muốn nhiều người xem cùng chất lượng, **gộp fan-out ở `video_relay.py`**, không
thêm client thứ ba vào camera.

---

## 5. Đo hiệu năng thật (A5)

```powershell
python scripts/manual/measure_mjpeg_stream.py `
    --url http://kvc-s3cam.local:81/stream --seconds 60 `
    --out docs/verification/evidence/IF-05_mjpeg_<ngày-giờ>.csv
```

Script này đo trên **đồng hồ của máy đo**, không dùng `frames` của firmware.

---

## 6. Điều KHÔNG được suy ra

| Không được nói | Vì sao |
| :--- | :--- |
| "Camera HARDWARE-VERIFIED" | Build xanh không chứng minh được cảm biến nhận cấu hình |
| "Video đồng bộ với bbox FPGA" | Hai camera vật lý, hai đồng hồ. `has_overlay` luôn `false` |
| "FPS = N" từ `frames` | `frames` là số đếm tích luỹ, không phải tần số |
| "Đã đo độ trễ" | Cần quay slow-motion điện thoại + cảnh thật |

---

## 7. Cấu trúc

```text
firmware/esp32_s3_cam/
├── platformio.ini            cấu hình build (board, cờ, lib)
├── README.md                 file này
├── include/
│   ├── camera_config.h       TẤT CẢ hằng số hiệu chỉnh được
│   └── wifi_secrets.h.example  mẫu credential (file thật bị gitignore)
└── src/
    └── main.cpp              camera + HTTP MJPEG + Wi-Fi STA + giám sát
```

Kiểm thử hợp đồng dây dẫn với backend:
`gcs/backend/tests/test_s3cam_wire_contract.py` — dựng lại đúng chuỗi byte
firmware gửi và cho `FrameExtractor` thật phân tích.
