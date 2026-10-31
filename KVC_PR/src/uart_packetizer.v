`timescale 1ns/1ps

module uart_packetizer
#(
    parameter integer MAX_BOXES = 16,
    parameter integer BOX_W    = 16,
    parameter integer BOX_H    = 16,
    parameter integer CONF_W   = 16,
    parameter integer CLASS_W  = 8
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

    output reg        tx_valid,
    output reg [7:0]  tx_data,
    output reg        tx_last
);

    localparam [7:0] PKT_HEADER = 8'hAA;
    localparam [7:0] PKT_TAIL   = 8'h55;

    localparam [7:0]
        ST_IDLE    = 8'd0,
        ST_COLLECT = 8'd1,
        ST_HEADER  = 8'd2,
        ST_COUNT   = 8'd3,
        ST_BOX     = 8'd4,
        ST_TAIL    = 8'd5;

    reg [7:0] state;
    reg [7:0] box_count;
    reg [7:0] byte_index;
    reg [7:0] box_index;

    reg [BOX_W-1:0] stored_x [0:MAX_BOXES-1];
    reg [BOX_H-1:0] stored_y [0:MAX_BOXES-1];
    reg [BOX_W-1:0] stored_w [0:MAX_BOXES-1];
    reg [BOX_H-1:0] stored_h [0:MAX_BOXES-1];
    reg [CONF_W-1:0] stored_conf [0:MAX_BOXES-1];
    reg [CLASS_W-1:0] stored_class [0:MAX_BOXES-1];

    integer i;

    function automatic [7:0] hi_byte;
        input [15:0] val;
        begin
            hi_byte = val[15:8];
        end
    endfunction

    function automatic [7:0] lo_byte;
        input [15:0] val;
        begin
            lo_byte = val[7:0];
        end
    endfunction

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            state <= ST_IDLE;
            box_count <= 8'd0;
            byte_index <= 8'd0;
            box_index <= 8'd0;
            tx_valid <= 1'b0;
            tx_data <= 8'd0;
            tx_last <= 1'b0;

            for (i = 0; i < MAX_BOXES; i = i + 1) begin
                stored_x[i]    <= {BOX_W{1'b0}};
                stored_y[i]    <= {BOX_H{1'b0}};
                stored_w[i]    <= {BOX_W{1'b0}};
                stored_h[i]    <= {BOX_H{1'b0}};
                stored_conf[i] <= {CONF_W{1'b0}};
                stored_class[i] <= {CLASS_W{1'b0}};
            end
        end
        else begin
            tx_valid <= 1'b0;
            tx_last <= 1'b0;

            case (state)

                ST_IDLE: begin
                    if (in_valid) begin
                        box_count <= 8'd0;
                        byte_index <= 8'd0;
                        box_index <= 8'd0;
                        state <= ST_COLLECT;
                    end
                end

                ST_COLLECT: begin
                    if (in_valid) begin
                        if (box_count < MAX_BOXES) begin
                            stored_x[box_count] <= in_x;
                            stored_y[box_count] <= in_y;
                            stored_w[box_count] <= in_w;
                            stored_h[box_count] <= in_h;
                            stored_conf[box_count] <= in_conf;
                            stored_class[box_count] <= in_class;
                            box_count <= box_count + 8'd1;
                        end
                    end

                    if (in_last) begin
                        state <= ST_HEADER;
                    end
                end

                ST_HEADER: begin
                    tx_valid <= 1'b1;
                    tx_data <= PKT_HEADER;
                    state <= ST_COUNT;
                end

                ST_COUNT: begin
                    tx_valid <= 1'b1;
                    tx_data <= box_count;
                    byte_index <= 8'd0;
                    box_index <= 8'd0;
                    state <= ST_BOX;
                end

                ST_BOX: begin
                    if (box_index < box_count) begin
                        case (byte_index)
                            8'd0: tx_data <= hi_byte(stored_x[box_index]);
                            8'd1: tx_data <= lo_byte(stored_x[box_index]);
                            8'd2: tx_data <= hi_byte(stored_y[box_index]);
                            8'd3: tx_data <= lo_byte(stored_y[box_index]);
                            8'd4: tx_data <= hi_byte(stored_w[box_index]);
                            8'd5: tx_data <= lo_byte(stored_w[box_index]);
                            8'd6: tx_data <= hi_byte(stored_h[box_index]);
                            8'd7: tx_data <= lo_byte(stored_h[box_index]);
                            8'd8: tx_data <= hi_byte(stored_conf[box_index]);
                            8'd9: tx_data <= lo_byte(stored_conf[box_index]);
                            default: tx_data <= stored_class[box_index];
                        endcase

                        tx_valid <= 1'b1;

                        if (byte_index == 8'd10) begin
                            byte_index <= 8'd0;
                            box_index <= box_index + 8'd1;
                            if (box_index == box_count - 1)
                                state <= ST_TAIL;
                        end
                        else begin
                            byte_index <= byte_index + 8'd1;
                        end
                    end
                    else begin
                        state <= ST_TAIL;
                    end
                end

                ST_TAIL: begin
                    tx_valid <= 1'b1;
                    tx_data <= PKT_TAIL;
                    tx_last <= 1'b1;
                    state <= ST_IDLE;
                end

                default: begin
                    state <= ST_IDLE;
                end
            endcase
        end
    end
endmodule