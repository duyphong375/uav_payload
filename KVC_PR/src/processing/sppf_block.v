`timescale 1ns/1ps
// SPPF pooling-and-concatenation sub-block (the pre/post Conv layers remain external).
// Computes p1=maxpool(x), p2=maxpool(p1), p3=maxpool(p2), then outputs concat[x,p1,p2,p3]
// along NCHW channel axis. Scratch memories must be dual-port-capable (separate read/write ports).
module sppf_block #(
    parameter integer W=20, H=20, C=256,
    parameter integer K_SIZE=5, STRIDE=1, PAD=2,
    parameter integer ADDR_W=24
) (
    input wire clk, rst_n, start,
    output wire [ADDR_W-1:0] input_raddr,
    input wire [7:0] input_rdata,
    output wire [ADDR_W-1:0] s1_raddr,
    input wire [7:0] s1_rdata,
    output reg s1_we, output reg [ADDR_W-1:0] s1_waddr, output reg [7:0] s1_wdata,
    output wire [ADDR_W-1:0] s2_raddr,
    input wire [7:0] s2_rdata,
    output reg s2_we, output reg [ADDR_W-1:0] s2_waddr, output reg [7:0] s2_wdata,
    output wire [ADDR_W-1:0] s3_raddr,
    input wire [7:0] s3_rdata,
    output reg s3_we, output reg [ADDR_W-1:0] s3_waddr, output reg [7:0] s3_wdata,
    output reg output_we,
    output reg [ADDR_W-1:0] output_addr,
    output reg [7:0] output_data,
    output reg busy, done
);
    localparam integer OUT_C=4*C;
    localparam integer XW=(W<=1)?1:$clog2(W);
    localparam integer YW=(H<=1)?1:$clog2(H);
    localparam integer CW=(OUT_C<=1)?1:$clog2(OUT_C);
    localparam [2:0] IDLE=0, LAUNCH_POOL=1, WAIT_POOL=2, CAT_REQ=3, CAT_WAIT=4, CAT_WRITE=5;
    reg [2:0] state;
    reg [1:0] pool_stage;
    reg pool_start;
    wire pool_busy, pool_done;
    wire [ADDR_W-1:0] pool_in_addr;
    wire [ADDR_W-1:0] pool_out_addr;
    wire [7:0] pool_out_data;
    wire pool_out_we;
    reg [XW-1:0] ox;
    reg [YW-1:0] oy;
    reg [CW-1:0] oc;
    wire [63:0] concat_read_addr=((((oc % C)*H)+oy)*W)+ox;
    wire [1:0] concat_bank = oc / C;
    wire [7:0] concat_read_data = (concat_bank==0) ? input_rdata :
                                  (concat_bank==1) ? s1_rdata :
                                  (concat_bank==2) ? s2_rdata : s3_rdata;

    assign input_raddr = (state==CAT_REQ || state==CAT_WAIT || state==CAT_WRITE) ? concat_read_addr[ADDR_W-1:0] :
                         (pool_stage==0 ? pool_in_addr : {ADDR_W{1'b0}});
    assign s1_raddr = (state==CAT_REQ || state==CAT_WAIT || state==CAT_WRITE) ? concat_read_addr[ADDR_W-1:0] :
                      (pool_stage==1 ? pool_in_addr : {ADDR_W{1'b0}});
    assign s2_raddr = (state==CAT_REQ || state==CAT_WAIT || state==CAT_WRITE) ? concat_read_addr[ADDR_W-1:0] :
                      (pool_stage==2 ? pool_in_addr : {ADDR_W{1'b0}});
    assign s3_raddr = (state==CAT_REQ || state==CAT_WAIT || state==CAT_WRITE) ? concat_read_addr[ADDR_W-1:0] : {ADDR_W{1'b0}};

    maxpool2d #(.IN_W(W),.IN_H(H),.IN_C(C),.OUT_W(W),.OUT_H(H),.K_SIZE(K_SIZE),.STRIDE(STRIDE),.PAD(PAD),.ADDR_W(ADDR_W))
    u_pool (
        .clk(clk),.rst_n(rst_n),.start(pool_start),
        .input_addr(pool_in_addr),
        .input_data((pool_stage==0)?input_rdata:((pool_stage==1)?s1_rdata:s2_rdata)),
        .output_we(pool_out_we),.output_addr(pool_out_addr),.output_data(pool_out_data),
        .busy(pool_busy),.done(pool_done)
    );

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            state<=IDLE;pool_stage<=0;pool_start<=0;ox<=0;oy<=0;oc<=0;
            s1_we<=0;s1_waddr<=0;s1_wdata<=0;s2_we<=0;s2_waddr<=0;s2_wdata<=0;s3_we<=0;s3_waddr<=0;s3_wdata<=0;
            output_we<=0;output_addr<=0;output_data<=0;busy<=0;done<=0;
        end else begin
            pool_start<=0;s1_we<=0;s2_we<=0;s3_we<=0;output_we<=0;done<=0;
            // Route the pooling engine's write port to the current scratch tensor.
            if (pool_out_we) begin
                if (pool_stage==0) begin s1_we<=1;s1_waddr<=pool_out_addr;s1_wdata<=pool_out_data;end
                else if (pool_stage==1) begin s2_we<=1;s2_waddr<=pool_out_addr;s2_wdata<=pool_out_data;end
                else begin s3_we<=1;s3_waddr<=pool_out_addr;s3_wdata<=pool_out_data;end
            end
            case(state)
                IDLE: if(start && !busy) begin busy<=1;pool_stage<=0;state<=LAUNCH_POOL;end
                LAUNCH_POOL: begin pool_start<=1;state<=WAIT_POOL;end
                WAIT_POOL: if(pool_done) begin
                    if(pool_stage<2) begin pool_stage<=pool_stage+1'b1;state<=LAUNCH_POOL;end
                    else begin ox<=0;oy<=0;oc<=0;state<=CAT_REQ;end
                end
                CAT_REQ: state<=CAT_WAIT;
                CAT_WAIT: state<=CAT_WRITE;
                CAT_WRITE: begin
                    output_we<=1;output_addr<=((((oc*H)+oy)*W)+ox);output_data<=concat_read_data;
                    if(ox<W-1) begin ox<=ox+1'b1;state<=CAT_REQ;end
                    else begin ox<=0;if(oy<H-1) begin oy<=oy+1'b1;state<=CAT_REQ;end
                    else begin oy<=0;if(oc<OUT_C-1) begin oc<=oc+1'b1;state<=CAT_REQ;end
                    else begin busy<=0;done<=1;state<=IDLE;end end end
                end
                default: begin state<=IDLE;busy<=0;end
            endcase
        end
    end
endmodule
