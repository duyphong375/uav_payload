"""Loopback FastAPI MOCK service with owned startup/shutdown tasks."""

import asyncio
import sqlite3
import time
from contextlib import asynccontextmanager

import anyio
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

import logging
import sys
from pathlib import Path

# Cấu hình logging console cho kvc namespace để in log ra terminal rõ ràng
kvc_logger = logging.getLogger("kvc")
kvc_logger.setLevel(logging.INFO)
if not any(isinstance(h, logging.StreamHandler) for h in kvc_logger.handlers):
    _sh = logging.StreamHandler(sys.stdout)
    _sh.setFormatter(logging.Formatter("[%(asctime)s] [%(levelname)s] %(name)s: %(message)s", datefmt="%H:%M:%S"))
    kvc_logger.addHandler(_sh)
    kvc_logger.propagate = False

_BACKEND_DIR = Path(__file__).resolve().parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

try:
    from .config import Settings, _env_bool, _env_str
    from .esp32_ingress import inject_envelope, parse_rf_payload, run_esp32_ingress
    from .mock_source import run_mock
    from .replay_engine import ReplayEngine
    from .schemas import ReplaySeekRequest, ReplaySpeedRequest, ReplayStartRequest
    from .sqlite_logger import SQLiteLogger
    from .state import Hub, MissionStore
except (ImportError, ValueError):
    from config import Settings, _env_bool, _env_str
    from esp32_ingress import inject_envelope, parse_rf_payload, run_esp32_ingress
    from mock_source import run_mock
    from replay_engine import ReplayEngine
    from schemas import ReplaySeekRequest, ReplaySpeedRequest, ReplayStartRequest
    from sqlite_logger import SQLiteLogger
    from state import Hub, MissionStore


async def send_events(websocket, client, hub):
    while True:
        event = await client.queue.get()
        try:
            await asyncio.wait_for(websocket.send_json(event), hub.store.settings.send_timeout_sec)
        except TimeoutError:
            hub.fail(client, timeout=True)
            return
        finally:
            client.queue.task_done()


