/**
 * @file kvc_config.h
 * @brief Toàn bộ hằng số biên dịch của firmware ESP32-S3-CAM (IF-05).
 *
 * Thiết bị này là CAMERA QUAN SÁT: phát MJPEG cho backend, KHÔNG sinh tọa độ,
 * KHÔNG chạy AI, KHÔNG gửi gì vào LoRa.
 *
 * Muốn đổi hành vi thì sửa file này, không sửa các .cpp.
 */

#pragma once

#include <IPAddress.h>

// Cần cho enum `framesize_t` dùng trong KVC_CAM_FRAME_SIZE và các static_assert
// kiểm tra cặp độ phân giải. Header này do esp32-camera cung cấp; nếu thiếu thì
// lỗi biên dịch sẽ chỉ ra ngay chứ không âm thầm chọn sai framesize.
#include "sensor.h"

// ===========================================================================
// 1. Định danh firmware
//
// Tăng KVC_FW_VERSION mỗi lần đổi hành vi quan sát được. `/status` trả về đúng
// chuỗi này, nên đây là cách duy nhất đáng tin để biết bo đang chạy bản nào
// (SHA của firmware.bin thay đổi mỗi lần build vì ESP-IDF nhúng timestamp).
// ===========================================================================

#define KVC_FW_NAME "KVC-ESP32S3-CAM"
#define KVC_FW_VERSION "b1.5.4"

// ===========================================================================
// 2. Bảng chân camera (DVP) — ESP32-S3-CAM N16R8, FPC 24 chân
//
// Đây là mapping phổ biến nhất của module bán dưới tên "ESP32-S3-CAM". Không
// phải mapping duy nhất; nếu `esp_camera_init` trả 0x105/0x107 thì kiểm tra
// SIOD/SIOC trước tiên.
// ===========================================================================

#define KVC_CAM_PIN_PWDN -1
#define KVC_CAM_PIN_RESET -1
#define KVC_CAM_PIN_XCLK 15
#define KVC_CAM_PIN_SIOD 4
#define KVC_CAM_PIN_SIOC 5

#define KVC_CAM_PIN_D0 11  // Y2
#define KVC_CAM_PIN_D1 9   // Y3
#define KVC_CAM_PIN_D2 8   // Y4
#define KVC_CAM_PIN_D3 10  // Y5
#define KVC_CAM_PIN_D4 12  // Y6
#define KVC_CAM_PIN_D5 18  // Y7
#define KVC_CAM_PIN_D6 17  // Y8
#define KVC_CAM_PIN_D7 16  // Y9

#define KVC_CAM_PIN_VSYNC 6
#define KVC_CAM_PIN_HREF 7
#define KVC_CAM_PIN_PCLK 13

// ===========================================================================
// 3. Cảm biến và khung hình
// ===========================================================================

// XCLK 20 MHz: cấu hình đã chạy thật trên bo này.
//
// CẢNH BÁO TRƯỚC KHI ĐỔI SANG 16 MHz: `cam_hal.c:371` của esp32-camera đặt
//     psram_mode = (xclk_freq_hz == 16000000)
// psram_mode bật EDMA ghi THẲNG vào framebuffer PSRAM (không copy qua SRAM nội).
// Về lý thuyết 16 MHz giảm tải CPU, nhưng README của esp32-camera ghi rõ đây là
// chế độ "EXPERIMENTAL", và chưa đo trên bo này. Đổi phải kèm phép đo `wait=`
// trước/sau trong log 5 giây. Không đổi chỉ vì "thấy trên mạng".
#define KVC_CAM_XCLK_HZ 20000000

