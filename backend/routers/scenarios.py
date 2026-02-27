"""
API Routes for Scenario Management

This module defines all REST API endpoints for scenario operations.
Includes CRUD operations, simulation execution, and RL simulation.
"""

import os
import random
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
)
from modules.scenario_config import (
    validate_scenario,
    get_character_info,
    VALID_CHARACTERS
)
from modules.data_storage import ScenarioStorage
from modules.simulation_logic import SimulationEngine
from modules.csv_loader import load_csv_scenarios
from modules.voting import (
    compute_q_values,
    compute_credence_dispersion,
    select_voting_method,
    nash_vote,
    variance_vote,
)
from modules.rl_agent import MoralRLAgent, VOTING_ACTIONS

# Create router instance
router = APIRouter(
    prefix="/api",
    tags=["scenarios"]
)

# Initialize simulation engine
simulation_engine = SimulationEngine()

# ---------------------------------------------------------------------------
# RL globals — loaded once at module import time
# ---------------------------------------------------------------------------

_CSV_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "filtered_responses.csv")
_RL_STATE_PATH = os.path.join(os.path.dirname(__file__), "..", "rl_state.json")

# Load CSV scenarios (list of dicts); keyed dict for fast lookup
_csv_scenarios_list: List[dict] = []
_csv_scenarios_by_id: dict = {}

try:
    _csv_scenarios_list = load_csv_scenarios(os.path.abspath(_CSV_PATH))
    _csv_scenarios_by_id = {s["response_id"]: s for s in _csv_scenarios_list}
except Exception as _e:
    print(f"[scenarios.py] Warning: could not load CSV scenarios: {_e}")

# Single RL agent instance, persisted across requests
_rl_agent = MoralRLAgent(alpha=0.1, gamma=0.9, epsilon=0.3)
try:
    _rl_agent.load(os.path.abspath(_RL_STATE_PATH))
except Exception as _e:
    print(f"[scenarios.py] Warning: could not load RL state: {_e}")

_q_values = compute_q_values()


@router.get("/characters", response_model=List[CharacterType])
async def get_characters():
    """
    Get all available character types.

    Returns list of character types with categories and descriptions.
    Used by frontend to populate character selection interface.
    """
    return get_character_info()


@router.get("/scenarios", response_model=List[ScenarioResponse])
async def list_scenarios(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """
    List all scenarios with pagination.

    Args:
        skip: Number of records to skip (default: 0)
        limit: Maximum number of records to return (default: 100)
        db: Database session dependency

    Returns:
        List of scenario objects
    """
    scenarios = ScenarioStorage.get_all_scenarios(db, skip=skip, limit=limit)
    return scenarios


@router.post("/scenarios", response_model=ScenarioResponse,
            status_code=status.HTTP_201_CREATED)
async def create_scenario(
    scenario: ScenarioCreate,
    db: Session = Depends(get_db)
):
    """
    Create a new scenario.

    Validates the scenario configuration before saving.

    Args:
        scenario: Scenario data from request body
        db: Database session dependency

    Returns:
        Created scenario object

    Raises:
        HTTPException 400: If validation fails
    """
    # Validate scenario configuration
    validation_result = validate_scenario(
        scenario.passengers,
        scenario.pedestrians,
        scenario.traffic_light
    )

    if not validation_result["valid"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": "Invalid scenario configuration",
                "errors": validation_result["errors"]
            }
        )

    # Create scenario in database
    db_scenario = ScenarioStorage.create_scenario(db, scenario)
    return db_scenario


@router.get("/scenarios/{scenario_id}", response_model=ScenarioResponse)
async def get_scenario(
    scenario_id: int,
    db: Session = Depends(get_db)
):
    """
    Get a specific scenario by ID.

    Args:
        scenario_id: Scenario ID from path parameter
        db: Database session dependency

    Returns:
        Scenario object

    Raises:
        HTTPException 404: If scenario not found
    """
    scenario = ScenarioStorage.get_scenario(db, scenario_id)
    if not scenario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Scenario {scenario_id} not found"
        )
    return scenario


