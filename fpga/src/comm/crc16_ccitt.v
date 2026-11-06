// -----------------------------------------------------------------------------
// Module: crc16_ccitt.v
// Author: KVC Team
// Date:   2026-10-30
// Desc:   CRC-16/CCITT-FALSE (Poly 0x1021, Init 0xFFFF, RefIn/RefOut = false)
//         Chuan giao thuc IF-02 cho KVC (FPGA -> MCU Sonix -> ESP32)
// -----------------------------------------------------------------------------
`timescale 1ns/1ps
module crc16_ccitt (
    input  wire        clk,
    input  wire        rst_n,
    input  wire [7:0]  data_in,
    input  wire        data_valid,
    input  wire        crc_start,
    input  wire        crc_done,
    output wire [15:0] crc_out
);

    reg [15:0] crc_reg;
    assign crc_out = crc_reg;

    function [15:0] calc_crc_step;
        input [7:0]  byte_in;
        input [15:0] current_crc;
        integer i;
        reg [15:0] c;
        begin
            c = current_crc ^ (byte_in << 8);
            for (i = 0; i < 8; i = i + 1) begin
                if (c[15])
                    c = (c << 1) ^ 16'h1021;
                else
                    c = (c << 1);
            end
            calc_crc_step = c & 16'hFFFF;
        end
    endfunction

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            crc_reg <= 16'hFFFF;
        end else begin
            if (crc_start) begin
                crc_reg <= 16'hFFFF;
            end else if (data_valid) begin
                crc_reg <= calc_crc_step(data_in, crc_reg);
            end
        end
    end

endmodule
