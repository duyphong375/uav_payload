`timescale 1ns/1ps

// =========================================================================
// Module: ov2640_config.v
// Author: KVC Team
// Date:   2026-10-31 (viet lai)
// Desc:   Bo nap cau hinh SCCB cho camera OV2640 — VGA 640x480 RGB565
//
// -------------------------------------------------------------------------
// NGUYEN LY KHOI TAO VA CAU HINH
// -------------------------------------------------------------------------
// Ban cu chi ghi 38 thanh ghi (gioi han `rom_idx < 8'd38` trong khi ROM_DEPTH
// = 72). Bang day du cho OV2640 can ~190 luot ghi. Thieu khoi "sensor core"
// (Bank 1: 0x2c..0x62) va khoi DSP (Bank 0: 0xe5..0xc3) nen sensor khong ra
// khoi trang thai mac dinh -> khong phat VSYNC/PCLK.
//
// Trieu chung tren bo 31/10/2026:
//   - cam_vsync = 0 V co dinh (khong co xung 30 Hz)
//   - UART van 100,0 FPS (mock khong bi anh huong) -> de nham la "on dinh"
//   - Led camera khong dung duoc lam chi bao vi cfg_done khong kiem ACK
//
// Ba sua chinh:
//   1. Bang khoi tao day du, lay tu esp32-camera (Apache-2.0), gom:
//        ov2640_settings_cif   (~190 luot) : cau hinh sensor + DSP goc
//        ov2640_settings_to_svga(~35 luot) : chon cua so SVGA 800x600
//        ov2640_settings_rgb565 (~7 luot)  : dinh dang RGB565
//      Sau do ghi cua so DSP de XUAT ra VGA 640x480 (bang win_regs).
//   2. Kiem ACK tung luot ghi. NACK o bat ky luot nao -> dung ngay va bat
//      `cfg_error`, thay vi chay tiep 190 luot vo nghia.
//   3. Delay 20 ms sau khi cap nguon truoc luot ghi dau (OV2640 can thoi gian
//      on dinh). Ban cu bat dau ngay khi PLL lock.
//
// -------------------------------------------------------------------------
// VI SAO SVGA ROI MOI RA VGA (khong dung thang SVGA)
// -------------------------------------------------------------------------
// OV2640 khong co che do "VGA native" trong COM7. Cach chuan (giong moi driver
// OV2640, ke ca esp32-camera) la:
//   - dat sensor o SVGA (800x600)      COM7 = 0x40
//   - dat cua so DSP 800x600
//   - dat zoom/window xuat 640x480      ZMOW/ZMOH/ZMHH
// DSP tu downscale. Neu chi dat SVGA ma khong dat zoom, du lieu ra la 800x600
// -> camera_rx ghep pixel sai va letterbox nhan sai kich thuoc.
//
// -------------------------------------------------------------------------
// NGUON BANG KHOI TAO
// -------------------------------------------------------------------------
// espressif/esp32-camera @ master:
//   sensors/private_include/ov2640_settings.h
//   sensors/private_include/ov2640_regs.h
// License: Apache-2.0. Cac hang so ten (BANK_SEL, COM7, ...) da duoc thay
// bang gia tri so kem comment ten de RTL khong phu thuoc file header C.
// =========================================================================

