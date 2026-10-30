from __future__ import annotations

from stable_baselines3.common.callbacks import BaseCallback

from genesis.telemetry import extract_policy_telemetry
from genesis.server import publish_snapshot


class BrainTelemetryCallback(BaseCallback):
    def __init__(self, interval: int = 8, weights_interval: int = 64, verbose: int = 0):
        super().__init__(verbose)
        self.interval = interval
        self.weights_interval = weights_interval

    def _on_step(self) -> bool:
        if self.n_calls % self.interval:
            return True
        observations = self.locals.get("new_obs")
        if observations is None:
            return True
        include_weights = self.n_calls == self.interval or self.n_calls % self.weights_interval == 0
        brain = extract_policy_telemetry(self.model, observations[0], include_weights)
        try:
            body = self.training_env.env_method("get_render_state")[0]
        except Exception:
            body = None
        publish_snapshot({
            "status": "training",
            "step": int(self.num_timesteps),
            "brain": brain,
            "observation": observations[0].astype(float).tolist(),
            "body": body,
            "metrics": {
                "episode_reward": float(self.locals.get("rewards", [0])[0]),
                "episode_done": bool(self.locals.get("dones", [False])[0]),
            },
        })
        return True
