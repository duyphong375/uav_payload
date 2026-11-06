
`timescale 1ns/1ps

module conv1_mac_real_tb;

    reg clk = 0;
    always #5 clk = ~clk;

    reg rst_n = 0;
    reg start = 0;
    reg term_valid = 0;
    reg term_last = 0;

    reg [7:0] x_u8 = 0;
    reg signed [7:0] w_s8 = 0;
    reg signed [31:0] bias = 0;

    wire signed [31:0] acc;
    wire busy, done;

    // Du lieu Conv1: input NCHW, weight OIHW
    reg [7:0] input_mem [0:1638399];
    reg [7:0] weight_mem [0:4607];
    reg signed [31:0] bias_mem [0:31];

    integer ic, ky, kx;
    integer iy, ix;
    integer input_idx, weight_idx;
    integer expected_acc;
    integer term_count;

    conv1_mac #(.ACC_W(32)) dut (
        .clk(clk),
        .rst_n(rst_n),
        .start(start),
        .bias(bias),
        .term_valid(term_valid),
        .x_u8(x_u8),
        .w_s8(w_s8),
        .term_last(term_last),
        .acc(acc),
        .busy(busy),
        .done(done)
    );

    initial begin
        $display("Loading Conv1 HEX files...");

        $readmemh("verification/data/conv1/input_q.hex", input_mem);
        $readmemh("verification/data/conv1/weight_int8.hex", weight_mem);
        $readmemh("verification/data/conv1/bias_int32.hex", bias_mem);

        $display("HEX files loaded.");

        // Chon output channel 0, output pixel (0,0)
        expected_acc = bias_mem[0];
        term_count = 0;

        // Reset
        repeat (3) @(negedge clk);
        rst_n = 1;
        @(negedge clk);

        bias = bias_mem[0];
        start = 1;
        @(negedge clk);
        start = 0;

        // 16 input channels x 3 x 3 kernel = 144 terms
        for (ic = 0; ic < 16; ic = ic + 1) begin
            for (ky = 0; ky < 3; ky = ky + 1) begin
                for (kx = 0; kx < 3; kx = kx + 1) begin

                    // Output (0,0), stride 2, padding 1
                    iy = ky - 1;
                    ix = kx - 1;

                    // Input padding is represented by quantized zero point 1
                    if (iy < 0 || iy >= 320 ||
                        ix < 0 || ix >= 320) begin
                        x_u8 = 8'd1;
                    end else begin
                        input_idx = ic*320*320 + iy*320 + ix;
                        x_u8 = input_mem[input_idx];
                    end

                    weight_idx = ((0*16 + ic)*3 + ky)*3 + kx;
                    w_s8 = $signed(weight_mem[weight_idx]);

                    term_valid = 1;
                    if (term_count == 143)
                        term_last = 1;
                    else
                        term_last = 0;

                    // Software reference accumulator
                    expected_acc = expected_acc
                        + (($signed({1'b0, x_u8}) - 1)
                        * $signed(w_s8));

                    @(negedge clk);
                    term_count = term_count + 1;
                end
            end
        end

        term_valid = 0;
        term_last = 0;

        // Wait for final registered result
        #1;
        $display("--------------------------------");
        $display("Terms       : %0d", term_count);
        $display("Expected ACC: %0d", expected_acc);
        $display("RTL ACC     : %0d", acc);
        $display("busy        : %b", busy);
        $display("done        : %b", done);

        if (term_count == 144 &&
            acc === expected_acc &&
            busy === 1'b0 &&
            done === 1'b1)
            $display("PASS: Conv1 MAC real data");
        else
            $display("FAIL: Conv1 MAC real data");

        $finish;
    end

endmodule
