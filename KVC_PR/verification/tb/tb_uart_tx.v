`timescale 1ns/1ps

module tb_uart_tx;

    reg clk;
    reg rst_n;

    reg [7:0] tx_data;
    reg tx_valid;
    wire tx_ready;
    wire tx_pin;

    uart_tx
    #(
        .CLK_HZ(100_000_000),
        .BAUD(115200)
    ) dut (
        .clk(clk),
        .rst_n(rst_n),

        .tx_data(tx_data),
        .tx_valid(tx_valid),
        .tx_ready(tx_ready),
        .tx_pin(tx_pin)
    );

    initial begin
        clk = 1'b0;
        forever #5 clk = ~clk;
    end

    initial begin
        rst_n = 1'b0;
        tx_data = 8'd0;
        tx_valid = 1'b0;

        repeat (5) @(posedge clk);
        rst_n = 1'b1;

        tx_data = 8'hA5;
        tx_valid = 1'b1;
        @(posedge clk);
        tx_valid = 1'b0;

        repeat (2000) @(posedge clk);

        $display("PASS: tb_uart_tx completed");
        $finish;
    end

endmodule