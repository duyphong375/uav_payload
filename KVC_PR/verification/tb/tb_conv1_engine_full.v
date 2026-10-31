`timescale 1ns/1ps

module tb_conv1_engine_full;

    // ==========================================
    // 1. Khai báo tín hiệu
    // ==========================================
    reg clk;
    reg rst_n;
    reg start;

    // Cấu hình (Khớp với Conv1)
    localparam IN_W = 320;
    localparam IN_H = 320;
    localparam IN_C = 16;
    localparam OUT_W = 160;
    localparam OUT_H = 160;
    localparam OUT_C = 32;
    localparam STRIDE = 2;
    localparam K_SIZE = 3;

    // Tổng số phần tử
    localparam INPUT_SIZE  = IN_W * IN_H * IN_C; // 1,638,400
    localparam WEIGHT_SIZE = OUT_C * IN_C * K_SIZE * K_SIZE; // 4,608
    localparam OUTPUT_SIZE = OUT_W * OUT_H * OUT_C; // 819,200

    // Input Memory Interface
    wire [23:0] input_addr;
    reg  [7:0]  input_data;

    // Weight Memory Interface
    wire [23:0] weight_addr;
    reg  signed [7:0] weight_data;

    // Bias Memory Interface
    wire [9:0]  bias_addr;
    reg  signed [31:0] bias_data;

    // Requant Multiplier Interface
    reg         mult_we;
    reg  [9:0]  mult_addr;
    reg  signed [31:0] mult_data;
    reg  signed [7:0]  zero_out_data;

    // Output Interface
    wire        output_we;
    wire [23:0] output_addr;
    wire [7:0]  output_data;

    wire        busy;
    wire        done;

    // ==========================================
    // 2. Bộ nhớ giả lập (RAM/ROM)
    // ==========================================
    reg [7:0] mem_input  [0:INPUT_SIZE-1];
    reg signed [7:0] mem_weight [0:WEIGHT_SIZE-1];
    reg signed [31:0] mem_bias   [0:OUT_C-1];
    reg signed [31:0] mem_mult   [0:OUT_C-1];

    // Mảng lưu kết quả từ RTL và từ Golden Reference
    reg [7:0] mem_output_rtl [0:OUTPUT_SIZE-1];
    reg [7:0] mem_output_golden [0:OUTPUT_SIZE-1];

    // ==========================================
    // 3. Instance DUT (Device Under Test)
    // ==========================================
    conv1_engine #(
        .IN_W(IN_W), .IN_H(IN_H), .IN_C(IN_C),
        .OUT_W(OUT_W), .OUT_H(OUT_H), .OUT_C(OUT_C),
        .STRIDE(STRIDE), .K_SIZE(K_SIZE),
        .ZERO_POINT_X(8'd1) // Zero-point cho input
    ) dut (
        .clk(clk),
        .rst_n(rst_n),
        .start(start),
        
        .input_addr(input_addr),
        .input_data(input_data),
        
        .weight_addr(weight_addr),
        .weight_data(weight_data),
        
        .bias_addr(bias_addr),
        .bias_data(bias_data),
        
        .mult_we(mult_we),
        .mult_addr(mult_addr),
        .mult_data(mult_data),
        .zero_out_data(zero_out_data),
        
        .output_we(output_we),
        .output_addr(output_addr),
        .output_data(output_data),
        
        .busy(busy),
        .done(done)
    );

    // ==========================================
    // 4. Mô phỏng bộ nhớ (Memory Models)
    // ==========================================
    
    // Đọc Input (Tổ hợp - Asynchronous Read)
    always @(*) begin
        if (input_addr < INPUT_SIZE)
            input_data = mem_input[input_addr];
        else
            input_data = 8'd1; // Padding
    end

    // Đọc Weight (Tổ hợp)
    always @(*) begin
        if (weight_addr < WEIGHT_SIZE)
            weight_data = mem_weight[weight_addr];
        else
            weight_data = 8'd0;
    end

    // Đọc Bias (Đồng bộ - Synchronous Read vì Engine có trạng thái BIAS_WAIT)
    always @(posedge clk) begin
        if (bias_addr < OUT_C)
            bias_data <= mem_bias[bias_addr];
    end

    // Ghi kết quả Output
    always @(posedge clk) begin
        if (output_we && (output_addr < OUTPUT_SIZE)) begin
            mem_output_rtl[output_addr] <= output_data;
        end
    end

    // ==========================================
    // 5. Tạo Clock
    // ==========================================
    initial clk = 0;
    always #5 clk = ~clk;

    // ==========================================
    // 6. Quá trình mô phỏng chính
    // ==========================================
    integer i;
    integer errors;

    initial begin
        // Khởi tạo
        rst_n = 0;
        start = 0;
        mult_we = 0;
        mult_addr = 0;
        mult_data = 0;
        zero_out_data = 8'd123; // Zero-point output của Conv1

        $display("==================================================");
        $display(" LOADING HEX FILES");
        $display("==================================================");
        
        // Nạp dữ liệu
        $readmemh("verification/data/conv1/input_q.hex", mem_input);
        $readmemh("verification/data/conv1/weight_int8.hex", mem_weight);
        $readmemh("verification/data/conv1/bias_int32.hex", mem_bias);
        
        $readmemh("verification/data/conv1/output_q_ort_input_golden.hex", mem_output_golden);
        
        $readmemh("verification/data/conv1/multiplier.hex", mem_mult); 

        // Nếu không có file multiplier.hex, gán giá trị mặc định
        // (Lấy tạm giá trị từ case của Conv1 channel 0)
        /*for (i = 0; i < OUT_C; i = i + 1) begin
            mem_mult[i] = 32'd2129822; 
        end*/
        $readmemh("verification/data/conv1/multiplier.hex", mem_mult); // Bỏ comment nếu có file

        $display("Hex files loaded successfully.");
        $display("==================================================");

        // 1. Nạp Multiplier vào Engine
        $display("Loading Requantization Multipliers into Engine...");
        @(negedge clk);
        for (i = 0; i < OUT_C; i = i + 1) begin
            mult_we = 1;
            mult_addr = i;
            mult_data = mem_mult[i];
            @(negedge clk);
        end
        mult_we = 0;

        // 2. Reset và bắt đầu
        repeat(5) @(negedge clk);
        rst_n = 1;
        repeat(2) @(negedge clk);

        $display("Starting Engine...");
        start = 1;
        @(negedge clk);
        start = 0;

        // 3. Chờ Engine chạy xong
        wait(done == 1);
        $display("Engine Done at time %0t!", $time);
        @(negedge clk);

        // 4. So sánh kết quả
        $display("==================================================");
        $display(" COMPARING RESULTS");
        $display("==================================================");
        
        errors = 0;
        for (i = 0; i < OUTPUT_SIZE; i = i + 1) begin
            // So sánh từng byte (dùng !== để bắt cả lỗi X/Z)
            if (mem_output_rtl[i] !== mem_output_golden[i]) begin
                errors = errors + 1;
                
                // Chỉ in ra 20 lỗi đầu tiên để tránh tràn màn hình
                if (errors <= 20) begin
                    $display("MISMATCH at addr %0d: RTL = %0d, GOLD = %0d", 
                             i, $signed(mem_output_rtl[i]), $signed(mem_output_golden[i]));
                end
            end
        end

        $display("--------------------------------------------------");
        $display("Total outputs checked: %0d", OUTPUT_SIZE);
        $display("Total errors         : %0d", errors);
        
        if (errors == 0)
            $display("PASS: Engine test completed successfully. Output matches golden perfectly.");
        else
            $display("FAIL: Engine test found %0d mismatches.", errors);
        $display("==================================================");

        $finish;
    end

endmodule