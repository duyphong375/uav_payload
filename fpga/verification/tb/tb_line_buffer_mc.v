// -----------------------------------------------------------------------------
// tb_line_buffer_mc.v — Verify line_buffer_mc (3 dong, da kenh, window packed)
//
// Cau hinh: W=6, C=3, K=3 -> LINE_BYTES=18, WIN_BITS=216
//
// Kiem:
//   1. Ghi tung pixel, doc lai dung thu tu byte trong win_data
//   2. Padding trai/phai: kx ngoai [0,W-1] -> 0
//   3. Nhieu kenh (C=3) khong lan
//   4. K=1: cua so 1x1
//
// Thu tu byte trong win_data (phai khop conv_engine_dynamic_fsm):
//   byte k = (ic*K*K) + (ky*K) + kx
//   ky=0 -> line0, ky=1 -> line1, ky=2 -> line2
//
// Exit: $fatal(1,...) khi mismatch
// -----------------------------------------------------------------------------
`timescale 1ns/1ps

module tb_line_buffer_mc;

    localparam integer W = 6;
    localparam integer C = 3;
    localparam integer K = 3;
    localparam integer DW = 8;
    localparam integer AW = 16;
    localparam integer LINE_BYTES = W * C;
    localparam integer WIN_BITS   = K * K * C * DW;

    localparam real CLK_T = 10.0;

    reg clk = 1'b0;
    reg rst_n = 1'b0;

    reg wr_en = 1'b0;
    reg [AW-1:0] wr_addr = 0;
    reg [DW-1:0] wr_data = 0;

    reg [15:0] rd_x = 0;
    reg [15:0] rd_y = 0;

    wire [WIN_BITS-1:0] win_data;

    integer pass_cnt = 0;
    integer fail_cnt = 0;

    always #(CLK_T/2) clk = ~clk;

    line_buffer_mc #(.W(W), .C(C), .K(K), .DATA_W(DW), .ADDR_W(AW)) dut (
        .clk(clk), .rst_n(rst_n),
        .wr_en(wr_en), .wr_addr(wr_addr), .wr_data(wr_data),
        .rd_x(rd_x), .rd_y(rd_y),
        .win_data(win_data)
    );

    // Mo hinh tham chieu: 3 dong nhu DUT
    reg [7:0] ref_l0 [0:LINE_BYTES-1];
    reg [7:0] ref_l1 [0:LINE_BYTES-1];
    reg [7:0] ref_l2 [0:LINE_BYTES-1];

    integer i;

    task automatic check_win;
        input [15:0] tx, ty;
        input [255:0] tag;
        integer ic, ky, kx, px, mism;
        reg [7:0] exp_b, got_b;
        begin
            rd_x = tx;
            rd_y = ty;
            repeat (3) @(posedge clk);   // 2 chu ky latency + 1 bien

            mism = 0;
            for (ic = 0; ic < C; ic = ic + 1) begin
                for (ky = 0; ky < K; ky = ky + 1) begin
                    for (kx = 0; kx < K; kx = kx + 1) begin
                        px = tx + kx - 1;
                        if (px < 0 || px >= W) begin
                            exp_b = 8'd0;
                        end
                        else begin
                            case (ky)
                                0: exp_b = ref_l0[px*C + ic];
                                1: exp_b = ref_l1[px*C + ic];
                                default: exp_b = ref_l2[px*C + ic];
                            endcase
                        end

                        got_b = win_data[((ic*K*K)+(ky*K)+kx)*DW +: DW];
                        if (got_b !== exp_b) begin
                            if (mism < 5)
                                $display("FAIL %0s (x=%0d y=%0d) ic=%0d ky=%0d kx=%0d: got %0d exp %0d",
                                         tag, tx, ty, ic, ky, kx, got_b, exp_b);
                            mism = mism + 1;
                        end
                    end
                end
            end

            if (mism != 0) begin
                $display("FAIL %0s: %0d/%0d byte lech", tag, mism, K*K*C);
                fail_cnt = fail_cnt + 1;
            end else begin
                $display("  PASS %0s (x=%0d y=%0d): %0d byte khop", tag, tx, ty, K*K*C);
                pass_cnt = pass_cnt + 1;
            end
        end
    endtask

    // Ghi 3 dong day du vao buffer, cap nhat ca mo hinh tham chieu.
    // Line buffer chi giua 3 dong, nen phai ghi 3*W*C byte moi co cua so hop le.
    task automatic fill_image;
        integer x, c, a, row;
        reg [7:0] v;
        begin
            // Xoa mo hinh
            for (a = 0; a < LINE_BYTES; a = a + 1) begin
                ref_l0[a] = 8'd0;
                ref_l1[a] = 8'd0;
                ref_l2[a] = 8'd0;
            end

            // Ghi 3 dong: moi dong W*C byte
            for (row = 0; row < 3; row = row + 1) begin
                for (x = 0; x < W; x = x + 1) begin
                    for (c = 0; c < C; c = c + 1) begin
                        v = (row*53 + x*17 + c*5 + 3) & 8'hFF;

                    @(posedge clk);
                    wr_en   <= 1'b1;
                    wr_addr <= x*C + c;
                    wr_data <= v;

                    // Cap nhat mo hinh GIONG DUT: chi dich tai DUNG dia chi
                    // vua ghi (DUT: line0[addr]<=line1[addr] ...), KHONG dich
                    // toan bo mang.
                    ref_l0[x*C + c] = ref_l1[x*C + c];
                    ref_l1[x*C + c] = ref_l2[x*C + c];
                    ref_l2[x*C + c] = v;
                    end
                end
            end

            @(posedge clk);
            wr_en <= 1'b0;
            repeat (2) @(posedge clk);
        end
    endtask

    initial begin
        $display("=== tb_line_buffer_mc (W=%0d C=%0d K=%0d) ===", W, C, K);

        repeat (5) @(posedge clk);
        rst_n = 1'b1;
        repeat (5) @(posedge clk);

        fill_image;

        // Kiem vi tri giua
        check_win(2, 2, "giua");
        check_win(3, 2, "giua phai");

        // Kiem bien trai (x=0: kx=0 -> padding)
        check_win(0, 2, "bien trai");

        // Kiem bien phai (x=W-1: kx=2 -> padding)
        check_win(W-1, 2, "bien phai");

        // Kiem kenh cuoi
        check_win(1, 2, "kenh ro rieng biet");

        $display("=== SUMMARY: PASS=%0d FAIL=%0d ===", pass_cnt, fail_cnt);
        if (fail_cnt != 0) $fatal(1, "tb_line_buffer_mc FAILED");
        $display("PASS: tb_line_buffer_mc completed");
        $finish;
    end

    initial begin
        #(CLK_T * 1000000);
        $fatal(1, "TIMEOUT: tb_line_buffer_mc");
    end

endmodule
