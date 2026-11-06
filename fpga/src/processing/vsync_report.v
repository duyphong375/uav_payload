// -----------------------------------------------------------------------------
// Module: vsync_report.v
// Author: KVC Team (Kilo)
// Date:   2026-11-02 (rev 2 — bucket 2x/short + bo loc glitch)
// Desc:   Dong goi snapshot cua `vsync_monitor` thanh danh sach bbox IF-01.
//
// BOI CANH
//   Ban thi nghiem khong co scope. `vsync_monitor` do duoc nhip VSYNC, so frame
//   nguon phat, va so gai nhieu bi chan. Module nay day chung ra UART bang cach
//   TAI SU DUNG khung IF-01 (DIAG_MODE = 2): KHONG them truong, KHONG doi
//   layout, KHONG doi CRC, KHONG doi baud. Chi thay GIA TRI cac truong da co.
//
// ANH XA 12 BBOX (N = 12)
//   Moi bbox 8 byte: X(16) Y(16) W(8) H(8) class(8) conf(8), Little-Endian.
//   `W` mang SO THU TU SLOT de nguoi doc xac nhan thu tu khong bi dao.
//   `class` luon 0xFF (DIAGNOSTIC), `conf` luon 100 - de MCU loc bo khong coi la muc tieu.
//   `H` luon 0.
//
//   slot  X               Y               Y nghia
//   ----  --------------  --------------  ------------------------------------
//     0   w_vsync         w_periods       canh nhan / chu ky do duoc (cua so)
//     1   w_sum_100us     w_min_ms        tong (100 us) / chu ky ngan nhat
//     2   w_max_ms        w_b1x           chu ky dai nhat / bucket 1x
//     3   w_b2x           w_b3x           bucket 2x / 3x
//     4   w_b5x           w_b6x           bucket 5x / 6x
//     5   w_bshort        w_bother        bucket short / other
//     6   w_rejected      t_vsync         gai bi chan (cua so) / TICH LUY canh
//     7   t_frame         t_max_ms        TICH LUY frame / chu ky dai nhat
//     8   t_rejected      t_b1x           TICH LUY gai bi chan / bucket 1x
//     9   t_b2x           t_b3x           TICH LUY bucket 2x / 3x
//    10   t_b5x           t_b6x           TICH LUY bucket 5x / 6x
//    11   t_bshort        t_bother        TICH LUY bucket short / other
//
// CACH DOC
//   --- Cau hoi 1: nhip VSYNC co deu khong? ---
//   Dung ban TICH LUY (slot 7..11) vi cua so 2 s chi co ~10 chu ky.
//   Tong = t_b1x+t_b2x+t_b3x+t_b5x+t_b6x+t_bshort+t_bother PHAI bang
//   so chu ky do duoc (= t_vsync - 1, tru khi bo loc chan canh).
//
//   --- Cau hoi 2: FPGA co rot frame khong? ---
//   t_vsync - t_frame = so canh VSYNC khong sinh ra frame.
//   CHI dung duoc khi `t_rejected` nho: neu bo loc chan nhieu canh thi
//   t_vsync KHONG phai so VSYNC that cua camera, va hieu tren la vo nghia.
//
//   --- Cau hoi 3: duong VSYNC co nhieu khong? ---
//   `t_rejected` = so canh bi bo loc chan (gan hon 10 ms ke tu canh truoc).
//   `t_bshort`   = so chu ky ngan (< 55 ms) LOT QUA bo loc — tuc nhieu day
//                  du moi 10 ms, hoac camera that su phat rat nhanh.
//   Ca hai deu > 0 nghia la duong VSYNC KHONG SACH; moi ket luan ve nhip
//   camera phai kem dieu kien nay.
//
// VI SAO N = 12
//   24 gia tri 16 bit, moi slot chua 2 -> dung 12 slot. `bbox_packetizer` duoc
//   khai bao MAX_BBOX = 12 nen vua khit, khong can doi tham so do.
//   Khung 8 + 12*8 + 2 = 106 byte = 27,6 ms o 38.400 bps, van ngan hon nhieu
//   so voi cua so 2.000 ms.
// -----------------------------------------------------------------------------
`timescale 1ns/1ps

module vsync_report #(
    parameter integer N_SLOT = 12
)(
    input  wire        clk,
    input  wire        rst_n,

    input  wire        snap,

    // cua so
    input  wire [15:0] w_vsync,
    input  wire [15:0] w_periods,
    input  wire [15:0] w_sum_100us,
    input  wire [15:0] w_min_ms,
    input  wire [15:0] w_max_ms,
    input  wire [15:0] w_b1x,
    input  wire [15:0] w_b2x,
    input  wire [15:0] w_b3x,
    input  wire [15:0] w_b5x,
    input  wire [15:0] w_b6x,
    input  wire [15:0] w_bshort,
    input  wire [15:0] w_bother,
    input  wire [15:0] w_rejected,

    // tich luy
    input  wire [15:0] t_vsync,
    input  wire [15:0] t_frame,
    input  wire [15:0] t_max_ms,
    input  wire [15:0] t_rejected,
    input  wire [15:0] t_b1x,
    input  wire [15:0] t_b2x,
    input  wire [15:0] t_b3x,
    input  wire [15:0] t_b5x,
    input  wire [15:0] t_b6x,
    input  wire [15:0] t_bshort,
    input  wire [15:0] t_bother,

    // cung giao dien voi blob/mock de cam thang vao mux cua top
    output reg  [15:0] bbox_x,
    output reg  [15:0] bbox_y,
    output reg  [7:0]  bbox_w,
    output reg  [7:0]  bbox_h,
    output reg  [7:0]  bbox_conf,
    output reg  [7:0]  bbox_class,
    output reg         bbox_valid,
    output reg         bbox_last
);

    localparam [7:0] CLASS_DIAG     = 8'hFF;
    localparam [7:0] CONF_FIXED     = 8'd100;

    reg [3:0]  idx;
    reg        active;

    // `bbox_last` phai di SAU bbox_valid cuoi cung DUNG 1 chu ky. Ly do da ghi
    // trong kvc_blob_detect.v §7: packetizer cap nhat `mem_wr_count` bang
    // non-blocking o chinh chu ky co bbox_valid, nen `start` lay gia tri CU
    // neu den cung chu ky -> send_count = 0 -> mat toan bo khung.
    reg        last_pending;

    // snapshot da chot (khong bi thay doi trong luc dang phat 12 bbox)
    reg [15:0] l_wv, l_wp, l_ws, l_wmin, l_wmax;
    reg [15:0] l_w1, l_w2, l_w3, l_w5, l_w6, l_wsh, l_wot, l_wrj;
    reg [15:0] l_tv, l_tf, l_tmax, l_trj;
    reg [15:0] l_t1, l_t2, l_t3, l_t5, l_t6, l_tsh, l_tot;

    reg [15:0] sel_x, sel_y;

    always @(*) begin
        case (idx)
            4'd0:  begin sel_x = l_wv;   sel_y = l_wp;   end
            4'd1:  begin sel_x = l_ws;   sel_y = l_wmin; end
            4'd2:  begin sel_x = l_wmax; sel_y = l_w1;   end
            4'd3:  begin sel_x = l_w2;   sel_y = l_w3;   end
            4'd4:  begin sel_x = l_w5;   sel_y = l_w6;   end
            4'd5:  begin sel_x = l_wsh;  sel_y = l_wot;  end
            4'd6:  begin sel_x = l_wrj;  sel_y = l_tv;   end
            4'd7:  begin sel_x = l_tf;   sel_y = l_tmax; end
            4'd8:  begin sel_x = l_trj;  sel_y = l_t1;   end
            4'd9:  begin sel_x = l_t2;   sel_y = l_t3;   end
            4'd10: begin sel_x = l_t5;   sel_y = l_t6;   end
            default: begin sel_x = l_tsh; sel_y = l_tot; end
        endcase
    end

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            bbox_x       <= 16'd0;
            bbox_y       <= 16'd0;
            bbox_w       <= 8'd0;
            bbox_h       <= 8'd0;
            bbox_conf    <= CONF_FIXED;
            bbox_class   <= CLASS_DIAG;
            bbox_valid   <= 1'b0;
            bbox_last    <= 1'b0;
            idx          <= 4'd0;
            active       <= 1'b0;
            last_pending <= 1'b0;
            l_wv <= 16'd0;  l_wp <= 16'd0;  l_ws <= 16'd0;
            l_wmin <= 16'd0; l_wmax <= 16'd0;
            l_w1 <= 16'd0;  l_w2 <= 16'd0;  l_w3 <= 16'd0;
            l_w5 <= 16'd0;  l_w6 <= 16'd0;
            l_wsh <= 16'd0; l_wot <= 16'd0; l_wrj <= 16'd0;
            l_tv <= 16'd0;  l_tf <= 16'd0;
            l_tmax <= 16'd0; l_trj <= 16'd0;
            l_t1 <= 16'd0;  l_t2 <= 16'd0;  l_t3 <= 16'd0;
            l_t5 <= 16'd0;  l_t6 <= 16'd0;
            l_tsh <= 16'd0; l_tot <= 16'd0;
        end else begin
            bbox_valid <= 1'b0;
            bbox_last  <= 1'b0;

            if (snap) begin
                l_wv   <= w_vsync;    l_wp  <= w_periods;
                l_ws   <= w_sum_100us; l_wmin <= w_min_ms; l_wmax <= w_max_ms;
                l_w1   <= w_b1x;      l_w2  <= w_b2x;   l_w3 <= w_b3x;
                l_w5   <= w_b5x;      l_w6  <= w_b6x;
                l_wsh  <= w_bshort;   l_wot <= w_bother; l_wrj <= w_rejected;
                l_tv   <= t_vsync;    l_tf  <= t_frame;
                l_tmax <= t_max_ms;   l_trj <= t_rejected;
                l_t1   <= t_b1x;      l_t2  <= t_b2x;   l_t3 <= t_b3x;
                l_t5   <= t_b5x;      l_t6  <= t_b6x;
                l_tsh  <= t_bshort;   l_tot <= t_bother;
                idx        <= 4'd0;
                active     <= 1'b1;
                // Cua so 2.000 ms dai gap ~72 lan thoi gian phat 12 bbox
                // (27,6 ms), nen khong bao gio co bao cao chong bao cao.
            end else if (active && idx < N_SLOT) begin
                bbox_x     <= sel_x;
                bbox_y     <= sel_y;
                bbox_w     <= {4'd0, idx};
                bbox_h     <= 8'd0;
                bbox_conf  <= CONF_FIXED;
                bbox_class <= CLASS_DIAG;
                bbox_valid <= 1'b1;
                idx        <= idx + 4'd1;
                if (idx == N_SLOT - 1) begin
                    active       <= 1'b0;
                    last_pending <= 1'b1;
                end
            end else if (last_pending) begin
                bbox_last    <= 1'b1;
                last_pending <= 1'b0;
            end else begin
                active <= 1'b0;
            end
        end
    end

endmodule