// Độ phân giải. Đổi CẢ BA macro cùng lúc; `static_assert` bên dưới chỉ chấp
// nhận các cặp đã được esp32-camera hỗ trợ cho OV3660.
//
// LƯU Ý VỀ KỲ VỌNG KHI HẠ ĐỘ PHÂN GIẢI: ở chế độ JPEG, `ov3660.c:357-365`
// KHÔNG đổi PLL theo framesize — luôn 50 MHz SYSCLK / 10 MHz PCLK. Nghĩa là
// hạ độ phân giải KHÔNG làm cảm biến quét nhanh hơn; nó chỉ giảm số byte phải
// đọc ra khỏi cảm biến và truyền qua Wi-Fi. Vẫn có lợi, nhưng đừng chờ FPS
// tăng gấp đôi nếu nút thắt là TCP.
//
// Các lựa chọn đã kiểm chứng là có trong enum của driver (sensor.h:94-98):
//   FRAMESIZE_QVGA  320x240
//   FRAMESIZE_CIF   400x296
//   FRAMESIZE_HVGA  480x320
//   FRAMESIZE_VGA   640x480
//   FRAMESIZE_SVGA  800x600
//
// VÌ SAO HVGA 480x320 — ĐÃ ĐO TRÊN BO THẬT
//
// Cấu hình này chọn theo RÀNG BUỘC KỸ THUẬT, không theo thẩm mỹ. Cấu hình lwIP
// của framework Arduino (sdkconfig) chỉ cho 4 segment mỗi lần gửi:
//   CONFIG_LWIP_TCP_SND_BUF_DEFAULT = 5744 byte
//   CONFIG_LWIP_TCP_MSS             = 1436 byte   -> 4 segment
//   CONFIG_LWIP_TCP_RTO_TIME        = 3000 ms
//
// Ở VGA q16, khung 10–12 KB = 8 segment, gấp đôi buffer: mỗi khung phải chờ ACK
// nhiều vòng, chỉ cần mất 1 segment là chờ RTO 3 s. Đo lúc đó: `tx` chạm
// 2606–2663 ms, `kbps` sụp về 4. Đó là congestion collapse, không phải thiếu
// băng thông (cửa sổ tốt nhất từng đạt 118 KB/s).
//
// HVGA hạ số điểm ảnh còn 153.600 (2400 mỗi dòng), nên kích thước khung JPEG
// giảm mạnh so với VGA. Đây là lý do kỹ thuật của độ phân giải HVGA.
//
// SỐ ĐO THỰC TẾ Ở q22 (b1.5.1, bo thật OV3660, IP 192.168.137.220/.189):
//   - Soak tốt nhất: 3789 khung, fps 16,9–21,0, tx 41–53 ms, kbps 83–121,
//     fail=0, null=0, wait 3–5 ms.
//   - Nhưng `bytes` PHỤ THUỘC NỘI DUNG CẢNH và dao động 3886–7206 byte trên
//     cùng cấu hình. Trong 66 cửa sổ log liên tiếp, 13 cửa sổ (20%) vượt
//     5744 byte, cao nhất 7206 byte (vượt 1462 byte).
//   - Khi vượt ngưỡng, `tx` dội lên tới 2360 ms và `fps` rơi xuống 0,79.
//
// KẾT LUẬN: q22 KHÔNG bảo đảm mọi khung nằm dưới 5744 byte. Cấu hình này đạt
// FPS tốt trong cảnh thường nhưng vẫn có cửa sổ rơi vào RTO khi cảnh nhiều chi
// tiết. Đây là GIỚI HẠN ĐÃ BIẾT, không phải lỗi đã sửa.
//
// Quy tắc vận hành: theo dõi trường `bytes` trong log 5 giây. Nếu `bytes` thường
// xuyên vượt 5744 hoặc thấy `tx` > 300 ms, tăng q lên 24–26 cho cảnh đó (nén
// mạnh hơn = khung nhỏ hơn), hoặc hạ về QVGA 320x240. KHÔNG hạ `fb_count`.
#define KVC_CAM_FRAME_SIZE FRAMESIZE_VGA
#define KVC_CAM_FRAME_WIDTH 640
#define KVC_CAM_FRAME_HEIGHT 480

// Quality 0..63, NHỎ hơn = nét hơn = file to hơn = truyền lâu hơn
// (`ov3660.c:413-422` ghi thẳng qs & 0x3f vào COMPRESSION_CTRL07).
//
// b1.5.2: q22 -> q26 để tăng biên an toàn dưới trần buffer 5744 byte.
//
// VÌ SAO ĐỔI: đo q22 trên bo thật cho thấy `bytes` phụ thuộc nội dung cảnh và
// dao động 3886-7206 byte; 13/66 cửa sổ (20%) vượt trần 5744, cao nhất 7206
// (vượt 1462 byte). Khi vượt trần, `tx` dội lên 2360 ms và `fps` rơi còn 0,79.
// q26 nén mạnh hơn nên khung nhỏ hơn, kỳ vọng đưa cả cảnh nhiều chi tiết xuống
// dưới trần.
//
// CHƯA ĐO: q26 là thay đổi theo hướng đúng nhưng CHƯA có số đo trên bo. Không
// được ghi "đã triệt tiêu" cho tới khi log 5 giây xác nhận `bytes` <= 5744 ở
// cảnh nhiều chi tiết. Tiêu chí nghiệm thu: `bytes` max <= 5744 và `tx` < 150 ms
// trong >= 30 phút soak, cả cảnh thường lẫn cảnh nhiều chi tiết.
//
// Đánh đổi: q26 nén mạnh hơn nên ảnh mất chi tiết hơn q22 (block JPEG rõ hơn ở
// vùng phẳng). Với camera quan sát cứu nạn, ưu tiên stream không đứng.
#define KVC_CAM_JPEG_QUALITY 26

