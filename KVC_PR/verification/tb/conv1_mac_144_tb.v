
`timescale 1ns/1ps

module conv1_mac_144_tb;

    reg clk;
    reg rst_n;
    reg start;
    reg signed [31:0] bias;
    reg term_valid;
    reg [7:0] x_u8;
    reg signed [7:0] w_s8;
    reg term_last;

    wire signed [31:0] acc;
    wire busy;
    wire done;

    integer i;
    integer x_val;
    integer w_val;
    integer expected_acc;

    conv1_mac #(
        .ACC_W(32)
    ) dut (
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

    always #5 clk = ~clk;

    initial begin
        clk = 0;
        rst_n = 0;
        start = 0;
        bias = 0;
        term_valid = 0;
        x_u8 = 0;
        w_s8 = 0;
        term_last = 0;
        expected_acc = 0;

        // 1. Reset
        repeat (2) @(posedge clk);
        @(negedge clk);
        rst_n = 1;

        // 2. Start MAC, nap bias mot lan
        bias = 1234;
        expected_acc = 1234;
        start = 1;

        @(posedge clk);
        @(negedge clk);
        start = 0;

        // 3. Cap 144 cap activation-weight
        for (i = 0; i < 144; i = i + 1) begin
            // Du lieu thu co dinh, tai lap duoc
            x_val = (i * 37 + 11) % 256;
            w_val = (i * 7 % 15) - 7;

            x_u8 = x_val;
            w_s8 = w_val;
            term_valid = 1;

            if (i == 143)
                term_last = 1;
            else
                term_last = 0;

            // Tinh ket qua tham chieu bang so nguyen
            expected_acc =
                expected_acc + (x_val - 1) * w_val;

            // Cho MAC nhan cap du lieu tai canh len
            @(posedge clk);
            @(negedge clk);
        end

        // 4. Ngat du lieu sau term cuoi
        term_valid = 0;
        term_last = 0;

        #1;

        $display("--------------------------------");
        $display("So phep nhan : 144");
        $display("Expected ACC : %0d", expected_acc);
        $display("RTL ACC      : %0d", acc);
        $display("busy         : %b", busy);
        $display("done         : %b", done);
        $display("--------------------------------");

        if ((acc === expected_acc) &&
            (busy === 1'b0) &&
            (done === 1'b1)) begin
            $display("PASS: MAC 144 terms dung");
        end else begin
            $display("FAIL: Kiem tra lai MAC");
        end

        $finish;
    end

endmodule
