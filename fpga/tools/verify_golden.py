#!/usr/bin/env python3
# verify_golden.py
#
# Read output_q_golden.hex, perform a simple INT8 requantization simulation,
# and compare to the golden values.
#
# Format accepted:
#   0A
#   0x0A
#   7F
#   FF
#
# Expected logic:
#   q = clamp((acc * mult) >> shift + zero_point, -128, 127)

import argparse
import re
import sys

def read_hex_values(path):
    values = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            s = line.strip()
            if not s:
                continue
            s = s.replace("0x", "").replace("0X", "")
            if re.fullmatch(r"[0-9A-Fa-f]+", s):
                values.append(int(s, 16))
    return values

def signed8(x):
    x = x & 0xFF
    if x >= 128:
        return x - 256
    return x

def clamp_i8(x):
    if x > 127:
        return 127
    if x < -128:
        return -128
    return x

def requantize_int8(acc, multiplier=1, shift=7, zero_point=0):
    scaled = ((acc * multiplier) >> shift) + zero_point
    return clamp_i8(scaled)

def main():
    parser = argparse.ArgumentParser(description="Verify output_q_golden.hex")
    parser.add_argument("file", nargs="?", default="output_q_golden.hex")
    parser.add_argument("--multiplier", type=int, default=1)
    parser.add_argument("--shift", type=int, default=7)
    parser.add_argument("--zero-point", type=int, default=0)
    args = parser.parse_args()

    try:
        raw_values = read_hex_values(args.file)
    except FileNotFoundError:
        print("FAIL: file not found: %s" % args.file)
        sys.exit(1)

    if len(raw_values) == 0:
        print("FAIL: no valid values found in %s" % args.file)
        sys.exit(1)

    mismatches = 0
    checked = 0

    for idx, raw in enumerate(raw_values):
        # Reinterpret raw as signed 32-bit accumulator
        acc = raw
        if acc & 0x80000000:
            acc = acc - 0x100000000

        # Typical downstream golden stores signed 8-bit output
        expected = signed8(raw)

        got = requantize_int8(acc, args.multiplier, args.shift, args.zero_point)

        checked += 1
        if got != expected:
            mismatches += 1
            print("MISMATCH idx=%d got=%d expected=%d acc=%d raw=0x%08X" %
                  (idx, got, expected, acc, raw & 0xFFFFFFFF))

    if mismatches == 0:
        print("PASS")
        print("Checked=%d mismatches=%d" % (checked, mismatches))
        return 0
    else:
        print("FAIL")
        print("Checked=%d mismatches=%d" % (checked, mismatches))
        return 1

if __name__ == "__main__":
    sys.exit(main())