def create_app(
    settings=Settings(), *, replay_clock=time.monotonic,
    replay_sleeper=asyncio.sleep, hardware=None,
):
    async def stop_mock_source(hub):
        if hub.source_task:
            hub.source_task.cancel()
            await asyncio.gather(hub.source_task, return_exceptions=True)
            hub.source_task = None

    async def start_mock_source(hub):
        if settings.enable_mock and hub.source_task is None:
            hub.source_task = asyncio.create_task(run_mock(hub), name="kvc-mock-source")

    async def wait_logger_commits(hub):
        if not hub.logger:
            return
        deadline = asyncio.get_running_loop().time() + settings.logger_flush_timeout_sec
        while True:
            status = hub.logger.status()
            if status["queue_depth"] == 0 and status["inflight"] == 0:
                return
            if asyncio.get_running_loop().time() >= deadline:
                raise RuntimeError("Logger did not reach a committed boundary before replay")
            await asyncio.sleep(0.01)

    def broadcast_live_reset(hub):
        hub.store = MissionStore(settings)
        snapshot = hub.store.snapshot(hub.diagnostics())
        payload = {key: snapshot[key] for key in (
            "telemetry", "target", "has_target", "hardware_link", "diagnostics",
            "alerts", "camera_position", "bounding_boxes", "replay_metadata",
        )}
        return hub.publish("SNAPSHOT", **payload)

    async def check_session_inactivity(hub: Hub, timeout_sec: float = 60.0) -> bool:
        store = hub.store
        if store.original_source_mode == "REAL" and store.times.get("rx") is not None:
            now = store.now_ms()
            rx_time = store.times["rx"]
            if rx_time is not None and (now - rx_time) >= (timeout_sec * 1000):
                old_session = store.session_id
                hub.rotate_session()
                hub.publish(
                    "ALERT_EVENT",
                    alert={
                        "level": "INFO",
                        "code": "SESSION_AUTO_CLOSED",
                        "message": f"Phiên bay [{old_session}] đã kết thúc sau 60 giây mất tín hiệu và được lưu trữ thành công.",
                    },
                )
                return True
        return False

    async def session_inactivity_watchdog(hub: Hub, timeout_sec: float = 60.0, check_interval_sec: float = 2.0) -> None:
        while True:
            try:
                await asyncio.sleep(check_interval_sec)
                await check_session_inactivity(hub, timeout_sec=timeout_sec)
            except asyncio.CancelledError:
                break
            except Exception:
                pass

    @asynccontextmanager
    async def lifespan(app):
        logger = None
        if settings.storage_dir is not None:
            logger = SQLiteLogger(settings.storage_dir, settings.logger_queue_capacity)
            await asyncio.to_thread(logger.start)
        hub = Hub(MissionStore(settings), logger)
        app.state.hub = hub
        app.state.logger = logger
        replay = None if settings.storage_dir is None else ReplayEngine(
            hub, settings.storage_dir, clock=replay_clock,
            sleeper=replay_sleeper, hardware=hardware,
        )
        app.state.replay = replay
        ingress_task = None
        if settings.enable_esp32_ingress:
            ingress_task = asyncio.create_task(
                run_esp32_ingress(hub, settings.esp32_ws_url), name="kvc-esp32-ingress"
            )
        watchdog_task = asyncio.create_task(
            session_inactivity_watchdog(hub, timeout_sec=60.0), name="session-inactivity-watchdog"
        )
        app.state.check_session_inactivity = check_session_inactivity
        await start_mock_source(hub)
        try:
            yield
        finally:
            if watchdog_task:
                watchdog_task.cancel()
                await asyncio.gather(watchdog_task, return_exceptions=True)
            if ingress_task:
                ingress_task.cancel()
                await asyncio.gather(ingress_task, return_exceptions=True)
            if replay:
                await replay.shutdown()
            await stop_mock_source(hub)
            for client in tuple(hub.clients):
                client.close_code = 1001
                client.stopped.set()
            if logger:
                await asyncio.to_thread(logger.stop, settings.logger_flush_timeout_sec)

    app = FastAPI(title="KVC MOCK GCS", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
        allow_methods=["GET", "POST"], allow_headers=["Accept", "Content-Type"],
    )

    @app.post("/api/ingress/envelope")
    async def ingress_envelope(payload: dict):
        hub = app.state.hub
        await stop_mock_source(hub)
        try:
            parsed = inject_envelope(hub, payload)
            return {"status": "ok", "parsed": parsed}
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.post("/api/ingress/telemetry")
    async def ingress_telemetry(payload: dict):
        hub = app.state.hub
        hub.store.original_source_mode = "REAL"
        await stop_mock_source(hub)
        hub.publish("LINK_STATUS", hardware_link={"status": "CONNECTED", "port": "HTTP_INGRESS"})
        if "telemetry" in payload:
            hub.publish("TELEMETRY_UPDATE", telemetry=payload["telemetry"])
        if "target" in payload:
            has_target = payload.get("has_target", payload["target"] is not None)
            hub.publish("TARGET_UPDATE", has_target=has_target, target=payload["target"])
        return {"status": "ok"}

    @app.get("/api/health")
    async def health():
        hub = app.state.hub
        replay = app.state.replay
        source_healthy = (
            (replay is not None and replay.active)
            or not settings.enable_mock
            or (hub.source_task is not None and not hub.source_task.done())
        )
        logger_healthy = hub.logger is None or hub.logger.status()["status"] == "OK"
        healthy = source_healthy and logger_healthy
        return {"status": "ok" if healthy else "degraded", "service": "kvc-gcs",
                "uptime_sec": hub.store.now_ms() / 1000, "source_mode": hub.store.source_mode}

    @app.get("/api/status")
    async def status():
        result = app.state.hub.status()
        result["replay"] = app.state.replay.status() if app.state.replay else {"active": False}
        return result

    @app.get("/api/state/snapshot")
    async def snapshot():
        hub = app.state.hub
        return hub.store.snapshot(hub.diagnostics())

    @app.get("/api/sessions")
    async def sessions():
        hub = app.state.hub
        return {
            "active_session_id": hub.store.session_id,
            "storage_implemented": hub.logger is not None,
            "sessions": hub.logger.sessions() if hub.logger else [],
        }

    @app.post("/api/sessions/new")
    async def new_session():
        hub = app.state.hub
        if app.state.replay and app.state.replay.active:
            raise HTTPException(status_code=409, detail="Stop replay before creating a live session")
        snapshot = hub.rotate_session()
        return {
            "status": "session_created",
            "new_session_id": snapshot["session_id"],
            "persistence": "PENDING" if hub.logger else "DISABLED",
        }

    def require_replay():
        if app.state.replay is None:
            raise HTTPException(status_code=409, detail="Storage is disabled")
        return app.state.replay

    @app.post("/api/replay/start")
    async def replay_start(request: ReplayStartRequest):
        hub = app.state.hub
        replay = require_replay()
        if replay.active:
            raise HTTPException(status_code=409, detail="Stop the active replay before starting another")
        await stop_mock_source(hub)
        try:
            await wait_logger_commits(hub)
            await replay.start(request.session_id, request.speed)
        except FileNotFoundError as exc:
            await start_mock_source(hub)
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except (ValueError, RuntimeError, sqlite3.Error) as exc:
            await start_mock_source(hub)
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        return {"status": "replay_started", "replay": replay.status()}

    @app.post("/api/replay/pause")
    async def replay_pause():
        replay = require_replay()
        try:
            metadata = await replay.pause()
        except RuntimeError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        return {"status": "replay_paused", "replay": metadata}

    @app.post("/api/replay/resume")
    async def replay_resume():
        replay = require_replay()
        try:
            metadata = await replay.resume()
        except RuntimeError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        return {"status": "replay_resumed", "replay": metadata}

    @app.post("/api/replay/seek")
    async def replay_seek(request: ReplaySeekRequest):
        replay = require_replay()
        try:
            metadata = await replay.seek(request.timestamp_ms)
        except RuntimeError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        return {"status": "seek_ok", "replay": metadata}

    @app.post("/api/replay/speed")
    async def replay_speed(request: ReplaySpeedRequest):
        replay = require_replay()
        try:
            metadata = await replay.set_speed(request.speed)
        except (ValueError, RuntimeError) as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        return {"status": "speed_ok", "replay": metadata}

    @app.post("/api/replay/stop")
    async def replay_stop():
        replay = require_replay()
        if not replay.active:
            raise HTTPException(status_code=409, detail="Replay is not active")
        await replay.stop()
        snapshot = broadcast_live_reset(app.state.hub)
        await start_mock_source(app.state.hub)
        return {
            "status": "replay_stopped",
            "source_mode": snapshot["source_mode"],
            "session_id": snapshot["session_id"],
        }

    @app.get("/api/esp32/status")
    async def esp32_status():
        hub = getattr(app.state, "hub", None)
        link = dict(hub.store.hardware_link) if hub and hasattr(hub.store, "hardware_link") else {}
        is_conn = link.get("status") == "CONNECTED"
        return {
            "status": "CONNECTED" if is_conn else "DISCONNECTED",
            "hardware_link": link,
            "target_url": settings.esp32_ws_url,
            "rx_age_ms": getattr(hub.store, "rx_age_ms", None) if hub else None,
            "message": "Gateway ESP32 đã kết nối thành công qua Wi-Fi WebSocket! Đang chờ gói tin LoRa 433MHz từ MCU Sonix." if is_conn else f"Chưa thể kết nối tới Gateway ESP32 tại {settings.esp32_ws_url}. Hãy kiểm tra IP hoặc nguồn ESP32.",
        }

    @app.post("/api/esp32/connect")
    async def esp32_connect(payload: dict):
        url = payload.get("url")
        if not url:
            raise HTTPException(status_code=400, detail="Missing 'url'")
        settings.esp32_ws_url = url
        hub = app.state.hub
        if hasattr(app.state, "ingress_task") and app.state.ingress_task:
            app.state.ingress_task.cancel()
        app.state.ingress_task = asyncio.create_task(
            run_esp32_ingress(hub, url), name="kvc-esp32-ingress"
        )
        return {"status": "CONNECTING", "url": url}

    @app.post("/api/esp32/command")
    async def esp32_command(payload: dict):
        import websockets
        action = payload.get("action")
        if not action:
            raise HTTPException(status_code=400, detail="Missing 'action'")
        target_url = settings.esp32_ws_url
        try:
            async with websockets.connect(target_url, open_timeout=2.0, close_timeout=1.0) as ws:
                import json
                await ws.send(json.dumps(payload))
                try:
                    reply = await asyncio.wait_for(ws.recv(), timeout=2.0)
                    return {"status": "OK", "action": action, "reply": reply}
                except Exception:
                    return {"status": "OK", "action": action, "reply": "SENT (No direct response)"}
        except Exception as exc:
            return {"status": "FAILED", "action": action, "error": str(exc)}

    @app.websocket("/ws/telemetry")
    async def telemetry(websocket: WebSocket):
        # Browser origins limited to the same loopback development origins.
        origin = websocket.headers.get("origin")
        if origin and origin not in {"http://127.0.0.1:5173", "http://localhost:5173"}:
            await websocket.close(code=1008)
            return
        await websocket.accept()
        hub = app.state.hub
        client = hub.subscribe()

        async def receive():
            # Read-only protocol: no application commands are accepted over WS.
            while True:
                message = await websocket.receive()
                if message["type"] == "websocket.disconnect":
                    return
                if message.get("text") is not None or message.get("bytes") is not None:
                    client.close_code = 1008
                    return

        tasks = [
            asyncio.create_task(send_events(websocket, client, hub), name="kvc-ws-sender"),
            asyncio.create_task(receive(), name="kvc-ws-receiver"),
            asyncio.create_task(client.stopped.wait(), name="kvc-ws-stop"),
        ]
        try:
            done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            for task in done:
                task.result()
        except (WebSocketDisconnect, RuntimeError, OSError, asyncio.CancelledError):
            pass
        finally:
            # ASGI/TestClient may cancel the connection scope during disconnect;
            # cleanup must still await all owned workers.
            with anyio.CancelScope(shield=True):
                for task in tasks:
                    task.cancel()
                await asyncio.gather(*tasks, return_exceptions=True)
                hub.clients.discard(client)
                try:
                    await asyncio.wait_for(websocket.close(code=client.close_code), settings.send_timeout_sec)
                except (WebSocketDisconnect, RuntimeError, OSError, TimeoutError):
                    pass

    return app


