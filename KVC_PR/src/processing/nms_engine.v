`timescale 1ns/1ps
// Greedy class-aware NMS for candidates already sorted by descending score.
// Coordinates are integer XYXY in the same fixed-point coordinate domain.
// For each accepted candidate, suppress when IoU > IOU_THRESH_MILLI/1000.
// This is a post-processing block, not the ONNX DFL/box-decoding head.
module nms_engine #(
    parameter integer MAX_CANDIDATES = 256,
    parameter integer MAX_KEEP = 64,
    parameter integer SCORE_THRESH = 64,
    parameter integer IOU_THRESH_MILLI = 500,
    parameter integer COORD_W = 16
) (
    input wire clk, rst_n, start,
    input wire cand_valid,
    output wire cand_ready,
    input wire [COORD_W-1:0] cand_x1, cand_y1, cand_x2, cand_y2,
    input wire [7:0] cand_score,
    input wire [7:0] cand_class,
    input wire cand_last,
    output reg keep_valid,
    input wire keep_ready,
    output reg [COORD_W-1:0] keep_x1, keep_y1, keep_x2, keep_y2,
    output reg [7:0] keep_score, keep_class,
    output reg [15:0] keep_index,
    output reg busy, done
);
    localparam integer KW = (MAX_KEEP<=1)?1:$clog2(MAX_KEEP+1);
    localparam integer CW = (MAX_CANDIDATES<=1)?1:$clog2(MAX_CANDIDATES+1);
    localparam [2:0] S_IDLE=0, S_RECEIVE=1, S_COMPARE=2, S_EMIT=3, S_DROP=4, S_DONE=5;
    reg [2:0] state;
    reg [KW-1:0] keep_count;
    reg [CW-1:0] candidate_count;
    reg [KW-1:0] cmp_index;
    reg [COORD_W-1:0] cur_x1,cur_y1,cur_x2,cur_y2;
    reg [7:0] cur_score,cur_class;
    reg cur_last;
    reg [COORD_W-1:0] box_x1 [0:MAX_KEEP-1];
    reg [COORD_W-1:0] box_y1 [0:MAX_KEEP-1];
    reg [COORD_W-1:0] box_x2 [0:MAX_KEEP-1];
    reg [COORD_W-1:0] box_y2 [0:MAX_KEEP-1];
    reg [7:0] box_class [0:MAX_KEEP-1];

    assign cand_ready = (state==S_RECEIVE) && busy;

    function iou_exceeds;
        input [COORD_W-1:0] ax1, ay1, ax2, ay2;
        input [COORD_W-1:0] bx1, by1, bx2, by2;
        reg [COORD_W-1:0] ix1, iy1, ix2, iy2;
        reg [COORD_W-1:0] iw, ih, aw, ah, bw, bh;
        reg [63:0] inter_area, area_a, area_b, union_area, lhs, rhs;
        begin
            ix1 = (ax1 > bx1) ? ax1 : bx1;
            iy1 = (ay1 > by1) ? ay1 : by1;
            ix2 = (ax2 < bx2) ? ax2 : bx2;
            iy2 = (ay2 < by2) ? ay2 : by2;
            iw = (ix2 > ix1) ? ix2-ix1 : 0;
            ih = (iy2 > iy1) ? iy2-iy1 : 0;
            aw = (ax2 > ax1) ? ax2-ax1 : 0;
            ah = (ay2 > ay1) ? ay2-ay1 : 0;
            bw = (bx2 > bx1) ? bx2-bx1 : 0;
            bh = (by2 > by1) ? by2-by1 : 0;
            inter_area = iw;
            inter_area = inter_area * ih;
            area_a = aw;
            area_a = area_a * ah;
            area_b = bw;
            area_b = area_b * bh;
            union_area = area_a + area_b - inter_area;
            lhs = inter_area * 64'd1000;
            rhs = union_area * IOU_THRESH_MILLI;
            iou_exceeds = (union_area != 0) && (inter_area != 0) && (lhs > rhs);
        end
    endfunction

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            state<=S_IDLE; keep_count<=0; candidate_count<=0; cmp_index<=0;
            cur_x1<=0;cur_y1<=0;cur_x2<=0;cur_y2<=0;cur_score<=0;cur_class<=0;cur_last<=0;
            keep_valid<=0;keep_x1<=0;keep_y1<=0;keep_x2<=0;keep_y2<=0;keep_score<=0;keep_class<=0;keep_index<=0;
            busy<=0;done<=0;
        end else begin
            done<=0;
            case (state)
                S_IDLE: begin
                    keep_valid<=0;
                    if (start && !busy) begin
                        keep_count<=0; candidate_count<=0; cmp_index<=0; busy<=1; state<=S_RECEIVE;
                    end
                end
                S_RECEIVE: begin
                    if (cand_valid && cand_ready) begin
                        cur_x1<=cand_x1;cur_y1<=cand_y1;cur_x2<=cand_x2;cur_y2<=cand_y2;
                        cur_score<=cand_score;cur_class<=cand_class;cur_last<=cand_last;
                        candidate_count<=candidate_count+1'b1;
                        if ((cand_score < SCORE_THRESH) || (keep_count >= MAX_KEEP)) begin
                            if (cand_last || (candidate_count == MAX_CANDIDATES-1)) state<=S_DONE;
                            else state<=S_RECEIVE;
                        end else if (keep_count == 0) begin
                            box_x1[0]<=cand_x1;box_y1[0]<=cand_y1;box_x2[0]<=cand_x2;box_y2[0]<=cand_y2;box_class[0]<=cand_class;
                            keep_count<=1;
                            keep_x1<=cand_x1;keep_y1<=cand_y1;keep_x2<=cand_x2;keep_y2<=cand_y2;keep_score<=cand_score;keep_class<=cand_class;keep_index<=0;
                            keep_valid<=1; state<=S_EMIT;
                        end else begin cmp_index<=0; state<=S_COMPARE; end
                    end
                end
                S_COMPARE: begin
                    if ((box_class[cmp_index] == cur_class) &&
                        iou_exceeds(cur_x1,cur_y1,cur_x2,cur_y2,
                                    box_x1[cmp_index],box_y1[cmp_index],box_x2[cmp_index],box_y2[cmp_index])) begin
                        state<=S_DROP;
                    end else if (cmp_index + 1'b1 < keep_count) begin
                        cmp_index<=cmp_index+1'b1;
                    end else begin
                        box_x1[keep_count]<=cur_x1;box_y1[keep_count]<=cur_y1;box_x2[keep_count]<=cur_x2;box_y2[keep_count]<=cur_y2;box_class[keep_count]<=cur_class;
                        keep_x1<=cur_x1;keep_y1<=cur_y1;keep_x2<=cur_x2;keep_y2<=cur_y2;keep_score<=cur_score;keep_class<=cur_class;keep_index<=keep_count;
                        keep_count<=keep_count+1'b1; keep_valid<=1; state<=S_EMIT;
                    end
                end
                S_DROP: begin
                    if (cur_last || (candidate_count >= MAX_CANDIDATES)) state<=S_DONE;
                    else state<=S_RECEIVE;
                end
                S_EMIT: begin
                    if (keep_valid && keep_ready) begin
                        keep_valid<=0;
                        if (cur_last || (candidate_count >= MAX_CANDIDATES)) state<=S_DONE;
                        else state<=S_RECEIVE;
                    end
                end
                S_DONE: begin busy<=0; done<=1; keep_valid<=0; state<=S_IDLE; end
                default: begin state<=S_IDLE;busy<=0;keep_valid<=0; end
            endcase
        end
    end
endmodule
