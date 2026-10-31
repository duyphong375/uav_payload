
module conv1_core #(
    parameter integer ACC_W = 32,
    parameter integer F     = 30
)(
    input  wire                    clk,
    input  wire                    rst_n,

    // Dieu khien MAC
    input  wire                    start,
    input  wire                    term_valid,
    input  wire                    term_last,

    // Du lieu dau vao
    input  wire [7:0]              x_u8,
    input  wire signed [7:0]       w_s8,
    input  wire signed [31:0]      bias,

    // Kenh dau ra, tuong ung 32 output channels
    input  wire [4:0]              channel_idx,

    // Ket qua
    output wire [7:0]              y_out,
    output wire signed [ACC_W-1:0] acc_out,
    output wire                    busy,
    output wire                    done
);

    // Khoi 1: Tich chap va cong don
    conv1_mac #(
        .ACC_W(ACC_W)
    ) u_conv1_mac (
        .clk        (clk),
        .rst_n      (rst_n),
        .start      (start),
        .bias       (bias),
        .term_valid (term_valid),
        .x_u8       (x_u8),
        .w_s8       (w_s8),
        .term_last  (term_last),
        .acc        (acc_out),
        .busy       (busy),
        .done       (done)
    );

    // Khoi 2: Requantization
    conv1_requant #(
    .ACC_W(ACC_W),
    .F(F)
) u_conv1_requant (
    .acc_in     (acc_out),
    .channel_idx(channel_idx),
    .y_out      (y_out)
);

endmodule
