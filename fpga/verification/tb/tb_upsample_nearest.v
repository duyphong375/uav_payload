// -----------------------------------------------------------------------------
// tb_upsample_nearest.v — Verify upsample_nearest (nearest neighbour, NCHW)
//
// Golden: out[c, oy, ox] = in[c, oy/SF, ox/SF]
//
// Kiem:
//   1. SF=2, 3x2 C1 -> 6x4
//   2. SF=2, 2x2 C2 -> 4x4
//   3. SF=4, 2x1 C1 -> 8x4
//
// Exit: $fatal(1,...) khi mismatch
// -----------------------------------------------------------------------------
`timescale 1ns/1ps

module tb_upsample_nearest;

    localparam integer ADDR_W = 16;
    localparam real    CLK_T  = 10.0;

    reg clk = 1'b0;
    reg rst_n = 1'b0;
    reg start_1 = 1'b0, start_2 = 1'b0, start_3 = 1'b0;

    reg [7:0] input_data;

    // ── Case 1: SF=2, IN 3x2 C1 -> 6x4 ──
    wire [ADDR_W-1:0] in1_addr;
    wire o1_we; wire [ADDR_W-1:0] o1_addr; wire [7:0] o1_data;
    wire busy1, done1;
    upsample_nearest #(.IN_W(3), .IN_H(2), .IN_C(1), .SCALE_FACTOR(2), .ADDR_W(ADDR_W)) dut1 (
        .clk(clk), .rst_n(rst_n), .start(start_1),
        .input_addr(in1_addr), .input_data(input_data),
        .output_we(o1_we), .output_addr(o1_addr), .output_data(o1_data),
        .busy(busy1), .done(done1)
    );

    // ── Case 2: SF=2, IN 2x2 C2 -> 4x4 ──
    wire [ADDR_W-1:0] in2_addr;
    wire o2_we; wire [ADDR_W-1:0] o2_addr; wire [7:0] o2_data;
    wire busy2, done2;
    upsample_nearest #(.IN_W(2), .IN_H(2), .IN_C(2), .SCALE_FACTOR(2), .ADDR_W(ADDR_W)) dut2 (
        .clk(clk), .rst_n(rst_n), .start(start_2),
        .input_addr(in2_addr), .input_data(input_data),
        .output_we(o2_we), .output_addr(o2_addr), .output_data(o2_data),
        .busy(busy2), .done(done2)
    );

    // ── Case 3: SF=4, IN 2x1 C1 -> 8x4 ──
    wire [ADDR_W-1:0] in3_addr;
    wire o3_we; wire [ADDR_W-1:0] o3_addr; wire [7:0] o3_data;
    wire busy3, done3;
    upsample_nearest #(.IN_W(2), .IN_H(1), .IN_C(1), .SCALE_FACTOR(4), .ADDR_W(ADDR_W)) dut3 (
        .clk(clk), .rst_n(rst_n), .start(start_3),
        .input_addr(in3_addr), .input_data(input_data),
        .output_we(o3_we), .output_addr(o3_addr), .output_data(o3_data),
        .busy(busy3), .done(done3)
    );

    always #(CLK_T/2) clk = ~clk;

    reg [7:0] in_mem [0:127];
    reg [7:0] out_mem[0:255];

    // RAM dong bo
    reg [7:0] q1, q2, q3;
    always @(posedge clk) begin
        if (busy1) q1 <= in_mem[in1_addr[6:0]];
        if (busy2) q2 <= in_mem[in2_addr[6:0]];
        if (busy3) q3 <= in_mem[in3_addr[6:0]];
    end

    always @(*) begin
        if (busy1)      input_data = q1;
        else if (busy2) input_data = q2;
        else if (busy3) input_data = q3;
        else            input_data = 8'd0;
    end

    always @(posedge clk) begin
        if (o1_we) out_mem[o1_addr[7:0]] <= o1_data;
        if (o2_we) out_mem[o2_addr[7:0]] <= o2_data;
        if (o3_we) out_mem[o3_addr[7:0]] <= o3_data;
    end

    integer pass_cnt = 0;
    integer fail_cnt = 0;

    task automatic run_case;
        input integer IN_W, IN_H, IN_C, SF;
        input integer which;
        input [255:0] tag;
        integer OUT_W, OUT_H, plane_in, plane_out;
        integer c, ox, oy, ix, iy, mism, total, guard;
        reg [7:0] exp_v, got_v;
        begin
            OUT_W = IN_W * SF;
            OUT_H = IN_H * SF;
            plane_in  = IN_W * IN_H;
            plane_out = OUT_W * OUT_H;

            // nap input
            for (c = 0; c < IN_C*plane_in; c = c + 1)
                in_mem[c] = (c*37 + 11);

            // marker
            for (c = 0; c < IN_C*plane_out; c = c + 1)
                out_mem[c] = 8'hAA;

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

            // so sanh
            mism = 0; total = 0;
            for (c = 0; c < IN_C; c = c + 1) begin
                for (oy = 0; oy < OUT_H; oy = oy + 1) begin
                    for (ox = 0; ox < OUT_W; ox = ox + 1) begin
                        iy = oy / SF;
                        ix = ox / SF;
                        exp_v = in_mem[c*plane_in + iy*IN_W + ix];
                        got_v = out_mem[c*plane_out + oy*OUT_W + ox];
                        total = total + 1;
                        if (got_v !== exp_v) begin
                            if (mism < 5)
                                $display("FAIL %0s c=%0d oy=%0d ox=%0d: got %02X exp %02X",
                                         tag, c, oy, ox, got_v, exp_v);
                            mism = mism + 1;
                        end
                    end
                end
            end

            if (mism != 0) begin
                $display("FAIL %0s: %0d/%0d mismatch", tag, mism, total);
                fail_cnt = fail_cnt + 1;
            end else begin
                $display("  PASS %0s: %0d output (%0dx%0d -> %0dx%0d, C=%0d)",
                         tag, total, IN_W, IN_H, OUT_W, OUT_H, IN_C);
                pass_cnt = pass_cnt + 1;
            end

            repeat (5) @(posedge clk);
        end
    endtask

    initial begin
        $display("=== tb_upsample_nearest ===");

        repeat (10) @(posedge clk);
        rst_n = 1'b1;
        repeat (5) @(posedge clk);

        run_case(3, 2, 1, 2, 1, "1: SF=2 3x2 C1");
        run_case(2, 2, 2, 2, 2, "2: SF=2 2x2 C2");
        run_case(2, 1, 1, 4, 3, "3: SF=4 2x1 C1");

        $display("=== SUMMARY: PASS=%0d FAIL=%0d ===", pass_cnt, fail_cnt);
        if (fail_cnt != 0) $fatal(1, "tb_upsample_nearest FAILED");
        $display("PASS: tb_upsample_nearest completed");
        $finish;
    end

    initial begin
        #(CLK_T * 5000000);
        $fatal(1, "TIMEOUT: tb_upsample_nearest");
    end

endmodule
