"""
RL Agent Module — Tabular Q-learning for direct action selection.

The agent learns to choose "stay" or "swerve" to match a specific user's
moral preferences, trained via:
  1. Batch training on manual challenge decisions (+1 per confirmed choice)
  2. Online updates from simulation feedback (+1 agree / -1 disagree)
  3. Mini-batch retraining every BATCH_EVERY feedback steps (in routers layer)

State space (5-dimensional discrete tuple, ~378 states):
    (n_ped_bucket, n_pass_bucket, legal_status, scenario_type_bucket, ped_ped)

    n_*_bucket:           0 = ≤1 char, 1 = 2–3 chars, 2 = ≥4 chars
    legal_status:         0 = no legality, 1 = legal/green, 2 = illegal/red
    scenario_type_bucket: 0 = Utilitarian (number of lives)
                          1 = Demographic (Gender / Age / Fitness / Social)
                          2 = Species
                          3 = Random
    ped_ped:              0 = pedestrian vs passenger
                          1 = pedestrian vs pedestrian

    NOTE: dominant_credence is intentionally excluded so that Nash/variance
    voting (computed from credences separately) provides an independent signal
    for comparison against the agent's behaviorally-learned choices.

Action space:
    0 = "stay"
    1 = "swerve"

Reward:
    +1.0  user confirms the agent's choice
    -1.0  user rejects the agent's choice
"""

import json
import random
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Tuple

ACTIONS  = ["stay", "swerve"]
_VERSION = "4"

# Scenario type → bucket mapping
_TYPE_BUCKET: Dict[str, int] = {
    "Utilitarian": 0,
    "Gender":      1,
    "Age":         1,
    "Fitness":     1,
    "Social Status": 1,
    "Species":     2,
    "Random":      3,
}


