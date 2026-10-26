/**
 * @file kvc_pinout.h
 * @brief Định nghĩa cấu hình chân phần cứng toàn hệ thống KVC cho MCU Sonix SN34F788.
 * 
 * Đối chiếu tài liệu đặc tả chuẩn:
 * - docs/hardware/wiring/KVC_MASTER_PINOUT_WIRING.md
 * - docs/interfaces/IF_FPGA_MCU_UART.md (IF-01)
 * - docs/interfaces/IF_MCU_SENSORS.md
 * - docs/interfaces/IF_MCU_LORA_RF.md (IF-02)
 * - docs/hardware/mcu/CHIP_SONIX_SN34F788_MCU.md
 *
 * Người phụ trách: Nguyễn Tá Duy Phong
 */

#ifndef KVC_PINOUT_H
#define KVC_PINOUT_H

#include <stdint.h>
#include <stdbool.h>
#include "SN34F780.h"

#ifdef __cplusplus
extern "C" {
#endif

/* ============================================================================
 * 1. MODULE LORA RA-02 (SX1278 SPI0) - PHÁT TELEMETRY VỀ TRẠM MẶT ĐẤT
 * ============================================================================ */
#define KVC_PIN_LORA_NSS_PORT       SN_GPIO2
#define KVC_PIN_LORA_NSS_PIN        4       /* P2.4  - Pin 20 LQFP64 | JP3 Pin 9 hoặc 10 (SPI0_SEL0) */

#define KVC_PIN_LORA_SCK_PORT       SN_GPIO2
#define KVC_PIN_LORA_SCK_PIN        5       /* P2.5  - Pin 21 LQFP64 | JP3 Pin 11 hoặc 12 (SPI0_SCK0) */

#define KVC_PIN_LORA_MISO_PORT      SN_GPIO2
#define KVC_PIN_LORA_MISO_PIN       6       /* P2.6  - Pin 22 LQFP64 | JP3 Pin 13 hoặc 14 (SPI0_MI0) */

#define KVC_PIN_LORA_MOSI_PORT      SN_GPIO2
#define KVC_PIN_LORA_MOSI_PIN       7       /* P2.7  - Pin 23 LQFP64 | JP3 Pin 15 hoặc 16 (SPI0_MO0) */

#define KVC_PIN_LORA_DIO0_PORT      SN_GPIO2
#define KVC_PIN_LORA_DIO0_PIN       8       /* P2.8  - Pin 24 LQFP64 | JP3 Pin 17 hoặc 18 (EXTI Ngắt TxDone) */

#define KVC_PIN_LORA_RST_PORT       SN_GPIO2
#define KVC_PIN_LORA_RST_PIN        9       /* P2.9  - Pin 25 LQFP64 | JP3 Pin 19 hoặc 20 (Reset phần cứng) */

/* ============================================================================
 * 2. CẢM BIẾN SIÊU ÂM ĐO ĐỘ CAO MẶT NƯỚC (JSN-SR04T / AJ-SR04M)
 * ============================================================================ */
#define KVC_PIN_USOUND_TRIG_PORT    SN_GPIO2
#define KVC_PIN_USOUND_TRIG_PIN     14      /* P2.14 - Pin 30 LQFP64 | JP3 Pin 29 hoặc 30 (Xung Trigger 10µs) */

#define KVC_PIN_USOUND_ECHO_PORT    SN_GPIO2
#define KVC_PIN_USOUND_ECHO_PIN     15      /* P2.15 - Pin 31 LQFP64 | JP3 Pin 31 hoặc 32 (BẮT BUỘC QUA CẦU PHÂN ÁP 1k/2k) */

/* ============================================================================
 * 3. CỤM CẢM BIẾN TƯ THẾ GY-87 (I2C0, module 10-DOF)
 *
 * Firmware CHỈ dùng MPU-6050 (accel + gyro) trên bus này.
 *   - HMC5883L (0x1E/0x0D): HOÃN — cần hiệu chuẩn hard/soft iron bằng cách xoay
 *     UAV 360° trên kit thật. Dự kiến thay bằng Yaw từ GNSS track_made_good.
 *   - BMP180 (0x77): ĐÃ LOẠI khỏi thiết kế — AJ-SR04M đã đo cao độ trực tiếp và
 *     BMP180 có sai số ±1 m do biến động khí áp, không đủ cho georef.
 * Chi tiết: docs/interfaces/IF_MCU_SENSORS.md §3.2 B–C.
 *
 * Chân I2C0 giữ nguyên cho cả 3 chip vì chúng nằm sẵn trên module; bật lại sau
 * này không cần thay đổi phần cứng.
 * ============================================================================ */
#define KVC_PIN_IMU_SCL_PORT        SN_GPIO0
#define KVC_PIN_IMU_SCL_PIN         10      /* P0.10 - Pin 38 LQFP64 | JP1 Pin 7 hoặc 8 (I2C0 SCL 400kHz) */

#define KVC_PIN_IMU_SDA_PORT        SN_GPIO0
#define KVC_PIN_IMU_SDA_PIN         11      /* P0.11 - Pin 39 LQFP64 | JP1 Pin 9 hoặc 10 (I2C0 SDA 400kHz) */

/* ============================================================================
 * 4. MODULE ĐỊNH VỊ VỆ TINH NEO-M10N GNSS (UART3 - 9600 bps)
 * ============================================================================ */
#define KVC_PIN_GNSS_UTXD3_PORT     SN_GPIO2
#define KVC_PIN_GNSS_UTXD3_PIN      0       /* P2.0  - Pin 14 LQFP64 | JP3 Pin 1 hoặc 2 (UART3 TX sang RX module) */

#define KVC_PIN_GNSS_URXD3_PORT     SN_GPIO2
#define KVC_PIN_GNSS_URXD3_PIN      1       /* P2.1  - Pin 15 LQFP64 | JP3 Pin 3 hoặc 4 (UART3 RX từ TX module) */

/* ============================================================================
 * 5. GIAO TIẾP FPGA ONEKIWI PRIMER 20K (UART1 + EXTI - IF-01)
 * ============================================================================ */
#define KVC_PIN_FPGA_UTXD1_PORT     SN_GPIO2
#define KVC_PIN_FPGA_UTXD1_PIN      2       /* P2.2  - Pin 16 LQFP64 | JP3 Pin 5 hoặc 6 (TX sang FPGA T13 - J2 Pin 12) */

#define KVC_PIN_FPGA_URXD1_PORT     SN_GPIO2
#define KVC_PIN_FPGA_URXD1_PIN      3       /* P2.3  - Pin 17 LQFP64 | JP3 Pin 7 hoặc 8 (RX từ FPGA R13 - J2 Pin 11) */

#define KVC_PIN_FPGA_READY_PORT     SN_GPIO0
#define KVC_PIN_FPGA_READY_PIN      12      /* P0.12 - Pin 3  LQFP64 | JP1 Pin 11 hoặc 12 (EXTI từ FPGA R12 - J2 Pin 13) */

/* ============================================================================
 * 6. CỔNG NẠP & GỠ LỖI UART MONITOR RA MÁY TÍNH (UART5 - 115200 bps)
 * ============================================================================ */
#define KVC_PIN_DEBUG_URXD5_PORT    SN_GPIO0
#define KVC_PIN_DEBUG_URXD5_PIN     14      /* P0.14 - Pin 5 LQFP64 | JP1 Pin 15 hoặc 16 (RX từ cáp USB-TTL) */

#define KVC_PIN_DEBUG_UTXD5_PORT    SN_GPIO0
#define KVC_PIN_DEBUG_UTXD5_PIN     15      /* P0.15 - Pin 6 LQFP64 | JP1 Pin 17 hoặc 18 (TX ra cáp USB-TTL) */

/* ============================================================================
 * 7. KHỐI KEY TEST & LED TRÊN KIT (SN34F780 Starter-Kit V1.1)
 * ============================================================================ */
#define KVC_PIN_BOARD_LED1_PORT     SN_GPIO1
#define KVC_PIN_BOARD_LED1_PIN      12      /* P1.12 - Pin 52 LQFP64 | JP2 Pin 25 hoặc 26 (qua JP10) */

#define KVC_PIN_BOARD_LED2_PORT     SN_GPIO1
#define KVC_PIN_BOARD_LED2_PIN      13      /* P1.13 - Pin 51 LQFP64 | JP2 Pin 27 hoặc 28 (qua JP11) */

#define KVC_PIN_BOARD_KEY1_PORT     SN_GPIO1
#define KVC_PIN_BOARD_KEY1_PIN      14      /* P1.14 - Pin 50 LQFP64 | JP2 Pin 29 hoặc 30 (qua JP12) */

/* Theo sơ đồ nguyên lý SN34F780 Starter-Kit V1.1 (Reference Circuit):
 * - JP10: P1.12 -> R5 (1k) -> Anode D1 -> Cathode nối GND (VSS)
 * - JP11: P1.13 -> R6 (1k) -> Anode D2 -> Cathode nối GND (VSS)
 * => Đèn LED là ACTIVE HIGH: Mức 1 (BSET / 3.3V) = SÁNG, Mức 0 (BCLR / 0V) = TẮT */
#define KVC_BOARD_LED1_ON()         (SN_GPIO1->BSET = (1U << KVC_PIN_BOARD_LED1_PIN))
#define KVC_BOARD_LED1_OFF()        (SN_GPIO1->BCLR = (1U << KVC_PIN_BOARD_LED1_PIN))
#define KVC_BOARD_LED1_TOGGLE()     (SN_GPIO1->DATAOUT ^= (1U << KVC_PIN_BOARD_LED1_PIN))

#define KVC_BOARD_LED2_ON()         (SN_GPIO1->BSET = (1U << KVC_PIN_BOARD_LED2_PIN))
#define KVC_BOARD_LED2_OFF()        (SN_GPIO1->BCLR = (1U << KVC_PIN_BOARD_LED2_PIN))
#define KVC_BOARD_LED2_TOGGLE()     (SN_GPIO1->DATAOUT ^= (1U << KVC_PIN_BOARD_LED2_PIN))

/* ============================================================================
 * MACRO TIỆN ÍCH THAO TÁC BIT GPIO SONIX
 * ============================================================================ */
#define KVC_GPIO_SET_PIN(port, pin)         ((port)->BSET = (1U << (pin)))
#define KVC_GPIO_CLR_PIN(port, pin)         ((port)->BCLR = (1U << (pin)))
#define KVC_GPIO_READ_PIN(port, pin)        (((port)->DATAIN >> (pin)) & 0x01U)
#define KVC_GPIO_SET_DIR_OUT(port, pin)     ((port)->DIR |= (1U << (pin)))
#define KVC_GPIO_SET_DIR_IN(port, pin)      ((port)->DIR &= ~(1U << (pin)))

#ifdef __cplusplus
}
#endif

#endif /* KVC_PINOUT_H */
