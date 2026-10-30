from __future__ import annotations

import argparse
from pathlib import Path

from stable_baselines3 import PPO
from stable_baselines3.common.env_util import make_vec_env
from stable_baselines3.common.monitor import Monitor

from genesis.callbacks import BrainTelemetryCallback
from genesis.env import GenesisBipedEnv


def main() -> None:
    parser = argparse.ArgumentParser(description="Train the GENESIS biped controller.")
    parser.add_argument("--task", choices=("stand", "walk", "run"), default="stand")
    parser.add_argument("--steps", type=int, default=500_000)
    parser.add_argument("--envs", type=int, default=2)
    parser.add_argument("--output", type=Path, default=Path("checkpoints"))
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    env = make_vec_env(lambda: Monitor(GenesisBipedEnv(task=args.task)), n_envs=args.envs, seed=42)
    model = PPO(
        "MlpPolicy", env, learning_rate=3e-4, n_steps=1024, batch_size=256,
        gamma=0.99, gae_lambda=0.95, clip_range=0.2, ent_coef=0.005,
        verbose=1, tensorboard_log="runs/",
        policy_kwargs={"net_arch": {"pi": [128, 128], "vf": [128, 128]}},
    )
    model.learn(total_timesteps=args.steps, callback=BrainTelemetryCallback())
    model.save(args.output / f"genesis-{args.task}")
    env.close()


if __name__ == "__main__":
    main()
