#!/usr/bin/env python3
"""Generate a 256-entry INT8 SiLU LUT for a specific quantized tensor domain.
The RTL indexes the file by raw input byte (00..FF). Outputs are raw INT8/UINT8 bytes.
"""
import argparse
import math
from pathlib import Path


def signed8(raw: int) -> int:
    return raw - 256 if raw >= 128 else raw


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--input-scale', type=float, required=True)
    ap.add_argument('--input-zero-point', type=int, default=0)
    ap.add_argument('--output-scale', type=float, required=True)
    ap.add_argument('--output-zero-point', type=int, default=0)
    ap.add_argument('--input-unsigned', action='store_true', help='interpret input byte as 0..255')
    ap.add_argument('--output-unsigned', action='store_true', help='saturate output to 0..255')
    ap.add_argument('--output', default='silu_lut.hex')
    args = ap.parse_args()
    if args.input_scale <= 0 or args.output_scale <= 0:
        raise SystemExit('scales must be positive')
    vals=[]
    for raw in range(256):
        qx = raw if args.input_unsigned else signed8(raw)
        x = (qx - args.input_zero_point) * args.input_scale
        # Numerically stable SiLU for this small input domain.
        y = x / (1.0 + math.exp(-max(-80.0, min(80.0, x))))
        qy = round(y / args.output_scale) + args.output_zero_point  # Python round = ties-to-even
        qy = max(0, min(255, qy)) if args.output_unsigned else max(-128, min(127, qy))
        vals.append(qy & 0xFF)
    out=Path(args.output)
    out.write_text(''.join(f'{v:02X}\n' for v in vals), encoding='ascii')
    print(f'Wrote {out} with 256 entries; input scale={args.input_scale}, output scale={args.output_scale}')
    print('Only use this table for the exact input/output scales and zero points passed on the command line.')

if __name__ == '__main__':
    main()
