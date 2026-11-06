// -----------------------------------------------------------------------------
// tb_conv0_golden.v — Verify conv_engine_dynamic_fsm voi golden doc lap
//
// Golden sinh boi tools/gen_conv0_golden.py (Python, KHONG dung RTL).
// Config: kernel=3, in_c=3, out_c=16, img=8x8, pad=1, stride=1, shift=31.
//
// Kiem tra:
//   1. So luong output = OUT_C * IMG * IMG = 1024
//   2. out_c di qua 0..15 (E-04: khong con luon 0)
//   3. out_x/out_y di qua 0..7
//   4. out_q khop golden tung pixel
//
// Exit: $fatal(1,...) khi mismatch
// -----------------------------------------------------------------------------
`timescale 1ns/1ps

module tb_conv0_golden;

    localparam integer K      = 3;
    localparam integer IN_C   = 3;
    localparam integer OUT_C  = 16;
    localparam integer IMG    = 8;
    localparam integer PAD    = 1;
    localparam integer Q_BITS = 8;

    localparam integer N_ACT  = IMG * IMG * IN_C;        // 192
    localparam integer N_W    = OUT_C * IN_C * K * K;    // 432
    localparam integer N_OUT  = OUT_C * IMG * IMG;       // 1024

    localparam real CLK_T = 10.0;

    reg clk = 1'b0;
    reg rst_n = 1'b0;
    reg start = 1'b0;

    reg  [15:0] p_stride = 16'd1;
    reg  [15:0] p_pad    = 16'd1;
    reg  [23:0] p_weight_base = 24'h000000;
    reg  [23:0] p_bias_base   = 24'd0;
    reg  [23:0] p_quant_base  = 24'd0;

    reg  win_valid = 1'b0;
    wire win_ready;
    reg  [(K*K*IN_C*Q_BITS)-1:0] win_data = {K*K*IN_C*Q_BITS{1'b0}};

    wire [15:0] bias_addr;
    reg  [31:0] bias_rdata = 32'd0;
    reg         bias_rvalid = 1'b0;
    wire        bias_req;

    wire [15:0] mult_addr;
    reg  [39:0] mult_rdata = 40'd0;
    reg         mult_rvalid = 1'b0;
    wire        mult_req;

    wire [23:0] weight_addr;
    reg  [31:0] weight_rdata = 32'd0;
    reg         weight_rvalid = 1'b0;
    wire        weight_req;

    wire        out_valid;
    wire [15:0] out_x, out_y, out_c;
    wire [7:0]  out_q;
    wire [16:0] out_addr;
    wire        busy, done;

    // --- Golden data ---
    reg [7:0]  g_act  [0:N_ACT-1];
    reg [7:0]  g_w    [0:N_W-1];
    reg [31:0] g_bias [0:OUT_C-1];
    reg [39:0] g_quant[0:OUT_C-1];
    reg [7:0]  g_exp  [0:N_OUT-1];

    integer pass_cnt = 0;
    integer fail_cnt = 0;
    integer out_idx  = 0;
    integer seen_oc_mask = 0;
    integer i;

    always #(CLK_T/2) clk = ~clk;

    conv_engine_dynamic_fsm #(
        .KERNEL(K), .IN_C(IN_C), .OUT_C(OUT_C),
        .IMG_W(IMG), .IMG_H(IMG), .Q_BITS(Q_BITS),
        .GROUPS(1)
    ) dut (
        .clk(clk), .rst_n(rst_n), .start(start),
        .p_stride(p_stride), .p_pad(p_pad),
        .p_weight_base(p_weight_base),
        .p_bias_base(p_bias_base),
        .p_quant_base(p_quant_base),
        .p_groups(16'd0),
        .win_valid(win_valid), .win_ready(win_ready), .win_data(win_data),
        .bias_addr(bias_addr), .bias_rdata(bias_rdata), .bias_rvalid(bias_rvalid), .bias_req(bias_req),
        .mult_addr(mult_addr), .mult_rdata(mult_rdata), .mult_rvalid(mult_rvalid), .mult_req(mult_req),
        .weight_addr(weight_addr), .weight_rdata(weight_rdata), .weight_rvalid(weight_rvalid), .weight_req(weight_req),
        .out_valid(out_valid), .out_x(out_x), .out_y(out_y), .out_c(out_c),
        .out_q(out_q), .out_addr(out_addr),
        .busy(busy), .done(done)
    );

    // --- Memory models (1 chu ky latency, giong bias_mem/mult_mem that) ---
    always @(posedge clk) begin
        bias_rvalid <= 1'b0;
        if (bias_req) begin
            bias_rdata  <= g_bias[bias_addr[15:0] % OUT_C];
            bias_rvalid <= 1'b1;
        end

        mult_rvalid <= 1'b0;
        if (mult_req) begin
            mult_rdata  <= g_quant[mult_addr[15:0] % OUT_C];
            mult_rvalid <= 1'b1;
        end

        weight_rvalid <= 1'b0;
        if (weight_req) begin
            // weight_addr la byte offset tu p_weight_base
            weight_rdata  <= {24'd0, g_w[weight_addr % N_W]};
            weight_rvalid <= 1'b1;
        end
    end

    // --- Nap golden ---
    task automatic load_golden;
        integer fd, rc, k;
        begin
            fd = $fopen("fpga/verification/data/conv0_golden/input_act.hex", "r");
            if (fd == 0) $fatal(1, "Khong mo duoc input_act.hex");
            for (k = 0; k < N_ACT; k = k + 1) begin
                rc = $fscanf(fd, "%h\n", g_act[k]);
                if (rc != 1) $fatal(1, "input_act.hex thieu dong %0d", k);
            end
            $fclose(fd);

            fd = $fopen("fpga/verification/data/conv0_golden/weight.hex", "r");
            if (fd == 0) $fatal(1, "Khong mo duoc weight.hex");
            for (k = 0; k < N_W; k = k + 1) begin
                rc = $fscanf(fd, "%h\n", g_w[k]);
                if (rc != 1) $fatal(1, "weight.hex thieu dong %0d", k);
            end
            $fclose(fd);

            fd = $fopen("fpga/verification/data/conv0_golden/bias.hex", "r");
            if (fd == 0) $fatal(1, "Khong mo duoc bias.hex");
            for (k = 0; k < OUT_C; k = k + 1) begin
                rc = $fscanf(fd, "%h\n", g_bias[k]);
                if (rc != 1) $fatal(1, "bias.hex thieu dong %0d", k);
            end
            $fclose(fd);

            fd = $fopen("fpga/verification/data/conv0_golden/quant.hex", "r");
            if (fd == 0) $fatal(1, "Khong mo duoc quant.hex");
            for (k = 0; k < OUT_C; k = k + 1) begin
                rc = $fscanf(fd, "%h\n", g_quant[k]);
                if (rc != 1) $fatal(1, "quant.hex thieu dong %0d", k);
            end
            $fclose(fd);

            fd = $fopen("fpga/verification/data/conv0_golden/expected.hex", "r");
            if (fd == 0) $fatal(1, "Khong mo duoc expected.hex");
            for (k = 0; k < N_OUT; k = k + 1) begin
                rc = $fscanf(fd, "%h\n", g_exp[k]);
                if (rc != 1) $fatal(1, "expected.hex thieu dong %0d", k);
            end
            $fclose(fd);
        end
    endtask

    // --- Build window cho (ox, oy) tu g_act ---
    // Engine doc win_vec[(ic*K*K)+(ky*K)+kx] tu win_data, tuc la
    // byte thu tu (ic*9+ky*3+kx) tinh tu LSB.
    // CHU Y: win_data rong K*K*IN_C*Q_BITS = 216 bit, KHONG phai 64 bit.
    function automatic [(K*K*IN_C*Q_BITS)-1:0] build_window;
        input integer ox, oy;
        integer ic, ky, kx, idx, iy, ix;
        reg [7:0] val;
        reg [(K*K*IN_C*Q_BITS)-1:0] packed_w;
        begin
            packed_w = {(K*K*IN_C*Q_BITS){1'b0}};
            for (idx = 0; idx < K*K*IN_C; idx = idx + 1) begin
                ic = idx / 9;
                ky = (idx % 9) / 3;
                kx = idx % 3;
                iy = oy * p_stride + ky - p_pad;
                ix = ox * p_stride + kx - p_pad;
                if (iy >= 0 && iy < IMG && ix >= 0 && ix < IMG)
                    val = g_act[ic*IMG*IMG + iy*IMG + ix];
                else
                    val = 8'd0;   // zero padding
                packed_w[idx*Q_BITS +: Q_BITS] = val;
            end
            build_window = packed_w;
        end
    endfunction

    // --- Feed window theo dung (ox,oy) engine yeu cau ---
    // Engine o ST_WAIT_WIN doi win_valid. TB phai:
    //   1. dat win_data cho (cur_ox, cur_oy)
    //   2. giu win_data on dinh it nhat 1 chu ky
    //   3. moi pulse win_valid
    // Neu cap win_data va win_valid cung luc, engine chot gia tri CU.
    integer cur_ox, cur_oy, cur_oc;
    reg     win_issued = 1'b0;

    always @(posedge clk) begin
        if (!rst_n) begin
            win_valid  <= 1'b0;
            win_issued <= 1'b0;
        end
        else if (dut.state == 4'd1) begin   // ST_WAIT_WIN
            if (!win_issued) begin
                // Buoc 1: nap du lieu
                win_data   <= build_window(cur_ox, cur_oy);
                win_issued <= 1'b1;
                win_valid  <= 1'b0;
            end
            else begin
                // Buoc 2: da on dinh 1 chu ky -> pulse valid
                win_valid  <= 1'b1;
                win_issued <= 1'b0;
            end
        end
        else begin
            win_valid  <= 1'b0;
            win_issued <= 1'b0;
        end
    end

    // Cap nhat (ox,oy,oc) theo trang thai engine
    always @(posedge clk) begin
        if (!rst_n) begin
            cur_ox = 0; cur_oy = 0; cur_oc = 0;
        end
        else if (out_valid) begin
            cur_ox = out_x;
            cur_oy = out_y;
            cur_oc = out_c;
            // Chuan bi cho output tiep theo
            if (out_c == OUT_C-1) begin
                if (out_x + 1 < IMG) cur_ox = out_x + 1;
                else if (out_y + 1 < IMG) begin cur_ox = 0; cur_oy = out_y + 1; end
                else begin cur_ox = 0; cur_oy = 0; end
                cur_oc = 0;
            end
            else begin
                cur_oc = out_c + 1;
            end
        end
    end

    // --- Thu va so output ---
    // Golden duoc sinh theo thu tu oc-major: index = oc*IMG*IMG + y*IMG + x.
    // Engine phat theo thu tu pixel-major: (y,x) ngoai, oc trong.
    // Phai tinh index theo golden, KHONG dung bo dem tuan tu.
    integer g_idx;
    always @(posedge clk) begin
        if (rst_n && out_valid) begin
            seen_oc_mask = seen_oc_mask | (1 << out_c);

            g_idx = out_c * IMG * IMG + out_y * IMG + out_x;

            if (out_q !== g_exp[g_idx]) begin
                if (fail_cnt < 10) begin
                    $display("FAIL oc=%0d y=%0d x=%0d (g_idx=%0d): got %0d exp %0d",
                             out_c, out_y, out_x, g_idx,
                             $signed(out_q), $signed(g_exp[g_idx]));
                end
                fail_cnt = fail_cnt + 1;
            end
            else pass_cnt = pass_cnt + 1;

            out_idx = out_idx + 1;
        end
    end

    integer timeout;
    integer win_pulse_cnt = 0;
    always @(posedge clk) if (rst_n && win_valid) win_pulse_cnt = win_pulse_cnt + 1;
    initial begin
        $display("=== tb_conv0_golden (golden doc lap tu Python) ===");

        load_golden;
        $display("  loaded: act=%0d w=%0d bias=%0d quant=%0d exp=%0d",
                 N_ACT, N_W, OUT_C, OUT_C, N_OUT);

        repeat (10) @(posedge clk);
        rst_n = 1'b1;
        repeat (5) @(posedge clk);

        @(posedge clk);
        start <= 1'b1;
        @(posedge clk);
        start <= 1'b0;

        timeout = 0;
        while (out_idx < N_OUT && timeout < 500000) begin
            @(posedge clk);
            timeout = timeout + 1;
        end

        if (out_idx != N_OUT) begin
            $display("FAIL: chi nhan %0d/%0d output (engine khong hoan tat)", out_idx, N_OUT);
            fail_cnt = fail_cnt + 1;
        end else pass_cnt = pass_cnt + 1;

        // E-04: out_c phai phu 0..15
        if (seen_oc_mask != ((1 << OUT_C) - 1)) begin
            $display("FAIL: out_c khong phu du 0..%0d (mask=%04X)", OUT_C-1, seen_oc_mask);
            fail_cnt = fail_cnt + 1;
        end else begin
            $display("  PASS out_c phu du 0..%0d", OUT_C-1);
            pass_cnt = pass_cnt + 1;
        end

        $display("=== SUMMARY: PASS=%0d FAIL=%0d win_pulse=%0d ===",
                 pass_cnt, fail_cnt, win_pulse_cnt);
        if (fail_cnt != 0) $fatal(1, "tb_conv0_golden FAILED with %0d error(s)", fail_cnt);
        $display("PASS: tb_conv0_golden completed");
        $finish;
    end

    initial begin
        #(CLK_T * 2000000);
        $fatal(1, "TIMEOUT: tb_conv0_golden (out_idx=%0d)", out_idx);
    end

endmodule
