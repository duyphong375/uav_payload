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
    output reg         done,       // pulse 1 clk when transaction finished
    // KVC-CAM-20261031: ket qua ACK cua transaction vua roi.
    //   ack_error = 1 khi BAT KY byte nao (dev_addr / reg / data) bi NACK.
    // Truoc day FSM van chay tiep du NACK, nen `done` khong noi len duoc
    // dieu gi ve vic sensor co nhan cau hinh hay khong.
    output reg         ack_error
);

    // -------------------------------------------------------------------------
    // Parameter sanity
    // -------------------------------------------------------------------------
    localparam integer HALF = (SCL_DIV >= 2) ? (SCL_DIV/2) : 1;

    /* KVC-CAM-FIX-20261101: khoang nghi toi thieu truoc khi master lai SDA sau
     * pha ACK. Voi SCL_DIV=1000 (100 kHz) -> HALF=500 cycle = 5 us, chia 4
     * duoc 125 cycle = 1,25 us. Du de OV2640 nha bus (tAA thuong < 1 us).
     * Dat toi thieu 16 cycle de an toan ca khi SCL_DIV nho.
     */
    localparam integer SAFE_RELEASE_CYC = (HALF/4 >= 16) ? (HALF/4) : 16;

    // -------------------------------------------------------------------------
    // Vat ly bus — KVC-CAM-FIX-20261101
    //
    // BOI CANH: module OV2640 MINI-200W KHONG co pull-up ngoai tren SCL/SDA.
    // Pull-up noi GW2A ~50 kOhm. Do tren bo 31/10/2026:
    //   SCL = 0,2 V, SDA = 0,9 V  -> bus khong bao gio len muc HIGH.
    //
    // Tinh toan (VIH = 0,7 x 3,3 = 2,31 V):
    //   C_bus = 50 pF -> tau = 2,5 us
    //   SCL_DIV=250 (400 kHz, HALF=1,25 us): V = 1,30 V < VIH  -> FAIL
    //   SCL_DIV=1000 (100 kHz, HALF=5 us):   V = 2,85 V > VIH  -> OK (bien mong)
    //   C_bus = 100 pF (day jumper dai) -> tau = 5 us
    //   SCL_DIV=1000: V = 2,09 V < VIH -> FAIL
    //
    // => Khong the dua vao pull-up noi. Phai chu dong lai ca hai duong.
    //
    // SCL: PUSH-PULL hoan toan. SCCB khong co clock stretching, sensor khong
    //      bao gio keo SCL -> khong co nguy co chong output.
    //
    // SDA: PUSH-PULL co kiem soat. Master lai ca muc 1 va 0, TRU hai cua so
    //      phai tha de slave lai:
    //        1. Bit ACK (sau 8 bit data): slave keo thap de ACK
    //        2. Khong co (SCCB write khong co read phase)
    //      Cua so tha duoc mo o CANH XUONG SCL ngay truoc pha ACK, va dong
    //      lai sau khi SCL da xuong ket thuc pha ACK. Vi vay khong bao gio
    //      master va slave cung lai SDA o muc doi nghich.
    //
    //      Trong cua so tha, SDA la input (Z). Neu slave KHONG keo (NACK),
    //      duong troi len qua pull-up noi -> sau ~6 us vuot VIH. Vi vay phai
    //      SAMPLE ACK o cuoi pha HIGH, khong phai tai suon len.
    // -------------------------------------------------------------------------
    reg scl_low;       // 1 => SCL = 0
    reg sda_low;       // 1 => SDA = 0
    reg sda_release;   // 1 => tha SDA (Z) de slave co the keo ACK

    assign scl = scl_low ? 1'b0 : 1'b1;                 // push-pull
    assign sda = sda_release ? 1'bz :
                 (sda_low   ? 1'b0 : 1'b1);             // push-pull, tru cua so ACK
    wire sda_in = sda;                                  // 1 = khong ai keo

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
            scl_low <= 1'b0;      // SCL = 1 (idle)
            sda_low <= 1'b0;      // SDA = 1
            sda_release <= 1'b1;  // cua so ACK dong
            busy <= 1'b0;
            done <= 1'b0;
            clk_cnt <= 16'd0;
            bit_idx <= 3'd7;
            byte_idx <= 2'd0;
            tx_byte <= 8'h00;
            lat_reg_addr <= 16'h0000;
            lat_reg_data <= 8'h00;
            ack_sampled <= 4'b1111;
            ack_error <= 1'b0;
        end else begin
            // default done low
            done <= 1'b0;

            case (state)
                ST_IDLE: begin
                    scl_low <= 1'b0;      // SCL = 1
                    sda_low <= 1'b0;      // SDA = 1
                    sda_release <= 1'b0;  // master lai SDA = 1
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
                        ack_error <= 1'b0;
                        state <= ST_START;
                    end
                end

                ST_START: begin
                    // START: SDA xuong thap trong khi SCL = 1
                    scl_low <= 1'b0;      // SCL = 1
                    sda_release <= 1'b0;
                    sda_low <= 1'b1;      // SDA = 0
                    if (clk_cnt < HALF) begin
                        clk_cnt <= clk_cnt + 16'd1;
                    end else begin
                        clk_cnt <= 16'd0;
                        scl_low <= 1'b1;  // SCL = 0
                        state <= ST_SEND_BIT;
                    end
                end

                ST_SEND_BIT: begin
                    // SCL = 0, lai SDA theo bit
                    scl_low <= 1'b1;      // SCL = 0
                    sda_release <= 1'b0;  // master lai SDA
                    sda_low <= ~tx_byte[bit_idx];
                    clk_cnt <= 16'd0;
                    state <= ST_SCL_HIGH;
                end

                ST_SCL_HIGH: begin
                    // SCL 0 -> 1 -> 0
                    if (clk_cnt < HALF) begin
                        clk_cnt <= clk_cnt + 16'd1;
                        scl_low <= 1'b1;  // SCL = 0
                    end else if (clk_cnt < (HALF + HALF)) begin
                        scl_low <= 1'b0;  // SCL = 1
                        clk_cnt <= clk_cnt + 16'd1;
                    end else begin
                        clk_cnt <= 16'd0;
                        scl_low <= 1'b1;  // SCL = 0
                        if (bit_idx == 3'd0) begin
                            // Het 8 bit data -> vao pha ACK.
                            // Mo cua so tha SDA NGAY khi SCL con thap, de slave
                            // co the keo thap truoc suon len ACK, khong chong
                            // voi master dang lai.
                            sda_release <= 1'b1;
                            sda_low <= 1'b1;  // gia tri khong quan trong khi Z
                            state <= ST_ACK;
                        end else begin
                            bit_idx <= bit_idx - 3'd1;
                            state <= ST_SEND_BIT;
                        end
                    end
                end

                ST_ACK: begin
                    if (clk_cnt < HALF) begin
                        clk_cnt <= clk_cnt + 16'd1;
                        scl_low <= 1'b1;      // SCL = 0
                        sda_release <= 1'b1;  // slave giu quyen lai SDA
                    end else if (clk_cnt < (HALF + HALF)) begin
                        scl_low <= 1'b0;      // SCL = 1
                        /* KVC-CAM-FIX-20261101 (P0): sample tai CUOI pha SCL HIGH.
                         *
                         * LOI CU: sample tai `clk_cnt == HALF`, tuc la DUNG chu ky
                         * SCL vua chuyen tu LOW len HIGH.
                         *
                         * VI SAO CUOI PHA (khong phai giua pha):
                         * Truoc bit ACK, master tha SDA o suon XUONG bat dau pha ACK
                         * (xem ST_SCL_HIGH: sda_release <= 1 khi bit_idx == 0).
                         * Tu luc do den diem sample, SDA co thoi gian:
                         *     t = HALF (pha SCL low) + h (vi tri trong pha HIGH)
                         * Neu sample o CUOI pha HIGH thi t = 2*HALF = ca mot chu ky SCL.
                         *
                         * Voi SCL_DIV = 1000 (100 kHz) -> t = 10 us, tau = 5 us
                         * (pull-up noi ~50 kOhm, C_bus 100 pF):
                         *     V = 3,3 x (1 - e^-2) = 2,85 V > VIH (2,31 V)  -> OK
                         * Neu sample o GIUA pha (t = 7,5 us):
                         *     V = 3,3 x (1 - e^-1,5) = 2,56 V               -> OK nhung bien mong
                         * Neu sample tai SUON LEN (t = 5 us, loi cu):
                         *     V = 3,3 x (1 - e^-1) = 2,09 V < VIH           -> DOC SAI = 0
                         *
                         * He qua cua loi cu: SDA duoc doc la 0 trong MOI truong hop,
                         * nen `ack_error` LUON = 0 du sensor co tra loi hay khong.
                         * Day chinh la ly do `cfg_done` luon len tren bo.
                         *
                         * Sample tai (2*HALF - 2) de con 2 chu ky truoc khi SCL xuong
                         * (slave nha SDA ngay sau suon xuong, khong duoc sample luc do).
                         */
                        if (clk_cnt == (HALF + HALF - 2)) begin
                            ack_sampled[byte_idx] <= sda_in;
                        end
                        clk_cnt <= clk_cnt + 16'd1;
                    end else begin
                        clk_cnt <= 16'd0;
                        scl_low <= 1'b1;      // SCL = 0
                        sda_release <= 1'b0;  // dong cua so ACK: master lai SDA
                        sda_low <= 1'b1;      // SDA = 0 cho bit ke tiep / STOP prep
                        state <= ST_NEXT_BYTE;
                    end
                end

                ST_NEXT_BYTE: begin
                    /* KVC-CAM-FIX-20261101 (P0): giu SDA o Z trong pha SCL LOW
                     * truoc khi master lai, de tranh chap bus.
                     *
                     * BOI CANH: sau khi ACK ket thuc, SCL xuong va slave nha SDA.
                     * Neu master lai SDA = 1 ngay (2 chu ky sau, ~20 ns), trong khi
                     * slave chua kip nha (propagation delay + dien dung bus), hai
                     * driver cung lai muc doi nghich -> dong dong lon qua 2 output.
                     *
                     * I2C chuan giai quyet bang open-drain nen khong bao gio xay ra.
                     * O day ta dung push-pull (bat buoc vi khong co pull-up ngoai),
                     * nen phai tu bao dam khoang nghi.
                     *
                     * Giai phap: dem mot khoang an toan (HALF/4 = 1,25 us o
                     * SCL_DIV=1000) TRUOC khi chuyen sang ST_SEND_BIT. Trong khoang
                     * do SCL = 0 va SDA = Z, du cho slave nha bus (tAA cua OV2640
                     * thuong < 1 us).
                     *
                     * SDA van Z trong giai doan nay: `sda_release` giu 1.
                     */
                    if (clk_cnt < SAFE_RELEASE_CYC) begin
                        clk_cnt <= clk_cnt + 16'd1;
                        sda_release <= 1'b1;  // van tha SDA
                        // scl_low khong doi -> van 0
                    end else begin
                        clk_cnt <= 16'd0;
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
                end

                ST_STOP_PREP: begin
                    sda_release <= 1'b0;
                    sda_low <= 1'b1;  // SDA = 0
                    scl_low <= 1'b1;  // SCL = 0
                    clk_cnt <= 16'd0;
                    state <= ST_STOP_RELEASE;
                end

                ST_STOP_RELEASE: begin
                    if (clk_cnt < HALF) begin
                        clk_cnt <= clk_cnt + 16'd1;
                        scl_low <= 1'b1;  // SCL = 0
                    end else if (clk_cnt < (HALF + HALF)) begin
                        scl_low <= 1'b0;  // SCL = 1
                        clk_cnt <= clk_cnt + 16'd1;
                    end else begin
                        sda_low <= 1'b0;  // SDA = 1 trong khi SCL = 1 -> STOP
                        clk_cnt <= 16'd0;
                        state <= ST_DONE;
                    end
                end

                ST_DONE: begin
                    busy <= 1'b0;
                    done <= 1'b1;
                    /* KVC-CAM-20261031: tinh ack_error tu cac byte DA GUI.
                     *
                     * Chi xet cac byte thuc su duoc phat di:
                     *   byte_idx = 0 -> dev_addr
                     *   byte_idx = 1 -> reg_addr hi (chi khi ADDR_BYTES == 2)
                     *   byte_idx = 2 -> reg_addr lo (hoac reg_addr khi ADDR_BYTES==1)
                     *   byte_idx = 3 -> data
                     * Cac slot khong dung giu gia tri 1 (mac dinh), nen KHONG
                     * duoc dem chung la NACK.
                     *
                     * ack_sampled = 0 nghia la SDA thap trong bit ACK = ACK.
                     */
                    if (ack_sampled[0] != 1'b0) begin
                        ack_error <= 1'b1;          // dev_addr NACK
                    end else if (ADDR_BYTES == 1) begin
                        ack_error <= (ack_sampled[2] != 1'b0) ||
                                     (ack_sampled[3] != 1'b0);
                    end else begin
                        ack_error <= (ack_sampled[1] != 1'b0) ||
                                     (ack_sampled[2] != 1'b0) ||
                                     (ack_sampled[3] != 1'b0);
                    end
                    scl_low <= 1'b0;      // SCL = 1 (idle)
                    sda_low <= 1'b0;      // SDA = 1
                    sda_release <= 1'b0;  // master lai SDA = 1
                    state <= ST_IDLE;
                end

                default: state <= ST_IDLE;
            endcase
        end
    end

endmodule