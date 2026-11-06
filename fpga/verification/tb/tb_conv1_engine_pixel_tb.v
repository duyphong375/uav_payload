
`timescale 1ns/1ps

module tb_conv1_engine_pixel_tb;

    reg clk = 0;
    reg rst_n = 0;
    reg start = 0;

    wire [21:0] input_addr;
    reg  [7:0] input_data;

    wire [11:0] weight_addr;
    reg signed [7:0] weight_data;

    wire [4:0] bias_addr;
    reg signed [31:0] bias_data;

    wire [7:0] output_data;
    wire [19:0] output_addr;
    wire output_valid, busy, done;

    integer term_count;
    integer cycle_count;
    integer errors;
    integer output_count;
    integer expected_terms;
    integer done_count;
    integer i;

    reg finished;

    localparam integer EXPECTED_OUTPUTS = 32 * 2 * 2;
    localparam integer TERMS_PER_PIXEL  = 3 * 3 * 16;

    // Clock 100 MHz
    always #5 clk = ~clk;

    // Engine voi kich thuoc nho de test
    conv1_engine #(
        .IN_W(4),
        .IN_H(4),
        .IN_C(16),
        .OUT_W(2),
        .OUT_H(2),
        .OUT_C(32)
    ) dut (
        .clk(clk),
        .rst_n(rst_n),
        .start(start),
        .input_addr(input_addr),
        .input_data(input_data),
        .weight_addr(weight_addr),
        .weight_data(weight_data),
        .bias_addr(bias_addr),
        .bias_data(bias_data),
        .output_data(output_data),
        .output_addr(output_addr),
        .output_valid(output_valid),
        .busy(busy),
        .done(done)
    );

    // Bo nho gia doc bat dong bo
    always @(*) begin
        input_data  = 8'd1 + (input_addr % 16);
        weight_data = (weight_addr % 5) - 2;
        bias_data   = bias_addr * 10;
    end

    // Dem so term MAC va so chu ky
    always @(posedge clk) begin
        if (!rst_n) begin
            term_count  <= 0;
            cycle_count <= 0;
        end else begin
            cycle_count <= cycle_count + 1;

            if (dut.term_valid)
                term_count <= term_count + 1;
        end
    end

    // Kiem tra moi output_valid
    always @(posedge clk) begin
        if (rst_n && output_valid && !finished) begin
            // Dia chi phang NCHW phai tang tu 0 den 127
            if (output_addr !== output_count) begin
                $display(
                    "FAIL: output #%0d, expected addr=%0d, got addr=%0d",
                    output_count, output_count, output_addr
                );
                errors = errors + 1;
            end

            // Moi pixel phai co du 144 term MAC
            expected_terms = (output_count + 1) * TERMS_PER_PIXEL;

            if (term_count != expected_terms) begin
                $display(
                    "FAIL: output #%0d, expected cumulative terms=%0d, got=%0d",
                    output_count, expected_terms, term_count
                );
                errors = errors + 1;
            end

            if (output_count < 8 || output_count >= EXPECTED_OUTPUTS - 4) begin
                $display(
                    "Output #%0d: addr=%0d data=%0d terms=%0d",
                    output_count, output_addr, output_data, term_count
                );
            end

            output_count = output_count + 1;
        end
    end

    // Dem xung done
    always @(posedge clk) begin
        if (!rst_n)
            done_count <= 0;
        else if (done)
            done_count <= done_count + 1;
    end

    initial begin
        errors       = 0;
        output_count = 0;
        expected_terms = 0;
        done_count   = 0;
        finished     = 0;

        repeat (3) @(negedge clk);
        rst_n = 1;

        @(negedge clk);
        start = 1;

        @(negedge clk);
        start = 0;

        // Cho engine hoan tat
        wait(done === 1'b1);

        // Cho cac monitor cap nhat va engine ve trang thai on dinh
        repeat (3) @(negedge clk);
        finished = 1;

        $display("");
        $display("========== CONV1 ENGINE TEST SUMMARY ==========");
        $display("Expected outputs : %0d", EXPECTED_OUTPUTS);
        $display("Observed outputs : %0d", output_count);
        $display("Expected MAC terms: %0d",
                 EXPECTED_OUTPUTS * TERMS_PER_PIXEL);
        $display("Observed MAC terms: %0d", term_count);
        $display("Done pulses       : %0d", done_count);
        $display("Clock cycles      : %0d", cycle_count);
        $display("Errors            : %0d", errors);

        if (output_count != EXPECTED_OUTPUTS) begin
            $display("FAIL: output count mismatch");
            errors = errors + 1;
        end

        if (term_count != EXPECTED_OUTPUTS * TERMS_PER_PIXEL) begin
            $display("FAIL: total MAC term count mismatch");
            errors = errors + 1;
        end

        if (done_count != 1) begin
            $display("FAIL: expected exactly one done pulse");
            errors = errors + 1;
        end

        if (errors == 0)
            $display("PASS: full output address/control test");
        else
            $display("FAIL: total errors=%0d", errors);

        $finish;
    end

    // Timeout
    initial begin
        #10000000;

        if (!finished) begin
            $display("TIMEOUT: engine did not finish");
            $display("Outputs observed: %0d / %0d",
                     output_count, EXPECTED_OUTPUTS);
            $display("MAC terms observed: %0d", term_count);
            $finish;
        end
    end

endmodule
