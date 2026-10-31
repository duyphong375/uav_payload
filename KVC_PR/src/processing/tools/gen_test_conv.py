import numpy as np
import os

# 1. Cấu hình bài test (5x5 Input, 3x3 Kernel, Pad=1, Stride=1)
IN_W, IN_H, IN_C = 5, 5, 1
K_SIZE, STRIDE, PAD = 3, 1, 1
OUT_W, OUT_H, OUT_C = 5, 5, 1

# Tạo thư mục chứa file test
os.makedirs('gen/tb_data', exist_ok=True)

# 2. Sinh dữ liệu ngẫu nhiên (INT8: -128 đến 127)
np.random.seed(42) # Cố định seed để kết quả không đổi
in_data = np.random.randint(-10, 10, size=(IN_H, IN_W), dtype=np.int8) # Giới hạn -10..10 cho dễ nhìn
weight  = np.random.randint(-5, 5, size=(K_SIZE, K_SIZE), dtype=np.int8)
bias    = np.random.randint(-5, 5, size=(1,), dtype=np.int32)
quant_multiplier = 1
quant_shift = 0

# 3. Tính toán Golden Output (Mô phỏng PyTorch/Convolution chuẩn)
in_padded = np.pad(in_data, ((PAD, PAD), (PAD, PAD)), mode='constant', constant_values=0)
golden_out = np.zeros((OUT_H, OUT_W), dtype=np.int32)

for y in range(OUT_H):
    for x in range(OUT_W):
        region = in_padded[y*STRIDE : y*STRIDE+K_SIZE, x*STRIDE : x*STRIDE+K_SIZE]
        acc = np.sum(region.astype(np.int32) * weight.astype(np.int32)) + bias[0]
        q = acc 
        if q > 127: q = 127
        elif q < -128: q = -128
        golden_out[y, x] = q

# 4. Xuất ra file .hex (Sửa lỗi Overflow)
def save_hex(filename, data):
    with open(filename, 'w') as f:
        for val in data.flatten():
            if data.dtype == np.int8:
                f.write(f'{int(val) & 0xFF:02x}\n')
            else:
                # Chuyển đổi an toàn sang uint32 để lấy hex 8 chữ số
                u32_val = np.int32(val).view(np.uint32)
                f.write(f'{int(u32_val):08x}\n')

save_hex('gen/tb_data/tb_input.hex', in_data)
save_hex('gen/tb_data/tb_weight.hex', weight)
save_hex('gen/tb_data/tb_bias.hex', bias)
save_hex('gen/tb_data/tb_quant.hex', np.array([quant_multiplier], dtype=np.int32))
save_hex('gen/tb_data/tb_golden.hex', golden_out.astype(np.int8))

print("=== Dữ liệu Input (5x5) ===")
print(in_data)
print("\n=== Trọng số Kernel (3x3) ===")
print(weight)
print("\n=== Kết quả Golden (5x5) ===")
print(golden_out)
print("\nĐã xuất các file .hex vào thư mục gen/tb_data/")