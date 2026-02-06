"""
API Routes for Scenario Management

This module defines all REST API endpoints for scenario operations.
Includes CRUD operations and simulation execution.
"""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from models import (
    ScenarioCreate,
    ScenarioUpdate,
    ScenarioResponse,
    SimulationOutcome,
    CharacterType
)
from modules.scenario_config import (
    validate_scenario,
    get_character_info,
    VALID_CHARACTERS
)
from modules.data_storage import ScenarioStorage
from modules.simulation_logic import SimulationEngine

# Create router instance
router = APIRouter(
    prefix="/api",
    tags=["scenarios"]
)

# Initialize simulation engine
simulation_engine = SimulationEngine()


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