@router.put("/scenarios/{scenario_id}", response_model=ScenarioResponse)
async def update_scenario(
    scenario_id: int,
    scenario_update: ScenarioUpdate,
    db: Session = Depends(get_db)
):
    """
    Update an existing scenario.

    Args:
        scenario_id: Scenario ID from path parameter
        scenario_update: Updated scenario data
        db: Database session dependency

    Returns:
        Updated scenario object

    Raises:
        HTTPException 404: If scenario not found
        HTTPException 400: If validation fails
    """
    # Check if scenario exists
    existing = ScenarioStorage.get_scenario(db, scenario_id)
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Scenario {scenario_id} not found"
        )

    # Validate updated fields if provided
    passengers = scenario_update.passengers or existing.passengers
    pedestrians = scenario_update.pedestrians or existing.pedestrians
    traffic_light = scenario_update.traffic_light or existing.traffic_light

    validation_result = validate_scenario(passengers, pedestrians, traffic_light)
    if not validation_result["valid"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": "Invalid scenario update",
                "errors": validation_result["errors"]
            }
        )

    # Update scenario
    updated_scenario = ScenarioStorage.update_scenario(db, scenario_id, scenario_update)
    return updated_scenario


@router.delete("/scenarios/{scenario_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_scenario(
    scenario_id: int,
    db: Session = Depends(get_db)
):
    """
    Delete a scenario.

    Args:
        scenario_id: Scenario ID from path parameter
        db: Database session dependency

    Raises:
        HTTPException 404: If scenario not found
    """
    success = ScenarioStorage.delete_scenario(db, scenario_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Scenario {scenario_id} not found"
        )


@router.post("/scenarios/{scenario_id}/simulate", response_model=SimulationOutcome)
async def simulate_scenario(
    scenario_id: int,
    action: str,
    db: Session = Depends(get_db)
):
    """
    Run simulation for a scenario with a specific action.

    This endpoint processes the user's decision (stay or swerve) and
    returns the outcome details.

    Future RL Integration:
    - This will be replaced/augmented with agent decision-making
    - Add endpoint for agent-driven simulation: POST /scenarios/{id}/simulate/agent

    Args:
        scenario_id: Scenario ID from path parameter
        action: Action choice from query parameter ("stay" or "swerve")
        db: Database session dependency

    Returns:
        Simulation outcome with details

    Raises:
        HTTPException 404: If scenario not found
        HTTPException 400: If invalid action
    """
    # Validate action
    if action not in ["stay", "swerve"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Action must be 'stay' or 'swerve'"
        )

    # Get scenario
    scenario = ScenarioStorage.get_scenario(db, scenario_id)
    if not scenario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Scenario {scenario_id} not found"
        )

    # Prepare scenario data for simulation
    scenario_data = {
        "passengers": scenario.passengers,
        "pedestrians": scenario.pedestrians,
        "traffic_light": scenario.traffic_light
    }

    # Run simulation
    outcome = simulation_engine.simulate_outcome(scenario_data, action)

    # Update scenario with outcome
    ScenarioStorage.update_scenario_outcome(db, scenario_id, action)

    # Return outcome
    return SimulationOutcome(
        outcome_choice=outcome["outcome_choice"],
        harmed_group=outcome["harmed_group"],
        harmed_count=outcome["harmed_count"],
        scenario_id=scenario_id
    )


@router.get("/scenarios/{scenario_id}/outcome")
async def get_scenario_outcome(
    scenario_id: int,
    db: Session = Depends(get_db)
):
    """
    Get the outcome of a previously simulated scenario.

    Args:
        scenario_id: Scenario ID from path parameter
        db: Database session dependency

    Returns:
        Outcome information

    Raises:
        HTTPException 404: If scenario not found or not yet simulated
    """
    scenario = ScenarioStorage.get_scenario(db, scenario_id)
    if not scenario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Scenario {scenario_id} not found"
        )

    if not scenario.outcome:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Scenario {scenario_id} has not been simulated yet"
        )

    # Recreate outcome details
    scenario_data = {
        "passengers": scenario.passengers,
        "pedestrians": scenario.pedestrians,
        "traffic_light": scenario.traffic_light
    }
    outcome = simulation_engine.simulate_outcome(scenario_data, scenario.outcome)

    return {
        "scenario_id": scenario_id,
        "outcome_choice": scenario.outcome,
        "harmed_group": outcome["harmed_group"],
        "harmed_count": outcome["harmed_count"],
        "saved_group": outcome["saved_group"],
        "saved_count": outcome["saved_count"]
    }


# ============================================================================
# Future RL Integration Endpoints (Placeholders)
# ============================================================================

@router.post("/scenarios/{scenario_id}/simulate/agent")
async def simulate_with_agent(
    scenario_id: int,
    db: Session = Depends(get_db)
):
    """
    TODO: Run simulation using RL agent decision.

    This endpoint will:
    1. Load the trained RL agent
    2. Encode the scenario as a state vector
    3. Query the agent's policy for action
    4. Execute the action and calculate reward
    5. Optionally update the agent (online learning)

    Args:
        scenario_id: Scenario ID

    Returns:
        Simulation outcome with agent information
    """
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="RL agent simulation not yet implemented"
    )


