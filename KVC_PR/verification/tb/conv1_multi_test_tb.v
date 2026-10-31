
`timescale 1ns/1ps

module conv1_multi_test_tb;

    reg clk = 0;
    always #5 clk = ~clk;

    reg rst_n = 0;
    reg start = 0;
    reg term_valid = 0;
    reg term_last = 0;

    reg [7:0] x_u8 = 0;
    reg signed [7:0] w_s8 = 0;
    reg signed [31:0] bias = 0;

    wire signed [31:0] acc;
    wire busy, done;

    reg [7:0] input_mem [0:1638399];
    reg [7:0] weight_mem [0:4607];
    reg signed [31:0] bias_mem [0:31];

    integer ic, ky, kx;
    integer iy, ix;
    integer input_idx, weight_idx;
    integer expected_acc;
    integer term_count;
    integer errors;
    integer test_no;

    integer test_oc [0:8];
    integer test_oy [0:8];
    integer test_ox [0:8];

    conv1_mac #(.ACC_W(32)) dut (
        .clk(clk),
        .rst_n(rst_n),
        .start(start),
        .bias(bias),
        .term_valid(term_valid),
        .x_u8(x_u8),
        .w_s8(w_s8),
        .term_last(term_last),
        .acc(acc),
        .busy(busy),
        .done(done)
    );

    task run_case;
        input integer oc;
        input integer oy;
        input integer ox;
        begin
            expected_acc = bias_mem[oc];
            term_count = 0;

            // Khoi dong MAC voi bias cua output channel
            @(negedge clk);
            bias = bias_mem[oc];
            start = 1;
            @(negedge clk);
            start = 0;

            // 16 input channels x 3 x 3 kernel = 144 terms
            for (ic = 0; ic < 16; ic = ic + 1) begin
                for (ky = 0; ky < 3; ky = ky + 1) begin
                    for (kx = 0; kx < 3; kx = kx + 1) begin

                        iy = oy * 2 + ky - 1;
                        ix = ox * 2 + kx - 1;

                        // Padding = quantized zero point 1
                        if (iy < 0 || iy >= 320 ||
                            ix < 0 || ix >= 320) begin
                            x_u8 = 8'd1;
                        end else begin
                            input_idx = ic * 320 * 320
                                      + iy * 320 + ix;
                            x_u8 = input_mem[input_idx];
                        end

                        weight_idx = ((oc * 16 + ic) * 3 + ky)
                                      * 3 + kx;
                        w_s8 = $signed(weight_mem[weight_idx]);

                        term_valid = 1;
                        if (term_count == 143)
                            term_last = 1;
                        else
                            term_last = 0;

                        expected_acc = expected_acc
                            + (($signed({1'b0, x_u8}) - 1)
                            * $signed(w_s8));

                        @(negedge clk);
                        term_count = term_count + 1;
                    end
                end
            end

            term_valid = 0;
            term_last = 0;

            // Cho cap nhat thanh ghi va kiem tra
            #1;
            $display(
                "Case %0d: oc=%0d, oy=%0d, ox=%0d, REF=%0d, RTL=%0d",
                test_no, oc, oy, ox, expected_acc, acc
            );

            if (term_count == 144 &&
                acc === expected_acc &&
                busy === 1'b0 &&
                done === 1'b1) begin
                $display("  PASS");
            end else begin
                $display("  FAIL");
                errors = errors + 1;
            end

            // Dam bao done ha xuong truoc ca tiep theo
            @(negedge clk);
        end
    endtask

    initial begin
        errors = 0;
        test_no = 0;

        $display("Loading Conv1 HEX files...");
        $readmemh("verification/data/conv1/input_q.hex", input_mem);
        $readmemh("verification/data/conv1/weight_int8.hex", weight_mem);
        $readmemh("verification/data/conv1/bias_int32.hex", bias_mem);
        $display("HEX files loaded.");

        // Reset
        repeat (3) @(negedge clk);
        rst_n = 1;

        // 9 truong hop: goc, bien, giua anh, nhieu output channel
        test_oc[0] = 0;  test_oy[0] = 0;   test_ox[0] = 0;
        test_oc[1] = 0;  test_oy[1] = 0;   test_ox[1] = 159;
        test_oc[2] = 0;  test_oy[2] = 159; test_ox[2] = 0;
        test_oc[3] = 0;  test_oy[3] = 159; test_ox[3] = 159;
        test_oc[4] = 0;  test_oy[4] = 80;  test_ox[4] = 80;
        test_oc[5] = 1;  test_oy[5] = 80;  test_ox[5] = 80;
        test_oc[6] = 7;  test_oy[6] = 40;  test_ox[6] = 60;
        test_oc[7] = 15; test_oy[7] = 100; test_ox[7] = 120;
        test_oc[8] = 31; test_oy[8] = 159; test_ox[8] = 159;

        for (test_no = 0; test_no < 9; test_no = test_no + 1) begin
            run_case(test_oc[test_no],
                     test_oy[test_no],
                     test_ox[test_no]);
        end

        $display("--------------------------------");
        $display("Tong so ca test : 9");
        $display("So ca loi       : %0d", errors);

        if (errors == 0)
            $display("PASS: All multi-point tests");
        else
            $display("FAIL: Multi-point tests");

        $finish;
    end

endmodule
