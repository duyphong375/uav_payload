`timescale 1ns/1ps

module tb_conv_engine_dynamic;

    localparam integer KERNEL = 3;
    localparam integer IN_C   = 3;
    localparam integer OUT_C  = 32;
    localparam integer WIN_WORDS = KERNEL * KERNEL * IN_C;

    reg clk;
    reg rst_n;
    reg start;

    reg [15:0] p_stride;
    reg [15:0] p_pad;
    reg [23:0] p_weight_base;
    reg [23:0] p_bias_base;
    reg [23:0] p_quant_base;

    reg win_valid;
    wire win_ready;
    reg [(WIN_WORDS*8)-1:0] win_data;

    reg [15:0] bias_addr;
    reg [31:0] bias_rdata;
    reg        bias_rvalid;
    reg        bias_req;

    reg [15:0] mult_addr;
    reg [31:0] mult_rdata;
    reg        mult_rvalid;
    reg        mult_req;

    reg [15:0] weight_addr;
    reg [31:0] weight_rdata;
    reg        weight_rvalid;
    reg        weight_req;

    wire out_valid;
    wire [15:0] out_x;
    wire [15:0] out_y;
    wire [15:0] out_c;
    wire [7:0]  out_q;
    wire [16:0] out_addr;

    wire busy;
    wire done;

    reg [31:0] bias_mem [0:255];
    reg [31:0] mult_mem [0:255];
    reg [31:0] weight_mem [0:4095];

    integer i;
    integer err_count;

    conv_engine_dynamic_fsm
    #(
        .KERNEL(KERNEL),
        .IN_C(IN_C),
        .OUT_C(OUT_C),
        .IMG_W(160),
        .IMG_H(160),
        .Q_BITS(8)
    ) dut (
        .clk(clk),
        .rst_n(rst_n),
        .start(start),

        .p_stride(p_stride),
        .p_pad(p_pad),
        .p_weight_base(p_weight_base),
        .p_bias_base(p_bias_base),
        .p_quant_base(p_quant_base),

        .win_valid(win_valid),
        .win_ready(win_ready),
        .win_data(win_data),

        .bias_addr(bias_addr),
        .bias_rdata(bias_rdata),
        .bias_rvalid(bias_rvalid),
        .bias_req(bias_req),

        .mult_addr(mult_addr),
        .mult_rdata(mult_rdata),
        .mult_rvalid(mult_rvalid),
        .mult_req(mult_req),

        .weight_addr(weight_addr),
        .weight_rdata(weight_rdata),
        .weight_rvalid(weight_rvalid),
        .weight_req(weight_req),

        .out_valid(out_valid),
        .out_x(out_x),
        .out_y(out_y),
        .out_c(out_c),
        .out_q(out_q),
        .out_addr(out_addr),

        .busy(busy),
        .done(done)
    );

    task automatic send_window;
        input [15:0] x0;
        input [15:0] y0;
        reg [7:0] win_mem [0:WIN_WORDS-1];
        integer idx;
        integer kx, ky, ic;
        reg [7:0] val;
        begin
            for (idx = 0; idx < WIN_WORDS; idx = idx + 1) begin
                win_mem[idx] = 8'd0;
            end

            idx = 0;
            for (ky = 0; ky < KERNEL; ky = ky + 1) begin
                for (kx = 0; kx < KERNEL; kx = kx + 1) begin
                    for (ic = 0; ic < IN_C; ic = ic + 1) begin
                        val = ((x0 + kx + y0 + ky + ic) % 256);
                        win_mem[idx] = val;
                        idx = idx + 1;
                    end
                end
            end

            // Gộp mảng byte thành vector lớn
            win_data = {
                win_mem[26], win_mem[25], win_mem[24],
                win_mem[23], win_mem[22], win_mem[21],
                win_mem[20], win_mem[19], win_mem[18],
                win_mem[17], win_mem[16], win_mem[15],
                win_mem[14], win_mem[13], win_mem[12],
                win_mem[11], win_mem[10], win_mem[9],
                win_mem[8],  win_mem[7],  win_mem[6],
                win_mem[5],  win_mem[4],  win_mem[3],
                win_mem[2],  win_mem[1],  win_mem[0]
            };
        end
    endtask

    initial begin
        clk = 1'b0;
        forever #5 clk = ~clk;
    end

    initial begin
        err_count = 0;

        p_stride = 16'd2;
        p_pad = 16'd1;
        p_weight_base = 24'd0;
        p_bias_base = 24'd0;
        p_quant_base = 24'd0;

        win_valid = 1'b0;
        start = 1'b0;

        for (i = 0; i < 256; i = i + 1) begin
            bias_mem[i] = 32'd0;
            mult_mem[i] = 32'd1;
        end

        for (i = 0; i < 4096; i = i + 1) begin
            weight_mem[i] = 32'd1;
        end

        for (i = 0; i < OUT_C; i = i + 1) begin
            bias_mem[i] = 32'd(i + 1);
            mult_mem[i] = 32'd1;
        end

        rst_n = 1'b0;
        repeat (5) @(posedge clk);
        rst_n = 1'b1;

        send_window(16'd0, 16'd0);

        wait (win_ready == 1'b1);
        @(posedge clk);
        win_valid <= 1'b1;
        @(posedge clk);

        while (win_ready == 1'b0) begin
            @(posedge clk);
        end

        win_valid <= 1'b0;

        start <= 1'b1;
        @(posedge clk);
        start <= 1'b0;

        repeat (200) @(posedge clk);

        if (done !== 1'b1) begin
            $error("done not asserted");
            err_count = err_count + 1;
        end

        if (err_count == 0)
            $display("PASS: tb_conv_engine_dynamic passed");
        else
            $display("FAIL: %0d errors", err_count);

        $finish;
    end

    always @(posedge clk) begin
        bias_rvalid <= bias_req;
        mult_rvalid <= mult_req;
        weight_rvalid <= weight_req;

        bias_rdata <= bias_mem[bias_addr];
        mult_rdata <= mult_mem[mult_addr];
        weight_rdata <= weight_mem[weight_addr];
    end

endmodule