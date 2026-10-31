`timescale 1ns/1ps

// =========================================================================
// Module: ov2640_config.v
// Author: KVC Team
// Date:   2026-10-30
// Desc:   Bộ nạp cấu hình SCCB cho camera OV2640
//         Thiết lập chế độ VGA (640x480) RGB565 @ 30fps
//         Định dạng địa chỉ thanh ghi: 8-bit (Device ID: 0x60)
// =========================================================================

module ov2640_config #(
    parameter integer CLK_FREQ_HZ = 100_000_000
)(
    input  wire        clk,
    input  wire        rst_n,
    input  wire        start,
    output reg         busy,
    output reg         done,

    // SCCB master handshake
    output reg         sccb_start,
    output reg  [7:0]  sccb_reg_addr,
    output reg  [7:0]  sccb_reg_data,
    input  wire        sccb_busy,
    input  wire        sccb_done
);

    localparam integer CYCLES_PER_MS = CLK_FREQ_HZ / 1000;
    localparam integer ROM_DEPTH     = 72;
    localparam TYPE_WRITE = 1'b0;
    localparam TYPE_DELAY = 1'b1;

    reg [7:0] rom_addr [0:ROM_DEPTH-1];
    reg [7:0] rom_data [0:ROM_DEPTH-1];
    reg       rom_type [0:ROM_DEPTH-1];
    integer i;

    initial begin
        for (i = 0; i < ROM_DEPTH; i = i + 1) begin
            rom_addr[i] = 8'h00;
            rom_data[i] = 8'h00;
            rom_type[i] = TYPE_WRITE;
        end

        // 1. Soft Reset Sensor
        rom_addr[0]  = 8'hFF; rom_data[0]  = 8'h01; rom_type[0] = TYPE_WRITE; // Select Bank 1
        rom_addr[1]  = 8'h12; rom_data[1]  = 8'h80; rom_type[1] = TYPE_WRITE; // Reset sensor
        rom_addr[2]  = 8'h00; rom_data[2]  = 8'd5;  rom_type[2] = TYPE_DELAY; // Wait 5ms

        // 2. Clock & Sensor Core Init (Bank 1)
        rom_addr[3]  = 8'hFF; rom_data[3]  = 8'h01; rom_type[3] = TYPE_WRITE;
        rom_addr[4]  = 8'h11; rom_data[4]  = 8'h01; rom_type[4] = TYPE_WRITE; // CLKRC: Internal clock prescaler
        rom_addr[5]  = 8'h12; rom_data[5]  = 8'h00; rom_type[5] = TYPE_WRITE; // COM7: SVGA mode
        rom_addr[6]  = 8'h0c; rom_data[6]  = 8'h00; rom_type[6] = TYPE_WRITE; // COM3
        rom_addr[7]  = 8'h3e; rom_data[7]  = 8'h00; rom_type[7] = TYPE_WRITE; // COM14
        rom_addr[8]  = 8'h04; rom_data[8]  = 8'h00; rom_type[8] = TYPE_WRITE; // COM1
        rom_addr[9]  = 8'h40; rom_data[9]  = 8'hC0; rom_type[9] = TYPE_WRITE; // COM15: RGB565 full range

        // 3. DSP Core Init (Bank 0)
        rom_addr[10] = 8'hFF; rom_data[10] = 8'h00; rom_type[10] = TYPE_WRITE; // Select Bank 0 (DSP)
        rom_addr[11] = 8'hE0; rom_data[11] = 8'h04; rom_type[11] = TYPE_WRITE; // Reset DSP
        rom_addr[12] = 8'hC0; rom_data[12] = 8'hC8; rom_type[12] = TYPE_WRITE;
        rom_addr[13] = 8'hC1; rom_data[13] = 8'h96; rom_type[13] = TYPE_WRITE;
        rom_addr[14] = 8'h86; rom_data[14] = 8'h3D; rom_type[14] = TYPE_WRITE;
        rom_addr[15] = 8'h50; rom_data[15] = 8'h89; rom_type[15] = TYPE_WRITE;
        rom_addr[16] = 8'h51; rom_data[16] = 8'h90; rom_type[16] = TYPE_WRITE;
        rom_addr[17] = 8'h52; rom_data[17] = 8'h2C; rom_type[17] = TYPE_WRITE;
        rom_addr[18] = 8'h53; rom_data[18] = 8'h00; rom_type[18] = TYPE_WRITE;
        rom_addr[19] = 8'h54; rom_data[19] = 8'h00; rom_type[19] = TYPE_WRITE;
        rom_addr[20] = 8'h55; rom_data[20] = 8'h88; rom_type[20] = TYPE_WRITE;
        rom_addr[21] = 8'h57; rom_data[21] = 8'h00; rom_type[21] = TYPE_WRITE;
        rom_addr[22] = 8'h5A; rom_data[22] = 8'hA0; rom_type[22] = TYPE_WRITE;
        rom_addr[23] = 8'h5B; rom_data[23] = 8'h78; rom_type[23] = TYPE_WRITE;
        rom_addr[24] = 8'h5C; rom_data[24] = 8'h00; rom_type[24] = TYPE_WRITE;
        rom_addr[25] = 8'hD3; rom_data[25] = 8'h04; rom_type[25] = TYPE_WRITE;

        // 4. Output Resolution: VGA 640x480
        rom_addr[26] = 8'hE0; rom_data[26] = 8'h00; rom_type[26] = TYPE_WRITE;
        rom_addr[27] = 8'hBA; rom_data[27] = 8'hDC; rom_type[27] = TYPE_WRITE;
        rom_addr[28] = 8'hBB; rom_data[28] = 8'h08; rom_type[28] = TYPE_WRITE;
        rom_addr[29] = 8'h00; rom_data[29] = 8'h00; rom_type[29] = TYPE_WRITE;
        rom_addr[30] = 8'h7F; rom_data[30] = 8'h00; rom_type[30] = TYPE_WRITE;
        rom_addr[31] = 8'hE5; rom_data[31] = 8'h1F; rom_type[31] = TYPE_WRITE;
        rom_addr[32] = 8'hE1; rom_data[32] = 8'h67; rom_type[32] = TYPE_WRITE;
        rom_addr[33] = 8'hDD; rom_data[33] = 8'h7F; rom_type[33] = TYPE_WRITE;
        rom_addr[34] = 8'h05; rom_data[34] = 8'h00; rom_type[34] = TYPE_WRITE;

        // 5. Output Format: RGB565
        rom_addr[35] = 8'hDA; rom_data[35] = 8'h08; rom_type[35] = TYPE_WRITE; // Image output format: RGB565
        rom_addr[36] = 8'hD7; rom_data[36] = 8'h03; rom_type[36] = TYPE_WRITE;
        rom_addr[37] = 8'hE0; rom_data[37] = 8'h00; rom_type[37] = TYPE_WRITE;
    end

    // FSM execution
    localparam [2:0]
        S_IDLE       = 3'd0,
        S_FETCH      = 3'd1,
        S_ISSUE_SCCB = 3'd2,
        S_WAIT_SCCB  = 3'd3,
        S_DELAY      = 3'd4,
        S_DONE       = 3'd5;

    reg [2:0]  state;
    reg [7:0]  rom_idx;
    reg [31:0] delay_cnt;
    reg [31:0] delay_target;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            state         <= S_IDLE;
            busy          <= 1'b0;
            done          <= 1'b0;
            sccb_start    <= 1'b0;
            sccb_reg_addr <= 8'd0;
            sccb_reg_data <= 8'd0;
            rom_idx       <= 8'd0;
            delay_cnt     <= 32'd0;
            delay_target  <= 32'd0;
        end else begin
            sccb_start <= 1'b0;
            done       <= 1'b0;

            case (state)
                S_IDLE: begin
                    busy <= 1'b0;
                    if (start) begin
                        busy    <= 1'b1;
                        rom_idx <= 8'd0;
                        state   <= S_FETCH;
                    end
                end

                S_FETCH: begin
                    if (rom_idx < 8'd38) begin // Valid configured entries
                        if (rom_type[rom_idx] == TYPE_DELAY) begin
                            delay_target <= rom_data[rom_idx] * CYCLES_PER_MS;
                            delay_cnt    <= 32'd0;
                            state        <= S_DELAY;
                        end else begin
                            sccb_reg_addr <= rom_addr[rom_idx];
                            sccb_reg_data <= rom_data[rom_idx];
                            state         <= S_ISSUE_SCCB;
                        end
                    end else begin
                        state <= S_DONE;
                    end
                end

                S_ISSUE_SCCB: begin
                    if (!sccb_busy) begin
                        sccb_start <= 1'b1;
                        state      <= S_WAIT_SCCB;
                    end
                end

                S_WAIT_SCCB: begin
                    if (sccb_done) begin
                        rom_idx <= rom_idx + 8'd1;
                        state   <= S_FETCH;
                    end
                end

                S_DELAY: begin
                    if (delay_cnt >= delay_target) begin
                        rom_idx <= rom_idx + 8'd1;
                        state   <= S_FETCH;
                    end else begin
                        delay_cnt <= delay_cnt + 32'd1;
                    end
                end

                S_DONE: begin
                    busy <= 1'b0;
                    done <= 1'b1;
                    state <= S_IDLE;
                end

                default: state <= S_IDLE;
            endcase
        end
    end

endmodule
