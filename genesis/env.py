from __future__ import annotations

from pathlib import Path
from typing import Any

import gymnasium as gym
import mujoco
import numpy as np
from gymnasium import spaces


MODEL_PATH = Path(__file__).parent / "model" / "biped.xml"
ACTION_SIZE = 7


class GenesisBipedEnv(gym.Env[np.ndarray, np.ndarray]):
    """A compact planar biped controlled only through neural policy actions."""

    metadata = {"render_modes": []}

    def __init__(
        self,
        task: str = "stand",
        episode_seconds: float = 12.0,
        frame_skip: int = 4,
        seed: int | None = None,
    ) -> None:
        super().__init__()
        if task not in {"stand", "walk", "run"}:
            raise ValueError(f"Unknown task: {task}")
        self.task = task
        self.episode_seconds = episode_seconds
        self.frame_skip = frame_skip
        self.model = mujoco.MjModel.from_xml_path(str(MODEL_PATH))
        self.data = mujoco.MjData(self.model)
        self.dt = self.model.opt.timestep * frame_skip
        self.max_steps = int(episode_seconds / self.dt)
        self.action_space = spaces.Box(-1.0, 1.0, shape=(ACTION_SIZE,), dtype=np.float32)
        # root position (3), root quaternion (4), 7 joint positions,
        # root/joint velocities (13), foot contacts (2), target speed (1).
        self.observation_space = spaces.Box(-np.inf, np.inf, shape=(30,), dtype=np.float32)
        self.target_speed = {"stand": 0.0, "walk": 0.7, "run": 2.0}[task]
        self.steps = 0
        self.previous_x = 0.0
        self._rng = np.random.default_rng(seed)

    def _observation(self) -> np.ndarray:
        qpos = self.data.qpos.copy()
        qvel = self.data.qvel.copy()
        contacts = np.zeros(2, dtype=np.float64)
        for i in range(self.data.ncon):
            geom1 = self.model.geom(self.data.contact[i].geom1).name
            geom2 = self.model.geom(self.data.contact[i].geom2).name
            if "left_foot_geom" in (geom1, geom2):
                contacts[0] = 1.0
            if "right_foot_geom" in (geom1, geom2):
                contacts[1] = 1.0
        # 7 qpos joints + 13 qvel + 7 root qpos + 2 contacts + 1 target = 30
        obs = np.concatenate((qpos[:7], qpos[7:14], qvel[:13], contacts, [self.target_speed]))
        return obs.astype(np.float32)

    def reset(self, *, seed: int | None = None, options: dict[str, Any] | None = None):
        super().reset(seed=seed)
        mujoco.mj_resetData(self.model, self.data)
        self.data.qpos[0:3] = [0.0, 0.0, 0.78]
        # Start mostly prone, with small variation. The policy must recover control.
        angle = float(self.np_random.uniform(1.25, 1.85))
        self.data.qpos[3:7] = [np.cos(angle / 2), 0.0, np.sin(angle / 2), 0.0]
        self.data.qpos[7:14] = self.np_random.normal(0.0, 0.04, 7)
        self.data.qvel[:] = self.np_random.normal(0.0, 0.015, self.model.nv)
        mujoco.mj_forward(self.model, self.data)
        self.steps = 0
        self.previous_x = float(self.data.qpos[0])
        return self._observation(), {}

    def step(self, action: np.ndarray):
        action = np.asarray(action, dtype=np.float32)
        if action.shape != (ACTION_SIZE,):
            raise ValueError(f"Expected action shape {(ACTION_SIZE,)}, got {action.shape}")
        self.data.ctrl[:] = np.clip(action, -1.0, 1.0)
        for _ in range(self.frame_skip):
            mujoco.mj_step(self.model, self.data)
        self.steps += 1

        torso_matrix = self.data.xmat[self.model.body("torso").id].reshape(3, 3)
        upright = float(np.clip(torso_matrix[2, 2], -1.0, 1.0))
        root_x = float(self.data.qpos[0])
        forward_velocity = float(self.data.qvel[0])
        progress = (root_x - self.previous_x) / max(self.dt, 1e-6)
        self.previous_x = root_x
        control_cost = float(np.square(action).mean())
        angular_cost = float(np.square(self.data.qvel[3:]).mean())
        fallen = float(self.data.qpos[2] < 0.42 or upright < 0.15)

        upright_reward = max(0.0, upright)
        if self.task == "stand":
            task_reward = 2.0 * upright_reward - 0.015 * angular_cost
        else:
            speed_error = abs(forward_velocity - self.target_speed)
            task_reward = 1.2 * upright_reward + 0.7 * progress - 0.35 * speed_error
        reward = task_reward - 0.025 * control_cost - 0.002 * angular_cost - 2.0 * fallen
        terminated = bool(fallen)
        truncated = self.steps >= self.max_steps
        info = {
            "upright": upright,
            "forward_velocity": forward_velocity,
            "progress_velocity": progress,
            "control_cost": control_cost,
            "fallen": bool(fallen),
            "task": self.task,
        }
        return self._observation(), float(reward), terminated, truncated, info

    def close(self) -> None:
        pass
