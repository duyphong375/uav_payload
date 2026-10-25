"""Kiem tra ket noi WebSocket toi ESP32 Gateway (Giai doan 1).
Su dung:
    python scripts/check_esp32_ws.py <IP_CUA_ESP32>
Vi du:
    python scripts/check_esp32_ws.py 192.168.1.15
"""

import asyncio
import sys
import time

try:
    import websockets
except ImportError:
    print("[LOI] Chua co thu vien 'websockets'.")
    print("Vui long cai dat bang lenh: pip install websockets")
    sys.exit(1)


async def test_connection(esp32_ip: str):
    ws_url = f"ws://{esp32_ip}:8080/telemetry"
    print(f"\n========================================================")
    print(f"[*] Dang thu ket noi toi ESP32 tai: {ws_url}")
    print(f"[*] Cho phan hoi tu ESP32...")
    print(f"========================================================")

    try:
        async with websockets.connect(ws_url, open_timeout=5.0) as ws:
            print("\n[THANH CONG] >>> DA KET NOI WEBSOCKET VOI ESP32!")
            
            # 1. Cho nhan ban tin chao mung (Handshake) tu ESP32
            welcome_msg = await asyncio.wait_for(ws.recv(), timeout=3.0)
            print(f"[ESP32 -> LAPTOP] Nhan ban tin chao mung:\n    {welcome_msg}")

            # 2. Thu nghiem gui PING de do do tre (Latency / RTT)
            t_start = time.perf_counter()
            await ws.send("PING")
            print(f"\n[LAPTOP -> ESP32] Da gui goi: PING")

            pong_msg = await asyncio.wait_for(ws.recv(), timeout=3.0)
            latency_ms = (time.perf_counter() - t_start) * 1000
            print(f"[ESP32 -> LAPTOP] Nhan phan hoi: {pong_msg}")
            print(f"[*] Do tre mang 2 chieu (RTT): {latency_ms:.2f} ms")

            print("\n========================================================")
            print("[HOAN TAT] KET NOI 2 CHIEU HOAN TOAN THONG SUOT! (100% OK)")
            print("========================================================\n")

    except asyncio.TimeoutError:
        print(f"\n[LOI TIMEOUT] Khong the ket noi toi {ws_url} trong vong 5 giay.")
        print("-> Kiem tra lai xem:")
        print("   1. ESP32 da bat nguon va in ra IP nay chua?")
        print("   2. Laptop da bat dung song Wi-Fi chung voi ESP32 chua?")
        print("   3. Go 'ping {esp32_ip}' xem co phan hoi khong.")
    except Exception as e:
        print(f"\n[THAT BAI] Loi ket noi: {e}")


def main():
    if len(sys.argv) > 1:
        ip = sys.argv[1].strip()
    else:
        ip = input("Nhap dia chi IP cua ESP32 (vi du: 192.168.1.15): ").strip()

    if not ip:
        print("[LOI] Ban chua nhap dia chi IP!")
        return

    # Loai bo ws:// hoac :8080 neu nguoi dung go thua
    ip = ip.replace("ws://", "").split(":")[0].split("/")[0]

    asyncio.run(test_connection(ip))


if __name__ == "__main__":
    main()
