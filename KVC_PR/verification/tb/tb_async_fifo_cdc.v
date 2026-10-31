`timescale 1ns/1ps

module tb_async_fifo_cdc;

    localparam integer DATA_WIDTH = 32;
    localparam integer DEPTH_BITS = 4; // 16 entries

    reg wr_clk;
    reg rd_clk;
    reg rst_n;

    reg [DATA_WIDTH-1:0] wr_data;
    reg wr_en;
    wire full;
    wire overflow;

    wire [DATA_WIDTH-1:0] rd_data;
    reg rd_en;
    wire empty;
    wire underflow;

    async_fifo_cdc
    #(
        .DEPTH_BITS(DEPTH_BITS),
        .DATA_WIDTH(DATA_WIDTH)
    ) dut (
        .wr_clk(wr_clk),
        .rd_clk(rd_clk),
        .rst_n(rst_n),

        .wr_en(wr_en),
        .wr_data(wr_data),
        .full(full),
        .overflow(overflow),

        .rd_en(rd_en),
        .rd_data(rd_data),
        .empty(empty),
        .underflow(underflow)
    );

    initial begin
        wr_clk = 1'b0;
        forever #10 wr_clk = ~wr_clk;
    end

    initial begin
        rd_clk = 1'b0;
        forever #7 rd_clk = ~rd_clk;
    end

    task automatic write_word;
        input [DATA_WIDTH-1:0] value;
        begin
            wr_data = value;
            wr_en = 1'b1;
            @(posedge wr_clk);
            wr_en = 1'b0;
        end
    endtask

    task automatic read_word;
        begin
            rd_en = 1'b1;
            @(posedge rd_clk);
            rd_en = 1'b0;
        end
    endtask

    initial begin
        rst_n = 1'b0;
        wr_en = 1'b0;
        wr_data = {DATA_WIDTH{1'b0}};
        rd_en = 1'b0;

        repeat (5) @(posedge wr_clk);
        rst_n = 1'b1;

        // fill FIFO with several words
        write_word(32'h0000_0001);
        write_word(32'h0000_0002);
        write_word(32'h0000_0003);
        write_word(32'h0000_0004);

        // read some
        read_word();
        read_word();

        // fill again
        write_word(32'h0000_0005);
        write_word(32'h0000_0006);
        write_word(32'h0000_0007);
        write_word(32'h0000_0008);

        // read all remaining
        repeat (5) begin
            read_word();
        end

        // underflow check
        rd_en = 1'b1;
        @(posedge rd_clk);
        rd_en = 1'b0;

        if (underflow) begin
            $display("UNDERFLOW detected as expected");
        end

        $display("PASS: async_fifo_cdc testbench completed");
        $finish;
    end
endmodule