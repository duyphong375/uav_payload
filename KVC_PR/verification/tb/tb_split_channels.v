// -----------------------------------------------------------------------------
// tb_split_channels.v — Verify split_channels (chia NCHW theo kenh)
//
// Golden: kenh [0, FIRST_C) -> nhanh A, kenh [FIRST_C, C) -> nhanh B.
// Dia chi trong moi nhanh la `local_c*H*W + y*W + x`.
//
// Kiem:
//   1. C=4, FIRST_C=2, 2x2   -> A=8 byte, B=8 byte
//   2. C=8, FIRST_C=5, 2x2   -> chia le
//   3. C=3, FIRST_C=1, 3x1   -> FIRST_C nho
//
// Exit: $fatal(1,...) khi mismatch
// -----------------------------------------------------------------------------
`timescale 1ns/1ps

module tb_split_channels;

    localparam integer ADDR_W = 16;
    localparam real    CLK_T  = 10.0;

    reg clk = 1'b0;
    reg rst_n = 1'b0;
    reg start_1 = 1'b0, start_2 = 1'b0, start_3 = 1'b0;

    // input_data phai khai bao truoc khi dung trong instantiation
    reg [7:0] input_data;

    // ── Case 1: C=4 FIRST_C=2 2x2 ──
    wire [ADDR_W-1:0] in1_addr;
    wire a1_we, b1_we;
    wire [ADDR_W-1:0] a1_addr, b1_addr;
    wire [7:0] a1_data, b1_data;
    wire busy1, done1;
    split_channels #(.W(2), .H(2), .C(4), .FIRST_C(2), .ADDR_W(ADDR_W)) dut1 (
        .clk(clk), .rst_n(rst_n), .start(start_1),
        .input_addr(in1_addr), .input_data(input_data),
        .a_we(a1_we), .a_addr(a1_addr), .a_data(a1_data),
        .b_we(b1_we), .b_addr(b1_addr), .b_data(b1_data),
        .busy(busy1), .done(done1)
    );

    // ── Case 2: C=8 FIRST_C=5 2x2 ──
    wire [ADDR_W-1:0] in2_addr;
    wire a2_we, b2_we;
    wire [ADDR_W-1:0] a2_addr, b2_addr;
    wire [7:0] a2_data, b2_data;
    wire busy2, done2;
    split_channels #(.W(2), .H(2), .C(8), .FIRST_C(5), .ADDR_W(ADDR_W)) dut2 (
        .clk(clk), .rst_n(rst_n), .start(start_2),
        .input_addr(in2_addr), .input_data(input_data),
        .a_we(a2_we), .a_addr(a2_addr), .a_data(a2_data),
        .b_we(b2_we), .b_addr(b2_addr), .b_data(b2_data),
        .busy(busy2), .done(done2)
    );

    // ── Case 3: C=3 FIRST_C=1 3x1 ──
    wire [ADDR_W-1:0] in3_addr;
    wire a3_we, b3_we;
    wire [ADDR_W-1:0] a3_addr, b3_addr;
    wire [7:0] a3_data, b3_data;
    wire busy3, done3;
    split_channels #(.W(3), .H(1), .C(3), .FIRST_C(1), .ADDR_W(ADDR_W)) dut3 (
        .clk(clk), .rst_n(rst_n), .start(start_3),
        .input_addr(in3_addr), .input_data(input_data),
        .a_we(a3_we), .a_addr(a3_addr), .a_data(a3_data),
        .b_we(b3_we), .b_addr(b3_addr), .b_data(b3_data),
        .busy(busy3), .done(done3)
    );

    always #(CLK_T/2) clk = ~clk;

    // ── Memory ──
    reg [7:0] in_mem [0:255];
    reg [7:0] a_mem  [0:127];
    reg [7:0] b_mem  [0:127];

    // RAM dong bo: dang ky addr khi busy, tra ve chu ky sau
    reg [7:0] q1, q2, q3;
    always @(posedge clk) begin
        if (busy1) q1 <= in_mem[in1_addr[7:0]];
        if (busy2) q2 <= in_mem[in2_addr[7:0]];
        if (busy3) q3 <= in_mem[in3_addr[7:0]];
    end

    always @(*) begin
        if (busy1)      input_data = q1;
        else if (busy2) input_data = q2;
        else if (busy3) input_data = q3;
        else            input_data = 8'd0;
    end

    always @(posedge clk) begin
        if (a1_we) a_mem[a1_addr[6:0]] <= a1_data;
        if (b1_we) b_mem[b1_addr[6:0]] <= b1_data;
        if (a2_we) a_mem[a2_addr[6:0]] <= a2_data;
        if (b2_we) b_mem[b2_addr[6:0]] <= b2_data;
        if (a3_we) a_mem[a3_addr[6:0]] <= a3_data;
        if (b3_we) b_mem[b3_addr[6:0]] <= b3_data;
    end

    integer pass_cnt = 0;
    integer fail_cnt = 0;

    task automatic run_case;
        input integer W, H, C, FIRST_C;
        input integer which;
        input [255:0] tag;
        integer c, x, y, mism, total, guard, plane;
        integer local_c, exp_off, n_a, n_b;
        reg [7:0] exp_v, got_v;
        begin
            plane = W*H;

            // nap input
            for (c = 0; c < C; c = c + 1)
                for (y = 0; y < H; y = y + 1)
                    for (x = 0; x < W; x = x + 1)
                        in_mem[c*plane + y*W + x] = (c*41 + y*13 + x*5 + 7);

            // marker
            for (c = 0; c < 128; c = c + 1) begin
                a_mem[c] = 8'hAA;
                b_mem[c] = 8'hBB;
            end

            // start
            @(posedge clk);
            case (which)
                1: start_1 <= 1'b1;
                2: start_2 <= 1'b1;
                3: start_3 <= 1'b1;
            endcase
            @(posedge clk);
            start_1 <= 1'b0; start_2 <= 1'b0; start_3 <= 1'b0;

            // cho done
            guard = 0;
            while (guard < 100000) begin
                @(posedge clk);
                case (which)
                    1: if (done1) guard = 100000;
                    2: if (done2) guard = 100000;
                    3: if (done3) guard = 100000;
                endcase
                if (guard < 100000) guard = guard + 1;
            end
            if (guard != 100000) begin
                $display("FAIL %0s: timeout", tag);
                fail_cnt = fail_cnt + 1;
                disable run_case;
            end

            // so sanh nhanh A
            mism = 0; total = 0;
            for (c = 0; c < FIRST_C; c = c + 1)
                for (y = 0; y < H; y = y + 1)
                    for (x = 0; x < W; x = x + 1) begin
                        exp_v = in_mem[c*plane + y*W + x];
                        got_v = a_mem[c*plane + y*W + x];
                        total = total + 1;
                        if (got_v !== exp_v) begin
                            if (mism < 3)
                                $display("FAIL %0s A c=%0d y=%0d x=%0d: got %02X exp %02X",
                                         tag, c, y, x, got_v, exp_v);
                            mism = mism + 1;
                        end
                    end

            // so sanh nhanh B
            for (c = FIRST_C; c < C; c = c + 1)
                for (y = 0; y < H; y = y + 1)
                    for (x = 0; x < W; x = x + 1) begin
                        local_c = c - FIRST_C;
                        exp_v = in_mem[c*plane + y*W + x];
                        got_v = b_mem[local_c*plane + y*W + x];
                        total = total + 1;
                        if (got_v !== exp_v) begin
                            if (mism < 6)
                                $display("FAIL %0s B c=%0d y=%0d x=%0d: got %02X exp %02X",
                                         tag, c, y, x, got_v, exp_v);
                            mism = mism + 1;
                        end
                    end

            if (mism != 0) begin
                $display("FAIL %0s: %0d/%0d mismatch", tag, mism, total);
                fail_cnt = fail_cnt + 1;
            end else begin
                $display("  PASS %0s: %0d output (A=%0d B=%0d)",
                         tag, total, FIRST_C*plane, (C-FIRST_C)*plane);
                pass_cnt = pass_cnt + 1;
            end

            repeat (5) @(posedge clk);
        end
    endtask

    initial begin
        $display("=== tb_split_channels ===");

        repeat (10) @(posedge clk);
        rst_n = 1'b1;
        repeat (5) @(posedge clk);

        run_case(2, 2, 4, 2, 1, "1: C=4 FIRST=2 2x2");
        run_case(2, 2, 8, 5, 2, "2: C=8 FIRST=5 2x2 (chia le)");
        run_case(3, 1, 3, 1, 3, "3: C=3 FIRST=1 3x1");

        $display("=== SUMMARY: PASS=%0d FAIL=%0d ===", pass_cnt, fail_cnt);
        if (fail_cnt != 0) $fatal(1, "tb_split_channels FAILED");
        $display("PASS: tb_split_channels completed");
        $finish;
    end

    initial begin
        #(CLK_T * 5000000);
        $fatal(1, "TIMEOUT: tb_split_channels");
    end

endmodule
