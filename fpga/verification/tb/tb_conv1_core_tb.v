
`timescale 1ns/1ps

module tb_conv1_core_tb;

    reg clk;
    reg rst_n;
    reg start;
    reg term_valid;
    reg term_last;

    reg [7:0] x_u8;
    reg signed [7:0] w_s8;
    reg signed [31:0] bias;
    reg [4:0] channel_idx;

    wire [7:0] y_out;
    wire signed [31:0] acc_out;
    wire busy;
    wire done;

    integer errors;

    conv1_core dut (
        .clk(clk),
        .rst_n(rst_n),
        .start(start),
        .term_valid(term_valid),
        .term_last(term_last),
        .x_u8(x_u8),
        .w_s8(w_s8),
        .bias(bias),
        .channel_idx(channel_idx),
        .y_out(y_out),
        .acc_out(acc_out),
        .busy(busy),
        .done(done)
    );

    always #5 clk = ~clk;

    initial begin
        clk = 0;
        rst_n = 0;
        start = 0;
        term_valid = 0;
        term_last = 0;
        x_u8 = 8'd1;
        w_s8 = 0;
        bias = 0;
        channel_idx = 0;
        errors = 0;

        // Reset
        repeat (3) @(posedge clk);
        @(negedge clk);
        rst_n = 1;

        // Bat dau MAC voi bias = 100
        bias = 32'sd100;
        start = 1;
        @(negedge clk);
        start = 0;

        // Term 1: (x - 1) * w = (11 - 1) * 2 = 20
        x_u8 = 8'd11;
        w_s8 = 8'sd2;
        term_valid = 1;
        term_last = 0;

        @(negedge clk);

        // Term 2: (x - 1) * w = (6 - 1) * 3 = 15
        x_u8 = 8'd6;
        w_s8 = 8'sd3;
        term_last = 1;

        @(negedge clk);
        term_valid = 0;
        term_last = 0;

        // Cho tin hieu done va acc cap nhat on dinh
        #1;

        // Expected accumulator = 100 + 20 + 15 = 135
        if (acc_out !== 32'sd135) begin
            $display("FAIL ACC: expected=135 actual=%0d", acc_out);
            errors = errors + 1;
        end

        // Channel 0, M = 2129822, F=30.
        // 135 * M / 2^30 rounds to 0; output = 123.
        if (y_out !== 8'd123) begin
            $display("FAIL Y: expected=123 actual=%0d", y_out);
            errors = errors + 1;
        end

        if (errors == 0)
            $display("PASS: conv1_core integration smoke test");
        else
            $display("FAIL: errors=%0d", errors);

        $finish;
    end

endmodule
