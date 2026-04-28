"""
RL Agent Module — Tabular Q-learning for voting-method selection.

The agent does NOT choose "stay" or "swerve" directly.
Instead it learns which *voting method* (Nash or Variance) produces
better credence-weighted moral outcomes across scenario types.

State space (discrete tuple, ~18 states):
    (n_pedestrians_bucket, n_passengers_bucket, traffic_light, dominant_theory)

    n_*_bucket:       0 = 1 char, 1 = 2–3 chars, 2 = 4–5 chars
    traffic_light:    0 = Red,  1 = Green
    dominant_theory:  0 = deontological, 1 = utilitarian, 2 = equal

Action space:
    0 = "nash"
    1 = "variance"

Reward:
    credence-weighted Q-value of the action chosen by the selected
    voting method:
        r = C_d * Q_d(action) + C_u * Q_u(action)
    ranges from −1 (both theories oppose action) to +1 (both support it).
"""

import json
import math
import random
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Tuple

from modules.voting import compute_q_values

VOTING_ACTIONS = ["nash", "variance"]
_Q_VALUES = compute_q_values()


class MoralRLAgent:
    """
    Tabular ε-greedy Q-learning agent that selects a voting method.

    The Q-table maps (state_tuple, voting_method_idx) → expected reward.
    """

    def __init__(
        self,
        alpha: float = 0.1,
        gamma: float = 0.9,
        epsilon: float = 0.3,
        epsilon_min: float = 0.05,
        epsilon_decay: float = 0.995,
    ):
        """
        Initialise the agent.

        Args:
            alpha:         Learning rate (0, 1]
            gamma:         Discount factor [0, 1]
            epsilon:       Initial exploration rate [0, 1]
            epsilon_min:   Minimum exploration rate
            epsilon_decay: Multiplicative decay applied per episode
        """
        self.alpha = alpha
        self.gamma = gamma
        self.epsilon = epsilon
        self.epsilon_min = epsilon_min
        self.epsilon_decay = epsilon_decay

        # Q-table: state tuple → [Q(nash), Q(variance)]
        self.q_table: Dict[Tuple, List[float]] = defaultdict(lambda: [0.0, 0.0])

        self._episode_count = 0
        self._total_reward = 0.0

    # ------------------------------------------------------------------
    # State encoding
    # ------------------------------------------------------------------

    @staticmethod
    def _bucket(n: int) -> int:
        """Discretise character count into 3 buckets: 0, 1, 2."""
        if n <= 1:
            return 0
        elif n <= 3:
            return 1
        else:
            return 2

    def encode_state(self, scenario: Dict, credences: Dict[str, float]) -> Tuple:
        """
        Encode scenario + credences into a discrete state tuple.

        Args:
            scenario:  scenario dict (passengers, pedestrians, traffic_light, …)
            credences: {"deontological": C_d, "utilitarian": C_u}

        Returns:
            (n_ped_bucket, n_pass_bucket, traffic_light_int, dominant_theory_int)
        """
        n_ped = len(scenario.get("pedestrians", []))
        n_pass = len(scenario.get("passengers", []))
        tl = 1 if scenario.get("traffic_light", "Red") == "Green" else 0

        c_d = credences.get("deontological", 0.5)
        c_u = credences.get("utilitarian", 0.5)
        diff = abs(c_d - c_u)
        if diff < 0.1:
            dominant = 2  # equal
        elif c_d > c_u:
            dominant = 0  # deontological
        else:
            dominant = 1  # utilitarian

        return (
            self._bucket(n_ped),
            self._bucket(n_pass),
            tl,
            dominant,
        )

    # ------------------------------------------------------------------
    # Action selection
    # ------------------------------------------------------------------

    def choose_voting_method(self, state: Tuple) -> str:
        """
        ε-greedy action selection.

        Args:
            state: Encoded state tuple

        Returns:
            "nash" or "variance"
        """
        if random.random() < self.epsilon:
            return random.choice(VOTING_ACTIONS)
        q = self.q_table[state]
        idx = q.index(max(q))
        return VOTING_ACTIONS[idx]

    # ------------------------------------------------------------------
    # Reward
    # ------------------------------------------------------------------

    @staticmethod
    def compute_moral_reward(action_taken: str, credences: Dict[str, float]) -> float:
        """
        Credence-weighted Q-value of the action chosen by the voting method.

        r = C_d * Q_d(action) + C_u * Q_u(action)

        Range: [−1, +1]

        Args:
            action_taken: "stay" or "swerve"
            credences:    {"deontological": C_d, "utilitarian": C_u}

        Returns:
            Moral reward float
        """
        c_d = credences.get("deontological", 0.5)
        c_u = credences.get("utilitarian", 0.5)
        r = (
            c_d * _Q_VALUES["deontological"][action_taken]
            + c_u * _Q_VALUES["utilitarian"][action_taken]
        )
        return round(r, 6)

    # ------------------------------------------------------------------
    # Learning
    # ------------------------------------------------------------------

    def update(
        self,
        state: Tuple,
        method_idx: int,
        reward: float,
        next_state: Tuple,
    ) -> None:
        """
        Standard Q-update:
            Q(s,a) ← Q(s,a) + α * [r + γ * max_a' Q(s',a') − Q(s,a)]

        Args:
            state:      Current state tuple
            method_idx: Index of chosen voting method (0=nash, 1=variance)
            reward:     Observed reward
            next_state: Next state tuple
        """
        current_q = self.q_table[state][method_idx]
        max_next_q = max(self.q_table[next_state])
        new_q = current_q + self.alpha * (
            reward + self.gamma * max_next_q - current_q
        )
        self.q_table[state][method_idx] = round(new_q, 8)

        self._episode_count += 1
        self._total_reward += reward

    def decay_epsilon(self) -> None:
        """Reduce exploration rate (called once per episode)."""
        self.epsilon = max(self.epsilon_min, self.epsilon * self.epsilon_decay)

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------

    def save(self, path: str) -> None:
        """
        Persist Q-table and agent hyperparameters to a JSON file.

        Args:
            path: File path (created if absent)
        """
        data = {
            "q_table": {str(k): v for k, v in self.q_table.items()},
            "epsilon": self.epsilon,
            "episode_count": self._episode_count,
            "total_reward": self._total_reward,
            "alpha": self.alpha,
            "gamma": self.gamma,
            "epsilon_min": self.epsilon_min,
            "epsilon_decay": self.epsilon_decay,
        }
        Path(path).write_text(json.dumps(data, indent=2))

    def load(self, path: str) -> None:
        """
        Load Q-table and state from a JSON file.  Silently ignores missing file.

        Args:
            path: File path to load from
        """
        p = Path(path)
        if not p.exists():
            return
        try:
            data = json.loads(p.read_text())
            loaded_table = data.get("q_table", {})
            # Convert string keys back to tuples
            for k_str, v in loaded_table.items():
                try:
                    key = tuple(
                        int(x) if x.strip().lstrip("-").isdigit() else x.strip()
                        for x in k_str.strip("()").split(",")
                        if x.strip()
                    )
                    self.q_table[key] = v
                except Exception:
                    pass

            self.epsilon = float(data.get("epsilon", self.epsilon))
            self._episode_count = int(data.get("episode_count", 0))
            self._total_reward = float(data.get("total_reward", 0.0))
            self.alpha = float(data.get("alpha", self.alpha))
            self.gamma = float(data.get("gamma", self.gamma))
            self.epsilon_min = float(data.get("epsilon_min", self.epsilon_min))
            self.epsilon_decay = float(data.get("epsilon_decay", self.epsilon_decay))
        except Exception as exc:
            # Corrupted file — start fresh
            print(f"[rl_agent] Warning: could not load state from {path}: {exc}")

    # ------------------------------------------------------------------
    # Stats
    # ------------------------------------------------------------------

    def get_stats(self) -> Dict:
        """
        Return current training statistics.

        Returns:
            {episode_count, avg_reward, epsilon}
        """
        avg = (
            self._total_reward / self._episode_count
            if self._episode_count > 0
            else 0.0
        )
        return {
            "episode_count": self._episode_count,
            "avg_reward": round(avg, 6),
            "epsilon": round(self.epsilon, 6),
        }
