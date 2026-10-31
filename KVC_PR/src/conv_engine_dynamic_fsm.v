`timescale 1ns/1ps

module conv_engine_dynamic_fsm
#(
    parameter integer KERNEL = 3,
    parameter integer IN_C   = 3,
    parameter integer OUT_C  = 32,
    parameter integer IMG_W  = 160,
    parameter integer IMG_H  = 160,
    parameter integer Q_BITS = 8
)
(
    input  wire clk,
    input  wire rst_n,
    input  wire start,

    input  wire [15:0] p_stride,
    input  wire [15:0] p_pad,
    input  wire [23:0] p_weight_base,
    input  wire [23:0] p_bias_base,
    input  wire [23:0] p_quant_base,

    input  wire win_valid,
    output reg  win_ready,
    input  wire [(KERNEL*KERNEL*IN_C*Q_BITS)-1:0] win_data,

    output reg [15:0] bias_addr,
    input  wire [31:0] bias_rdata,
    input  wire        bias_rvalid,
    output reg        bias_req,

    output reg [15:0] mult_addr,
    input  wire [39:0] mult_rdata,   // [39:32]=shift, [31:0]=mult Q31
    input  wire        mult_rvalid,
    output reg        mult_req,

    output reg [23:0] weight_addr,
    input  wire [31:0] weight_rdata,
    input  wire        weight_rvalid,
    output reg        weight_req,

    output reg        out_valid,
    output reg [15:0] out_x,
    output reg [15:0] out_y,
    output reg [15:0] out_c,
    output reg [7:0]  out_q,
    output reg [16:0] out_addr,

    output reg busy,
    output reg done
);

    localparam integer WIN_WORDS = KERNEL * KERNEL * IN_C;

    localparam [3:0]
        ST_IDLE      = 4'd0,
        ST_WAIT_WIN  = 4'd1,
        ST_PREP      = 4'd2,
        ST_MAC       = 4'd3,
        ST_EMIT      = 4'd4,
        ST_NEXT_OC   = 4'd5;

    reg [3:0] state;

    reg [15:0] ox;
    reg [15:0] oy;
    reg [15:0] oc;
    reg [15:0] kx;
    reg [15:0] ky;
    reg [15:0] ic;

    reg signed [31:0] sum_acc;
    reg signed [31:0] bias_val;
    reg signed [31:0] mult_val;
    reg signed [31:0] weight_val;

    reg [31:0] addr_tmp32;
    reg [31:0] weight_addr32;
    reg [15:0] shift_val;      // so bit dich requant, tu mult_rdata[39:32] neu co

    reg [7:0] win_vec [0:26];
    integer k;

    // Requantization dung (E-02 FIXED):
    //   acc      : tich luy INT32
    //   mult_val : Q31 multiplier
    //   shift    : so bit dich (metadata ghi 31)
    //   out      = clamp( round((acc * mult) >> shift) + bias )
    // Truoc day: clamp_q(sum_acc * mult_val + bias_val) — thieu shift,
    // tich 32x32 bi cat vao 32 bit, khong round.
    function automatic [7:0] requant;
        input signed [31:0] acc;
        input signed [31:0] mult;
        input        [15:0] shift;
        reg   signed [63:0] prod;
        reg   signed [63:0] rounded;
        reg   signed [63:0] shifted;
        reg   signed [63:0] with_bias;
        reg          [63:0] p_abs;
        reg          [63:0] half;
        reg          [63:0] rem;
        reg          [63:0] q_abs;
        begin
            prod = $signed(acc) * $signed(mult);

            if (shift == 16'd0) begin
                shifted = prod;
            end
            else begin
                // Ties-to-even (khop metadata conv0 "rounding: nearest, ties-to-even")
                // Lam viec tren tri tuyet doi de khong phu thuoc bit dau.
                p_abs = (prod < 0) ? (-prod) : prod;
                half  = (64'd1 <<< (shift - 16'd1));
                rem   = p_abs & ((64'd1 <<< shift) - 64'd1);
                q_abs = p_abs >>> shift;
                if (rem > half || (rem == half && q_abs[0]))
                    q_abs = q_abs + 64'd1;
                shifted = (prod < 0) ? (-$signed(q_abs)) : $signed(q_abs);
            end

            with_bias = shifted + $signed({{32{bias_val[31]}}, bias_val});

            if (with_bias > 64'sd127)       requant = 8'd127;
            else if (with_bias < -64'sd128) requant = 8'd128;  // -128
            else                            requant = with_bias[7:0];
        end
    endfunction

    always @(*) begin
        for (k = 0; k < 27; k = k + 1) begin
            win_vec[k] = win_data[(k * 8) +: 8];
        end
    end

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            state <= ST_IDLE;
            win_ready <= 1'b1;
            bias_req <= 1'b0;
            mult_req <= 1'b0;
            weight_req <= 1'b0;

            bias_addr <= 16'd0;
            mult_addr <= 16'd0;
            weight_addr <= 16'd0;

            out_valid <= 1'b0;
            out_x <= 16'd0;
            out_y <= 16'd0;
            out_c <= 16'd0;
            out_q <= 8'd0;
            out_addr <= 17'd0;

            busy <= 1'b0;
            done <= 1'b0;

            ox <= 16'd0;
            oy <= 16'd0;
            oc <= 16'd0;
            kx <= 16'd0;
            ky <= 16'd0;
            ic <= 16'd0;

            sum_acc <= 32'sd0;
            bias_val <= 32'sd0;
            mult_val <= 32'sd0;
            weight_val <= 32'sd0;
            shift_val <= 16'd31;   // mac dinh Q31 theo metadata conv0
        end
        else begin
            out_valid <= 1'b0;
            done <= 1'b0;

            case (state)
                ST_IDLE: begin
                    win_ready <= 1'b1;
                    if (start) begin
                        busy <= 1'b1;
                        ox <= 16'd0;
                        oy <= 16'd0;
                        oc <= 16'd0;
                        kx <= 16'd0;
                        ky <= 16'd0;
                        ic <= 16'd0;
                        sum_acc <= 32'sd0;
                        state <= ST_WAIT_WIN;
                    end
                end

                ST_WAIT_WIN: begin
                    win_ready <= 1'b1;
                    if (win_valid) begin
                        sum_acc <= 32'sd0;
                        kx <= 16'd0;
                        ky <= 16'd0;
                        ic <= 16'd0;
                        state <= ST_PREP;
                    end
                end

                ST_PREP: begin
                    // E-01 FIXED: giu du 24 bit dia chi flash.
                    // Truoc day `weight_addr <= weight_addr32[15:0]` cat mat 8 bit
                    // cao, bien p_weight_base=0x400000 thanh 0x0000.
                    weight_addr32 = p_weight_base + (oc * IN_C * KERNEL * KERNEL) +
                                    (ic * KERNEL * KERNEL) +
                                    (ky * KERNEL) + kx;

                    weight_addr <= weight_addr32[23:0];
                    bias_addr <= oc;
                    mult_addr <= oc;

                    weight_req <= 1'b1;
                    bias_req <= 1'b1;
                    mult_req <= 1'b1;

                    state <= ST_MAC;
                end

                ST_MAC: begin
                    weight_req <= 1'b0;
                    bias_req <= 1'b0;
                    mult_req <= 1'b0;

                    // LUU Y: phai dung truc tiep *_rdata (gia tri DANG co tren bus),
                    // KHONG dung weight_val/bias_val/mult_val vi chung duoc gan bang
                    // nonblocking trong cung chu ky -> van la gia tri CU cua tap truoc.
                    // Day la loi N-08 (tap dau dung weight reset) da duoc sua.
                    if (weight_rvalid && bias_rvalid && mult_rvalid) begin
                        mult_val  <= $signed(mult_rdata[31:0]);
                        shift_val <= {8'd0, mult_rdata[39:32]};
                        bias_val  <= $signed(bias_rdata);

                        sum_acc <= sum_acc +
                            ($signed(win_vec[(ic * KERNEL * KERNEL) + (ky * KERNEL) + kx]) *
                             $signed(weight_rdata[7:0]));

                        if (kx == KERNEL - 1) begin
                            kx <= 16'd0;
                            if (ky == KERNEL - 1) begin
                                ky <= 16'd0;
                                if (ic == IN_C - 1) begin
                                    ic <= 16'd0;
                                    state <= ST_EMIT;
                                end
                                else begin
                                    ic <= ic + 16'd1;
                                    state <= ST_PREP;
                                end
                            end
                            else begin
                                ky <= ky + 16'd1;
                                state <= ST_PREP;
                            end
                        end
                        else begin
                            kx <= kx + 16'd1;
                            state <= ST_PREP;
                        end
                    end
                end

                ST_EMIT: begin
                    addr_tmp32 = ((oy * IMG_W) + ox);

                    out_valid <= 1'b1;
                    out_x <= ox;
                    out_y <= oy;
                    out_c <= oc;
                    out_q <= requant(sum_acc, mult_val, shift_val);
                    out_addr <= addr_tmp32[16:0];
                    done <= 1'b1;

                    if (oc == OUT_C - 1) begin
                        oc <= 16'd0;
                        sum_acc <= 32'sd0;
                        // PIXEL MOI: phai xin window moi tu line buffer.
                        // Truoc day chuyen thang sang buoc tiep ma khong quay lai
                        // ST_WAIT_WIN -> engine dung lai window cua pixel dau
                        // cho toan bo anh (phat hien qua tb_conv0_golden: 987 mismatch).
                        if (ox + p_stride < IMG_W) begin
                            ox <= ox + p_stride;
                            state <= ST_WAIT_WIN;
                        end
                        else begin
                            ox <= 16'd0;
                            if (oy + p_stride < IMG_H) begin
                                oy <= oy + p_stride;
                                state <= ST_WAIT_WIN;
                            end
                            else begin
                                oy <= 16'd0;
                                busy <= 1'b0;
                                state <= ST_IDLE;
                            end
                        end
                    end
                    else begin
                        oc <= oc + 16'd1;
                        sum_acc <= 32'sd0;
                        state <= ST_PREP;
                    end
                end

                default: begin
                    state <= ST_IDLE;
                end
            endcase
        end
    end
endmodule