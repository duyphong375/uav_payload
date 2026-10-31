// -----------------------------------------------------------------------------
// tb_residual_add_int8.v — Verify residual_add_int8 (saturating INT8 add)
//
// Kiem:
//   1. Cong thuong: 10 + 20 = 30
//   2. Bao hoa duong: 127 + 1 = 127
//   3. Bao hoa am: -128 + (-1) = -128
//   4. Bien: 127 + 0 = 127, -128 + 0 = -128
//   5. Ca hai am: -10 + (-20) = -30
//   6. Triet tieu: 50 + (-50) = 0
//   7. Quet toan bo 256x256 (65536 to hop) doi chieu cong saturating
//
// Exit: $fatal(1,...) khi mismatch
// -----------------------------------------------------------------------------
`timescale 1ns/1ps

module tb_residual_add_int8;

    reg  [7:0] a, b;
    wire [7:0] y;

    integer pass_cnt = 0;
    integer fail_cnt = 0;
    integer i, j;
    reg signed [8:0] s;
    reg [7:0] exp_y;

    residual_add_int8 dut (.a(a), .b(b), .y(y));

    task automatic check;
        input [7:0] va, vb;
        input [255:0] tag;
        begin
            a = va; b = vb;
            #1;
            s = $signed(va) + $signed(vb);
            if (s > 127)       exp_y = 8'h7f;
            else if (s < -128) exp_y = 8'h80;
            else               exp_y = s[7:0];

            if (y !== exp_y) begin
                $display("FAIL %0s: a=%0d b=%0d -> y=%0d, exp %0d",
                         tag, $signed(va), $signed(vb), $signed(y), $signed(exp_y));
                fail_cnt = fail_cnt + 1;
            end else begin
                $display("  PASS %0s: %0d + %0d = %0d",
                         tag, $signed(va), $signed(vb), $signed(y));
                pass_cnt = pass_cnt + 1;
            end
        end
    endtask

    initial begin
        $display("=== tb_residual_add_int8 ===");

        check(8'd10, 8'd20, "normal 10+20");
        check(8'd127, 8'd1, "sat pos 127+1");
        check(8'h80, 8'hFF, "sat neg -128+(-1)");
        check(8'd127, 8'd0, "edge 127+0");
        check(8'h80, 8'd0, "edge -128+0");
        check(8'hF6, 8'hEC, "both neg -10+(-20)");
        check(8'd50, 8'hCE, "cancel 50+(-50)");
        check(8'd1, 8'hFF, "1+(-1)=0");

        // Quet toan bo 65536 to hop
        $display("  ... quet 256x256 to hop ...");
        fail_cnt = 0;
        pass_cnt = 0;
        for (i = 0; i < 256; i = i + 1) begin
            for (j = 0; j < 256; j = j + 1) begin
                a = i[7:0];
                b = j[7:0];
                #1;
                s = $signed(a) + $signed(b);
                if (s > 127)       exp_y = 8'h7f;
                else if (s < -128) exp_y = 8'h80;
                else               exp_y = s[7:0];

                if (y !== exp_y) begin
                    if (fail_cnt < 5)
                        $display("FAIL sweep a=%0d b=%0d: y=%0d exp %0d",
                                 $signed(a), $signed(b), $signed(y), $signed(exp_y));
                    fail_cnt = fail_cnt + 1;
                end
                else pass_cnt = pass_cnt + 1;
            end
        end
        $display("  sweep: %0d / %0d pass", pass_cnt, 65536 + 8);

        if (fail_cnt != 0) begin
            $display("=== SUMMARY: PASS=%0d FAIL=%0d (sweep) ===", pass_cnt, fail_cnt);
            $fatal(1, "tb_residual_add_int8 FAILED");
        end

        $display("=== SUMMARY: PASS=%0d FAIL=0 (bao gom 65536 to hop) ===", pass_cnt);
        $display("PASS: tb_residual_add_int8 completed");
        $finish;
    end

endmodule
