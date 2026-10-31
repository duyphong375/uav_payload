`timescale 1ns/1ps

module tb_image_letterbox_sync;

    localparam integer IN_W  = 8;
    localparam integer IN_H  = 8;
    localparam integer OUT_W = 2;
    localparam integer OUT_H = 2;

    reg clk;
    reg rst_n;

    reg [15:0] in_pixel;
    reg        in_valid;
    reg        frame_start;

    wire [7:0]  out_data;
    wire [16:0] out_addr;
    wire        out_we;
    wire        out_frame_done;

    integer err_count;
    integer x, y;

    image_letterbox
    #(
        .IN_W     (IN_W),
        .IN_H     (IN_H),
        .OUT_W    (OUT_W),
        .OUT_H    (OUT_H),
        .PAD_COLOR(8'd114)
    ) dut (
        .clk(clk),
        .rst_n(rst_n),

        .in_pixel(in_pixel),
        .in_valid(in_valid),
        .frame_start(frame_start),

        .out_data(out_data),
        .out_addr(out_addr),
        .out_we(out_we),
        .out_frame_done(out_frame_done)
    );

    initial begin
        clk = 1'b0;
        forever #5 clk = ~clk;
    end

    task automatic send_frame;
        integer ix, iy;
        begin
            frame_start = 1'b1;
            in_valid = 1'b0;
            in_pixel = 16'd0;
            @(posedge clk);
            frame_start = 1'b0;

            for (iy = 0; iy < IN_H; iy = iy + 1) begin
                for (ix = 0; ix < IN_W; ix = ix + 1) begin
                    if (((ix % 3) == 0) && ((iy % 2) == 0)) begin
                        in_valid = 1'b0;
                        repeat (2) @(posedge clk);
                    end

                    in_valid = 1'b1;
                    in_pixel = 16'hF800; // R=255, G=0, B=0 in RGB565
                    @(posedge clk);
                end
            end

            in_valid = 1'b0;
            repeat (20) @(posedge clk);
        end
    endtask

    initial begin
        err_count = 0;

        rst_n = 1'b0;
        in_pixel = 16'd0;
        in_valid = 1'b0;
        frame_start = 1'b0;

        repeat (5) @(posedge clk);
        rst_n = 1'b1;

        send_frame();

        if (!out_frame_done) begin
            $error("out_frame_done did not assert");
            err_count = err_count + 1;
        end

        if (out_addr > 17'd131071) begin
            $error("out_addr exceeds 17-bit range");
            err_count = err_count + 1;
        end

        if (err_count == 0)
            $display("PASS: tb_image_letterbox_sync passed");
        else
            $display("FAIL: %0d errors", err_count);

        $finish;
    end
endmodule