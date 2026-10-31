`timescale 1ns/1ps
// Channel-axis concat for N_SEGMENTS tensors, each with the same SEG_C,H,W.
// Each tensor memory is synchronous-read. Packed buses are segment 0 in least significant bits.
module concat_n_feature #(
    parameter integer W=160, H=160, SEG_C=16, N_SEGMENTS=3,
    parameter integer ADDR_W=24,
    parameter integer XW=(W<=1)?1:$clog2(W),
    parameter integer YW=(H<=1)?1:$clog2(H),
    parameter integer CW=(SEG_C*N_SEGMENTS<=1)?1:$clog2(SEG_C*N_SEGMENTS)
) (
    input wire clk, rst_n, start,
    output reg [N_SEGMENTS*ADDR_W-1:0] segment_addr,
    input wire [N_SEGMENTS*8-1:0] segment_data,
    output reg output_we,
    output reg [ADDR_W-1:0] output_addr,
    output reg [7:0] output_data,
    output reg busy, done
);
    localparam integer OUT_C=SEG_C*N_SEGMENTS;
    localparam [2:0] IDLE=0, REQ=1, WAIT_RAM=2, WRITE_OUT=3, ADVANCE=4;
    reg [2:0] state;
    reg [XW-1:0] x;
    reg [YW-1:0] y;
    reg [CW-1:0] c;
    integer i;
    reg [31:0] bank_index;
    reg [31:0] local_channel;
    reg [63:0] addr_calc;
    reg [63:0] out_calc;
    reg [7:0] selected_data;
    always @* begin
        bank_index = c / SEG_C;
        local_channel = c % SEG_C;
        addr_calc = ((local_channel*H)+y)*W+x;
        out_calc = ((c*H)+y)*W+x;
        segment_addr = {N_SEGMENTS*ADDR_W{1'b0}};
        for (i=0; i<N_SEGMENTS; i=i+1) begin
            if (bank_index == i)
                segment_addr[i*ADDR_W +: ADDR_W] = addr_calc[ADDR_W-1:0];
        end
        selected_data = segment_data >> (bank_index*8);
    end
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin state<=IDLE;x<=0;y<=0;c<=0;output_we<=0;output_addr<=0;output_data<=0;busy<=0;done<=0;end
        else begin
            output_we<=0;done<=0;
            case(state)
                IDLE: if(start && !busy) begin x<=0;y<=0;c<=0;busy<=1;state<=REQ;end
                REQ: state<=WAIT_RAM;
                WAIT_RAM: state<=WRITE_OUT;
                WRITE_OUT: begin output_we<=1;output_addr<=out_calc[ADDR_W-1:0];output_data<=selected_data;state<=ADVANCE;end
                ADVANCE: begin
                    if(x<W-1) begin x<=x+1'b1;state<=REQ;end
                    else begin x<=0;if(y<H-1) begin y<=y+1'b1;state<=REQ;end
                    else begin y<=0;if(c<OUT_C-1) begin c<=c+1'b1;state<=REQ;end
                    else begin busy<=0;done<=1;state<=IDLE;end end end
                end
                default: begin state<=IDLE;busy<=0;end
            endcase
        end
    end
endmodule
