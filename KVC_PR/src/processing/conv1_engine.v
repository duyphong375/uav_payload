`timescale 1ns/1ps

module conv1_engine #(
    parameter integer IN_W  = 320,
    parameter integer IN_H  = 320,
    parameter integer IN_C  = 16,
    parameter integer OUT_W = 160,
    parameter integer OUT_H = 160,
    parameter integer OUT_C = 32,
    parameter integer ACC_W = 32,
    parameter integer F     = 30,
    parameter integer STRIDE = 2,
    parameter integer K_SIZE = 3,
    parameter integer PAD    = (K_SIZE - 1) / 2,
    parameter [7:0]   ZERO_POINT_X = 8'd1,
    
    // Mở rộng độ rộng bit để hỗ trợ mạng YOLO11n
    parameter integer ADDR_W = 24, // Hỗ trợ tối đa 16 triệu byte
    parameter integer CH_W   = 10, // Hỗ trợ tối đa 1023 kênh
    parameter integer HW_W   = 10  // Hỗ trợ tối đa 1023 pixel
) (
    input  wire                    clk,
    input  wire                    rst_n,
    input  wire                    start,

    // Input Interface
    output wire [ADDR_W-1:0]       input_addr,
    input  wire [7:0]              input_data,

    // Weight Interface
    output wire [ADDR_W-1:0]       weight_addr,
    input  wire signed [7:0]       weight_data,

    // Bias Interface
    output wire [CH_W-1:0]         bias_addr,
    input  wire signed [31:0]      bias_data,

    // Requantization Multiplier Interface
    input  wire                    mult_we,
    input  wire [CH_W-1:0]         mult_addr,
    input  wire signed [31:0]      mult_data,
    input  wire signed [7:0]       zero_out_data,

    // Output Interface
    output reg                     output_we,
    output reg [ADDR_W-1:0]        output_addr,
    output reg [7:0]               output_data,

    output reg                     busy,
    output reg                     done
);

    localparam [3:0]
        IDLE           = 4'd0,
        BIAS_REQ       = 4'd1,
        BIAS_WAIT      = 4'd2,
        START_MAC      = 4'd3,
        WAIT_MAC_START = 4'd4,
        READ_REQ       = 4'd5,
        READ_WAIT      = 4'd6,
        FEED           = 4'd7,
        WAIT_MAC_DONE  = 4'd8;

    reg [3:0] state;

    // Bộ đếm tọa độ và kênh (Đã mở rộng độ rộng bit)
    reg [HW_W-1:0] ox, oy;
    reg [CH_W-1:0] oc, ic;
    reg [3:0]      kx, ky;

    reg mac_start;

    wire signed [ACC_W-1:0] acc_out;
    wire mac_busy;
    wire mac_done;

    wire term_valid;
    wire term_last;
    wire [7:0] x_for_mac;
    wire [7:0] y_out;

    // Các phép tính tọa độ (sử dụng độ rộng bit lớn hơn)
    wire signed [31:0] ix_calc;
    wire signed [31:0] iy_calc;
    wire signed [63:0] in_addr_calc;
    wire signed [63:0] wt_addr_calc;
    wire signed [63:0] out_addr_calc;

    // 1. Tính tọa độ Input
    assign ix_calc = ($signed({1'b0, ox}) * STRIDE) + $signed({1'b0, kx}) - PAD;
    assign iy_calc = ($signed({1'b0, oy}) * STRIDE) + $signed({1'b0, ky}) - PAD;

    // 2. Tính địa chỉ (Address calculation)
    assign in_addr_calc  = (((ic * IN_H) + iy_calc) * IN_W) + ix_calc;
    assign wt_addr_calc  = (((oc * IN_C + ic) * K_SIZE + ky) * K_SIZE + kx);
    assign out_addr_calc = ((oc * OUT_H + oy) * OUT_W + ox);

    // 3. Gán địa chỉ với điều kiện Padding
    assign input_addr  = ((ix_calc >= 0) && (ix_calc < IN_W) && (iy_calc >= 0) && (iy_calc < IN_H)) ? in_addr_calc[ADDR_W-1:0] : {ADDR_W{1'b0}};
    assign weight_addr = wt_addr_calc[ADDR_W-1:0];
    assign bias_addr   = oc;

    // 4. Xử lý Zero-point cho Padding
    assign x_for_mac = ((ix_calc >= 0) && (ix_calc < IN_W) && (iy_calc >= 0) && (iy_calc < IN_H)) ? input_data : ZERO_POINT_X;

    assign term_valid = (state == FEED);
    assign term_last  = (state == FEED) && (ic == IN_C-1) && (ky == K_SIZE-1) && (kx == K_SIZE-1);

    // Bộ nhớ nội bộ lưu Multiplier và Zero-point Output
    reg signed [31:0] mult_mem [0:1023];
    reg signed [7:0]  zero_out_reg;

    always @(posedge clk) begin
        if (mult_we) begin
            mult_mem[mult_addr] <= mult_data;
            zero_out_reg <= zero_out_data;
        end
    end

    // Instance MAC
    conv1_mac #(
        .ACC_W(ACC_W)
    ) u_conv1_mac (
        .clk        (clk),
        .rst_n      (rst_n),
        .start      (mac_start),
        .bias       (bias_data),
        .term_valid (term_valid),
        .x_u8       (x_for_mac),
        .w_s8       (weight_data),
        .term_last  (term_last),
        .acc        (acc_out),
        .busy       (mac_busy),
        .done       (mac_done)
    );

    // Instance Requantization
    conv1_requant #(
        .F(F)
    ) u_conv1_requant (
        .acc_in         (acc_out),
        .multiplier     (mult_mem[oc]),
        .zero_point_out (zero_out_reg),
        .y_out          (y_out)
    );

    // FSM Điều khiển
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            state       <= IDLE;
            ox          <= 0;
            oy          <= 0;
            oc          <= 0;
            ic          <= 0;
            kx          <= 0;
            ky          <= 0;
            mac_start   <= 0;
            output_we   <= 0;
            output_addr <= 0;
            output_data <= 0;
            busy        <= 0;
            done        <= 0;
        end else begin
            mac_start <= 0;
            output_we <= 0;
            done      <= 0;

            case (state)
                IDLE: begin
                    if (start && !busy) begin
                        ox <= 0; oy <= 0; oc <= 0; ic <= 0; kx <= 0; ky <= 0;
                        busy <= 1;
                        state <= BIAS_REQ;
                    end
                end

                BIAS_REQ:  state <= BIAS_WAIT;
                BIAS_WAIT: state <= START_MAC;

                START_MAC: begin
                    mac_start <= 1;
                    state <= WAIT_MAC_START;
                end

                WAIT_MAC_START: begin
                    if (mac_busy) begin
                        ic <= 0; kx <= 0; ky <= 0;
                        state <= READ_REQ;
                    end
                end

                READ_REQ:  state <= READ_WAIT;
                READ_WAIT: state <= FEED;

                FEED: begin
                    if (term_last) begin
                        state <= WAIT_MAC_DONE;
                    end else begin
                        if (ic < IN_C-1) begin
                            ic <= ic + 1'b1;
                        end else begin
                            ic <= 0;
                            if (kx < K_SIZE-1) begin
                                kx <= kx + 1'b1;
                            end else begin
                                kx <= 0;
                                if (ky < K_SIZE-1)
                                    ky <= ky + 1'b1;
                                else
                                    ky <= 0;
                            end
                        end
                        state <= READ_REQ;
                    end
                end

                WAIT_MAC_DONE: begin
                    if (mac_done) begin
                        output_we   <= 1;
                        output_addr <= out_addr_calc[ADDR_W-1:0];
                        output_data <= y_out;

                        ic <= 0; kx <= 0; ky <= 0;

                        if (ox < OUT_W-1) begin
                            ox <= ox + 1'b1;
                            state <= BIAS_REQ;
                        end else begin
                            ox <= 0;
                            if (oy < OUT_H-1) begin
                                oy <= oy + 1'b1;
                                state <= BIAS_REQ;
                            end else begin
                                oy <= 0;
                                if (oc < OUT_C-1) begin
                                    oc <= oc + 1'b1;
                                    state <= BIAS_REQ;
                                end else begin
                                    busy  <= 0;
                                    done  <= 1;
                                    state <= IDLE;
                                end
                            end
                        end
                    end
                end

                default: begin
                    state <= IDLE;
                    busy  <= 0;
                end
            endcase
        end
    end

endmodule