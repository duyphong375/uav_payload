/**
 * @file kvc_imu_gy87.h
 * @brief Driver đọc dữ liệu tư thế góc nghiêng (Roll, Pitch) từ cảm biến IMU GY-87 (MPU-6050) qua bus I2C0 cho MCU Sonix SN34F788.
 *
 * Sơ đồ đấu nối phần cứng theo docs/hardware/wiring/KVC_MASTER_PINOUT_WIRING.md (Mục 3.3):
 * - VCC  -> 3.3V (Cọc nguồn J6 trên kit Sonix)
 * - GND  -> VSS/GND (Cọc J5 trên kit Sonix)
 * - SCL  -> P0.10 (Pin 38 - JP1 Pin 7/8, trên kit đã có sẵn trở pull-up R3 = 1 kΩ lên 3.3V)
 * - SDA  -> P0.11 (Pin 39 - JP1 Pin 9/10, trên kit đã có sẵn trở pull-up R4 = 1 kΩ lên 3.3V)
 *
 * Người phụ trách: Nguyễn Tá Duy Phong
 */

#ifndef KVC_IMU_GY87_H
#define KVC_IMU_GY87_H

#include <stdint.h>
#include <stdbool.h>
#include <math.h>
#include "SN34F780.h"
#include "kvc_pinout.h"