class MoralRLAgent:
    """
    Tabular ε-greedy Q-learning agent that directly selects stay or swerve.

    Q-table: state_tuple → [Q(stay), Q(swerve)]
    """

    def __init__(
        self,
        alpha: float = 0.1,
        gamma: float = 0.9,
        epsilon: float = 0.3,
        epsilon_min: float = 0.05,
        epsilon_decay: float = 0.995,
    ):
        self.alpha         = alpha
        self.gamma         = gamma
        self.epsilon       = epsilon
        self.epsilon_min   = epsilon_min
        self.epsilon_decay = epsilon_decay

        # Q-table: state tuple → [Q(stay), Q(swerve)]
        self.q_table: Dict[Tuple, List[float]] = defaultdict(lambda: [0.0, 0.0])

        self._episode_count = 0
        self._total_reward  = 0.0

    # ── State encoding ────────────────────────────────────────────────────────

    @staticmethod
    def _bucket(n: int) -> int:
        """Discretise character count: 0 = ≤1, 1 = 2–3, 2 = ≥4."""
        if n <= 1:
            return 0
        elif n <= 3:
            return 1
        return 2

    def encode_state(self, scenario: Dict, credences: Dict[str, float]) -> Tuple:
        """
        Encode scenario into a 5-dimensional discrete state tuple.

        Credences are intentionally excluded — they are used separately by
        compute_voting() to produce an independent Nash/variance recommendation.
        """
        n_ped  = len(scenario.get("pedestrians", []))
        n_pass = len(scenario.get("passengers",  []))

        # Legal status: 0=none, 1=legal/green, 2=illegal/red
        legal_status = int(scenario.get("legal_status", 0))
        if legal_status not in (0, 1, 2):
            legal_status = 0

        # Scenario type bucket (4 categories)
        st_raw = scenario.get("scenario_type", "Random")
        scenario_type_bucket = _TYPE_BUCKET.get(st_raw, 3)

        # PedPed flag
        ped_ped = 1 if scenario.get("ped_ped", False) else 0

        return (
            self._bucket(n_ped),
            self._bucket(n_pass),
            legal_status,
            scenario_type_bucket,
            ped_ped,
        )

    # ── Action selection ──────────────────────────────────────────────────────

    def choose_action(self, state: Tuple) -> str:
        """ε-greedy action selection. Returns 'stay' or 'swerve'."""
        if random.random() < self.epsilon:
            return random.choice(ACTIONS)
        q = self.q_table[state]
        return ACTIONS[q.index(max(q))]

    def get_q_values(self, state: Tuple) -> Dict[str, float]:
        """Return current Q-values for both actions at the given state."""
        q = self.q_table[state]
        return {"stay": round(q[0], 6), "swerve": round(q[1], 6)}

    # ── Learning ──────────────────────────────────────────────────────────────

    def update(
        self,
        state: Tuple,
        action_idx: int,
        reward: float,
        next_state: Tuple,
    ) -> None:
        """Q(s,a) ← Q(s,a) + α[r + γ max_a' Q(s',a') − Q(s,a)]"""
        q_sa     = self.q_table[state][action_idx]
        max_next = max(self.q_table[next_state])
        self.q_table[state][action_idx] = round(
            q_sa + self.alpha * (reward + self.gamma * max_next - q_sa), 8
        )
        self._episode_count += 1
        self._total_reward  += reward

    def batch_train(self, training_data: List[Dict]) -> int:
        """
        Train on a batch of user decisions.

        Each item must have:
            "scenario":  dict (pedestrians, passengers, traffic_light,
                               legal_status, scenario_type, ped_ped, …)
            "credences": {"deontological": float, "utilitarian": float}
            "action":    "stay" | "swerve"

        Each entry uses reward +1.0 (confirmed correct action).

        Returns the number of Q-updates performed.
        """
        count = 0
        for item in training_data:
            action = item.get("action")
            if action not in ACTIONS:
                continue
            state      = self.encode_state(item["scenario"], item["credences"])
            action_idx = ACTIONS.index(action)
            self.update(state, action_idx, reward=1.0, next_state=state)
            count += 1
        self.decay_epsilon()
        return count

    def decay_epsilon(self) -> None:
        """Reduce exploration rate."""
        self.epsilon = max(self.epsilon_min, self.epsilon * self.epsilon_decay)

    # ── Persistence ───────────────────────────────────────────────────────────

    def save(self, path: str) -> None:
        """Persist Q-table and hyperparameters to JSON."""
        data = {
            "version":       _VERSION,
            "q_table":       {str(k): v for k, v in self.q_table.items()},
            "epsilon":       self.epsilon,
            "episode_count": self._episode_count,
            "total_reward":  self._total_reward,
            "alpha":         self.alpha,
            "gamma":         self.gamma,
            "epsilon_min":   self.epsilon_min,
            "epsilon_decay": self.epsilon_decay,
        }
        Path(path).write_text(json.dumps(data, indent=2))

    def load(self, path: str) -> None:
        """
        Load Q-table from JSON. Silently ignores missing file.
        Discards Q-table if version is incompatible (fresh start).
        """
        p = Path(path)
        if not p.exists():
            return
        try:
            data = json.loads(p.read_text())

            if data.get("version") != _VERSION:
                print(
                    f"[rl_agent] Incompatible Q-table version "
                    f"(found '{data.get('version')}', expected '{_VERSION}'). "
                    "Starting with fresh Q-table; keeping episode stats."
                )
                self._episode_count = int(data.get("episode_count", 0))
                self._total_reward  = float(data.get("total_reward", 0.0))
                self.epsilon        = float(data.get("epsilon", self.epsilon))
                return

            for k_str, v in data.get("q_table", {}).items():
                try:
                    key = tuple(
                        int(x) if x.strip().lstrip("-").isdigit() else x.strip()
                        for x in k_str.strip("()").split(",")
                        if x.strip()
                    )
                    if isinstance(v, list) and len(v) >= 2:
                        self.q_table[key] = [float(v[0]), float(v[1])]
                except Exception:
                    pass

            self.epsilon        = float(data.get("epsilon",       self.epsilon))
            self._episode_count = int(data.get("episode_count",   0))
            self._total_reward  = float(data.get("total_reward",  0.0))
            self.alpha          = float(data.get("alpha",         self.alpha))
            self.gamma          = float(data.get("gamma",         self.gamma))
            self.epsilon_min    = float(data.get("epsilon_min",   self.epsilon_min))
            self.epsilon_decay  = float(data.get("epsilon_decay", self.epsilon_decay))

        except Exception as exc:
            print(f"[rl_agent] Warning: could not load state from {path}: {exc}")

    # ── Stats ─────────────────────────────────────────────────────────────────

    def get_stats(self) -> Dict:
        """Return current training statistics."""
        avg = (self._total_reward / self._episode_count) if self._episode_count > 0 else 0.0
        return {
            "episode_count": self._episode_count,
            "avg_reward":    round(avg, 6),
            "epsilon":       round(self.epsilon, 6),
        }
