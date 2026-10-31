`timescale 1ns/1ps

// Full golden test of generic conv_engine against the real YOLO11n Conv0 tensors.
// Input [1,3,640,640], weight [16,3,3,3], output [1,16,320,320], stride=2, pad=1.
module tb_conv_engine_conv0_full;
    localparam IN_W = 640;
    localparam IN_H = 640;
    localparam IN_C = 3;
    localparam OUT_W = 320;
    localparam OUT_H = 320;
    localparam OUT_C = 16;
    localparam K = 3;
    localparam INPUT_SIZE = IN_W*IN_H*IN_C;
    localparam WEIGHT_SIZE = OUT_C*IN_C*K*K;
    localparam BIAS_SIZE = OUT_C;
    localparam OUTPUT_SIZE = OUT_W*OUT_H*OUT_C;

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
    reg signed [31:0] quant_multiplier = 32'sd0;
    reg [5:0] quant_shift = 6'd31;
    wire output_we;
    wire [23:0] output_addr;
    wire [7:0] output_data;
    wire busy, done;

    reg [7:0] input_mem [0:INPUT_SIZE-1];
    reg signed [7:0] weight_mem [0:WEIGHT_SIZE-1];
    reg signed [31:0] bias_mem [0:BIAS_SIZE-1];
    reg signed [31:0] mult_mem [0:BIAS_SIZE-1];
    reg [5:0] shift_mem [0:BIAS_SIZE-1];
    reg [31:0] acc_golden [0:OUTPUT_SIZE-1];
    reg [7:0] output_golden [0:OUTPUT_SIZE-1];

    integer i;
    integer output_count = 0;
    integer accumulator_errors = 0;
    integer output_errors = 0;
    integer first_acc_error = -1;
    integer first_output_error = -1;

    conv_engine #(
        .IN_W(IN_W), .IN_H(IN_H), .IN_C(IN_C),
        .OUT_W(OUT_W), .OUT_H(OUT_H), .OUT_C(OUT_C),
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

    // One-cycle synchronous ROM/RAM models.
    always @(posedge clk) begin
        input_data       <= input_mem[input_addr];
        weight_data      <= weight_mem[weight_addr];
        bias_data        <= bias_mem[bias_addr];
        quant_multiplier <= mult_mem[quant_addr];
        quant_shift      <= shift_mem[quant_addr];
    end

    initial begin
        $display("Loading Conv0 input, weights, bias and golden tensors...");
        $readmemh("verification/data/conv0/input_q.hex", input_mem);
        $readmemh("verification/data/conv0/weight_int8.hex", weight_mem);
        $readmemh("verification/data/conv0/bias_int32.hex", bias_mem);
        $readmemh("verification/data/conv0/acc_int32_golden.hex", acc_golden);
        $readmemh("verification/data/conv0/output_q_golden.hex", output_golden);

        // M[o] = round((input_scale * weight_scale[o] / output_scale) * 2^31), shift=31.
        // Scales and values come from verification/data/conv0/metadata.json.
        // Conv0 per-channel multipliers: CEIL policy, shift = 31.
mult_mem[0]  = 32'sd3287891;
mult_mem[1]  = 32'sd1387029;
mult_mem[2]  = 32'sd3564624;
mult_mem[3]  = 32'sd2702078;
mult_mem[4]  = 32'sd9570161;
mult_mem[5]  = 32'sd2156546;
mult_mem[6]  = 32'sd5300154;
mult_mem[7]  = 32'sd3230634;
mult_mem[8]  = 32'sd3118240;
mult_mem[9]  = 32'sd2239436;
mult_mem[10] = 32'sd2865706;
mult_mem[11] = 32'sd3257607;
mult_mem[12] = 32'sd4217281;
mult_mem[13] = 32'sd5595585;
mult_mem[14] = 32'sd1393282;
mult_mem[15] = 32'sd2488780;

for (i = 0; i < BIAS_SIZE; i = i + 1)
    shift_mem[i] = 6'd31;
        for (i=0; i<BIAS_SIZE; i=i+1)
            shift_mem[i] = 6'd31;

        repeat (3) @(negedge clk);
        rst_n = 1'b1;
        @(negedge clk);
        start = 1'b1;
        @(negedge clk);
        start = 1'b0;
        $display("Started full Conv0 golden test; this serial engine test may take a while.");
    end

    // Check each emitted output after nonblocking assignments have settled.
    always @(posedge clk) begin
        #1;
        if (output_we) begin
            output_count = output_count + 1;
            if (output_addr >= OUTPUT_SIZE)
                $fatal(1, "CONV0 FAIL: output address out of range: %0d", output_addr);

            if ($signed(dut.acc) !== $signed(acc_golden[output_addr])) begin
                accumulator_errors = accumulator_errors + 1;
                if (first_acc_error < 0) begin
                    first_acc_error = output_addr;
                    $display("First accumulator mismatch at addr=%0d: got=%0d expected=%0d",
                             output_addr, $signed(dut.acc), $signed(acc_golden[output_addr]));
                end
            end

            if (output_data !== output_golden[output_addr]) begin
                output_errors = output_errors + 1;

                if (first_output_error < 0)
                    first_output_error = output_addr;

                if (output_errors <= 20) begin
                    $display(
                        "INT8 MISMATCH #%0d addr=%0d acc=%0d multiplier=%0d shift=%0d got=%0d expected=%0d",
                        output_errors,
                        output_addr,
                        $signed(dut.acc),
                        $signed(quant_multiplier),
                        quant_shift,
                        $signed(output_data),
                        $signed(output_golden[output_addr])
                    );
                end
            end

            if ((output_count % 100000) == 0)
                $display("Progress: checked %0d / %0d outputs", output_count, OUTPUT_SIZE);
        end

        if (done) begin
            $display("Conv0 totals: outputs=%0d, accumulator_errors=%0d, int8_errors=%0d",
                     output_count, accumulator_errors, output_errors);
            if (output_count != OUTPUT_SIZE)
                $fatal(1, "CONV0 FAIL: output count %0d expected %0d", output_count, OUTPUT_SIZE);
            if (accumulator_errors != 0)
                $fatal(1, "CONV0 FAIL: accumulator golden mismatches=%0d", accumulator_errors);
            if (output_errors != 0)
                $fatal(1, "CONV0 FAIL: INT8 golden mismatches=%0d", output_errors);
            $display("PASS: conv_engine full Conv0 accumulator and INT8 golden tests matched");
            $finish;
        end
    end

    initial begin
        // 2,000,000,000 ns timeout accommodates the serial full-layer test.
        #2000000000
        $fatal(1, "CONV0 FAIL: timeout waiting for done; outputs checked=%0d", output_count);
    end
endmodule
