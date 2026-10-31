// -----------------------------------------------------------------------------
// File: rtl/mock_bbox.v
// Module: mock_bbox
// Author: Vững (assistant)
// Date:   2026-10-15
// Desc:   Mô-đun tạo danh sách BBox mẫu để thử nghiệm pipeline FPGA độc lập với
//         camera/AI thực tế.
// - Giao diện đơn giản: nhận trigger (pulse) để phát 1 frame gồm N bounding boxes
// - mode:
//     2'b00 -> 0 bbox
//     2'b01 -> 1 bbox
//     2'b10 -> 2 bbox (person + lifebuoy)
//     2'b11 -> MAX_BBOX (lặp pattern)
// - Mỗi bbox 64-bit (8 byte), Little-Endian khi packetizer gửi:
//     byte0-1: X_center, byte2-3: Y_center, byte4: W, byte5: H,
//     byte6: class_id, byte7: conf
// - Outputs:
//     bbox_data[63:0] : dữ liệu bbox hiện tại (valid 1 cycle khi bbox_valid=1)
//     bbox_valid      : pulse 1 clk cho mỗi bbox
//     bbox_count_out  : số bbox đã gửi (valid khi frame_done=1)
//     frame_done      : pulse 1 clk báo đã gửi xong frame
// Notes:
// - Việc điều chỉnh dữ liệu mẫu (toạ độ, kích thước, class, confidence) tuỳ nhu cầu.
// - Module simple, tổng hợp tốt, không dùng các vòng for trong điều kiện thời gian.
// -----------------------------------------------------------------------------
`timescale 1ns/1ps
module mock_bbox #(
    parameter integer MAX_BBOX = 20
)(
    input  wire        clk,
    input  wire        rst_n,
    input  wire        trigger,        // pulse 1 clk để bắt đầu phát frame
    input  wire [1:0]  mode,           // chọn lượng bbox (0/1/2/MAX)
    output reg  [63:0] bbox_data,
    output reg         bbox_valid,
    output reg  [7:0]  bbox_count_out,
    output reg         frame_done
);

    // Internal state
    reg [7:0] send_count;    // how many to send this frame
    reg [7:0] send_idx;      // index of next to send
    reg       active;

    // Two sample bboxes (person, lifebuoy) encoded as 64-bit fields.
    // Layout PHAI khop parser C cua MCU (kvc_fpga_bbox.c:281-286) sau khi
    // packetizer gui Little-Endian (byte thap truoc):
    //   byte0 = X[7:0], byte1 = X[15:8]
    //   byte2 = Y[7:0], byte3 = Y[15:8]
    //   byte4 = W, byte5 = H, byte6 = class, byte7 = conf
    // => word64 = { conf, class, H, W, Y[15:0], X[15:0] }  (X o bit thap nhat)
    localparam [63:0] BBOX_PERSON = {
        8'd90,    // conf = 90 percent  -> byte7
        8'h01,    // class = 1 (person) -> byte6
        8'h64,    // H = 100            -> byte5
        8'h32,    // W = 50             -> byte4
        16'h00F0, // Y = 240            -> byte3:2
        16'h0140  // X = 320            -> byte1:0
    };

    localparam [63:0] BBOX_LIFE = {
        8'd95,    // conf = 95
        8'h02,    // class = 2 (lifebuoy)
        8'h50,    // H = 80
        8'h50,    // W = 80
        16'h00C8, // Y = 200
        16'h0064  // X = 100
    };

    // Generate pattern based on index
    function [63:0] gen_bbox;
        input [7:0] idx;
        begin
            if ((idx % 2) == 0) gen_bbox = BBOX_PERSON;
            else                gen_bbox = BBOX_LIFE;
        end
    endfunction

    // FSM: on trigger latch send_count and start sending one bbox per clk
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            send_count    <= 8'd0;
            send_idx      <= 8'd0;
            active        <= 1'b0;
            bbox_data     <= 64'd0;
            bbox_valid    <= 1'b0;
            bbox_count_out<= 8'd0;
            frame_done    <= 1'b0;
        end else begin
            // default clear single-cycle outputs
            bbox_valid <= 1'b0;
            frame_done <= 1'b0;

            if (!active) begin
                if (trigger) begin
                    // start new frame: determine send_count from mode
                    case (mode)
                        2'b00: send_count <= 8'd0;
                        2'b01: send_count <= 8'd1;
                        2'b10: send_count <= 8'd2;
                        2'b11: send_count <= (MAX_BBOX > 255) ? 8'd255 : MAX_BBOX;
                        default: send_count <= 8'd0;
                    endcase
                    send_idx <= 8'd0;
                    bbox_count_out <= 8'd0;
                    active <= 1'b1;
                end
            end else begin
                if (send_idx < send_count) begin
                    // output next bbox for one clock
                    bbox_data <= gen_bbox(send_idx);
                    bbox_valid <= 1'b1;
                    send_idx <= send_idx + 1'b1;
                    bbox_count_out <= bbox_count_out + 1'b1;
                end else begin
                    // finished sending all
                    active <= 1'b0;
                    frame_done <= 1'b1;
                end
            end
        end
    end

endmodule