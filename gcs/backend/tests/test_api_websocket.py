"""API/WS tests and opt-in real loopback smoke/30-minute soak harness."""

import asyncio
import json
import socket
import time
from collections import deque

from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
import pytest

from gcs.backend.config import Settings
from gcs.backend.main import create_app, send_events
from gcs.backend.mock_source import target
from gcs.backend.state import Hub, MissionStore


def test_api_two_clients_snapshot_patch_and_reconnect():
    app = create_app(Settings(enable_mock=False, storage_dir=None))
    with TestClient(app) as client:
        assert client.get("/api/health").json()["status"] == "ok"
        assert client.get("/api/status").json()["storage_implemented"] is False
        with client.websocket_connect("/ws/telemetry") as a, client.websocket_connect("/ws/telemetry") as b:
            first_a, first_b = a.receive_json(), b.receive_json()
            assert first_a["event_type"] == first_b["event_type"] == "SNAPSHOT"
            assert first_a["session_id"] == first_b["session_id"]

            async def publish():
                app.state.hub.publish("TARGET_UPDATE", target=target(1), has_target=True)
            client.portal.call(publish)
            assert a.receive_json() == b.receive_json()
        with client.websocket_connect("/ws/telemetry") as reconnected:
            snap = reconnected.receive_json()
            assert snap["event_type"] == "SNAPSHOT"
            assert snap["target"]["class_name"] == "person"
            assert snap["sequence_number"] == 1
            assert snap["target_age_ms"] is not None
            assert snap["target"] == client.get("/api/state/snapshot").json()["target"]
    assert not app.state.hub.clients


def test_lifespan_cancels_source_and_no_owned_workers_survive():
    app = create_app(Settings(mock_interval_sec=.01, storage_dir=None))
    with TestClient(app) as client:
        with client.websocket_connect("/ws/telemetry") as ws:
            assert ws.receive_json()["event_type"] == "SNAPSHOT"
        async def owned():
            await asyncio.sleep(0.05)
            return [t.get_name() for t in asyncio.all_tasks() if t.get_name().startswith("kvc-") and not t.done()]
        assert client.portal.call(owned) == ["kvc-mock-source"]
    assert app.state.hub.source_task is None or app.state.hub.source_task.done()
    assert not app.state.hub.clients


def test_send_timeout_marks_only_client_and_returns():
    async def run():
        hub = Hub(MissionStore(Settings(send_timeout_sec=.01, storage_dir=None)))
        slow, fast = hub.subscribe(), hub.subscribe()
        class SlowSocket:
            async def send_json(self, _event):
                await asyncio.sleep(1)
        await send_events(SlowSocket(), slow, hub)
        assert slow.stopped.is_set() and slow.close_code == 1008
        assert not fast.stopped.is_set()
        assert hub.send_timeouts == 1
        assert hub.client_drops == 1
    asyncio.run(run())


def test_actual_websocket_overflow_closes_1008_without_blocking_peer(monkeypatch):
    first = []
    async def controlled_sender(websocket, subscriber, hub):
        if not first:
            first.append(subscriber)
            await asyncio.Event().wait()  # controlled slow client; cancelled by connection cleanup
        else:
            await send_events(websocket, subscriber, hub)
    monkeypatch.setattr("gcs.backend.main.send_events", controlled_sender)
    app = create_app(Settings(enable_mock=False, queue_capacity=2, storage_dir=None))
    with TestClient(app) as client:
        with client.websocket_connect("/ws/telemetry") as slow, client.websocket_connect("/ws/telemetry") as fast:
            assert fast.receive_json()["event_type"] == "SNAPSHOT"
            async def burst():
                for _ in range(3):
                    app.state.hub.publish("LINK_STATUS", hardware_link={"status": "UNKNOWN"})
                    await asyncio.sleep(.01)
            client.portal.call(burst)
            with pytest.raises(WebSocketDisconnect) as closed:
                slow.receive_json()
            assert closed.value.code == 1008
            assert [fast.receive_json()["event_type"] for _ in range(3)] == ["LINK_STATUS"] * 3
            assert app.state.hub.client_drops == 3
        async def wait_cleanup():
            await asyncio.sleep(0.05)
        client.portal.call(wait_cleanup)
        assert not app.state.hub.clients


