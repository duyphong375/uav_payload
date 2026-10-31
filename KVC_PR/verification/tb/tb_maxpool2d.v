// -----------------------------------------------------------------------------
// tb_maxpool2d.v — Verify maxpool2d (NCHW, signed INT8, padding = -128)
//
// Golden tinh doc lap trong testbench (khong dung RTL).
// Bon cau hinh, moi cau hinh mot instance rieng voi start rieng:
//   A: 4x4 C1, K2 S2 P0      -> 2x2     (max co ban)
//   B: 5x5 C1, K3 S1 P1      -> 5x5     (padding vien)
//   C: 6x6 C2, K5 S1 P2      -> 6x6     (SPPF: cua so 5x5 = ca anh)
//   D: 1x1 C1, K1 S1 P0      -> 1x1     (pass-through)
//
// Exit: $fatal(1,...) khi mismatch
// -----------------------------------------------------------------------------
`timescale 1ns/1ps

module tb_maxpool2d;

    localparam integer ADDR_W = 16;
    localparam real    CLK_T  = 10.0;

    reg clk = 1'b0;
    reg rst_n = 1'b0;

    // start rieng cho tung DUT
    reg start_a = 1'b0, start_b = 1'b0, start_c = 1'b0, start_d = 1'b0;

    // input_data dung chung (chi DUT dang start moi doc)
    reg [7:0] input_data = 8'd0;

    // ── A: 4x4 C1, K2 S2 P0 ──
    wire [ADDR_W-1:0] a_in_addr;
    wire a_out_we; wire [ADDR_W-1:0] a_out_addr; wire [7:0] a_out_data;
    wire a_busy, a_done;
    maxpool2d #(.IN_W(4), .IN_H(4), .IN_C(1), .OUT_W(2), .OUT_H(2),
                .K_SIZE(2), .STRIDE(2), .PAD(0), .ADDR_W(ADDR_W)) dut_a (
        .clk(clk), .rst_n(rst_n), .start(start_a),
        .input_addr(a_in_addr), .input_data(input_data),
        .output_we(a_out_we), .output_addr(a_out_addr), .output_data(a_out_data),
        .busy(a_busy), .done(a_done)
    );

    // ── B: 5x5 C1, K3 S1 P1 ──
    wire [ADDR_W-1:0] b_in_addr;
    wire b_out_we; wire [ADDR_W-1:0] b_out_addr; wire [7:0] b_out_data;
    wire b_busy, b_done;
    maxpool2d #(.IN_W(5), .IN_H(5), .IN_C(1), .OUT_W(5), .OUT_H(5),
                .K_SIZE(3), .STRIDE(1), .PAD(1), .ADDR_W(ADDR_W)) dut_b (
        .clk(clk), .rst_n(rst_n), .start(start_b),
        .input_addr(b_in_addr), .input_data(input_data),
        .output_we(b_out_we), .output_addr(b_out_addr), .output_data(b_out_data),
        .busy(b_busy), .done(b_done)
    );

    // ── C: 6x6 C2, K5 S1 P2 (SPPF) ──
    wire [ADDR_W-1:0] c_in_addr;
    wire c_out_we; wire [ADDR_W-1:0] c_out_addr; wire [7:0] c_out_data;
    wire c_busy, c_done;
    maxpool2d #(.IN_W(6), .IN_H(6), .IN_C(2), .OUT_W(6), .OUT_H(6),
                .K_SIZE(5), .STRIDE(1), .PAD(2), .ADDR_W(ADDR_W)) dut_c (
        .clk(clk), .rst_n(rst_n), .start(start_c),
        .input_addr(c_in_addr), .input_data(input_data),
        .output_we(c_out_we), .output_addr(c_out_addr), .output_data(c_out_data),
        .busy(c_busy), .done(c_done)
    );

    // ── D: 1x1 C1, K1 S1 P0 ──
    wire [ADDR_W-1:0] d_in_addr;
    wire d_out_we; wire [ADDR_W-1:0] d_out_addr; wire [7:0] d_out_data;
    wire d_busy, d_done;
    maxpool2d #(.IN_W(1), .IN_H(1), .IN_C(1), .OUT_W(1), .OUT_H(1),
                .K_SIZE(1), .STRIDE(1), .PAD(0), .ADDR_W(ADDR_W)) dut_d (
        .clk(clk), .rst_n(rst_n), .start(start_d),
        .input_addr(d_in_addr), .input_data(input_data),
        .output_we(d_out_we), .output_addr(d_out_addr), .output_data(d_out_data),
        .busy(d_busy), .done(d_done)
    );

    // ── Memory ──
    reg [7:0] in_mem [0:4095];
    reg [7:0] out_mem[0:4095];

    always #(CLK_T/2) clk = ~clk;

    // Mo hinh RAM DONG BO (giong BSRAM that):
    //   - addr duoc dang ky o chu ky REQ
    //   - data tra ve o chu ky sau (WAIT_RAM)
    // Khong the dung mux combinational tren input_addr vi RTL doi addr
    // truoc khi data ve (state REQ -> WAIT_RAM -> SAMPLE).
    reg [7:0] in_q_a, in_q_b, in_q_c, in_q_d;
    reg       rd_a, rd_b, rd_c, rd_d;

    always @(posedge clk) begin
        // DUT A
        if (a_busy && a_in_addr < 4096) in_q_a <= in_mem[a_in_addr];
        // DUT B
        if (b_busy && b_in_addr < 4096) in_q_b <= in_mem[b_in_addr];
        // DUT C
        if (c_busy && c_in_addr < 4096) in_q_c <= in_mem[c_in_addr];
        // DUT D
        if (d_busy && d_in_addr < 4096) in_q_d <= in_mem[d_in_addr];
    end

    // input_data: chon theo DUT dang chay, lay tu thanh ghi da dang ky
    always @(*) begin
        if (a_busy)      input_data = in_q_a;
        else if (b_busy) input_data = in_q_b;
        else if (c_busy) input_data = in_q_c;
        else if (d_busy) input_data = in_q_d;
        else             input_data = 8'd0;
    end

    always @(posedge clk) begin
        if (a_out_we) out_mem[a_out_addr] <= a_out_data;
        if (b_out_we) out_mem[b_out_addr] <= b_out_data;
        if (c_out_we) out_mem[c_out_addr] <= c_out_data;
        if (d_out_we) out_mem[d_out_addr] <= d_out_data;
    end

    integer pass_cnt = 0;
    integer fail_cnt = 0;

    // ── Golden ──
    function automatic [7:0] ref_maxpool;
        input integer in_w, in_h;
        input integer k, s, p;
        input integer ox, oy;
        input integer base;
        integer kx, ky, ix, iy;
        reg signed [7:0] best, v;
        begin
            best = -8'sd128;
            for (ky = 0; ky < k; ky = ky + 1) begin
                for (kx = 0; kx < k; kx = kx + 1) begin
                    ix = ox*s + kx - p;
                    iy = oy*s + ky - p;
                    if (ix >= 0 && ix < in_w && iy >= 0 && iy < in_h) begin
                        v = $signed(in_mem[base + iy*in_w + ix]);
                        if (v > best) best = v;
                    end
                end
            end
            ref_maxpool = best;
        end
    endfunction

    task automatic run_case;
        input integer in_w, in_h, in_c, out_w, out_h, k, s, p;
        input integer which;
        input [255:0] tag;
        integer c, x, y, mism, total, guard;
        reg signed [7:0] exp_v, got_v;
        begin
            // nap input
            for (c = 0; c < in_c; c = c + 1)
                for (y = 0; y < in_h; y = y + 1)
                    for (x = 0; x < in_w; x = x + 1)
                        in_mem[c*in_h*in_w + y*in_w + x] = (c*97 + y*31 + x*7 + 13);

            // marker
            for (c = 0; c < out_w*out_h*in_c; c = c + 1)
                out_mem[c] = 8'hAA;

            // start
            @(posedge clk);
            case (which)
                0: start_a <= 1'b1;
                1: start_b <= 1'b1;
                2: start_c <= 1'b1;
                3: start_d <= 1'b1;
            endcase
            @(posedge clk);
            start_a <= 1'b0; start_b <= 1'b0; start_c <= 1'b0; start_d <= 1'b0;

            // cho done
            guard = 0;
            while (guard < 200000) begin
                @(posedge clk);
                case (which)
                    0: if (a_done) guard = 200000;
                    1: if (b_done) guard = 200000;
                    2: if (c_done) guard = 200000;
                    3: if (d_done) guard = 200000;
                endcase
                if (guard < 200000) guard = guard + 1;
            end
            if (guard != 200000) begin
                $display("FAIL %0s: timeout (guard=%0d)", tag, guard);
                fail_cnt = fail_cnt + 1;
                disable run_case;
            end

            // so sanh
            mism = 0; total = 0;
            for (c = 0; c < in_c; c = c + 1) begin
                for (y = 0; y < out_h; y = y + 1) begin
                    for (x = 0; x < out_w; x = x + 1) begin
                        exp_v = ref_maxpool(in_w, in_h, k, s, p, x, y, c*in_h*in_w);
                        got_v = $signed(out_mem[c*out_h*out_w + y*out_w + x]);
                        total = total + 1;
                        if (got_v !== exp_v) begin
                            if (mism < 5)
                                $display("FAIL %0s c=%0d y=%0d x=%0d: got %0d exp %0d",
                                         tag, c, y, x, got_v, exp_v);
                            mism = mism + 1;
                        end
                    end
                end
            end

            if (mism != 0) begin
                $display("FAIL %0s: %0d/%0d mismatch", tag, mism, total);
                fail_cnt = fail_cnt + 1;
            end else begin
                $display("  PASS %0s: %0d output", tag, total);
                pass_cnt = pass_cnt + 1;
            end

            repeat (5) @(posedge clk);
        end
    endtask

    initial begin
        $display("=== tb_maxpool2d ===");

        repeat (10) @(posedge clk);
        rst_n = 1'b1;
        repeat (5) @(posedge clk);

        run_case(4, 4, 1, 2, 2, 2, 2, 0, 0, "A: K2 S2 P0 4x4");
        run_case(5, 5, 1, 5, 5, 3, 1, 1, 1, "B: K3 S1 P1 5x5");
        run_case(6, 6, 2, 6, 6, 5, 1, 2, 2, "C: K5 S1 P2 6x6 C2 (SPPF)");
        run_case(1, 1, 1, 1, 1, 1, 1, 0, 3, "D: K1 S1 P0 1x1");

        $display("=== SUMMARY: PASS=%0d FAIL=%0d ===", pass_cnt, fail_cnt);
        if (fail_cnt != 0) $fatal(1, "tb_maxpool2d FAILED");
        $display("PASS: tb_maxpool2d completed");
        $finish;
    end

    initial begin
        #(CLK_T * 5000000);
        $fatal(1, "TIMEOUT: tb_maxpool2d");
    end

endmodule
