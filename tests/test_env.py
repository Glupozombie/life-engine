import numpy as np

from genesis.env import GenesisBipedEnv


def test_environment_observation_and_action_shapes():
    env = GenesisBipedEnv(task="stand")
    obs, info = env.reset(seed=7)
    assert obs.shape == env.observation_space.shape
    assert obs.dtype == np.float32
    next_obs, reward, terminated, truncated, info = env.step(np.zeros(7, dtype=np.float32))
    assert next_obs.shape == obs.shape
    assert np.isfinite(reward)
    assert isinstance(terminated, bool)
    assert isinstance(truncated, bool)
    env.close()


def test_reset_is_reproducible():
    env = GenesisBipedEnv(task="stand")
    first, _ = env.reset(seed=123)
    second, _ = env.reset(seed=123)
    np.testing.assert_allclose(first, second)
    env.close()
