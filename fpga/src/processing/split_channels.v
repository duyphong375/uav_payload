`timescale 1ns/1ps
// Splits an NCHW feature map by channel into [0:FIRST_C) and [FIRST_C:C).
module split_channels #(
    parameter integer W=160, H=160, C=32, FIRST_C=16,
    parameter integer ADDR_W=24
) (
    input wire clk, rst_n, start,
    output wire [ADDR_W-1:0] input_addr,
    input wire [7:0] input_data,
    output reg a_we, output reg [ADDR_W-1:0] a_addr, output reg [7:0] a_data,
    output reg b_we, output reg [ADDR_W-1:0] b_addr, output reg [7:0] b_data,
    output reg busy, done
);
    localparam integer XW=(W<=1)?1:$clog2(W);
    localparam integer YW=(H<=1)?1:$clog2(H);
    localparam integer CW=(C<=1)?1:$clog2(C);
    localparam [2:0] IDLE=0, REQ=1, WAIT_RAM=2, WRITE_OUT=3, ADVANCE=4;
    reg [2:0] state;
    reg [XW-1:0] x; reg [YW-1:0] y; reg [CW-1:0] c;
    wire [63:0] in_calc=(((c*H)+y)*W)+x;
    wire [63:0] local_calc=((((c<FIRST_C)?c:(c-FIRST_C))*H)+y)*W+x;
    assign input_addr=in_calc[ADDR_W-1:0];
    always @(posedge clk or negedge rst_n) begin
        if(!rst_n) begin state<=IDLE; x<=0;y<=0;c<=0;a_we<=0;b_we<=0;a_addr<=0;b_addr<=0;a_data<=0;b_data<=0;busy<=0;done<=0; end
        else begin
            a_we<=0;b_we<=0;done<=0;
            case(state)
                IDLE: if(start && !busy) begin x<=0;y<=0;c<=0;busy<=1;state<=REQ;end
                REQ: state<=WAIT_RAM;
                WAIT_RAM: state<=WRITE_OUT;
                WRITE_OUT: begin
                    if(c<FIRST_C) begin a_we<=1;a_addr<=local_calc[ADDR_W-1:0];a_data<=input_data;end
                    else begin b_we<=1;b_addr<=local_calc[ADDR_W-1:0];b_data<=input_data;end
                    state<=ADVANCE;
                end
                ADVANCE: begin
                    if(x<W-1) begin x<=x+1'b1;state<=REQ;end
                    else begin x<=0;if(y<H-1) begin y<=y+1'b1;state<=REQ;end
                    else begin y<=0;if(c<C-1) begin c<=c+1'b1;state<=REQ;end
                    else begin busy<=0;done<=1;state<=IDLE;end end end
                end
                default: begin state<=IDLE;busy<=0;end
            endcase
        end
    end
endmodule
