`timescale 1ns/1ps

module image_letterbox
#(
    parameter integer IN_W     = 640,
    parameter integer IN_H     = 480,
    parameter integer OUT_W    = 160,
    parameter integer OUT_H    = 160,
    parameter [7:0] PAD_COLOR = 8'd114
)
(
    input  wire        clk,
    input  wire        rst_n,
    input  wire [15:0] in_pixel,
    input  wire        in_valid,
    input  wire        frame_start,

    output reg  [7:0]  out_data,
    output reg  [16:0] out_addr,
    output reg         out_we,
    output reg         out_frame_done
);

    localparam integer SCALE    = IN_W / OUT_W;       // 4
    localparam integer SCALED_H = IN_H / SCALE;        // 120
    localparam integer PAD_TOP  = (OUT_H - SCALED_H) / 2; // 20
    localparam integer PLANE_SZ = OUT_W * OUT_H;      // 25600
    localparam integer G_OFF    = PLANE_SZ;
    localparam integer B_OFF    = 2 * PLANE_SZ;

    reg [15:0] src_x;
    reg [15:0] src_y;
    reg frame_active;
    reg source_done;
    reg pad_done;

    reg [7:0] r_byte;
    reg [7:0] g_byte;
    reg [7:0] b_byte;

    reg [2:0] emit_phase;

    wire [4:0] r5 = in_pixel[15:11];
    wire [5:0] g6 = in_pixel[10:5];
    wire [4:0] b5 = in_pixel[4:0];

    wire [7:0] r8 = {r5, r5[4:2]};
    wire [7:0] g8 = {g6, g6[5:4]};
    wire [7:0] b8 = {b5, b5[4:2]};

    function automatic [16:0] addr_r;
        input [15:0] x_in;
        input [15:0] y_in;
        reg [31:0] tmp;
        begin
            tmp = ((y_in * OUT_W) + x_in);
            addr_r = tmp[16:0];
        end
    endfunction

    function automatic [16:0] addr_g;
        input [15:0] x_in;
        input [15:0] y_in;
        reg [31:0] tmp;
        begin
            tmp = G_OFF + ((y_in * OUT_W) + x_in);
            addr_g = tmp[16:0];
        end
    endfunction

    function automatic [16:0] addr_b;
        input [15:0] x_in;
        input [15:0] y_in;
        reg [31:0] tmp;
        begin
            tmp = B_OFF + ((y_in * OUT_W) + x_in);
            addr_b = tmp[16:0];
        end
    endfunction

    wire sample_event = in_valid && frame_active && !source_done &&
                       ((src_x % SCALE) == 0) &&
                       ((src_y % SCALE) == 0);

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            src_x <= 16'd0;
            src_y <= 16'd0;
            frame_active <= 1'b0;
            source_done <= 1'b0;
            pad_done <= 1'b0;
            emit_phase <= 3'd0;

            r_byte <= 8'd0;
            g_byte <= 8'd0;
            b_byte <= 8'd0;

            out_data <= 8'd0;
            out_addr <= 17'd0;
            out_we <= 1'b0;
            out_frame_done <= 1'b0;
        end
        else begin
            out_we <= 1'b0;
            out_frame_done <= 1'b0;

            if (frame_start) begin
                src_x <= 16'd0;
                src_y <= 16'd0;
                frame_active <= 1'b1;
                source_done <= 1'b0;
                pad_done <= 1'b0;
                emit_phase <= 3'd0;
            end
            else if (frame_active) begin
                // source coordinate advance
                if (in_valid && !source_done) begin
                    if (src_x == IN_W - 1) begin
                        src_x <= 16'd0;
                        if (src_y == IN_H - 1) begin
                            src_y <= 16'd0;
                            source_done <= 1'b1;
                        end
                        else begin
                            src_y <= src_y + 16'd1;
                        end
                    end
                    else begin
                        src_x <= src_x + 16'd1;
                    end
                end

                // emit R/G/B bytes sequentially for sampled pixel
                if (emit_phase == 3'd0) begin
                    if (sample_event) begin
                        r_byte <= r8;
                        g_byte <= g8;
                        b_byte <= b8;

                        out_data <= r8;
                        out_addr <= addr_r(src_x / SCALE, PAD_TOP + (src_y / SCALE));
                        out_we <= 1'b1;
                        emit_phase <= 3'd1;
                    end
                end
                else if (emit_phase == 3'd1) begin
                    out_data <= g_byte;
                    out_addr <= addr_g(src_x / SCALE, PAD_TOP + (src_y / SCALE));
                    out_we <= 1'b1;
                    emit_phase <= 3'd2;
                end
                else if (emit_phase == 3'd2) begin
                    out_data <= b_byte;
                    out_addr <= addr_b(src_x / SCALE, PAD_TOP + (src_y / SCALE));
                    out_we <= 1'b1;
                    emit_phase <= 3'd0;
                end

                if (source_done && !pad_done) begin
                    pad_done <= 1'b1;
                end

                if (source_done && pad_done) begin
                    frame_active <= 1'b0;
                    out_frame_done <= 1'b1;
                end
            end
        end
    end
endmodule