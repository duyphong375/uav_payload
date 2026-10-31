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
    reg [23:0] p_wbase, p_bbase, p_qbase;
    reg [1:0]  p_act;

    // ==========================================
    // BẢNG CẤU HÌNH 140 LAYER (Giữ nguyên từ file của bạn)
    // ==========================================
    always @(*) begin
        case(layer_idx)
            8'd0: begin
                p_in_w=640; p_in_h=640; p_in_c=3;
                p_out_w=320; p_out_h=320; p_out_c=16;
                p_k_size=3; p_stride=1; p_pad=1;
                p_icg=3; p_ocg=16;
                p_wbase=0; p_bbase=0; p_qbase=0;
                p_act=1;
            end
            8'd1: begin
                p_in_w=320; p_in_h=320; p_in_c=16;
                p_out_w=160; p_out_h=160; p_out_c=32;
                p_k_size=3; p_stride=1; p_pad=1;
                p_icg=16; p_ocg=32;
                p_wbase=432; p_bbase=16; p_qbase=16;
                p_act=1;
            end
            8'd2: begin
                p_in_w=160; p_in_h=160; p_in_c=32;
                p_out_w=160; p_out_h=160; p_out_c=32;
                p_k_size=1; p_stride=1; p_pad=0;
                p_icg=32; p_ocg=32;
                p_wbase=5040; p_bbase=48; p_qbase=48;
                p_act=1;
            end
            8'd3: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;
                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
            8'd4: begin
                p_in_w=160; p_in_h=160; p_in_c=16;
                p_out_w=160; p_out_h=160; p_out_c=8;
                p_k_size=3; p_stride=1; p_pad=1;
                p_icg=16; p_ocg=8;
                p_wbase=6064; p_bbase=80; p_qbase=80;
                p_act=1;
            end
            8'd5: begin
                p_in_w=160; p_in_h=160; p_in_c=8;
                p_out_w=160; p_out_h=160; p_out_c=16;
                p_k_size=3; p_stride=1; p_pad=1;
                p_icg=8; p_ocg=16;
                p_wbase=7216; p_bbase=88; p_qbase=88;
                p_act=1;
            end
            8'd6: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;
                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
            8'd7: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;
                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
            8'd8: begin
                p_in_w=160; p_in_h=160; p_in_c=48;
                p_out_w=160; p_out_h=160; p_out_c=64;
                p_k_size=1; p_stride=1; p_pad=0;
                p_icg=48; p_ocg=64;
                p_wbase=8368; p_bbase=104; p_qbase=104;
                p_act=1;
            end
            8'd9: begin
                p_in_w=160; p_in_h=160; p_in_c=64;
                p_out_w=80; p_out_h=80; p_out_c=64;
                p_k_size=3; p_stride=1; p_pad=1;
                p_icg=64; p_ocg=64;
                p_wbase=11440; p_bbase=168; p_qbase=168;
                p_act=1;
            end
            8'd10: begin
                p_in_w=80; p_in_h=80; p_in_c=64;
                p_out_w=80; p_out_h=80; p_out_c=64;
                p_k_size=1; p_stride=1; p_pad=0;
                p_icg=64; p_ocg=64;
                p_wbase=48304; p_bbase=232; p_qbase=232;
                p_act=1;
            end
            8'd11: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;
                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
            8'd12: begin
                p_in_w=80; p_in_h=80; p_in_c=32;
                p_out_w=80; p_out_h=80; p_out_c=16;
                p_k_size=3; p_stride=1; p_pad=1;
                p_icg=32; p_ocg=16;
                p_wbase=52400; p_bbase=296; p_qbase=296;
                p_act=1;
            end
            8'd13: begin
                p_in_w=80; p_in_h=80; p_in_c=16;
                p_out_w=80; p_out_h=80; p_out_c=32;
                p_k_size=3; p_stride=1; p_pad=1;
                p_icg=16; p_ocg=32;
                p_wbase=57008; p_bbase=312; p_qbase=312;
                p_act=1;
            end
            8'd14: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;
                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
            8'd15: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;
                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
            8'd16: begin
                p_in_w=80; p_in_h=80; p_in_c=96;
                p_out_w=80; p_out_h=80; p_out_c=128;
                p_k_size=1; p_stride=1; p_pad=0;
                p_icg=96; p_ocg=128;
                p_wbase=61616; p_bbase=344; p_qbase=344;
                p_act=1;
            end
            8'd17: begin
                p_in_w=80; p_in_h=80; p_in_c=128;
                p_out_w=40; p_out_h=40; p_out_c=128;
                p_k_size=3; p_stride=1; p_pad=1;
                p_icg=128; p_ocg=128;
                p_wbase=73904; p_bbase=472; p_qbase=472;
                p_act=1;
            end
            8'd18: begin
                p_in_w=40; p_in_h=40; p_in_c=128;
                p_out_w=40; p_out_h=40; p_out_c=128;
                p_k_size=1; p_stride=1; p_pad=0;
                p_icg=128; p_ocg=128;
                p_wbase=221360; p_bbase=600; p_qbase=600;
                p_act=1;
            end
            8'd19: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;
                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
            8'd20: begin
                p_in_w=40; p_in_h=40; p_in_c=64;
                p_out_w=40; p_out_h=40; p_out_c=32;
                p_k_size=1; p_stride=1; p_pad=0;
                p_icg=64; p_ocg=32;
                p_wbase=237744; p_bbase=728; p_qbase=728;
                p_act=1;
            end
            8'd21: begin
                p_in_w=40; p_in_h=40; p_in_c=64;
                p_out_w=40; p_out_h=40; p_out_c=32;
                p_k_size=1; p_stride=1; p_pad=0;
                p_icg=64; p_ocg=32;
                p_wbase=239792; p_bbase=760; p_qbase=760;
                p_act=1;
            end
            8'd22: begin
                p_in_w=40; p_in_h=40; p_in_c=32;
                p_out_w=40; p_out_h=40; p_out_c=32;
                p_k_size=3; p_stride=1; p_pad=1;
                p_icg=32; p_ocg=32;
                p_wbase=241840; p_bbase=792; p_qbase=792;
                p_act=1;
            end
            8'd23: begin
                p_in_w=40; p_in_h=40; p_in_c=32;
                p_out_w=40; p_out_h=40; p_out_c=32;
                p_k_size=3; p_stride=1; p_pad=1;
                p_icg=32; p_ocg=32;
                p_wbase=251056; p_bbase=824; p_qbase=824;
                p_act=1;
            end
            8'd24: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;
                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
            8'd25: begin
                p_in_w=40; p_in_h=40; p_in_c=32;
                p_out_w=40; p_out_h=40; p_out_c=32;
                p_k_size=3; p_stride=1; p_pad=1;
                p_icg=32; p_ocg=32;
                p_wbase=260272; p_bbase=856; p_qbase=856;
                p_act=1;
            end
            8'd26: begin
                p_in_w=40; p_in_h=40; p_in_c=32;
                p_out_w=40; p_out_h=40; p_out_c=32;
                p_k_size=3; p_stride=1; p_pad=1;
                p_icg=32; p_ocg=32;
                p_wbase=269488; p_bbase=888; p_qbase=888;
                p_act=1;
            end
            8'd27: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;
                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
            8'd28: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;
                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
            8'd29: begin
                p_in_w=40; p_in_h=40; p_in_c=64;
                p_out_w=40; p_out_h=40; p_out_c=64;
                p_k_size=1; p_stride=1; p_pad=0;
                p_icg=64; p_ocg=64;
                p_wbase=278704; p_bbase=920; p_qbase=920;
                p_act=1;
            end
            8'd30: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;
                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
            8'd31: begin
                p_in_w=40; p_in_h=40; p_in_c=192;
                p_out_w=40; p_out_h=40; p_out_c=128;
                p_k_size=1; p_stride=1; p_pad=0;
                p_icg=192; p_ocg=128;
                p_wbase=282800; p_bbase=984; p_qbase=984;
                p_act=1;
            end
            8'd32: begin
                p_in_w=40; p_in_h=40; p_in_c=128;
                p_out_w=20; p_out_h=20; p_out_c=256;
                p_k_size=3; p_stride=1; p_pad=1;
                p_icg=128; p_ocg=256;
                p_wbase=307376; p_bbase=1112; p_qbase=1112;
                p_act=1;
            end
            8'd33: begin
                p_in_w=20; p_in_h=20; p_in_c=256;
                p_out_w=20; p_out_h=20; p_out_c=256;
                p_k_size=1; p_stride=1; p_pad=0;
                p_icg=256; p_ocg=256;
                p_wbase=602288; p_bbase=1368; p_qbase=1368;
                p_act=1;
            end
            8'd34: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;
                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
            8'd35: begin
                p_in_w=20; p_in_h=20; p_in_c=128;
                p_out_w=20; p_out_h=20; p_out_c=64;
                p_k_size=1; p_stride=1; p_pad=0;
                p_icg=128; p_ocg=64;
                p_wbase=667824; p_bbase=1624; p_qbase=1624;
                p_act=1;
            end
            8'd36: begin
                p_in_w=20; p_in_h=20; p_in_c=128;
                p_out_w=20; p_out_h=20; p_out_c=64;
                p_k_size=1; p_stride=1; p_pad=0;
                p_icg=128; p_ocg=64;
                p_wbase=676016; p_bbase=1688; p_qbase=1688;
                p_act=1;
            end
            8'd37: begin
                p_in_w=20; p_in_h=20; p_in_c=64;
                p_out_w=20; p_out_h=20; p_out_c=64;
                p_k_size=3; p_stride=1; p_pad=1;
                p_icg=64; p_ocg=64;
                p_wbase=684208; p_bbase=1752; p_qbase=1752;
                p_act=1;
            end
            8'd38: begin
                p_in_w=20; p_in_h=20; p_in_c=64;
                p_out_w=20; p_out_h=20; p_out_c=64;
                p_k_size=3; p_stride=1; p_pad=1;
                p_icg=64; p_ocg=64;
                p_wbase=721072; p_bbase=1816; p_qbase=1816;
                p_act=1;
            end
            8'd39: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;
                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
            8'd40: begin
                p_in_w=20; p_in_h=20; p_in_c=64;
                p_out_w=20; p_out_h=20; p_out_c=64;
                p_k_size=3; p_stride=1; p_pad=1;
                p_icg=64; p_ocg=64;
                p_wbase=757936; p_bbase=1880; p_qbase=1880;
                p_act=1;
            end
            8'd41: begin
                p_in_w=20; p_in_h=20; p_in_c=64;
                p_out_w=20; p_out_h=20; p_out_c=64;
                p_k_size=3; p_stride=1; p_pad=1;
                p_icg=64; p_ocg=64;
                p_wbase=794800; p_bbase=1944; p_qbase=1944;
                p_act=1;
            end
            8'd42: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;
                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
            8'd43: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;
                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
            8'd44: begin
                p_in_w=20; p_in_h=20; p_in_c=128;
                p_out_w=20; p_out_h=20; p_out_c=128;
                p_k_size=1; p_stride=1; p_pad=0;
                p_icg=128; p_ocg=128;
                p_wbase=831664; p_bbase=2008; p_qbase=2008;
                p_act=1;
            end
            8'd45: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;
                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
            8'd46: begin
                p_in_w=20; p_in_h=20; p_in_c=384;
                p_out_w=20; p_out_h=20; p_out_c=256;
                p_k_size=1; p_stride=1; p_pad=0;
                p_icg=384; p_ocg=256;
                p_wbase=848048; p_bbase=2136; p_qbase=2136;
                p_act=1;
            end
            8'd47: begin
                p_in_w=20; p_in_h=20; p_in_c=256;
                p_out_w=20; p_out_h=20; p_out_c=128;
                p_k_size=1; p_stride=1; p_pad=0;
                p_icg=256; p_ocg=128;
                p_wbase=946352; p_bbase=2392; p_qbase=2392;
                p_act=1;
            end
            8'd48: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;
                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
            8'd49: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;
                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
            8'd50: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;
                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
            8'd51: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;
                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
            8'd52: begin
                p_in_w=20; p_in_h=20; p_in_c=512;
                p_out_w=20; p_out_h=20; p_out_c=256;
                p_k_size=1; p_stride=1; p_pad=0;
                p_icg=512; p_ocg=256;
                p_wbase=979120; p_bbase=2520; p_qbase=2520;
                p_act=1;
            end
            8'd53: begin
                p_in_w=20; p_in_h=20; p_in_c=256;
                p_out_w=20; p_out_h=20; p_out_c=256;
                p_k_size=1; p_stride=1; p_pad=0;
                p_icg=256; p_ocg=256;
                p_wbase=1110192; p_bbase=2776; p_qbase=2776;
                p_act=1;
            end
            8'd54: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;
                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
            8'd55: begin
                p_in_w=20; p_in_h=20; p_in_c=128;
                p_out_w=20; p_out_h=20; p_out_c=256;
                p_k_size=1; p_stride=1; p_pad=0;
                p_icg=128; p_ocg=256;
                p_wbase=1175728; p_bbase=3032; p_qbase=3032;
                p_act=1;
            end
            8'd56: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;
                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
            8'd57: begin
                p_in_w=20; p_in_h=20; p_in_c=128;
                p_out_w=20; p_out_h=20; p_out_c=128;
                p_k_size=3; p_stride=1; p_pad=1;
                p_icg=128; p_ocg=128;
                p_wbase=1208496; p_bbase=3288; p_qbase=3288;
                p_act=1;
            end
            8'd58: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;
                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
            8'd59: begin
                p_in_w=20; p_in_h=20; p_in_c=128;
                p_out_w=20; p_out_h=20; p_out_c=128;
                p_k_size=1; p_stride=1; p_pad=0;
                p_icg=128; p_ocg=128;
                p_wbase=1209648; p_bbase=3416; p_qbase=3416;
                p_act=1;
            end
            8'd60: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;
                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
            8'd61: begin
                p_in_w=20; p_in_h=20; p_in_c=128;
                p_out_w=20; p_out_h=20; p_out_c=256;
                p_k_size=1; p_stride=1; p_pad=0;
                p_icg=128; p_ocg=256;
                p_wbase=1226032; p_bbase=3544; p_qbase=3544;
                p_act=1;
            end
            8'd62: begin
                p_in_w=20; p_in_h=20; p_in_c=256;
                p_out_w=20; p_out_h=20; p_out_c=128;
                p_k_size=1; p_stride=1; p_pad=0;
                p_icg=256; p_ocg=128;
                p_wbase=1258800; p_bbase=3800; p_qbase=3800;
                p_act=1;
            end
            8'd63: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;
                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
            8'd64: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;
                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
            8'd65: begin
                p_in_w=20; p_in_h=20; p_in_c=256;
                p_out_w=20; p_out_h=20; p_out_c=256;
                p_k_size=1; p_stride=1; p_pad=0;
                p_icg=256; p_ocg=256;
                p_wbase=1291568; p_bbase=3928; p_qbase=3928;
                p_act=1;
            end
            8'd66: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;
                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
            8'd67: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;
                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
            8'd68: begin
                p_in_w=40; p_in_h=40; p_in_c=384;
                p_out_w=40; p_out_h=40; p_out_c=128;
                p_k_size=1; p_stride=1; p_pad=0;
                p_icg=384; p_ocg=128;
                p_wbase=1357104; p_bbase=4184; p_qbase=4184;
                p_act=1;
            end
            8'd69: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;
                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
            8'd70: begin
                p_in_w=40; p_in_h=40; p_in_c=64;
                p_out_w=40; p_out_h=40; p_out_c=32;
                p_k_size=3; p_stride=1; p_pad=1;
                p_icg=64; p_ocg=32;
                p_wbase=1406256; p_bbase=4312; p_qbase=4312;
                p_act=1;
            end
            8'd71: begin
                p_in_w=40; p_in_h=40; p_in_c=32;
                p_out_w=40; p_out_h=40; p_out_c=64;
                p_k_size=3; p_stride=1; p_pad=1;
                p_icg=32; p_ocg=64;
                p_wbase=1424688; p_bbase=4344; p_qbase=4344;
                p_act=1;
            end
            8'd72: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;
                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
            8'd73: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;
                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
            8'd74: begin
                p_in_w=40; p_in_h=40; p_in_c=192;
                p_out_w=40; p_out_h=40; p_out_c=128;
                p_k_size=1; p_stride=1; p_pad=0;
                p_icg=192; p_ocg=128;
                p_wbase=1443120; p_bbase=4408; p_qbase=4408;
                p_act=1;
            end
            8'd75: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;
                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
            8'd76: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;
                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
            8'd77: begin
                p_in_w=80; p_in_h=80; p_in_c=256;
                p_out_w=80; p_out_h=80; p_out_c=64;
                p_k_size=1; p_stride=1; p_pad=0;
                p_icg=256; p_ocg=64;
                p_wbase=1467696; p_bbase=4536; p_qbase=4536;
                p_act=1;
            end
            8'd78: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;
                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
            8'd79: begin
                p_in_w=80; p_in_h=80; p_in_c=32;
                p_out_w=80; p_out_h=80; p_out_c=16;
                p_k_size=3; p_stride=1; p_pad=1;
                p_icg=32; p_ocg=16;
                p_wbase=1484080; p_bbase=4600; p_qbase=4600;
                p_act=1;
            end
            8'd80: begin
                p_in_w=80; p_in_h=80; p_in_c=16;
                p_out_w=80; p_out_h=80; p_out_c=32;
                p_k_size=3; p_stride=1; p_pad=1;
                p_icg=16; p_ocg=32;
                p_wbase=1488688; p_bbase=4616; p_qbase=4616;
                p_act=1;
            end
            8'd81: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;
                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
            8'd82: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;
                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
            8'd83: begin
                p_in_w=80; p_in_h=80; p_in_c=96;
                p_out_w=80; p_out_h=80; p_out_c=64;
                p_k_size=1; p_stride=1; p_pad=0;
                p_icg=96; p_ocg=64;
                p_wbase=1493296; p_bbase=4648; p_qbase=4648;
                p_act=1;
            end
            8'd84: begin
                p_in_w=80; p_in_h=80; p_in_c=64;
                p_out_w=40; p_out_h=40; p_out_c=64;
                p_k_size=3; p_stride=1; p_pad=1;
                p_icg=64; p_ocg=64;
                p_wbase=1499440; p_bbase=4712; p_qbase=4712;
                p_act=1;
            end
            8'd85: begin
                p_in_w=80; p_in_h=80; p_in_c=64;
                p_out_w=80; p_out_h=80; p_out_c=64;
                p_k_size=3; p_stride=1; p_pad=1;
                p_icg=64; p_ocg=64;
                p_wbase=1536304; p_bbase=4776; p_qbase=4776;
                p_act=1;
            end
            8'd86: begin
                p_in_w=80; p_in_h=80; p_in_c=64;
                p_out_w=80; p_out_h=80; p_out_c=64;
                p_k_size=3; p_stride=1; p_pad=1;
                p_icg=64; p_ocg=64;
                p_wbase=1573168; p_bbase=4840; p_qbase=4840;
                p_act=1;
            end
            8'd87: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;
                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
            8'd88: begin
                p_in_w=80; p_in_h=80; p_in_c=64;
                p_out_w=80; p_out_h=80; p_out_c=64;
                p_k_size=3; p_stride=1; p_pad=1;
                p_icg=64; p_ocg=64;
                p_wbase=1573744; p_bbase=4904; p_qbase=4904;
                p_act=1;
            end
            8'd89: begin
                p_in_w=80; p_in_h=80; p_in_c=64;
                p_out_w=80; p_out_h=80; p_out_c=64;
                p_k_size=1; p_stride=1; p_pad=0;
                p_icg=64; p_ocg=64;
                p_wbase=1610608; p_bbase=4968; p_qbase=4968;
                p_act=1;
            end
            8'd90: begin
                p_in_w=40; p_in_h=40; p_in_c=192;
                p_out_w=40; p_out_h=40; p_out_c=128;
                p_k_size=1; p_stride=1; p_pad=0;
                p_icg=192; p_ocg=128;
                p_wbase=1614704; p_bbase=5032; p_qbase=5032;
                p_act=1;
            end
            8'd91: begin
                p_in_w=80; p_in_h=80; p_in_c=64;
                p_out_w=80; p_out_h=80; p_out_c=64;
                p_k_size=1; p_stride=1; p_pad=0;
                p_icg=64; p_ocg=64;
                p_wbase=1639280; p_bbase=5160; p_qbase=5160;
                p_act=1;
            end
            8'd92: begin
                p_in_w=80; p_in_h=80; p_in_c=64;
                p_out_w=80; p_out_h=80; p_out_c=64;
                p_k_size=3; p_stride=1; p_pad=1;
                p_icg=64; p_ocg=64;
                p_wbase=1643376; p_bbase=5224; p_qbase=5224;
                p_act=1;
            end
            8'd93: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;
                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
            8'd94: begin
                p_in_w=40; p_in_h=40; p_in_c=64;
                p_out_w=40; p_out_h=40; p_out_c=32;
                p_k_size=3; p_stride=1; p_pad=1;
                p_icg=64; p_ocg=32;
                p_wbase=1643952; p_bbase=5288; p_qbase=5288;
                p_act=1;
            end
            8'd95: begin
                p_in_w=80; p_in_h=80; p_in_c=64;
                p_out_w=80; p_out_h=80; p_out_c=64;
                p_k_size=1; p_stride=1; p_pad=0;
                p_icg=64; p_ocg=64;
                p_wbase=1662384; p_bbase=5320; p_qbase=5320;
                p_act=1;
            end
            8'd96: begin
                p_in_w=40; p_in_h=40; p_in_c=32;
                p_out_w=40; p_out_h=40; p_out_c=64;
                p_k_size=3; p_stride=1; p_pad=1;
                p_icg=32; p_ocg=64;
                p_wbase=1666480; p_bbase=5384; p_qbase=5384;
                p_act=1;
            end
            8'd97: begin
                p_in_w=80; p_in_h=80; p_in_c=64;
                p_out_w=80; p_out_h=80; p_out_c=2;
                p_k_size=1; p_stride=1; p_pad=0;
                p_icg=64; p_ocg=2;
                p_wbase=1684912; p_bbase=5448; p_qbase=5448;
                p_act=1;
            end
            8'd98: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;
                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
            8'd99: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;
                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
            8'd100: begin
                p_in_w=40; p_in_h=40; p_in_c=192;
                p_out_w=40; p_out_h=40; p_out_c=128;
                p_k_size=1; p_stride=1; p_pad=0;
                p_icg=192; p_ocg=128;
                p_wbase=1685040; p_bbase=5450; p_qbase=5450;
                p_act=1;
            end
            8'd101: begin
                p_in_w=40; p_in_h=40; p_in_c=128;
                p_out_w=20; p_out_h=20; p_out_c=128;
                p_k_size=3; p_stride=1; p_pad=1;
                p_icg=128; p_ocg=128;
                p_wbase=1709616; p_bbase=5578; p_qbase=5578;
                p_act=1;
            end
            8'd102: begin
                p_in_w=40; p_in_h=40; p_in_c=128;
                p_out_w=40; p_out_h=40; p_out_c=64;
                p_k_size=3; p_stride=1; p_pad=1;
                p_icg=128; p_ocg=64;
                p_wbase=1857072; p_bbase=5706; p_qbase=5706;
                p_act=1;
            end
            8'd103: begin
                p_in_w=40; p_in_h=40; p_in_c=128;
                p_out_w=40; p_out_h=40; p_out_c=128;
                p_k_size=3; p_stride=1; p_pad=1;
                p_icg=128; p_ocg=128;
                p_wbase=1930800; p_bbase=5770; p_qbase=5770;
                p_act=1;
            end
            8'd104: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;
                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
            8'd105: begin
                p_in_w=40; p_in_h=40; p_in_c=64;
                p_out_w=40; p_out_h=40; p_out_c=64;
                p_k_size=3; p_stride=1; p_pad=1;
                p_icg=64; p_ocg=64;
                p_wbase=1931952; p_bbase=5898; p_qbase=5898;
                p_act=1;
            end
            8'd106: begin
                p_in_w=40; p_in_h=40; p_in_c=128;
                p_out_w=40; p_out_h=40; p_out_c=64;
                p_k_size=1; p_stride=1; p_pad=0;
                p_icg=128; p_ocg=64;
                p_wbase=1968816; p_bbase=5962; p_qbase=5962;
                p_act=1;
            end
            8'd107: begin
                p_in_w=20; p_in_h=20; p_in_c=384;
                p_out_w=20; p_out_h=20; p_out_c=256;
                p_k_size=1; p_stride=1; p_pad=0;
                p_icg=384; p_ocg=256;
                p_wbase=1977008; p_bbase=6026; p_qbase=6026;
                p_act=1;
            end
            8'd108: begin
                p_in_w=40; p_in_h=40; p_in_c=64;
                p_out_w=40; p_out_h=40; p_out_c=64;
                p_k_size=1; p_stride=1; p_pad=0;
                p_icg=64; p_ocg=64;
                p_wbase=2075312; p_bbase=6282; p_qbase=6282;
                p_act=1;
            end
            8'd109: begin
                p_in_w=40; p_in_h=40; p_in_c=64;
                p_out_w=40; p_out_h=40; p_out_c=64;
                p_k_size=3; p_stride=1; p_pad=1;
                p_icg=64; p_ocg=64;
                p_wbase=2079408; p_bbase=6346; p_qbase=6346;
                p_act=1;
            end
            8'd110: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;
                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
            8'd111: begin
                p_in_w=20; p_in_h=20; p_in_c=128;
                p_out_w=20; p_out_h=20; p_out_c=64;
                p_k_size=1; p_stride=1; p_pad=0;
                p_icg=128; p_ocg=64;
                p_wbase=2079984; p_bbase=6410; p_qbase=6410;
                p_act=1;
            end
            8'd112: begin
                p_in_w=20; p_in_h=20; p_in_c=128;
                p_out_w=20; p_out_h=20; p_out_c=64;
                p_k_size=1; p_stride=1; p_pad=0;
                p_icg=128; p_ocg=64;
                p_wbase=2088176; p_bbase=6474; p_qbase=6474;
                p_act=1;
            end
            8'd113: begin
                p_in_w=40; p_in_h=40; p_in_c=64;
                p_out_w=40; p_out_h=40; p_out_c=64;
                p_k_size=1; p_stride=1; p_pad=0;
                p_icg=64; p_ocg=64;
                p_wbase=2096368; p_bbase=6538; p_qbase=6538;
                p_act=1;
            end
            8'd114: begin
                p_in_w=20; p_in_h=20; p_in_c=64;
                p_out_w=20; p_out_h=20; p_out_c=64;
                p_k_size=3; p_stride=1; p_pad=1;
                p_icg=64; p_ocg=64;
                p_wbase=2100464; p_bbase=6602; p_qbase=6602;
                p_act=1;
            end
            8'd115: begin
                p_in_w=40; p_in_h=40; p_in_c=64;
                p_out_w=40; p_out_h=40; p_out_c=2;
                p_k_size=1; p_stride=1; p_pad=0;
                p_icg=64; p_ocg=2;
                p_wbase=2137328; p_bbase=6666; p_qbase=6666;
                p_act=1;
            end
            8'd116: begin
                p_in_w=20; p_in_h=20; p_in_c=64;
                p_out_w=20; p_out_h=20; p_out_c=64;
                p_k_size=3; p_stride=1; p_pad=1;
                p_icg=64; p_ocg=64;
                p_wbase=2137456; p_bbase=6668; p_qbase=6668;
                p_act=1;
            end
            8'd117: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;
                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
            8'd118: begin
                p_in_w=20; p_in_h=20; p_in_c=64;
                p_out_w=20; p_out_h=20; p_out_c=64;
                p_k_size=3; p_stride=1; p_pad=1;
                p_icg=64; p_ocg=64;
                p_wbase=2174320; p_bbase=6732; p_qbase=6732;
                p_act=1;
            end
            8'd119: begin
                p_in_w=20; p_in_h=20; p_in_c=64;
                p_out_w=20; p_out_h=20; p_out_c=64;
                p_k_size=3; p_stride=1; p_pad=1;
                p_icg=64; p_ocg=64;
                p_wbase=2211184; p_bbase=6796; p_qbase=6796;
                p_act=1;
            end
            8'd120: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;
                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
            8'd121: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;
                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
            8'd122: begin
                p_in_w=20; p_in_h=20; p_in_c=128;
                p_out_w=20; p_out_h=20; p_out_c=128;
                p_k_size=1; p_stride=1; p_pad=0;
                p_icg=128; p_ocg=128;
                p_wbase=2248048; p_bbase=6860; p_qbase=6860;
                p_act=1;
            end
            8'd123: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;
                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
            8'd124: begin
                p_in_w=20; p_in_h=20; p_in_c=384;
                p_out_w=20; p_out_h=20; p_out_c=256;
                p_k_size=1; p_stride=1; p_pad=0;
                p_icg=384; p_ocg=256;
                p_wbase=2264432; p_bbase=6988; p_qbase=6988;
                p_act=1;
            end
            8'd125: begin
                p_in_w=20; p_in_h=20; p_in_c=256;
                p_out_w=20; p_out_h=20; p_out_c=64;
                p_k_size=3; p_stride=1; p_pad=1;
                p_icg=256; p_ocg=64;
                p_wbase=2362736; p_bbase=7244; p_qbase=7244;
                p_act=1;
            end
            8'd126: begin
                p_in_w=20; p_in_h=20; p_in_c=256;
                p_out_w=20; p_out_h=20; p_out_c=256;
                p_k_size=3; p_stride=1; p_pad=1;
                p_icg=256; p_ocg=256;
                p_wbase=2510192; p_bbase=7308; p_qbase=7308;
                p_act=1;
            end
            8'd127: begin
                p_in_w=20; p_in_h=20; p_in_c=64;
                p_out_w=20; p_out_h=20; p_out_c=64;
                p_k_size=3; p_stride=1; p_pad=1;
                p_icg=64; p_ocg=64;
                p_wbase=2512496; p_bbase=7564; p_qbase=7564;
                p_act=1;
            end
            8'd128: begin
                p_in_w=20; p_in_h=20; p_in_c=256;
                p_out_w=20; p_out_h=20; p_out_c=64;
                p_k_size=1; p_stride=1; p_pad=0;
                p_icg=256; p_ocg=64;
                p_wbase=2549360; p_bbase=7628; p_qbase=7628;
                p_act=1;
            end
            8'd129: begin
                p_in_w=20; p_in_h=20; p_in_c=64;
                p_out_w=20; p_out_h=20; p_out_c=64;
                p_k_size=1; p_stride=1; p_pad=0;
                p_icg=64; p_ocg=64;
                p_wbase=2565744; p_bbase=7692; p_qbase=7692;
                p_act=1;
            end
            8'd130: begin
                p_in_w=20; p_in_h=20; p_in_c=64;
                p_out_w=20; p_out_h=20; p_out_c=64;
                p_k_size=3; p_stride=1; p_pad=1;
                p_icg=64; p_ocg=64;
                p_wbase=2569840; p_bbase=7756; p_qbase=7756;
                p_act=1;
            end
            8'd131: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;
                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
            8'd132: begin
                p_in_w=20; p_in_h=20; p_in_c=64;
                p_out_w=20; p_out_h=20; p_out_c=64;
                p_k_size=1; p_stride=1; p_pad=0;
                p_icg=64; p_ocg=64;
                p_wbase=2570416; p_bbase=7820; p_qbase=7820;
                p_act=1;
            end
            8'd133: begin
                p_in_w=20; p_in_h=20; p_in_c=64;
                p_out_w=20; p_out_h=20; p_out_c=2;
                p_k_size=1; p_stride=1; p_pad=0;
                p_icg=64; p_ocg=2;
                p_wbase=2574512; p_bbase=7884; p_qbase=7884;
                p_act=1;
            end
            8'd134: begin
                p_in_w=8400; p_in_h=4; p_in_c=16;
                p_out_w=8400; p_out_h=4; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0;
                p_icg=16; p_ocg=1;
                p_wbase=2574640; p_bbase=7886; p_qbase=7886;
                p_act=1;
            end
            8'd135: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;
                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
            8'd136: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;
                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
            8'd137: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;
                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
            8'd138: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;
                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
            8'd139: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;
                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
            default: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1; p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
        endcase
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
                        if (layer_idx == 8'd139) state <= S_DONE;
                        else begin layer_idx <= layer_idx + 8'd1; engine_start <= 1; end
                    end
                end
                S_DONE: begin frame_done <= 1; state <= S_IDLE; end
            endcase
        end
    end
    assign debug_layer_idx = layer_idx;
endmodule