"""
Custom Agent — personalized RL agent trained on user-labeled scenarios.

Derives moral credences from the user's own stay/swerve choices:
  stay   → deontological (non-interference)
  swerve → utilitarian   (minimize harm)

Those credences are then plugged into the same Nash/Variance voting
pipeline used by the existing MoralRLAgent.
"""

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

from modules.voting import (
    compute_q_values,
    compute_credence_dispersion,
    select_voting_method,
    nash_vote,
    variance_vote,
)
from modules.simulation_logic import SimulationEngine

_Q_VALUES = compute_q_values()
_SIM_ENGINE = SimulationEngine()


class CustomAgent:
    def __init__(self, name: str):
        self.name = name
        self.credences: Dict[str, float] = {"deontological": 0.5, "utilitarian": 0.5}
        self.training_count: int = 0
        self.created_at: str = datetime.utcnow().isoformat()

    def train(self, training_data: List[Dict]) -> None:
        """Compute credences from user's labeled choices."""
        if not training_data:
            return
        stay_count = sum(1 for d in training_data if d["choice"] == "stay")
        total = len(training_data)
        self.credences = {
            "deontological": round(stay_count / total, 6),
            "utilitarian":   round((total - stay_count) / total, 6),
        }
        self.training_count = total

    def predict(self, scenario: Dict) -> Dict:
        """Choose stay/swerve using the user's personal credences + voting."""
        dispersion = compute_credence_dispersion(self.credences)
        method = select_voting_method(dispersion)
        action = nash_vote(self.credences, _Q_VALUES) if method == "nash" \
            else variance_vote(self.credences, _Q_VALUES)

        outcome = _SIM_ENGINE.simulate_outcome(
            {
                "passengers":    scenario.get("passengers", []),
                "pedestrians":   scenario.get("pedestrians", []),
                "traffic_light": scenario.get("traffic_light", "Red"),
            },
            action,
        )
        return {
            "action":              action,
            "voting_method":       method,
            "credences":           self.credences,
            "credence_dispersion": round(dispersion, 6),
            "harmed_group":        outcome["harmed_group"],
            "harmed_count":        outcome["harmed_count"],
        }

    def save(self, agents_dir: str) -> None:
        os.makedirs(agents_dir, exist_ok=True)
        data = {
            "name":           self.name,
            "credences":      self.credences,
            "training_count": self.training_count,
            "created_at":     self.created_at,
        }
        Path(os.path.join(agents_dir, f"{self.name}.json")).write_text(
            json.dumps(data, indent=2)
        )

    @classmethod
    def load(cls, agents_dir: str, name: str) -> Optional["CustomAgent"]:
        path = os.path.join(agents_dir, f"{name}.json")
        if not os.path.exists(path):
            return None
        data = json.loads(Path(path).read_text())
        agent = cls(name=data["name"])
        agent.credences = data["credences"]
        agent.training_count = data["training_count"]
        agent.created_at = data.get("created_at", "")
        return agent

    @staticmethod
    def list_agents(agents_dir: str) -> List[Dict]:
        if not os.path.exists(agents_dir):
            return []
        agents = []
        for fname in sorted(os.listdir(agents_dir)):
            if fname.endswith(".json"):
                try:
                    data = json.loads(
                        Path(os.path.join(agents_dir, fname)).read_text()
                    )
                    agents.append({
                        "name":           data["name"],
                        "credences":      data["credences"],
                        "training_count": data["training_count"],
                        "created_at":     data.get("created_at", ""),
                    })
                except Exception:
                    pass
        return sorted(agents, key=lambda a: a["created_at"], reverse=True)
