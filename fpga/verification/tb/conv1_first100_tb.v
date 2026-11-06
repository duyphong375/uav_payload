
`timescale 1ns/1ps

module conv1_first100_tb;

    reg clk, rst_n, start;
    reg signed [31:0] bias;
    reg term_valid;
    reg [7:0] x_u8;
    reg signed [7:0] w_s8;
    reg term_last;

    wire signed [31:0] acc;
    wire busy, done;

    integer fd;
    integer rc;
    integer pixel;
    integer oc, oy, ox;
    integer expected_acc, bias_read;
    integer i, errors;
    integer xv, wv;

    reg signed [31:0] expected_signed;

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

    always #5 clk = ~clk;

    initial begin
        clk = 0;
        rst_n = 0;
        start = 0;
        bias = 0;
        term_valid = 0;
        x_u8 = 1;
        w_s8 = 0;
        term_last = 0;
        errors = 0;

        #20;
        rst_n = 1;
        @(negedge clk);
        //fd = $fopen("verification/data/conv1/conv1_first100_vectors.txt", "r");
        //fd = $fopen("verification/data/conv1/conv1_distributed_vectors.txt", "r");
        fd = $fopen("verification/data/conv1/conv1_distributed_vectors_ort_input.txt", "r");
        if (fd == 0) begin
            $display("ERROR: Cannot open vector file.");
            $display("Check verification/data/conv1/conv1_first100_vectors.txt");
            $finish;
        end

//        for (pixel = 0; pixel < 100; pixel = pixel + 1) begin
        for (pixel = 0; pixel < 1568; pixel = pixel + 1) begin

            rc = $fscanf(fd, "%d %d %d %d %d\n",
                         oc, oy, ox, expected_acc, bias_read);

            if (rc != 5) begin
                $display("ERROR: Cannot read header for pixel %0d", pixel);
                errors = errors + 1;
            end
            else begin
                expected_signed = expected_acc;
                bias = bias_read;

                // Start this pixel's MAC operation
                start = 1;
                @(negedge clk);
                start = 0;

                // Read and process 144 input/weight pairs
                for (i = 0; i < 144; i = i + 1) begin
                    rc = $fscanf(fd, "%h %h\n", xv, wv);

                    if (rc != 2) begin
                        $display("ERROR: Vector read failed at pixel %0d term %0d",
                                 pixel, i);
                        errors = errors + 1;
                        xv = 1;
                        wv = 0;
                    end

                    x_u8 = xv;
                    w_s8 = wv;
                    term_valid = 1;

                    if (i == 143)
                        term_last = 1;
                    else
                        term_last = 0;

                    @(negedge clk);
                end

                term_valid = 0;
                term_last = 0;
                #1;

                if (acc === expected_signed &&
                    busy === 1'b0 && done === 1'b1) begin
                    if (pixel < 5)
                        $display("Pixel %0d (oc=%0d, oy=%0d, ox=%0d): REF=%0d RTL=%0d PASS",
                                 pixel, oc, oy, ox, expected_acc, acc);
                end
                else begin
                    $display("FAIL pixel %0d (oc=%0d, oy=%0d, ox=%0d): REF=%0d RTL=%0d busy=%b done=%b",
                             pixel, oc, oy, ox, expected_acc, acc, busy, done);
                    errors = errors + 1;
                end

                @(negedge clk);
            end
        end

        $fclose(fd);

/*        $display("---------------------------------------");
        $display("Pixels tested: 100");
        $display("Errors: %0d", errors);

        if (errors == 0)
            $display("PASS: All 100 pixels match the reference.");
        else
            $display("FAIL: Some pixels do not match.");
*/
/*        $display("---------------------------------------");
        $display("Pixels tested: 1568");
        $display("Errors: %0d", errors);

        if (errors == 0)
            $display("PASS: All 1568 pixels match the reference.");
        else
            $display("FAIL: Some pixels do not match.");
*/
        if (fd == 0) begin
            $display("ERROR: Cannot open conv1_distributed_vectors_ort_input.txt");
            $display("Check folder verification/data/conv1/");
            $finish;
        end
        $finish;
    end

endmodule
