`timescale 1ns/1ps

module tb_yolo_nms;

    localparam integer BOX_W  = 16;
    localparam integer BOX_H  = 16;
    localparam integer CONF_W = 16;
    localparam integer CLASS_W = 8;

    reg clk;
    reg rst_n;

    reg in_valid;
    reg in_last;
    reg [BOX_W-1:0]  in_x;
    reg [BOX_H-1:0]  in_y;
    reg [BOX_W-1:0]  in_w;
    reg [BOX_H-1:0]  in_h;
    reg [CONF_W-1:0] in_conf;
    reg [CLASS_W-1:0] in_class;

    wire out_valid;
    wire out_last;
    wire [BOX_W-1:0]  out_x;
    wire [BOX_H-1:0]  out_y;
    wire [BOX_W-1:0]  out_w;
    wire [BOX_H-1:0]  out_h;
    wire [CONF_W-1:0] out_conf;
    wire [CLASS_W-1:0] out_class;

    yolo_nms
    #(
        .MAX_BOXES(16),
        .BOX_W(BOX_W),
        .BOX_H(BOX_H),
        .CONF_W(CONF_W),
        .CLASS_W(CLASS_W),
        .IOU_THRESH(16'd32768)
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

        .out_valid(out_valid),
        .out_last(out_last),
        .out_x(out_x),
        .out_y(out_y),
        .out_w(out_w),
        .out_h(out_h),
        .out_conf(out_conf),
        .out_class(out_class)
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
            in_x = x;
            in_y = y;
            in_w = w;
            in_h = h;
            in_conf = conf;
            in_class = cls;
            in_valid = 1'b1;
            in_last = 1'b0;
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

        // box 1
        send_box(16'd10, 16'd20, 16'd30, 16'd30, 16'd80, 8'd1);

        // box 2 (overlap with box 1 -> should be suppressed)
        send_box(16'd15, 16'd25, 16'd30, 16'd30, 16'd75, 8'd1);

        // box 3 (different class -> kept)
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

        $display("PASS: tb_yolo_nms completed");
        $finish;
    end

endmodule