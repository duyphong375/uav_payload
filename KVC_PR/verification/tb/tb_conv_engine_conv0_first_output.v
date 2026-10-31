`timescale 1ns/1ps

// Tests the first output of the real YOLO11n Conv0 layer using project data.
// Actual layer: input [1,3,640,640], weights [16,3,3,3], stride 2, pad 1.
// This test deliberately limits the DUT output region to the first pixel/channel
// to keep simulation short; input/weight/bias/quantization and golden values are real.
module tb_conv_engine_conv0_first_output;
    localparam IN_W = 640;
    localparam IN_H = 640;
    localparam IN_C = 3;
    localparam K = 3;
    localparam INPUT_SIZE = IN_W*IN_H*IN_C;
    localparam WEIGHT_SIZE = 16*IN_C*K*K;

    reg clk = 1'b0;
    always #5 clk = ~clk;
    reg rst_n = 1'b0;
    reg start = 1'b0;

    wire [23:0] input_addr;
    wire [23:0] weight_addr;
    reg [7:0] input_data = 0;
    reg signed [7:0] weight_data = 0;
    wire [9:0] bias_addr;
    wire [9:0] quant_addr;
    reg signed [31:0] bias_data = 0;
    reg signed [31:0] quant_multiplier = 0;
    reg [5:0] quant_shift = 0;
    wire output_we;
    wire [23:0] output_addr;
    wire [7:0] output_data;
    wire busy, done;

    reg [7:0] input_mem [0:INPUT_SIZE-1];
    reg signed [7:0] weight_mem [0:WEIGHT_SIZE-1];
    reg signed [31:0] bias_mem [0:15];
    reg signed [31:0] mult_mem [0:15];
    reg [5:0] shift_mem [0:15];
    reg [31:0] acc_golden [0:0];
    reg [7:0] output_golden [0:0];

    integer i;
    integer seen = 0;

    conv_engine #(
        .IN_W(IN_W), .IN_H(IN_H), .IN_C(IN_C),
        .OUT_W(1), .OUT_H(1), .OUT_C(1),
        .K_SIZE(K), .STRIDE(2), .GROUPS(1), .PAD(1),
        .INPUT_IS_SIGNED(1), .INPUT_ZERO_POINT(0),
        .OUTPUT_IS_SIGNED(1), .OUTPUT_ZERO_POINT(0),
        .ROUND_TIES_EVEN(1)
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

    // Synchronous one-cycle memory reads, matching conv_engine's interface.
    always @(posedge clk) begin
        input_data       <= input_mem[input_addr];
        weight_data      <= weight_mem[weight_addr];
        bias_data        <= bias_mem[bias_addr];
        quant_multiplier <= mult_mem[quant_addr];
        quant_shift      <= shift_mem[quant_addr];
    end

    initial begin
        $display("Loading real Conv0 tensors and golden references...");
        $readmemh("verification/data/conv0/input_q.hex", input_mem);
        $readmemh("verification/data/conv0/weight_int8.hex", weight_mem);
        $readmemh("verification/data/conv0/bias_int32.hex", bias_mem);
        $readmemh("verification/data/conv0/acc_int32_golden.hex", acc_golden, 0, 0);
        $readmemh("verification/data/conv0/output_q_golden.hex", output_golden, 0, 0);

        // Per-channel fixed-point requantization: round(real_scale * 2^31), shift=31.
        // Channel 0 real scale = input_scale * weight_scale[0] / output_scale.
        for (i=0; i<16; i=i+1) begin
            mult_mem[i] = 0;
            shift_mem[i] = 31;
        end
        mult_mem[0] = 32'sd3287890;
        shift_mem[0] = 6'd31;

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
            $display("Conv0 first output: addr=%0d acc=%0d golden_acc=%0d out=%0d golden_out=%0d",
                     output_addr, $signed(dut.acc), $signed(acc_golden[0]),
                     $signed(output_data), $signed(output_golden[0]));
            if (output_addr !== 24'd0)
                $fatal(1, "CONV0 FAIL: output address mismatch");
            if ($signed(dut.acc) !== $signed(acc_golden[0]))
                $fatal(1, "CONV0 FAIL: accumulator mismatch: got %0d expected %0d",
                       $signed(dut.acc), $signed(acc_golden[0]));
            if (output_data !== output_golden[0])
                $fatal(1, "CONV0 FAIL: quantized output mismatch: got %0d expected %0d",
                       $signed(output_data), $signed(output_golden[0]));
        end
        if (done) begin
            if (seen != 1)
                $fatal(1, "CONV0 FAIL: expected one output, observed %0d", seen);
            $display("PASS: conv_engine matches real Conv0 first output and golden accumulator/output");
            $finish;
        end
    end

    initial begin
        #100000;
        $fatal(1, "CONV0 FAIL: timeout waiting for done");
    end
endmodule
