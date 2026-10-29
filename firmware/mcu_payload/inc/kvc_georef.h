/**
 * @file kvc_georef.h
 * @brief Chiếu BBox ảnh xuống mặt nước để ra toạ độ mục tiêu (georeferencing).
 *
 * TÁCH RIÊNG KHỎI main.c (KVC-MCU-GEO-001):
 * Trước đây toàn bộ phép tính này nằm trong `main()` và đọc trực tiếp biến cục
 * bộ + gói telemetry, nên KHÔNG có host test nào chạm tới — dù đây là phép tính
 * quyết định marker cứu nạn nằm ở đâu trên bản đồ. File này chỉ phụ thuộc
 * `<stdint.h>`/`<stdbool.h>` và `kvc_geo_math.h`, nên `tests/test_kvc_georef.c`
 * biên dịch và kiểm thử được bằng gcc trên PC.
 *
 * PHẠM VI TRÁCH NHIỆM: chỉ trả về KẾT QUẢ SỐ HỌC. Không đụng telemetry, không
 * đụng cờ IF-02, không gọi driver. Người gọi (main.c) tự quyết định gán vào gói
 * tin và bật/tắt `KVC_FLAG_AI_DETECTED`.
 *
 * ============================================================================
 * QUY TẮC VALIDITY (sửa finding P1 mà cả 3 review độc lập đều nêu)
 * ============================================================================
 * Trước 29/10/2026, khi không có Yaw hợp lệ, main.c gán `yaw_deg10 = 0` (Bắc)
 * rồi VẪN tính và phát `target_lat/lon`. Hệ quả: backend
 * (`gcs/backend/esp32_ingress.py`) thấy GNSS valid + siêu âm valid + lat/lon
 * khác 0 nên đánh dấu `pos_valid=True` và vẽ marker cứu nạn ở vị trí sai đúng
 * bằng góc xoay của UAV. Nay:
 *
 *   - Thiếu Yaw  -> `KVC_GEO_POS_NONE`: toàn bộ toạ độ = 0. Cờ AI_DETECTED
 *     vẫn được giữ ở tầng main.c, nên trạm đất biết "có phát hiện" mà KHÔNG
 *     nhận được toạ độ giả.
 *   - Thiếu GNSS -> `KVC_GEO_POS_NONE`: không có mốc để cộng offset.
 *   - Thiếu cự ly siêu âm (hoặc ngoài 20..800 cm) -> `KVC_GEO_POS_UAV_ONLY`:
 *     giữ nguyên vị trí UAV (hành vi cũ, backend vẫn coi target là chưa định
 *     vị), không bịa offset.
 *   - Đủ cả ba -> `KVC_GEO_POS_COMPUTED`.
 *
 * ĐÁNH ĐỔI ĐÃ BIẾT của `KVC_GEO_POS_NONE`: `esp32_ingress.py` suy ra vị trí UAV
 * từ `target_lat/lon` trừ `x/y_local`; khi toạ độ = 0 thì `uav_gps = None` và
 * dashboard mất marker UAV trong đúng trạng thái "phát hiện nhưng chưa định vị".
 * Muốn vừa giữ marker UAV vừa tách target validity cần thêm bit
 * `TARGET_POS_VALID` vào byte 24 (IF-02) — thay đổi ba đầu, chưa thực hiện.
 *
 * ============================================================================
 * GIỚI HẠN CỦA MÔ HÌNH (không phải bug, nhưng không được quên)
 * ============================================================================
 *   - Chưa bù Roll/Pitch: giả định camera nhìn thẳng xuống (nadir). Khi UAV
 *     nghiêng, sai số tăng theo `h·tan(tilt)`.
 *   - Chưa có intrinsics hiệu chuẩn: `fx = 554 px` suy từ HFOV ~60°, tâm 320×240
 *     danh định. Không undistort.
 *   - Chưa có extrinsic camera→body: Yaw lấy từ GNSS course-over-ground, là
 *     hướng CHUYỂN ĐỘNG chứ không phải hướng camera.
 *   - `m_per_deg_lon` phụ thuộc vĩ độ; giá trị mặc định ứng với ~16° Bắc. Dùng
 *     `kvc_geo_config_for_latitude()` khi triển khai ở vĩ độ khác.
 * Vì vậy kết quả chỉ là georef XẤP XỈ, chưa đủ nghiệm thu độ chính xác cứu nạn.
 *
 * Người phụ trách: Nguyễn Tá Duy Phong
 */

