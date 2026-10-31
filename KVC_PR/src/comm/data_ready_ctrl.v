// -----------------------------------------------------------------------------
// Module: data_ready_ctrl.v
// Author: Vững
// Date:   2026-10-15
// Desc:   Điều khiển tín hiệu DATA_READY cho MCU (v2)
// - Thêm input clear_timeout để MCU hoặc hệ thống xóa cờ timeout
// - Dùng packet_done để gate việc assert data_ready: chỉ assert khi đã
//   có frame_valid (pending) và packet_done (đảm bảo gói đã sẵn sàng gửi)
// - Hỗ trợ ACK dạng pulse hoặc giữ high:
//     + Nếu MCU ACK là pulse -> module nhận edge (pulse) và sẽ deassert khi
//       hold_cnt đã hết.
//     + Nếu MCU ACK giữ high -> module sẽ deassert ngay khi hold_cnt == 0.
// - Thêm parameter SIM để rút ngắn số cycle cho mô phỏng nhanh:
//     SIM=0 (default): CYCLES_PER_MS = CLK_FREQ_HZ/1000 (vd 100MHz -> 100000)
//     SIM=1           : CYCLES_PER_MS = 10 (fast sim)
// Interface:
//   input  clk, rst_n
//   input  frame_valid      : pulse 1 clk khi có frame mới (bắt đầu pending)
//   input  packet_done      : pulse 1 clk khi packet đã sẵn sàng (gating)
//   input  mcu_ack          : MCU ACK (pulse hoặc level)
//   input  clear_timeout    : pulse để clear timeout_flag
//   input  [15:0] timeout_ms: timeout cấu hình (ms)
//   output reg data_ready
//   output reg timeout_flag
// -----------------------------------------------------------------------------
`timescale 1ns/1ps
module data_ready_ctrl #(
    parameter integer CLK_FREQ_HZ = 100_000_000, // system clock (default 100MHz)
    parameter integer SIM = 0                    // SIM=1 => fast sim (CYCLES_PER_MS=10)
)(
    input  wire        clk,
    input  wire        rst_n,
    input  wire        frame_valid,
    input  wire        packet_done,
    input  wire        mcu_ack,
    input  wire        clear_timeout,
    input  wire [15:0] timeout_ms,   // ms
    output reg         data_ready,
    output reg         timeout_flag
);

    // CYCLES_PER_MS: nếu SIM=1 dùng giá trị nhỏ để rút ngắn mô phỏng
    localparam integer CYCLES_PER_MS = (SIM == 1) ? 10 : (CLK_FREQ_HZ / 1000);

    // FSM states
    localparam [2:0]
        ST_IDLE  = 3'd0,
        ST_WAIT_PENDING = 3'd1,      // chờ packet_done khi đã có frame pending
        ST_ASSERT_READY = 3'd2,      // assert data_ready và bắt đầu đếm
        ST_WAIT_ACK_OR_TIMEOUT = 3'd3,
        ST_DEASSERT = 3'd4;

    reg [2:0] state;

    // Counters
    reg [63:0] hold_cnt;     // đếm giữ tối thiểu 1 ms
    reg [63:0] timeout_cnt;  // đếm timeout_ms * CYCLES_PER_MS (các chu kỳ)

    // flags
    reg pending_frame;       // set khi frame_valid nhận; cleared khi sử dụng
    reg hold_active;
    reg timeout_active;

    // compute timeout cycles to load
    wire [63:0] timeout_cycles_load;
    assign timeout_cycles_load = (timeout_ms == 16'd0) ? 64'd0 : (timeout_ms * CYCLES_PER_MS);

    // Sequential logic
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            state <= ST_IDLE;
            data_ready <= 1'b0;
            timeout_flag <= 1'b0;
            pending_frame <= 1'b0;
            hold_cnt <= 64'd0;
            timeout_cnt <= 64'd0;
            hold_active <= 1'b0;
            timeout_active <= 1'b0;
        end else begin
            // clear_timeout pulse clears timeout_flag immediately (flexible)
            if (clear_timeout) begin
                timeout_flag <= 1'b0;
            end

            case (state)
                // IDLE: chờ frame_valid pulse để đánh dấu pending_frame
                ST_IDLE: begin
                    data_ready <= 1'b0;
                    hold_active <= 1'b0;
                    timeout_active <= 1'b0;
                    // khi có frame_valid -> mark pending_frame
                    if (frame_valid) begin
                        pending_frame <= 1'b1;
                        state <= ST_WAIT_PENDING;
                    end
                end

                // WAIT_PENDING: chờ packet_done để đảm bảo dữ liệu đã sẵn sàng
                ST_WAIT_PENDING: begin
                    // nếu packet_done arrives và có pending_frame thì assert data_ready
                    if (packet_done && pending_frame) begin
                        // assert data_ready ngay
                        data_ready <= 1'b1;
                        // preload hold counter = at least 1 ms
                        if (CYCLES_PER_MS > 0) hold_cnt <= CYCLES_PER_MS - 1;
                        else hold_cnt <= 64'd0;
                        hold_active <= 1'b1;
                        // preload timeout counter
                        timeout_cnt <= timeout_cycles_load;
                        timeout_active <= 1'b1;
                        timeout_flag <= 1'b0;
                        // clear pending flag as we're processing it
                        pending_frame <= 1'b0;
                        state <= ST_ASSERT_READY;
                    end else begin
                        // remain pending until packet_done arrives
                        // Also allow another frame_valid to re-arm pending_frame (idempotent)
                        if (frame_valid) pending_frame <= 1'b1;
                    end
                end

                // ASSERT_READY: data_ready đã asserted, chuyển sang chờ ack/timeout
                ST_ASSERT_READY: begin
                    state <= ST_WAIT_ACK_OR_TIMEOUT;
                end

                // WAIT_ACK_OR_TIMEOUT: giữ data_ready cao cho đến khi ACK (sau hold) hoặc timeout
                ST_WAIT_ACK_OR_TIMEOUT: begin
                    data_ready <= 1'b1;

                    // decrement hold counter if active
                    if (hold_active) begin
                        if (hold_cnt == 64'd0) begin
                            hold_active <= 1'b0;
                        end else begin
                            hold_cnt <= hold_cnt - 1;
                        end
                    end

                    // decrement timeout counter if active
                    if (timeout_active) begin
                        if (timeout_cnt == 64'd0) begin
                            // timeout xảy ra
                            timeout_active <= 1'b0;
                            timeout_flag <= 1'b1;
                            // move to deassert state
                            state <= ST_DEASSERT;
                        end else begin
                            timeout_cnt <= timeout_cnt - 1;
                        end
                    end

                    // ACK handling:
                    // - Nếu MCU gửi pulse (mcu_ack == 1) và hold đã hết -> deassert
                    // - Nếu MCU giữ high: khi hold hết, điều kiện mcu_ack==1 sẽ true => deassert
                    if ( (mcu_ack == 1'b1) && (hold_active == 1'b0) ) begin
                        // normal ACK path
                        timeout_active <= 1'b0;
                        timeout_flag <= 1'b0;
                        state <= ST_DEASSERT;
                    end
                end

                // DEASSERT: hạ data_ready và quay về IDLE
                ST_DEASSERT: begin
                    data_ready <= 1'b0;
                    // pending_frame remained cleared earlier; ready for next frame
                    state <= ST_IDLE;
                end

                default: state <= ST_IDLE;
            endcase
        end
    end

    // Comments / notes:
    // - pending_frame ensures we don't assert data_ready until packet_done signals
    //   that the packet (frame) is ready to be consumed by MCU.
    // - clear_timeout is a pulse input: when asserted, timeout_flag is cleared.
    // - MCU ACK behavior:
    //     + If MCU issues a pulse (mcu_ack=1 for 1 cycle): module will accept that
    //       as ACK but will only deassert data_ready after the minimum hold period
    //       (hold_cnt) has expired; this prevents losing the EXTI edge if ACK
    //       arrives too early.
    //     + If MCU holds mcu_ack high, module will deassert data_ready immediately
    //       when hold_cnt reaches 0 (i.e., after minimum hold).
    // - timeout_flag remains set after timeout until cleared by clear_timeout or reset.
    // -----------------------------------------------------------------------------

endmodule