// PHẢI là 3. Đo trên bo thật 03/11/2026: fb_count = 2 làm stream rơi từ
// 10–20 FPS xuống ~0,4 FPS. Driver esp32-camera tạo queue framebuffer dài
// `fb_count - 1` khi dùng CAMERA_GRAB_LATEST (cam_hal.c:400-403). Với 2 buffer,
// queue chỉ còn 1 slot: trong lúc handler đang giữ 1 framebuffer để gửi TCP,
// DMA hết buffer trống nên cam_start_frame() thất bại, driver gọi ll_cam_stop()
// và về CAM_STATE_IDLE (cam_hal.c:77-88, 218-220) — DVP dừng và phải chờ VSYNC
// khởi động lại MỖI KHUNG.
//
// Muốn giảm độ trễ thì giảm jpeg_quality hoặc độ phân giải, KHÔNG hạ fb_count.
#define KVC_CAM_FB_COUNT_PSRAM 3
#define KVC_CAM_FB_COUNT_NO_PSRAM 1

// Trần an toàn phía firmware. Lưu ý driver đã tự giới hạn mỗi khung ở
// recv_size = width*height/5 = 61440 byte (Kconfig JPEG_MODE_FRAME_SIZE_AUTO),
// nên khung vượt 60 KiB sẽ bị chính driver bỏ (log "FB-OVF") trước khi tới đây.
#define KVC_MAX_JPEG_BYTES (160 * 1024)

// Hiệu chỉnh hình ảnh cho OV3660.
// - BRIGHTNESS -3..3
// - AE_LEVEL -5..5: MỤC TIÊU SÁNG của AEC (`ov3660.c:620-650` ghi vào các
//   thanh ghi target 0x3a0f/0x3a10/0x3a1b/0x3a1e). Âm hơn = ảnh tối hơn,
//   exposure ngắn hơn, gain cao hơn.
//
//   SỬA LẠI MỘT HIỂU NHẦM: AE_LEVEL KHÔNG làm tăng FPS. Với rolling shutter,
//   phơi sáng tối đa bằng một chu kỳ khung; AEC chỉ điều tiết trong giới hạn
//   đó. Khi AEC2 = 0, VTS cố định nên FPS cố định, không phụ thuộc AE_LEVEL.
//   Lợi ích THẬT của AE_LEVEL âm là giảm nhoè chuyển động (exposure ngắn hơn)
//   và giảm trễ tích luỹ, đổi lại ảnh tối và nhiễu hơn.
//
//   Bằng chứng từ log bo thật: `wait=0ms` ở mọi cửa sổ nghĩa là esp_camera_fb_get()
//   luôn có khung sẵn — cảm biến không hề bị chậm vì phơi sáng dài. Nút thắt
//   FPS nằm ở TCP, không ở màn trập.
// - GAINCEILING_RAW: driver ov3660.c ghi trực tiếp số 10-bit Q4 vào 0x3A18/0x3A19
//   (16=1X, 248=15.5X, 511=32X, 1023=64X). Đặt cao để AEC ưu tiên tăng gain
//   thay vì kéo dài phơi sáng — đổi gain không làm giảm FPS.
// - AEC2: 0 = tắt night mode. Night mode cho phép tăng VTS (giảm FPS) để lấy
//   sáng, nên đây LÀ công tắc FPS thật của cảm biến.
// - DENOISE: 0 = tắt lọc nhiễu phần cứng (tránh bệt màu, nhòe chi tiết).
// - SHARPNESS: -3..3
#define KVC_CAM_BRIGHTNESS 0
#define KVC_CAM_AE_LEVEL -2
#define KVC_CAM_GAINCEILING_RAW 511
#define KVC_CAM_AEC2 0
#define KVC_CAM_DENOISE 0
#define KVC_CAM_SHARPNESS 2

