`timescale 1ns/1ps
// Memory-based signed INT8 max-pooling engine, NCHW layout, synchronous input RAM.
// Padding positions use -128 (INT8 minimum), matching -infinity after quantized saturation.
module maxpool2d #(
    parameter integer IN_W=40, IN_H=40, IN_C=128,
    parameter integer OUT_W=40, OUT_H=40,
    parameter integer K_SIZE=5, STRIDE=1, PAD=2,
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
    localparam integer XW=(OUT_W<=1)?1:$clog2(OUT_W);
    localparam integer YW=(OUT_H<=1)?1:$clog2(OUT_H);
    localparam integer CW=(IN_C<=1)?1:$clog2(IN_C);
    localparam integer KW=(K_SIZE<=1)?1:$clog2(K_SIZE);
    localparam [2:0] IDLE=0, REQ=1, WAIT_RAM=2, SAMPLE=3, WRITE_OUT=4, ADVANCE=5;
    reg [2:0] state;
    reg [XW-1:0] ox;
    reg [YW-1:0] oy;
    reg [CW-1:0] ch;
    reg [KW-1:0] kx, ky;
    reg first_term;
    reg signed [7:0] max_value;
    wire signed [31:0] ix_calc = ($signed({1'b0,ox})*STRIDE)+$signed({1'b0,kx})-PAD;
    wire signed [31:0] iy_calc = ($signed({1'b0,oy})*STRIDE)+$signed({1'b0,ky})-PAD;
    wire in_bounds = (ix_calc>=0)&&(ix_calc<IN_W)&&(iy_calc>=0)&&(iy_calc<IN_H);
    wire [63:0] in_addr_calc = (((ch*IN_H)+iy_calc)*IN_W)+ix_calc;
    wire [63:0] out_addr_calc = (((ch*OUT_H)+oy)*OUT_W)+ox;
    wire signed [7:0] pool_sample = in_bounds ? $signed(input_data) : -8'sd128;
    assign input_addr = in_bounds ? in_addr_calc[ADDR_W-1:0] : {ADDR_W{1'b0}};

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            state<=IDLE; ox<=0; oy<=0; ch<=0; kx<=0; ky<=0;
            first_term<=1; max_value<=-8'sd128;
            output_we<=0; output_addr<=0; output_data<=0; busy<=0; done<=0;
        end else begin
            output_we<=0; done<=0;
            case (state)
                IDLE: if (start && !busy) begin
                    ox<=0; oy<=0; ch<=0; kx<=0; ky<=0; busy<=1; state<=REQ;
                end
                REQ: state<=WAIT_RAM;
                WAIT_RAM: state<=SAMPLE;
                SAMPLE: begin
                    if (first_term) begin max_value<=pool_sample; first_term<=0; end
                    else if (pool_sample > max_value) max_value<=pool_sample;
                    if ((kx==K_SIZE-1)&&(ky==K_SIZE-1)) state<=WRITE_OUT;
                    else begin
                        if (kx<K_SIZE-1) kx<=kx+1'b1;
                        else begin kx<=0; ky<=ky+1'b1; end
                        state<=REQ;
                    end
                end
                WRITE_OUT: begin
                    output_we<=1; output_addr<=out_addr_calc[ADDR_W-1:0]; output_data<=max_value;
                    state<=ADVANCE;
                end
                ADVANCE: begin
                    kx<=0; ky<=0; first_term<=1; max_value<=-8'sd128;
                    if (ox<OUT_W-1) begin ox<=ox+1'b1; state<=REQ; end
                    else begin
                        ox<=0;
                        if (oy<OUT_H-1) begin oy<=oy+1'b1; state<=REQ; end
                        else begin
                            oy<=0;
                            if (ch<IN_C-1) begin ch<=ch+1'b1; state<=REQ; end
                            else begin busy<=0; done<=1; state<=IDLE; end
                        end
                    end
                end
                default: begin state<=IDLE; busy<=0; end
            endcase
        end
    end
endmodule
