// -----------------------------------------------------------------------------
// Module: bbox_packetizer.v
// Author: KVC Team
// Date:   2026-10-30 (updated: clean return_state FSM & IF-02 compliance)
// Desc:   Đóng gói danh sách BBox thành khung UART theo chuẩn IF-02 (FPGA -> MCU)
//         Sync 0x5A 0xA5, Header 8B, N x 8B BBox, CRC-16/CCITT-FALSE
// -----------------------------------------------------------------------------
`timescale 1ns/1ps

module bbox_packetizer #(
    parameter integer MAX_BBOX = 20,
    parameter [7:0]   VERSION  = 8'h01
)(
    input  wire        clk,
    input  wire        rst_n,

    // stream input bbox (stored into internal memory)
    input  wire [63:0] bbox_data,
    input  wire        bbox_valid,
    input  wire [7:0]  bbox_count,
    input  wire [31:0] timestamp,
    input  wire        start,
    input  wire        force_bad_crc,

    // UART handshake
    input  wire        uart_tx_busy,
    output reg  [7:0]  uart_tx_data,
    output reg         uart_tx_start,
    output reg         packet_done
);

    // Internal memory for bbox entries
    reg [63:0] mem [0:MAX_BBOX-1];
    reg [7:0]  mem_wr_idx;
    reg [7:0]  mem_wr_count;

    // FSM states
    localparam [3:0]
        S_IDLE          = 4'd0,
        S_PREP          = 4'd1,
        S_SEND_HEADER   = 4'd2,
        S_SEND_BBOX     = 4'd3,
        S_REQUEST_CRC   = 4'd4,
        S_SEND_CRC_H    = 4'd5,
        S_SEND_CRC_L    = 4'd6,
        S_FINISH        = 4'd7,
        S_WAIT_TX_START = 4'd8,
        S_WAIT_TX_END   = 4'd9;

    reg [3:0] state;
    reg [3:0] return_state;

    integer i;

    // Memory write & clear logic
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            mem_wr_idx   <= 8'd0;
            mem_wr_count <= 8'd0;
            for (i = 0; i < MAX_BBOX; i = i + 1) mem[i] <= 64'd0;
        end else begin
            if (state == S_FINISH) begin
                mem_wr_idx   <= 8'd0;
                mem_wr_count <= 8'd0;
            end else if (bbox_valid) begin
                if (mem_wr_idx < MAX_BBOX) begin
                    mem[mem_wr_idx] <= bbox_data;
                    mem_wr_count    <= mem_wr_idx + 8'd1;
                    mem_wr_idx      <= mem_wr_idx + 8'd1;
                end
            end
        end
    end

    // ---------------------------------------------------------------------
    // F-04 (KVC-FPGA-BLOB-20261102-001): CHOT timestamp tai `start`.
    //
    // LOI CU: ts0..ts3 doc TRUC TIEP tu cong `timestamp`, va cong nay la
    // `frame_timestamp` chay tu do trong kvc_top_demo (tang moi 1 ms). Header
    // 8 byte can 8 x 0,26 ms = 2,08 ms de phat, nen counter tang 2 lan trong
    // luc dang doc. Khi co nho (carry) giua hai lan doc, 4 byte ghep lai
    // KHONG ung voi mot moc thoi gian nao — timestamp bi "xe" (torn read).
    //
    // BANG CHUNG DO DUOC: `F02_card_20261102.bin` khung 15 phat
    // ts = 728063 roi khung 16 phat ts = 728004 — LUI 59 ms, CRC van dung
    // (byte dung nhu da phat, loi o nguon). Mot counter don dieu khong the
    // phat ra gia tri nho hon sau gia tri lon hon.
    //
    // SUA: 1 thanh ghi 32 bit chot gia tri tai canh `start`, header doc tu
    // thanh ghi do. Khong doi layout IF-01, khong doi CRC, khong doi baud.
    // ---------------------------------------------------------------------
    reg [31:0] ts_lat;

    // Prepare timestamp bytes (Little-Endian: byte thap truoc) — tu ban chot
    wire [7:0] ts0 = ts_lat[7:0];
    wire [7:0] ts1 = ts_lat[15:8];
    wire [7:0] ts2 = ts_lat[23:16];
    wire [7:0] ts3 = ts_lat[31:24];

    // CRC instance (streaming)
    reg         crc_data_valid;
    reg  [7:0]  crc_data_in;
    reg         crc_start;
    reg         crc_done;
    wire [15:0] crc_out;

    crc16_ccitt crc_inst (
        .clk(clk),
        .rst_n(rst_n),
        .data_in(crc_data_in),
        .data_valid(crc_data_valid),
        .crc_start(crc_start),
        .crc_done(crc_done),
        .crc_out(crc_out)
    );

    // Sending pointers
    reg [15:0] byte_idx;
    reg [7:0]  send_count;
    reg [7:0]  cur_bbox_i;
    reg [3:0]  cur_bbox_byte;
    reg        tx_in_flight;
    reg [15:0] crc_latched;
    reg [15:0] crc_val;

    localparam integer HEADER_LEN = 8;

    function [7:0] clamp_count;
        input [7:0] requested;
        input [7:0] available;
        begin
            if (requested == 8'd0) clamp_count = available;
            else if (requested > available) clamp_count = available;
            else clamp_count = requested;
        end
    endfunction

    function [7:0] get_header_byte;
        input [15:0] idx;
        input [7:0]  cnt;
        begin
            case (idx)
                16'd0: get_header_byte = 8'h5A;
                16'd1: get_header_byte = 8'hA5;
                16'd2: get_header_byte = VERSION;
                16'd3: get_header_byte = cnt;
                16'd4: get_header_byte = ts0;
                16'd5: get_header_byte = ts1;
                16'd6: get_header_byte = ts2;
                16'd7: get_header_byte = ts3;
                default: get_header_byte = 8'h00;
            endcase
        end
    endfunction

    reg [63:0] cur_mem_word;
    reg [7:0]  cur_send_byte;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            state          <= S_IDLE;
            return_state   <= S_IDLE;
            byte_idx       <= 16'd0;
            send_count     <= 8'd0;
            cur_bbox_i     <= 8'd0;
            cur_bbox_byte  <= 4'd0;
            tx_in_flight   <= 1'b0;
            uart_tx_data   <= 8'd0;
            uart_tx_start  <= 1'b0;
            crc_data_valid <= 1'b0;
            crc_data_in    <= 8'd0;
            crc_start      <= 1'b0;
            crc_done       <= 1'b0;
            packet_done    <= 1'b0;
            crc_latched    <= 16'd0;
            ts_lat         <= 32'd0;
        end else begin
            // Single-cycle default pulses
            uart_tx_start  <= 1'b0;
            crc_data_valid <= 1'b0;
            crc_start      <= 1'b0;
            crc_done       <= 1'b0;
            packet_done    <= 1'b0;

            case (state)
                S_IDLE: begin
                    tx_in_flight <= 1'b0;
                    if (start) begin
                        // F-04: chot timestamp TRUOC khi bat dau phat header.
                        // Tu day header 4 byte timestamp doc tu ts_lat, nen
                        // counter chay bao nhieu trong luc phat cung khong anh
                        // huong.
                        ts_lat        <= timestamp;
                        send_count    <= clamp_count(bbox_count, mem_wr_count);
                        crc_start     <= 1'b1;
                        byte_idx      <= 16'd0;
                        cur_bbox_i    <= 8'd0;
                        cur_bbox_byte <= 4'd0;
                        state         <= S_PREP;
                    end
                end

                // Doi 1 chu ky de crc_start duoc crc16_ccitt nhan
                // (truoc day chuyen thang sang S_SEND_HEADER lam mat pulse nay)
                S_PREP: begin
                    state <= S_SEND_HEADER;
                end

                S_SEND_HEADER: begin
                    if (byte_idx < HEADER_LEN) begin
                        if (!tx_in_flight && !uart_tx_busy) begin
                            cur_send_byte   = get_header_byte(byte_idx, send_count);
                            uart_tx_data   <= cur_send_byte;
                            uart_tx_start  <= 1'b1;
                            crc_data_in    <= cur_send_byte;
                            crc_data_valid <= 1'b1;
                            tx_in_flight   <= 1'b1;
                            byte_idx       <= byte_idx + 16'd1;
                            return_state   <= S_SEND_HEADER;
                            state          <= S_WAIT_TX_START;
                        end
                    end else begin
                        if (send_count == 8'd0) begin
                            state <= S_REQUEST_CRC;
                        end else begin
                            cur_bbox_i    <= 8'd0;
                            cur_bbox_byte <= 4'd0;
                            state         <= S_SEND_BBOX;
                        end
                    end
                end

                S_SEND_BBOX: begin
                    if (cur_bbox_i < send_count) begin
                        if (!tx_in_flight && !uart_tx_busy) begin
                            cur_mem_word    = mem[cur_bbox_i];
                            // Little-Endian: byte 0 (LSB) truoc, byte 7 (MSB) sau
                            cur_send_byte   = (cur_mem_word >> (cur_bbox_byte * 8)) & 8'hFF;
                            uart_tx_data   <= cur_send_byte;
                            uart_tx_start  <= 1'b1;
                            crc_data_in    <= cur_send_byte;
                            crc_data_valid <= 1'b1;
                            tx_in_flight   <= 1'b1;

                            if (cur_bbox_byte == 4'd7) begin
                                cur_bbox_byte <= 4'd0;
                                cur_bbox_i    <= cur_bbox_i + 8'd1;
                            end else begin
                                cur_bbox_byte <= cur_bbox_byte + 4'd1;
                            end

                            return_state  <= S_SEND_BBOX;
                            state         <= S_WAIT_TX_START;
                        end
                    end else begin
                        state <= S_REQUEST_CRC;
                    end
                end

                S_REQUEST_CRC: begin
                    crc_done    <= 1'b1;
                    crc_latched <= crc_out;
                    state       <= S_SEND_CRC_H;
                end

                S_SEND_CRC_H: begin
                    if (!tx_in_flight && !uart_tx_busy) begin
                        crc_val        = force_bad_crc ? (crc_latched ^ 16'h0001) : crc_latched;
                        // Little-Endian: byte thap truoc
                        uart_tx_data   <= crc_val[7:0];
                        uart_tx_start  <= 1'b1;
                        tx_in_flight   <= 1'b1;
                        return_state   <= S_SEND_CRC_L;
                        state          <= S_WAIT_TX_START;
                    end
                end

                S_SEND_CRC_L: begin
                    if (!tx_in_flight && !uart_tx_busy) begin
                        crc_val        = force_bad_crc ? (crc_latched ^ 16'h0001) : crc_latched;
                        uart_tx_data   <= crc_val[15:8];
                        uart_tx_start  <= 1'b1;
                        tx_in_flight   <= 1'b1;
                        return_state   <= S_FINISH;
                        state          <= S_WAIT_TX_START;
                    end
                end

                S_WAIT_TX_START: begin
                    if (uart_tx_busy) begin
                        state <= S_WAIT_TX_END;
                    end
                end

                S_WAIT_TX_END: begin
                    if (!uart_tx_busy) begin
                        tx_in_flight <= 1'b0;
                        state        <= return_state;
                    end
                end

                S_FINISH: begin
                    packet_done <= 1'b1;
                    state       <= S_IDLE;
                end

                default: state <= S_IDLE;
            endcase
        end
    end

endmodule