// ===========================================================================
// 4. HTTP server (IF-05)
// ===========================================================================

#define KVC_HTTP_PORT 81
#define KVC_STREAM_BOUNDARY "123456789000000000000987654321"

// esp_http_server giới hạn cứng 7 socket; 6 chừa 1 cho /status khi stream kín.
#define KVC_HTTP_MAX_SOCKETS 6
#define KVC_HTTP_STACK_SIZE 8192

#define KVC_HTTP_SEND_TIMEOUT_S 10
#define KVC_HTTP_RECV_TIMEOUT_S 10

// TCP_NODELAY trên socket của client /stream.
//
// 0 = để Nagle hoạt động (mặc định). Các mảnh của một khung được gộp lại.
// 1 = tắt Nagle: khung đi ngay, nhưng mỗi khung vẫn phát sinh nhiều lời gọi
//     send() (dòng kích thước chunk + payload + CRLF), nên đẩy nhiều gói nhỏ
//     ra ngay và có thể va delayed-ACK của Windows.
//
// Lịch sử đo trên bo thật 03/11/2026: với b1.0.0 (gửi 2 chunk, ~6 send/khung)
// thì bật NODELAY làm FPS TỆ HƠN. Từ b1.1.0 đã gộp còn 1 chunk (~3 send/khung),
// nên giả thuyết "tx ≈ 300 ms khớp chu kỳ delayed-ACK 200 ms" cần được đo lại
// với giá trị 1. Đây là công tắc để làm thí nghiệm A/B đó, KHÔNG phải tối ưu
// đã được chứng minh.
#define KVC_HTTP_TCP_NODELAY 1

// Chờ khoá camera tối đa trước khi bỏ một lượt (không chặn client khác).
#define KVC_CAM_LOCK_TIMEOUT_MS 2000

// Nghỉ giữa hai lần thử lấy khung khi driver trả NULL.
#define KVC_STREAM_RETRY_MS 20

// ===========================================================================
// 5. Wi-Fi — chuẩn H3: STA thuần
//
// 0 = STA vào hotspot 2.4 GHz của laptop/router, credential từ
//     `include/wifi_secrets.h` (đã gitignore). Đây là chế độ vận hành: laptop
//     một card Wi-Fi vừa nhận telemetry gateway vừa xem video.
// 1 = SoftAP riêng 192.168.5.1/24, CHỈ để bring-up module một mình. Khi bật,
//     laptop phải đổi mạng và mất telemetry 192.168.4.x.
// ===========================================================================

#define KVC_WIFI_USE_SOFTAP 0

#define KVC_AP_SSID "KVC-S3CAM"
#define KVC_AP_PASSWORD "12345678"
#define KVC_AP_CHANNEL 1
#define KVC_AP_IP IPAddress(192, 168, 5, 1)
#define KVC_AP_GATEWAY IPAddress(192, 168, 5, 1)
#define KVC_AP_SUBNET IPAddress(255, 255, 255, 0)

// IP tĩnh cho STA. Mặc định TẮT (dùng DHCP). Bật khi backend cần URL cố định
// thay vì phụ thuộc mDNS; chọn địa chỉ NGOÀI dải DHCP cấp phát của hotspot.
#define KVC_STA_USE_STATIC_IP 0
#define KVC_STA_IP IPAddress(192, 168, 4, 50)
#define KVC_STA_GATEWAY IPAddress(192, 168, 4, 1)
#define KVC_STA_SUBNET IPAddress(255, 255, 255, 0)
#define KVC_STA_DNS IPAddress(192, 168, 4, 1)

// Credential: file `wifi_secrets.h` (gitignore) hoặc build flag -D.
// Nếu build flag đã định nghĩa KVC_WIFI_SSID thì không include file cục bộ.
#if !defined(KVC_WIFI_SSID) && __has_include("wifi_secrets.h")
#include "wifi_secrets.h"
#endif

#ifndef KVC_WIFI_SSID
#define KVC_WIFI_SSID ""
#define KVC_WIFI_PASSWORD ""
#endif

#define KVC_HOSTNAME "kvc-s3cam"
#define KVC_MDNS_NAME "kvc-s3cam"

