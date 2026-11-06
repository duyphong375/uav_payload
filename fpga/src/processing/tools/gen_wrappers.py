# -*- coding: utf-8 -*-
#!/usr/bin/env python3
import argparse, os, math
import numpy as np
import onnx
from onnx import numpy_helper

def build_layer_list(model):
    g = model.graph
    init = {i.name: i for i in g.initializer}
    shapes = {}
    for vi in g.value_info: shapes[vi.name] = [d.dim_value for d in vi.type.tensor_type.shape.dim]
    for vi in g.input: shapes[vi.name] = [d.dim_value for d in vi.type.tensor_type.shape.dim]

    layers = []
    idx = 0
    for node in g.node:
        if node.op_type == 'Conv':
            W = numpy_helper.to_array(init[node.input[1]])
            oc, icg, kh, kw = W.shape
            layers.append({'idx': idx, 'name': node.name, 'type': 'conv',
                           'weight_shape': W.shape, 'in_shape': shapes.get(node.input[0]), 
                           'out_shape': shapes.get(node.output[0]),
                           'activation': 'silu', 'stride': 1, 'pad': (kh-1)//2})
            idx += 1
        elif node.op_type in ('Add', 'Concat', 'Upsample', 'Resize', 'Split', 'MaxPool'):
            layers.append({'idx': idx, 'name': node.name, 'type': node.op_type.lower()})
            idx += 1
    return layers

def allocate_offsets(layers):
    weight_off, bias_off = 0, 0
    for L in layers:
        if L['type'] != 'conv': continue
        oc, icg, kh, kw = L['weight_shape']
        L['WEIGHT_BASE'] = weight_off
        L['BIAS_BASE']   = bias_off
        L['QUANT_BASE']  = bias_off
        weight_off += oc * icg * kh * kw
        bias_off   += oc
    return weight_off, bias_off

# ============================================================
# ENGINE 32 BỘ NHÂN (PARALLEL OC - 256-bit)
# ============================================================
ENGINE_DYNAMIC = r'''`timescale 1ns/1ps
module conv_engine_dynamic (
    input wire clk, rst_n, start,
    input wire [15:0] p_in_w, p_in_h, p_in_c,
    input wire [15:0] p_out_w, p_out_h, p_out_c,
    input wire [3:0]  p_k_size, p_stride, p_pad,
    input wire [15:0] p_ic_per_group, p_oc_per_group,
    input wire [23:0] p_weight_base, p_bias_base, p_quant_base,
    
    output wire [23:0] input_addr, input wire [7:0] input_data,
    output wire fifo_rd_en, input wire [255:0] fifo_rd_data, input wire fifo_empty,
    output wire [15:0] bias_addr, input wire signed [31:0] bias_data,
    output wire [15:0] quant_addr, input wire signed [31:0] quant_multiplier,
    input wire [5:0] quant_shift,
    output reg output_we, output reg [23:0] output_addr, output reg [7:0] output_data,
    output reg busy, done
);
    localparam [3:0] ST_IDLE=0, ST_BIAS_REQ=1, ST_BIAS_WAIT=2, ST_READ_REQ=3, ST_READ_WAIT=4,
                     ST_ACCUM=5, ST_REQUANT=6, ST_ADVANCE=7;
    reg [3:0] state;
    reg [15:0] ox, oy, oc, ic;
    reg [3:0] kx, ky;
    reg [4:0] write_cnt; // 0-31

    assign fifo_rd_en = (state == ST_READ_REQ);

    wire signed [31:0] ix_calc = ($signed({1'b0, ox}) * $signed({1'b0, p_stride})) + $signed({28'd0, kx}) - $signed({28'd0, p_pad});
    wire signed [31:0] iy_calc = ($signed({1'b0, oy}) * $signed({1'b0, p_stride})) + $signed({28'd0, ky}) - $signed({28'd0, p_pad});
    wire inside_input = (ix_calc >= 0) && (ix_calc < $signed({16'd0, p_in_w})) && (iy_calc >= 0) && (iy_calc < $signed({16'd0, p_in_h}));
    
    wire [15:0] input_channel_calc = ((oc / p_oc_per_group) * p_ic_per_group) + ic;
    wire signed [63:0] in_addr_calc = (($signed({48'd0, input_channel_calc}) * $signed({48'd0, p_in_h})) + iy_calc) * $signed({48'd0, p_in_w}) + ix_calc;
    
    assign input_addr  = inside_input ? in_addr_calc[23:0] : 24'd0;
    assign bias_addr   = (p_bias_base[15:0] + oc) & 16'hFFFF;
    assign quant_addr  = (p_quant_base[15:0] + oc) & 16'hFFFF;

    wire signed [8:0] x_centered = inside_input ? $signed({1'b0, input_data}) : 9'sd0;
    wire signed [7:0] w [0:31];
    wire signed [16:0] p [0:31];
    reg signed [31:0] acc [0:31];

    genvar i;
    generate
        for (i=0; i<32; i=i+1) begin: MAC_GEN
            wire active = (oc + i < p_out_c);
            assign w[i] = active ? $signed(fifo_rd_data[i*8 +: 8]) : 8'sd0;
            assign p[i] = x_centered * w[i];
            
            always @(posedge clk or negedge rst_n) begin: ACC_BLOCK
                if (!rst_n) begin
                    acc[i] <= 0;
                end else begin
                    if (state == ST_BIAS_WAIT) 
                        acc[i] <= active ? bias_data : 0;
                    else if (state == ST_ACCUM) 
                        acc[i] <= acc[i] + p[i];
                end
            end
        end
    endgenerate

    function [7:0] requantize;
        input signed [31:0] acc_value; input signed [31:0] multiplier_value; input [5:0] shift_value;
        reg signed [63:0] p, q;
        begin
            p = $signed(acc_value) * $signed(multiplier_value);
            q = (p >= 0) ? (p + (64'sd1 <<< (shift_value-1))) >>> shift_value : -(((-p) + (64'sd1 <<< (shift_value-1))) >>> shift_value);
            if (q > 127) requantize = 8'h7f; else if (q < -128) requantize = 8'h80; else requantize = q[7:0];
        end
    endfunction

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            state <= ST_IDLE; ox<=0; oy<=0; oc<=0; ic<=0; kx<=0; ky<=0; write_cnt<=0;
            output_we<=0; output_addr<=0; output_data<=0; busy<=0; done<=0;
        end else begin
            output_we <= 0; done <= 0;
            case (state)
                ST_IDLE: if (start && !busy) begin
                    ox<=0; oy<=0; oc<=0; ic<=0; kx<=0; ky<=0; busy<=1; state<=ST_BIAS_REQ;
                end
                ST_BIAS_REQ: state <= ST_BIAS_WAIT;
                ST_BIAS_WAIT: begin ic<=0; kx<=0; ky<=0; state<=ST_READ_REQ; end
                ST_READ_REQ: state <= ST_READ_WAIT;
                ST_READ_WAIT: if (!fifo_empty) state <= ST_ACCUM;
                ST_ACCUM: begin
                    if ((ic == p_ic_per_group-1) && (ky == p_k_size-1) && (kx == p_k_size-1)) begin
                        state <= ST_REQUANT; write_cnt <= 0;
                    end else begin
                        if (kx < p_k_size-1) kx <= kx + 4'd1;
                        else begin
                            kx <= 0;
                            if (ky < p_k_size-1) ky <= ky + 4'd1;
                            else begin ky <= 0; ic <= ic + 16'd1; end
                        end
                        state <= ST_READ_REQ;
                    end
                end
                ST_REQUANT: begin
                    output_data <= requantize(acc[write_cnt], quant_multiplier, quant_shift);
                    output_addr <= ((oc + write_cnt) * p_out_h + oy) * p_out_w + ox;
                    output_we <= 1'b1;
                    if (write_cnt == 31 || (oc + write_cnt + 1 == p_out_c)) state <= ST_ADVANCE;
                    else begin write_cnt <= write_cnt + 5'd1; state <= ST_REQUANT; end
                end
                ST_ADVANCE: begin
                    if (ox < p_out_w-1) begin ox<=ox+16'd1; state<=ST_BIAS_REQ; end
                    else begin
                        ox<=0;
                        if (oy < p_out_h-1) begin oy<=oy+16'd1; state<=ST_BIAS_REQ; end
                        else begin
                            oy<=0;
                            if (oc + 32 < p_out_c) begin oc<=oc+16'd32; state<=ST_BIAS_REQ; end
                            else begin busy<=0; done<=1; state<=ST_IDLE; end
                        end
                    end
                end
                default: state <= ST_IDLE;
            endcase
        end
    end
endmodule
'''

ACT_DYNAMIC = r'''`timescale 1ns/1ps
module activation_dynamic (
    input wire [7:0] x_in, input wire [1:0] act_mode, output reg [7:0] y_out
);
    reg [7:0] silu_lut [0:255];
    initial begin $readmemh("silu_lut.hex", silu_lut); end
    always @(*) begin
        case (act_mode)
            2'd0: y_out = (x_in[7]) ? 8'h00 : x_in;
            2'd1: y_out = silu_lut[x_in];
            default: y_out = x_in;
        endcase
    end
endmodule
'''

def emit_top_seq(layers, out_dir):
    cfg_lines = []
    for L in layers:
        if L['type'] == 'conv':
            in_shape, out_shape = L['in_shape'], L['out_shape']
            iw, ih, ic = in_shape[3], in_shape[2], in_shape[1]
            ow, oh, oc = out_shape[3], out_shape[2], out_shape[1]
            kh = L['weight_shape'][2]
            groups = L.get('groups', 1)
            icg, ocg = ic // groups, oc // groups
            act = {'silu':1, 'relu':0, 'none':2}[L['activation']]
            cfg_lines.append("            8'd" + str(L['idx']) + ": begin\n" +
                             f"                p_in_w={iw}; p_in_h={ih}; p_in_c={ic};\n" +
                             f"                p_out_w={ow}; p_out_h={oh}; p_out_c={oc};\n" +
                             f"                p_k_size={kh}; p_stride={L['stride']}; p_pad={L['pad']};\n" +
                             f"                p_icg={icg}; p_ocg={ocg};\n" +
                             f"                p_wbase={L['WEIGHT_BASE']}; p_bbase={L['BIAS_BASE']}; p_qbase={L['QUANT_BASE']};\n" +
                             f"                p_act={act};\n" +
                             "            end")
        else:
            cfg_lines.append("            8'd" + str(L['idx']) + ": begin\n" +
                             "                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;\n" +
                             "                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1;\n" +
                             "                p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;\n" +
                             "            end")
    last_layer_idx = len(layers) - 1
    cfg_join = '\n'.join(cfg_lines)

    body = """`timescale 1ns/1ps
module kvc_yolo_top (
    input wire clk, rst_n, start_frame,
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

    always @(*) begin
        case(layer_idx)
""" + cfg_join + """
            default: begin
                p_in_w=1; p_in_h=1; p_in_c=1; p_out_w=1; p_out_h=1; p_out_c=1;
                p_k_size=1; p_stride=1; p_pad=0; p_icg=1; p_ocg=1; p_wbase=0; p_bbase=0; p_qbase=0; p_act=2;
            end
        endcase
    end

    reg engine_start;
    wire engine_busy, engine_done;
    wire [7:0] conv_out;
    
    conv_engine_dynamic u_eng (
        .clk(clk), .rst_n(rst_n), .start(engine_start),
        .p_in_w(p_in_w), .p_in_h(p_in_h), .p_in_c(p_in_c),
        .p_out_w(p_out_w), .p_out_h(p_out_h), .p_out_c(p_out_c),
        .p_k_size(p_k_size), .p_stride(p_stride), .p_pad(p_pad),
        .p_ic_per_group(p_icg), .p_oc_per_group(p_ocg),
        .p_weight_base(p_wbase), .p_bias_base(p_bbase), .p_quant_base(p_qbase),
        .input_addr(fm_rd_addr), .input_data(fm_rd_data),
        .fifo_rd_en(fifo_rd_en), .fifo_rd_data(fifo_rd_data), .fifo_empty(fifo_empty),
        .bias_addr(bias_addr), .bias_data(bias_data),
        .quant_addr(quant_addr), .quant_multiplier(quant_multiplier), .quant_shift(quant_shift),
        .output_we(fm_wr_en), .output_addr(fm_wr_addr), .output_data(conv_out),
        .busy(engine_busy), .done(engine_done)
    );

    activation_dynamic u_act (.x_in(conv_out), .act_mode(p_act), .y_out(fm_wr_data));

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
                        if (layer_idx == 8'd""" + str(last_layer_idx) + """) state <= S_DONE;
                        else begin layer_idx <= layer_idx + 8'd1; engine_start <= 1; end
                    end
                end
                S_DONE: begin frame_done <= 1; state <= S_IDLE; end
            endcase
        end
    end
    assign debug_layer_idx = layer_idx;
endmodule
"""
    with open(os.path.join(out_dir, 'kvc_yolo_top.v'), 'w', encoding='utf-8') as f:
        f.write(body)

def gen_silu_lut(out_dir):
    lines = []
    for i in range(256):
        x = i - 128
        silu = x * (1 / (1 + math.exp(-x / 16.0)))
        val = int(min(255, max(0, silu + 128)))
        lines.append(f'{val:02x}')
    with open(os.path.join(out_dir, 'silu_lut.hex'), 'w') as f: f.write('\n'.join(lines))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('onnx'); ap.add_argument('--out', default='rtl/gen'); ap.add_argument('--build', default='gen')
    ap.add_argument('--regenerate-engine-template', action='store_true',
                    help='Overwrite conv_engine_dynamic.v from the legacy template (not recommended; template/interface is stale).')
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True); os.makedirs(args.build, exist_ok=True)
    
    model = onnx.load(args.onnx)
    model = onnx.shape_inference.infer_shapes(model)
    layers = build_layer_list(model)
    allocate_offsets(layers)
    
    if args.regenerate_engine_template:
        with open(os.path.join(args.out, 'conv_engine_dynamic.v'), 'w', encoding='utf-8') as f: f.write(ENGINE_DYNAMIC)
        print('WARNING: legacy conv_engine_dynamic template written; verify ports before synthesis.')
    else:
        print('Keeping existing conv_engine_dynamic.v (legacy template overwrite disabled).')
    with open(os.path.join(args.out, 'activation_dynamic.v'), 'w', encoding='utf-8') as f: f.write(ACT_DYNAMIC)
    emit_top_seq(layers, args.out)
    gen_silu_lut(args.build)
    
    init = {i.name: i for i in model.graph.initializer}
    w_bytes = bytearray(); b_arr = []
    for L in layers:
        if L['type'] != 'conv': continue
        for n in model.graph.node:
            if n.name == L['name']:
                W = numpy_helper.to_array(init[n.input[1]]).astype(np.int8)
                B = numpy_helper.to_array(init[n.input[2]]).astype(np.int32) if len(n.input)>2 else np.zeros(W.shape[0], np.int32)
                # Transpose (OC, IC, KH, KW) -> (IC, KH, KW, OC)
                W_transposed = np.transpose(W, (1, 2, 3, 0))
                w_bytes.extend(W_transposed.flatten().tobytes())
                b_arr.extend(B.tolist()); break
    with open(os.path.join(args.build, 'weights.hex'), 'w') as f: f.write('\n'.join(f'{b:02x}' for b in w_bytes))
    with open(os.path.join(args.build, 'bias.hex'), 'w') as f: f.write('\n'.join(f'{b & 0xFFFFFFFF:08x}' for b in b_arr))
    print(f'Done. Đã sinh code 32 bộ nhân (256-bit, AHB QSPI).')

if __name__ == '__main__':
    main()