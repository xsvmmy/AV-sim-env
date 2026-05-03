"""
API routes for Custom Agent training and prediction.
"""

import os
from pathlib import Path
from typing import List
from fastapi import APIRouter, HTTPException, status

from models import (
    TrainCustomAgentRequest,
    CustomAgentInfo,
    CustomAgentPredictRequest,
    CustomAgentPredictResponse,
    HumanFeedbackRequest,
    HumanFeedbackResponse,
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


@router.delete("/{agent_name}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_custom_agent(agent_name: str):
    """Delete a saved custom agent by name."""
    path = Path(os.path.abspath(_AGENTS_DIR)) / f"{agent_name}.json"
    if not path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent '{agent_name}' not found",
        )
    path.unlink()


@router.post("/{agent_name}/feedback", response_model=HumanFeedbackResponse)
async def apply_human_feedback(agent_name: str, request: HumanFeedbackRequest):
    """Nudge agent credences based on a single human feedback choice."""
    agent = CustomAgent.load(os.path.abspath(_AGENTS_DIR), agent_name)
    if agent is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent '{agent_name}' not found",
        )
    old_credences = dict(agent.credences)
    agent.apply_feedback(request.human_choice, request.alpha)
    agent.save(os.path.abspath(_AGENTS_DIR))
    delta = {k: round(agent.credences[k] - old_credences[k], 6) for k in old_credences}
    return HumanFeedbackResponse(
        name=agent.name,
        updated_credences=agent.credences,
        credence_delta=delta,
    )


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
