"""
API routes for Custom Agent training and prediction.
"""

import os
from typing import List
from fastapi import APIRouter, HTTPException, status

from models import (
    TrainCustomAgentRequest,
    CustomAgentInfo,
    CustomAgentPredictRequest,
    CustomAgentPredictResponse,
)
from modules.custom_agent import CustomAgent

router = APIRouter(prefix="/api/custom-model", tags=["custom-model"])

_AGENTS_DIR = os.path.join(os.path.dirname(__file__), "..", "custom_agents")


@router.post("/train", response_model=CustomAgentInfo, status_code=status.HTTP_201_CREATED)
async def train_custom_agent(request: TrainCustomAgentRequest):
    """Train a custom agent from user-labeled scenarios."""
    name = request.name.strip()
    safe_name = "".join(c for c in name if c.isalnum() or c in (" ", "-", "_")).strip()
    if not safe_name:
        raise HTTPException(status_code=400, detail="Agent name contains no valid characters")

    agent = CustomAgent(name=safe_name)
    agent.train([{"choice": e.choice} for e in request.training_data])
    agent.save(os.path.abspath(_AGENTS_DIR))

    return CustomAgentInfo(
        name=agent.name,
        credences=agent.credences,
        training_count=agent.training_count,
        created_at=agent.created_at,
    )


@router.get("/agents", response_model=List[CustomAgentInfo])
async def list_custom_agents():
    """List all saved custom agents."""
    return [
        CustomAgentInfo(**a)
        for a in CustomAgent.list_agents(os.path.abspath(_AGENTS_DIR))
    ]


@router.post("/{agent_name}/predict", response_model=CustomAgentPredictResponse)
async def predict_with_custom_agent(agent_name: str, request: CustomAgentPredictRequest):
    """Run a scenario through a named custom agent."""
    agent = CustomAgent.load(os.path.abspath(_AGENTS_DIR), agent_name)
    if agent is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent '{agent_name}' not found",
        )
    result = agent.predict({
        "passengers":    request.passengers,
        "pedestrians":   request.pedestrians,
        "traffic_light": request.traffic_light,
    })
    return CustomAgentPredictResponse(**result)