#define KVC_WIFI_RETRY_MIN_MS 2000
#define KVC_WIFI_RETRY_MAX_MS 30000
#define KVC_WIFI_CHECK_PERIOD_MS 1000

// ===========================================================================
// 6. Giám sát sức khoẻ
// ===========================================================================

// Chỉ có hiệu lực khi ĐANG có client xem. Không có client thì không gọi
// esp_camera_fb_get(), nên mọi bộ đếm stall đều vô nghĩa.
#define KVC_CAM_STALL_RESTART_MS 10000
#define KVC_CAM_RESTART_MAX_BACKOFF_MS 120000

#define KVC_LOG_PERIOD_MS 5000

// ===========================================================================
// 7. Khoá lúc biên dịch
// ===========================================================================

static_assert(KVC_CAM_JPEG_QUALITY >= 0 && KVC_CAM_JPEG_QUALITY <= 63,
              "jpeg_quality phai trong 0..63");
static_assert(KVC_CAM_FB_COUNT_PSRAM >= 2,
              "fb_count < 2 lam driver dung DVP moi khung (da do: 0.4 FPS)");
static_assert(KVC_MAX_JPEG_BYTES > 0 && KVC_MAX_JPEG_BYTES < (512 * 1024),
              "KVC_MAX_JPEG_BYTES phai nho hon _MAX_FRAME_BYTES cua backend");
static_assert(KVC_HTTP_PORT > 0 && KVC_HTTP_PORT < 65536, "cong HTTP khong hop le");
// Danh sách cặp độ phân giải được phép. Việc khoá lại để không chọn một
// framesize mà driver OV3660 không hỗ trợ ở chế độ JPEG (sẽ init lỗi hoặc ra
// ảnh sai kích thước mà không báo).
#define KVC_CAM_IS_RES_320x240 \
    (KVC_CAM_FRAME_SIZE == FRAMESIZE_QVGA && KVC_CAM_FRAME_WIDTH == 320 && KVC_CAM_FRAME_HEIGHT == 240)
#define KVC_CAM_IS_RES_400x296 \
    (KVC_CAM_FRAME_SIZE == FRAMESIZE_CIF && KVC_CAM_FRAME_WIDTH == 400 && KVC_CAM_FRAME_HEIGHT == 296)
#define KVC_CAM_IS_RES_480x320 \
    (KVC_CAM_FRAME_SIZE == FRAMESIZE_HVGA && KVC_CAM_FRAME_WIDTH == 480 && KVC_CAM_FRAME_HEIGHT == 320)
#define KVC_CAM_IS_RES_640x480 \
    (KVC_CAM_FRAME_SIZE == FRAMESIZE_VGA && KVC_CAM_FRAME_WIDTH == 640 && KVC_CAM_FRAME_HEIGHT == 480)
#define KVC_CAM_IS_RES_800x600 \
    (KVC_CAM_FRAME_SIZE == FRAMESIZE_SVGA && KVC_CAM_FRAME_WIDTH == 800 && KVC_CAM_FRAME_HEIGHT == 600)

static_assert(KVC_CAM_IS_RES_320x240 || KVC_CAM_IS_RES_400x296 ||
                  KVC_CAM_IS_RES_480x320 || KVC_CAM_IS_RES_640x480 ||
                  KVC_CAM_IS_RES_800x600,
              "FRAME_SIZE/WIDTH/HEIGHT phai la mot cap hop le: "
              "QVGA 320x240, CIF 400x296, HVGA 480x320, VGA 640x480, SVGA 800x600");
static_assert(KVC_CAM_BRIGHTNESS >= -3 && KVC_CAM_BRIGHTNESS <= 3,
              "brightness phai trong -3..3");
static_assert(KVC_CAM_AE_LEVEL >= -5 && KVC_CAM_AE_LEVEL <= 5,
              "ae_level phai trong -5..5");
static_assert(KVC_CAM_SHARPNESS >= -3 && KVC_CAM_SHARPNESS <= 3,
              "sharpness phai trong -3..3");
static_assert(KVC_CAM_GAINCEILING_RAW >= 16 && KVC_CAM_GAINCEILING_RAW <= 1023,
              "gainceiling_raw phai trong 16..1023");
static_assert(KVC_CAM_LOCK_TIMEOUT_MS > 0 && KVC_CAM_LOCK_TIMEOUT_MS < 10000,
              "lock timeout phai hop ly");
