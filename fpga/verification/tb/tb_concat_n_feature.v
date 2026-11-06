// -----------------------------------------------------------------------------
// tb_concat_n_feature.v — Verify concat_n_feature (channel-axis concat, N segment)
//
// Golden tinh doc lap: output[c,y,x] = segment[bank][local_c,y,x]
//   voi bank = c / SEG_C, local_c = c % SEG_C
//
// Kiem:
//   1. N=3, SEG_C=2, W=2, H=2  -> 6 kenh ra, thu tu segment 0..2
//   2. N=2, SEG_C=4, W=3, H=2  -> 8 kenh
//   3. N=1 (khong concat)      -> pass-through, 4 kenh
//
// LUU Y: module nay dung combinational `selected_data = segment_data >> bank*8`,
// nen TB phai lai segment_data theo segment_addr cua chinh no (mo hinh RAM
// to hop, giong BRAM doc dong bo nhung day la combinational).
//
// Exit: $fatal(1,...) khi mismatch
// -----------------------------------------------------------------------------
`timescale 1ns/1ps

module tb_concat_n_feature;

    localparam integer ADDR_W = 16;
    localparam real    CLK_T  = 10.0;

    reg clk = 1'b0;
    reg rst_n = 1'b0;

    reg start_1 = 1'b0, start_2 = 1'b0, start_3 = 1'b0;

    // ── Case 1: N=3, SEG_C=2, W=2, H=2 ──
    wire [3*ADDR_W-1:0] s1_addr;
    reg  [3*8-1:0]      s1_data;
    wire s1_we; wire [ADDR_W-1:0] s1_out_addr; wire [7:0] s1_out_data;
    wire s1_busy, s1_done;
    concat_n_feature #(.W(2), .H(2), .SEG_C(2), .N_SEGMENTS(3), .ADDR_W(ADDR_W)) dut1 (
        .clk(clk), .rst_n(rst_n), .start(start_1),
        .segment_addr(s1_addr), .segment_data(s1_data),
        .output_we(s1_we), .output_addr(s1_out_addr), .output_data(s1_out_data),
        .busy(s1_busy), .done(s1_done)
    );

    // ── Case 2: N=2, SEG_C=4, W=3, H=2 ──
    wire [2*ADDR_W-1:0] s2_addr;
    reg  [2*8-1:0]      s2_data;
    wire s2_we; wire [ADDR_W-1:0] s2_out_addr; wire [7:0] s2_out_data;
    wire s2_busy, s2_done;
    concat_n_feature #(.W(3), .H(2), .SEG_C(4), .N_SEGMENTS(2), .ADDR_W(ADDR_W)) dut2 (
        .clk(clk), .rst_n(rst_n), .start(start_2),
        .segment_addr(s2_addr), .segment_data(s2_data),
        .output_we(s2_we), .output_addr(s2_out_addr), .output_data(s2_out_data),
        .busy(s2_busy), .done(s2_done)
    );

    // ── Case 3: N=1, SEG_C=4, W=2, H=2 ──
    wire [1*ADDR_W-1:0] s3_addr;
    reg  [1*8-1:0]      s3_data;
    wire s3_we; wire [ADDR_W-1:0] s3_out_addr; wire [7:0] s3_out_data;
    wire s3_busy, s3_done;
    concat_n_feature #(.W(2), .H(2), .SEG_C(4), .N_SEGMENTS(1), .ADDR_W(ADDR_W)) dut3 (
        .clk(clk), .rst_n(rst_n), .start(start_3),
        .segment_addr(s3_addr), .segment_data(s3_data),
        .output_we(s3_we), .output_addr(s3_out_addr), .output_data(s3_out_data),
        .busy(s3_busy), .done(s3_done)
    );

    // ── Memory: 3 bank cho case 1, 2 bank cho case 2, 1 bank cho case 3 ──
    reg [7:0] seg_mem [0:63];   // moi segment toi da 64 byte

    always #(CLK_T/2) clk = ~clk;

    // ── Mo hinh RAM to hop ──
    //
    // Module concat_n_feature chi drive segment_addr cho BANK DANG XU LY
    // (bank khac = 0), va chon byte ra bang `segment_data >> bank*8`.
    // Nghia la tai moi thoi diem chi 1 bank can du lieu dung.
    //
    // TB theo doi bank hien tai bang cach dem so output_we da xay ra
    // (module quet x -> y -> c tuan tu, moi buoc 1 output).
    integer cnt1 = 0, cnt2 = 0, cnt3 = 0;

    always @(posedge clk) begin
        if (!rst_n) begin
            cnt1 <= 0; cnt2 <= 0; cnt3 <= 0;
        end else begin
            if (s1_we) cnt1 <= cnt1 + 1;
            if (s2_we) cnt2 <= cnt2 + 1;
            if (s3_we) cnt3 <= cnt3 + 1;
        end
    end

    // bank = (so lan xuat da qua) / plane / SEG_C
    function automatic integer bank_of;
        input integer cnt;
        input integer plane;
        input integer seg_c;
        integer ch;
        begin
            ch = cnt / plane;
            bank_of = ch / seg_c;
        end
    endfunction

    always @(*) begin
        integer b1, b2;
        b1 = bank_of(cnt1, 4, 2);   // case1: plane=2*2=4, SEG_C=2
        b2 = bank_of(cnt2, 6, 4);   // case2: plane=3*2=6, SEG_C=4

        s1_data[7:0]   = seg_mem[b1*64 + s1_addr[0*ADDR_W +: ADDR_W]];
        s1_data[15:8]  = seg_mem[b1*64 + s1_addr[1*ADDR_W +: ADDR_W]];
        s1_data[23:16] = seg_mem[b1*64 + s1_addr[2*ADDR_W +: ADDR_W]];

        s2_data[7:0]   = seg_mem[b2*64 + s2_addr[0*ADDR_W +: ADDR_W]];
        s2_data[15:8]  = seg_mem[b2*64 + s2_addr[1*ADDR_W +: ADDR_W]];

        s3_data[7:0]   = seg_mem[s3_addr[0*ADDR_W +: ADDR_W]];
    end

    reg [7:0] out_mem [0:127];

    always @(posedge clk) begin
        if (s1_we) out_mem[s1_out_addr] <= s1_out_data;
        if (s2_we) out_mem[s2_out_addr] <= s2_out_data;
        if (s3_we) out_mem[s3_out_addr] <= s3_out_data;
    end

    integer pass_cnt = 0;
    integer fail_cnt = 0;

    task automatic run_case;
        input integer W, H, SEG_C, N;
        input integer which;      // 1,2,3
        input integer base;       // offset seg_mem cho cac bank cua case nay
        input [255:0] tag;
        integer seg, c, x, y, mism, total, guard;
        integer plane;            // W*H
        reg [7:0] exp_v, got_v;
        integer bank, local_c, seg_off, out_off;
        begin
            plane = W*H;

            // nap du lieu: bank b, kenh c, tai (y,x) = b*64 + c*plane + y*W + x
            for (seg = 0; seg < N; seg = seg + 1)
                for (c = 0; c < SEG_C; c = c + 1)
                    for (y = 0; y < H; y = y + 1)
                        for (x = 0; x < W; x = x + 1)
                            seg_mem[seg*64 + c*plane + y*W + x] =
                                (seg*64 + c*17 + y*7 + x*3 + 1);

            // marker: OUT_C*plane phan tu
            for (c = 0; c < SEG_C*N*plane; c = c + 1)
                out_mem[c] = 8'hAA;

            // start
            @(posedge clk);
            case (which)
                1: start_1 <= 1'b1;
                2: start_2 <= 1'b1;
                3: start_3 <= 1'b1;
            endcase
            @(posedge clk);
            start_1 <= 1'b0; start_2 <= 1'b0; start_3 <= 1'b0;

            // cho done
            guard = 0;
            while (guard < 100000) begin
                @(posedge clk);
                case (which)
                    1: if (s1_done) guard = 100000;
                    2: if (s2_done) guard = 100000;
                    3: if (s3_done) guard = 100000;
                endcase
                if (guard < 100000) guard = guard + 1;
            end
            if (guard != 100000) begin
                $display("FAIL %0s: timeout", tag);
                fail_cnt = fail_cnt + 1;
                disable run_case;
            end

            // so sanh
            mism = 0; total = 0;
            for (c = 0; c < SEG_C*N; c = c + 1) begin
                bank    = c / SEG_C;
                local_c = c % SEG_C;
                seg_off = bank*64 + local_c*plane;
                out_off = c*plane;
                for (y = 0; y < H; y = y + 1) begin
                    for (x = 0; x < W; x = x + 1) begin
                        exp_v = seg_mem[seg_off + y*W + x];
                        got_v = out_mem[out_off + y*W + x];
                        total = total + 1;
                        if (got_v !== exp_v) begin
                            if (mism < 5)
                                $display("FAIL %0s c=%0d y=%0d x=%0d: got %02X exp %02X",
                                         tag, c, y, x, got_v, exp_v);
                            mism = mism + 1;
                        end
                    end
                end
            end

            if (mism != 0) begin
                $display("FAIL %0s: %0d/%0d mismatch", tag, mism, total);
                fail_cnt = fail_cnt + 1;
            end else begin
                $display("  PASS %0s: %0d output", tag, total);
                pass_cnt = pass_cnt + 1;
            end

            repeat (5) @(posedge clk);
        end
    endtask

    initial begin
        $display("=== tb_concat_n_feature ===");

        repeat (10) @(posedge clk);
        rst_n = 1'b1;
        repeat (5) @(posedge clk);

        run_case(2, 2, 2, 3, 1, 0, "1: N=3 SEG_C=2 2x2");
        run_case(3, 2, 4, 2, 2, 0, "2: N=2 SEG_C=4 3x2");
        run_case(2, 2, 4, 1, 3, 0, "3: N=1 SEG_C=4 2x2");

        $display("=== SUMMARY: PASS=%0d FAIL=%0d ===", pass_cnt, fail_cnt);
        if (fail_cnt != 0) $fatal(1, "tb_concat_n_feature FAILED");
        $display("PASS: tb_concat_n_feature completed");
        $finish;
    end

    initial begin
        #(CLK_T * 5000000);
        $fatal(1, "TIMEOUT: tb_concat_n_feature");
    end

endmodule