module ov2640_config #(
    parameter integer CLK_FREQ_HZ  = 100_000_000,
    parameter integer POR_DELAY_MS = 20
)(
    input  wire        clk,
    input  wire        rst_n,
    input  wire        start,
    output reg         busy,
    output reg         done,
    // KVC-CAM-20261031: 1 = da dung vi SCCB NACK. Khi do `done` VAN len
    // (de FSM ngoai khong treo) nhung KHONG duoc coi la cau hinh thanh cong.
    output reg         cfg_error,

    // SCCB master handshake
    output reg         sccb_start,
    output reg  [7:0]  sccb_reg_addr,
    output reg  [7:0]  sccb_reg_data,
    input  wire        sccb_busy,
    input  wire        sccb_done,
    input  wire        sccb_ack_error
);

    localparam integer CYCLES_PER_MS = CLK_FREQ_HZ / 1000;

    // -----------------------------------------------------------------------
    // Bang khoi tao
    //
    // Moi entry = {reg, data}. reg = 8'hFF la chuyen bank (BANK_SEL).
    // Tong so entry lay tu cac bang chuan; xem ROM_END.
    // -----------------------------------------------------------------------
    localparam integer ROM_DEPTH = 256;

    reg [7:0] rom_addr [0:ROM_DEPTH-1];
    reg [7:0] rom_data [0:ROM_DEPTH-1];
    // rom_dly[i] = thoi gian cho SAU luot ghi i, don vi ms. 0 = nghi ngan 100 us.
    //
    // VI SAO CAN: driver chuan esp32-camera dung vTaskDelay(10) o ba cho ma
    // ban RTL truoc day bo qua hoan toan (chi nghi 100 us giua moi luot):
    //   - sau COM7_SRST                              (reset() )
    //   - sau set_window(), tuc sau R_BYPASS = DSP_EN
    //   - sau set_pixformat(), tuc sau RESET = 0
    // OV2640 can thoi gian noi bo de ap lai cua so/zoom. Ghi lien tuc 100 us
    // co the lam DSP chot cau hinh cu -> cua so khong duoc ap dung.
    reg [7:0] rom_dly  [0:ROM_DEPTH-1];
    // rom_last[i] = 1 danh dau entry CUOI CUNG cua bang.
    //
    // VI SAO KHONG DUNG BIEN DEM (`integer rom_end`):
    // Gowin bao EX3780 "Using initial value of 'rom_end' since it is never
    // assigned" — integer gan trong initial KHONG duoc tong hop thanh logic.
    // Neu no thanh 0 thi FSM nhay thang S_DONE va ghi 0 thanh ghi, trong khi
    // mo phong van PASS. Dung mang (duoc extract thanh BSRAM nhu rom_addr/
    // rom_data) thi gia tri init duoc honor giong hai mang kia.
    reg       rom_last [0:ROM_DEPTH-1];
    integer   i;

    initial begin
        for (i = 0; i < ROM_DEPTH; i = i + 1) begin
            rom_addr[i] = 8'h00;
            rom_data[i] = 8'h00;
            rom_dly[i]  = 8'd0;
            rom_last[i] = 1'b0;
        end

        i = 0;

        // =================================================================
        // A0. COM7_SRST — reset sensor TRUOC khi nap bang
        //
        // Driver chuan esp32-camera reset() luon lam viec này dau tien:
        //     COM7 = COM7_SRST (0x80), vTaskDelay(10), roi moi nap settings.
        // Ban RTL truoc day bo qua, nen neu sensor dang o trang thai tuy y
        // (vi du sau khi FPGA nap lai bitstream ma camera khong mat nguon),
        // bang khoi tao duoc ghi len mot trang thai khong xac dinh.
        // =================================================================
        rom_addr[i]=8'hFF; rom_data[i]=8'h01; i=i+1;  // BANK_SEL = BANK_SENSOR
        rom_addr[i]=8'h12; rom_data[i]=8'h80; rom_dly[i]=8'd10; i=i+1;  // COM7 = SRST, cho 10 ms

        // =================================================================
        // A. ov2640_settings_cif — khoi tao sensor + DSP (30 fps @ 24 MHz)
        //    Nguon: esp32-camera ov2640_settings.h, mang ov2640_settings_cif
        // =================================================================
        // --- DSP: bank 0, reset JPEG/DVP truoc ---
        rom_addr[i]=8'hFF; rom_data[i]=8'h00; i=i+1;  // BANK_SEL = BANK_DSP
        rom_addr[i]=8'h2C; rom_data[i]=8'hFF; i=i+1;
        rom_addr[i]=8'h2E; rom_data[i]=8'hDF; i=i+1;

        // --- Sensor bank 1 ---
        rom_addr[i]=8'hFF; rom_data[i]=8'h01; i=i+1;  // BANK_SEL = BANK_SENSOR
        rom_addr[i]=8'h3C; rom_data[i]=8'h32; i=i+1;
        rom_addr[i]=8'h11; rom_data[i]=8'h01; i=i+1;  // CLKRC
        rom_addr[i]=8'h09; rom_data[i]=8'h02; i=i+1;  // COM2 = OUT_DRIVE_3x
        rom_addr[i]=8'h04; rom_data[i]=8'h28; i=i+1;  // REG04 = REG04_DEFAULT
        rom_addr[i]=8'h13; rom_data[i]=8'hE5; i=i+1;  // COM8 = C0|BNDF|AGC|AEC
        rom_addr[i]=8'h14; rom_data[i]=8'h48; i=i+1;  // COM9 = 0x08|(2<<5) AGC 8x
        rom_addr[i]=8'h2C; rom_data[i]=8'h0C; i=i+1;
        rom_addr[i]=8'h33; rom_data[i]=8'h78; i=i+1;
        rom_addr[i]=8'h3A; rom_data[i]=8'h33; i=i+1;
        rom_addr[i]=8'h3B; rom_data[i]=8'hFB; i=i+1;
        rom_addr[i]=8'h3E; rom_data[i]=8'h00; i=i+1;
        rom_addr[i]=8'h43; rom_data[i]=8'h11; i=i+1;
        rom_addr[i]=8'h16; rom_data[i]=8'h10; i=i+1;
        rom_addr[i]=8'h39; rom_data[i]=8'h92; i=i+1;
        rom_addr[i]=8'h35; rom_data[i]=8'hDA; i=i+1;
        rom_addr[i]=8'h22; rom_data[i]=8'h1A; i=i+1;
        rom_addr[i]=8'h37; rom_data[i]=8'hC3; i=i+1;
        rom_addr[i]=8'h23; rom_data[i]=8'h00; i=i+1;
        rom_addr[i]=8'h34; rom_data[i]=8'hC0; i=i+1;  // ARCOM2
        rom_addr[i]=8'h06; rom_data[i]=8'h88; i=i+1;
        rom_addr[i]=8'h07; rom_data[i]=8'hC0; i=i+1;
        rom_addr[i]=8'h0D; rom_data[i]=8'h87; i=i+1;  // COM4
        rom_addr[i]=8'h0E; rom_data[i]=8'h41; i=i+1;
        rom_addr[i]=8'h4C; rom_data[i]=8'h00; i=i+1;
        rom_addr[i]=8'h4A; rom_data[i]=8'h81; i=i+1;
        rom_addr[i]=8'h21; rom_data[i]=8'h99; i=i+1;
        rom_addr[i]=8'h24; rom_data[i]=8'h40; i=i+1;  // AEW
        rom_addr[i]=8'h25; rom_data[i]=8'h38; i=i+1;  // AEB
        rom_addr[i]=8'h26; rom_data[i]=8'h82; i=i+1;  // VV = AGC_TH(8,2)
        rom_addr[i]=8'h5C; rom_data[i]=8'h00; i=i+1;
        rom_addr[i]=8'h63; rom_data[i]=8'h00; i=i+1;
        rom_addr[i]=8'h61; rom_data[i]=8'h70; i=i+1;  // HISTO_LOW
        rom_addr[i]=8'h62; rom_data[i]=8'h80; i=i+1;  // HISTO_HIGH
        rom_addr[i]=8'h7C; rom_data[i]=8'h05; i=i+1;
        rom_addr[i]=8'h20; rom_data[i]=8'h80; i=i+1;
        rom_addr[i]=8'h28; rom_data[i]=8'h30; i=i+1;
        rom_addr[i]=8'h6C; rom_data[i]=8'h00; i=i+1;
        rom_addr[i]=8'h6D; rom_data[i]=8'h80; i=i+1;
        rom_addr[i]=8'h6E; rom_data[i]=8'h00; i=i+1;
        rom_addr[i]=8'h70; rom_data[i]=8'h02; i=i+1;
        rom_addr[i]=8'h71; rom_data[i]=8'h94; i=i+1;
        rom_addr[i]=8'h73; rom_data[i]=8'hC1; i=i+1;
        rom_addr[i]=8'h3D; rom_data[i]=8'h34; i=i+1;
        rom_addr[i]=8'h5A; rom_data[i]=8'h57; i=i+1;
        rom_addr[i]=8'h4F; rom_data[i]=8'hBB; i=i+1;  // BD50
        rom_addr[i]=8'h50; rom_data[i]=8'h9C; i=i+1;  // BD60
        rom_addr[i]=8'h12; rom_data[i]=8'h20; i=i+1;  // COM7 = COM7_RES_CIF
        rom_addr[i]=8'h17; rom_data[i]=8'h11; i=i+1;  // HSTART
        rom_addr[i]=8'h18; rom_data[i]=8'h43; i=i+1;  // HSTOP
        rom_addr[i]=8'h19; rom_data[i]=8'h00; i=i+1;  // VSTART
        rom_addr[i]=8'h1A; rom_data[i]=8'h25; i=i+1;  // VSTOP
        rom_addr[i]=8'h32; rom_data[i]=8'h89; i=i+1;  // REG32 = REG32_CIF
        rom_addr[i]=8'h37; rom_data[i]=8'hC0; i=i+1;
        rom_addr[i]=8'h4F; rom_data[i]=8'hCA; i=i+1;  // BD50
        rom_addr[i]=8'h50; rom_data[i]=8'hA8; i=i+1;  // BD60
        rom_addr[i]=8'h6D; rom_data[i]=8'h00; i=i+1;
        rom_addr[i]=8'h3D; rom_data[i]=8'h38; i=i+1;

        // --- DSP bank 0 ---
        rom_addr[i]=8'hFF; rom_data[i]=8'h00; i=i+1;  // BANK_SEL = BANK_DSP
        rom_addr[i]=8'hE5; rom_data[i]=8'h7F; i=i+1;
        rom_addr[i]=8'hF9; rom_data[i]=8'hC0; i=i+1;  // MC_BIST = RESET|BOOT_ROM_SEL
        rom_addr[i]=8'h41; rom_data[i]=8'h24; i=i+1;
        rom_addr[i]=8'hE0; rom_data[i]=8'h14; i=i+1;  // RESET = JPEG|DVP
        rom_addr[i]=8'h76; rom_data[i]=8'hFF; i=i+1;
        rom_addr[i]=8'h33; rom_data[i]=8'hA0; i=i+1;
        rom_addr[i]=8'h42; rom_data[i]=8'h20; i=i+1;
        rom_addr[i]=8'h43; rom_data[i]=8'h18; i=i+1;
        rom_addr[i]=8'h4C; rom_data[i]=8'h00; i=i+1;
        rom_addr[i]=8'h87; rom_data[i]=8'h50; i=i+1;  // CTRL3 = WPC_EN|0x10
        rom_addr[i]=8'h88; rom_data[i]=8'h3F; i=i+1;
        rom_addr[i]=8'hD7; rom_data[i]=8'h03; i=i+1;
        rom_addr[i]=8'hD9; rom_data[i]=8'h10; i=i+1;
        rom_addr[i]=8'hD3; rom_data[i]=8'h82; i=i+1;  // R_DVP_SP = AUTO|0x02
        rom_addr[i]=8'hC8; rom_data[i]=8'h08; i=i+1;
        rom_addr[i]=8'hC9; rom_data[i]=8'h80; i=i+1;
        rom_addr[i]=8'h7C; rom_data[i]=8'h00; i=i+1;  // BPADDR
        rom_addr[i]=8'h7D; rom_data[i]=8'h00; i=i+1;  // BPDATA
        rom_addr[i]=8'h7C; rom_data[i]=8'h03; i=i+1;  // BPADDR
        rom_addr[i]=8'h7D; rom_data[i]=8'h48; i=i+1;
        rom_addr[i]=8'h7D; rom_data[i]=8'h48; i=i+1;
        rom_addr[i]=8'h7C; rom_data[i]=8'h08; i=i+1;
        rom_addr[i]=8'h7D; rom_data[i]=8'h20; i=i+1;
        rom_addr[i]=8'h7D; rom_data[i]=8'h10; i=i+1;
        rom_addr[i]=8'h7D; rom_data[i]=8'h0E; i=i+1;
        // gamma table
        rom_addr[i]=8'h90; rom_data[i]=8'h00; i=i+1;
        rom_addr[i]=8'h91; rom_data[i]=8'h0E; i=i+1;
        rom_addr[i]=8'h91; rom_data[i]=8'h1A; i=i+1;
        rom_addr[i]=8'h91; rom_data[i]=8'h31; i=i+1;
        rom_addr[i]=8'h91; rom_data[i]=8'h5A; i=i+1;
        rom_addr[i]=8'h91; rom_data[i]=8'h69; i=i+1;
        rom_addr[i]=8'h91; rom_data[i]=8'h75; i=i+1;
        rom_addr[i]=8'h91; rom_data[i]=8'h7E; i=i+1;
        rom_addr[i]=8'h91; rom_data[i]=8'h88; i=i+1;
        rom_addr[i]=8'h91; rom_data[i]=8'h8F; i=i+1;
        rom_addr[i]=8'h91; rom_data[i]=8'h96; i=i+1;
        rom_addr[i]=8'h91; rom_data[i]=8'hA3; i=i+1;
        rom_addr[i]=8'h91; rom_data[i]=8'hAF; i=i+1;
        rom_addr[i]=8'h91; rom_data[i]=8'hC4; i=i+1;
        rom_addr[i]=8'h91; rom_data[i]=8'hD7; i=i+1;
        rom_addr[i]=8'h91; rom_data[i]=8'hE8; i=i+1;
        rom_addr[i]=8'h91; rom_data[i]=8'h20; i=i+1;
        // lens / AWB tables
        rom_addr[i]=8'h92; rom_data[i]=8'h00; i=i+1;
        rom_addr[i]=8'h93; rom_data[i]=8'h06; i=i+1;
        rom_addr[i]=8'h93; rom_data[i]=8'hE3; i=i+1;
        rom_addr[i]=8'h93; rom_data[i]=8'h05; i=i+1;
        rom_addr[i]=8'h93; rom_data[i]=8'h05; i=i+1;
        rom_addr[i]=8'h93; rom_data[i]=8'h00; i=i+1;
        rom_addr[i]=8'h93; rom_data[i]=8'h04; i=i+1;
        rom_addr[i]=8'h93; rom_data[i]=8'h00; i=i+1;
        rom_addr[i]=8'h93; rom_data[i]=8'h00; i=i+1;
        rom_addr[i]=8'h93; rom_data[i]=8'h00; i=i+1;
        rom_addr[i]=8'h93; rom_data[i]=8'h00; i=i+1;
        rom_addr[i]=8'h93; rom_data[i]=8'h00; i=i+1;
        rom_addr[i]=8'h93; rom_data[i]=8'h00; i=i+1;
        rom_addr[i]=8'h93; rom_data[i]=8'h00; i=i+1;
        rom_addr[i]=8'h96; rom_data[i]=8'h00; i=i+1;
        rom_addr[i]=8'h97; rom_data[i]=8'h08; i=i+1;
        rom_addr[i]=8'h97; rom_data[i]=8'h19; i=i+1;
        rom_addr[i]=8'h97; rom_data[i]=8'h02; i=i+1;
        rom_addr[i]=8'h97; rom_data[i]=8'h0C; i=i+1;
        rom_addr[i]=8'h97; rom_data[i]=8'h24; i=i+1;
        rom_addr[i]=8'h97; rom_data[i]=8'h30; i=i+1;
        rom_addr[i]=8'h97; rom_data[i]=8'h28; i=i+1;
        rom_addr[i]=8'h97; rom_data[i]=8'h26; i=i+1;
        rom_addr[i]=8'h97; rom_data[i]=8'h02; i=i+1;
        rom_addr[i]=8'h97; rom_data[i]=8'h98; i=i+1;
        rom_addr[i]=8'h97; rom_data[i]=8'h80; i=i+1;
        rom_addr[i]=8'h97; rom_data[i]=8'h00; i=i+1;
        rom_addr[i]=8'h97; rom_data[i]=8'h00; i=i+1;
        rom_addr[i]=8'hA4; rom_data[i]=8'h00; i=i+1;
        rom_addr[i]=8'hA8; rom_data[i]=8'h00; i=i+1;
        rom_addr[i]=8'hC5; rom_data[i]=8'h11; i=i+1;
        rom_addr[i]=8'hC6; rom_data[i]=8'h51; i=i+1;
        rom_addr[i]=8'hBF; rom_data[i]=8'h80; i=i+1;
        rom_addr[i]=8'hC7; rom_data[i]=8'h10; i=i+1;
        rom_addr[i]=8'hB6; rom_data[i]=8'h66; i=i+1;
        rom_addr[i]=8'hB8; rom_data[i]=8'hA5; i=i+1;
        rom_addr[i]=8'hB7; rom_data[i]=8'h64; i=i+1;
        rom_addr[i]=8'hB9; rom_data[i]=8'h7C; i=i+1;
        rom_addr[i]=8'hB3; rom_data[i]=8'hAF; i=i+1;
        rom_addr[i]=8'hB4; rom_data[i]=8'h97; i=i+1;
        rom_addr[i]=8'hB5; rom_data[i]=8'hFF; i=i+1;
        rom_addr[i]=8'hB0; rom_data[i]=8'hC5; i=i+1;
        rom_addr[i]=8'hB1; rom_data[i]=8'h94; i=i+1;
        rom_addr[i]=8'hB2; rom_data[i]=8'h0F; i=i+1;
        rom_addr[i]=8'hC4; rom_data[i]=8'h5C; i=i+1;
        rom_addr[i]=8'hC3; rom_data[i]=8'hFD; i=i+1;  // CTRL1
        rom_addr[i]=8'h7F; rom_data[i]=8'h00; i=i+1;
        rom_addr[i]=8'hE5; rom_data[i]=8'h1F; i=i+1;
        rom_addr[i]=8'hE1; rom_data[i]=8'h67; i=i+1;
        rom_addr[i]=8'hDD; rom_data[i]=8'h7F; i=i+1;
        rom_addr[i]=8'hDA; rom_data[i]=8'h00; i=i+1;  // IMAGE_MODE
        rom_addr[i]=8'hE0; rom_data[i]=8'h00; i=i+1;  // RESET = 0
        rom_addr[i]=8'h05; rom_data[i]=8'h00; i=i+1;  // R_BYPASS = DSP_EN

        // =================================================================
        // B. ov2640_settings_rgb565 — dinh dang xuat RGB565
        //    Nguon: esp32-camera, mang ov2640_settings_rgb565
        //
        // THU TU QUAN TRONG: phai chay TRUOC khoi cua so (C) vi day la
        // trinh tu cua driver chuan (reset -> set_pixformat -> set_framesize).
        // Ban dau dat khoi cua so truoc khoi nay va doi chieu may phat hien
        // lech 5 vi tri.
        // =================================================================
        rom_addr[i]=8'hFF; rom_data[i]=8'h00; i=i+1;  // BANK_SEL = BANK_DSP
        rom_addr[i]=8'hE0; rom_data[i]=8'h04; i=i+1;  // RESET = RESET_DVP
        rom_addr[i]=8'hDA; rom_data[i]=8'h08; i=i+1;  // IMAGE_MODE = RGB565
        rom_addr[i]=8'hD7; rom_data[i]=8'h03; i=i+1;
        rom_addr[i]=8'hE1; rom_data[i]=8'h77; i=i+1;
        rom_addr[i]=8'hE0; rom_data[i]=8'h00; i=i+1;  // RESET = 0

        // =================================================================
        // C. Chuyen SVGA 800x600 -> cua so DSP, roi zoom ra VGA 640x480
        //    Nguon: esp32-camera, mang ov2640_settings_to_svga + set_window()
        //
        // Trinh tu set_window() cua driver chuan:
        //   1. R_BYPASS = DSP_BYPAS   (tam ngat DSP khoi duong du lieu)
        //   2. ghi mang ov2640_settings_to_svga
        //   3. ghi win_regs (cua so 800x600, zoom 640x480)
        //   4. CLKRC   = PLL
        //   5. R_DVP_SP = PCLK
        //   6. R_BYPASS = DSP_EN      (bat lai)
        // =================================================================
        rom_addr[i]=8'hFF; rom_data[i]=8'h00; i=i+1;  // BANK_SEL = BANK_DSP
        rom_addr[i]=8'h05; rom_data[i]=8'h01; i=i+1;  // R_BYPASS = DSP_BYPAS

        // --- 2. cua so cam bien SVGA ---
        rom_addr[i]=8'hFF; rom_data[i]=8'h01; i=i+1;  // BANK_SEL = BANK_SENSOR
        rom_addr[i]=8'h12; rom_data[i]=8'h40; i=i+1;  // COM7 = COM7_RES_SVGA
        rom_addr[i]=8'h03; rom_data[i]=8'h0A; i=i+1;  // COM1
        rom_addr[i]=8'h32; rom_data[i]=8'h09; i=i+1;  // REG32 = REG32_SVGA
        rom_addr[i]=8'h17; rom_data[i]=8'h11; i=i+1;  // HSTART
        rom_addr[i]=8'h18; rom_data[i]=8'h43; i=i+1;  // HSTOP
        rom_addr[i]=8'h19; rom_data[i]=8'h00; i=i+1;  // VSTART
        rom_addr[i]=8'h1A; rom_data[i]=8'h4B; i=i+1;  // VSTOP
        rom_addr[i]=8'h37; rom_data[i]=8'hC0; i=i+1;
        rom_addr[i]=8'h4F; rom_data[i]=8'hCA; i=i+1;  // BD50
        rom_addr[i]=8'h50; rom_data[i]=8'hA8; i=i+1;  // BD60
        rom_addr[i]=8'h5A; rom_data[i]=8'h23; i=i+1;
        rom_addr[i]=8'h6D; rom_data[i]=8'h00; i=i+1;
        rom_addr[i]=8'h3D; rom_data[i]=8'h38; i=i+1;
        rom_addr[i]=8'h39; rom_data[i]=8'h92; i=i+1;
        rom_addr[i]=8'h35; rom_data[i]=8'hDA; i=i+1;
        rom_addr[i]=8'h22; rom_data[i]=8'h1A; i=i+1;
        rom_addr[i]=8'h37; rom_data[i]=8'hC3; i=i+1;
        rom_addr[i]=8'h23; rom_data[i]=8'h00; i=i+1;
        rom_addr[i]=8'h34; rom_data[i]=8'hC0; i=i+1;  // ARCOM2
        rom_addr[i]=8'h06; rom_data[i]=8'h88; i=i+1;
        rom_addr[i]=8'h07; rom_data[i]=8'hC0; i=i+1;
        rom_addr[i]=8'h0D; rom_data[i]=8'h87; i=i+1;  // COM4
        rom_addr[i]=8'h0E; rom_data[i]=8'h41; i=i+1;
        rom_addr[i]=8'h42; rom_data[i]=8'h03; i=i+1;
        rom_addr[i]=8'h4C; rom_data[i]=8'h00; i=i+1;

        rom_addr[i]=8'hFF; rom_data[i]=8'h00; i=i+1;  // BANK_SEL = BANK_DSP
        rom_addr[i]=8'hE0; rom_data[i]=8'h04; i=i+1;  // RESET = RESET_DVP
        // Do phan giai sensor (SVGA 800x600)
        rom_addr[i]=8'hC0; rom_data[i]=8'h64; i=i+1;  // HSIZE8 = 100
        rom_addr[i]=8'hC1; rom_data[i]=8'h4B; i=i+1;  // VSIZE8 = 75
        rom_addr[i]=8'h8C; rom_data[i]=8'h00; i=i+1;  // SIZEL
        // Cua so anh >= kich thuoc xuat
        rom_addr[i]=8'h51; rom_data[i]=8'hC8; i=i+1;  // HSIZE = 200
        rom_addr[i]=8'h52; rom_data[i]=8'h96; i=i+1;  // VSIZE = 150
        rom_addr[i]=8'h53; rom_data[i]=8'h00; i=i+1;  // XOFFL
        rom_addr[i]=8'h54; rom_data[i]=8'h00; i=i+1;  // YOFFL
        rom_addr[i]=8'h55; rom_data[i]=8'h00; i=i+1;  // VHYX
        rom_addr[i]=8'h57; rom_data[i]=8'h00; i=i+1;  // TEST
        rom_addr[i]=8'h86; rom_data[i]=8'h3D; i=i+1;  // CTRL2 = DCW_EN|0x1D
        rom_addr[i]=8'h50; rom_data[i]=8'h80; i=i+1;  // CTRLI = LP_DP

        // --- 3. win_regs: zoom 800x600 -> 640x480 ---
        //     w = 640/4 = 160 = 0xA0, h = 480/4 = 120 = 0x78
        //     VHYX/TEST/ZMHH = 0 vi max_x,max_y,w,h deu < 512/1024.
        rom_addr[i]=8'h51; rom_data[i]=8'hC8; i=i+1;  // HSIZE = 200
        rom_addr[i]=8'h52; rom_data[i]=8'h96; i=i+1;  // VSIZE = 150
        rom_addr[i]=8'h53; rom_data[i]=8'h00; i=i+1;  // XOFFL = 0
        rom_addr[i]=8'h54; rom_data[i]=8'h00; i=i+1;  // YOFFL = 0
        rom_addr[i]=8'h55; rom_data[i]=8'h00; i=i+1;  // VHYX  = 0
        rom_addr[i]=8'h57; rom_data[i]=8'h00; i=i+1;  // TEST  = 0
        rom_addr[i]=8'h5A; rom_data[i]=8'hA0; i=i+1;  // ZMOW = 160
        rom_addr[i]=8'h5B; rom_data[i]=8'h78; i=i+1;  // ZMOH = 120
        rom_addr[i]=8'h5C; rom_data[i]=8'h00; i=i+1;  // ZMHH = 0

        // --- 4+5. PLL: clk_2x=1, clk_div=7 -> CLKRC = 0x87
        //          pclk_auto=1, pclk_div=8 -> R_DVP_SP = 0x88
        rom_addr[i]=8'hFF; rom_data[i]=8'h01; i=i+1;  // BANK_SEL = BANK_SENSOR
        rom_addr[i]=8'h11; rom_data[i]=8'h87; i=i+1;  // CLKRC
        rom_addr[i]=8'hFF; rom_data[i]=8'h00; i=i+1;  // BANK_SEL = BANK_DSP
        rom_addr[i]=8'hD3; rom_data[i]=8'h88; i=i+1;  // R_DVP_SP

        // --- 6. bat lai DSP ---
        rom_addr[i]=8'h05; rom_data[i]=8'h00; rom_dly[i]=8'd10; i=i+1;  // R_BYPASS = DSP_EN, cho 10 ms

        // =================================================================
        // D. Ap lai RGB565 sau khi doi cua so
        //    Driver chuan goi set_pixformat() lan hai sau set_framesize()
        //    ("required when changing resolution"). Bo qua buoc nay thi
        //    IMAGE_MODE co the bi ghi de boi khoi cua so.
        // =================================================================
        rom_addr[i]=8'hFF; rom_data[i]=8'h00; i=i+1;  // BANK_SEL = BANK_DSP
        rom_addr[i]=8'hE0; rom_data[i]=8'h04; i=i+1;  // RESET = RESET_DVP
        rom_addr[i]=8'hDA; rom_data[i]=8'h08; i=i+1;  // IMAGE_MODE = RGB565
        rom_addr[i]=8'hD7; rom_data[i]=8'h03; i=i+1;
        rom_addr[i]=8'hE1; rom_data[i]=8'h77; i=i+1;
        rom_addr[i]=8'hE0; rom_data[i]=8'h00; rom_dly[i]=8'd10; i=i+1;  // RESET = 0, cho 10 ms

        // Danh dau entry cuoi cung (chi so i-1 sau khi da tang).
        rom_last[i-1] = 1'b1;
    end

    // -----------------------------------------------------------------------
    // FSM
    // -----------------------------------------------------------------------
    localparam [2:0]
        S_POR        = 3'd0,   // cho 20 ms sau cap nguon
        S_IDLE       = 3'd1,
        S_FETCH      = 3'd2,
        S_ISSUE_SCCB = 3'd3,
        S_WAIT_SCCB  = 3'd4,
        S_RELEASE    = 3'd5,   // nghi giua 2 luot ghi
        S_DONE       = 3'd6;

    reg [2:0]  state;
    integer    rom_idx;
    // Nghi sau moi luot SCCB, don vi 100 us.
    //   delay_cnt   : dem chu ky clk trong mot don vi
    //   delay_units : so don vi da troi qua
    //   delay_target: tong so don vi can nghi (1 = 100 us, 10 = 1 ms, 100 = 10 ms)
    reg [15:0] delay_cnt;
    reg [15:0] delay_units;
    reg [15:0] delay_target;
    // So chu ky clk trong 100 us. Hang so, khong phai phep nhan runtime.
    localparam [15:0] CYCLES_PER_100US = CLK_FREQ_HZ / 10_000;
    reg [31:0] por_cnt;
    // KVC-CAM-20261101: Co chot de FSM chi chay dung 1 lan khi start = 1 (tranh loop vo han)
    reg        cfg_attempted;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            state         <= S_POR;
            busy          <= 1'b0;
            done          <= 1'b0;
            cfg_error     <= 1'b0;
            cfg_attempted <= 1'b0;
            sccb_start    <= 1'b0;
            sccb_reg_addr <= 8'd0;
            sccb_reg_data <= 8'd0;
            rom_idx       <= 0;
            delay_cnt     <= 16'd0;
            delay_units   <= 16'd0;
            delay_target  <= 16'd0;
            por_cnt       <= 32'd0;
        end else begin
            sccb_start <= 1'b0;
            done       <= 1'b0;

            case (state)
                // Cho nguon on dinh. OV2640 can >= 5 ms; dung 20 ms cho chac.
                // Ban cu bat dau ngay khi PLL lock (vai tram us) -> luot ghi
                // dau tien co the bi bo qua.
                S_POR: begin
                    busy <= 1'b0;
                    if (por_cnt >= POR_DELAY_MS * CYCLES_PER_MS) begin
                        por_cnt <= 32'd0;
                        state   <= S_IDLE;
                    end else begin
                        por_cnt <= por_cnt + 32'd1;
                    end
                end

                S_IDLE: begin
                    busy <= 1'b0;
                    if (start && !cfg_attempted) begin
                        cfg_attempted <= 1'b1;
                        busy          <= 1'b1;
                        cfg_error     <= 1'b0;
                        rom_idx       <= 0;
                        state         <= S_FETCH;
                    end else if (!start) begin
                        cfg_attempted <= 1'b0;
                    end
                end

                S_FETCH: begin
                    sccb_reg_addr <= rom_addr[rom_idx];
                    sccb_reg_data <= rom_data[rom_idx];
                    // Chuan bi thoi gian nghi SAU luot ghi nay, don vi 100 us:
                    //   rom_dly = 0  -> 1 don vi  (100 us, nghi toi thieu SCCB)
                    //   rom_dly = N  -> 10*N don vi (N ms, moc driver chuan can)
                    //
                    // VI SAO KHONG DUNG `rom_dly * CYCLES_PER_MS`: phep nhan do
                    // tao duong to hop 12,2 ns qua `delay_target`, keo Fmax
                    // clk_100m xuong 101,2 MHz (sat nguong 100). Nhan voi 10
                    // chi la dich cong, va bo dem chi con dem 100 us.
                    delay_target <= (rom_dly[rom_idx] == 8'd0)
                                    ? 16'd1
                                    : ({8'd0, rom_dly[rom_idx]} << 3)
                                      + ({8'd0, rom_dly[rom_idx]} << 1);
                    delay_cnt    <= 16'd0;
                    delay_units  <= 16'd0;
                    state        <= S_ISSUE_SCCB;
                end

                S_ISSUE_SCCB: begin
                    if (!sccb_busy) begin
                        sccb_start <= 1'b1;
                        state      <= S_WAIT_SCCB;
                    end
                end

                S_WAIT_SCCB: begin
                    if (sccb_done) begin
                        if (sccb_ack_error) begin
                            // Dung ngay: sensor khong ACK -> moi luot ghi sau
                            // deu vo nghia. Bat co de tang tren biet.
                            cfg_error <= 1'b1;
                            state     <= S_DONE;
                        end else if (rom_last[rom_idx]) begin
                            // Entry vua ghi la cuoi bang -> xong
                            state <= S_DONE;
                        end else begin
                            rom_idx <= rom_idx + 1;
                            // Nghi SAU luot vua ghi. `delay_target` da duoc
                            // nap o S_FETCH tu rom_dly[] cua entry vua roi.
                            delay_cnt   <= 16'd0;
                            delay_units <= 16'd0;
                            state       <= S_RELEASE;
                        end
                    end
                end

                S_RELEASE: begin
                    // Nghi `delay_target` don vi 100 us. Moi don vi can
                    // CYCLES_PER_100US chu ky clk (hang so, khong phai phep nhan).
                    if (delay_cnt >= CYCLES_PER_100US) begin
                        delay_cnt <= 16'd0;
                        if (delay_units >= delay_target) begin
                            state <= S_FETCH;
                        end else begin
                            delay_units <= delay_units + 16'd1;
                        end
                    end else begin
                        delay_cnt <= delay_cnt + 16'd1;
                    end
                end

                S_DONE: begin
                    busy <= 1'b0;
                    done <= 1'b1;
                    // KVC-CAM-20261101: Khi start van HIGH (nhu pll_lock trong kvc_top_demo),
                    // giu nguyen o S_DONE de khong bi loop vo han gay nhieu crosstalk 400 kHz.
                    // Chi quay lai S_IDLE khi start da tro ve LOW (neu co re-trigger ngoai).
                    if (!start) begin
                        cfg_attempted <= 1'b0;
                        state         <= S_IDLE;
                    end else begin
                        state         <= S_DONE;
                    end
                end

                default: state <= S_IDLE;
            endcase
        end
    end

endmodule
