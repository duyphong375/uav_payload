// -----------------------------------------------------------------------------
// tb_kvc_top_demo_uartlink.v — Kiem tra duong FPGA -> MCU o MUC KHUNG THAT
//
// Khac voi tb_kvc_top_demo (chi dem canh xuong), TB nay lap mot BO THU UART
// DOC LAP giai ma dung 8N1 @38.400 tu chan uart_tx that cua DUT, roi dua byte
// vao PARSER IF-01 giong het firmware MCU (sync, version, N<=12, CRC16 LE).
//
// Muc dich: chung minh (hoac bac bo) rang MCU Sonix se nhan duoc frame, thay vi
// suy doan tu so canh xuong. Day la bang chung SIMULATED cho IF-01.
//
// BO THU lay mau tai TAM bit (0.5, 1.5, ... , 9.5 bit-time ke tu canh xuong
// start bit) va KIEM STOP BIT tai 9.5 bit-time. Neu thieu stop bit -> FE.
//
// Exit code: $fatal(1,...) khi fail.
// -----------------------------------------------------------------------------
`timescale 1ns/1ps

module tb_kvc_top_demo_uartlink;

    localparam real    CLK_T    = 10.0;              // 10 ns -> 100 MHz
    localparam integer BAUD     = 38_400;
    localparam integer BIT_CYC  = 100_000_000 / BAUD; // 2604 cycle = 26,04 us
    localparam real    BIT_T    = BIT_CYC * CLK_T;    // ns
    localparam integer MAX_N    = 12;
    localparam integer HDR_LEN  = 8;
    localparam integer BBOX_LEN = 8;
    localparam integer CRC_LEN  = 2;

    reg clk_27m = 1'b0;
    reg rst_n   = 1'b0;

    reg        cam_pclk  = 1'b0;
    reg        cam_vsync = 1'b0;
    reg        cam_href  = 1'b0;
    reg  [7:0] cam_data  = 8'd0;
    wire       cam_xclk;
    wire       ov2640_sda;
    wire       ov2640_scl;
    wire       spi_cs, spi_sclk, spi_mosi;
    reg        spi_miso = 1'b1;
    wire       uart_tx;
    wire       data_ready;
    reg        mcu_ack = 1'b0;
    wire       led_camera_ok, led_cnn_done, led_uart_busy;

    integer pass_cnt = 0;
    integer fail_cnt = 0;

    always #(CLK_T/2) clk_27m = ~clk_27m;

    kvc_top_demo #(
        .BBOX_SOURCE (0),
        .DIAG_MODE   (0)
    ) dut (
        .clk_27m      (clk_27m),
        .rst_n        (rst_n),
        .cam_pclk     (cam_pclk),
        .cam_vsync    (cam_vsync),
        .cam_href     (cam_href),
        .cam_data     (cam_data),
        .cam_xclk     (cam_xclk),
        .ov2640_sda   (ov2640_sda),
        .ov2640_scl   (ov2640_scl),
        .spi_cs       (spi_cs),
        .spi_sclk     (spi_sclk),
        .spi_mosi     (spi_mosi),
        .spi_miso     (spi_miso),
        .uart_tx      (uart_tx),
        .data_ready   (data_ready),
        .mcu_ack      (mcu_ack),
        .led_camera_ok(led_camera_ok),
        .led_cnn_done (led_cnn_done),
        .led_uart_busy(led_uart_busy)
    );

    // ------------------------------------------------------------------
    // Bo thu UART doc lap (8N1 @38.400)
    // ------------------------------------------------------------------
    integer   rx_byte_cnt   = 0;   // so byte giai ma duoc
    integer   rx_framing_err = 0;  // stop bit != 1 tai 9.5 bit-time
    integer   rx_valid_bytes = 0;  // byte hop le (stop=1)

    // Parser IF-01
    reg [7:0]  fbuf [0:(HDR_LEN + MAX_N*BBOX_LEN + CRC_LEN - 1)];
    integer    fidx       = 0;
    integer    frame_ok   = 0;
    integer    frame_crc_err = 0;
    integer    frame_bad_sync = 0;
    integer    frame_bad_n = 0;
    integer    last_n     = -1;
    integer    last_crc   = 0;
    integer    bbox_seen  = 0;

    function automatic [15:0] crc16_ccitt_false;
        input [7:0] b;
        input [15:0] c;
        reg [15:0] x;
        integer k;
        begin
            x = c ^ (b << 8);
            for (k = 0; k < 8; k = k + 1)
                x = (x & 16'h8000) ? ((x << 1) ^ 16'h1021) : (x << 1);
            crc16_ccitt_false = x;
        end
    endfunction

    integer c;
    integer i;
    integer tot;

    task automatic push_byte;
        input [7:0] b;
        reg [15:0] crc_calc, crc_rx;
        begin
            if (fidx < (HDR_LEN + MAX_N*BBOX_LEN + CRC_LEN))
                fbuf[fidx] = b;
            fidx = fidx + 1;

            // Thu giai ma khi da co header
            if (fidx >= HDR_LEN) begin
                if (fbuf[0] !== 8'h5A || fbuf[1] !== 8'hA5) begin
                    // truot 1 byte
                    frame_bad_sync = frame_bad_sync + 1;
                    for (i = 0; i < fidx-1; i = i + 1) fbuf[i] = fbuf[i+1];
                    fidx = fidx - 1;
                end else if (fbuf[3] > MAX_N) begin
                    frame_bad_n = frame_bad_n + 1;
                    for (i = 0; i < fidx-1; i = i + 1) fbuf[i] = fbuf[i+1];
                    fidx = fidx - 1;
                end else begin
                    tot = HDR_LEN + fbuf[3]*BBOX_LEN + CRC_LEN;
                    if (fidx >= tot) begin
                        crc_calc = 16'hFFFF;
                        for (i = 0; i < HDR_LEN + fbuf[3]*BBOX_LEN; i = i + 1)
                            crc_calc = crc16_ccitt_false(fbuf[i], crc_calc);
                        crc_rx = {fbuf[tot-1], fbuf[tot-2]};  // little-endian
                        if (crc_calc === crc_rx) begin
                            frame_ok  = frame_ok + 1;
                            last_n    = fbuf[3];
                            last_crc  = crc_rx;
                            bbox_seen = bbox_seen + fbuf[3];
                        end else begin
                            frame_crc_err = frame_crc_err + 1;
                        end
                        fidx = 0;
                    end
                end
            end
        end
    endtask

    reg [7:0] rx_shift;
    integer   b;

    always begin : uart_rx
        @(negedge uart_tx);                    // start edge
        if (rst_n) begin
            #(BIT_T * 0.5);                    // tam start bit
            if (uart_tx !== 1'b0) begin
                rx_framing_err = rx_framing_err + 1;
            end else begin
                rx_shift = 8'h00;
                for (b = 0; b < 8; b = b + 1) begin
                    #(BIT_T);
                    rx_shift[b] = uart_tx;
                end
                #(BIT_T);                      // 9.5 bit-time = tam stop bit
                rx_byte_cnt = rx_byte_cnt + 1;
                if (uart_tx !== 1'b1) begin
                    rx_framing_err = rx_framing_err + 1;
                end else begin
                    rx_valid_bytes = rx_valid_bytes + 1;
                    push_byte(rx_shift);
                end
                #(BIT_T * 0.5);                // ra khoi vung stop truoc khi cho canh tiep
            end
        end
    end

    integer guard;

    initial begin
        $display("=== tb_kvc_top_demo_uartlink (bo thu 8N1 doc lap @%0d) ===", BAUD);
        $display("  BIT_T = %0.2f us (BIT_CYC=%0d @10ns)", BIT_T/1000.0, BIT_CYC);

        rst_n = 1'b0;
        repeat (50) @(posedge clk_27m);
        rst_n = 1'b1;

        guard = 0;
        while (frame_ok < 3 && guard < 60_000_000) begin
            @(posedge clk_27m);
            guard = guard + 1;
        end

        $display("  INFO: byte giai ma=%0d, byte hop le=%0d, framing err=%0d",
                 rx_byte_cnt, rx_valid_bytes, rx_framing_err);
        $display("  INFO: frame OK=%0d, CRC err=%0d, bad sync=%0d, N>%0d=%0d",
                 frame_ok, frame_crc_err, frame_bad_sync, MAX_N, frame_bad_n);
        if (frame_ok > 0)
            $display("  INFO: N=%0d, CRC cuoi=0x%04X, tong bbox=%0d",
                     last_n, last_crc, bbox_seen);

        // 1. Phai co it nhat 3 frame hop le
        if (frame_ok < 3) begin
            $display("FAIL: chi %0d frame hop le (can >=3)", frame_ok);
            fail_cnt = fail_cnt + 1;
        end else begin
            $display("  PASS nhan duoc %0d frame IF-01 hop le", frame_ok);
            pass_cnt = pass_cnt + 1;
        end

        // 2. Khong duoc co framing error: day la dieu kien de MCU fe=0
        if (rx_framing_err != 0) begin
            $display("FAIL: %0d framing error — thieu stop bit, MCU se bao FE",
                     rx_framing_err);
            fail_cnt = fail_cnt + 1;
        end else begin
            $display("  PASS 0 framing error tren %0d byte", rx_byte_cnt);
            pass_cnt = pass_cnt + 1;
        end

        // 3. Khong byte nao bi mat do stop bit
        if (rx_valid_bytes != rx_byte_cnt) begin
            $display("FAIL: %0d/%0d byte khong hop le", rx_byte_cnt - rx_valid_bytes, rx_byte_cnt);
            fail_cnt = fail_cnt + 1;
        end else begin
            $display("  PASS 100%% byte hop le (%0d/%0d)", rx_valid_bytes, rx_byte_cnt);
            pass_cnt = pass_cnt + 1;
        end

        // 4. Khong CRC error (mock_bbox co dinh, force_bad_crc=0)
        if (frame_crc_err != 0) begin
            $display("FAIL: %0d frame sai CRC", frame_crc_err);
            fail_cnt = fail_cnt + 1;
        end else begin
            $display("  PASS 0 CRC error");
            pass_cnt = pass_cnt + 1;
        end

        // 5. N dung 2 (mode 2'b10 cua mock_bbox)
        if (last_n != 2) begin
            $display("FAIL: N=%0d, ky vong 2 (mock mode 2'b10)", last_n);
            fail_cnt = fail_cnt + 1;
        end else begin
            $display("  PASS N=2 dung mock mode");
            pass_cnt = pass_cnt + 1;
        end

        $display("=== SUMMARY: PASS=%0d FAIL=%0d ===", pass_cnt, fail_cnt);
        if (fail_cnt != 0) $fatal(1, "tb_kvc_top_demo_uartlink FAILED");
        $display("PASS: tb_kvc_top_demo_uartlink completed");
        $finish;
    end

endmodule
