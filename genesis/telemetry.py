from __future__ import annotations

from typing import Any

import numpy as np
import torch
from torch import nn


def extract_policy_telemetry(model: Any, observation: np.ndarray, include_weights: bool = True) -> dict[str, Any]:
    """Read activations and weights from the exact SB3 actor used for control."""
    policy = model.policy
    obs_tensor, _ = policy.obs_to_tensor(np.asarray(observation, dtype=np.float32))
    with torch.no_grad():
        features = policy.extract_features(obs_tensor)
        x = policy.mlp_extractor.forward_actor(features)
        activations: list[list[float]] = []
        layers: list[dict[str, Any]] = []
        for module in policy.mlp_extractor.policy_net:
            x = module(x)
            if isinstance(module, nn.Tanh):
                values = x[0].detach().cpu().numpy().astype(float)
                activations.append(values.tolist())
                layers.append({"size": int(values.size), "activation": values.tolist()})
        action_mean = policy.action_net(x)[0].detach().cpu().numpy().astype(float)
    result: dict[str, Any] = {
        "layers": layers,
        "output": action_mean.tolist(),
        "layer_sizes": [int(layer["size"]) for layer in layers],
    }
    if include_weights:
        matrices = []
        for module in policy.mlp_extractor.policy_net:
            if isinstance(module, nn.Linear):
                matrices.append(module.weight.detach().cpu().numpy().astype(float).tolist())
        matrices.append(policy.action_net.weight.detach().cpu().numpy().astype(float).tolist())
        result["weights"] = matrices
    return result
