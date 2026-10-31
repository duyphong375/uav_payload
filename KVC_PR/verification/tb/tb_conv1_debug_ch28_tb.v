`timescale 1ns/1ps
module tb_conv1_debug_ch28_tb;
parameter IN_W        = 320;
parameter IN_H        = 320;
parameter IN_C        = 16;
parameter OUT_W       = 160;
parameter OUT_H       = 160;
parameter OUT_C       = 32;
parameter INPUT_SIZE  = IN_W * IN_H * IN_C;
parameter WEIGHT_SIZE = OUT_C * IN_C * 3 * 3;
parameter BIAS_SIZE   = OUT_C;
parameter OUTPUT_SIZE = OUT_C * OUT_W * OUT_H;
parameter TARGET_ADDR = 28 * OUT_W * OUT_H;
reg clk;
reg rst_n;
reg start;
wire [21:0] input_addr;
reg  [7:0] input_data;
wire [11:0] weight_addr;
reg signed [7:0] weight_data;
wire [4:0] bias_addr;
reg signed [31:0] bias_data;
wire [7:0] output_data;
wire [19:0] output_addr;
wire output_valid;
wire busy;
wire done;
reg [7:0] input_mem [0:INPUT_SIZE-1];
reg signed [7:0] weight_mem [0:WEIGHT_SIZE-1];
reg signed [31:0] bias_mem [0:BIAS_SIZE-1];
reg [7:0] golden_mem [0:OUTPUT_SIZE-1];
reg signed [31:0] acc_golden_mem [0:OUTPUT_SIZE-1];
integer cycles;
integer output_count;
// DUT
conv1_engine #(
.IN_W(IN_W),
.IN_H(IN_H),
.IN_C(IN_C),
.OUT_W(OUT_W),
.OUT_H(OUT_H),
.OUT_C(OUT_C)
) dut (
.clk(clk),
.rst_n(rst_n),
.start(start),
.input_addr(input_addr),
.input_data(input_data),
.weight_addr(weight_addr),
.weight_data(weight_data),
.bias_addr(bias_addr),
.bias_data(bias_data),
.output_data(output_data),
.output_addr(output_addr),
.output_valid(output_valid),
.busy(busy),
.done(done)
);
// Clock 100 MHz
initial clk = 1'b0;
always #5 clk = ~clk;
// Synchronous memories
always @(posedge clk) begin
if (input_addr < INPUT_SIZE)
input_data <= input_mem[input_addr];
else
input_data <= 8'd0;
if (weight_addr < WEIGHT_SIZE)
weight_data <= weight_mem[weight_addr];
else
weight_data <= 8'sd0;
if (bias_addr < BIAS_SIZE)
bias_data <= bias_mem[bias_addr];
else
bias_data <= 32'sd0;
end
// Counters
always @(posedge clk) begin
if (!rst_n) begin
cycles       <= 0;
output_count <= 0;
end else begin
cycles <= cycles + 1;
if (output_valid)
output_count <= output_count + 1;
end
end
// Main test
initial begin
rst_n = 1'b0;
start = 1'b0;
input_data  = 8'd0;
weight_data = 8'sd0;
bias_data   = 32'sd0;
$display("========================================");
$display(" Conv1 DEBUG - Channel 28");
$display(" Target address = %0d", TARGET_ADDR);
$display("========================================");
$readmemh("verification/data/conv1/input_q_ort.hex",
input_mem);
$readmemh("verification/data/conv1/weight_int8.hex",
weight_mem);
$readmemh("verification/data/conv1/bias_int32.hex",
bias_mem);
$readmemh("verification/data/conv1/output_q_ort_input_golden.hex",
golden_mem);
$readmemh("verification/data/conv1/conv1_acc_reference_ort_input.hex",
acc_golden_mem);
// Reset
repeat (10) @(posedge clk);
@(negedge clk);
rst_n = 1'b1;
repeat (5) @(posedge clk);
@(negedge clk);
start = 1'b1;
@(negedge clk);
start = 1'b0;
// Wait for target output
wait (output_valid && output_addr == TARGET_ADDR);
#1;
$display("");
$display("============== DEBUG RESULT ==============");
$display("Output address       : %0d", output_addr);
$display("Output count         : %0d", output_count);
$display("Channel              : %0d",
output_addr / (OUT_W * OUT_H));
$display("Actual output        : %0d (0x%02h)",
output_data, output_data);
$display("Golden output        : %0d (0x%02h)",
golden_mem[TARGET_ADDR],
golden_mem[TARGET_ADDR]);
$display("------------------------------------------");
$display("Actual accumulator   : %0d", dut.acc_out);
$display("Golden accumulator   : %0d",
acc_golden_mem[TARGET_ADDR]);
$display("Multiplier           : %0d", 2756846);
$display("Core y_out           : %0d",
dut.u_core.y_out);
$display("Channel index        : %0d",
dut.u_core.channel_idx);
$display("Bias address         : %0d", bias_addr);
$display("Engine busy          : %0d", busy);
$display("Engine done          : %0d", done);
$display("Cycles               : %0d", cycles);
$display("==========================================");
if (dut.acc_out === acc_golden_mem[TARGET_ADDR])
$display("ACCUMULATOR MATCH");
else
$display("ACCUMULATOR MISMATCH");
$finish;
end
// Timeout: 3.5 billion ns, within signed 32-bit range
initial begin
#3500000000;
$display("ERROR: Timeout waiting for target output.");
$finish;
end
endmodule