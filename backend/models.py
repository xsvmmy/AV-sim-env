"""
Data models and schemas for the AV Ethics Simulator.

This module defines:
1. SQLAlchemy ORM models for database tables
2. Pydantic schemas for API request/response validation
"""

from datetime import datetime
from typing import List, Optional
from sqlalchemy import Column, Integer, String, DateTime, JSON
from pydantic import BaseModel, Field, validator
from database import Base


# ============================================================================
# SQLAlchemy ORM Models (Database Tables)
# ============================================================================

class ScenarioDB(Base):
    """
    Database model for storing ethical dilemma scenarios.

    Stores the complete scenario configuration including:
    - Passengers in vehicle
    - Pedestrians in crosswalk
    - Traffic light state
    - Outcome choice (if simulation was run)
    """
    __tablename__ = "scenarios"

    id = Column(Integer, primary_key=True, index=True)
    passengers = Column(JSON, nullable=False)  # List of character types
    pedestrians = Column(JSON, nullable=False)  # List of character types
    traffic_light = Column(String, nullable=False)  # "Red" or "Green"
    outcome = Column(String, nullable=True)  # "stay" or "swerve" (null if not simulated)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Future RL integration: Add columns for
    # - state_encoding (vector representation)
    # - action_taken (agent decision)
    # - reward_received (ethical score)
    # - agent_version (model version that made decision)


# ============================================================================
# Pydantic Schemas (API Request/Response Validation)
# ============================================================================

class ScenarioBase(BaseModel):
    """Base schema with common scenario fields."""
    passengers: List[str] = Field(
        ...,
        min_length=1,
        max_length=5,
        description="List of 1-5 passenger character types"
    )
    pedestrians: List[str] = Field(
        ...,
        min_length=1,
        max_length=5,
        description="List of 1-5 pedestrian character types"
    )
    traffic_light: str = Field(
        ...,
        pattern="^(Red|Green)$",
        description="Traffic light state: Red or Green"
    )

    @validator('passengers', 'pedestrians')
    def validate_character_list(cls, v):
        """Ensure at least one character is provided."""
        if not v or len(v) == 0:
            raise ValueError('At least one character must be provided')
        if len(v) > 5:
            raise ValueError('Maximum 5 characters allowed')
        return v


class ScenarioCreate(ScenarioBase):
    """Schema for creating a new scenario (POST request)."""
    pass


class ScenarioUpdate(BaseModel):
    """
    Schema for updating an existing scenario (PUT request).
    All fields are optional to allow partial updates.
    """
    passengers: Optional[List[str]] = Field(None, min_length=1, max_length=5)
    pedestrians: Optional[List[str]] = Field(None, min_length=1, max_length=5)
    traffic_light: Optional[str] = Field(None, pattern="^(Red|Green)$")
    outcome: Optional[str] = Field(None, pattern="^(stay|swerve)$")


class ScenarioResponse(ScenarioBase):
    """
    Schema for scenario response (GET request).
    Includes all fields from database model.
    """
    id: int
    outcome: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True  # Allows creating from ORM model


class SimulationOutcome(BaseModel):
    """
    Schema for simulation results.

    This is returned after a user selects an outcome (stay/swerve).
    Future RL integration: This will include agent decision confidence,
    reward signal, and policy information.
    """
    outcome_choice: str = Field(..., pattern="^(stay|swerve)$")
    harmed_group: str = Field(..., pattern="^(passengers|pedestrians)$")
    harmed_count: int = Field(..., ge=0)
    scenario_id: int

    # Placeholders for future RL integration
    # agent_confidence: float = 0.0
    # reward: float = 0.0
    # policy_info: dict = {}


class CharacterType(BaseModel):
    """Schema for character type information."""
    name: str
    category: str  # e.g., "adult", "child", "elderly", "animal", "professional"
    description: str


# ============================================================================
# RL / CSV Simulation Schemas
# ============================================================================

class RLSimulateRequest(BaseModel):
    """Request body for POST /api/rl/simulate."""
    response_id: str


class RLSimulateResponse(BaseModel):
    """Response from the RL simulation pipeline."""
    action: str                    # "stay" or "swerve" (agent's chosen action)
    voting_method: str             # "nash" or "variance"
    credence_dispersion: float
    credences: dict                # {"deontological": x, "utilitarian": y}
    q_values: dict                 # per-theory per-action values
    reward: float
    human_choice: str              # "stay" or "swerve" from CSV majority
    agent_matches_human: bool
    harmed_group: str              # "passengers" or "pedestrians"
    harmed_count: int
    episode_count: int
    avg_reward: float
    epsilon: float
