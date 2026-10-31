// -----------------------------------------------------------------------------
// Module: crc16_ccitt.v
// Author: Vững
// Date:   2026-10-15
// Desc:   CRC-16/CCITT-FALSE (Poly 0x1021, Init 0xFFFF, RefIn/RefOut = false)
//         - Giao diện "streaming":
//             clk, rst_n
//             data_in[7:0], data_valid
//             crc_start  : pulse để reset crc_reg về 0xFFFF
//             crc_done   : pulse để latch crc_out <= crc_reg
//             crc_out[15:0] : giá trị CRC hiện thời khi crc_done được pulse
// Notes:
//   - Khi rst_n = 0, crc_reg <= 16'hFFFF, crc_out <= 16'h0000
//   - Khi crc_start = 1, module sẽ nạp lại crc_reg = 16'hFFFF (bắt đầu mới)
//   - Khi data_valid = 1, module cập nhật crc_reg <= crc_next (tính tổ hợp)
//   - Khi crc_done = 1, module gán crc_out <= crc_reg (lưu kết quả để đọc ra bên ngoài)
// Implementation detail:
//   - Tổ hợp crc_next được tính theo pseudo-code đã cho: xor_byte = data_in ^ crc_reg[15:8]
//   - Không dùng for-loop trong always để tránh vấn đề tổng hợp
// -----------------------------------------------------------------------------
`timescale 1ns/1ps
module crc16_ccitt (
    input  wire        clk,
    input  wire        rst_n,
    input  wire [7:0]  data_in,
    input  wire        data_valid,
    input  wire        crc_start,
    input  wire        crc_done,
    output reg  [15:0] crc_out
);

    // Internal CRC register (current working CRC)
    reg [15:0] crc_reg;

    // xor_byte như trong pseudo-code: XOR byte với phần MSB hiện tại của crc_reg
    wire [7:0] xor_byte;
    assign xor_byte = data_in ^ crc_reg[15:8];

    // Tính crc_next theo công thức đã cung cấp (byte-wise, không dùng vòng lặp)
    wire [15:0] crc_next;

    // Phần MSB của crc_next = crc_reg[7:0] XOR các hằng số tùy theo bit của xor_byte[7:4]
    assign crc_next[15:8] =
        crc_reg[7:0] ^
        (xor_byte[7] ? 8'h10 : 8'h00) ^
        (xor_byte[6] ? 8'h20 : 8'h00) ^
        (xor_byte[5] ? 8'h40 : 8'h00) ^
        (xor_byte[4] ? 8'h80 : 8'h00);

    // Phần LSB của crc_next = kết hợp các bit của xor_byte theo pseudo-code
    assign crc_next[7:0] =
        (xor_byte[3] ? 8'h01 : 8'h00) ^
        (xor_byte[2] ? 8'h02 : 8'h00) ^
        (xor_byte[1] ? 8'h04 : 8'h00) ^
        (xor_byte[0] ? 8'h08 : 8'h00) ^
        (xor_byte[7] ? 8'h10 : 8'h00) ^
        (xor_byte[6] ? 8'h20 : 8'h00) ^
        (xor_byte[5] ? 8'h40 : 8'h00) ^
        (xor_byte[4] ? 8'h80 : 8'h00);

    // Sequential logic: cập nhật crc_reg theo clock, và latch crc_out khi crc_done
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            // Reset bất đối xứng active-low
            crc_reg <= 16'hFFFF; // initial value for CCITT-FALSE
            crc_out <= 16'h0000; // crc_out ban đầu = 0 (chưa latched)
        end else begin
            // crc_start có ưu tiên: nạp lại giá trị khởi tạo
            if (crc_start) begin
                crc_reg <= 16'hFFFF;
            end else if (data_valid) begin
                // Khi có byte hợp lệ, cập nhật crc_reg theo crc_next
                crc_reg <= crc_next;
            end
            // Khi yêu cầu latch kết quả, copy giá trị hiện thời ra crc_out
            if (crc_done) begin
                crc_out <= crc_reg;
            end
        end
    end

endmodule