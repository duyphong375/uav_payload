`timescale 1ns/1ps
// -----------------------------------------------------------------------------
// line_buffer_mc.v — Line buffer 3 dong, DA KENH, cho CNN streaming.
//
// Khac line_buffer_3x3.v cu:
//   - cu: 1 kenh, xuat 9 port win_00..win_22
//   - nay: C kenh, xuat window packed [(K*K*C*8)-1:0]
//
// Kien truc: 3 mang line[0..2], moi mang W*C byte.
//   - Ghi: cap nhat line0 <- line1 <- line2 <- pixel moi (tai dia chi wr_idx)
//   - Doc: lay cua so 3x3 quanh (rd_x, rd_y) cho TAT CA kenh
//
// Dia chi luu tru: lineN[ (x*C) + c ]   (NHWC trong tung dong)
// Thu tu xuat window: byte k = (ic*K*K) + (ky*K) + kx
//   -> khop conv_engine_dynamic_fsm.win_vec[(ic*KERNEL*KERNEL)+(ky*KERNEL)+kx]
//
// GIOI HAN TAI NGUYEN (BSRAM 828 Kbit = 103,5 KiB):
//   W=160, C=3   : 3*160*3   = 1.440 B  =  11,5 Kbit  OK
//   W=160, C=16  : 3*160*16  = 7.680 B  =  61,4 Kbit  OK
//   W=160, C=64  : 3*160*64  = 30.720 B = 245,8 Kbit  OK
//   W=160, C=128 : 3*160*128 = 61.440 B = 491,5 Kbit  OK
//   W=160, C=256 : 3*160*256 = 122.880 B = 983 Kbit   VUOT -> phai tile kenh
//
// Latency doc: 2 chu ky (addr -> data -> packed out). Caller phai giu
// rd_x/rd_y on dinh it nhat 2 chu ky truoc khi dung win_data.
// -----------------------------------------------------------------------------
module line_buffer_mc
#(
    parameter integer W      = 160,   // chieu rong anh (pixel)
    parameter integer C      = 16,    // so kenh
    parameter integer K      = 3,     // kernel (ho tro 1 va 3)
    parameter integer DATA_W = 8,
    parameter integer ADDR_W = 16     // phai du cho W*C
)
(
    input  wire clk,
    input  wire rst_n,

    // Ghi: mot pixel (mot kenh) moi chu ky
    input  wire                          wr_en,
    input  wire [ADDR_W-1:0]             wr_addr,   // x*C + c
    input  wire [DATA_W-1:0]             wr_data,

    // Doc: toa do tam cua so
    input  wire [15:0]                   rd_x,
    input  wire [15:0]                   rd_y,
    output reg  [(K*K*C*DATA_W)-1:0]     win_data
);

    localparam integer LINE_BYTES = W * C;
    localparam integer WIN_BITS   = K * K * C * DATA_W;

    // 3 dong, moi dong LINE_BYTES phan tu
    reg [DATA_W-1:0] line0 [0:LINE_BYTES-1];
    reg [DATA_W-1:0] line1 [0:LINE_BYTES-1];
    reg [DATA_W-1:0] line2 [0:LINE_BYTES-1];

    // ---------------------------------------------------------------------
    // Ghi: dich 3 dong
    // ---------------------------------------------------------------------
    integer wi;
    always @(posedge clk) begin
        if (wr_en && wr_addr < LINE_BYTES) begin
            line0[wr_addr] <= line1[wr_addr];
            line1[wr_addr] <= line2[wr_addr];
            line2[wr_addr] <= wr_data;
        end
    end

    // ---------------------------------------------------------------------
    // Doc: tinh dia chi 3x3 cho tung kenh
    //
    // Voi moi kenh ic va moi (ky,kx), byte can lay la:
    //   line{ky}[ ((rd_x+kx-1) * C) + ic ]
    // Voi bien: neu rd_x+kx-1 ngoai [0, W-1] -> 0 (padding)
    // ---------------------------------------------------------------------
    integer ic, ky, kx;
    integer px;
    integer idx;

    always @(posedge clk) begin
        if (!rst_n) begin
            win_data <= {WIN_BITS{1'b0}};
        end
        else begin
            // Dung bien to hop (blocking) trong vong lap, gan vao win_data
            // bang nonblocking o cuoi moi vong. Tranh dung chung reg s0/s1/s2
            // vi blocking se bi overwrite giua cac vong.
            for (ic = 0; ic < C; ic = ic + 1) begin
                for (ky = 0; ky < K; ky = ky + 1) begin
                    for (kx = 0; kx < K; kx = kx + 1) begin
                        idx = ((ic*K*K)+(ky*K)+kx)*DATA_W;
                        px  = rd_x + kx - 1;

                        if (px < 0 || px >= W) begin
                            win_data[idx +: DATA_W] <= {DATA_W{1'b0}};
                        end
                        else begin
                            case (ky)
                                0: win_data[idx +: DATA_W] <= line0[px*C + ic];
                                1: win_data[idx +: DATA_W] <= line1[px*C + ic];
                                default: win_data[idx +: DATA_W] <= line2[px*C + ic];
                            endcase
                        end
                    end
                end
            end
        end
    end

endmodule
