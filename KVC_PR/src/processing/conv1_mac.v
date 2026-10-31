module conv1_mac #(
    parameter integer ACC_W = 32,
    parameter integer ZERO_POINT = 1 // THÊM DÒNG NÀY
) (
    input  wire                    clk,
    input  wire                    rst_n,
    input  wire                    start,
    input  wire signed [31:0]      bias,
    input  wire                    term_valid,
    input  wire        [7:0]       x_u8,
    input  wire signed [7:0]       w_s8,
    input  wire                    term_last,
    output reg  signed [ACC_W-1:0] acc,
    output reg                     busy,
    output reg                     done
);

    wire signed [8:0]  x_centered;
    wire signed [16:0] product;
    wire signed [ACC_W-1:0] product_ext;

    // Sử dụng parameter thay vì hard-code
    assign x_centered = $signed({1'b0, x_u8}) - $signed(ZERO_POINT);
    assign product = x_centered * w_s8;
    assign product_ext = {{(ACC_W-17){product[16]}}, product};

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            acc  <= {ACC_W{1'b0}};
            busy <= 1'b0;
            done <= 1'b0;
        end else begin
            done <= 1'b0;
            if (start && !busy) begin
                acc  <= bias;
                busy <= 1'b1;
            end
            else if (busy && term_valid) begin
                acc <= acc + product_ext;
                if (term_last) begin
                    busy <= 1'b0;
                    done <= 1'b1;
                end
            end
        end
    end
endmodule