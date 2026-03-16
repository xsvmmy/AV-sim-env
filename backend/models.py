"""
Data models and schemas for the AV Ethics Simulator.

This module defines:
1. SQLAlchemy ORM models for database tables
2. Pydantic schemas for API request/response validation
"""

from datetime import datetime
from typing import Any, Dict, List, Optional
from sqlalchemy import Column, Integer, String, DateTime, JSON
from pydantic import BaseModel, Field, validator
from database import Base


# ============================================================================
# SQLAlchemy ORM Models (Database Tables)
# ============================================================================

class ScenarioDB(Base):
    """
    Database model for storing ethical dilemma scenarios.
    """
    __tablename__ = "scenarios"

    id            = Column(Integer, primary_key=True, index=True)
    passengers    = Column(JSON,   nullable=False)
    pedestrians   = Column(JSON,   nullable=False)
    traffic_light = Column(String, nullable=False)
    outcome       = Column(String, nullable=True)
    created_at    = Column(DateTime, default=datetime.utcnow)


# ============================================================================
# Pydantic Schemas — Scenario CRUD
# ============================================================================

class ScenarioBase(BaseModel):
    """Base schema with common scenario fields."""
    passengers: List[str] = Field(
        ..., min_length=1, max_length=5,
        description="List of 1–5 passenger character types"
    )
    pedestrians: List[str] = Field(
        ..., min_length=1, max_length=5,
        description="List of 1–5 pedestrian character types"
    )
    traffic_light: str = Field(
        ..., pattern="^(Red|Green|None)$",
        description="Traffic light state: Red, Green, or None"
    )

    @validator('passengers', 'pedestrians')
    def validate_character_list(cls, v):
        if not v:
            raise ValueError('At least one character must be provided')
        if len(v) > 5:
            raise ValueError('Maximum 5 characters allowed')
        return v


class ScenarioCreate(ScenarioBase):
    pass


class ScenarioUpdate(BaseModel):
    passengers:    Optional[List[str]] = Field(None, min_length=1, max_length=5)
    pedestrians:   Optional[List[str]] = Field(None, min_length=1, max_length=5)
    traffic_light: Optional[str]       = Field(None, pattern="^(Red|Green|None)$")
    outcome:       Optional[str]       = Field(None, pattern="^(stay|swerve)$")


class ScenarioResponse(ScenarioBase):
    id:         int
    outcome:    Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class SimulationOutcome(BaseModel):
    outcome_choice: str = Field(..., pattern="^(stay|swerve)$")
    harmed_group:   str = Field(..., pattern="^(passengers|pedestrians)$")
    harmed_count:   int = Field(..., ge=0)
    scenario_id:    int


class CharacterType(BaseModel):
    name:        str
    category:    str
    description: str


# ============================================================================
# RL Simulation Schemas
# ============================================================================

class RLSimulateRequest(BaseModel):
    """Request body for POST /api/rl/simulate."""
    response_id: str


class RLSimulateResponse(BaseModel):
    """
    Response from the RL simulation pipeline.

    Note: the agent's Q-table is NOT updated at simulate time.
    Call POST /api/rl/feedback after the user gives their verdict.
    """
    action:              str    # "stay" or "swerve" — agent's chosen action
    q_values:            dict   # {"stay": float, "swerve": float}
    credences:           dict   # {"deontological": float, "utilitarian": float}
    human_choice:        str    # majority human choice from CSV
    agent_matches_human: bool
    harmed_group:        str    # "passengers" or "pedestrians"
    harmed_count:        int
    episode_count:       int
    avg_reward:          float
    epsilon:             float
    voting:              dict   # Nash/variance voting result (independent of agent state)


# ============================================================================
# Feedback Schema (kept for manual challenge compatibility)
# ============================================================================

class FeedbackRequest(BaseModel):
    """User verdict on the agent's last simulation."""
    response_id:  str
    agent_action: str  = Field(..., pattern="^(stay|swerve)$")
    user_agrees:  bool


class FeedbackResponse(BaseModel):
    """Result of applying user feedback to the Q-table."""
    reward:         float
    episode_count:  int
    avg_reward:     float
    epsilon:        float
    batch_trained:  bool
    buffer_count:   int


# ============================================================================
# Dataset Run Schema
# ============================================================================

class DatasetRunResponse(BaseModel):
    """
    Result of a dataset-guided rerun.

    The agent uses Nash/variance voting (from CSV credences) as its action,
    trains the Q-table with +1 reward, and returns the updated state.
    """
    action:        str    # Nash/variance recommended action
    q_values:      dict   # updated Q-values after training
    voting:        dict   # voting details (method, split, recommendation, etc.)
    reward:        float  # always +1.0
    harmed_group:  str
    harmed_count:  int
    episode_count: int
    avg_reward:    float
    epsilon:       float


# ============================================================================
# Manual Challenge Schemas
# ============================================================================

class ManualStartRequest(BaseModel):
    """Request N scenarios for the manual challenge."""
    n_scenarios: int = Field(..., ge=10, le=200,
                             description="Number of scenarios (min 10, max 200)")


class ManualStartResponse(BaseModel):
    """List of scenarios returned for the manual challenge."""
    scenarios: List[Dict[str, Any]]


class UserDecision(BaseModel):
    """A single user decision in the manual challenge."""
    response_id: str
    action:      str = Field(..., pattern="^(stay|swerve)$")


class ManualSubmitRequest(BaseModel):
    """Batch of user decisions to train the agent."""
    decisions: List[UserDecision] = Field(..., min_length=1)


class ManualSubmitResponse(BaseModel):
    """Result of submitting manual decisions."""
    saved_count:   int
    trained_count: int
    csv_filename:  str