app = create_app()

if __name__ == "__main__":
    import argparse
    import sys
    import uvicorn
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass

    parser = argparse.ArgumentParser(description="KVC SAR Ground Station Backend")
    parser.add_argument("--mock", action="store_true", help="Bat bo sinh Mock gia lap (mac dinh la TAT de chay REAL)")
    parser.add_argument("--no-mock", action="store_true", help="Tat bo sinh Mock ngam cua Backend")
    parser.add_argument("--real", action="store_true", help="Chay che do REAL thuan tuy")
    parser.add_argument("--no-esp32", action="store_true", help="Khong ket noi Ingress ESP32")
    parser.add_argument("--esp32-url", type=str, default=None, help="Dia chi WebSocket Gateway ESP32 (vd: ws://192.168.1.15:8080/telemetry)")
    args, _ = parser.parse_known_args()

    # MẶC ĐỊNH HỆ THỐNG: CHẠY REAL THUẦN TÚY (MOCK = OFF, ESP32 INGRESS = ON)
    # Tắt hoàn toàn bộ sinh Mock ngầm; chỉ bật nếu người dùng truyền tường minh --mock
    want_mock = bool(args.mock and not (args.no_mock or args.real))
    enable_mock = True if want_mock else False
    if not enable_mock:
        import os
        os.environ["KVC_ENABLE_MOCK"] = "0"
    enable_esp32 = False if args.no_esp32 else _env_bool("KVC_ENABLE_ESP32", True)
    esp32_url = args.esp32_url or _env_str("KVC_ESP32_WS_URL", "ws://10.136.131.101:8080/telemetry")

    settings_kwargs = {
        "enable_mock": enable_mock,
        "enable_esp32_ingress": enable_esp32,
        "esp32_ws_url": esp32_url,
    }

    runtime_settings = Settings(**settings_kwargs)
    runtime_app = create_app(runtime_settings)

    print("\n=======================================================")
    print("   KVC SAR GCS - BACKEND SERVICE (PORT 8000)          ")
    print("=======================================================")
    print(f"[*] Che do Mock tu sinh : {'BAT (ON)' if runtime_settings.enable_mock else 'TAT (OFF - REAL MODE)'}")
    print(f"[*] Ingress ESP32       : {'BAT (ON)' if runtime_settings.enable_esp32_ingress else 'TAT (OFF)'}")
    if runtime_settings.enable_esp32_ingress:
        print(f"[*] Dia chi ESP32       : {runtime_settings.esp32_ws_url}")
    print(f"[*] Local WebSocket     : ws://{runtime_settings.host}:{runtime_settings.port}/ws/telemetry")
    print("=======================================================\n")

    uvicorn.run(runtime_app, host=runtime_settings.host, port=runtime_settings.port)
