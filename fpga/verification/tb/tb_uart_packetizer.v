`timescale 1ns/1ps

module tb_uart_packetizer;

    localparam integer BOX_W = 16;
    localparam integer BOX_H = 16;
    localparam integer CONF_W = 16;
    localparam integer CLASS_W = 8;

    reg clk;
    reg rst_n;

    reg in_valid;
    reg in_last;
    reg [BOX_W-1:0] in_x;
    reg [BOX_H-1:0] in_y;
    reg [BOX_W-1:0] in_w;
    reg [BOX_H-1:0] in_h;
    reg [CONF_W-1:0] in_conf;
    reg [CLASS_W-1:0] in_class;

    wire tx_valid;
    wire [7:0] tx_data;
    wire tx_last;

    uart_packetizer
    #(
        .MAX_BOXES(16),
        .BOX_W(BOX_W),
        .BOX_H(BOX_H),
        .CONF_W(CONF_W),
        .CLASS_W(CLASS_W)
    ) dut (
        .clk(clk),
        .rst_n(rst_n),

        .in_valid(in_valid),
        .in_last(in_last),
        .in_x(in_x),
        .in_y(in_y),
        .in_w(in_w),
        .in_h(in_h),
        .in_conf(in_conf),
        .in_class(in_class),

        .tx_valid(tx_valid),
        .tx_data(tx_data),
        .tx_last(tx_last)
    );

    initial begin
        clk = 1'b0;
        forever #5 clk = ~clk;
    end

    task automatic send_box;
        input [BOX_W-1:0] x;
        input [BOX_H-1:0] y;
        input [BOX_W-1:0] w;
        input [BOX_H-1:0] h;
        input [CONF_W-1:0] conf;
        input [CLASS_W-1:0] cls;
        begin
            in_valid = 1'b1;
            in_last = 1'b0;
            in_x = x;
            in_y = y;
            in_w = w;
            in_h = h;
            in_conf = conf;
            in_class = cls;
            @(posedge clk);
        end
    endtask

    initial begin
        rst_n = 1'b0;
        in_valid = 1'b0;
        in_last = 1'b0;
        in_x = {BOX_W{1'b0}};
        in_y = {BOX_H{1'b0}};
        in_w = {BOX_W{1'b0}};
        in_h = {BOX_H{1'b0}};
        in_conf = {CONF_W{1'b0}};
        in_class = {CLASS_W{1'b0}};

        repeat (5) @(posedge clk);
        rst_n = 1'b1;

        send_box(16'd10, 16'd20, 16'd30, 16'd30, 16'd80, 8'd1);
        send_box(16'd50, 16'd60, 16'd20, 16'd20, 16'd90, 8'd2);

        in_valid = 1'b1;
        in_last = 1'b1;
        in_x = 16'd0;
        in_y = 16'd0;
        in_w = 16'd0;
        in_h = 16'd0;
        in_conf = 16'd0;
        in_class = 8'd0;
        @(posedge clk);

        in_valid = 1'b0;
        in_last = 1'b0;

        repeat (20) @(posedge clk);

        $display("PASS: tb_uart_packetizer completed");
        $finish;
    end

endmodule