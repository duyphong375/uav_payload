// -----------------------------------------------------------------------------
// tb_bbox_packetizer.v — Testbench co assertion cho bbox_packetizer
//
// PHUONG PHAP: mo phong DUNG parser C cua MCU
// (firmware/mcu_payload/src/sensors/kvc_fpga_bbox.c:255-299):
//   - gom byte vao buffer cho den khi du expected_len = 8 + 8N + 2
//   - CRC = buf[len-2] | buf[len-1]<<8   (Little-Endian)
//   - tinh lai CRC-16/CCITT-FALSE tren buf[0..len-3]
//   - x_center = p[0] | p[1]<<8   (Little-Endian)
//
// Neu test nay PASS thi FPGA va MCU thong nhat byte order, khong chi
// "RTL tu dong y voi chinh no".
//
// Kiem 3 truong hop: N=0, N=2, N=12
// Exit code: $fatal(1,...) khi fail
// -----------------------------------------------------------------------------
`timescale 1ns/1ps

module tb_bbox_packetizer;

    localparam integer CLK_HZ   = 100_000_000;
    localparam real    CLK_T    = 10.0;
    localparam integer MAX_BBOX = 12;

    reg        clk = 1'b0;
    reg        rst_n = 1'b0;

    reg  [63:0] bbox_data = 64'd0;
    reg         bbox_valid = 1'b0;
    reg  [7:0]  bbox_count = 8'd0;
    reg  [31:0] timestamp = 32'd0;
    reg         start = 1'b0;
    reg         force_bad_crc = 1'b0;

    wire [7:0]  uart_tx_data;
    wire        uart_tx_start;
    wire        packet_done;
    reg         uart_tx_busy = 1'b0;

    integer     pass_cnt = 0;
    integer     fail_cnt = 0;

    always #(CLK_T/2) clk = ~clk;

    bbox_packetizer #(
        .MAX_BBOX(MAX_BBOX),
        .VERSION (8'h01)
    ) dut (
        .clk           (clk),
        .rst_n         (rst_n),
        .bbox_data     (bbox_data),
        .bbox_valid    (bbox_valid),
        .bbox_count    (bbox_count),
        .timestamp     (timestamp),
        .start         (start),
        .force_bad_crc (force_bad_crc),
        .uart_tx_busy  (uart_tx_busy),
        .uart_tx_data  (uart_tx_data),
        .uart_tx_start (uart_tx_start),
        .packet_done   (packet_done)
    );

    // ---------------------------------------------------------------------
    // Thu thap byte UART: moi uart_tx_start la 1 byte moi.
    // Gia lap uart_tx_busy = 1 trong vai chu ky de mo phong thoi gian truyen.
    // ---------------------------------------------------------------------
    reg [7:0] rx_buf [0:255];
    integer   rx_len;

    // Mo phong uart_tx: nhan uart_tx_start -> busy trong N chu ky -> nha busy.
    // Bat byte tren canh dau tien cua start (du lieu da on dinh truoc do).
    localparam integer UART_FAKE_CYCLES = 5;

    integer fake_busy_cnt = 0;
    always @(posedge clk) begin
        if (!rst_n) begin
            uart_tx_busy  <= 1'b0;
            fake_busy_cnt <= 0;
        end else if (uart_tx_start && fake_busy_cnt == 0 && !uart_tx_busy) begin
            rx_buf[rx_len] = uart_tx_data;
            rx_len         = rx_len + 1;
            uart_tx_busy   <= 1'b1;
            fake_busy_cnt  <= UART_FAKE_CYCLES;
        end else if (fake_busy_cnt > 0) begin
            fake_busy_cnt <= fake_busy_cnt - 1;
            if (fake_busy_cnt == 1) uart_tx_busy <= 1'b0;
        end
    end

    // ---------------------------------------------------------------------
    // CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF, khong reflect)
    // Giong het kvc_bbox_calc_crc16() trong firmware MCU.
    // ---------------------------------------------------------------------
    function automatic [15:0] crc16_ccitt_false;
        input integer len;
        integer i, b;
        reg [15:0] crc;
        reg [7:0]  d;
        begin
            crc = 16'hFFFF;
            for (i = 0; i < len; i = i + 1) begin
                d = rx_buf[i];
                crc = crc ^ ({8'h00, d} << 8);
                for (b = 0; b < 8; b = b + 1) begin
                    if (crc[15]) crc = (crc << 1) ^ 16'h1021;
                    else         crc = crc << 1;
                end
            end
            crc16_ccitt_false = crc;
        end
    endfunction

    // ---------------------------------------------------------------------
    // Gui N bbox roi kiem tra khung nhu parser MCU
    // ---------------------------------------------------------------------
    reg [15:0] exp_x [0:MAX_BBOX-1];
    reg [15:0] exp_y [0:MAX_BBOX-1];
    reg [7:0]  exp_w [0:MAX_BBOX-1];
    reg [7:0]  exp_h [0:MAX_BBOX-1];
    reg [7:0]  exp_cls [0:MAX_BBOX-1];
    reg [7:0]  exp_conf [0:MAX_BBOX-1];

    task automatic run_case;
        input integer n;
        input [31:0] ts;
        integer i, expected_len, timeout;
        reg [15:0] rx_crc, calc_crc;
        reg [15:0] got_x, got_y;
        begin
            rx_len = 0;
            force_bad_crc = 1'b0;

            // 1. Bam N bbox vao (dung layout word64 = {conf,class,H,W,Y,X})
            for (i = 0; i < n; i = i + 1) begin
                exp_x[i]    = 16'h0100 + i * 16'h0011;
                exp_y[i]    = 16'h0200 + i * 16'h0007;
                exp_w[i]    = 8'h10 + i;
                exp_h[i]    = 8'h20 + i;
                exp_cls[i]  = (i % 2 == 0) ? 8'h01 : 8'h02;
                exp_conf[i] = 8'd80 + i;

                @(posedge clk);
                bbox_data  <= {exp_conf[i], exp_cls[i], exp_h[i], exp_w[i], exp_y[i], exp_x[i]};
                bbox_valid <= 1'b1;
            end
            @(posedge clk);
            bbox_valid <= 1'b0;
            bbox_count <= n[7:0];
            timestamp  <= ts;

            // 2. Trigger gui
            @(posedge clk);
            start <= 1'b1;
            @(posedge clk);
            start <= 1'b0;

            // 3. Cho packet_done
            timeout = 0;
            while (!packet_done && timeout < 200000) begin
                @(posedge clk);
                timeout = timeout + 1;
            end
            if (!packet_done) begin
                $display("FAIL N=%0d: packet_done never asserted", n);
                fail_cnt = fail_cnt + 1;
                disable run_case;
            end
            @(posedge clk);

            // 4. Kiem do dai
            expected_len = 8 + n * 8 + 2;
            if (rx_len != expected_len) begin
                $display("FAIL N=%0d: rx_len=%0d expected=%0d", n, rx_len, expected_len);
                fail_cnt = fail_cnt + 1;
                disable run_case;
            end else pass_cnt = pass_cnt + 1;

            // 5. Sync + version + count
            if (rx_buf[0] !== 8'h5A || rx_buf[1] !== 8'hA5) begin
                $display("FAIL N=%0d: sync = %02X %02X", n, rx_buf[0], rx_buf[1]);
                fail_cnt = fail_cnt + 1;
            end else pass_cnt = pass_cnt + 1;

            if (rx_buf[2] !== 8'h01) begin
                $display("FAIL N=%0d: version = %02X", n, rx_buf[2]);
                fail_cnt = fail_cnt + 1;
            end else pass_cnt = pass_cnt + 1;

            if (rx_buf[3] !== n[7:0]) begin
                $display("FAIL N=%0d: count = %02X", n, rx_buf[3]);
                fail_cnt = fail_cnt + 1;
            end else pass_cnt = pass_cnt + 1;

            // 6. Timestamp Little-Endian (giong kvc_fpga_bbox.c:274-277)
            if ({rx_buf[7], rx_buf[6], rx_buf[5], rx_buf[4]} !== ts) begin
                $display("FAIL N=%0d: timestamp = %02X%02X%02X%02X expect %08X",
                         n, rx_buf[7], rx_buf[6], rx_buf[5], rx_buf[4], ts);
                fail_cnt = fail_cnt + 1;
            end else pass_cnt = pass_cnt + 1;

            // 7. CRC Little-Endian (giong kvc_fpga_bbox.c:266-267)
            rx_crc   = {rx_buf[expected_len-1], rx_buf[expected_len-2]};
            calc_crc = crc16_ccitt_false(expected_len - 2);
            if (rx_crc !== calc_crc) begin
                $display("FAIL N=%0d: CRC rx=%04X calc=%04X (Little-Endian read)", n, rx_crc, calc_crc);
                fail_cnt = fail_cnt + 1;
            end else begin
                $display("  PASS N=%0d CRC=%04X", n, rx_crc);
                pass_cnt = pass_cnt + 1;
            end

            // 8. Tung BBox Little-Endian (giong kvc_fpga_bbox.c:281-286)
            for (i = 0; i < n; i = i + 1) begin
                got_x = {rx_buf[8+i*8+1], rx_buf[8+i*8+0]};
                got_y = {rx_buf[8+i*8+3], rx_buf[8+i*8+2]};
                if (got_x !== exp_x[i]) begin
                    $display("FAIL N=%0d bbox[%0d]: X=%04X expect %04X", n, i, got_x, exp_x[i]);
                    fail_cnt = fail_cnt + 1;
                end else pass_cnt = pass_cnt + 1;

                if (got_y !== exp_y[i]) begin
                    $display("FAIL N=%0d bbox[%0d]: Y=%04X expect %04X", n, i, got_y, exp_y[i]);
                    fail_cnt = fail_cnt + 1;
                end else pass_cnt = pass_cnt + 1;

                if (rx_buf[8+i*8+4] !== exp_w[i]) begin
                    $display("FAIL N=%0d bbox[%0d]: W=%02X expect %02X", n, i, rx_buf[8+i*8+4], exp_w[i]);
                    fail_cnt = fail_cnt + 1;
                end else pass_cnt = pass_cnt + 1;

                if (rx_buf[8+i*8+5] !== exp_h[i]) begin
                    $display("FAIL N=%0d bbox[%0d]: H=%02X expect %02X", n, i, rx_buf[8+i*8+5], exp_h[i]);
                    fail_cnt = fail_cnt + 1;
                end else pass_cnt = pass_cnt + 1;

                if (rx_buf[8+i*8+6] !== exp_cls[i]) begin
                    $display("FAIL N=%0d bbox[%0d]: class=%02X expect %02X", n, i, rx_buf[8+i*8+6], exp_cls[i]);
                    fail_cnt = fail_cnt + 1;
                end else pass_cnt = pass_cnt + 1;

                if (rx_buf[8+i*8+7] !== exp_conf[i]) begin
                    $display("FAIL N=%0d bbox[%0d]: conf=%02X expect %02X", n, i, rx_buf[8+i*8+7], exp_conf[i]);
                    fail_cnt = fail_cnt + 1;
                end else pass_cnt = pass_cnt + 1;
            end

            repeat (10) @(posedge clk);
        end
    endtask

    // ---------------------------------------------------------------------
    // Kiem force_bad_crc phai bi phat hien
    // ---------------------------------------------------------------------
    task automatic run_bad_crc_case;
        integer timeout, expected_len;
        reg [15:0] rx_crc, calc_crc;
        begin
            rx_len = 0;
            force_bad_crc = 1'b1;

            @(posedge clk);
            bbox_data  <= {8'd77, 8'h01, 8'd20, 8'd10, 16'h0300, 16'h0400};
            bbox_valid <= 1'b1;
            @(posedge clk);
            bbox_valid <= 1'b0;
            bbox_count <= 8'd1;
            timestamp  <= 32'hDEADBEEF;

            @(posedge clk);
            start <= 1'b1;
            @(posedge clk);
            start <= 1'b0;

            timeout = 0;
            while (!packet_done && timeout < 200000) begin
                @(posedge clk);
                timeout = timeout + 1;
            end
            @(posedge clk);

            expected_len = 8 + 8 + 2;
            rx_crc   = {rx_buf[expected_len-1], rx_buf[expected_len-2]};
            calc_crc = crc16_ccitt_false(expected_len - 2);
            if (rx_crc === calc_crc) begin
                $display("FAIL: force_bad_crc khong lam hong CRC (rx=%04X calc=%04X)", rx_crc, calc_crc);
                fail_cnt = fail_cnt + 1;
            end else begin
                $display("  PASS force_bad_crc: rx=%04X != calc=%04X", rx_crc, calc_crc);
                pass_cnt = pass_cnt + 1;
            end

            force_bad_crc = 1'b0;
            repeat (10) @(posedge clk);
        end
    endtask

    // ---------------------------------------------------------------------
    // F-04: timestamp phai duoc CHOT tai `start`, khong bi xe (torn read)
    //
    // LOI CU: ts0..ts3 doc truc tiep tu cong `timestamp`. Header 8 byte phat
    // trong 2,08 ms, counter 1 ms tang 2 lan -> neu co nho (carry) giua hai
    // lan doc thi 4 byte ghep lai khong ung voi moc nao. Tren bo da do duoc
    // mot khung LUI 59 ms (F02_card_20261102.bin khung 15).
    //
    // TEST NAY: doi `timestamp` LIEN TUC trong luc dang phat, o cac gia tri
    // co carry o byte thap, roi khang dinh khung phat ra mang DUNG gia tri
    // tai canh `start` — khong mang gia tri nao khac.
    // ---------------------------------------------------------------------
    reg        ts_hopping = 1'b0;
    reg [31:0] ts_hop_val = 32'd0;
    integer    ts_hop_cnt = 0;

    // Doi timestamp moi 3 chu ky khi duoc bat. Moi lan doi deu tao carry:
    //   0x000000FF -> 0x00000100, 0x0000FFFF -> 0x00010000, ...
    //
    // QUAN TRONG: `ts_hop_cnt` phai duoc KHOI TAO (= 0). Ban dau khai bao
    // `integer ts_hop_cnt;` khong khoi tao -> gia tri X -> `X % 3` la X ->
    // dieu kien khong bao gio dung -> timestamp KHONG doi -> test "pass" ca
    // khi KHONG co latch. Da kiem bang cach tam bo latch: ban dau van PASS,
    // tuc test vo dung. Nay co khoi tao va co lai phep thu am.
    always @(posedge clk) begin
        if (ts_hopping) begin
            ts_hop_cnt <= ts_hop_cnt + 1;
            if (ts_hop_cnt % 3 == 0) begin
                ts_hop_val <= ts_hop_val + 32'd1;
                timestamp  <= ts_hop_val + 32'd1;
            end
        end
    end

    task automatic run_torn_ts_case;
        input [31:0] ts_at_start;
        integer timeout, expected_len;
        reg [31:0] got_ts;
        begin
            rx_len = 0;
            force_bad_crc = 1'b0;
            ts_hopping = 1'b0;

            // Dat timestamp dung tai gia tri co carry o byte thap nhat
            ts_hop_val = ts_at_start;
            timestamp  = ts_at_start;
            ts_hop_cnt = 0;

            @(posedge clk);
            bbox_data  <= {8'd70, 8'h02, 8'd30, 8'd20, 16'h0123, 16'h0456};
            bbox_valid <= 1'b1;
            @(posedge clk);
            bbox_valid <= 1'b0;
            bbox_count <= 8'd1;

            // Bam start TRUOC, roi moi bat dau doi timestamp: nhu vay gia tri
            // chot phai la `ts_at_start` chinh xac.
            @(posedge clk);
            start <= 1'b1;
            @(posedge clk);
            start <= 1'b0;

            // Bay gio moi doi timestamp, trong suot thoi gian phat header.
            ts_hopping = 1'b1;

            timeout = 0;
            while (!packet_done && timeout < 400000) begin
                @(posedge clk);
                timeout = timeout + 1;
            end
            ts_hopping = 1'b0;

            if (!packet_done) begin
                $display("FAIL F-04: packet_done never asserted");
                fail_cnt = fail_cnt + 1;
                disable run_torn_ts_case;
            end
            @(posedge clk);

            expected_len = 8 + 8 + 2;
            got_ts = {rx_buf[7], rx_buf[6], rx_buf[5], rx_buf[4]};

            if (got_ts !== ts_at_start) begin
                $display("FAIL F-04: ts phat ra = %08X, phai = %08X (bi xe)",
                         got_ts, ts_at_start);
                fail_cnt = fail_cnt + 1;
            end else begin
                $display("  PASS F-04: ts = %08X du timestamp doi lien tuc",
                         got_ts);
                pass_cnt = pass_cnt + 1;
            end

            // Kiem them: counter DUNG LA da doi trong luc phat. Neu khong doi
            // thi test nay vo nghia (chinh la loi cua ban TB dau tien).
            if (ts_hop_val === ts_at_start) begin
                $display("FAIL F-04: timestamp KHONG doi trong test -> test vo dung");
                fail_cnt = fail_cnt + 1;
            end else begin
                $display("  PASS F-04: timestamp da doi %0d lan trong luc phat",
                         ts_hop_val - ts_at_start);
                pass_cnt = pass_cnt + 1;
            end

            repeat (10) @(posedge clk);
        end
    endtask

    initial begin
        $display("=== tb_bbox_packetizer (doi chieu parser C cua MCU) ===");

        repeat (10) @(posedge clk);
        rst_n = 1'b1;
        repeat (5) @(posedge clk);

        run_case(0,  32'h00000000);
        run_case(2,  32'h00000140);
        run_case(12, 32'hDEADBEEF);
        run_bad_crc_case;

        // F-04: ba gia tri co carry o byte thap / byte 2 / byte 3.
        // Neu thieu latch, got_ts se lech o it nhat mot trong ba.
        run_torn_ts_case(32'h000000FF);
        run_torn_ts_case(32'h0000FFFF);
        run_torn_ts_case(32'h00FFFFFF);

        $display("=== SUMMARY: PASS=%0d FAIL=%0d ===", pass_cnt, fail_cnt);
        if (fail_cnt != 0) $fatal(1, "tb_bbox_packetizer FAILED with %0d error(s)", fail_cnt);
        $display("PASS: tb_bbox_packetizer completed");
        $finish;
    end

    initial begin
        #(CLK_T * 2000000);
        $fatal(1, "TIMEOUT: tb_bbox_packetizer exceeded simulation limit");
    end

endmodule
