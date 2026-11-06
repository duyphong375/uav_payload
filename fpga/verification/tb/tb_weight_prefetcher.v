`timescale 1ns/1ps

module tb_weight_prefetcher;

    localparam integer WORDS = 8;
    localparam integer FLASH_BASE = 32'h0010_0000;

    reg clk;
    reg rst_n;

    reg start;
    reg [31:0] offset_reg;
    reg [31:0] total_words;

    wire spi_req;
    wire [31:0] spi_addr;
    reg [31:0] spi_rdata;
    reg spi_rvalid;

    wire [31:0] weight_word;
    wire weight_valid;
    wire done;

    reg [31:0] flash_mem [0:255];

    weight_prefetcher
    #(
        .FLASH_BASE_OFFSET(FLASH_BASE),
        .WORD_WIDTH(32)
    ) dut (
        .clk(clk),
        .rst_n(rst_n),

        .start(start),
        .offset_reg(offset_reg),
        .total_words(total_words),

        .spi_req(spi_req),
        .spi_addr(spi_addr),
        .spi_rdata(spi_rdata),
        .spi_rvalid(spi_rvalid),

        .weight_word(weight_word),
        .weight_valid(weight_valid),
        .done(done)
    );

    initial begin
        clk = 1'b0;
        forever #5 clk = ~clk;
    end

    task automatic respond_to_flash;
        begin
            spi_rvalid = 1'b1;
            spi_rdata = flash_mem[(spi_addr - FLASH_BASE) >> 2];
            @(posedge clk);
            spi_rvalid = 1'b0;
        end
    endtask

    initial begin
        rst_n = 1'b0;
        start = 1'b0;
        offset_reg = 32'd0;
        total_words = 32'd4;
        spi_rdata = 32'd0;
        spi_rvalid = 1'b0;

        // initialize flash memory with weights
        flash_mem[0] = 32'h0000_0001;
        flash_mem[1] = 32'h0000_0002;
        flash_mem[2] = 32'h0000_0003;
        flash_mem[3] = 32'h0000_0004;
        flash_mem[4] = 32'h0000_0005;

        repeat (5) @(posedge clk);
        rst_n = 1'b1;

        start = 1'b1;
        offset_reg = 32'd0;
        total_words = 32'd4;
        @(posedge clk);

        start = 1'b0;

        // emulate flash response
        repeat (10) begin
            if (spi_req) begin
                respond_to_flash();
            end
            @(posedge clk);
        end

        if (done) begin
            $display("PASS: weight_prefetcher completed");
        end
        else begin
            $error("DONE not asserted");
        end

        $finish;
    end

endmodule