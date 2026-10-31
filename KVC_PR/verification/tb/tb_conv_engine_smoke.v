`timescale 1ns/1ps

module tb_conv_engine_smoke;
    reg clk = 1'b0;
    always #5 clk = ~clk;

    reg rst_n = 1'b0;
    reg start = 1'b0;

    wire [23:0] input_addr;
    wire [23:0] weight_addr;
    reg [7:0] input_data = 8'd0;
    reg signed [7:0] weight_data = 8'sd0;

    wire [9:0] bias_addr;
    wire [9:0] quant_addr;
    reg signed [31:0] bias_data = 32'sd0;
    reg signed [31:0] quant_multiplier = 32'sd1;
    reg [5:0] quant_shift = 6'd0;

    wire output_we;
    wire [23:0] output_addr;
    wire [7:0] output_data;
    wire busy;
    wire done;

    reg [7:0] input_mem [0:0];
    reg signed [7:0] weight_mem [0:0];
    reg signed [31:0] bias_mem [0:0];
    reg signed [31:0] mult_mem [0:0];
    reg [5:0] shift_mem [0:0];

    integer seen = 0;

    conv_engine #(
        .IN_W(1), .IN_H(1), .IN_C(1),
        .OUT_W(1), .OUT_H(1), .OUT_C(1),
        .K_SIZE(1), .STRIDE(1), .GROUPS(1), .PAD(0),
        .INPUT_IS_SIGNED(1), .INPUT_ZERO_POINT(0),
        .OUTPUT_IS_SIGNED(1), .OUTPUT_ZERO_POINT(0)
    ) dut (
        .clk(clk), .rst_n(rst_n), .start(start),
        .input_addr(input_addr), .input_data(input_data),
        .weight_addr(weight_addr), .weight_data(weight_data),
        .bias_addr(bias_addr), .bias_data(bias_data),
        .quant_addr(quant_addr), .quant_multiplier(quant_multiplier),
        .quant_shift(quant_shift),
        .output_we(output_we), .output_addr(output_addr),
        .output_data(output_data), .busy(busy), .done(done)
    );

    // One-cycle synchronous memory model.
    always @(posedge clk) begin
        input_data       <= input_mem[input_addr];
        weight_data      <= weight_mem[weight_addr];
        bias_data        <= bias_mem[bias_addr];
        quant_multiplier <= mult_mem[quant_addr];
        quant_shift      <= shift_mem[quant_addr];
    end

    initial begin
        input_mem[0] = 8'd3;
        weight_mem[0] = 8'sd2;
        bias_mem[0] = 32'sd0;
        mult_mem[0] = 32'sd1;
        shift_mem[0] = 6'd0;

        repeat (3) @(negedge clk);
        rst_n = 1'b1;
        @(negedge clk);
        start = 1'b1;
        @(negedge clk);
        start = 1'b0;
    end

    always @(posedge clk) begin
        #1;
        if (output_we) begin
            seen = seen + 1;
            $display("SMOKE DEBUG t=%0t in=%0d weight=%0d bias=%0d mult=%0d shift=%0d out=%0d",
                     $time, $signed(input_data), $signed(weight_data),
                     $signed(bias_data), $signed(quant_multiplier),
                     quant_shift, $signed(output_data));
            if (output_addr !== 24'd0)
                $fatal(1, "SMOKE FAIL: output address=%0d, expected 0", output_addr);
            if ($signed(output_data) !== 8'sd6)
                $fatal(1, "SMOKE FAIL: output=%0d, expected 6", $signed(output_data));
        end
        if (done) begin
            if (seen != 1)
                $fatal(1, "SMOKE FAIL: expected one output, observed %0d", seen);
            $display("PASS: conv_engine smoke test output=6");
            $finish;
        end
    end

    initial begin
        #2000;
        $fatal(1, "SMOKE FAIL: timeout waiting for done");
    end
endmodule
