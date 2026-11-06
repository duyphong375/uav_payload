`timescale 1ns/1ps
// Interface smoke test for the current conv_engine_dynamic FIFO/window interface.
// Test case: 1x1 input window value 3, weight 2, bias 1 -> output 7.
module tb_conv_engine_dynamic_smoke;
    reg clk = 0;
    always #5 clk = ~clk;
    reg rst_n = 0, start = 0;
    wire fifo_rd_en;
    reg [255:0] fifo_rd_data = 256'd2;
    reg fifo_empty = 0;
    reg [7:0] win_00=3, win_01=0, win_02=0;
    reg [7:0] win_10=0, win_11=0, win_12=0;
    reg [7:0] win_20=0, win_21=0, win_22=0;
    wire [15:0] bias_addr, quant_addr;
    reg signed [31:0] bias_data = 1, quant_multiplier = 1;
    reg [5:0] quant_shift = 0;
    wire output_we, busy, done;
    wire [23:0] output_addr;
    wire [7:0] output_data;

    conv_engine_dynamic dut (
        .clk(clk), .rst_n(rst_n), .start(start),
        .p_in_w(16'd1), .p_in_h(16'd1), .p_in_c(16'd1),
        .p_out_w(16'd1), .p_out_h(16'd1), .p_out_c(16'd1),
        .p_k_size(4'd1), .p_stride(4'd1), .p_pad(4'd0),
        .p_ic_per_group(16'd1), .p_oc_per_group(16'd1),
        .p_weight_base(24'd0), .p_bias_base(24'd0), .p_quant_base(24'd0),
        .win_00(win_00), .win_01(win_01), .win_02(win_02),
        .win_10(win_10), .win_11(win_11), .win_12(win_12),
        .win_20(win_20), .win_21(win_21), .win_22(win_22),
        .fifo_rd_en(fifo_rd_en), .fifo_rd_data(fifo_rd_data), .fifo_empty(fifo_empty),
        .bias_addr(bias_addr), .bias_data(bias_data),
        .quant_addr(quant_addr), .quant_multiplier(quant_multiplier), .quant_shift(quant_shift),
        .output_we(output_we), .output_addr(output_addr), .output_data(output_data),
        .busy(busy), .done(done)
    );

    reg seen_output = 0;
    reg [7:0] captured = 0;
    always @(posedge clk) begin
        if (output_we) begin
            seen_output <= 1;
            captured <= output_data;
            if (output_addr !== 24'd0) $fatal(1, "unexpected output address %0d", output_addr);
        end
    end

    initial begin
        repeat (3) @(posedge clk);
        rst_n <= 1;
        @(posedge clk); start <= 1;
        @(posedge clk); start <= 0;
        wait(done);
        @(posedge clk);
        if (!seen_output) $fatal(1, "no output write observed");
        if (captured !== 8'd7) $fatal(1, "expected 7, got %0d (0x%02x)", captured, captured);
        $display("PASS tb_conv_engine_dynamic_smoke: output=7");
        $finish;
    end

    initial begin
        #10000;
        $fatal(1, "timeout");
    end
endmodule
