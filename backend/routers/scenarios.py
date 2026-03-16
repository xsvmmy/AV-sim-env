"""
API Routes for Scenario Management

Includes:
- CRUD endpoints for scenarios (DB-backed)
- RL simulation: agent directly picks stay/swerve (no voting)
- RL feedback: user confirms/rejects → immediate Q-update +
               mini-batch retrain every BATCH_RETRAIN_EVERY steps
- Manual challenge: user solves N CSV scenarios → batch-train agent
- All user outputs saved to user-outputs/ at the project root
"""

import csv
import os
import random
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from models import (
    ScenarioCreate,
    ScenarioUpdate,
    ScenarioResponse,
    SimulationOutcome,
    CharacterType,
    RLSimulateRequest,
    RLSimulateResponse,
    FeedbackRequest,
    FeedbackResponse,
    DatasetRunResponse,
    ManualStartRequest,
    ManualStartResponse,
    ManualSubmitRequest,
    ManualSubmitResponse,
    UserDecision,
)
from modules.scenario_config import validate_scenario, get_character_info, VALID_CHARACTERS
from modules.data_storage import ScenarioStorage
from modules.simulation_logic import SimulationEngine, compute_voting
from modules.csv_loader import load_csv_scenarios
from modules.rl_agent import MoralRLAgent, ACTIONS

router = APIRouter(prefix="/api", tags=["scenarios"])

simulation_engine = SimulationEngine()

# ---------------------------------------------------------------------------
# Path constants
# ---------------------------------------------------------------------------

_CSV_PATH       = os.path.join(os.path.dirname(__file__), "..", "..", "filtered_responses.csv")
_RL_STATE_PATH  = os.path.join(os.path.dirname(__file__), "..", "rl_state.json")
_OUTPUTS_DIR    = os.path.join(os.path.dirname(__file__), "..", "..", "user-outputs")

# Ensure user-outputs/ directory exists at project root
os.makedirs(os.path.abspath(_OUTPUTS_DIR), exist_ok=True)

# ---------------------------------------------------------------------------
# Load CSV scenarios (capped at 50 000 complete pairs for fast startup)
# ---------------------------------------------------------------------------

_csv_scenarios_list: List[dict] = []
_csv_scenarios_by_id: dict = {}

try:
    _csv_scenarios_list  = load_csv_scenarios(os.path.abspath(_CSV_PATH), max_scenarios=50_000)
    _csv_scenarios_by_id = {s["response_id"]: s for s in _csv_scenarios_list}
    print(f"[scenarios] Loaded {len(_csv_scenarios_list)} CSV scenarios")
except Exception as _e:
    print(f"[scenarios] Warning: could not load CSV scenarios: {_e}")

# ---------------------------------------------------------------------------
# RL agent (persisted across requests)
# ---------------------------------------------------------------------------

_rl_agent = MoralRLAgent(alpha=0.1, gamma=0.9, epsilon=0.3)
try:
    _rl_agent.load(os.path.abspath(_RL_STATE_PATH))
except Exception as _e:
    print(f"[scenarios] Warning: could not load RL state: {_e}")

# ---------------------------------------------------------------------------
# Feedback buffer — accumulates user responses for mini-batch retraining
# ---------------------------------------------------------------------------

BATCH_RETRAIN_EVERY = 5          # retrain on every Nth feedback
_feedback_buffer: List[dict] = []  # {"scenario", "credences", "action" (correct)}


# ===========================================================================
# Helpers
# ===========================================================================

def _save_file(filename: str) -> str:
    """Return absolute path for a file in user-outputs/."""
    return os.path.abspath(os.path.join(_OUTPUTS_DIR, filename))


def _save_decisions_csv(decisions: List[UserDecision], prefix: str = "manual") -> str:
    """
    Write user decisions + scenario metadata to a timestamped CSV in user-outputs/.
    Returns the filename only (not full path).
    """
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename  = f"{prefix}_decisions_{timestamp}.csv"
    out_path  = _save_file(filename)

    fieldnames = [
        "timestamp", "response_id", "user_action",
        "n_pedestrians", "n_passengers", "traffic_light", "legal_status",
        "scenario_type", "attribute_level", "ped_ped", "diff_n_chars",
        "credence_deontological", "credence_utilitarian",
        "lane1_chars", "lane2_chars",
    ]

    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        ts = datetime.now().isoformat()
        for dec in decisions:
            sc = _csv_scenarios_by_id.get(dec.response_id, {})
            cred = sc.get("credences", {})
            writer.writerow({
                "timestamp":               ts,
                "response_id":             dec.response_id,
                "user_action":             dec.action,
                "n_pedestrians":           len(sc.get("pedestrians", [])),
                "n_passengers":            len(sc.get("passengers",  [])),
                "traffic_light":           sc.get("traffic_light", ""),
                "legal_status":            sc.get("legal_status", 0),
                "scenario_type":           sc.get("scenario_type", ""),
                "attribute_level":         sc.get("attribute_level", ""),
                "ped_ped":                 sc.get("ped_ped", False),
                "diff_n_chars":            sc.get("diff_n_chars", 0),
                "credence_deontological":  cred.get("deontological", ""),
                "credence_utilitarian":    cred.get("utilitarian",   ""),
                "lane1_chars":             str(sc.get("lane1_chars", [])),
                "lane2_chars":             str(sc.get("lane2_chars", [])),
            })

    return filename


