`timescale 1ns/1ps

module kvc_top_demo
(
    input  wire clk_27m,
    input  wire rst_n,

    // Camera OV2640 DVP Interface
    input  wire        cam_pclk,
    input  wire        cam_vsync,
    input  wire        cam_href,
    input  wire [7:0]  cam_data,
    output wire        cam_xclk,

    inout  wire        ov2640_sda,
    output wire        ov2640_scl,

    // SPI Flash
    output wire spi_cs,
    output wire spi_sclk,
    output wire spi_mosi,
    input  wire spi_miso,

    // UART & Handshake sang MCU Sonix (ABI IF-02)
    output wire uart_tx,
    output wire data_ready,
    input  wire mcu_ack,

    // LED trang thai tren bo (Active-LOW)
    output wire led_camera_ok,
    output wire led_cnn_done,
    output wire led_uart_busy
);

    localparam integer KERNEL = 3;
    localparam integer IN_C   = 3;
    localparam integer Q_BITS = 8;

    // =========================================================================
    // CHON NGUON BBOX (KVC-FPGA-BLOB-20261101-001)
    //   0 = Mock BBox (khong co camera/CNN) — bring-up UART, chan doan VSYNC
    //   1 = Blob detect that tu pixel OV2640 (mac dinh release)
    //   2 = CNN that (kvc_yolo_top) — bat sau khi P3/P6 hoan tat
    //
    // Day la `parameter` (khong phai `localparam`) de testbench override duoc.
    // Xem docs: D7 cua plan KVC-FPGA-BLOB-20261101-001.
    // =========================================================================
    parameter integer BBOX_SOURCE = 1;

    // =========================================================================
    // CHAN DOAN VSYNC (KVC-CAM-DIAG-20261101)
    //
    // MUC DICH: khi bring-up camera, cau hoi quyet dinh la "camera co phat
    // VSYNC khong". Khong co scope thi khong the tra loi tu ngoai.
    //
    // CACH LAM: dem so xung `cam_vsync_pulse` (da dong bo sang clk_100m) roi
    // GHI DE truong X cua bbox DAU TIEN trong moi frame. Parser
    // `scripts/manual/fpga_uart_capture.py` da in san `x=` cho tung bbox, nen
    // chi can doc so do la biet so xung VSYNC da toi FPGA.
    //
    // TAI SAO KHONG DOI ABI: layout IF-01 giu nguyen 26 byte, khong them
    // truong, khong doi CRC. Chi thay GIA TRI cua mot truong da co.
    //
    // CACH DOC KET QUA:
    //   - X tang dan qua cac frame  -> camera CO phat VSYNC, dem duoc tan so
    //   - X dung yen / khong doi    -> camera KHONG phat VSYNC
    //   - Tan so = (x_frame_sau - x_frame_truoc) / (dt giua 2 frame)
    //     Vi du x: 12 -> 42 trong 1,0 s  => 30 Hz  => camera chay dung
    //
    // DIAG_MODE = 1 chi co tac dung khi BBOX_SOURCE = 0 (duong mock), vi
    // `mock_first_bbox` bi rang buoc 0 o moi che do khac. Bay BBOX_SOURCE = 1
    // voi DIAG_MODE = 1 KHONG lam hong X cua blob that, nhung do la cau hinh
    // vo nghia — TB `tb_kvc_top_blob` kiem tra tinh chat nay.
    //
    // Khi DIAG_MODE = 1, truong Y cua bbox dau tien mang trang thai SCCB:
    //   y = {14'd0, cfg_error, cfg_done}   0 = chua xong, 1 = OK, 3 = ACK loi
    //
    // =0: tra ve gia tri nguon goc.
    // =1: ghi de X (vsync_cnt) va Y (trang thai SCCB) cua bbox dau tien.
    //
    // =3 (KVC-CAM-DIAG-20261103): THONG KE MAU RGB565.
    //     `pixel_stats` tich luy tong R/G/B tren ca frame va phat 6 slot bao
    //     cao qua khung IF-01. Dung cho muc G6.1.9 — do gia tri mau that.
    //     Day la phep do KHAC 6.1.10: 6.1.10 hoi "co blob khong", 6.1.9 hoi
    //     "mau that la gi". Khong the tra loi cai sau bang duong bbox.
    //     Giong DIAG_MODE = 2, blob van chay de `frame_pulse` dung, chi duong
    //     ra UART bi thay.
    // =========================================================================
    parameter integer DIAG_MODE = 0;

    // =========================================================================
    // THAM SO TU DO VSYNC (KVC-CAM-DIAG-20261102)
    //
    // Chi co tac dung khi DIAG_MODE = 2. `parameter` (khong phai localparam)
    // de testbench override duoc — cua so 2.000 ms that doi hoi mo phong
    // 200 trieu chu ky, qua cham cho iverilog. Tren phan cung luon dung mac
    // dinh (100 us / 2.000 ms); TB ha xuong 1 us / 200 "ms" va bom xung ngan
    // theo dung ty le, nho vay bucket (don vi ms) van kiem dung.
    //
    // LUU Y: khong doi gia tri nay trong bitstream nap bo. Ghi chu o
    // FPGA_BUILD_RECORD.md.
    // =========================================================================
    parameter integer DIAG_TICK_HZ   = 10_000;   // 100 us
    parameter integer DIAG_WINDOW_MS = 2_000;    // 2 s
    parameter integer DIAG_GLITCH_MS = 10;       // bo qua canh gan hon 10 ms

    wire clk_100m;
    wire pll_lock;

    Gowin_rPLL_100M u_pll100 (
        .clkout (clk_100m),
        .lock   (pll_lock),
        .clkin  (clk_27m)
    );

    // Cung cap XCLK 24MHz cho module Camera OV2640
    wire clk_24m;
    Gowin_rPLL_24M u_pll24 (
        .clkout (clk_24m),
        .lock   (),
        .clkin  (clk_27m)
    );
    assign cam_xclk = clk_24m;

    // Khoi tao va cau hinh Camera OV2640 qua SCCB/I2C (VGA 640x480 RGB565)
    wire sccb_start;
    wire [7:0] sccb_reg_addr;
    wire [7:0] sccb_reg_data;
    wire sccb_busy;
    wire sccb_done;
    wire sccb_ack_error;
    wire cfg_done;
    wire cfg_error;

    ov2640_config #(
        .CLK_FREQ_HZ  (100_000_000),
        .POR_DELAY_MS (20)
    ) u_ov2640_cfg (
        .clk           (clk_100m),
        .rst_n         (rst_n),
        .start         (pll_lock),
        .busy          (),
        .done          (cfg_done),
        .cfg_error     (cfg_error),
        .sccb_start    (sccb_start),
        .sccb_reg_addr (sccb_reg_addr),
        .sccb_reg_data (sccb_reg_data),
        .sccb_busy     (sccb_busy),
        .sccb_done     (sccb_done),
        .sccb_ack_error(sccb_ack_error)
    );

    sccb_master #(
        .SCL_DIV    (1000), // 100 kHz @100MHz clk (an toan cho pull-up noi va day jumper)
        .DEV_ADDR   (8'h60),
        .ADDR_BYTES (1)
    ) u_sccb (
        .clk        (clk_100m),
        .rst_n      (rst_n),
        .start      (sccb_start),
        .reg_addr   ({8'h00, sccb_reg_addr}),
        .reg_data   (sccb_reg_data),
        .scl        (ov2640_scl),
        .sda        (ov2640_sda),
        .busy       (sccb_busy),
        .done       (sccb_done),
        .ack_error  (sccb_ack_error)
    );

    // --- Camera Receiver (8-bit DVP to 16-bit RGB565) ---
    wire [15:0] cap_pixel_data;
    wire        cap_pixel_valid;
    wire        cap_frame_valid;

    camera_rx #(.SKIP_FRAMES(2)) u_cam_rx (
        .pclk        (cam_pclk),
        .rst_n       (rst_n),
        .vsync       (cam_vsync),
        .href        (cam_href),
        .data_in     (cam_data),
        .pixel_data  (cap_pixel_data),
        .pixel_valid (cap_pixel_valid),
        .frame_start (),
        .frame_valid (cap_frame_valid)
    );

    // Dong bo xung VSYNC sang domain 100MHz (1-cycle pulse)
    reg [2:0] cam_vsync_sync;
    always @(posedge clk_100m or negedge rst_n) begin
        if (!rst_n) cam_vsync_sync <= 3'b000;
        else        cam_vsync_sync <= {cam_vsync_sync[1:0], cam_vsync};
    end
    wire cam_vsync_pulse = cam_vsync_sync[1] & ~cam_vsync_sync[2];

    // =========================================================================
    // Bo dem VSYNC de chan doan bang UART (KVC-CAM-DIAG-20261101)
    //
    // `vsync_cnt` tang moi khi co xung VSYNC that tu camera. Gia tri nay duoc
    // ghi de vao truong X cua bbox dau tien (xem bbox_data_mock duoi), nen chi
    // can doc capture UART la biet camera co phat VSYNC hay khong — khong can
    // scope, khong doi ABI.
    //
    // Dem 16-bit tu do (quay vong sau 65.536 xung ~ 36 phut o 30 Hz). Du dai
    // cho moi lan do bring-up.
    // =========================================================================
    reg [15:0] vsync_cnt;
    always @(posedge clk_100m or negedge rst_n) begin
        if (!rst_n)                vsync_cnt <= 16'd0;
        else if (cam_vsync_pulse)  vsync_cnt <= vsync_cnt + 16'd1;
    end

    // =========================================================================
    // CNN PATH (chi instantiate khi BBOX_SOURCE = 2)
    // Toan bo block duoc bao trong generate de synthesis loai bo hoan toan
    // khi BBOX_SOURCE != 2 -> giai phong DSP va dat Fmax.
    // =========================================================================
    wire        cnn_out_valid;
    wire        cnn_out_last;
    wire [15:0] cnn_out_x, cnn_out_y, cnn_out_w, cnn_out_h;
    wire [7:0]  cnn_out_class, cnn_out_conf;

    generate
        if (BBOX_SOURCE == 2) begin : g_cnn_path
            wire [15:0] fifo_rd_data;
            wire        fifo_empty, fifo_full, fifo_overflow, fifo_underflow;
            wire        fifo_rd_en = ~fifo_empty;

            async_fifo_cdc #(.DEPTH_BITS(8), .DATA_WIDTH(16)) u_cdc_fifo (
                .wr_clk    (cam_pclk),
                .rd_clk    (clk_100m),
                .rst_n     (rst_n),
                .wr_en     (cap_pixel_valid),
                .wr_data   (cap_pixel_data),
                .full      (fifo_full),
                .overflow  (fifo_overflow),
                .rd_en     (fifo_rd_en),
                .rd_data   (fifo_rd_data),
                .empty     (fifo_empty),
                .underflow (fifo_underflow)
            );

            wire [7:0]  letterbox_out_data;
            wire [16:0] letterbox_out_addr;
            wire        letterbox_out_we;
            wire        letterbox_out_done;

            image_letterbox #(.IN_W(640), .IN_H(480), .OUT_W(160), .OUT_H(160), .PAD_COLOR(8'd114)) u_letterbox (
                .clk            (clk_100m),
                .rst_n          (rst_n),
                .in_pixel       (fifo_rd_data),
                .in_valid       (fifo_rd_en),
                .frame_start    (cam_vsync_pulse),
                .out_data       (letterbox_out_data),
                .out_addr       (letterbox_out_addr),
                .out_we         (letterbox_out_we),
                .out_frame_done (letterbox_out_done)
            );

            wire [(KERNEL*KERNEL*IN_C*Q_BITS)-1:0] conv_win_data;
            wire conv_win_valid = letterbox_out_we;
            wire [7:0] lb_00, lb_01, lb_02, lb_10, lb_11, lb_12, lb_20, lb_21, lb_22;

            line_buffer_3x3 #(.MAX_W(640), .DATA_W(8), .ADDR_W(10)) u_line_buffer (
                .clk     (clk_100m),
                .rst_n   (rst_n),
                .wr_en   (letterbox_out_we),
                .wr_x    (letterbox_out_addr[9:0]),
                .wr_data (letterbox_out_data),
                .rd_x    (10'd10),
                .rd_y    (10'd10),
                .win_00  (lb_00), .win_01  (lb_01), .win_02  (lb_02),
                .win_10  (lb_10), .win_11  (lb_11), .win_12  (lb_12),
                .win_20  (lb_20), .win_21  (lb_21), .win_22  (lb_22)
            );

            assign conv_win_data = {
                lb_22, lb_21, lb_20, lb_12, lb_11, lb_10, lb_02, lb_01, lb_00,
                8'd0, 8'd0, 8'd0, 8'd0, 8'd0, 8'd0, 8'd0, 8'd0, 8'd0,
                8'd0, 8'd0, 8'd0, 8'd0, 8'd0, 8'd0, 8'd0, 8'd0, 8'd0
            };

            wire [23:0] spi_weight_addr;
            wire        spi_weight_req;
            wire [31:0] spi_weight_rdata;
            wire        spi_weight_rvalid;

            spi_flash_wrapper u_spi_wrap (
                .clk      (clk_100m),
                .rst_n    (rst_n),
                .req      (spi_weight_req),
                .addr     (spi_weight_addr),
                .rdata    (spi_weight_rdata),
                .rvalid   (spi_weight_rvalid),
                .spi_cs   (spi_cs),
                .spi_sclk (spi_sclk),
                .spi_mosi (spi_mosi),
                .spi_miso (spi_miso)
            );

            wire [15:0] bias_addr, mult_addr;
            wire [31:0] bias_rdata, mult_rdata;
            wire        bias_rvalid, mult_rvalid, bias_req, mult_req;

            bias_mem #(.DEPTH(256), .DATA_W(32)) u_bias_mem (
                .clk(clk_100m), .rst_n(rst_n), .req(bias_req), .addr(bias_addr), .rdata(bias_rdata), .rvalid(bias_rvalid)
            );
            mult_mem #(.DEPTH(256), .DATA_W(32)) u_mult_mem (
                .clk(clk_100m), .rst_n(rst_n), .req(mult_req), .addr(mult_addr), .rdata(mult_rdata), .rvalid(mult_rvalid)
            );

            wire [15:0] conv_out_x, conv_out_y, conv_out_c;
            wire [7:0]  conv_out_q;
            wire [16:0] conv_out_addr;
            wire        conv_out_valid, conv_done;

            conv_engine_dynamic_fsm #(
                .KERNEL(KERNEL), .IN_C(IN_C), .OUT_C(32), .IMG_W(160), .IMG_H(160), .Q_BITS(Q_BITS),
                .GROUPS(1)
            ) u_conv (
                .clk(clk_100m), .rst_n(rst_n), .start(letterbox_out_done),
                .p_stride(16'd2), .p_pad(16'd1), .p_weight_base(24'h400000), .p_bias_base(24'd0), .p_quant_base(24'd0),
                .p_groups(16'd0),
                .win_valid(conv_win_valid), .win_ready(), .win_data(conv_win_data),
                .bias_addr(bias_addr), .bias_rdata(bias_rdata), .bias_rvalid(bias_rvalid), .bias_req(bias_req),
                .mult_addr(mult_addr), .mult_rdata(mult_rdata), .mult_rvalid(mult_rvalid), .mult_req(mult_req),
                .weight_addr(spi_weight_addr), .weight_rdata(spi_weight_rdata), .weight_rvalid(spi_weight_rvalid), .weight_req(spi_weight_req),
                .out_valid(conv_out_valid), .out_x(conv_out_x), .out_y(conv_out_y), .out_c(conv_out_c), .out_q(conv_out_q), .out_addr(conv_out_addr),
                .busy(), .done(conv_done)
            );

            // NMS: MAX_BOXES=12 theo B-8; IOU_THRESH mac dinh trong yolo_nms da sua
            wire [15:0] nms_x, nms_y, nms_w, nms_h, nms_conf;

            yolo_nms #(.MAX_BOXES(12), .BOX_W(16), .BOX_H(16), .CONF_W(16), .CLASS_W(8)) u_nms (
                .clk       (clk_100m),
                .rst_n     (rst_n),
                .in_valid  (conv_out_valid),
                .in_last   (conv_done),
                .in_x      (conv_out_x),
                .in_y      (conv_out_y),
                .in_w      (conv_out_x),   // TODO P3: dung width that tu head
                .in_h      (conv_out_y),   // TODO P3: dung height that tu head
                .in_conf   ({8'd0, conv_out_q}),
                .in_class  (conv_out_c[7:0]),
                .out_valid (cnn_out_valid),
                .out_last  (cnn_out_last),
                .out_x     (nms_x),
                .out_y     (nms_y),
                .out_w     (nms_w),
                .out_h     (nms_h),
                .out_conf  (nms_conf),
                .out_class (cnn_out_class)
            );

            assign cnn_out_x    = nms_x;
            assign cnn_out_y    = nms_y;
            assign cnn_out_w    = nms_w;
            assign cnn_out_h    = nms_h;
            assign cnn_out_conf = nms_conf[7:0];
        end
        else begin : g_mock_path
            // Duong mock / blob khong dung SPI flash / conv / NMS
            assign spi_cs   = 1'b1;
            assign spi_sclk = 1'b0;
            assign spi_mosi = 1'b0;

            // Drive cac net CNN ve 0 de khong con canh bao EX1998 (net khong
            // co driver) khi BBOX_SOURCE != 2. Cac net nay da bi toi uu khoi
            // mach, nhung GowinSynthesis van kiem tra driver o muc netlist.
            assign cnn_out_valid = 1'b0;
            assign cnn_out_last  = 1'b0;
            assign cnn_out_x     = 16'd0;
            assign cnn_out_y     = 16'd0;
            assign cnn_out_w     = 16'd0;
            assign cnn_out_h     = 16'd0;
            assign cnn_out_class = 8'd0;
            assign cnn_out_conf  = 8'd0;
        end
    endgenerate

    // =========================================================================
    // BLOB PATH (chi instantiate khi BBOX_SOURCE = 1)
    //
    // Tinh truc tiep tren pixel RGB565 cua OV2640 trong domain cam_pclk.
    // Ket qua qua CDC (1 bit toggle + 3FF sync) sang clk_100m.
    // Khong dung BSRAM, khong dung DSP.
    // =========================================================================
    wire        blob_valid;
    wire        blob_last;
    wire [15:0] blob_x, blob_y;
    wire [7:0]  blob_w, blob_h, blob_conf, blob_class;

    generate
        if (BBOX_SOURCE == 1) begin : g_blob_gen
            kvc_blob_detect u_blob (
                .pclk        (cam_pclk),
                .prst_n      (rst_n),
                .pixel       (cap_pixel_data),
                .pixel_valid (cap_pixel_valid),
                .href        (cam_href),
                .vsync       (cam_vsync),
                .frame_valid (cap_frame_valid),
                .clk         (clk_100m),
                .rst_n       (rst_n),
                .bbox_valid  (blob_valid),
                .bbox_last   (blob_last),
                .bbox_x      (blob_x),
                .bbox_y      (blob_y),
                .bbox_w      (blob_w),
                .bbox_h      (blob_h),
                .bbox_conf   (blob_conf),
                .bbox_class  (blob_class)
            );
        end else begin : g_blob_off
            assign blob_valid = 1'b0;
            assign blob_last  = 1'b0;
            assign blob_x     = 16'd0;
            assign blob_y     = 16'd0;
            assign blob_w     = 8'd0;
            assign blob_h     = 8'd0;
            assign blob_conf  = 8'd0;
            assign blob_class = 8'd0;
        end
    endgenerate

    // =========================================================================
    // MOCK BBOX (chi khi BBOX_SOURCE = 0)
    // =========================================================================
    wire        mock_valid;
    wire        mock_frame_done;
    wire [63:0] mock_bbox_data;
    wire [7:0]  mock_bbox_count;
    // KVC-CAM-DIAG-20261101: bao hieu bbox dang phat la bbox DAU TIEN trong
    // frame. Dua ra ngoai generate de khong reference `u_mock.send_idx` tu
    // ngoai (se loi bien dich khi BBOX_SOURCE = 2 — instance khong ton tai).
    wire        mock_first_bbox;

    generate
        if (BBOX_SOURCE == 0) begin : g_mock_gen
            // Trigger mock o tan so frame gia lap. Trong phan cung that dung
            // cam_vsync (~30 Hz). Neu khong co camera, dung bo dem chia tan.
            //
            // 100 MHz / 500_000 = 200 Hz (5 ms).
            //
            // CHI PHI 1 FRAME (N=2):
            //   kich thuoc = 8 header + 2*8 bbox + 2 CRC = 26 byte
            //   UART 8N1 = 10 bit/byte
            //   BAUD_DIV = 100 MHz / 38.400 = 2.604 cycle/bit
            //   => 26 * 10 * 2.604 = 677.040 cycle = 6,771 ms
            //
            // VI 6,771 ms > 5 ms nen trigger 200 Hz KHONG du thoi gian: mot
            // trong hai trigger bi bo (`bbox_packetizer` chi nhan `start` o
            // S_IDLE). Ket qua do duoc tren bo va trong tb_kvc_top_demo_rate:
            //   chu ky on dinh = 10 ms = 100,0 FPS (khong phai 200).
            //
            // Comment cu ghi "26 byte x 2604 cycle = 67.704 cycle (~0,68 ms)"
            // — thieu he so 10 bit/byte nen sai 10 lan, dan den ket luan sai
            // rang 200 Hz la kha thi.
            //
            // Muon 200 FPS that: giam N, hoac tang baud (can approval vi ABI
            // IF-01 da khoa 38.400), hoac tang MOCK_DIV cho khong bi bo.
            localparam integer MOCK_DIV = 500_000;
            reg [31:0] mock_tick;
            always @(posedge clk_100m or negedge rst_n) begin
                if (!rst_n)                       mock_tick <= 32'd0;
                else if (mock_tick == MOCK_DIV-1) mock_tick <= 32'd0;
                else                              mock_tick <= mock_tick + 32'd1;
            end
            wire mock_trigger = (mock_tick == MOCK_DIV-1) | cam_vsync_pulse;

            mock_bbox #(.MAX_BBOX(12)) u_mock (
                .clk           (clk_100m),
                .rst_n         (rst_n),
                .trigger       (mock_trigger),
                .mode          (2'b10),          // 2 box: person + lifebuoy
                .bbox_data     (mock_bbox_data),
                .bbox_valid    (mock_valid),
                .bbox_count_out(mock_bbox_count),
                .frame_done    (mock_frame_done),
                .bbox_first    (mock_first_bbox)
            );
        end
        else begin : g_mock_off
            assign mock_valid       = 1'b0;
            assign mock_frame_done  = 1'b0;
            assign mock_bbox_data   = 64'd0;
            assign mock_bbox_count  = 8'd0;
            assign mock_first_bbox  = 1'b0;
        end
    endgenerate

    // -------------------------------------------------------------------------
    // Chon nguon BBOX: 0 = mock, 1 = blob that, 2 = CNN that
    // `BBOX_SOURCE` la parameter hang so nen tool se toi uu bo cac nhanh khong
    // duoc chon.
    // -------------------------------------------------------------------------
    wire mock_sel = (BBOX_SOURCE == 0);
    wire blob_sel = (BBOX_SOURCE == 1);

    wire        bbox_valid_raw = mock_sel ? mock_valid      : (blob_sel ? blob_valid      : cnn_out_valid);
    wire        bbox_last_raw  = mock_sel ? mock_frame_done : (blob_sel ? blob_last       : cnn_out_last);
    wire [7:0]  bbox_class_raw = mock_sel ? mock_bbox_data[55:48] : (blob_sel ? blob_class  : cnn_out_class);
    wire [7:0]  bbox_conf_raw  = mock_sel ? mock_bbox_data[63:56] : (blob_sel ? blob_conf   : cnn_out_conf);

    wire [15:0] bbox_x_raw = mock_sel ? mock_bbox_data[15:0]  : (blob_sel ? blob_x     : cnn_out_x);
    wire [15:0] bbox_y_raw = mock_sel ? mock_bbox_data[31:16] : (blob_sel ? blob_y     : cnn_out_y);
    wire [7:0]  bbox_w_raw = mock_sel ? mock_bbox_data[39:32] : (blob_sel ? blob_w     : cnn_out_w[7:0]);
    wire [7:0]  bbox_h_raw = mock_sel ? mock_bbox_data[47:40] : (blob_sel ? blob_h     : cnn_out_h[7:0]);

    // =========================================================================
    // TU DO VSYNC (KVC-CAM-DIAG-20261102) — thay cho scope/LA
    //
    // `DIAG_MODE = 2` BAT che do nay. Blob/CNN van chay y nguyen de con do
    // duoc `frame_pulse` (so frame FPGA thuc su phat); chi DUONG RA UART bi
    // thay bang bao cao do nhip.
    //
    // `frame_pulse` lay tu `bbox_last_raw` — tuc truoc khi bi ghi de — nen no
    // dem dung so frame nguon da phat, khong phai so bao cao chan doan.
    //
    // Chi tiet anh xa 6 bbox: xem fpga/src/processing/vsync_report.v
    // =========================================================================
    wire        diag_valid, diag_last;
    wire [15:0] diag_x, diag_y;
    wire [7:0]  diag_w, diag_h, diag_conf, diag_class;

    generate
        if (DIAG_MODE == 2) begin : g_vsync_diag
            wire        mon_snap;
            // cua so
            wire [15:0] w_vsync, w_periods, w_sum, w_min, w_max;
            wire [15:0] w_b1x, w_b2x, w_b3x, w_b5x, w_b6x;
            wire [15:0] w_bshort, w_bother, w_rejected;
            // tich luy
            wire [15:0] t_vsync, t_frame, t_max, t_rejected;
            wire [15:0] t_b1x, t_b2x, t_b3x, t_b5x, t_b6x;
            wire [15:0] t_bshort, t_bother;

            vsync_monitor #(
                .CLK_HZ   (100_000_000),
                .TICK_HZ  (DIAG_TICK_HZ),
                .WINDOW_MS(DIAG_WINDOW_MS),
                .GLITCH_MS(DIAG_GLITCH_MS)
            ) u_vsync_mon (
                .clk         (clk_100m),
                .rst_n       (rst_n),
                .vsync_pulse (cam_vsync_pulse),
                .frame_pulse (bbox_last_raw),
                .snap        (mon_snap),
                .w_vsync     (w_vsync),
                .w_periods   (w_periods),
                .w_sum_100us (w_sum),
                .w_min_ms    (w_min),
                .w_max_ms    (w_max),
                .w_b1x       (w_b1x),
                .w_b2x       (w_b2x),
                .w_b3x       (w_b3x),
                .w_b5x       (w_b5x),
                .w_b6x       (w_b6x),
                .w_bshort    (w_bshort),
                .w_bother    (w_bother),
                .w_rejected  (w_rejected),
                .t_vsync     (t_vsync),
                .t_frame     (t_frame),
                .t_max_ms    (t_max),
                .t_rejected  (t_rejected),
                .t_b1x       (t_b1x),
                .t_b2x       (t_b2x),
                .t_b3x       (t_b3x),
                .t_b5x       (t_b5x),
                .t_b6x       (t_b6x),
                .t_bshort    (t_bshort),
                .t_bother    (t_bother)
            );

            vsync_report #(.N_SLOT(12)) u_vsync_rep (
                .clk         (clk_100m),
                .rst_n       (rst_n),
                .snap        (mon_snap),
                .w_vsync     (w_vsync),
                .w_periods   (w_periods),
                .w_sum_100us (w_sum),
                .w_min_ms    (w_min),
                .w_max_ms    (w_max),
                .w_b1x       (w_b1x),
                .w_b2x       (w_b2x),
                .w_b3x       (w_b3x),
                .w_b5x       (w_b5x),
                .w_b6x       (w_b6x),
                .w_bshort    (w_bshort),
                .w_bother    (w_bother),
                .w_rejected  (w_rejected),
                .t_vsync     (t_vsync),
                .t_frame     (t_frame),
                .t_max_ms    (t_max),
                .t_rejected  (t_rejected),
                .t_b1x       (t_b1x),
                .t_b2x       (t_b2x),
                .t_b3x       (t_b3x),
                .t_b5x       (t_b5x),
                .t_b6x       (t_b6x),
                .t_bshort    (t_bshort),
                .t_bother    (t_bother),
                .bbox_x      (diag_x),
                .bbox_y      (diag_y),
                .bbox_w      (diag_w),
                .bbox_h      (diag_h),
                .bbox_conf   (diag_conf),
                .bbox_class  (diag_class),
                .bbox_valid  (diag_valid),
                .bbox_last   (diag_last)
            );
        end else begin : g_vsync_diag_off
            assign diag_valid = 1'b0;
            assign diag_last  = 1'b0;
            assign diag_x     = 16'd0;
            assign diag_y     = 16'd0;
            assign diag_w     = 8'd0;
            assign diag_h     = 8'd0;
            assign diag_conf  = 8'd0;
            assign diag_class = 8'd0;
        end
    endgenerate

    // =========================================================================
    // THONG KE MAU RGB565 (KVC-CAM-DIAG-20261103, muc G6.1.9)
    //
    // Ly do ton tai: `kvc_blob_detect` chi tra loi "co pixel khop nguong khong",
    // khong tra loi "mau that la gi". Muc 6.1.9 can gia tri R/G/B that de biet
    // nguong trong blob_detect co dung khong. Duong du lieu khong mang pixel ra
    // ngoai, nen phai do bang duong chan doan rieng.
    //
    // Chi tiet anh xa 6 slot: xem fpga/src/processing/pixel_stats.v
    // =========================================================================
    wire        ps_valid, ps_last;
    wire [15:0] ps_x, ps_y;
    wire [7:0]  ps_w, ps_h, ps_conf, ps_class;

    generate
        if (DIAG_MODE == 3) begin : g_pixstat
            pixel_stats #(
                .N_SLOT (12)
            ) u_pixstat (
                .pclk        (cam_pclk),
                .prst_n      (rst_n),
                .pixel       (cap_pixel_data),
                .pixel_valid (cap_pixel_valid),
                .href        (cam_href),
                .vsync       (cam_vsync),
                .frame_valid (cap_frame_valid),
                .clk         (clk_100m),
                .rst_n       (rst_n),
                .st_x        (ps_x),
                .st_y        (ps_y),
                .st_w        (ps_w),
                .st_h        (ps_h),
                .st_conf     (ps_conf),
                .st_class    (ps_class),
                .st_valid    (ps_valid),
                .st_last     (ps_last)
            );
        end else begin : g_pixstat_off
            assign ps_valid = 1'b0;
            assign ps_last  = 1'b0;
            assign ps_x     = 16'd0;
            assign ps_y     = 16'd0;
            assign ps_w     = 8'd0;
            assign ps_h     = 8'd0;
            assign ps_conf  = 8'd0;
            assign ps_class = 8'd0;
        end
    endgenerate

    // Khi DIAG_MODE = 2, bao cao chan doan THAY THE nguon bbox ra UART.
    // Khi DIAG_MODE = 3, bao cao thong ke mau cung thay the nguon bbox.
    wire diag_sel     = (DIAG_MODE == 2);
    wire pixstat_sel  = (DIAG_MODE == 3);

    wire        bbox_valid_src = diag_sel ? diag_valid : (pixstat_sel ? ps_valid : bbox_valid_raw);
    wire        bbox_last_src  = diag_sel ? diag_last  : (pixstat_sel ? ps_last  : bbox_last_raw);
    wire [7:0]  bbox_class_src = diag_sel ? diag_class : (pixstat_sel ? ps_class : bbox_class_raw);
    wire [7:0]  bbox_conf_src  = diag_sel ? diag_conf  : (pixstat_sel ? ps_conf  : bbox_conf_raw);

    wire [15:0] bbox_x_src = diag_sel ? diag_x : (pixstat_sel ? ps_x : bbox_x_raw);
    wire [15:0] bbox_y_src = diag_sel ? diag_y : (pixstat_sel ? ps_y : bbox_y_raw);
    wire [7:0]  bbox_w_src = diag_sel ? diag_w : (pixstat_sel ? ps_w : bbox_w_raw);
    wire [7:0]  bbox_h_src = diag_sel ? diag_h : (pixstat_sel ? ps_h : bbox_h_raw);

    // -------------------------------------------------------------------------
    // Chan doan: ghi de X/Y cua bbox DAU TIEN.
    //
    // `mock_first_bbox` cao khi bbox dang phat la bbox 1 cua frame, va CHI cao
    // o duong mock (g_mock_off gan 0). Nho vay dieu kien duoi day khong bao gio
    // dung khi BBOX_SOURCE != 0 -> X/Y cua blob that khong bi ghi de.
    //
    // Y mang trang thai SCCB (Gate G0): y = {14'd0, cfg_error, cfg_done}
    //   0 = SCCB chua xong, 1 = xong khong loi, 3 = xong nhung co ACK error
    //
    // Khi DIAG_MODE = 0, X/Y tra ve gia tri nguon.
    // Chan doan X/Y chi ap dung cho DIAG_MODE = 1 (mock); DIAG_MODE = 2 da co
    // duong bao cao rieng nen KHONG ghi de.
    // -------------------------------------------------------------------------
    wire [15:0] diag_status_y = {14'd0, cfg_error, cfg_done};

    wire [15:0] bbox_x_final = (DIAG_MODE == 1 && mock_first_bbox) ? vsync_cnt     : bbox_x_src;
    wire [15:0] bbox_y_final = (DIAG_MODE == 1 && mock_first_bbox) ? diag_status_y : bbox_y_src;


    // 64-bit BBox Little-Endian, khop parser C cua MCU (kvc_fpga_bbox.c:281-286):
    //   byte0-1 X, byte2-3 Y, byte4 W, byte5 H, byte6 class, byte7 conf
    // => word64 = { conf, class, H, W, Y, X }
    wire [63:0] bbox_data_src = {
        bbox_conf_src,
        bbox_class_src,
        bbox_h_src,
        bbox_w_src,
        bbox_y_final,
        bbox_x_final
    };

    wire [7:0] pack_uart_tx_data;
    wire       pack_uart_tx_start;
    wire       pack_packet_done;
    wire       uart_tx_busy_sig;

    // Timestamp 32-bit, DON VI MILI-GIAY (MCU hieu la ms theo IF-01 §3).
    // Truoc day dem truc tiep tick 100 MHz -> MCU doc sai don vi va tran
    // sau 42,9 s. Chia 100.000 de ra 1 ms.
    localparam integer MS_DIV = 100_000;   // 100 MHz / 100 kHz = 1 kHz = 1 ms

    reg [31:0] ms_div_cnt;
    reg [31:0] frame_timestamp;
    always @(posedge clk_100m or negedge rst_n) begin
        if (!rst_n) begin
            ms_div_cnt      <= 32'd0;
            frame_timestamp <= 32'd0;
        end else if (ms_div_cnt == MS_DIV - 1) begin
            ms_div_cnt      <= 32'd0;
            frame_timestamp <= frame_timestamp + 32'd1;
        end else begin
            ms_div_cnt <= ms_div_cnt + 32'd1;
        end
    end

    // Frame bbox counter
    reg [7:0] nms_box_count;
    always @(posedge clk_100m or negedge rst_n) begin
        if (!rst_n) begin
            nms_box_count <= 8'd0;
        end else if (bbox_valid_src) begin
            nms_box_count <= nms_box_count + 8'd1;
        end else if (pack_packet_done) begin
            nms_box_count <= 8'd0;
        end
    end

    bbox_packetizer #(
        .MAX_BBOX(12),
        .VERSION(8'h01)
    ) u_bbox_pkt (
        .clk           (clk_100m),
        .rst_n         (rst_n),
        .bbox_data     (bbox_data_src),
        .bbox_valid    (bbox_valid_src),
        .bbox_count    (nms_box_count),
        .timestamp     (frame_timestamp),
        .start         (bbox_last_src),
        .force_bad_crc (1'b0),
        .uart_tx_busy  (uart_tx_busy_sig),
        .uart_tx_data  (pack_uart_tx_data),
        .uart_tx_start (pack_uart_tx_start),
        .packet_done   (pack_packet_done)
    );

    uart_tx #(
        .CLK_FREQ_HZ(100_000_000),
        .BAUD_RATE(38400)
    ) u_uart_tx (
        .clk      (clk_100m),
        .rst_n    (rst_n),
        .tx_data  (pack_uart_tx_data),
        .tx_valid (1'b0),
        .tx_start (pack_uart_tx_start),
        .tx_ready (),
        .tx_pin   (uart_tx),
        .tx       (),
        .tx_busy  (uart_tx_busy_sig),
        .tx_done  ()
    );

    // --- DATA_READY Controller (MCU Sonix handshaking) ---
    wire timeout_flag;

    // clear_timeout: xoa co timeout khi bat dau frame moi
    // (khong hard-wire 0 — F-N14 cua review luot 2)
    data_ready_ctrl #(
        .CLK_FREQ_HZ(100_000_000),
        .SIM(0)
    ) u_dr_ctrl (
        .clk           (clk_100m),
        .rst_n         (rst_n),
        .frame_valid   (bbox_last_src),
        .packet_done   (pack_packet_done),
        .mcu_ack       (mcu_ack),
        .clear_timeout (cam_vsync_pulse),
        .timeout_ms    (16'd100),
        .data_ready    (data_ready),
        .timeout_flag  (timeout_flag)
    );

    // KVC-CAM-20261031: `led_camera_ok` truoc day = cfg_done & cap_frame_valid,
    // nhung cfg_done luon len du SCCB NACK -> LED khong noi len duoc gi.
    // Nay them dieu kien !cfg_error. LUU Y: cap_frame_valid chi cao trong luc
    // VSYNC cao (~0,6 ms moi 33 ms), duty < 2 %, nen LED gan nhu TAT ke ca khi
    // camera chay dung. Dung LED de ket luan la sai.
    // Thay vao do: doc `cfg_error` qua UART chan doan (xem khuyen nghi task).
    assign led_camera_ok = cfg_done & ~cfg_error & cap_frame_valid;
    assign led_cnn_done  = mock_sel ? mock_frame_done : (blob_sel ? blob_last : cnn_out_last);
    assign led_uart_busy = data_ready | uart_tx_busy_sig;

endmodule