#ifdef __cplusplus
extern "C" {
#endif

/* ============================================================================
 * ĐỊA CHỈ I2C VÀ THANH GHI MPU-6050
 * ============================================================================ */
#define MPU6050_ADDR_DEFAULT        0x68U  /* Khi chân AD0 kéo xuống GND (Mặc định trên GY-87) */
#define MPU6050_ADDR_ALT            0x69U  /* Khi chân AD0 kéo lên 3.3V */
/* Register 117 (WHO_AM_I) trả về giá trị CỐ ĐỊNH 0x68 trên MPU-60X0.
 * Nguồn: RM-MPU-6000A-00 §4.34 ("Register 117: 0x68"), xem docs/hardware/sensors/. */
#define MPU6050_WHO_AM_I_VALUE      0x68U

#define MPU6050_REG_SMPLRT_DIV      0x19U
#define MPU6050_REG_CONFIG          0x1AU
#define MPU6050_REG_GYRO_CONFIG     0x1BU
#define MPU6050_REG_ACCEL_CONFIG    0x1CU
#define MPU6050_REG_ACCEL_XOUT_H    0x3BU
#define MPU6050_REG_PWR_MGMT_1      0x6BU
#define MPU6050_REG_WHO_AM_I        0x75U

/* ============================================================================
 * MÃ TRẠNG THÁI KHỞI TẠO CẢM BIẾN MPU-6050
 * ============================================================================ */
#define MPU6050_ERR_OK              0U  /* Nhận diện và đánh thức MPU-6050 thành công */
#define MPU6050_ERR_BUS_STUCK       1U  /* Chân SDA hoặc SCL bị chập mass (mức 0V liên tục) */
#define MPU6050_ERR_NO_ACK          2U  /* Cả địa chỉ 0x68 và 0x69 đều không phản hồi ACK */
#define MPU6050_ERR_WHO_AM_I        3U  /* Có ACK nhưng WHO_AM_I != 0x68 (không phải MPU-60X0) */
#define MPU6050_ERR_WAKEUP_FAIL     4U  /* Ghi lệnh đánh thức PWR_MGMT_1 thất bại */

/* ============================================================================
 * ĐIỀU KHIỂN CHÂN I2C0: SCL PUSH-PULL, SDA OPEN-DRAIN CÓ PULL-UP NỘI
 * ============================================================================ */
static inline void kvc_imu_i2c_delay(void) {
    /* Độ trễ nửa chu kỳ I2C bằng vòng lặp NOP.
     *
     * TÍNH TOÁN (suy ra từ tần số và số chu kỳ, KHÔNG phải phép đo trên kit):
     * - HCLK thực tế là 12 MHz (uvprojx CLOCK(12000000), SystemInit không bật
     *   PLL -> SYSCLK = IHRC 12 MHz). Bản trước ghi "48 MHz" là SAI.
     * - Vòng `for (volatile int d...)` với biến volatile tốn ~3-4 chu kỳ mỗi
     *   lần lặp trên Cortex-M4 (load/so sánh/nhảy + store do volatile).
     * - 80 x 3 chu kỳ / 12 MHz = 20 us cho mỗi lần gọi.
     *
     * Mỗi bit I2C cần 2 lần gọi (mức thấp rồi mức cao) -> ~40 us/bit ->
     * SCL ~25 kHz. Con số 25 kHz là ƯỚC LƯỢNG, chưa đo bằng oscilloscope.
     *
     * Vì sao vẫn giữ 80: MPU-6050 chấp nhận 100-400 kHz và KHÔNG có mức tối
     * thiểu, nên 25 kHz hoạt động đúng, chỉ chậm hơn cần thiết. Đọc 14 byte
     * mất ~5 ms mỗi chu kỳ 1 s (<0,5 % CPU). Muốn 100 kHz phải xác định chính
     * xác số chu kỳ mỗi vòng lặp trên kit (đo), rồi giảm hằng số 80 xuống ~20;
     * không nên chỉnh mù vì I2C quá nhanh sẽ hỏng bus nếu trở kéo yếu. */
    for (volatile int d = 0; d < 80; d++) {
        __NOP();
    }
}

static inline void kvc_imu_scl_low(void) {
    SN_GPIO0->BCLR = (1U << KVC_PIN_IMU_SCL_PIN);
    SN_GPIO0->DIR |= (1U << KVC_PIN_IMU_SCL_PIN); /* Output mức 0V */
}

static inline void kvc_imu_scl_high(void) {
    /* SCL được MCU chủ động kéo lên 3.3V (Push-Pull) giúp xung vuông sắc nét */
    SN_GPIO0->BSET = (1U << KVC_PIN_IMU_SCL_PIN);
    SN_GPIO0->DIR |= (1U << KVC_PIN_IMU_SCL_PIN); /* Output mức 3.3V */
}

static inline void kvc_imu_sda_low(void) {
    SN_GPIO0->BCLR = (1U << KVC_PIN_IMU_SDA_PIN);
    SN_GPIO0->DIR |= (1U << KVC_PIN_IMU_SDA_PIN); /* Kéo SDA xuống 0V */
}

static inline void kvc_imu_sda_high(void) {
    /* Nhả chân SDA về Input để trở kéo (R4 hoặc Pull-up nội MCU) kéo lên 3.3V */
    SN_GPIO0->DIR &= ~(1U << KVC_PIN_IMU_SDA_PIN);
}

static inline uint8_t kvc_imu_sda_read(void) {
    return (SN_GPIO0->DATAIN & (1U << KVC_PIN_IMU_SDA_PIN)) ? 1U : 0U;
}

/* ============================================================================
 * CÁC HÀM CƠ BẢN CỦA BUS I2C
 * ============================================================================ */
static void kvc_i2c_start(void) {
    kvc_imu_sda_high();
    kvc_imu_scl_high();
    kvc_imu_i2c_delay();
    kvc_imu_sda_low();
    kvc_imu_i2c_delay();
    kvc_imu_scl_low();
    kvc_imu_i2c_delay();
}

static void kvc_i2c_stop(void) {
    kvc_imu_sda_low();
    kvc_imu_i2c_delay();
    kvc_imu_scl_high();
    kvc_imu_i2c_delay();
    kvc_imu_sda_high();
    kvc_imu_i2c_delay();
}

static uint8_t kvc_i2c_write_byte(uint8_t data) {
    for (int i = 7; i >= 0; i--) {
        if ((data >> i) & 1U) {
            kvc_imu_sda_high();
        } else {
            kvc_imu_sda_low();
        }
        kvc_imu_i2c_delay();
        kvc_imu_scl_high();
        kvc_imu_i2c_delay();
        kvc_imu_scl_low();
        kvc_imu_i2c_delay();
    }
    
    /* Đọc bit ACK phản hồi từ slave */
    kvc_imu_sda_high();
    kvc_imu_i2c_delay();
    kvc_imu_scl_high();
    kvc_imu_i2c_delay();
    uint8_t ack = kvc_imu_sda_read(); /* 0 = ACK, 1 = NACK */
    kvc_imu_scl_low();
    kvc_imu_i2c_delay();
    return (ack == 0U);
}

static uint8_t kvc_i2c_read_byte(uint8_t send_ack) {
    uint8_t data = 0;
    kvc_imu_sda_high();
    for (int i = 7; i >= 0; i--) {
        kvc_imu_scl_high();
        kvc_imu_i2c_delay();
        if (kvc_imu_sda_read()) {
            data |= (1U << i);
        }
        kvc_imu_scl_low();
        kvc_imu_i2c_delay();
    }
    
    /* Gửi bit ACK hoặc NACK phản hồi */
    if (send_ack) {
        kvc_imu_sda_low();
    } else {
        kvc_imu_sda_high();
    }
    kvc_imu_i2c_delay();
    kvc_imu_scl_high();
    kvc_imu_i2c_delay();
    kvc_imu_scl_low();
    kvc_imu_i2c_delay();
    kvc_imu_sda_high();
    return data;
}

/* ============================================================================
 * GIAO TIẾP VỚI MPU-6050
 * ============================================================================ */
static uint8_t mpu6050_write_reg(uint8_t dev_addr, uint8_t reg, uint8_t val) {
    kvc_i2c_start();
    if (!kvc_i2c_write_byte((uint8_t)(((uint32_t)dev_addr << 1) | 0U))) {
        kvc_i2c_stop();
        return 0;
    }
    if (!kvc_i2c_write_byte(reg)) {
        kvc_i2c_stop();
        return 0;
    }
    if (!kvc_i2c_write_byte(val)) {
        kvc_i2c_stop();
        return 0;
    }
    kvc_i2c_stop();
    return 1;
}

static uint8_t mpu6050_read_reg(uint8_t dev_addr, uint8_t reg, uint8_t *val) {
    kvc_i2c_start();
    if (!kvc_i2c_write_byte((uint8_t)(((uint32_t)dev_addr << 1) | 0U))) {
        kvc_i2c_stop();
        return 0;
    }
    if (!kvc_i2c_write_byte(reg)) {
        kvc_i2c_stop();
        return 0;
    }
    kvc_i2c_start();
    if (!kvc_i2c_write_byte((uint8_t)(((uint32_t)dev_addr << 1) | 1U))) {
        kvc_i2c_stop();
        return 0;
    }
    *val = kvc_i2c_read_byte(0); /* NACK để kết thúc đọc 1 byte */
    kvc_i2c_stop();
    return 1;
}

/**
 * @brief Khởi tạo cảm biến MPU-6050 trên module GY-87
 * @param active_addr Con trỏ nhận địa chỉ I2C tìm thấy (0x68 hoặc 0x69)
 * @return MPU6050_ERR_OK (0) nếu thành công, hoặc mã lỗi > 0 nếu có sự cố
 */
static uint8_t mpu6050_init(uint8_t *active_addr) {
    /* 1. Bật xung nhịp APB1 cho GPIO Port 0 (Chân P0.10 SCL, P0.11 SDA) */
    SN_SCU->APB1CLKG |= (1U << 17);

    /* 2. Cấu hình Pin Mux: Đảm bảo P0.10 và P0.11 hoạt động ở chế độ GPIO */
    SN_ALWAYSON->P0_AFIO1 &= ~((0x1FU << 20) | (0x1FU << 25));

    /* 3. Kích hoạt điện trở Pull-up nội trên cả 2 chân SCL và SDA (phòng khi thiếu trở ngoài) */
    SN_GPIO0->PUTYPE |= (1U << KVC_PIN_IMU_SCL_PIN) | (1U << KVC_PIN_IMU_SDA_PIN); /* 1 = Pull-Up */
    SN_GPIO0->PULLEN |= (1U << KVC_PIN_IMU_SCL_PIN) | (1U << KVC_PIN_IMU_SDA_PIN); /* 1 = Enable */

    /* 4. Đặt trạng thái ban đầu: SCL = HIGH, SDA = HIGH */
    kvc_imu_scl_high();
    kvc_imu_sda_high();
    kvc_imu_i2c_delay();

    /* 5. Trình tự giải phóng Bus I2C (I2C Bus Recovery: 9 xung SCL nếu SDA bị kẹt 0V) */
    if (kvc_imu_sda_read() == 0U) {
        for (int i = 0; i < 9; i++) {
            kvc_imu_scl_low();
            kvc_imu_i2c_delay();
            kvc_imu_scl_high();
            kvc_imu_i2c_delay();
        }
        kvc_i2c_stop();
        kvc_imu_i2c_delay();
        if (kvc_imu_sda_read() == 0U) {
            return MPU6050_ERR_BUS_STUCK; /* SDA vẫn bị kẹt ở mức 0V (chập mass hoặc nối sai chân) */
        }
    }

    /* 6. Nhận dạng chip qua WHO_AM_I (reg 117/0x75, giá trị cố định 0x68).
     *
     * So sánh ĐÚNG BẰNG 0x68 chứ không chỉ loại 0x00/0xFF: nhiều module GY-87
     * "clone" có thêm DS1307 (RTC, 0x68) hoặc AT24C32 (EEPROM, 0x57) trên cùng
     * bus. Nếu chỉ loại 0x00/0xFF, một chip khác cùng địa chỉ 0x68 sẽ được chấp
     * nhận nhầm và mọi lần đọc sau đó trả về rác mà không báo lỗi. */
    uint8_t who = 0;
    uint8_t addr = MPU6050_ADDR_DEFAULT;
    bool acked = false;
    bool found = false;

    if (mpu6050_read_reg(MPU6050_ADDR_DEFAULT, MPU6050_REG_WHO_AM_I, &who)) {
        acked = true;
        if (who == MPU6050_WHO_AM_I_VALUE) {
            addr = MPU6050_ADDR_DEFAULT;
            found = true;
        }
    }

    if (!found && mpu6050_read_reg(MPU6050_ADDR_ALT, MPU6050_REG_WHO_AM_I, &who)) {
        acked = true;
        if (who == MPU6050_WHO_AM_I_VALUE) {
            addr = MPU6050_ADDR_ALT;
            found = true;
        }
    }

    if (!found) {
        /* Có ACK nhưng ID sai -> chip khác cùng địa chỉ.
         * Không ACK ở cả 0x68 lẫn 0x69 -> MPU không phản hồi (mất nguồn/hỏng dây). */
        return acked ? MPU6050_ERR_WHO_AM_I : MPU6050_ERR_NO_ACK;
    }

    if (active_addr != 0) {
        *active_addr = addr;
    }

    /* 7. Đánh thức chip khỏi chế độ Sleep (PWR_MGMT_1 = 0x01: PLL tham chiếu Gyro X) */
    if (!mpu6050_write_reg(addr, MPU6050_REG_PWR_MGMT_1, 0x01)) {
        return MPU6050_ERR_WAKEUP_FAIL;
    }
    
    /* 8. Cấu hình thang đo: Gia tốc +/- 2g, Con quay +/- 250 dps */
    mpu6050_write_reg(addr, MPU6050_REG_SMPLRT_DIV, 0x07);   /* Tốc độ lấy mẫu 1 kHz / (1 + 7) = 125 Hz */
    mpu6050_write_reg(addr, MPU6050_REG_CONFIG, 0x03);       /* Bộ lọc thông thấp DLPF ~ 44 Hz */
    mpu6050_write_reg(addr, MPU6050_REG_GYRO_CONFIG, 0x00);  /* +/- 250 deg/s */
    mpu6050_write_reg(addr, MPU6050_REG_ACCEL_CONFIG, 0x00); /* +/- 2g */

    return MPU6050_ERR_OK;
}

/**
 * @brief Đọc 3 trục gia tốc thô từ MPU-6050
 */
static uint8_t mpu6050_read_accel_raw(uint8_t dev_addr, int16_t *ax, int16_t *ay, int16_t *az) {
    kvc_i2c_start();
    if (!kvc_i2c_write_byte((uint8_t)(((uint32_t)dev_addr << 1) | 0U))) {
        kvc_i2c_stop();
        return 0;
    }
    if (!kvc_i2c_write_byte(MPU6050_REG_ACCEL_XOUT_H)) {
        kvc_i2c_stop();
        return 0;
    }
    kvc_i2c_start();
    if (!kvc_i2c_write_byte((uint8_t)(((uint32_t)dev_addr << 1) | 1U))) {
        kvc_i2c_stop();
        return 0;
    }

    uint8_t xh = kvc_i2c_read_byte(1);
    uint8_t xl = kvc_i2c_read_byte(1);
    uint8_t yh = kvc_i2c_read_byte(1);
    uint8_t yl = kvc_i2c_read_byte(1);
    uint8_t zh = kvc_i2c_read_byte(1);
    uint8_t zl = kvc_i2c_read_byte(0); /* NACK byte cuối */
    kvc_i2c_stop();

    if (ax) *ax = (int16_t)((xh << 8) | xl);
    if (ay) *ay = (int16_t)((yh << 8) | yl);
    if (az) *az = (int16_t)((zh << 8) | zl);
    return 1;
}

/**
 * @brief Tính toán góc nghiêng Roll và Pitch (Đơn vị: 0.1 độ, ví dụ 152 là 15.2 độ)
 */
static uint8_t mpu6050_read_angles(uint8_t dev_addr, int16_t *roll_deg10, int16_t *pitch_deg10) {
    int16_t ax = 0, ay = 0, az = 0;
    if (!mpu6050_read_accel_raw(dev_addr, &ax, &ay, &az)) {
        return 0;
    }

    /* Kiểm tra tính hợp lệ của cảm biến gia tốc:
     * Trong trường trọng lực Trái Đất (1g ~ 16384 LSB tại dải +/-2g), tổng gia tốc không thể
     * đồng thời bằng 0 trên cả 3 trục. Nếu ax == ay == az == 0, chắc chắn đường truyền I2C
     * bị chập mass đọc toàn byte 0x00 hoặc cảm biến bị mất nguồn.
     */
    if (ax == 0 && ay == 0 && az == 0) {
        return 0;
    }

    float fax = (float)ax;
    float fay = (float)ay;
    float faz = (float)az;

    /* Roll = atan2(Y, Z) */
    float roll = atan2f(fay, faz) * 57.2957795f;
    /* Pitch = atan2(-X, sqrt(Y^2 + Z^2)) */
    float pitch = atan2f(-fax, sqrtf(fay * fay + faz * faz)) * 57.2957795f;

    if (roll_deg10)  *roll_deg10  = (int16_t)(roll * 10.0f);
    if (pitch_deg10) *pitch_deg10 = (int16_t)(pitch * 10.0f);
    return 1;
}

#ifdef __cplusplus
}
#endif

#endif /* KVC_IMU_GY87_H */
