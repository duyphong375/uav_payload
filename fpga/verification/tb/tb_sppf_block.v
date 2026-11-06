// -----------------------------------------------------------------------------
// tb_sppf_block.v — Verify sppf_block (SPPF: 3 max-pool + concat 4 nhanh)
//
// SPPF tinh: p1 = maxpool(x), p2 = maxpool(p1), p3 = maxpool(p2)
// Output = concat[x, p1, p2, p3] theo truc kenh (NCHW).
//
// Golden tinh doc lap bang Python-style trong TB.
//
// Cau hinh nho de chay nhanh: W=4, H=4, C=1, K=3, S=1, P=1.
// Output: 4 kenh x 4x4 = 64 byte.
//
// Exit: $fatal(1,...) khi mismatch
// -----------------------------------------------------------------------------
`timescale 1ns/1ps

module tb_sppf_block;

    localparam integer W = 4;
    localparam integer H = 4;
    localparam integer C = 1;
    localparam integer KSIZE = 3;
    localparam integer ADDR_W = 16;
    localparam real    CLK_T = 10.0;

    reg clk = 1'b0;
    reg rst_n = 1'b0;
    reg start = 1'b0;

    // ── Ports ──
    wire [ADDR_W-1:0] input_raddr;
    reg  [7:0]        input_rdata;

    wire [ADDR_W-1:0] s1_raddr;
    reg  [7:0]        s1_rdata;
    wire s1_we; wire [ADDR_W-1:0] s1_waddr; wire [7:0] s1_wdata;

    wire [ADDR_W-1:0] s2_raddr;
    reg  [7:0]        s2_rdata;
    wire s2_we; wire [ADDR_W-1:0] s2_waddr; wire [7:0] s2_wdata;

    wire [ADDR_W-1:0] s3_raddr;
    reg  [7:0]        s3_rdata;
    wire s3_we; wire [ADDR_W-1:0] s3_waddr; wire [7:0] s3_wdata;

    wire output_we;
    wire [ADDR_W-1:0] output_addr;
    wire [7:0] output_data;
    wire busy, done;

    sppf_block #(.W(W), .H(H), .C(C), .K_SIZE(KSIZE), .STRIDE(1), .PAD(1), .ADDR_W(ADDR_W)) dut (
        .clk(clk), .rst_n(rst_n), .start(start),
        .input_raddr(input_raddr), .input_rdata(input_rdata),
        .s1_raddr(s1_raddr), .s1_rdata(s1_rdata), .s1_we(s1_we), .s1_waddr(s1_waddr), .s1_wdata(s1_wdata),
        .s2_raddr(s2_raddr), .s2_rdata(s2_rdata), .s2_we(s2_we), .s2_waddr(s2_waddr), .s2_wdata(s2_wdata),
        .s3_raddr(s3_raddr), .s3_rdata(s3_rdata), .s3_we(s3_we), .s3_waddr(s3_waddr), .s3_wdata(s3_wdata),
        .output_we(output_we), .output_addr(output_addr), .output_data(output_data),
        .busy(busy), .done(done)
    );

    always #(CLK_T/2) clk = ~clk;

    // ── Memory ──
    reg [7:0] in_mem [0:63];      // W*H*C
    reg [7:0] s1_mem [0:63];
    reg [7:0] s2_mem [0:63];
    reg [7:0] s3_mem [0:63];
    reg [7:0] out_mem[0:255];     // 4*C*W*H

    // RAM dong bo: dang ky addr, tra ve chu ky sau
    always @(posedge clk) begin
        input_rdata <= in_mem[input_raddr[5:0]];
        s1_rdata    <= s1_mem[s1_raddr[5:0]];
        s2_rdata    <= s2_mem[s2_raddr[5:0]];
        s3_rdata    <= s3_mem[s3_raddr[5:0]];
    end

    // Ghi scratch
    always @(posedge clk) begin
        if (s1_we) s1_mem[s1_waddr[5:0]] <= s1_wdata;
        if (s2_we) s2_mem[s2_waddr[5:0]] <= s2_wdata;
        if (s3_we) s3_mem[s3_waddr[5:0]] <= s3_wdata;
        if (output_we) out_mem[output_addr[7:0]] <= output_data;
    end

    integer pass_cnt = 0;
    integer fail_cnt = 0;

    // scratch: mang tam de tinh p1/p2/p3 (phai khai bao TRUOC function dung no)
    reg [7:0] scratch [0:63];

    // Golden maxpool 1 kenh
    function automatic [7:0] ref_pool;
        input integer ox, oy, base;
        integer kx, ky, ix, iy;
        reg signed [7:0] best, v;
        begin
            best = -8'sd128;
            for (ky = 0; ky < KSIZE; ky = ky + 1) begin
                for (kx = 0; kx < KSIZE; kx = kx + 1) begin
                    ix = ox + kx - 1;
                    iy = oy + ky - 1;
                    if (ix >= 0 && ix < W && iy >= 0 && iy < H) begin
                        v = $signed(scratch[base + iy*W + ix]);
                        if (v > best) best = v;
                    end
                end
            end
            ref_pool = best;
        end
    endfunction

    integer c, x, y, mism, total, guard;
    reg [7:0] exp_v, got_v;
    reg [7:0] p1 [0:63];
    reg [7:0] p2 [0:63];
    reg [7:0] p3 [0:63];

    initial begin
        $display("=== tb_sppf_block (W=%0d H=%0d C=%0d K=%0d P=1) ===", W, H, C, KSIZE);

        // nap input
        for (c = 0; c < W*H*C; c = c + 1)
            in_mem[c] = (c*29 + 17);

        // xoa scratch + output
        for (c = 0; c < 64; c = c + 1) begin
            s1_mem[c] = 8'h00;
            s2_mem[c] = 8'h00;
            s3_mem[c] = 8'h00;
            scratch[c] = 8'h00;
        end
        for (c = 0; c < 256; c = c + 1) out_mem[c] = 8'hAA;

        // --- Golden: tinh p1, p2, p3 ---
        for (c = 0; c < W*H; c = c + 1) scratch[c] = in_mem[c];
        for (y = 0; y < H; y = y + 1)
            for (x = 0; x < W; x = x + 1)
                p1[y*W+x] = ref_pool(x, y, 0);

        for (c = 0; c < W*H; c = c + 1) scratch[c] = p1[c];
        for (y = 0; y < H; y = y + 1)
            for (x = 0; x < W; x = x + 1)
                p2[y*W+x] = ref_pool(x, y, 0);

        for (c = 0; c < W*H; c = c + 1) scratch[c] = p2[c];
        for (y = 0; y < H; y = y + 1)
            for (x = 0; x < W; x = x + 1)
                p3[y*W+x] = ref_pool(x, y, 0);

        $display("  golden p1[0:4] = %0d %0d %0d %0d",
                 $signed(p1[0]), $signed(p1[1]), $signed(p1[2]), $signed(p1[3]));

        // --- Chay DUT ---
        repeat (10) @(posedge clk);
        rst_n = 1'b1;
        repeat (5) @(posedge clk);

        @(posedge clk);
        start <= 1'b1;
        @(posedge clk);
        start <= 1'b0;

        guard = 0;
        while (guard < 200000) begin
            @(posedge clk);
            if (done) guard = 200000;
            else guard = guard + 1;
        end
        if (guard != 200000) begin
            $display("FAIL: timeout");
            $fatal(1, "tb_sppf_block timeout");
        end

        // Cho them vai chu ky de output_we cuoi cung duoc ghi vao out_mem
        // (module bat done cung chu ky voi output_we cuoi, nhung TB ghi mem
        //  o posedge nen can 1-2 chu ky nua)
        repeat (10) @(posedge clk);

        // --- So sanh ---
        // out[c,y,x] voi c = 0..3*C-1:
        //   c < C       -> in[c,y,x]
        //   C <= c < 2C -> p1
        //   2C <= c <3C -> p2
        //   3C <= c <4C -> p3
        mism = 0; total = 0;
        for (c = 0; c < 4*C; c = c + 1) begin
            for (y = 0; y < H; y = y + 1) begin
                for (x = 0; x < W; x = x + 1) begin
                    if (c < C)          exp_v = in_mem[(c)*W*H + y*W + x];
                    else if (c < 2*C)   exp_v = p1[y*W + x];
                    else if (c < 3*C)   exp_v = p2[y*W + x];
                    else                exp_v = p3[y*W + x];

                    got_v = out_mem[c*W*H + y*W + x];
                    total = total + 1;
                    if (got_v !== exp_v) begin
                        if (mism < 8)
                            $display("FAIL c=%0d y=%0d x=%0d: got %0d exp %0d",
                                     c, y, x, $signed(got_v), $signed(exp_v));
                        mism = mism + 1;
                    end
                end
            end
        end

        if (mism != 0) begin
            $display("FAIL: %0d/%0d mismatch", mism, total);
            fail_cnt = fail_cnt + 1;
        end else begin
            $display("  PASS: %0d output (4 nhanh x %0d kenh x %0dx%0d)", total, C, W, H);
            pass_cnt = pass_cnt + 1;
        end

        $display("=== SUMMARY: PASS=%0d FAIL=%0d ===", pass_cnt, fail_cnt);
        if (fail_cnt != 0) $fatal(1, "tb_sppf_block FAILED");
        $display("PASS: tb_sppf_block completed");
        $finish;
    end

    initial begin
        #(CLK_T * 10000000);
        $fatal(1, "TIMEOUT: tb_sppf_block");
    end

endmodule
