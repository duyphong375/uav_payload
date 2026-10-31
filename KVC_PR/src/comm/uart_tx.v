`timescale 1ns/1ps

module uart_tx
#(
    parameter integer CLK_HZ      = 100_000_000,
    parameter integer BAUD        = 38400,
    parameter integer CLK_FREQ_HZ = CLK_HZ,
    parameter integer BAUD_RATE   = BAUD
)
(
    input  wire clk,
    input  wire rst_n,

    input  wire [7:0] tx_data,
    input  wire       tx_valid,
    input  wire       tx_start,

    output reg        tx_ready,
    output reg        tx_pin,
    output wire       tx,
    output reg        tx_busy,
    output reg        tx_done
);

    localparam integer EFFECTIVE_CLK  = (CLK_FREQ_HZ != 100_000_000 || CLK_HZ == 100_000_000) ? CLK_FREQ_HZ : CLK_HZ;
    localparam integer EFFECTIVE_BAUD = (BAUD_RATE != 38400 || BAUD == 38400) ? BAUD_RATE : BAUD;
    localparam integer BAUD_DIV       = EFFECTIVE_CLK / EFFECTIVE_BAUD;
    localparam integer COUNTER_W      = 16;

    wire valid_sig   = (tx_valid === 1'b1);
    wire start_sig   = (tx_start === 1'b1);
    wire start_pulse = valid_sig | start_sig;
    assign tx = tx_pin;

    reg [COUNTER_W-1:0] baud_cnt;
    reg [3:0] bit_cnt;
    reg [9:0] shifter;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            baud_cnt <= {COUNTER_W{1'b0}};
            bit_cnt <= 4'd0;
            shifter <= 10'd0;
            tx_busy <= 1'b0;
            tx_ready <= 1'b1;
            tx_done <= 1'b0;
            tx_pin <= 1'b1;
        end
        else begin
            tx_ready <= 1'b0;
            tx_done <= 1'b0;

            if (!tx_busy) begin
                if (start_pulse) begin
                    shifter <= {1'b1, tx_data, 1'b0}; // stop, 8-bit data, start
                    tx_busy <= 1'b1;
                    bit_cnt <= 4'd0;
                    baud_cnt <= {COUNTER_W{1'b0}};
                    tx_pin <= 1'b0; // start bit
                    tx_ready <= 1'b0;
                end
                else begin
                    tx_pin <= 1'b1; // idle
                    tx_ready <= 1'b1;
                end
            end
            else begin
                if (baud_cnt == BAUD_DIV - 1) begin
                    baud_cnt <= {COUNTER_W{1'b0}};

                    if (bit_cnt == 4'd9) begin
                        tx_busy <= 1'b0;
                        tx_pin <= 1'b1; // stop bit
                        tx_ready <= 1'b1;
                        tx_done <= 1'b1;
                    end
                    else begin
                        tx_pin <= shifter[0];
                        shifter <= {1'b1, shifter[9:1]};
                        bit_cnt <= bit_cnt + 4'd1;
                    end
                end
                else begin
                    baud_cnt <= baud_cnt + {{(COUNTER_W-1){1'b0}}, 1'b1};
                end
            end
        end
    end
endmodule
