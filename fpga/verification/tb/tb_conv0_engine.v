`timescale 1ns/1ps

module tb_conv0_engine;

    parameter IN_W = 640;
    parameter IN_H = 640;
    parameter IN_C = 3;

    parameter OUT_W = 320;
    parameter OUT_H = 320;
    parameter OUT_C = 16;

    parameter INPUT_SIZE  = IN_W * IN_H * IN_C;
    parameter WEIGHT_SIZE = OUT_C * IN_C * 3 * 3;
    parameter BIAS_SIZE   = OUT_C;
    parameter OUTPUT_SIZE = OUT_W * OUT_H * OUT_C;

    reg clk;
    reg rst_n;
    reg start;

    reg in_valid;
    reg [7:0] in_data;
    wire in_ready;

    reg weight_we;
    reg [8:0] weight_addr;
    reg [7:0] weight_data;

    reg bias_we;
    reg [3:0] bias_addr;
    reg [31:0] bias_data;

    wire out_valid;
    reg out_ready;

    wire [31:0] out_addr;
    wire [31:0] out_acc;
    wire [7:0] out_data;

    wire busy;
    wire done;

    // Input and reference vectors
    reg [7:0] input_vector [0:INPUT_SIZE-1];
    reg [7:0] weight_vector [0:WEIGHT_SIZE-1];
    reg [31:0] bias_vector [0:BIAS_SIZE-1];

    reg [31:0] accumulator_golden [0:OUTPUT_SIZE-1];
    reg [7:0] output_golden [0:OUTPUT_SIZE-1];

    integer load_i;
    integer feed_i;

    integer output_count;
    integer accumulator_errors;
    integer output_errors;
    integer address_errors;
    integer invalid_outputs;
    integer done_count;

    integer first_acc_error_seen;
    integer first_out_error_seen;
    integer first_addr_error_seen;

    reg test_finished;


    // ========================================================
    // DUT
    // ========================================================

    conv0_engine #(
        .IN_W(IN_W),
        .IN_H(IN_H),
        .IN_C(IN_C),
        .OUT_W(OUT_W),
        .OUT_H(OUT_H),
        .OUT_C(OUT_C),
        .K(3)
    ) dut (
        .clk(clk),
        .rst_n(rst_n),

        .start(start),

        .in_valid(in_valid),
        .in_data(in_data),
        .in_ready(in_ready),

        .weight_we(weight_we),
        .weight_addr(weight_addr),
        .weight_data(weight_data),

        .bias_we(bias_we),
        .bias_addr(bias_addr),
        .bias_data(bias_data),

        .out_valid(out_valid),
        .out_ready(out_ready),

        .out_addr(out_addr),
        .out_acc(out_acc),
        .out_data(out_data),

        .busy(busy),
        .done(done)
    );


    // ========================================================
    // Clock: period = 10 ns
    // ========================================================

    initial begin
        clk = 1'b0;
        forever #5 clk = ~clk;
    end


    // ========================================================
    // Read all vectors
    //
    // Run ModelSim from the directory containing verification/data/conv0/.
    // ========================================================

    initial begin

        $display("");
        $display("==================================================");
        $display(" CONV0 FULL GOLDEN TEST");
        $display("==================================================");

        $display("Input elements  : %0d", INPUT_SIZE);
        $display("Weight elements : %0d", WEIGHT_SIZE);
        $display("Bias elements   : %0d", BIAS_SIZE);
        $display("Output elements : %0d", OUTPUT_SIZE);

        $display("");
        $display("Loading input_q.hex...");
        $readmemh("verification/data/conv0/input_q.hex",
                  input_vector);

        $display("Loading weight_int8.hex...");
        $readmemh("verification/data/conv0/weight_int8.hex",
                  weight_vector);

        $display("Loading bias_int32.hex...");
        $readmemh("verification/data/conv0/bias_int32.hex",
                  bias_vector);

        $display("Loading acc_int32_golden.hex...");
        $readmemh("verification/data/conv0/acc_int32_golden.hex",
                  accumulator_golden);

        $display("Loading output_q_golden.hex...");
        $readmemh("verification/data/conv0/output_q_golden.hex",
                  output_golden);

        $display("");
        $display("Finished reading the five files.");
        $display("Check Transcript for any readmemh warnings.");
        $display("==================================================");
    end


    // ========================================================
    // Reset, load model parameters, start and send input
    // ========================================================

    initial begin

        rst_n = 1'b0;
        start = 1'b0;

        in_valid = 1'b0;
        in_data = 8'd0;

        weight_we = 1'b0;
        weight_addr = 9'd0;
        weight_data = 8'd0;

        bias_we = 1'b0;
        bias_addr = 4'd0;
        bias_data = 32'd0;

        out_ready = 1'b1;

        output_count = 0;
        accumulator_errors = 0;
        output_errors = 0;
        address_errors = 0;
        invalid_outputs = 0;
        done_count = 0;

        first_acc_error_seen = 0;
        first_out_error_seen = 0;
        first_addr_error_seen = 0;

        test_finished = 1'b0;
        feed_i = 0;


        // Reset duration
        #30;

        @(negedge clk);
        rst_n = 1'b1;


        // ----------------------------------------------------
        // Load 432 INT8 weights
        // ----------------------------------------------------

        $display("");
        $display("Writing weights into DUT...");

        for (load_i = 0;
             load_i < WEIGHT_SIZE;
             load_i = load_i + 1) begin

            @(negedge clk);

            weight_we = 1'b1;
            weight_addr = load_i;
            weight_data = weight_vector[load_i];

        end

        @(negedge clk);
        weight_we = 1'b0;


        // ----------------------------------------------------
        // Load 16 INT32 biases
        // ----------------------------------------------------

        $display("Writing biases into DUT...");

        for (load_i = 0;
             load_i < BIAS_SIZE;
             load_i = load_i + 1) begin

            @(negedge clk);

            bias_we = 1'b1;
            bias_addr = load_i;
            bias_data = bias_vector[load_i];

        end

        @(negedge clk);
        bias_we = 1'b0;

        $display("Loaded %0d weights and %0d biases.",
                 WEIGHT_SIZE, BIAS_SIZE);


        // ----------------------------------------------------
        // Start Conv0
        // ----------------------------------------------------

        @(negedge clk);
        start = 1'b1;

        @(negedge clk);
        start = 1'b0;


        // ----------------------------------------------------
        // Stream input_q.hex in NCHW order
        // Hold each byte until a clock edge accepts it.
        // ----------------------------------------------------

        feed_i = 0;

        $display("");
        $display("Streaming input tensor...");

        while (feed_i < INPUT_SIZE) begin

            @(negedge clk);

            in_valid = 1'b1;
            in_data = input_vector[feed_i];

            @(posedge clk);

            if (in_ready)
                feed_i = feed_i + 1;

        end

        @(negedge clk);
        in_valid = 1'b0;

        $display("Input stream sent: %0d / %0d bytes",
                 feed_i, INPUT_SIZE);

        $display("Waiting for Conv0 outputs...");

    end


    // ========================================================
    // Compare every output address, accumulator and INT8 byte
    // ========================================================

    always @(posedge clk) begin

        if (rst_n && out_valid && out_ready) begin

            if (output_count >= OUTPUT_SIZE) begin

                invalid_outputs = invalid_outputs + 1;

                if (invalid_outputs <= 5) begin
                    $display(
                        "EXTRA OUTPUT: addr=%0d data=%02h",
                        out_addr, out_data
                    );
                end

            end
            else begin

                // ------------------------------------------------
                // Check output address/order
                // ------------------------------------------------

                if (out_addr !== output_count) begin

                    address_errors = address_errors + 1;

                    if (first_addr_error_seen == 0) begin

                        first_addr_error_seen = 1;

                        $display("");
                        $display("FIRST ADDRESS MISMATCH");
                        $display("  Expected address: %0d", output_count);
                        $display("  DUT address     : %0d", out_addr);

                    end
                end


                // ------------------------------------------------
                // Check INT32 accumulator
                // ------------------------------------------------

                if (out_acc !== accumulator_golden[output_count]) begin

                    accumulator_errors = accumulator_errors + 1;

                    if (first_acc_error_seen == 0) begin

                        first_acc_error_seen = 1;

                        $display("");
                        $display("FIRST ACCUMULATOR MISMATCH");
                        $display("  Output index : %0d", output_count);
                        $display("  Address      : %0d", out_addr);
                        $display("  Channel      : %0d",
                                 output_count / (OUT_W * OUT_H));

                        $display("  DUT acc      : %0d (0x%08h)",
                                 $signed(out_acc), out_acc);

                        $display("  GOLD acc     : %0d (0x%08h)",
                                 $signed(accumulator_golden[output_count]),
                                 accumulator_golden[output_count]);

                    end
                    else if (accumulator_errors <= 10) begin

                        $display(
                            "ACC MISMATCH idx=%0d DUT=%0d GOLD=%0d",
                            output_count,
                            $signed(out_acc),
                            $signed(accumulator_golden[output_count])
                        );

                    end
                end


                // ------------------------------------------------
                // Check requantized INT8 output
                // ------------------------------------------------

                if (out_data !== output_golden[output_count]) begin

                    output_errors = output_errors + 1;

                    if (first_out_error_seen == 0) begin

                        first_out_error_seen = 1;

                        $display("");
                        $display("FIRST INT8 OUTPUT MISMATCH");

                        $display("  Output index : %0d", output_count);
                        $display("  Channel      : %0d",
                                 output_count / (OUT_W * OUT_H));

                        $display("  DUT output   : %0d (0x%02h)",
                                 $signed(out_data), out_data);

                        $display("  GOLD output  : %0d (0x%02h)",
                                 $signed(output_golden[output_count]),
                                 output_golden[output_count]);

                        $display("  DUT acc      : %0d",
                                 $signed(out_acc));

                        $display("  GOLD acc     : %0d",
                                 $signed(accumulator_golden[output_count]));

                    end
                    else if (output_errors <= 10) begin

                        $display(
                            "OUT MISMATCH idx=%0d DUT=%0d GOLD=%0d",
                            output_count,
                            $signed(out_data),
                            $signed(output_golden[output_count])
                        );

                    end
                end

            end

            output_count = output_count + 1;

        end


        // ====================================================
        // Final report
        // ====================================================

        if (rst_n && done && !test_finished) begin

            test_finished = 1'b1;
            done_count = done_count + 1;

            $display("");
            $display("==================================================");
            $display(" CONV0 TEST SUMMARY");
            $display("==================================================");

            $display("Input bytes sent  : %0d / %0d",
                     feed_i, INPUT_SIZE);

            $display("Outputs checked   : %0d / %0d",
                     output_count, OUTPUT_SIZE);

            $display("Address mismatches: %0d", address_errors);
            $display("Accumulator errors: %0d", accumulator_errors);
            $display("INT8 output errors: %0d", output_errors);
            $display("Extra outputs     : %0d", invalid_outputs);
            $display("Done pulses       : %0d", done_count);

            if ((feed_i == INPUT_SIZE) &&
                (output_count == OUTPUT_SIZE) &&
                (address_errors == 0) &&
                (accumulator_errors == 0) &&
                (output_errors == 0) &&
                (invalid_outputs == 0) &&
                (done_count == 1)) begin

                $display("");
                $display(
                    "*** PASS: ALL CONV0 ACCUMULATORS AND INT8 OUTPUTS MATCH ***"
                );

            end
            else begin

                $display("");
                $display("*** FAIL: CHECK MISMATCHES ABOVE ***");

            end

            $display("==================================================");

            #20;
            $finish;

        end

    end


    // ========================================================
    // Timeout: 200,000,000 ns = 20,000,000 clock cycles
    // ========================================================

    initial begin

        #200000000;

        if (!test_finished) begin

            $display("");
            $display("*** TIMEOUT: CONV0 TEST DID NOT FINISH ***");

            $display("Outputs checked so far: %0d / %0d",
                     output_count, OUTPUT_SIZE);

            $display("Input bytes sent so far: %0d / %0d",
                     feed_i, INPUT_SIZE);

            $finish;

        end

    end

endmodule