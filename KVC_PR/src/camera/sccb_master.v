// -----------------------------------------------------------------------------
// Module: sccb_master.v
// Author: Vững
// Date:   2026-10-15
// Desc:   SCCB / I2C-like master (bit-bang) đơn giản để ghi 1 byte dữ liệu
//         tới OV5640 (2-byte register address + 1-byte data).
// Notes (tiếng Việt):
//  - SCCB tương tự I2C ở layer vật lý (start/stop, SCL, SDA open-drain).
//  - SCL và SDA đều open-drain: drive low hoặc release (Z). Cần pull-up ngoài.
//  - SCL_DIV tính theo chu kỳ clock 'clk' để tạo xung SCL.
//    Với clk=100MHz, SCL_DIV=250 -> SCL ~ 400kHz (tối đa cho SCCB).
//  - Giao diện: start (pulse) -> busy high -> done pulse 1clk.
//  - Device 8-bit write address mặc định DEV_ADDR = 0x78.
//  - [SỬA] Warning EX3791: thêm độ rộng bit cho các phép toán.
// -----------------------------------------------------------------------------
`timescale 1ns/1ps
module sccb_master #(
    parameter integer SCL_DIV = 250,    // full SCL period in clk cycles (must be >=2)
    parameter [7:0] DEV_ADDR = 8'h78,   // 8-bit device write address (0x78 for OV5640, 0x60 for OV2640)
    parameter integer ADDR_BYTES = 2    // 2: 16-bit address (OV5640), 1: 8-bit address (OV2640)
)(
    input  wire        clk,        // system clock (100 MHz)
    input  wire        rst_n,      // active-low reset
    input  wire        start,      // pulse 1 clk to start a transaction
    input  wire [15:0] reg_addr,   // 2-byte register address (MSB first)
    input  wire [7:0]  reg_data,   // data byte to write
    output wire        scl,        // SCL open-drain
    inout  wire        sda,        // SDA open-drain
    output reg         busy,       // high while transaction in progress
    output reg         done        // pulse 1 clk when transaction finished
);

    // -------------------------------------------------------------------------
    // Parameter sanity
    // -------------------------------------------------------------------------
    localparam integer HALF = (SCL_DIV >= 2) ? (SCL_DIV/2) : 1;

    // -------------------------------------------------------------------------
    // Open-drain SCL/SDA handling
    // -------------------------------------------------------------------------
    reg scl_oe;        // 1 => drive low; 0 => release (Z)
    reg sda_oe;        // 1 => drive low; 0 => release (Z)
    assign scl = scl_oe ? 1'b0 : 1'bz;
    assign sda = sda_oe ? 1'b0 : 1'bz;
    wire sda_in = sda; // read bus (pulled up = 1)

    // -------------------------------------------------------------------------
    // States
    // -------------------------------------------------------------------------
    localparam [3:0]
        ST_IDLE        = 4'd0,
        ST_START       = 4'd1,
        ST_SEND_BIT    = 4'd2,
        ST_SCL_HIGH    = 4'd3,
        ST_ACK         = 4'd4,
        ST_NEXT_BYTE   = 4'd5,
        ST_STOP_PREP   = 4'd6,
        ST_STOP_RELEASE= 4'd7,
        ST_DONE        = 4'd8;

    reg [3:0] state;

    // Counters and indices
    reg [15:0] clk_cnt;       // for timing SCL phases
    reg [2:0]  bit_idx;       // bit index 7..0
    reg [1:0]  byte_idx;      // 0..3 : dev_addr, reg_hi, reg_lo, data
    reg [7:0]  tx_byte;       // current byte to send

    // Latched inputs at start
    reg [15:0] lat_reg_addr;
    reg [7:0]  lat_reg_data;

    // store sampled ACKs for debug (optional)
    reg [3:0] ack_sampled; // one bit per byte (0=ACK,1=NACK)

    // start edge detection
    reg start_d;
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) start_d <= 1'b0;
        else start_d <= start;
    end

    // -------------------------------------------------------------------------
    // FSM sequential
    // -------------------------------------------------------------------------
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            state <= ST_IDLE;
            scl_oe <= 1'b0;   // release SCL (pull-up high)
            sda_oe <= 1'b0;   // release SDA
            busy <= 1'b0;
            done <= 1'b0;
            clk_cnt <= 16'd0;
            bit_idx <= 3'd7;
            byte_idx <= 2'd0;
            tx_byte <= 8'h00;
            lat_reg_addr <= 16'h0000;
            lat_reg_data <= 8'h00;
            ack_sampled <= 4'b1111;
        end else begin
            // default done low
            done <= 1'b0;

            case (state)
                ST_IDLE: begin
                    scl_oe <= 1'b0;  // SCL high
                    sda_oe <= 1'b0;  // SDA high
                    busy <= 1'b0;
                    if (start && !start_d) begin
                        lat_reg_addr <= reg_addr;
                        lat_reg_data <= reg_data;
                        busy <= 1'b1;
                        tx_byte <= DEV_ADDR;
                        bit_idx <= 3'd7;
                        byte_idx <= 2'd0;
                        clk_cnt <= 16'd0;
                        ack_sampled <= 4'b1111;
                        state <= ST_START;
                    end
                end

                ST_START: begin
                    // START: SDA goes low while SCL high
                    scl_oe <= 1'b0;  // SCL high
                    sda_oe <= 1'b1;  // SDA low
                    if (clk_cnt < HALF) begin
                        clk_cnt <= clk_cnt + 16'd1;
                    end else begin
                        clk_cnt <= 16'd0;
                        scl_oe <= 1'b1;  // SCL low
                        state <= ST_SEND_BIT;
                    end
                end

                ST_SEND_BIT: begin
                    // SCL low, drive SDA theo bit
                    scl_oe <= 1'b1;  // SCL low
                    if (tx_byte[bit_idx] == 1'b0)
                        sda_oe <= 1'b1;  // SDA low
                    else
                        sda_oe <= 1'b0;  // SDA high
                    clk_cnt <= 16'd0;
                    state <= ST_SCL_HIGH;
                end

                ST_SCL_HIGH: begin
                    // SCL low → high → low
                    if (clk_cnt < HALF) begin
                        clk_cnt <= clk_cnt + 16'd1;
                        scl_oe <= 1'b1;  // SCL low
                    end else if (clk_cnt < (HALF + HALF)) begin
                        scl_oe <= 1'b0;  // SCL high
                        clk_cnt <= clk_cnt + 16'd1;
                    end else begin
                        clk_cnt <= 16'd0;
                        scl_oe <= 1'b1;  // SCL low
                        if (bit_idx == 3'd0) begin
                            state <= ST_ACK;
                            sda_oe <= 1'b0;  // release SDA cho slave ACK
                        end else begin
                            bit_idx <= bit_idx - 3'd1;
                            state <= ST_SEND_BIT;
                        end
                    end
                end

                ST_ACK: begin
                    if (clk_cnt < HALF) begin
                        clk_cnt <= clk_cnt + 16'd1;
                        scl_oe <= 1'b1;  // SCL low
                    end else if (clk_cnt < (HALF + HALF)) begin
                        scl_oe <= 1'b0;  // SCL high
                        if (clk_cnt == HALF) begin
                            ack_sampled[byte_idx] <= sda_in;
                        end
                        clk_cnt <= clk_cnt + 16'd1;
                    end else begin
                        clk_cnt <= 16'd0;
                        scl_oe <= 1'b1;  // SCL low
                        state <= ST_NEXT_BYTE;
                    end
                end

                ST_NEXT_BYTE: begin
                    case (byte_idx)
                        2'd0: begin
                            if (ADDR_BYTES == 1) begin
                                tx_byte  <= lat_reg_addr[7:0];
                                bit_idx  <= 3'd7;
                                byte_idx <= 2'd2; // Skip reg_addr_hi, next byte is reg_data
                                state    <= ST_SEND_BIT;
                            end else begin
                                tx_byte  <= lat_reg_addr[15:8];
                                bit_idx  <= 3'd7;
                                byte_idx <= 2'd1;
                                state    <= ST_SEND_BIT;
                            end
                        end
                        2'd1: begin
                            tx_byte <= lat_reg_addr[7:0];
                            bit_idx <= 3'd7;
                            byte_idx <= 2'd2;
                            state <= ST_SEND_BIT;
                        end
                        2'd2: begin
                            tx_byte <= lat_reg_data;
                            bit_idx <= 3'd7;
                            byte_idx <= 2'd3;
                            state <= ST_SEND_BIT;
                        end
                        2'd3: begin
                            state <= ST_STOP_PREP;
                        end
                        default: state <= ST_STOP_PREP;
                    endcase
                end

                ST_STOP_PREP: begin
                    sda_oe <= 1'b1;  // SDA low
                    scl_oe <= 1'b1;  // SCL low
                    clk_cnt <= 16'd0;
                    state <= ST_STOP_RELEASE;
                end

                ST_STOP_RELEASE: begin
                    if (clk_cnt < HALF) begin
                        clk_cnt <= clk_cnt + 16'd1;
                        scl_oe <= 1'b1;  // SCL low
                    end else if (clk_cnt < (HALF + HALF)) begin
                        scl_oe <= 1'b0;  // SCL high
                        clk_cnt <= clk_cnt + 16'd1;
                    end else begin
                        sda_oe <= 1'b0;  // SDA high → STOP
                        clk_cnt <= 16'd0;
                        state <= ST_DONE;
                    end
                end

                ST_DONE: begin
                    busy <= 1'b0;
                    done <= 1'b1;
                    scl_oe <= 1'b0;
                    sda_oe <= 1'b0;
                    state <= ST_IDLE;
                end

                default: state <= ST_IDLE;
            endcase
        end
    end

endmodule