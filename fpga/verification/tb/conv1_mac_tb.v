
`timescale 1ns/1ps

module conv1_mac_tb;

    reg clk;
    reg rst_n;
    reg start;
    reg signed [31:0] bias;
    reg term_valid;
    reg [7:0] x_u8;
    reg signed [7:0] w_s8;
    reg term_last;

    wire signed [31:0] acc;
    wire busy;
    wire done;

    conv1_mac #(
        .ACC_W(32)
    ) dut (
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

    always #5 clk = ~clk;

    initial begin
        clk = 0;
        rst_n = 0;
        start = 0;
        bias = 0;
        term_valid = 0;
        x_u8 = 0;
        w_s8 = 0;
        term_last = 0;

        // Reset
        #20;
        rst_n = 1;
        #10;

        // Start MAC, bias = 10
        bias = 10;
        start = 1;
        #10;
        start = 0;

        // Term 1: (5 - 1) * 2 = 8
        x_u8 = 5;
        w_s8 = 2;
        term_valid = 1;
        term_last = 0;
        #10;

        // Term 2: (3 - 1) * (-2) = -4
        x_u8 = 3;
        w_s8 = -2;
        term_last = 1;
        #10;

        term_valid = 0;
        term_last = 0;
        #10;

        // Expected acc = 10 + 8 - 4 = 14
        if (acc === 32'sd14 && done === 1'b0) begin
            $display("PASS: acc = %0d", acc);
        end else if (acc === 32'sd14) begin
            $display("PASS: acc = %0d", acc);
        end else begin
            $display("FAIL: acc = %0d, expected 14", acc);
        end

        $finish;
    end

endmodule
