
module tb_conv1_requant_full_tb;

    reg signed [31:0] acc_in;
    reg [4:0] channel_idx;
    wire [7:0] y_out;

    reg signed [31:0] acc_mem [0:819199];
    reg [7:0] gold_mem [0:819199];

    integer i;
    integer errors;
    integer fd_acc, fd_gold;
    integer rc_acc, rc_gold;

    reg signed [31:0] acc_value;
    reg [7:0] gold_value;

    conv1_requant dut (
        .acc_in(acc_in),
        .channel_idx(channel_idx),
        .y_out(y_out)
    );

    initial begin
        acc_in = 0;
        channel_idx = 0;
        errors = 0;

        $readmemh("verification/data/conv1/conv1_acc_reference_ort_input.hex", acc_mem);
        $readmemh("verification/data/conv1/output_q_ort_input_golden.hex", gold_mem);

        for (i = 0; i < 819200; i = i + 1) begin
            acc_value = acc_mem[i];
            gold_value = gold_mem[i];

            // Channel-major output layout: [1,32,160,160]
            channel_idx = (i / 25600) % 32;
            acc_in = acc_value;

            #1;

            if (y_out !== gold_value) begin
                errors = errors + 1;
                if (errors <= 20)
                    $display("Mismatch i=%0d c=%0d acc=%0d RTL=%0d GOLD=%0d",
                             i, channel_idx, acc_value, y_out, gold_value);
            end
        end

        $display("Tested: %0d", i);
        $display("Errors: %0d", errors);

        if (errors == 0)
            $display("PASS: Full requantization matches golden.");
        else
            $display("FAIL: Requantization mismatch.");

        $finish;
    end

endmodule