@router.get("/statistics")
async def get_statistics(db: Session = Depends(get_db)):
    """
    Get statistics about scenarios and outcomes.

    Useful for analyzing decision patterns and data distribution.

    Args:
        db: Database session dependency

    Returns:
        Statistics dictionary
    """
    from modules.data_storage import get_storage_statistics

    stats = get_storage_statistics(db)
    return stats


@router.get("/export/json")
async def export_scenarios(db: Session = Depends(get_db)):
    """
    Export all scenarios as JSON.

    Returns:
        Success message with export count
    """
    from modules.data_storage import export_scenarios_json

    count = export_scenarios_json(db)
    return {
        "message": f"Exported {count} scenarios to scenarios_export.json",
        "count": count
    }


# ============================================================================
# RL / CSV Endpoints
# ============================================================================

@router.get("/rl/scenarios")
async def list_rl_scenarios(skip: int = 0, limit: int = 50):
    """
    Return a paginated list of CSV-sourced scenario previews.

    Each item includes: response_id, passenger count, pedestrian count,
    traffic_light, credences, and human_choice.
    """
    if not _csv_scenarios_list:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="CSV scenario data not available"
        )
    page = _csv_scenarios_list[skip: skip + limit]
    return [
        {
            "response_id": s["response_id"],
            "n_passengers": len(s["passengers"]),
            "n_pedestrians": len(s["pedestrians"]),
            "passengers": s["passengers"],
            "pedestrians": s["pedestrians"],
            "traffic_light": s["traffic_light"],
            "barrier": s["barrier"],
            "credences": s["credences"],
            "human_choice": s["human_choice"],
        }
        for s in page
    ]


@router.get("/rl/scenarios/random")
async def get_random_rl_scenario():
    """Return one randomly selected CSV scenario."""
    if not _csv_scenarios_list:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="CSV scenario data not available"
        )
    return random.choice(_csv_scenarios_list)


@router.post("/rl/simulate", response_model=RLSimulateResponse)
async def simulate_with_rl(request: RLSimulateRequest):
    """
    Run the full RL pipeline for a CSV scenario identified by response_id.

    Pipeline:
    1. Look up scenario in loaded CSV data
    2. Compute credence dispersion → select Nash or Variance voting
    3. Agent chooses voting method (ε-greedy); voting method selects action
    4. SimulationEngine resolves harmed group
    5. Compute moral reward
    6. Q-update + epsilon decay
    7. Persist agent state
    8. Return full result
    """
    scenario = _csv_scenarios_by_id.get(request.response_id)
    if scenario is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"ResponseID '{request.response_id}' not found in CSV data"
        )

    credences = scenario["credences"]

    # 1. Credence dispersion → recommended voting method
    dispersion = compute_credence_dispersion(credences)
    recommended_method = select_voting_method(dispersion)

    # 2. Agent chooses voting method (may differ due to ε-greedy exploration)
    state = _rl_agent.encode_state(scenario, credences)
    chosen_method = _rl_agent.choose_voting_method(state)
    method_idx = VOTING_ACTIONS.index(chosen_method)

    # 3. Chosen voting method determines action
    if chosen_method == "nash":
        action = nash_vote(credences, _q_values)
    else:
        action = variance_vote(credences, _q_values)

    # 4. Resolve harmed group via simulation engine
    sim_scenario = {
        "passengers": scenario["passengers"],
        "pedestrians": scenario["pedestrians"],
        "traffic_light": scenario["traffic_light"],
    }
    outcome = simulation_engine.simulate_outcome(sim_scenario, action)

    # 5. Compute moral reward
    reward = _rl_agent.compute_moral_reward(action, credences)

    # 6. Q-update (next state = same state for episodic scenarios)
    _rl_agent.update(state, method_idx, reward, state)
    _rl_agent.decay_epsilon()

    # 7. Persist agent state
    try:
        _rl_agent.save(os.path.abspath(_RL_STATE_PATH))
    except Exception as save_err:
        print(f"[rl/simulate] Warning: could not save RL state: {save_err}")

    # 8. Build response
    stats = _rl_agent.get_stats()
    return RLSimulateResponse(
        action=action,
        voting_method=chosen_method,
        credence_dispersion=round(dispersion, 6),
        credences=credences,
        q_values=_q_values,
        reward=reward,
        human_choice=scenario["human_choice"],
        agent_matches_human=(action == scenario["human_choice"]),
        harmed_group=outcome["harmed_group"],
        harmed_count=outcome["harmed_count"],
        episode_count=stats["episode_count"],
        avg_reward=stats["avg_reward"],
        epsilon=stats["epsilon"],
    )
