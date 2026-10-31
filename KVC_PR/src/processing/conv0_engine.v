`timescale 1ns/1ps

// ============================================================
// CONV0 REFERENCE RTL - YOLO11n
//
// Input      : [1,3,640,640], NCHW, signed INT8
// Weight     : [16,3,3,3], OIHW, signed INT8
// Bias       : 16 x INT32
// Output     : [1,16,320,320], NCHW, signed INT8
// Kernel     : 3x3
// Stride     : 2
// Padding    : 1
//
// Dung cho simulation/golden validation truoc.
// Chua toi uu tai nguyen cho GW2A-LV18.
// ============================================================

module conv0_engine #(
    parameter IN_W  = 640,
    parameter IN_H  = 640,
    parameter IN_C  = 3,
    parameter OUT_W = 320,
    parameter OUT_H = 320,
    parameter OUT_C = 16,
    parameter K     = 3
)(
    input  wire        clk,
    input  wire        rst_n,

    input  wire        start,

    // Input stream
    input  wire        in_valid,
    input  wire [7:0]  in_data,
    output wire        in_ready,

    // Weight loading interface
    input  wire        weight_we,
    input  wire [8:0]  weight_addr,
    input  wire [7:0]  weight_data,

    // Bias loading interface
    input  wire        bias_we,
    input  wire [3:0]  bias_addr,
    input  wire [31:0] bias_data,

    // Output stream
    output wire        out_valid,
    input  wire        out_ready,

    output reg  [31:0] out_addr,
    output reg  [31:0] out_acc,
    output reg  [7:0]  out_data,

    output wire        busy,
    output reg         done
);

    localparam INPUT_SIZE  = IN_W * IN_H * IN_C;
    localparam WEIGHT_SIZE = OUT_C * IN_C * K * K;
    localparam OUTPUT_SIZE = OUT_W * OUT_H * OUT_C;
    localparam INPUT_PLANE = IN_W * IN_H;

    localparam ST_IDLE       = 3'd0;
    localparam ST_LOAD_INPUT = 3'd1;
    localparam ST_COMPUTE    = 3'd2;
    localparam ST_REQUANT    = 3'd3;
    localparam ST_OUTPUT     = 3'd4;
    localparam ST_DONE       = 3'd5;

    reg [2:0] state;

    // Full-frame storage for simulation.
    // Input tensor is flattened in NCHW order.
    reg [7:0]  input_mem  [0:INPUT_SIZE-1];

    // Weight tensor is flattened in OIHW order.
    reg [7:0]  weight_mem [0:WEIGHT_SIZE-1];

    reg [31:0] bias_mem   [0:OUT_C-1];

    reg [20:0] input_count;

    reg [3:0] oc;
    reg [8:0] oy;
    reg [8:0] ox;

    reg signed [31:0] acc_reg;

    assign in_ready  = (state == ST_LOAD_INPUT);
    assign out_valid = (state == ST_OUTPUT);

    assign busy = (state != ST_IDLE) &&
                  (state != ST_DONE);


    // ========================================================
    // MAC: 27 signed INT8 products + INT32 bias
    //
    // ONNX Conv:
    //   stride = 2
    //   padding = 1
    //
    // Input zero-point = 0, so padded value is q=0.
    // ========================================================

    function signed [31:0] calculate_accumulator;

        input [3:0] out_channel;
        input [8:0] out_y;
        input [8:0] out_x;

        integer c;
        integer ky;
        integer kx;

        integer input_y;
        integer input_x;
        integer input_index;
        integer weight_index;

        integer y_integer;
        integer x_integer;

        reg signed [7:0] x_value;
        reg signed [7:0] w_value;
        reg signed [15:0] product;
        reg signed [31:0] sum_value;

        begin
            sum_value = $signed(bias_mem[out_channel]);

            y_integer = out_y;
            x_integer = out_x;

            for (c = 0; c < IN_C; c = c + 1) begin
                for (ky = 0; ky < K; ky = ky + 1) begin
                    for (kx = 0; kx < K; kx = kx + 1) begin

                        input_y = y_integer * 2 + ky - 1;
                        input_x = x_integer * 2 + kx - 1;

                        // OIHW flattening:
                        // (((oc * IN_C + ic) * K + ky) * K + kx)
                        weight_index =
                            (((out_channel * IN_C + c) * K + ky)
                              * K + kx);

                        // Padding: use quantized zero outside image.
                        if ((input_y >= 0) &&
                            (input_y < IN_H) &&
                            (input_x >= 0) &&
                            (input_x < IN_W)) begin

                            // NCHW flattening:
                            // ic * H * W + y * W + x
                            input_index =
                                c * INPUT_PLANE +
                                input_y * IN_W +
                                input_x;

                            x_value =
                                $signed(input_mem[input_index]);
                        end
                        else begin
                            x_value = 8'sd0;
                        end

                        w_value =
                            $signed(weight_mem[weight_index]);

                        product = x_value * w_value;

                        sum_value = sum_value +
                            {{16{product[15]}}, product};

                    end
                end
            end

            calculate_accumulator = sum_value;
        end
    endfunction


    // ========================================================
    // INT32 -> INT8 requantization
    //
    // Formula:
    //   y = round_ties_to_even(
    //       accumulator * input_scale
    //                   * weight_scale[channel]
    //                   / output_scale
    //   )
    //
    // input_scale  = 0.007874006361473264
    // output_scale = 0.5913072721226009
    //
    // Dung real trong ban tham chieu de so sanh golden.
    // Phan requantize real nay khong phai datapath tong hop FPGA.
    // ========================================================



function automatic [7:0] requantize_int8;
    input signed [31:0] accumulator;
    input [3:0] channel;

    shortreal weight_scale_real;
    shortreal input_scale_real;
    shortreal output_scale_real;
    shortreal scale_product;
    shortreal acc_real;
    shortreal scaled_value;
    shortreal magnitude;
    shortreal fraction_part;

    integer whole_part;
    integer rounded_magnitude;
    integer rounded_value;

    begin
        input_scale_real  = 0.007874006361473264;
        output_scale_real = 0.5913072721226009;

        case (channel)
            4'd0:  weight_scale_real = 0.11497539281845093;
            4'd1:  weight_scale_real = 0.04850347712635994;
            4'd2:  weight_scale_real = 0.12465258687734604;
            4'd3:  weight_scale_real = 0.09448989480733871;
            4'd4:  weight_scale_real = 0.3346623182296753;
            4'd5:  weight_scale_real = 0.07541300356388092;
            4'd6:  weight_scale_real = 0.185342937707901;
            4'd7:  weight_scale_real = 0.1129731610417366;
            4'd8:  weight_scale_real = 0.10904282331466675;
            4'd9:  weight_scale_real = 0.07831160724163055;
            4'd10: weight_scale_real = 0.10021185874938965;
            4'd11: weight_scale_real = 0.11391640454530716;
            4'd12: weight_scale_real = 0.14747557044029236;
            4'd13: weight_scale_real = 0.19567395746707916;
            4'd14: weight_scale_real = 0.048722151666879654;
            4'd15: weight_scale_real = 0.08703099936294556;
            default: weight_scale_real = 0.0;
        endcase

        scale_product = input_scale_real * weight_scale_real;
        acc_real = accumulator * scale_product;
        scaled_value = acc_real / output_scale_real;

        if (scaled_value < 0.0)
            magnitude = -scaled_value;
        else
            magnitude = scaled_value;

        whole_part = $rtoi(magnitude);
        fraction_part = magnitude - whole_part;
        rounded_magnitude = whole_part;

        // Simulation tolerance near half-integer values.
        if (fraction_part > 0.5)
            rounded_magnitude = whole_part + 1;
        else if ((fraction_part >= 0.49999) &&
                 ((whole_part % 2) != 0))
            rounded_magnitude = whole_part + 1;

        if (scaled_value < 0.0)
            rounded_value = -rounded_magnitude;
        else
            rounded_value = rounded_magnitude;

        if (rounded_value > 127)
            requantize_int8 = 8'h7F;
        else if (rounded_value < -128)
            requantize_int8 = 8'h80;
        else
            requantize_int8 = rounded_value[7:0];
    end
endfunction



    // ========================================================
    // Controller
    // ========================================================

    always @(posedge clk or negedge rst_n) begin

        if (!rst_n) begin
            state       <= ST_IDLE;
            input_count <= 21'd0;

            oc <= 4'd0;
            oy <= 9'd0;
            ox <= 9'd0;

            acc_reg  <= 32'sd0;
            out_addr <= 32'd0;
            out_acc  <= 32'd0;
            out_data <= 8'd0;

            done <= 1'b0;
        end
        else begin

            done <= 1'b0;

            // Load weights and biases before start.
            if (weight_we && (weight_addr < WEIGHT_SIZE))
                weight_mem[weight_addr] <= weight_data;

            if (bias_we && (bias_addr < OUT_C))
                bias_mem[bias_addr] <= bias_data;


            case (state)

                ST_IDLE: begin
                    if (start) begin
                        input_count <= 21'd0;
                        state <= ST_LOAD_INPUT;
                    end
                end


                ST_LOAD_INPUT: begin
                    if (in_valid && in_ready) begin
                        input_mem[input_count] <= in_data;

                        if (input_count == INPUT_SIZE-1) begin
                            oc <= 4'd0;
                            oy <= 9'd0;
                            ox <= 9'd0;

                            state <= ST_COMPUTE;
                        end
                        else begin
                            input_count <= input_count + 21'd1;
                        end
                    end
                end


                ST_COMPUTE: begin
                    acc_reg <= calculate_accumulator(oc, oy, ox);
                    state <= ST_REQUANT;
                end


                ST_REQUANT: begin
                    // Output address in NCHW order.
                    out_addr <=
                        (oc * OUT_H + oy) * OUT_W + ox;

                    out_acc  <= acc_reg;
                    out_data <= requantize_int8(acc_reg, oc);

                    state <= ST_OUTPUT;
                end


                ST_OUTPUT: begin
                    // Hold outputs until downstream accepts them.
                    if (out_valid && out_ready) begin

                        if ((oc == OUT_C-1) &&
                            (oy == OUT_H-1) &&
                            (ox == OUT_W-1)) begin

                            state <= ST_DONE;
                            done <= 1'b1;
                        end
                        else begin

                            if (ox == OUT_W-1) begin
                                ox <= 9'd0;

                                if (oy == OUT_H-1) begin
                                    oy <= 9'd0;
                                    oc <= oc + 4'd1;
                                end
                                else begin
                                    oy <= oy + 9'd1;
                                end
                            end
                            else begin
                                ox <= ox + 9'd1;
                            end

                            state <= ST_COMPUTE;
                        end
                    end
                end


                ST_DONE: begin
                    // Wait for reset before running another frame.
                    state <= ST_DONE;
                end


                default: begin
                    state <= ST_IDLE;
                end

            endcase
        end
    end

endmodule