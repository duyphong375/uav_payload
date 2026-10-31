
`timescale 1ns/1ps

module tb_conv1_engine_e2e_tb;

    localparam integer IN_W = 320;
    localparam integer IN_H = 320;
    localparam integer IN_C = 16;
    localparam integer OUT_W = 160;
    localparam integer OUT_H = 160;
    localparam integer OUT_C = 32;

    localparam integer INPUT_SIZE  = IN_W * IN_H * IN_C;
    localparam integer WEIGHT_SIZE = OUT_C * IN_C * 9;
    localparam integer BIAS_SIZE   = OUT_C;
    localparam integer OUTPUT_SIZE = OUT_W * OUT_H * OUT_C;

    localparam [3:0] ST_START_MAC = 4'd3;
    localparam [3:0] ST_FEED      = 4'd7;

    reg clk = 0;
    always #5 clk = ~clk;

    reg rst_n = 0;
    reg start = 0;

    wire [21:0] input_addr;
    reg [7:0] input_data = 0;

    wire [12:0] weight_addr;
    reg signed [7:0] weight_data = 0;

    wire [4:0] bias_addr;
    reg signed [31:0] bias_data = 0;

    wire output_valid;
    wire [21:0] output_addr;
    wire [7:0] output_data;
    wire busy;
    wire done;

    reg [7:0] input_mem [0:INPUT_SIZE-1];
    reg signed [7:0] weight_mem [0:WEIGHT_SIZE-1];
    reg signed [31:0] bias_mem [0:BIAS_SIZE-1];
    reg [7:0] golden_mem [0:OUTPUT_SIZE-1];
    reg signed [31:0] acc_ref_mem [0:OUTPUT_SIZE-1];

    reg seen_addr [0:OUTPUT_SIZE-1];

    integer i;
    integer output_count = 0;
    integer done_count = 0;
    integer mismatch_count = 0;
    integer duplicate_count = 0;
    integer invalid_count = 0;
    integer missing_count = 0;

    integer first_mismatch_seen = 0;
    integer first_mismatch_addr = -1;
    integer first_mismatch_actual = -1;
    integer first_mismatch_expected = -1;
    integer test_finished = 0;

    // Diagnostic accumulator: channel 28, pixel (0,0).
    integer dbg_active = 0;
    integer dbg_term_count = 0;
    integer dbg_sum = 0;
    integer dbg_bias = 0;
    integer dbg_actual_acc = 0;
    integer dbg_ref_acc = 0;
    integer dbg_acc_captured = 0;

    integer term_x;
    integer term_w;
    integer term_product;

    conv1_engine #(
        .IN_W(IN_W),
        .IN_H(IN_H),
        .IN_C(IN_C),
        .OUT_W(OUT_W),
        .OUT_H(OUT_H),
        .OUT_C(OUT_C),
        .ACC_W(32),
        .F(30)
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

        .output_we(output_valid),
        .output_addr(output_addr),
        .output_data(output_data),

        .busy(busy),
        .done(done)
    );

    // Synchronous RAM model.
    always @(posedge clk) begin
        if (input_addr < INPUT_SIZE)
            input_data <= input_mem[input_addr];
        else
            input_data <= 8'd1;

        if (weight_addr < WEIGHT_SIZE)
            weight_data <= weight_mem[weight_addr];
        else
            weight_data <= 8'sd0;

        if (bias_addr < BIAS_SIZE)
            bias_data <= bias_mem[bias_addr];
        else
            bias_data <= 32'sd0;
    end

    // Output scoreboard.
    always @(posedge clk) begin
        if (rst_n && !test_finished) begin
            if (done)
                done_count = done_count + 1;

            if (output_valid) begin
                output_count = output_count + 1;

                if (output_addr >= OUTPUT_SIZE) begin
                    invalid_count = invalid_count + 1;
                    $display("INVALID OUTPUT ADDRESS: %0d",
                             output_addr);
                end else begin
                    if (seen_addr[output_addr])
                        duplicate_count = duplicate_count + 1;
                    else
                        seen_addr[output_addr] = 1'b1;

                    if (output_data !== golden_mem[output_addr]) begin
                        mismatch_count = mismatch_count + 1;

                        if (!first_mismatch_seen) begin
                            first_mismatch_seen = 1;
                            first_mismatch_addr = output_addr;
                            first_mismatch_actual = output_data;
                            first_mismatch_expected =
                                golden_mem[output_addr];

                            $display(
                                "FIRST OUTPUT MISMATCH addr=%0d actual=%0d expected=%0d",
                                output_addr,
                                output_data,
                                golden_mem[output_addr]
                            );
                        end
                    end
                end
            end
        end
    end

    // Independent MAC calculation for channel 28, pixel (0,0).
    always @(posedge clk) begin
        if (rst_n && !test_finished) begin
            if ((dut.state == ST_START_MAC) &&
                (dut.oc == 5'd28) &&
                (dut.ox == 0) &&
                (dut.oy == 0)) begin

                dbg_active = 1;
                dbg_term_count = 0;
                dbg_sum = $signed(bias_data);
                dbg_bias = $signed(bias_data);
                dbg_acc_captured = 0;

                $display("DEBUG START ch28 pixel(0,0) bias=%0d",
                         $signed(bias_data));
            end

            if (dbg_active &&
                (dut.state == ST_FEED) &&
                (dut.oc == 5'd28) &&
                (dut.ox == 0) &&
                (dut.oy == 0)) begin

                term_x = $signed({1'b0, dut.x_for_mac}) - 1;
                term_w = $signed(weight_data);
                term_product = term_x * term_w;

                dbg_sum = dbg_sum + term_product;
                dbg_term_count = dbg_term_count + 1;

                // Print only the first and last terms to reduce log size.
                if ((dbg_term_count == 1) ||
                    (dbg_term_count == 144)) begin
                    $display(
                        "TRACE term=%0d ic=%0d ky=%0d kx=%0d x=%0d w=%0d p=%0d sum=%0d",
                        dbg_term_count-1,
                        dut.ic, dut.ky, dut.kx,
                        term_x, term_w, term_product, dbg_sum
                    );
                end
            end

            if (dbg_active &&
                dut.mac_done &&
                (dut.oc == 5'd28) &&
                (dut.ox == 0) &&
                (dut.oy == 0)) begin

                dbg_actual_acc = $signed(dut.acc_out);
                dbg_ref_acc =
                    $signed(acc_ref_mem[(28*OUT_H)*OUT_W]);
                dbg_acc_captured = 1;

                $display(
                    "DEBUG ACC terms=%0d bias=%0d recomputed=%0d actual=%0d ref=%0d",
                    dbg_term_count,
                    dbg_bias,
                    dbg_sum,
                    dbg_actual_acc,
                    dbg_ref_acc
                );

                dbg_active = 0;
            end
        end
    end

    initial begin
        $display("Loading Conv1 ORT-matched vectors...");

        $readmemh("verification/data/conv1/input_q_ort.hex", input_mem);
        $readmemh("verification/data/conv1/weight_int8.hex", weight_mem);
        $readmemh("verification/data/conv1/bias_int32.hex", bias_mem);
        $readmemh("verification/data/conv1/output_q_ort_input_golden.hex",
                   golden_mem);
        $readmemh("verification/data/conv1/conv1_acc_reference_ort_input.hex",
                   acc_ref_mem);

        for (i = 0; i < OUTPUT_SIZE; i = i + 1)
            seen_addr[i] = 1'b0;

        repeat (5) @(posedge clk);

        @(negedge clk);
        rst_n = 1'b1;

        repeat (3) @(posedge clk);

        @(negedge clk);
        start = 1'b1;

        @(negedge clk);
        start = 1'b0;

        wait(done === 1'b1);

        // Allow the output scoreboard to consume pending pulses.
        repeat (3) @(negedge clk);
        test_finished = 1;

        for (i = 0; i < OUTPUT_SIZE; i = i + 1) begin
            if (!seen_addr[i])
                missing_count = missing_count + 1;
        end

        $display("");
        $display("========== CONV1 E2E SUMMARY ==========");
        $display("Expected outputs      : %0d", OUTPUT_SIZE);
        $display("Observed outputs      : %0d", output_count);
        $display("Golden mismatches     : %0d", mismatch_count);
        $display("Duplicate addresses   : %0d", duplicate_count);
        $display("Invalid addresses     : %0d", invalid_count);
        $display("Missing addresses     : %0d", missing_count);
        $display("Done pulses           : %0d", done_count);
        $display("Engine busy           : %0d", busy);
        $display("First mismatch addr   : %0d", first_mismatch_addr);
        $display("First mismatch actual : %0d", first_mismatch_actual);
        $display("First mismatch expect : %0d", first_mismatch_expected);
        $display("Debug accumulator     : %0d", dbg_acc_captured);

        if (dbg_acc_captured) begin
            $display("Debug terms           : %0d", dbg_term_count);
            $display("Debug bias            : %0d", dbg_bias);
            $display("Debug recomputed sum  : %0d", dbg_sum);
            $display("Debug actual acc      : %0d", dbg_actual_acc);
            $display("Debug reference acc   : %0d", dbg_ref_acc);
        end

        $display("=======================================");

        if ((output_count == OUTPUT_SIZE) &&
            (mismatch_count == 0) &&
            (duplicate_count == 0) &&
            (invalid_count == 0) &&
            (missing_count == 0) &&
            (done_count == 1) &&
            (busy == 0) &&
            dbg_acc_captured &&
            (dbg_term_count == 144) &&
            (dbg_sum == dbg_ref_acc) &&
            (dbg_actual_acc == dbg_ref_acc)) begin
            $display("TEST PASSED");
        end else begin
            $display("TEST FAILED");
        end

        $finish;
    end

    // Watchdog.
    initial begin
        #10000000000;
        $display("ERROR: watchdog timeout");
        $finish;
    end

endmodule
