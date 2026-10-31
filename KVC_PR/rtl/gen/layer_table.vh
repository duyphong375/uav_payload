// -----------------------------------------------------------------------------
// layer_table.vh — BANG CAU HINH LOP, SINH TU conv_layer_map.csv
//
// KHONG SUA TAY. Chay lai: python tools/gen_layer_table.py
// Nguon: docs/processing/conv_layer_map.csv (88 conv tu ONNX YOLO11n)
//
// Truoc day kvc_yolo_top.v co bang 140 dong hard-code voi 52 placeholder
// va toan bo stride=1 (sai). File nay thay the bang du lieu dung.
// -----------------------------------------------------------------------------

    case (layer_idx)
        8'd0: begin  // conv_00__model_0_conv_Conv
            p_in_w  = 16'd640;
            p_in_h  = 16'd640;
            p_in_c  = 16'd3;
            p_out_w = 16'd320;
            p_out_h = 16'd320;
            p_out_c = 16'd16;
            p_k_size = 8'd3;
            p_stride = 16'd2;
            p_pad    = 16'd1;
            p_icg    = 16'd3;
            p_ocg    = 16'd16;
            p_groups = 16'd1;
            p_wbase  = 24'd0;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd1: begin  // conv_01__model_1_conv_Conv
            p_in_w  = 16'd320;
            p_in_h  = 16'd320;
            p_in_c  = 16'd16;
            p_out_w = 16'd160;
            p_out_h = 16'd160;
            p_out_c = 16'd32;
            p_k_size = 8'd3;
            p_stride = 16'd2;
            p_pad    = 16'd1;
            p_icg    = 16'd16;
            p_ocg    = 16'd32;
            p_groups = 16'd1;
            p_wbase  = 24'd432;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd2: begin  // conv_02__model_2_cv1_conv_Conv
            p_in_w  = 16'd160;
            p_in_h  = 16'd160;
            p_in_c  = 16'd32;
            p_out_w = 16'd160;
            p_out_h = 16'd160;
            p_out_c = 16'd32;
            p_k_size = 8'd1;
            p_stride = 16'd1;
            p_pad    = 16'd0;
            p_icg    = 16'd32;
            p_ocg    = 16'd32;
            p_groups = 16'd1;
            p_wbase  = 24'd5040;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd3: begin  // conv_03__model_2_m_0_cv1_conv_Conv
            p_in_w  = 16'd160;
            p_in_h  = 16'd160;
            p_in_c  = 16'd16;
            p_out_w = 16'd160;
            p_out_h = 16'd160;
            p_out_c = 16'd8;
            p_k_size = 8'd3;
            p_stride = 16'd1;
            p_pad    = 16'd1;
            p_icg    = 16'd16;
            p_ocg    = 16'd8;
            p_groups = 16'd1;
            p_wbase  = 24'd6064;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd4: begin  // conv_04__model_2_m_0_cv2_conv_Conv
            p_in_w  = 16'd160;
            p_in_h  = 16'd160;
            p_in_c  = 16'd8;
            p_out_w = 16'd160;
            p_out_h = 16'd160;
            p_out_c = 16'd16;
            p_k_size = 8'd3;
            p_stride = 16'd1;
            p_pad    = 16'd1;
            p_icg    = 16'd8;
            p_ocg    = 16'd16;
            p_groups = 16'd1;
            p_wbase  = 24'd7216;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd5: begin  // conv_05__model_2_cv2_conv_Conv
            p_in_w  = 16'd160;
            p_in_h  = 16'd160;
            p_in_c  = 16'd48;
            p_out_w = 16'd160;
            p_out_h = 16'd160;
            p_out_c = 16'd64;
            p_k_size = 8'd1;
            p_stride = 16'd1;
            p_pad    = 16'd0;
            p_icg    = 16'd48;
            p_ocg    = 16'd64;
            p_groups = 16'd1;
            p_wbase  = 24'd8368;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd6: begin  // conv_06__model_3_conv_Conv
            p_in_w  = 16'd160;
            p_in_h  = 16'd160;
            p_in_c  = 16'd64;
            p_out_w = 16'd80;
            p_out_h = 16'd80;
            p_out_c = 16'd64;
            p_k_size = 8'd3;
            p_stride = 16'd2;
            p_pad    = 16'd1;
            p_icg    = 16'd64;
            p_ocg    = 16'd64;
            p_groups = 16'd1;
            p_wbase  = 24'd11440;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd7: begin  // conv_07__model_4_cv1_conv_Conv
            p_in_w  = 16'd80;
            p_in_h  = 16'd80;
            p_in_c  = 16'd64;
            p_out_w = 16'd80;
            p_out_h = 16'd80;
            p_out_c = 16'd64;
            p_k_size = 8'd1;
            p_stride = 16'd1;
            p_pad    = 16'd0;
            p_icg    = 16'd64;
            p_ocg    = 16'd64;
            p_groups = 16'd1;
            p_wbase  = 24'd48304;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd8: begin  // conv_08__model_4_m_0_cv1_conv_Conv
            p_in_w  = 16'd80;
            p_in_h  = 16'd80;
            p_in_c  = 16'd32;
            p_out_w = 16'd80;
            p_out_h = 16'd80;
            p_out_c = 16'd16;
            p_k_size = 8'd3;
            p_stride = 16'd1;
            p_pad    = 16'd1;
            p_icg    = 16'd32;
            p_ocg    = 16'd16;
            p_groups = 16'd1;
            p_wbase  = 24'd52400;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd9: begin  // conv_09__model_4_m_0_cv2_conv_Conv
            p_in_w  = 16'd80;
            p_in_h  = 16'd80;
            p_in_c  = 16'd16;
            p_out_w = 16'd80;
            p_out_h = 16'd80;
            p_out_c = 16'd32;
            p_k_size = 8'd3;
            p_stride = 16'd1;
            p_pad    = 16'd1;
            p_icg    = 16'd16;
            p_ocg    = 16'd32;
            p_groups = 16'd1;
            p_wbase  = 24'd57008;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd10: begin  // conv_10__model_4_cv2_conv_Conv
            p_in_w  = 16'd80;
            p_in_h  = 16'd80;
            p_in_c  = 16'd96;
            p_out_w = 16'd80;
            p_out_h = 16'd80;
            p_out_c = 16'd128;
            p_k_size = 8'd1;
            p_stride = 16'd1;
            p_pad    = 16'd0;
            p_icg    = 16'd96;
            p_ocg    = 16'd128;
            p_groups = 16'd1;
            p_wbase  = 24'd61616;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd11: begin  // conv_11__model_5_conv_Conv
            p_in_w  = 16'd80;
            p_in_h  = 16'd80;
            p_in_c  = 16'd128;
            p_out_w = 16'd40;
            p_out_h = 16'd40;
            p_out_c = 16'd128;
            p_k_size = 8'd3;
            p_stride = 16'd2;
            p_pad    = 16'd1;
            p_icg    = 16'd128;
            p_ocg    = 16'd128;
            p_groups = 16'd1;
            p_wbase  = 24'd73904;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd12: begin  // conv_12__model_6_cv1_conv_Conv
            p_in_w  = 16'd40;
            p_in_h  = 16'd40;
            p_in_c  = 16'd128;
            p_out_w = 16'd40;
            p_out_h = 16'd40;
            p_out_c = 16'd128;
            p_k_size = 8'd1;
            p_stride = 16'd1;
            p_pad    = 16'd0;
            p_icg    = 16'd128;
            p_ocg    = 16'd128;
            p_groups = 16'd1;
            p_wbase  = 24'd221360;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd13: begin  // conv_13__model_6_m_0_cv1_conv_Conv
            p_in_w  = 16'd40;
            p_in_h  = 16'd40;
            p_in_c  = 16'd64;
            p_out_w = 16'd40;
            p_out_h = 16'd40;
            p_out_c = 16'd32;
            p_k_size = 8'd1;
            p_stride = 16'd1;
            p_pad    = 16'd0;
            p_icg    = 16'd64;
            p_ocg    = 16'd32;
            p_groups = 16'd1;
            p_wbase  = 24'd237744;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd14: begin  // conv_14__model_6_m_0_cv2_conv_Conv
            p_in_w  = 16'd40;
            p_in_h  = 16'd40;
            p_in_c  = 16'd64;
            p_out_w = 16'd40;
            p_out_h = 16'd40;
            p_out_c = 16'd32;
            p_k_size = 8'd1;
            p_stride = 16'd1;
            p_pad    = 16'd0;
            p_icg    = 16'd64;
            p_ocg    = 16'd32;
            p_groups = 16'd1;
            p_wbase  = 24'd239792;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd15: begin  // conv_15__model_6_m_0_m_m_0_cv1_conv_Conv
            p_in_w  = 16'd40;
            p_in_h  = 16'd40;
            p_in_c  = 16'd32;
            p_out_w = 16'd40;
            p_out_h = 16'd40;
            p_out_c = 16'd32;
            p_k_size = 8'd3;
            p_stride = 16'd1;
            p_pad    = 16'd1;
            p_icg    = 16'd32;
            p_ocg    = 16'd32;
            p_groups = 16'd1;
            p_wbase  = 24'd241840;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd16: begin  // conv_16__model_6_m_0_m_m_0_cv2_conv_Conv
            p_in_w  = 16'd40;
            p_in_h  = 16'd40;
            p_in_c  = 16'd32;
            p_out_w = 16'd40;
            p_out_h = 16'd40;
            p_out_c = 16'd32;
            p_k_size = 8'd3;
            p_stride = 16'd1;
            p_pad    = 16'd1;
            p_icg    = 16'd32;
            p_ocg    = 16'd32;
            p_groups = 16'd1;
            p_wbase  = 24'd251056;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd17: begin  // conv_17__model_6_m_0_m_m_1_cv1_conv_Conv
            p_in_w  = 16'd40;
            p_in_h  = 16'd40;
            p_in_c  = 16'd32;
            p_out_w = 16'd40;
            p_out_h = 16'd40;
            p_out_c = 16'd32;
            p_k_size = 8'd3;
            p_stride = 16'd1;
            p_pad    = 16'd1;
            p_icg    = 16'd32;
            p_ocg    = 16'd32;
            p_groups = 16'd1;
            p_wbase  = 24'd260272;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd18: begin  // conv_18__model_6_m_0_m_m_1_cv2_conv_Conv
            p_in_w  = 16'd40;
            p_in_h  = 16'd40;
            p_in_c  = 16'd32;
            p_out_w = 16'd40;
            p_out_h = 16'd40;
            p_out_c = 16'd32;
            p_k_size = 8'd3;
            p_stride = 16'd1;
            p_pad    = 16'd1;
            p_icg    = 16'd32;
            p_ocg    = 16'd32;
            p_groups = 16'd1;
            p_wbase  = 24'd269488;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd19: begin  // conv_19__model_6_m_0_cv3_conv_Conv
            p_in_w  = 16'd40;
            p_in_h  = 16'd40;
            p_in_c  = 16'd64;
            p_out_w = 16'd40;
            p_out_h = 16'd40;
            p_out_c = 16'd64;
            p_k_size = 8'd1;
            p_stride = 16'd1;
            p_pad    = 16'd0;
            p_icg    = 16'd64;
            p_ocg    = 16'd64;
            p_groups = 16'd1;
            p_wbase  = 24'd278704;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd20: begin  // conv_20__model_6_cv2_conv_Conv
            p_in_w  = 16'd40;
            p_in_h  = 16'd40;
            p_in_c  = 16'd192;
            p_out_w = 16'd40;
            p_out_h = 16'd40;
            p_out_c = 16'd128;
            p_k_size = 8'd1;
            p_stride = 16'd1;
            p_pad    = 16'd0;
            p_icg    = 16'd192;
            p_ocg    = 16'd128;
            p_groups = 16'd1;
            p_wbase  = 24'd282800;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd21: begin  // conv_21__model_7_conv_Conv
            p_in_w  = 16'd40;
            p_in_h  = 16'd40;
            p_in_c  = 16'd128;
            p_out_w = 16'd20;
            p_out_h = 16'd20;
            p_out_c = 16'd256;
            p_k_size = 8'd3;
            p_stride = 16'd2;
            p_pad    = 16'd1;
            p_icg    = 16'd128;
            p_ocg    = 16'd256;
            p_groups = 16'd1;
            p_wbase  = 24'd307376;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd22: begin  // conv_22__model_8_cv1_conv_Conv
            p_in_w  = 16'd20;
            p_in_h  = 16'd20;
            p_in_c  = 16'd256;
            p_out_w = 16'd20;
            p_out_h = 16'd20;
            p_out_c = 16'd256;
            p_k_size = 8'd1;
            p_stride = 16'd1;
            p_pad    = 16'd0;
            p_icg    = 16'd256;
            p_ocg    = 16'd256;
            p_groups = 16'd1;
            p_wbase  = 24'd602288;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd23: begin  // conv_23__model_8_m_0_cv1_conv_Conv
            p_in_w  = 16'd20;
            p_in_h  = 16'd20;
            p_in_c  = 16'd128;
            p_out_w = 16'd20;
            p_out_h = 16'd20;
            p_out_c = 16'd64;
            p_k_size = 8'd1;
            p_stride = 16'd1;
            p_pad    = 16'd0;
            p_icg    = 16'd128;
            p_ocg    = 16'd64;
            p_groups = 16'd1;
            p_wbase  = 24'd667824;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd24: begin  // conv_24__model_8_m_0_cv2_conv_Conv
            p_in_w  = 16'd20;
            p_in_h  = 16'd20;
            p_in_c  = 16'd128;
            p_out_w = 16'd20;
            p_out_h = 16'd20;
            p_out_c = 16'd64;
            p_k_size = 8'd1;
            p_stride = 16'd1;
            p_pad    = 16'd0;
            p_icg    = 16'd128;
            p_ocg    = 16'd64;
            p_groups = 16'd1;
            p_wbase  = 24'd676016;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd25: begin  // conv_25__model_8_m_0_m_m_0_cv1_conv_Conv
            p_in_w  = 16'd20;
            p_in_h  = 16'd20;
            p_in_c  = 16'd64;
            p_out_w = 16'd20;
            p_out_h = 16'd20;
            p_out_c = 16'd64;
            p_k_size = 8'd3;
            p_stride = 16'd1;
            p_pad    = 16'd1;
            p_icg    = 16'd64;
            p_ocg    = 16'd64;
            p_groups = 16'd1;
            p_wbase  = 24'd684208;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd26: begin  // conv_26__model_8_m_0_m_m_0_cv2_conv_Conv
            p_in_w  = 16'd20;
            p_in_h  = 16'd20;
            p_in_c  = 16'd64;
            p_out_w = 16'd20;
            p_out_h = 16'd20;
            p_out_c = 16'd64;
            p_k_size = 8'd3;
            p_stride = 16'd1;
            p_pad    = 16'd1;
            p_icg    = 16'd64;
            p_ocg    = 16'd64;
            p_groups = 16'd1;
            p_wbase  = 24'd721072;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd27: begin  // conv_27__model_8_m_0_m_m_1_cv1_conv_Conv
            p_in_w  = 16'd20;
            p_in_h  = 16'd20;
            p_in_c  = 16'd64;
            p_out_w = 16'd20;
            p_out_h = 16'd20;
            p_out_c = 16'd64;
            p_k_size = 8'd3;
            p_stride = 16'd1;
            p_pad    = 16'd1;
            p_icg    = 16'd64;
            p_ocg    = 16'd64;
            p_groups = 16'd1;
            p_wbase  = 24'd757936;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd28: begin  // conv_28__model_8_m_0_m_m_1_cv2_conv_Conv
            p_in_w  = 16'd20;
            p_in_h  = 16'd20;
            p_in_c  = 16'd64;
            p_out_w = 16'd20;
            p_out_h = 16'd20;
            p_out_c = 16'd64;
            p_k_size = 8'd3;
            p_stride = 16'd1;
            p_pad    = 16'd1;
            p_icg    = 16'd64;
            p_ocg    = 16'd64;
            p_groups = 16'd1;
            p_wbase  = 24'd794800;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd29: begin  // conv_29__model_8_m_0_cv3_conv_Conv
            p_in_w  = 16'd20;
            p_in_h  = 16'd20;
            p_in_c  = 16'd128;
            p_out_w = 16'd20;
            p_out_h = 16'd20;
            p_out_c = 16'd128;
            p_k_size = 8'd1;
            p_stride = 16'd1;
            p_pad    = 16'd0;
            p_icg    = 16'd128;
            p_ocg    = 16'd128;
            p_groups = 16'd1;
            p_wbase  = 24'd831664;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd30: begin  // conv_30__model_8_cv2_conv_Conv
            p_in_w  = 16'd20;
            p_in_h  = 16'd20;
            p_in_c  = 16'd384;
            p_out_w = 16'd20;
            p_out_h = 16'd20;
            p_out_c = 16'd256;
            p_k_size = 8'd1;
            p_stride = 16'd1;
            p_pad    = 16'd0;
            p_icg    = 16'd384;
            p_ocg    = 16'd256;
            p_groups = 16'd1;
            p_wbase  = 24'd848048;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd31: begin  // conv_31__model_9_cv1_conv_Conv
            p_in_w  = 16'd20;
            p_in_h  = 16'd20;
            p_in_c  = 16'd256;
            p_out_w = 16'd20;
            p_out_h = 16'd20;
            p_out_c = 16'd128;
            p_k_size = 8'd1;
            p_stride = 16'd1;
            p_pad    = 16'd0;
            p_icg    = 16'd256;
            p_ocg    = 16'd128;
            p_groups = 16'd1;
            p_wbase  = 24'd946352;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd32: begin  // conv_32__model_9_cv2_conv_Conv
            p_in_w  = 16'd20;
            p_in_h  = 16'd20;
            p_in_c  = 16'd512;
            p_out_w = 16'd20;
            p_out_h = 16'd20;
            p_out_c = 16'd256;
            p_k_size = 8'd1;
            p_stride = 16'd1;
            p_pad    = 16'd0;
            p_icg    = 16'd512;
            p_ocg    = 16'd256;
            p_groups = 16'd1;
            p_wbase  = 24'd979120;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd33: begin  // conv_33__model_10_cv1_conv_Conv
            p_in_w  = 16'd20;
            p_in_h  = 16'd20;
            p_in_c  = 16'd256;
            p_out_w = 16'd20;
            p_out_h = 16'd20;
            p_out_c = 16'd256;
            p_k_size = 8'd1;
            p_stride = 16'd1;
            p_pad    = 16'd0;
            p_icg    = 16'd256;
            p_ocg    = 16'd256;
            p_groups = 16'd1;
            p_wbase  = 24'd1110192;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd34: begin  // conv_34__model_10_m_m_0_attn_qkv_conv_Conv
            p_in_w  = 16'd20;
            p_in_h  = 16'd20;
            p_in_c  = 16'd128;
            p_out_w = 16'd20;
            p_out_h = 16'd20;
            p_out_c = 16'd256;
            p_k_size = 8'd1;
            p_stride = 16'd1;
            p_pad    = 16'd0;
            p_icg    = 16'd128;
            p_ocg    = 16'd256;
            p_groups = 16'd1;
            p_wbase  = 24'd1175728;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd35: begin  // conv_35__model_10_m_m_0_attn_pe_conv_Conv
            p_in_w  = 16'd20;
            p_in_h  = 16'd20;
            p_in_c  = 16'd128;
            p_out_w = 16'd20;
            p_out_h = 16'd20;
            p_out_c = 16'd128;
            p_k_size = 8'd3;
            p_stride = 16'd1;
            p_pad    = 16'd1;
            p_icg    = 16'd1;
            p_ocg    = 16'd1;
            p_groups = 16'd128;
            p_wbase  = 24'd1208496;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd36: begin  // conv_36__model_10_m_m_0_attn_proj_conv_Conv
            p_in_w  = 16'd20;
            p_in_h  = 16'd20;
            p_in_c  = 16'd128;
            p_out_w = 16'd20;
            p_out_h = 16'd20;
            p_out_c = 16'd128;
            p_k_size = 8'd1;
            p_stride = 16'd1;
            p_pad    = 16'd0;
            p_icg    = 16'd128;
            p_ocg    = 16'd128;
            p_groups = 16'd1;
            p_wbase  = 24'd1209648;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd37: begin  // conv_37__model_10_m_m_0_ffn_ffn_0_conv_Conv
            p_in_w  = 16'd20;
            p_in_h  = 16'd20;
            p_in_c  = 16'd128;
            p_out_w = 16'd20;
            p_out_h = 16'd20;
            p_out_c = 16'd256;
            p_k_size = 8'd1;
            p_stride = 16'd1;
            p_pad    = 16'd0;
            p_icg    = 16'd128;
            p_ocg    = 16'd256;
            p_groups = 16'd1;
            p_wbase  = 24'd1226032;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd38: begin  // conv_38__model_10_m_m_0_ffn_ffn_1_conv_Conv
            p_in_w  = 16'd20;
            p_in_h  = 16'd20;
            p_in_c  = 16'd256;
            p_out_w = 16'd20;
            p_out_h = 16'd20;
            p_out_c = 16'd128;
            p_k_size = 8'd1;
            p_stride = 16'd1;
            p_pad    = 16'd0;
            p_icg    = 16'd256;
            p_ocg    = 16'd128;
            p_groups = 16'd1;
            p_wbase  = 24'd1258800;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd39: begin  // conv_39__model_10_cv2_conv_Conv
            p_in_w  = 16'd20;
            p_in_h  = 16'd20;
            p_in_c  = 16'd256;
            p_out_w = 16'd20;
            p_out_h = 16'd20;
            p_out_c = 16'd256;
            p_k_size = 8'd1;
            p_stride = 16'd1;
            p_pad    = 16'd0;
            p_icg    = 16'd256;
            p_ocg    = 16'd256;
            p_groups = 16'd1;
            p_wbase  = 24'd1291568;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd40: begin  // conv_40__model_13_cv1_conv_Conv
            p_in_w  = 16'd40;
            p_in_h  = 16'd40;
            p_in_c  = 16'd384;
            p_out_w = 16'd40;
            p_out_h = 16'd40;
            p_out_c = 16'd128;
            p_k_size = 8'd1;
            p_stride = 16'd1;
            p_pad    = 16'd0;
            p_icg    = 16'd384;
            p_ocg    = 16'd128;
            p_groups = 16'd1;
            p_wbase  = 24'd1357104;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd41: begin  // conv_41__model_13_m_0_cv1_conv_Conv
            p_in_w  = 16'd40;
            p_in_h  = 16'd40;
            p_in_c  = 16'd64;
            p_out_w = 16'd40;
            p_out_h = 16'd40;
            p_out_c = 16'd32;
            p_k_size = 8'd3;
            p_stride = 16'd1;
            p_pad    = 16'd1;
            p_icg    = 16'd64;
            p_ocg    = 16'd32;
            p_groups = 16'd1;
            p_wbase  = 24'd1406256;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd42: begin  // conv_42__model_13_m_0_cv2_conv_Conv
            p_in_w  = 16'd40;
            p_in_h  = 16'd40;
            p_in_c  = 16'd32;
            p_out_w = 16'd40;
            p_out_h = 16'd40;
            p_out_c = 16'd64;
            p_k_size = 8'd3;
            p_stride = 16'd1;
            p_pad    = 16'd1;
            p_icg    = 16'd32;
            p_ocg    = 16'd64;
            p_groups = 16'd1;
            p_wbase  = 24'd1424688;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd43: begin  // conv_43__model_13_cv2_conv_Conv
            p_in_w  = 16'd40;
            p_in_h  = 16'd40;
            p_in_c  = 16'd192;
            p_out_w = 16'd40;
            p_out_h = 16'd40;
            p_out_c = 16'd128;
            p_k_size = 8'd1;
            p_stride = 16'd1;
            p_pad    = 16'd0;
            p_icg    = 16'd192;
            p_ocg    = 16'd128;
            p_groups = 16'd1;
            p_wbase  = 24'd1443120;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd44: begin  // conv_44__model_16_cv1_conv_Conv
            p_in_w  = 16'd80;
            p_in_h  = 16'd80;
            p_in_c  = 16'd256;
            p_out_w = 16'd80;
            p_out_h = 16'd80;
            p_out_c = 16'd64;
            p_k_size = 8'd1;
            p_stride = 16'd1;
            p_pad    = 16'd0;
            p_icg    = 16'd256;
            p_ocg    = 16'd64;
            p_groups = 16'd1;
            p_wbase  = 24'd1467696;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd45: begin  // conv_45__model_16_m_0_cv1_conv_Conv
            p_in_w  = 16'd80;
            p_in_h  = 16'd80;
            p_in_c  = 16'd32;
            p_out_w = 16'd80;
            p_out_h = 16'd80;
            p_out_c = 16'd16;
            p_k_size = 8'd3;
            p_stride = 16'd1;
            p_pad    = 16'd1;
            p_icg    = 16'd32;
            p_ocg    = 16'd16;
            p_groups = 16'd1;
            p_wbase  = 24'd1484080;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd46: begin  // conv_46__model_16_m_0_cv2_conv_Conv
            p_in_w  = 16'd80;
            p_in_h  = 16'd80;
            p_in_c  = 16'd16;
            p_out_w = 16'd80;
            p_out_h = 16'd80;
            p_out_c = 16'd32;
            p_k_size = 8'd3;
            p_stride = 16'd1;
            p_pad    = 16'd1;
            p_icg    = 16'd16;
            p_ocg    = 16'd32;
            p_groups = 16'd1;
            p_wbase  = 24'd1488688;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd47: begin  // conv_47__model_16_cv2_conv_Conv
            p_in_w  = 16'd80;
            p_in_h  = 16'd80;
            p_in_c  = 16'd96;
            p_out_w = 16'd80;
            p_out_h = 16'd80;
            p_out_c = 16'd64;
            p_k_size = 8'd1;
            p_stride = 16'd1;
            p_pad    = 16'd0;
            p_icg    = 16'd96;
            p_ocg    = 16'd64;
            p_groups = 16'd1;
            p_wbase  = 24'd1493296;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd48: begin  // conv_48__model_17_conv_Conv
            p_in_w  = 16'd80;
            p_in_h  = 16'd80;
            p_in_c  = 16'd64;
            p_out_w = 16'd40;
            p_out_h = 16'd40;
            p_out_c = 16'd64;
            p_k_size = 8'd3;
            p_stride = 16'd2;
            p_pad    = 16'd1;
            p_icg    = 16'd64;
            p_ocg    = 16'd64;
            p_groups = 16'd1;
            p_wbase  = 24'd1499440;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd49: begin  // conv_49__model_23_cv2_0_cv2_0_0_conv_Conv
            p_in_w  = 16'd80;
            p_in_h  = 16'd80;
            p_in_c  = 16'd64;
            p_out_w = 16'd80;
            p_out_h = 16'd80;
            p_out_c = 16'd64;
            p_k_size = 8'd3;
            p_stride = 16'd1;
            p_pad    = 16'd1;
            p_icg    = 16'd64;
            p_ocg    = 16'd64;
            p_groups = 16'd1;
            p_wbase  = 24'd1536304;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd50: begin  // conv_50__model_23_cv3_0_cv3_0_0_cv3_0_0_0_conv_Conv
            p_in_w  = 16'd80;
            p_in_h  = 16'd80;
            p_in_c  = 16'd64;
            p_out_w = 16'd80;
            p_out_h = 16'd80;
            p_out_c = 16'd64;
            p_k_size = 8'd3;
            p_stride = 16'd1;
            p_pad    = 16'd1;
            p_icg    = 16'd1;
            p_ocg    = 16'd1;
            p_groups = 16'd64;
            p_wbase  = 24'd1573168;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd51: begin  // conv_51__model_23_cv2_0_cv2_0_1_conv_Conv
            p_in_w  = 16'd80;
            p_in_h  = 16'd80;
            p_in_c  = 16'd64;
            p_out_w = 16'd80;
            p_out_h = 16'd80;
            p_out_c = 16'd64;
            p_k_size = 8'd3;
            p_stride = 16'd1;
            p_pad    = 16'd1;
            p_icg    = 16'd64;
            p_ocg    = 16'd64;
            p_groups = 16'd1;
            p_wbase  = 24'd1573744;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd52: begin  // conv_52__model_23_cv3_0_cv3_0_0_cv3_0_0_1_conv_Conv
            p_in_w  = 16'd80;
            p_in_h  = 16'd80;
            p_in_c  = 16'd64;
            p_out_w = 16'd80;
            p_out_h = 16'd80;
            p_out_c = 16'd64;
            p_k_size = 8'd1;
            p_stride = 16'd1;
            p_pad    = 16'd0;
            p_icg    = 16'd64;
            p_ocg    = 16'd64;
            p_groups = 16'd1;
            p_wbase  = 24'd1610608;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd53: begin  // conv_53__model_19_cv1_conv_Conv
            p_in_w  = 16'd40;
            p_in_h  = 16'd40;
            p_in_c  = 16'd192;
            p_out_w = 16'd40;
            p_out_h = 16'd40;
            p_out_c = 16'd128;
            p_k_size = 8'd1;
            p_stride = 16'd1;
            p_pad    = 16'd0;
            p_icg    = 16'd192;
            p_ocg    = 16'd128;
            p_groups = 16'd1;
            p_wbase  = 24'd1614704;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd54: begin  // conv_54__model_23_cv2_0_cv2_0_2_Conv
            p_in_w  = 16'd80;
            p_in_h  = 16'd80;
            p_in_c  = 16'd64;
            p_out_w = 16'd80;
            p_out_h = 16'd80;
            p_out_c = 16'd64;
            p_k_size = 8'd1;
            p_stride = 16'd1;
            p_pad    = 16'd0;
            p_icg    = 16'd64;
            p_ocg    = 16'd64;
            p_groups = 16'd1;
            p_wbase  = 24'd1639280;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd55: begin  // conv_55__model_23_cv3_0_cv3_0_1_cv3_0_1_0_conv_Conv
            p_in_w  = 16'd80;
            p_in_h  = 16'd80;
            p_in_c  = 16'd64;
            p_out_w = 16'd80;
            p_out_h = 16'd80;
            p_out_c = 16'd64;
            p_k_size = 8'd3;
            p_stride = 16'd1;
            p_pad    = 16'd1;
            p_icg    = 16'd1;
            p_ocg    = 16'd1;
            p_groups = 16'd64;
            p_wbase  = 24'd1643376;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd56: begin  // conv_56__model_19_m_0_cv1_conv_Conv
            p_in_w  = 16'd40;
            p_in_h  = 16'd40;
            p_in_c  = 16'd64;
            p_out_w = 16'd40;
            p_out_h = 16'd40;
            p_out_c = 16'd32;
            p_k_size = 8'd3;
            p_stride = 16'd1;
            p_pad    = 16'd1;
            p_icg    = 16'd64;
            p_ocg    = 16'd32;
            p_groups = 16'd1;
            p_wbase  = 24'd1643952;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd57: begin  // conv_57__model_23_cv3_0_cv3_0_1_cv3_0_1_1_conv_Conv
            p_in_w  = 16'd80;
            p_in_h  = 16'd80;
            p_in_c  = 16'd64;
            p_out_w = 16'd80;
            p_out_h = 16'd80;
            p_out_c = 16'd64;
            p_k_size = 8'd1;
            p_stride = 16'd1;
            p_pad    = 16'd0;
            p_icg    = 16'd64;
            p_ocg    = 16'd64;
            p_groups = 16'd1;
            p_wbase  = 24'd1662384;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd58: begin  // conv_58__model_19_m_0_cv2_conv_Conv
            p_in_w  = 16'd40;
            p_in_h  = 16'd40;
            p_in_c  = 16'd32;
            p_out_w = 16'd40;
            p_out_h = 16'd40;
            p_out_c = 16'd64;
            p_k_size = 8'd3;
            p_stride = 16'd1;
            p_pad    = 16'd1;
            p_icg    = 16'd32;
            p_ocg    = 16'd64;
            p_groups = 16'd1;
            p_wbase  = 24'd1666480;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd59: begin  // conv_59__model_23_cv3_0_cv3_0_2_Conv
            p_in_w  = 16'd80;
            p_in_h  = 16'd80;
            p_in_c  = 16'd64;
            p_out_w = 16'd80;
            p_out_h = 16'd80;
            p_out_c = 16'd2;
            p_k_size = 8'd1;
            p_stride = 16'd1;
            p_pad    = 16'd0;
            p_icg    = 16'd64;
            p_ocg    = 16'd2;
            p_groups = 16'd1;
            p_wbase  = 24'd1684912;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd60: begin  // conv_60__model_19_cv2_conv_Conv
            p_in_w  = 16'd40;
            p_in_h  = 16'd40;
            p_in_c  = 16'd192;
            p_out_w = 16'd40;
            p_out_h = 16'd40;
            p_out_c = 16'd128;
            p_k_size = 8'd1;
            p_stride = 16'd1;
            p_pad    = 16'd0;
            p_icg    = 16'd192;
            p_ocg    = 16'd128;
            p_groups = 16'd1;
            p_wbase  = 24'd1685040;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd61: begin  // conv_61__model_20_conv_Conv
            p_in_w  = 16'd40;
            p_in_h  = 16'd40;
            p_in_c  = 16'd128;
            p_out_w = 16'd20;
            p_out_h = 16'd20;
            p_out_c = 16'd128;
            p_k_size = 8'd3;
            p_stride = 16'd2;
            p_pad    = 16'd1;
            p_icg    = 16'd128;
            p_ocg    = 16'd128;
            p_groups = 16'd1;
            p_wbase  = 24'd1709616;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd62: begin  // conv_62__model_23_cv2_1_cv2_1_0_conv_Conv
            p_in_w  = 16'd40;
            p_in_h  = 16'd40;
            p_in_c  = 16'd128;
            p_out_w = 16'd40;
            p_out_h = 16'd40;
            p_out_c = 16'd64;
            p_k_size = 8'd3;
            p_stride = 16'd1;
            p_pad    = 16'd1;
            p_icg    = 16'd128;
            p_ocg    = 16'd64;
            p_groups = 16'd1;
            p_wbase  = 24'd1857072;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd63: begin  // conv_63__model_23_cv3_1_cv3_1_0_cv3_1_0_0_conv_Conv
            p_in_w  = 16'd40;
            p_in_h  = 16'd40;
            p_in_c  = 16'd128;
            p_out_w = 16'd40;
            p_out_h = 16'd40;
            p_out_c = 16'd128;
            p_k_size = 8'd3;
            p_stride = 16'd1;
            p_pad    = 16'd1;
            p_icg    = 16'd1;
            p_ocg    = 16'd1;
            p_groups = 16'd128;
            p_wbase  = 24'd1930800;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd64: begin  // conv_64__model_23_cv2_1_cv2_1_1_conv_Conv
            p_in_w  = 16'd40;
            p_in_h  = 16'd40;
            p_in_c  = 16'd64;
            p_out_w = 16'd40;
            p_out_h = 16'd40;
            p_out_c = 16'd64;
            p_k_size = 8'd3;
            p_stride = 16'd1;
            p_pad    = 16'd1;
            p_icg    = 16'd64;
            p_ocg    = 16'd64;
            p_groups = 16'd1;
            p_wbase  = 24'd1931952;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd65: begin  // conv_65__model_23_cv3_1_cv3_1_0_cv3_1_0_1_conv_Conv
            p_in_w  = 16'd40;
            p_in_h  = 16'd40;
            p_in_c  = 16'd128;
            p_out_w = 16'd40;
            p_out_h = 16'd40;
            p_out_c = 16'd64;
            p_k_size = 8'd1;
            p_stride = 16'd1;
            p_pad    = 16'd0;
            p_icg    = 16'd128;
            p_ocg    = 16'd64;
            p_groups = 16'd1;
            p_wbase  = 24'd1968816;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd66: begin  // conv_66__model_22_cv1_conv_Conv
            p_in_w  = 16'd20;
            p_in_h  = 16'd20;
            p_in_c  = 16'd384;
            p_out_w = 16'd20;
            p_out_h = 16'd20;
            p_out_c = 16'd256;
            p_k_size = 8'd1;
            p_stride = 16'd1;
            p_pad    = 16'd0;
            p_icg    = 16'd384;
            p_ocg    = 16'd256;
            p_groups = 16'd1;
            p_wbase  = 24'd1977008;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd67: begin  // conv_67__model_23_cv2_1_cv2_1_2_Conv
            p_in_w  = 16'd40;
            p_in_h  = 16'd40;
            p_in_c  = 16'd64;
            p_out_w = 16'd40;
            p_out_h = 16'd40;
            p_out_c = 16'd64;
            p_k_size = 8'd1;
            p_stride = 16'd1;
            p_pad    = 16'd0;
            p_icg    = 16'd64;
            p_ocg    = 16'd64;
            p_groups = 16'd1;
            p_wbase  = 24'd2075312;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd68: begin  // conv_68__model_23_cv3_1_cv3_1_1_cv3_1_1_0_conv_Conv
            p_in_w  = 16'd40;
            p_in_h  = 16'd40;
            p_in_c  = 16'd64;
            p_out_w = 16'd40;
            p_out_h = 16'd40;
            p_out_c = 16'd64;
            p_k_size = 8'd3;
            p_stride = 16'd1;
            p_pad    = 16'd1;
            p_icg    = 16'd1;
            p_ocg    = 16'd1;
            p_groups = 16'd64;
            p_wbase  = 24'd2079408;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd69: begin  // conv_69__model_22_m_0_cv1_conv_Conv
            p_in_w  = 16'd20;
            p_in_h  = 16'd20;
            p_in_c  = 16'd128;
            p_out_w = 16'd20;
            p_out_h = 16'd20;
            p_out_c = 16'd64;
            p_k_size = 8'd1;
            p_stride = 16'd1;
            p_pad    = 16'd0;
            p_icg    = 16'd128;
            p_ocg    = 16'd64;
            p_groups = 16'd1;
            p_wbase  = 24'd2079984;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd70: begin  // conv_70__model_22_m_0_cv2_conv_Conv
            p_in_w  = 16'd20;
            p_in_h  = 16'd20;
            p_in_c  = 16'd128;
            p_out_w = 16'd20;
            p_out_h = 16'd20;
            p_out_c = 16'd64;
            p_k_size = 8'd1;
            p_stride = 16'd1;
            p_pad    = 16'd0;
            p_icg    = 16'd128;
            p_ocg    = 16'd64;
            p_groups = 16'd1;
            p_wbase  = 24'd2088176;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd71: begin  // conv_71__model_23_cv3_1_cv3_1_1_cv3_1_1_1_conv_Conv
            p_in_w  = 16'd40;
            p_in_h  = 16'd40;
            p_in_c  = 16'd64;
            p_out_w = 16'd40;
            p_out_h = 16'd40;
            p_out_c = 16'd64;
            p_k_size = 8'd1;
            p_stride = 16'd1;
            p_pad    = 16'd0;
            p_icg    = 16'd64;
            p_ocg    = 16'd64;
            p_groups = 16'd1;
            p_wbase  = 24'd2096368;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd72: begin  // conv_72__model_22_m_0_m_m_0_cv1_conv_Conv
            p_in_w  = 16'd20;
            p_in_h  = 16'd20;
            p_in_c  = 16'd64;
            p_out_w = 16'd20;
            p_out_h = 16'd20;
            p_out_c = 16'd64;
            p_k_size = 8'd3;
            p_stride = 16'd1;
            p_pad    = 16'd1;
            p_icg    = 16'd64;
            p_ocg    = 16'd64;
            p_groups = 16'd1;
            p_wbase  = 24'd2100464;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd73: begin  // conv_73__model_23_cv3_1_cv3_1_2_Conv
            p_in_w  = 16'd40;
            p_in_h  = 16'd40;
            p_in_c  = 16'd64;
            p_out_w = 16'd40;
            p_out_h = 16'd40;
            p_out_c = 16'd2;
            p_k_size = 8'd1;
            p_stride = 16'd1;
            p_pad    = 16'd0;
            p_icg    = 16'd64;
            p_ocg    = 16'd2;
            p_groups = 16'd1;
            p_wbase  = 24'd2137328;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd74: begin  // conv_74__model_22_m_0_m_m_0_cv2_conv_Conv
            p_in_w  = 16'd20;
            p_in_h  = 16'd20;
            p_in_c  = 16'd64;
            p_out_w = 16'd20;
            p_out_h = 16'd20;
            p_out_c = 16'd64;
            p_k_size = 8'd3;
            p_stride = 16'd1;
            p_pad    = 16'd1;
            p_icg    = 16'd64;
            p_ocg    = 16'd64;
            p_groups = 16'd1;
            p_wbase  = 24'd2137456;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd75: begin  // conv_75__model_22_m_0_m_m_1_cv1_conv_Conv
            p_in_w  = 16'd20;
            p_in_h  = 16'd20;
            p_in_c  = 16'd64;
            p_out_w = 16'd20;
            p_out_h = 16'd20;
            p_out_c = 16'd64;
            p_k_size = 8'd3;
            p_stride = 16'd1;
            p_pad    = 16'd1;
            p_icg    = 16'd64;
            p_ocg    = 16'd64;
            p_groups = 16'd1;
            p_wbase  = 24'd2174320;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd76: begin  // conv_76__model_22_m_0_m_m_1_cv2_conv_Conv
            p_in_w  = 16'd20;
            p_in_h  = 16'd20;
            p_in_c  = 16'd64;
            p_out_w = 16'd20;
            p_out_h = 16'd20;
            p_out_c = 16'd64;
            p_k_size = 8'd3;
            p_stride = 16'd1;
            p_pad    = 16'd1;
            p_icg    = 16'd64;
            p_ocg    = 16'd64;
            p_groups = 16'd1;
            p_wbase  = 24'd2211184;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd77: begin  // conv_77__model_22_m_0_cv3_conv_Conv
            p_in_w  = 16'd20;
            p_in_h  = 16'd20;
            p_in_c  = 16'd128;
            p_out_w = 16'd20;
            p_out_h = 16'd20;
            p_out_c = 16'd128;
            p_k_size = 8'd1;
            p_stride = 16'd1;
            p_pad    = 16'd0;
            p_icg    = 16'd128;
            p_ocg    = 16'd128;
            p_groups = 16'd1;
            p_wbase  = 24'd2248048;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd78: begin  // conv_78__model_22_cv2_conv_Conv
            p_in_w  = 16'd20;
            p_in_h  = 16'd20;
            p_in_c  = 16'd384;
            p_out_w = 16'd20;
            p_out_h = 16'd20;
            p_out_c = 16'd256;
            p_k_size = 8'd1;
            p_stride = 16'd1;
            p_pad    = 16'd0;
            p_icg    = 16'd384;
            p_ocg    = 16'd256;
            p_groups = 16'd1;
            p_wbase  = 24'd2264432;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd79: begin  // conv_79__model_23_cv2_2_cv2_2_0_conv_Conv
            p_in_w  = 16'd20;
            p_in_h  = 16'd20;
            p_in_c  = 16'd256;
            p_out_w = 16'd20;
            p_out_h = 16'd20;
            p_out_c = 16'd64;
            p_k_size = 8'd3;
            p_stride = 16'd1;
            p_pad    = 16'd1;
            p_icg    = 16'd256;
            p_ocg    = 16'd64;
            p_groups = 16'd1;
            p_wbase  = 24'd2362736;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd80: begin  // conv_80__model_23_cv3_2_cv3_2_0_cv3_2_0_0_conv_Conv
            p_in_w  = 16'd20;
            p_in_h  = 16'd20;
            p_in_c  = 16'd256;
            p_out_w = 16'd20;
            p_out_h = 16'd20;
            p_out_c = 16'd256;
            p_k_size = 8'd3;
            p_stride = 16'd1;
            p_pad    = 16'd1;
            p_icg    = 16'd1;
            p_ocg    = 16'd1;
            p_groups = 16'd256;
            p_wbase  = 24'd2510192;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd81: begin  // conv_81__model_23_cv2_2_cv2_2_1_conv_Conv
            p_in_w  = 16'd20;
            p_in_h  = 16'd20;
            p_in_c  = 16'd64;
            p_out_w = 16'd20;
            p_out_h = 16'd20;
            p_out_c = 16'd64;
            p_k_size = 8'd3;
            p_stride = 16'd1;
            p_pad    = 16'd1;
            p_icg    = 16'd64;
            p_ocg    = 16'd64;
            p_groups = 16'd1;
            p_wbase  = 24'd2512496;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd82: begin  // conv_82__model_23_cv3_2_cv3_2_0_cv3_2_0_1_conv_Conv
            p_in_w  = 16'd20;
            p_in_h  = 16'd20;
            p_in_c  = 16'd256;
            p_out_w = 16'd20;
            p_out_h = 16'd20;
            p_out_c = 16'd64;
            p_k_size = 8'd1;
            p_stride = 16'd1;
            p_pad    = 16'd0;
            p_icg    = 16'd256;
            p_ocg    = 16'd64;
            p_groups = 16'd1;
            p_wbase  = 24'd2549360;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd83: begin  // conv_83__model_23_cv2_2_cv2_2_2_Conv
            p_in_w  = 16'd20;
            p_in_h  = 16'd20;
            p_in_c  = 16'd64;
            p_out_w = 16'd20;
            p_out_h = 16'd20;
            p_out_c = 16'd64;
            p_k_size = 8'd1;
            p_stride = 16'd1;
            p_pad    = 16'd0;
            p_icg    = 16'd64;
            p_ocg    = 16'd64;
            p_groups = 16'd1;
            p_wbase  = 24'd2565744;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd84: begin  // conv_84__model_23_cv3_2_cv3_2_1_cv3_2_1_0_conv_Conv
            p_in_w  = 16'd20;
            p_in_h  = 16'd20;
            p_in_c  = 16'd64;
            p_out_w = 16'd20;
            p_out_h = 16'd20;
            p_out_c = 16'd64;
            p_k_size = 8'd3;
            p_stride = 16'd1;
            p_pad    = 16'd1;
            p_icg    = 16'd1;
            p_ocg    = 16'd1;
            p_groups = 16'd64;
            p_wbase  = 24'd2569840;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd85: begin  // conv_85__model_23_cv3_2_cv3_2_1_cv3_2_1_1_conv_Conv
            p_in_w  = 16'd20;
            p_in_h  = 16'd20;
            p_in_c  = 16'd64;
            p_out_w = 16'd20;
            p_out_h = 16'd20;
            p_out_c = 16'd64;
            p_k_size = 8'd1;
            p_stride = 16'd1;
            p_pad    = 16'd0;
            p_icg    = 16'd64;
            p_ocg    = 16'd64;
            p_groups = 16'd1;
            p_wbase  = 24'd2570416;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd86: begin  // conv_86__model_23_cv3_2_cv3_2_2_Conv
            p_in_w  = 16'd20;
            p_in_h  = 16'd20;
            p_in_c  = 16'd64;
            p_out_w = 16'd20;
            p_out_h = 16'd20;
            p_out_c = 16'd2;
            p_k_size = 8'd1;
            p_stride = 16'd1;
            p_pad    = 16'd0;
            p_icg    = 16'd64;
            p_ocg    = 16'd2;
            p_groups = 16'd1;
            p_wbase  = 24'd2574512;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        8'd87: begin  // conv_87__model_23_dfl_conv_Conv
            p_in_w  = 16'd8400;
            p_in_h  = 16'd4;
            p_in_c  = 16'd16;
            p_out_w = 16'd8400;
            p_out_h = 16'd4;
            p_out_c = 16'd1;
            p_k_size = 8'd1;
            p_stride = 16'd1;
            p_pad    = 16'd0;
            p_icg    = 16'd16;
            p_ocg    = 16'd1;
            p_groups = 16'd1;
            p_wbase  = 24'd2574640;
            p_bbase  = 24'd0;   // TODO: cap nhat khi co bias.hex that
            p_qbase  = 24'd0;   // TODO: cap nhat khi co quant.hex that
            p_act    = 8'd0;    // TODO: activation type (SiLU cho hau het)
        end

        default: begin
            p_in_w = 16'd0; p_in_h = 16'd0; p_in_c = 16'd0;
            p_out_w = 16'd0; p_out_h = 16'd0; p_out_c = 16'd0;
            p_k_size = 8'd0; p_stride = 16'd1; p_pad = 16'd0;
            p_icg = 16'd0; p_ocg = 16'd0; p_groups = 16'd1;
            p_wbase = 24'd0; p_bbase = 24'd0; p_qbase = 24'd0;
            p_act = 8'd0;
        end
    endcase
