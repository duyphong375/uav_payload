`timescale 1ns/1ps
// NCHW channel-axis concatenation for two feature maps with identical H and W.
// Both input RAMs are synchronous-read, and output writes are sequential.
module concat_feature #(
    parameter integer W=40, H=40, CA=64, CB=64,
    parameter integer ADDR_W=24
) (
    input wire clk, rst_n, start,
    output wire [ADDR_W-1:0] a_addr,
    input wire [7:0] a_data,
    output wire [ADDR_W-1:0] b_addr,
    input wire [7:0] b_data,
    output reg output_we,
    output reg [ADDR_W-1:0] output_addr,
    output reg [7:0] output_data,
    output reg busy, done
);
    localparam integer OUT_C=CA+CB;
    localparam integer XW=(W<=1)?1:$clog2(W);
    localparam integer YW=(H<=1)?1:$clog2(H);
    localparam integer CW=(OUT_C<=1)?1:$clog2(OUT_C);
    localparam [2:0] IDLE=0, REQ=1, WAIT_RAM=2, WRITE_OUT=3, ADVANCE=4;
    reg [2:0] state;
    reg [XW-1:0] x;
    reg [YW-1:0] y;
    reg [CW-1:0] c;
    wire use_a=(c<CA);
    wire [63:0] a_calc=(((c*H)+y)*W)+x;
    wire [63:0] b_calc=((((c-CA)*H)+y)*W)+x;
    wire [63:0] out_calc=(((c*H)+y)*W)+x;
    assign a_addr=use_a ? a_calc[ADDR_W-1:0] : {ADDR_W{1'b0}};
    assign b_addr=use_a ? {ADDR_W{1'b0}} : b_calc[ADDR_W-1:0];
    always @(posedge clk or negedge rst_n) begin
        if(!rst_n) begin state<=IDLE; x<=0; y<=0; c<=0; output_we<=0; output_addr<=0; output_data<=0; busy<=0; done<=0; end
        else begin
            output_we<=0; done<=0;
            case(state)
                IDLE: if(start && !busy) begin x<=0; y<=0; c<=0; busy<=1; state<=REQ; end
                REQ: state<=WAIT_RAM;
                WAIT_RAM: state<=WRITE_OUT;
                WRITE_OUT: begin output_we<=1; output_addr<=out_calc[ADDR_W-1:0]; output_data<=use_a?a_data:b_data; state<=ADVANCE; end
                ADVANCE: begin
                    if(x<W-1) begin x<=x+1'b1; state<=REQ; end
                    else begin x<=0; if(y<H-1) begin y<=y+1'b1; state<=REQ; end
                    else begin y<=0; if(c<OUT_C-1) begin c<=c+1'b1; state<=REQ; end
                    else begin busy<=0; done<=1; state<=IDLE; end end end
                end
                default: begin state<=IDLE; busy<=0; end
            endcase
        end
    end
endmodule