def _append_feedback_log(
    response_id: str, agent_action: str, user_agrees: bool,
    reward: float, batch_trained: bool,
) -> None:
    """Append one row to user-outputs/feedback_log.csv (cumulative)."""
    log_path   = _save_file("feedback_log.csv")
    file_exists = os.path.exists(log_path)
    with open(log_path, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "timestamp", "response_id", "agent_action", "user_agrees",
            "reward", "batch_trained",
        ])
        if not file_exists:
            writer.writeheader()
        writer.writerow({
            "timestamp":    datetime.now().isoformat(),
            "response_id":  response_id,
            "agent_action": agent_action,
            "user_agrees":  user_agrees,
            "reward":       reward,
            "batch_trained": batch_trained,
        })


def _persist_agent() -> None:
    """Save RL agent state, ignoring errors."""
    try:
        _rl_agent.save(os.path.abspath(_RL_STATE_PATH))
    except Exception as e:
        print(f"[scenarios] Warning: could not save RL state: {e}")


# ===========================================================================
# Character & Scenario CRUD
# ===========================================================================

@router.get("/characters", response_model=List[CharacterType])
async def get_characters():
    return get_character_info()


@router.get("/scenarios", response_model=List[ScenarioResponse])
async def list_scenarios(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return ScenarioStorage.get_all_scenarios(db, skip=skip, limit=limit)


@router.post("/scenarios", response_model=ScenarioResponse, status_code=status.HTTP_201_CREATED)
async def create_scenario(scenario: ScenarioCreate, db: Session = Depends(get_db)):
    result = validate_scenario(scenario.passengers, scenario.pedestrians, scenario.traffic_light)
    if not result["valid"]:
        raise HTTPException(status_code=400, detail={"message": "Invalid scenario", "errors": result["errors"]})
    return ScenarioStorage.create_scenario(db, scenario)


@router.get("/scenarios/{scenario_id}", response_model=ScenarioResponse)
async def get_scenario(scenario_id: int, db: Session = Depends(get_db)):
    sc = ScenarioStorage.get_scenario(db, scenario_id)
    if not sc:
        raise HTTPException(status_code=404, detail=f"Scenario {scenario_id} not found")
    return sc


@router.put("/scenarios/{scenario_id}", response_model=ScenarioResponse)
async def update_scenario(scenario_id: int, scenario_update: ScenarioUpdate, db: Session = Depends(get_db)):
    existing = ScenarioStorage.get_scenario(db, scenario_id)
    if not existing:
        raise HTTPException(status_code=404, detail=f"Scenario {scenario_id} not found")
    passengers    = scenario_update.passengers    or existing.passengers
    pedestrians   = scenario_update.pedestrians   or existing.pedestrians
    traffic_light = scenario_update.traffic_light or existing.traffic_light
    result = validate_scenario(passengers, pedestrians, traffic_light)
    if not result["valid"]:
        raise HTTPException(status_code=400, detail={"message": "Invalid update", "errors": result["errors"]})
    return ScenarioStorage.update_scenario(db, scenario_id, scenario_update)


@router.delete("/scenarios/{scenario_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_scenario(scenario_id: int, db: Session = Depends(get_db)):
    if not ScenarioStorage.delete_scenario(db, scenario_id):
        raise HTTPException(status_code=404, detail=f"Scenario {scenario_id} not found")


@router.post("/scenarios/{scenario_id}/simulate", response_model=SimulationOutcome)
async def simulate_scenario(scenario_id: int, action: str, db: Session = Depends(get_db)):
    if action not in ["stay", "swerve"]:
        raise HTTPException(status_code=400, detail="Action must be 'stay' or 'swerve'")
    sc = ScenarioStorage.get_scenario(db, scenario_id)
    if not sc:
        raise HTTPException(status_code=404, detail=f"Scenario {scenario_id} not found")
    scenario_data = {"passengers": sc.passengers, "pedestrians": sc.pedestrians, "traffic_light": sc.traffic_light}
    outcome = simulation_engine.simulate_outcome(scenario_data, action)
    ScenarioStorage.update_scenario_outcome(db, scenario_id, action)
    return SimulationOutcome(
        outcome_choice=outcome["outcome_choice"],
        harmed_group=outcome["harmed_group"],
        harmed_count=outcome["harmed_count"],
        scenario_id=scenario_id,
    )


@router.get("/scenarios/{scenario_id}/outcome")
async def get_scenario_outcome(scenario_id: int, db: Session = Depends(get_db)):
    sc = ScenarioStorage.get_scenario(db, scenario_id)
    if not sc:
        raise HTTPException(status_code=404, detail=f"Scenario {scenario_id} not found")
    if not sc.outcome:
        raise HTTPException(status_code=404, detail=f"Scenario {scenario_id} has not been simulated yet")
    scenario_data = {"passengers": sc.passengers, "pedestrians": sc.pedestrians, "traffic_light": sc.traffic_light}
    outcome = simulation_engine.simulate_outcome(scenario_data, sc.outcome)
    return {
        "scenario_id": scenario_id, "outcome_choice": sc.outcome,
        "harmed_group": outcome["harmed_group"], "harmed_count": outcome["harmed_count"],
        "saved_group": outcome["saved_group"],   "saved_count": outcome["saved_count"],
    }


@router.get("/statistics")
async def get_statistics(db: Session = Depends(get_db)):
    from modules.data_storage import get_storage_statistics
    return get_storage_statistics(db)


@router.get("/export/json")
async def export_scenarios(db: Session = Depends(get_db)):
    from modules.data_storage import export_scenarios_json
    count = export_scenarios_json(db)
    return {"message": f"Exported {count} scenarios to scenarios_export.json", "count": count}


# ===========================================================================
# CSV / RL Scenario Endpoints
# ===========================================================================

@router.get("/rl/scenarios")
async def list_rl_scenarios(skip: int = 0, limit: int = 50):
    if not _csv_scenarios_list:
        raise HTTPException(status_code=503, detail="CSV scenario data not available")
    return _csv_scenarios_list[skip: skip + limit]


@router.get("/rl/scenarios/random")
async def get_random_rl_scenario():
    if not _csv_scenarios_list:
        raise HTTPException(status_code=503, detail="CSV scenario data not available")
    return random.choice(_csv_scenarios_list)


# ===========================================================================
# RL Simulate
# ===========================================================================

@router.post("/rl/simulate", response_model=RLSimulateResponse)
async def simulate_with_rl(request: RLSimulateRequest):
    """
    Run the RL agent on a CSV scenario.

    The agent encodes the richer 6-dimensional state (includes scenario_type,
    legal_status, ped_ped) before choosing an action.

    NOTE: Q-table is NOT updated here — update happens via POST /api/rl/feedback.
    """
    scenario = _csv_scenarios_by_id.get(request.response_id)
    if scenario is None:
        raise HTTPException(status_code=404,
                            detail=f"ResponseID '{request.response_id}' not found")

    credences = scenario["credences"]
    state     = _rl_agent.encode_state(scenario, credences)
    action    = _rl_agent.choose_action(state)
    q_vals    = _rl_agent.get_q_values(state)

    sim_scenario = {
        "passengers":    scenario["passengers"],
        "pedestrians":   scenario["pedestrians"],
        "traffic_light": scenario["traffic_light"],
    }
    outcome = simulation_engine.simulate_outcome(sim_scenario, action)
    stats   = _rl_agent.get_stats()

    vote = compute_voting(credences)
    vote["agent_matches"] = (action == vote["recommendation"])

    return RLSimulateResponse(
        action=action,
        q_values=q_vals,
        credences=credences,
        human_choice=scenario["human_choice"],
        agent_matches_human=(action == scenario["human_choice"]),
        harmed_group=outcome["harmed_group"],
        harmed_count=outcome["harmed_count"],
        episode_count=stats["episode_count"],
        avg_reward=stats["avg_reward"],
        epsilon=stats["epsilon"],
        voting=vote,
    )


# ===========================================================================
# Dataset-guided rerun — Nash/variance decides, Q-table trains on +1
# ===========================================================================

@router.post("/rl/dataset-run", response_model=DatasetRunResponse)
async def dataset_run(request: RLSimulateRequest):
    """
    Rerun a scenario using Nash/variance voting as the action.

    The action is determined entirely by the CSV credences (via compute_voting),
    independent of the Q-table. The Q-table is then trained with reward +1.0
    so the agent learns to align with the dataset's moral consensus over time.
    """
    scenario = _csv_scenarios_by_id.get(request.response_id)
    if scenario is None:
        raise HTTPException(status_code=404,
                            detail=f"ResponseID '{request.response_id}' not found")

    credences = scenario["credences"]
    vote      = compute_voting(credences)
    action    = vote["recommendation"]

    state      = _rl_agent.encode_state(scenario, credences)
    action_idx = ACTIONS.index(action)
    _rl_agent.update(state, action_idx, reward=1.0, next_state=state)
    _rl_agent.decay_epsilon()
    _persist_agent()

    q_vals = _rl_agent.get_q_values(state)
    stats  = _rl_agent.get_stats()

    sim_scenario = {
        "passengers":    scenario["passengers"],
        "pedestrians":   scenario["pedestrians"],
        "traffic_light": scenario["traffic_light"],
    }
    outcome = simulation_engine.simulate_outcome(sim_scenario, action)

    vote["agent_matches"] = True  # by definition — action IS the recommendation

    return DatasetRunResponse(
        action=action,
        q_values=q_vals,
        voting=vote,
        reward=1.0,
        harmed_group=outcome["harmed_group"],
        harmed_count=outcome["harmed_count"],
        episode_count=stats["episode_count"],
        avg_reward=stats["avg_reward"],
        epsilon=stats["epsilon"],
    )


# ===========================================================================
# RL Feedback — immediate update + mini-batch every 5
# ===========================================================================

@router.post("/rl/feedback", response_model=FeedbackResponse)
async def rl_feedback(request: FeedbackRequest):
    """
    Receive user feedback on the agent's last simulation.

    Two-stage learning:
      1. Immediate Q-update: reward +1 (agree) or -1 (disagree)
      2. Mini-batch retrain every BATCH_RETRAIN_EVERY feedbacks:
           - Trains on the N confirmed actions from the buffer
           - Corrected actions (user disagreed) are stored as the
             opposite action so the batch still improves policy
    """
    global _feedback_buffer

    scenario = _csv_scenarios_by_id.get(request.response_id)
    if scenario is None:
        raise HTTPException(status_code=404,
                            detail=f"ResponseID '{request.response_id}' not found")

    credences  = scenario["credences"]
    state      = _rl_agent.encode_state(scenario, credences)
    action_idx = ACTIONS.index(request.agent_action)
    reward     = 1.0 if request.user_agrees else -1.0

    # Stage 1 — immediate single Q-update
    _rl_agent.update(state, action_idx, reward, next_state=state)
    _rl_agent.decay_epsilon()

    # Stage 2 — buffer for mini-batch
    # Store the CORRECT action: agent's action if agreed, opposite if not
    correct_action = request.agent_action if request.user_agrees else (
        "swerve" if request.agent_action == "stay" else "stay"
    )
    _feedback_buffer.append({
        "scenario":  scenario,
        "credences": credences,
        "action":    correct_action,
    })

    batch_trained = False
    if len(_feedback_buffer) >= BATCH_RETRAIN_EVERY:
        _rl_agent.batch_train(_feedback_buffer)   # +1 per confirmed-correct action
        _feedback_buffer.clear()
        batch_trained = True

    _persist_agent()
    _append_feedback_log(
        request.response_id, request.agent_action, request.user_agrees,
        reward, batch_trained,
    )

    stats = _rl_agent.get_stats()
    return FeedbackResponse(
        reward=reward,
        episode_count=stats["episode_count"],
        avg_reward=stats["avg_reward"],
        epsilon=stats["epsilon"],
        batch_trained=batch_trained,
        buffer_count=len(_feedback_buffer),
    )


# ===========================================================================
# Manual Challenge
# ===========================================================================

@router.post("/manual/start", response_model=ManualStartResponse)
async def manual_start(request: ManualStartRequest):
    """
    Return N randomly selected CSV scenarios for the manual challenge.
    Min 10, max 200.
    """
    if not _csv_scenarios_list:
        raise HTTPException(status_code=503, detail="CSV scenario data not available")
    n = min(request.n_scenarios, len(_csv_scenarios_list))
    return ManualStartResponse(scenarios=random.sample(_csv_scenarios_list, n))


@router.post("/manual/submit", response_model=ManualSubmitResponse)
async def manual_submit(request: ManualSubmitRequest):
    """
    Accept a batch of manual challenge decisions.

    1. Build training data from CSV scenarios
    2. Batch-train the RL agent (each decision = +1 reward)
    3. Save decisions to user-outputs/manual_decisions_TIMESTAMP.csv
    4. Persist agent state
    """
    training_data: List[dict] = []
    valid_decisions: List[UserDecision] = []

    for dec in request.decisions:
        sc = _csv_scenarios_by_id.get(dec.response_id)
        if sc is None:
            continue
        training_data.append({
            "scenario":  sc,
            "credences": sc["credences"],
            "action":    dec.action,
        })
        valid_decisions.append(dec)

    trained      = _rl_agent.batch_train(training_data)
    _persist_agent()
    csv_filename = _save_decisions_csv(valid_decisions, prefix="manual")

    return ManualSubmitResponse(
        saved_count=len(valid_decisions),
        trained_count=trained,
        csv_filename=csv_filename,
    )