async def loopback_run(duration, sample_interval):
    """Same-process Uvicorn + two real TCP WS clients; RSS includes harness overhead."""
    import httpx
    import psutil
    import uvicorn
    from websockets.asyncio.client import connect

    app = create_app(Settings(storage_dir=None))
    listener = socket.socket()
    listener.bind(("127.0.0.1", 0))
    listener.listen(128)
    port = listener.getsockname()[1]
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning"))
    server_task = asyncio.create_task(server.serve(sockets=[listener]))
    connections, readers = [], []
    counts = [0, 0]
    recent = [deque(maxlen=128), deque(maxlen=128)]
    errors = []
    rss_baseline = None
    max_rss = 0
    process = psutil.Process()
    print(json.dumps({"run": "soak" if duration >= 1800 else "smoke", "duration_sec": duration,
                      "rss_scope": "server+two-clients+test-harness", "queue_limit": 64,
                      "rss_limit_mib": 256, "growth_limit_mib": 32}), flush=True)
    try:
        async with asyncio.timeout(10):
            while not server.started:
                if server_task.done():
                    server_task.result()
                await asyncio.sleep(.02)
        url = f"ws://127.0.0.1:{port}/ws/telemetry"
        async def open_client(index):
            ws = await connect(url)
            snapshot = json.loads(await ws.recv())
            assert snapshot["event_type"] == "SNAPSHOT"
            assert snapshot["source_mode"] == "MOCK"
            assert snapshot["inference_device"] == "SIMULATED"
            assert snapshot["hardware_link"]["status"] == "UNKNOWN"
            connections.append(ws)
            async def consume():
                try:
                    async for text in ws:
                        event = json.loads(text)
                        counts[index] += 1
                        recent[index].append((event["sequence_number"], event["event_type"]))
                except asyncio.CancelledError:
                    raise
                except Exception as exc:
                    errors.append(str(exc))
            task = asyncio.create_task(consume())
            return ws, task
        pair = [await open_client(i) for i in range(2)]
        readers.extend(t for _, t in pair)
        start = time.monotonic()
        reconnected = False
        async with httpx.AsyncClient(base_url=f"http://127.0.0.1:{port}") as http:
            assert (await http.get("/api/health")).json()["status"] == "ok"
            assert (await http.get("/api/state/snapshot")).json()["event_type"] == "SNAPSHOT"
            while True:
                elapsed = time.monotonic() - start
                status = (await http.get("/api/status")).json()
                rss = process.memory_info().rss / (1024 * 1024)
                max_rss = max(max_rss, rss)
                if elapsed >= 60 and rss_baseline is None:
                    rss_baseline = rss
                print(json.dumps({"elapsed_sec": round(elapsed, 3), "rss_mib": round(rss, 3),
                                  "counts": counts, "consumer_errors": len(errors), **status}), flush=True)
                assert status["clients"] == 2
                assert status["queue_high_water"] <= 64
                assert max(status["queue_depths"], default=0) <= 64
                assert status["diagnostics"]["client_drops_total"] == 0
                assert status["send_timeouts"] == status["mock_errors"] == 0
                assert status["alerts_count"] <= 50 and status["source_task_running"]
                assert rss < 256
                if rss_baseline is not None:
                    assert rss - rss_baseline <= 32
                assert not errors
                # Compare common sequenced events, ignoring a legitimate reconnect gap.
                common = {seq for seq, _ in recent[0]} & {seq for seq, _ in recent[1]}
                assert [(s, t) for s, t in recent[0] if s in common] == [(s, t) for s, t in recent[1] if s in common]
                if elapsed >= duration / 2 and not reconnected:
                    ws, task = pair[1]
                    await ws.close()
                    await task
                    pair[1] = await open_client(1)
                    readers.append(pair[1][1])
                    reconnected = True
                if elapsed >= duration:
                    break
                await asyncio.sleep(min(sample_interval, duration - elapsed))
        assert counts[0] > 0 and counts[1] > 0 and reconnected
        print(json.dumps({"result": "PASS", "elapsed_sec": time.monotonic() - start,
                          "max_rss_mib": max_rss, "baseline_rss_mib": rss_baseline,
                          "counts": counts}), flush=True)
    finally:
        for ws in connections:
            await ws.close()
        for task in readers:
            task.cancel()
        await asyncio.gather(*readers, return_exceptions=True)
        server.should_exit = True
        shutdown_start = time.monotonic()
        await asyncio.wait_for(server_task, 10)
        listener.close()
        assert app.state.hub.source_task is None
        assert not app.state.hub.clients
        assert not [t for t in asyncio.all_tasks() if t.get_name().startswith("kvc-")]
        print(json.dumps({"shutdown": "PASS", "elapsed_sec": time.monotonic() - shutdown_start}), flush=True)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--soak", action="store_true")
    args = parser.parse_args()
    asyncio.run(loopback_run(1800 if args.soak else 6, 30 if args.soak else 1))
