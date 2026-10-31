`timescale 1ns/1ps

module spi_flash_wrapper
(
    input  wire        clk,
    input  wire        rst_n,

    input  wire        req,
    input  wire [23:0] addr,
    output reg  [31:0] rdata,
    output reg         rvalid,

    output wire        spi_cs,
    output wire        spi_sclk,
    output wire        spi_mosi,
    input  wire        spi_miso
);

    reg        tx_en;
    reg [2:0]  tx_addr;
    reg [7:0]  tx_data;
    reg        rx_en;
    reg [2:0]  rx_addr;
    wire [7:0] rx_data;
    wire       spi_int;
    
    wire [0:0] ss_n_master;
    wire       sclk_master;
    wire       mosi_master;
    wire       dummy_miso_slave; // Giải quyết cảnh báo EX0211

    SPI_MASTER_Top u_spi_master (
        .I_CLK      (clk),
        .I_RESETN   (rst_n),

        .I_TX_EN    (tx_en),
        .I_WADDR    (tx_addr),
        .I_WDATA    (tx_data),

        .I_RX_EN    (rx_en),
        .I_RADDR    (rx_addr),
        .O_RDATA    (rx_data),

        .O_SPI_INT  (spi_int),

        .MISO_MASTER(spi_miso),
        .MOSI_MASTER(mosi_master),
        .SS_N_MASTER(ss_n_master),
        .SCLK_MASTER(sclk_master),

        .MISO_SLAVE (dummy_miso_slave),
        .MOSI_SLAVE (1'b0),
        .SS_N_SLAVE (1'b0),
        .SCLK_SLAVE (1'b0)
    );

    assign spi_cs   = ss_n_master[0];
    assign spi_sclk = sclk_master;
    assign spi_mosi = mosi_master;

    localparam ST_IDLE  = 3'd0;
    localparam ST_CMD   = 3'd1;
    localparam ST_ADDR0 = 3'd2;
    localparam ST_ADDR1 = 3'd3;
    localparam ST_ADDR2 = 3'd4;
    localparam ST_WAIT_RX = 3'd5; 
    localparam ST_DONE  = 3'd6;

    reg [2:0]  state;
    reg [23:0] addr_latch;
    reg [31:0] word_buf;
    reg [2:0]  byte_cnt;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            state <= ST_IDLE;
            tx_en <= 1'b0;
            tx_addr <= 3'd0;
            tx_data <= 8'd0;
            rx_en <= 1'b0;
            rx_addr <= 3'd0;
            addr_latch <= 24'd0;
            word_buf <= 32'd0;
            byte_cnt <= 3'd0;
            rdata <= 32'd0;
            rvalid <= 1'b0;
        end
        else begin
            tx_en <= 1'b0;
            rx_en <= 1'b0;
            rvalid <= 1'b0;

            case (state)
                ST_IDLE: begin
                    if (req) begin
                        addr_latch <= addr;
                        byte_cnt <= 3'd0;
                        word_buf <= 32'd0;
                        state <= ST_CMD;
                    end
                end

                ST_CMD: begin
                    tx_addr <= 3'd0;
                    tx_data <= 8'h03; // Read Command
                    tx_en   <= 1'b1;
                    state   <= ST_ADDR0;
                end

                ST_ADDR0: begin
                    tx_addr <= 3'd0;
                    tx_data <= addr_latch[23:16];
                    tx_en   <= 1'b1;
                    state   <= ST_ADDR1;
                end

                ST_ADDR1: begin
                    tx_addr <= 3'd0;
                    tx_data <= addr_latch[15:8];
                    tx_en   <= 1'b1;
                    state   <= ST_ADDR2;
                end

                ST_ADDR2: begin
                    tx_addr <= 3'd0;
                    tx_data <= addr_latch[7:0];
                    tx_en   <= 1'b1;
                    state   <= ST_WAIT_RX;
                end

                ST_WAIT_RX: begin
                    rx_addr <= 3'd0;
                    rx_en   <= 1'b1;
                    
                    if (spi_int) begin 
                        if (byte_cnt == 3'd0) begin
                            word_buf[7:0] <= rx_data;
                            byte_cnt <= 3'd1;
                            state <= ST_WAIT_RX;
                        end
                        else if (byte_cnt == 3'd1) begin
                            word_buf[15:8] <= rx_data;
                            byte_cnt <= 3'd2;
                            state <= ST_WAIT_RX;
                        end
                        else if (byte_cnt == 3'd2) begin
                            word_buf[23:16] <= rx_data;
                            byte_cnt <= 3'd3;
                            state <= ST_WAIT_RX;
                        end
                        else if (byte_cnt == 3'd3) begin
                            word_buf[31:24] <= rx_data;
                            rdata <= word_buf;
                            rvalid <= 1'b1;
                            state <= ST_DONE;
                        end
                    end
                end

                ST_DONE: begin
                    state <= ST_IDLE;
                end

                default: state <= ST_IDLE;
            endcase
        end
    end
endmodule