#ifndef KVC_GEOREF_H
#define KVC_GEOREF_H

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/* ============================================================================
 * 1. CẤU HÌNH CAMERA VÀ HỆ SỐ QUY ĐỔI ĐỊA LÝ
 * ============================================================================ */

/**
 * @brief Tham số camera + hệ số mét→độ. Cho phép thay bằng giá trị hiệu chuẩn
 *        mà không phải sửa công thức.
 *
 * Dùng `float` để giữ NGUYÊN kết quả số học của bản cũ trên nhánh có Yaw:
 * mọi giá trị mặc định dưới đây trùng đúng hằng số đã hard-code trước 29/10
 * (554.0, 320.0, 240.0, 89.977, 93.633). Đổi sang fixed-point sẽ làm lệch
 * kết quả một vài LSB — không cần thiết khi Cortex-M4F đã có FPU.
 */
typedef struct {
    float fx_px;      /**< Tiêu cự theo pixel. Mặc định 554.0 (HFOV ~60° @640px). */
    float cx_px;      /**< Tâm quang học X, pixel. Mặc định 320.0. */
    float cy_px;      /**< Tâm quang học Y, pixel. Mặc định 240.0. */
    float deg7_per_m_lat; /**< Độ vĩ (×10^7) trên 1 mét. Mặc định 89.977. */
    float deg7_per_m_lon; /**< Độ kinh (×10^7) trên 1 mét. Mặc định 93.633 (~16° Bắc). */
} KvcGeoConfig;

/* Dải cự ly siêu âm được phép dùng cho georef (cm). Khớp IF-00 §3.1. */
#define KVC_GEO_ALT_MIN_CM   20U
#define KVC_GEO_ALT_MAX_CM   800U

/**
 * @brief Điền cấu hình mặc định (giá trị danh định, chưa hiệu chuẩn).
 * @param cfg Con trỏ nhận cấu hình; NULL được bỏ qua.
 */
void kvc_geo_config_default(KvcGeoConfig *cfg);

/**
 * @brief Điền cấu hình mặc định nhưng tính lại hệ số kinh độ theo vĩ độ.
 *
 * VÌ SAO CẦN: 1 mét theo hướng Đông ứng với `1 / (111139 · cos(lat))` độ, nên
 * dùng hằng số 93.633 ở vĩ độ 45° sẽ sai ~40 %. Hàm này dùng bảng sin/cos số
 * nguyên của `kvc_geo_math` (không kéo libm) để suy ra hệ số đúng.
 *
 * @param cfg      Con trỏ nhận cấu hình; NULL được bỏ qua.
 * @param lat_deg7 Vĩ độ UAV (WGS-84 ×10^7). Giá trị ngoài ±90° bị kẹp.
 */
void kvc_geo_config_for_latitude(KvcGeoConfig *cfg, int32_t lat_deg7);

/* ============================================================================
 * 2. ĐẦU VÀO / ĐẦU RA
 * ============================================================================ */

/** Đầu vào của một lần chiếu. Mọi trường đều do người gọi điền từ telemetry.
 *
 * THỨ TỰ TRƯỜNG: xếp giảm dần theo kích thước/căn lệnh rồi gộp cờ về cuối để
 * KHÔNG sinh padding. Dự án build với `-Wpadded` và coi cảnh báo mới là nợ kỹ
 * thuật (xem `KvcM3Snapshot` trong main.c). `pad0` là đệm tường minh để tổng
 * kích thước chia hết cho 4. */
