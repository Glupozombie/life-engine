from __future__ import annotations

from pathlib import Path
from typing import Any

import gymnasium as gym
import mujoco
import numpy as np
from gymnasium import spaces


MODEL_PATH = Path(__file__).parent / "model" / "biped.xml"
ACTION_SIZE = 11
OBSERVATION_SIZE = 33


class GenesisBipedEnv(gym.Env[np.ndarray, np.ndarray]):
    """Planar humanoid controlled only through policy-generated joint torques."""

    metadata = {"render_modes": []}

    def __init__(self, task: str = "stand", episode_seconds: float = 12.0, frame_skip: int = 4):
        super().__init__()
        if task not in {"stand", "walk", "run"}:
            raise ValueError(f"Unknown task: {task}")
        self.task = task
        self.frame_skip = frame_skip
        self.model = mujoco.MjModel.from_xml_path(str(MODEL_PATH))
        self.data = mujoco.MjData(self.model)
        self.dt = self.model.opt.timestep * frame_skip
        self.max_steps = int(episode_seconds / self.dt)
        self.action_space = spaces.Box(-1.0, 1.0, shape=(ACTION_SIZE,), dtype=np.float32)
        self.observation_space = spaces.Box(-np.inf, np.inf, shape=(OBSERVATION_SIZE,), dtype=np.float32)
        self.target_speed = {"stand": 0.0, "walk": 0.7, "run": 2.0}[task]
        self.steps = 0
        self.previous_x = 0.0

    def _observation(self) -> np.ndarray:
        qpos = self.data.qpos.copy()  # 3 planar root coordinates + 11 joint angles
        qvel = self.data.qvel.copy()
        contacts = np.zeros(4, dtype=np.float64)
        for i in range(self.data.ncon):
            contact = self.data.contact[i]
            names = (self.model.geom(contact.geom1).name, self.model.geom(contact.geom2).name)
            for index, name in enumerate(("left_foot_geom", "right_foot_geom", "left_hand_geom", "right_hand_geom")):
                if name in names:
                    contacts[index] = 1.0
        return np.concatenate((qpos[:14], qvel[:14], contacts, [self.target_speed])).astype(np.float32)

    def reset(self, *, seed: int | None = None, options: dict[str, Any] | None = None):
        super().reset(seed=seed)
        mujoco.mj_resetData(self.model, self.data)
        angle = float(self.np_random.uniform(1.35, 1.8))
        self.data.qpos[:3] = [0.0, -0.58, angle]
        self.data.qpos[3:14] = self.np_random.normal(0.0, 0.04, 11)
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
        angular_cost = float(np.square(self.data.qvel[2:]).mean())
        fallen = bool(self.data.qpos[1] < -0.68 or (upright < -0.25 and self.steps > 40))

        upright_reward = max(0.0, upright)
        if self.task == "stand":
            task_reward = 2.0 * upright_reward - 0.015 * angular_cost
        else:
            task_reward = 1.2 * upright_reward + 0.7 * progress - 0.35 * abs(forward_velocity - self.target_speed)
        reward = task_reward - 0.025 * control_cost - 0.002 * angular_cost - (2.0 if fallen else 0.0)
        terminated = fallen
        truncated = self.steps >= self.max_steps
        info = {"upright": upright, "forward_velocity": forward_velocity, "progress_velocity": progress,
                "control_cost": control_cost, "fallen": fallen, "task": self.task}
        return self._observation(), float(reward), terminated, truncated, info

    def get_render_state(self) -> dict[str, Any]:
        names = ("pelvis", "torso", "head", "left_thigh", "left_shin", "left_foot",
                 "right_thigh", "right_shin", "right_foot", "left_upper_arm", "left_forearm",
                 "left_hand", "right_upper_arm", "right_forearm", "right_hand")
        points = {}
        for name in names:
            position = self.data.xpos[self.model.body(name).id]
            points[name] = [float(position[0]), float(position[2])]
        return {"points": points, "root_x": float(self.data.qpos[0]),
                "root_z": float(0.78 + self.data.qpos[1]), "pitch": float(self.data.qpos[2]),
                "forward_velocity": float(self.data.qvel[0]),
                "joint_angles": self.data.qpos[3:14].astype(float).tolist()}

    def close(self) -> None:
        pass
