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
    // 9 bit: [8]=stop filler, [7:0]=data LSB-first.
    // Start bit duoc phat truc tiep khi khoi dong, KHONG nam trong shifter.
    //
    // KHUNG 8N1 = 10 bit-time: start(1) + data(8) + stop(1).
    // bit_cnt chay 0..9:
    //   0      -> dang o start bit (tx_pin = 0)
    //   1..8   -> phat data bit 0..7
    //   9      -> stop bit (tx_pin = 1), VAN GIU tx_busy
    //   het 9  -> ha tx_busy, bao tx_done
    //
    // TRUOC DAY (loi P0): tx_busy bi ha ngay khi stop bit BAT DAU, nen byte
    // ke tiep chiem mat cua so stop -> moi byte chi con 9 bit-time. Bo thu
    // that se lay mau stop bit tai 9,5 bit-time va doc duoc start bit cua
    // byte sau => framing error 100%. tb_uart_tx cu assert 9 bit-time nen
    // khong bat duoc loi nay.
    reg [8:0] shifter;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            baud_cnt <= {COUNTER_W{1'b0}};
            bit_cnt <= 4'd0;
            shifter <= 9'd0;
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
                    shifter <= {1'b1, tx_data}; // stop filler + 8 data, LSB first
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

                    // bit_cnt chay 0..9 (xem giai thich o khai bao shifter):
                    //   0..7 -> data bit 0..7 LSB-first
                    //   8    -> bat dau stop bit, GIU tx_busy
                    //   9    -> ket thuc stop bit, ha tx_busy + tx_done
                    if (bit_cnt == 4'd9) begin
                        tx_busy <= 1'b0;
                        tx_pin <= 1'b1;
                        tx_ready <= 1'b1;
                        tx_done <= 1'b1;
                        bit_cnt <= 4'd0;
                    end
                    else if (bit_cnt == 4'd8) begin
                        // Stop bit: giu muc 1 trong TRON 1 bit-time
                        tx_pin <= 1'b1;
                        bit_cnt <= bit_cnt + 4'd1;
                    end
                    else begin
                        tx_pin <= shifter[0];
                        shifter <= {1'b1, shifter[8:1]};
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
