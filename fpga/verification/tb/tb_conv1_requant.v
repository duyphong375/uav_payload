
module tb_conv1_requant;

    reg signed [31:0] acc_in;
    reg [4:0] channel_idx;
    wire [7:0] y_out;

    conv1_requant dut (
        .acc_in(acc_in),
        .channel_idx(channel_idx),
        .y_out(y_out)
    );

    initial begin
        acc_in = 32'sd13627;
        channel_idx = 5'd12;
        #1;
        $display("C12: y=%0d, expected=130", y_out);

        acc_in = 32'sd21684;
        channel_idx = 5'd15;
        #1;
        $display("C15: y=%0d, expected=145", y_out);

        $finish;
    end

endmodule
