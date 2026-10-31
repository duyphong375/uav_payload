`timescale 1ns/1ps
module tb_operator_smoke;
    reg [7:0] a,b;
    wire [7:0] sum;
    residual_add_int8 dut(.a(a),.b(b),.y(sum));
    initial begin
        a=8'h7f; b=8'sd1; #1;
        if (sum !== 8'h7f) $fatal(1,"positive saturation failed");
        a=8'h80; b=8'hff; #1;
        if (sum !== 8'h80) $fatal(1,"negative saturation failed");
        a=8'sd10; b=8'sd20; #1;
        if ($signed(sum) !== 8'sd30) $fatal(1,"addition failed");
        $display("PASS: residual_add_int8 smoke test");
        $finish;
    end
endmodule
