`timescale 1ns/1ps

module yolo_nms
#(
    parameter integer MAX_BOXES = 16,
    parameter integer BOX_W    = 16,
    parameter integer BOX_H    = 16,
    parameter integer CONF_W   = 16,
    parameter integer CLASS_W  = 8,
    // Nguong IoU dang Q15. 16384 = 0.5 (50%) — gia tri NMS tieu chuan.
    // Gia tri cu 32768 (=1.0) khien dieu kien rut gon thanh
    // `inter_area > union_area`, khong bao gio dung => NMS la no-op.
    parameter integer IOU_THRESH = 16'd16384
)
(
    input  wire clk,
    input  wire rst_n,

    input  wire in_valid,
    input  wire in_last,
    input  wire [BOX_W-1:0]  in_x,
    input  wire [BOX_H-1:0]  in_y,
    input  wire [BOX_W-1:0]  in_w,
    input  wire [BOX_H-1:0]  in_h,
    input  wire [CONF_W-1:0] in_conf,
    input  wire [CLASS_W-1:0] in_class,

    output reg out_valid,
    output reg out_last,
    output reg [BOX_W-1:0]  out_x,
    output reg [BOX_H-1:0]  out_y,
    output reg [BOX_W-1:0]  out_w,
    output reg [BOX_H-1:0]  out_h,
    output reg [CONF_W-1:0] out_conf,
    output reg [CLASS_W-1:0] out_class
);

    reg [BOX_W-1:0]  acc_x [0:MAX_BOXES-1];
    reg [BOX_H-1:0]  acc_y [0:MAX_BOXES-1];
    reg [BOX_W-1:0]  acc_w [0:MAX_BOXES-1];
    reg [BOX_H-1:0]  acc_h [0:MAX_BOXES-1];
    reg [CONF_W-1:0] acc_conf [0:MAX_BOXES-1];
    reg [CLASS_W-1:0] acc_class [0:MAX_BOXES-1];

    reg [7:0] num_acc;
    reg reject;
    integer idx;

    // Cross-multiplication IoU comparison without hardware division
    // (inter_area << 15) / union_area > IOU_THRESH <=> (inter_area << 15) > (union_area * IOU_THRESH)
    function automatic iou_overlap;
        input [BOX_W-1:0] x1, y1, w1, h1;
        input [BOX_W-1:0] x2, y2, w2, h2;
        reg [31:0] inter_x1, inter_x2, inter_y1, inter_y2;
        reg [31:0] inter_w, inter_h;
        reg [31:0] inter_area, a1, a2, union_area;
        reg [47:0] lhs;
        reg [47:0] rhs;
        begin
            inter_x1 = (x1 > x2) ? x1 : x2;
            inter_y1 = (y1 > y2) ? y1 : y2;
            inter_x2 = ((x1 + w1) < (x2 + w2)) ? (x1 + w1) : (x2 + w2);
            inter_y2 = ((y1 + h1) < (y2 + h2)) ? (y1 + h1) : (y2 + h2);

            if (inter_x2 <= inter_x1 || inter_y2 <= inter_y1) begin
                iou_overlap = 1'b0;
            end
            else begin
                inter_w = inter_x2 - inter_x1;
                inter_h = inter_y2 - inter_y1;
                inter_area = inter_w * inter_h;
                a1 = w1 * h1;
                a2 = w2 * h2;
                union_area = a1 + a2 - inter_area;

                lhs = {inter_area, 15'd0}; // inter_area << 15
                rhs = union_area * IOU_THRESH;
                iou_overlap = (lhs > rhs);
            end
        end
    endfunction

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            num_acc <= 8'd0;
            out_valid <= 1'b0;
            out_last <= 1'b0;
            out_x <= {BOX_W{1'b0}};
            out_y <= {BOX_H{1'b0}};
            out_w <= {BOX_W{1'b0}};
            out_h <= {BOX_H{1'b0}};
            out_conf <= {CONF_W{1'b0}};
            out_class <= {CLASS_W{1'b0}};

            for (idx = 0; idx < MAX_BOXES; idx = idx + 1) begin
                acc_x[idx] <= {BOX_W{1'b0}};
                acc_y[idx] <= {BOX_H{1'b0}};
                acc_w[idx] <= {BOX_W{1'b0}};
                acc_h[idx] <= {BOX_H{1'b0}};
                acc_conf[idx] <= {CONF_W{1'b0}};
                acc_class[idx] <= {CLASS_W{1'b0}};
            end
        end
        else begin
            out_valid <= 1'b0;
            out_last <= 1'b0;
            reject = 1'b0;

            if (in_valid) begin
                for (idx = 0; idx < MAX_BOXES; idx = idx + 1) begin
                    if (idx < num_acc) begin
                        if (acc_class[idx] == in_class) begin
                            if (iou_overlap(acc_x[idx], acc_y[idx], acc_w[idx], acc_h[idx],
                                            in_x, in_y, in_w, in_h))
                                reject = 1'b1;
                        end
                    end
                end

                if (!reject && num_acc < MAX_BOXES) begin
                    acc_x[num_acc] <= in_x;
                    acc_y[num_acc] <= in_y;
                    acc_w[num_acc] <= in_w;
                    acc_h[num_acc] <= in_h;
                    acc_conf[num_acc] <= in_conf;
                    acc_class[num_acc] <= in_class;

                    out_valid <= 1'b1;
                    out_last <= in_last;
                    out_x <= in_x;
                    out_y <= in_y;
                    out_w <= in_w;
                    out_h <= in_h;
                    out_conf <= in_conf;
                    out_class <= in_class;

                    num_acc <= num_acc + 8'd1;
                end
            end
        end
    end
endmodule
