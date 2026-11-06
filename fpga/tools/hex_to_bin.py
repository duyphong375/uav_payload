with open('gen/weights.hex', 'r') as f:
    hex_lines = f.readlines()
with open('gen/weights.bin', 'wb') as f:
    for line in hex_lines:
        line = line.strip()
        if line:
            f.write(bytes.fromhex(line))