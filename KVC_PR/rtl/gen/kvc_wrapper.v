`timescale 1ns/1ps

module feature_map_ram
#(
    parameter integer DEPTH = 131072,
    parameter integer DATA_W = 32
)
(
    input  wire clk,
    input  wire rst_n,

    input  wire                    wr_en,
    input  wire [16:0]             wr_addr,
    input  wire [DATA_W-1:0]      wr_data,

    input  wire                    rd_en,
    input  wire [16:0]             rd_addr,
    output reg  [DATA_W-1:0]      rd_data
);

    reg [DATA_W-1:0] mem [0:DEPTH-1];

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            rd_data <= {DATA_W{1'b0}};
        end
        else begin
            if (wr_en)
                mem[wr_addr] <= wr_data;

            if (rd_en)
                rd_data <= mem[rd_addr];
        end
    end
endmodule


module nms_sink
#(
    parameter integer DATA_W = 32
)
(
    input  wire clk,
    input  wire rst_n,

    input  wire                in_valid,
    input  wire [16:0]         in_addr,
    input  wire [DATA_W-1:0]  in_data,

    output reg                out_valid,
    output reg [16:0]         out_addr,
    output reg [DATA_W-1:0]   out_data
);

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            out_valid <= 1'b0;
            out_addr  <= 17'd0;
            out_data  <= {DATA_W{1'b0}};
        end
        else begin
            out_valid <= in_valid;
            out_addr  <= in_addr;
            out_data  <= in_data;
        end
    end
endmodule


module uart_sink
#(
    parameter integer DATA_W = 32
)
(
    input  wire clk,
    input  wire rst_n,

    input  wire               in_valid,
    input  wire [DATA_W-1:0] in_data,

    output reg               uart_tx_valid,
    output reg [DATA_W-1:0]  uart_tx_word
);

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            uart_tx_valid <= 1'b0;
            uart_tx_word  <= {DATA_W{1'b0}};
        end
        else begin
            uart_tx_valid <= in_valid;
            uart_tx_word  <= in_data;
        end
    end
endmodule


module kvc_wrapper
#(
    parameter integer IN_W  = 640,
    parameter integer IN_H  = 480,
    parameter integer OUT_W = 160,
    parameter integer OUT_H = 160
)
(
    input  wire clk,
    input  wire rst_n,

    // camera input
    input  wire        cam_sof,
    input  wire        cam_valid,
    input  wire [15:0] cam_rgb565,

    // FM read port for downstream consumer / conv
    input  wire        fm_rd_en,
    input  wire [16:0] fm_rd_addr,
    output wire [31:0] fm_rd_data,

    // FM write port from letterbox
    output wire [16:0] fm_wr_addr,
    output wire [31:0] fm_wr_data,
    output wire        fm_wr_en,

    // downstream NMS interface
    output wire        nms_valid,
    output wire [16:0] nms_addr,
    output wire [31:0] nms_data,

    // downstream UART interface
    output wire        uart_valid,
    output wire [31:0] uart_data
);

    wire [7:0] letterbox_data;
    wire [16:0] letterbox_addr;
    wire letterbox_we;
    wire letterbox_done;

    image_letterbox
    #(
        .IN_W     (IN_W),
        .IN_H     (IN_H),
        .OUT_W    (OUT_W),
        .OUT_H    (OUT_H),
        .PAD_COLOR(8'd114)
    ) u_letterbox (
        .clk(clk),
        .rst_n(rst_n),
        .in_pixel(cam_rgb565),
        .in_valid(cam_valid),
        .frame_start(cam_sof),

        .out_data(letterbox_data),
        .out_addr(letterbox_addr),
        .out_we(letterbox_we),
        .out_frame_done(letterbox_done)
    );

    assign fm_wr_en   = letterbox_we;
    assign fm_wr_addr = letterbox_addr;
    assign fm_wr_data = {8'd0, letterbox_data, 8'd0, 8'd0};

    feature_map_ram
    #(
        .DEPTH(131072),
        .DATA_W(32)
    ) u_fm_ram (
        .clk(clk),
        .rst_n(rst_n),

        .wr_en(fm_wr_en),
        .wr_addr(fm_wr_addr),
        .wr_data(fm_wr_data),

        .rd_en(fm_rd_en),
        .rd_addr(fm_rd_addr),
        .rd_data(fm_rd_data)
    );

    nms_sink
    #(
        .DATA_W(32)
    ) u_nms_sink (
        .clk(clk),
        .rst_n(rst_n),

        .in_valid(letterbox_we),
        .in_addr(letterbox_addr),
        .in_data(fm_wr_data),

        .out_valid(nms_valid),
        .out_addr(nms_addr),
        .out_data(nms_data)
    );

    uart_sink
    #(
        .DATA_W(32)
    ) u_uart_sink (
        .clk(clk),
        .rst_n(rst_n),

        .in_valid(letterbox_we),
        .in_data(fm_wr_data),

        .uart_tx_valid(uart_valid),
        .uart_tx_word(uart_data)
    );
endmodule