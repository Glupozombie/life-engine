from __future__ import annotations

import asyncio
import threading
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

app = FastAPI(title="GENESIS telemetry", version="0.1.0")
_snapshot: dict[str, Any] = {"status": "idle", "step": 0, "brain": None, "body": None}
_lock = threading.Lock()


def publish_snapshot(value: dict[str, Any]) -> None:
    global _snapshot
    with _lock:
        _snapshot = value


def current_snapshot() -> dict[str, Any]:
    with _lock:
        return dict(_snapshot)


class TrainRequest(BaseModel):
    task: str = Field(default="stand", pattern="^(stand|walk|run)$")
    total_timesteps: int = Field(default=500_000, ge=1_000, le=50_000_000)
    n_envs: int = Field(default=2, ge=1, le=8)


_training_thread: threading.Thread | None = None
_stop_requested = threading.Event()


@app.get("/api/health")
def health():
    return {"ok": True, "project": "GENESIS", "training": bool(_training_thread and _training_thread.is_alive())}


@app.get("/api/status")
def status():
    return current_snapshot()


@app.post("/api/train")
def start_training(request: TrainRequest):
    global _training_thread
    if _training_thread and _training_thread.is_alive():
        return {"started": False, "reason": "training_already_running"}
    _stop_requested.clear()

    def worker():
        from pathlib import Path
        from stable_baselines3 import PPO
        from stable_baselines3.common.env_util import make_vec_env
        from stable_baselines3.common.monitor import Monitor
        from genesis.callbacks import BrainTelemetryCallback
        from genesis.env import GenesisBipedEnv

        try:
            env = make_vec_env(lambda: Monitor(GenesisBipedEnv(task=request.task)), n_envs=request.n_envs, seed=42)
            model = PPO(
                "MlpPolicy", env, learning_rate=3e-4, n_steps=1024, batch_size=256,
                gamma=0.99, gae_lambda=0.95, clip_range=0.2, ent_coef=0.005,
                verbose=0, tensorboard_log="runs/",
                policy_kwargs={"net_arch": {"pi": [128, 128], "vf": [128, 128]}},
            )
            class StopCallback(BrainTelemetryCallback):
                def _on_step(self):
                    if _stop_requested.is_set():
                        return False
                    return super()._on_step()
            model.learn(total_timesteps=request.total_timesteps, callback=StopCallback())
            Path("checkpoints").mkdir(exist_ok=True)
            model.save(f"checkpoints/genesis-{request.task}")
            publish_snapshot({**current_snapshot(), "status": "stopped" if _stop_requested.is_set() else "completed"})
            env.close()
        except Exception as exc:
            publish_snapshot({"status": "error", "error": str(exc), "step": 0, "brain": None, "body": None})

    _training_thread = threading.Thread(target=worker, daemon=True)
    _training_thread.start()
    publish_snapshot({"status": "starting", "step": 0, "brain": None, "body": None})
    return {"started": True, "task": request.task, "total_timesteps": request.total_timesteps}


@app.post("/api/stop")
def stop_training():
    _stop_requested.set()
    return {"stop_requested": True}


@app.websocket("/ws/telemetry")
async def telemetry_socket(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            await websocket.send_json(current_snapshot())
            await asyncio.sleep(0.1)
    except WebSocketDisconnect:
        return
