`timescale 1ns/1ps
// Memory-based nearest-neighbour upsample in NCHW order.
// SCALE_FACTOR=2 matches common YOLO neck resize-by-2 layers.
module upsample_nearest #(
    parameter integer IN_W=20, IN_H=20, IN_C=256,
    parameter integer SCALE_FACTOR=2,
    parameter integer ADDR_W=24
) (
    input wire clk, rst_n, start,
    output wire [ADDR_W-1:0] input_addr,
    input wire [7:0] input_data,
    output reg output_we,
    output reg [ADDR_W-1:0] output_addr,
    output reg [7:0] output_data,
    output reg busy, done
);
    localparam integer OUT_W=IN_W*SCALE_FACTOR;
    localparam integer OUT_H=IN_H*SCALE_FACTOR;
    localparam integer XW=(OUT_W<=1)?1:$clog2(OUT_W);
    localparam integer YW=(OUT_H<=1)?1:$clog2(OUT_H);
    localparam integer CW=(IN_C<=1)?1:$clog2(IN_C);
    localparam [2:0] IDLE=0, REQ=1, WAIT_RAM=2, WRITE_OUT=3, ADVANCE=4;
    reg [2:0] state;
    reg [XW-1:0] ox;
    reg [YW-1:0] oy;
    reg [CW-1:0] ch;
    wire [31:0] ix=ox/SCALE_FACTOR;
    wire [31:0] iy=oy/SCALE_FACTOR;
    wire [63:0] in_addr_calc=(((ch*IN_H)+iy)*IN_W)+ix;
    wire [63:0] out_addr_calc=(((ch*OUT_H)+oy)*OUT_W)+ox;
    assign input_addr=in_addr_calc[ADDR_W-1:0];
    always @(posedge clk or negedge rst_n) begin
        if(!rst_n) begin
            state<=IDLE; ox<=0; oy<=0; ch<=0; output_we<=0; output_addr<=0; output_data<=0; busy<=0; done<=0;
        end else begin
            output_we<=0; done<=0;
            case(state)
                IDLE: if(start && !busy) begin ox<=0; oy<=0; ch<=0; busy<=1; state<=REQ; end
                REQ: state<=WAIT_RAM;
                WAIT_RAM: state<=WRITE_OUT;
                WRITE_OUT: begin output_we<=1; output_addr<=out_addr_calc[ADDR_W-1:0]; output_data<=input_data; state<=ADVANCE; end
                ADVANCE: begin
                    if(ox<OUT_W-1) begin ox<=ox+1'b1; state<=REQ; end
                    else begin
                        ox<=0;
                        if(oy<OUT_H-1) begin oy<=oy+1'b1; state<=REQ; end
                        else begin
                            oy<=0;
                            if(ch<IN_C-1) begin ch<=ch+1'b1; state<=REQ; end
                            else begin busy<=0; done<=1; state<=IDLE; end
                        end
                    end
                end
                default: begin state<=IDLE; busy<=0; end
            endcase
        end
    end
endmodule
