
`timescale 1ns/1ps

module conv1_full_tb;

    reg clk = 0;
    always #5 clk = ~clk;

    reg rst_n = 0;
    reg start = 0;
    reg term_valid = 0;
    reg [7:0] x_u8 = 0;
    reg signed [7:0] w_s8 = 0;
    reg signed [31:0] bias = 0;
    reg term_last = 0;

    wire signed [31:0] acc;
    wire busy, done;

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

    reg [7:0] input_mem [0:1638399];
    reg [7:0] weight_mem [0:4607];
    reg [31:0] bias_mem [0:31];
    reg [31:0] ref_mem [0:819199];

    integer oc, oy, ox, ic, ky, kx;
    integer iy, ix;
    integer input_idx, weight_idx, ref_idx;
    integer errors, tested;
    integer fd;

    initial begin
        $readmemh("verification/data/conv1/input_q_ort.hex", input_mem);
        $readmemh("verification/data/conv1/weight_int8.hex", weight_mem);
        $readmemh("verification/data/conv1/bias_int32.hex", bias_mem);
        $readmemh(
            "verification/data/conv1/conv1_acc_reference_ort_input.hex",
            ref_mem
        );

        errors = 0;
        tested = 0;

        repeat (4) @(negedge clk);
        rst_n = 1;

        for (oc = 0; oc < 32; oc = oc + 1) begin
            for (oy = 0; oy < 160; oy = oy + 1) begin
                for (ox = 0; ox < 160; ox = ox + 1) begin

                    ref_idx = (oc * 160 + oy) * 160 + ox;

                    @(negedge clk);
                    bias = bias_mem[oc];
                    start = 1;
                    @(negedge clk);
                    start = 0;

                    for (ic = 0; ic < 16; ic = ic + 1) begin
                        for (ky = 0; ky < 3; ky = ky + 1) begin
                            for (kx = 0; kx < 3; kx = kx + 1) begin

                                iy = oy * 2 + ky - 1;
                                ix = ox * 2 + kx - 1;

                                // Padding dùng zero-point 1:
                                // (x_u8 - 1) = 0 tại vùng padding.
                                if (iy < 0 || iy >= 320 ||
                                    ix < 0 || ix >= 320) begin
                                    x_u8 = 8'd1;
                                end else begin
                                    input_idx =
                                        (ic * 320 + iy) * 320 + ix;
                                    x_u8 = input_mem[input_idx];
                                end

                                weight_idx =
                                    ((oc * 16 + ic) * 3 + ky) * 3 + kx;
                                w_s8 = weight_mem[weight_idx];

                                term_valid = 1;
                                term_last =
                                    (ic == 15 && ky == 2 && kx == 2);

                                @(negedge clk);
                            end
                        end
                    end

                    term_valid = 0;
                    term_last = 0;

                    // MAC chốt term cuối tại cạnh lên trước negedge.
                    if (acc !== ref_mem[ref_idx]) begin
                        errors = errors + 1;
                        if (errors <= 20)
                            $display(
                                "FAIL oc=%0d y=%0d x=%0d ref=%0d rtl=%0d",
                                oc, oy, ox, $signed(ref_mem[ref_idx]), acc
                            );
                    end

                    tested = tested + 1;

                    if ((tested % 10000) == 0)
                        $display("Progress: %0d / 819200", tested);
                end
            end
        end

        $display("Tested: %0d", tested);
        $display("Errors: %0d", errors);

        if (errors == 0)
            $display("PASS: Full Conv1 accumulator matches reference.");
        else
            $display("FAIL: Full Conv1 accumulator mismatch.");

        $finish;
    end

endmodule
