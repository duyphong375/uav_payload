/**
 * @file kvc_geo_math.c
 * @brief Cài đặt lượng giác số nguyên cho georef.
 *
 * Bảng sin 0..90° bước 1°, nhân 10000, sinh bằng Python và kiểm bằng
 * `tests/test_kvc_geo_math.c`. Nội suy tuyến tính cho phần lẻ 0,1°.
 *
 * Người phụ trách: Nguyễn Tá Duy Phong
 */

#include "kvc_geo_math.h"

/* sin(k°) × 10000 với k = 0..90. sin(90°) = 10000 đúng tuyệt đối. */
static const int16_t k_sin_table_x10000[91] = {
        0,   175,   349,   523,   698,   872,  1045,  1219,  1392,  1564,
     1736,  1908,  2079,  2250,  2419,  2588,  2756,  2924,  3090,  3256,
     3420,  3584,  3746,  3907,  4067,  4226,  4384,  4540,  4695,  4848,
     5000,  5150,  5299,  5446,  5592,  5736,  5878,  6018,  6157,  6293,
     6428,  6561,  6691,  6820,  6947,  7071,  7193,  7314,  7431,  7547,
     7660,  7771,  7880,  7986,  8090,  8192,  8290,  8387,  8480,  8572,
     8660,  8746,  8829,  8910,  8988,  9063,  9135,  9205,  9272,  9336,
     9397,  9455,  9511,  9563,  9613,  9659,  9703,  9744,  9781,  9816,
     9848,  9877,  9903,  9925,  9945,  9962,  9976,  9986,  9994,  9998,
    10000
};

/**
 * @brief sin cho góc trong [0, 900] (0,1°) bằng nội suy bảng.
 *
 * Nhận 0,1° nhưng bảng chỉ có bước 1°, nên tách `deg10` thành phần độ nguyên
 * và phần lẻ 0,1° rồi nội suy tuyến tính giữa hai mốc.
 */
static int32_t sin_0_90_deg10(uint16_t deg10) {
    uint16_t deg_int  = (uint16_t)(deg10 / 10U);
    uint16_t frac10   = (uint16_t)(deg10 % 10U);

    if (deg_int > 90U) {
        deg_int = 90U;
        frac10  = 0U;
    }

    int32_t s0 = (int32_t)k_sin_table_x10000[deg_int];
    if (frac10 == 0U || deg_int >= 90U) {
        return s0;
    }
    int32_t s1 = (int32_t)k_sin_table_x10000[deg_int + 1U];
    return s0 + ((s1 - s0) * (int32_t)frac10) / 10;
}

int32_t kvc_geo_sin_deg10(uint16_t deg10) {
    uint16_t a = (uint16_t)(deg10 % 3600U);   /* chuẩn hoá 0..3599 */

    if (a <= 900U) {
        return sin_0_90_deg10(a);                       /* góc phần tư I */
    }
    if (a <= 1800U) {
        return sin_0_90_deg10((uint16_t)(1800U - a));   /* phần tư II */
    }
    if (a <= 2700U) {
        return -sin_0_90_deg10((uint16_t)(a - 1800U));  /* phần tư III */
    }
    return -sin_0_90_deg10((uint16_t)(3600U - a));      /* phần tư IV */
}

int32_t kvc_geo_cos_deg10(uint16_t deg10) {
    /* cos(a) = sin(a + 90°) */
    uint16_t shifted = (uint16_t)(((uint32_t)deg10 + 900UL) % 3600UL);
    return kvc_geo_sin_deg10(shifted);
}

void kvc_geo_rotate_to_ne(int32_t right_mm, int32_t forward_mm, uint16_t yaw_deg10,
                          int32_t *out_east_mm, int32_t *out_north_mm) {
    int32_t s = kvc_geo_sin_deg10(yaw_deg10);
    int32_t c = kvc_geo_cos_deg10(yaw_deg10);

    /* Nhân int32 với hằng số ×10000 rồi chia lại. Dùng int64 để không tràn:
     * |right_mm| có thể tới 500 000 mm (500 m) và 500000 × 10000 = 5e9 > 2^31. */
    int64_t east  = ((int64_t)right_mm * c + (int64_t)forward_mm * s) / 10000;
    int64_t north = ((int64_t)forward_mm * c - (int64_t)right_mm * s) / 10000;

    if (out_east_mm != 0) {
        *out_east_mm = (int32_t)east;
    }
    if (out_north_mm != 0) {
        *out_north_mm = (int32_t)north;
    }
}
