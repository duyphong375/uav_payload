`timescale 1ns/1ps
module kvc_yolo_top (
    input wire clk, rst_n, start_frame,
    
    // Giao diện Feature Map (Dùng cho Streamer nạp vào Line Buffer)
    output wire [23:0] fm_rd_addr, input wire [7:0] fm_rd_data,
    output wire [23:0] fm_wr_addr, output wire [7:0] fm_wr_data, output wire fm_wr_en,
    output wire fifo_rd_en, input wire [255:0] fifo_rd_data, input wire fifo_empty,
    output wire [15:0] bias_addr, input wire signed [31:0] bias_data,
    output wire [15:0] quant_addr, input wire signed [31:0] quant_multiplier,
    input wire [5:0] quant_shift,
    output reg frame_done, output wire [7:0] debug_layer_idx
);
    reg [7:0] layer_idx;
    reg [15:0] p_in_w, p_in_h, p_in_c, p_out_w, p_out_h, p_out_c;
    reg [3:0]  p_k_size, p_stride, p_pad;
    reg [15:0] p_icg, p_ocg;
    reg [15:0] p_groups;
    reg [23:0] p_wbase, p_bbase, p_qbase;
    reg [7:0]  p_act;

    // =========================================================================
    // BANG CAU HINH LOP — SINH TU conv_layer_map.csv (88 conv that)
    //
    // Truoc day: 140 dong hard-code voi 52 placeholder (p_in_w=1, p_in_h=1,
    // p_in_c=1) va TAT CA p_stride=1 (sai: ONNX co 7 conv stride 2). Bang cu
    // cung khong co p_groups nen 7 lop grouped (nhom 64/128/256) khong the chay.
    //
    // layer_table.vh sinh boi tools/gen_layer_table.py, da verify 0 mismatch
    // so voi CSV (88 dong, 7 stride=2, 7 grouped, 0 placeholder).
    // =========================================================================
    always @(*) begin
        `include "layer_table.vh"
    end

    // ==========================================
    // LINE BUFFER & STREAMER
    // ==========================================
    wire [7:0] win_00, win_01, win_02;
    wire [7:0] win_10, win_11, win_12;
    wire [7:0] win_20, win_21, win_22;
    wire [9:0] wr_x, rd_x;
    wire wr_en;

    reg [9:0] stream_x;
    reg [9:0] stream_y;
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            stream_x <= 0;
            stream_y <= 0;
        end else if (engine_start) begin
            stream_x <= 0;
            stream_y <= 0;
        end else if (stream_x < p_in_w - 1) begin
            stream_x <= stream_x + 10'd1;
        end else begin
            stream_x <= 0;
            if (stream_y < p_in_h - 1) stream_y <= stream_y + 10'd1;
        end
    end

    assign wr_x  = stream_x;
    assign wr_en = 1'b1; 
    assign rd_x  = stream_x; 

    line_buffer_3x3 #(.MAX_W(640)) u_linebuf (
        .clk(clk), .rst_n(rst_n),
        .wr_en(wr_en), .wr_x(wr_x), .wr_data(fm_rd_data),
        .rd_x(rd_x),
        .win_00(win_00), .win_01(win_01), .win_02(win_02),
        .win_10(win_10), .win_11(win_11), .win_12(win_12),
        .win_20(win_20), .win_21(win_21), .win_22(win_22)
    );

    assign fm_rd_addr = (stream_y * p_in_w + stream_x) * p_in_c; 

    // ==========================================
    // KẾT NỐI ENGINE VỚI LINE BUFFER
    // ==========================================
    reg engine_start;
    // [THÊM MỚI] Bộ đếm trễ để chờ Line Buffer nạp đủ 2 hàng dữ liệu
    reg [15:0] delay_cnt;
    reg engine_start_delayed;
    reg engine_start_r;
    
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            delay_cnt <= 0;
            engine_start_delayed <= 0;
            engine_start_r <= 0;
        end else begin
            engine_start_r <= engine_start;
            engine_start_delayed <= 0;
            
            if (engine_start && !engine_start_r) begin
                // Phát hiện xung start
                delay_cnt <= p_in_w * 16'd2;
            end else if (delay_cnt > 0) begin
                delay_cnt <= delay_cnt - 16'd1;
                if (delay_cnt == 1) begin
                    engine_start_delayed <= 1;
                end
            end
        end
    end
    
    //wire engine_busy, engine_done;
    //wire [7:0] conv_out;
    wire engine_busy, engine_done;
    wire [7:0] conv_out;
    
    conv_engine_dynamic u_eng (
        .clk(clk), .rst_n(rst_n), .start(engine_start_delayed),
        .p_in_w(p_in_w), .p_in_h(p_in_h), .p_in_c(p_in_c),
        .p_out_w(p_out_w), .p_out_h(p_out_h), .p_out_c(p_out_c),
        .p_k_size(p_k_size), .p_stride(p_stride), .p_pad(p_pad),
        .p_ic_per_group(p_icg), .p_oc_per_group(p_ocg),
        .p_weight_base(p_wbase), .p_bias_base(p_bbase), .p_quant_base(p_qbase),
        
        .win_00(win_00), .win_01(win_01), .win_02(win_02),
        .win_10(win_10), .win_11(win_11), .win_12(win_12),
        .win_20(win_20), .win_21(win_21), .win_22(win_22),
        
        .fifo_rd_en(fifo_rd_en), .fifo_rd_data(fifo_rd_data), .fifo_empty(fifo_empty),
        .bias_addr(bias_addr), .bias_data(bias_data),
        .quant_addr(quant_addr), .quant_multiplier(quant_multiplier), .quant_shift(quant_shift),
        .output_we(fm_wr_en), .output_addr(fm_wr_addr), .output_data(conv_out),
        .busy(engine_busy), .done(engine_done)
    );

    activation_dynamic u_act (.x_in(conv_out), .act_mode(p_act), .y_out(fm_wr_data));

    // ==========================================
    // FSM ĐIỀU KHIỂN LAYER
    // ==========================================
    localparam S_IDLE=0, S_RUN=1, S_DONE=2;
    reg [1:0] state;
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            state <= S_IDLE; layer_idx <= 0; engine_start <= 0; frame_done <= 0;
        end else begin
            frame_done <= 0; engine_start <= 0;
            case (state)
                S_IDLE: if (start_frame) begin layer_idx <= 0; state <= S_RUN; engine_start <= 1; end
                S_RUN: begin
                    if (engine_done) begin
                        // 88 conv (index 0..87), khong phai 140.
                        // Truoc day 8'd139 vi bang cu co 140 dong (52 placeholder).
                        if (layer_idx == 8'd87) state <= S_DONE;
                        else begin layer_idx <= layer_idx + 8'd1; engine_start <= 1; end
                    end
                end
                S_DONE: begin frame_done <= 1; state <= S_IDLE; end
            endcase
        end
    end
    assign debug_layer_idx = layer_idx;
endmodule