typedef struct {
    int32_t  uav_lat_deg7;    /**< Vĩ độ UAV ×10^7. */
    int32_t  uav_lon_deg7;    /**< Kinh độ UAV ×10^7. */
    uint16_t alt_cm;          /**< Cự ly tới mặt nước (cm). */
    uint16_t yaw_deg10;       /**< Yaw 0,1° theo chiều kim đồng hồ từ Bắc. */
    uint16_t bbox_x_center;   /**< Tâm X của BBox trên ảnh (pixel). */
    uint16_t bbox_y_center;   /**< Tâm Y của BBox trên ảnh (pixel). */
    bool     gnss_valid;      /**< UAV có vị trí GNSS 3D fix hợp lệ. */
    bool     alt_valid;       /**< Cự ly siêu âm hợp lệ trong chu kỳ này. */
    bool     yaw_valid;       /**< Yaw đáng tin (RMC 'A', ≤3 s, ≥0,5 knot). */
    uint8_t  pad0;            /**< Đệm tường minh, tránh -Wpadded. */
} KvcGeoInput;

/**
 * @brief Loại kết quả — quyết định cách người gọi gán vào gói tin.
 *
 * Thứ tự quan trọng: chỉ `KVC_GEO_POS_COMPUTED` mới được coi là có toạ độ
 * mục tiêu thật. Hai loại còn lại KHÔNG được dùng làm marker cứu nạn.
 */
typedef enum {
    KVC_GEO_POS_COMPUTED = 0, /**< Có toạ độ mục tiêu tính từ BBox. */
    KVC_GEO_POS_UAV_ONLY,     /**< Giữ vị trí UAV, không có offset mục tiêu. */
    KVC_GEO_POS_NONE          /**< Không công bố toạ độ (0,0). */
} KvcGeoPosKind;

/** Kết quả chiếu.
 *
 * THỨ TỰ TRƯỜNG: cùng lý do như `KvcGeoInput` — trường 32-bit trước, 16-bit
 * sau, enum về cuối để tránh padding dưới `-Wpadded`. `pad0` giữ tổng kích
 * thước chia hết cho 4. */
typedef struct {
    int32_t       lat_deg7;       /**< Vĩ độ mục tiêu ×10^7 (0 nếu NONE). */
    int32_t       lon_deg7;       /**< Kinh độ mục tiêu ×10^7 (0 nếu NONE). */
    int32_t       east_mm;        /**< Offset Đông (mm) — chẩn đoán/log. */
    int32_t       north_mm;       /**< Offset Bắc (mm) — chẩn đoán/log. */
    int16_t       x_local_cm;     /**< Offset Đông so với UAV (cm). */
    int16_t       y_local_cm;     /**< Offset Bắc so với UAV (cm). */
    KvcGeoPosKind kind;           /**< Loại kết quả, xem enum ở trên. */
    uint8_t       pad0[3];        /**< Đệm tường minh, tránh -Wpadded. */
} KvcGeoResult;

/* ============================================================================
 * 3. API
 * ============================================================================ */

/**
 * @brief Chiếu tâm BBox xuống mặt nước và cộng vào vị trí UAV.
 *
 * Hàm THUẦN: không đọc trạng thái toàn cục, không gọi driver, không cấp phát.
 *
 * @param in  Đầu vào; NULL -> trả `KVC_GEO_POS_NONE` toàn 0.
 * @param cfg Cấu hình camera/hệ số; NULL -> dùng cấu hình mặc định.
 * @return Kết quả; luôn được khởi tạo đầy đủ kể cả khi lỗi tham số.
 */
KvcGeoResult kvc_georef_target(const KvcGeoInput *in, const KvcGeoConfig *cfg);

#ifdef __cplusplus
}
#endif

#endif /* KVC_GEOREF_H */
