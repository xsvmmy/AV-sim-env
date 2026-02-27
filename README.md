# Autonomous Vehicle Ethical Dilemma Simulator

A web-based application for configuring and visualizing trolley-problem-style scenarios for autonomous vehicles, designed with extensibility for future reinforcement learning integration.

## Overview

This application allows users to:
- Configure ethical dilemma scenarios with passengers and pedestrians
- Visualize autonomous vehicle decision points
- Simulate outcomes (stay in lane vs. swerve)
- Store and analyze scenario data

## Features

- **Character Selection**: 20 different character types (Man, Woman, Pregnant, Child, Elderly, Professionals, Animals, etc.)
- **Scenario Configuration**: Set up passengers (1-5) and pedestrians (1-5)
- **Traffic Light States**: Red or Green light conditions
- **Visual Simulation**: Top-down intersection view with animated outcomes
- **Data Storage**: Save scenarios in SQLite database for analysis
- **Modular Architecture**: Clean separation for future RL integration

## Architecture

```
├── Backend (FastAPI)
│   ├── API Layer: RESTful endpoints for scenario CRUD
│   ├── Models: Data schemas and validation
│   ├── Database: SQLite storage with SQLAlchemy ORM
│   └── Modules:
│       ├── scenario_config: Scenario validation and management
│       ├── simulation_logic: Decision outcome logic (RL-ready)
│       └── data_storage: Scenario persistence
│
└── Frontend (React + Vite)
    ├── Components:
    │   ├── ScenarioConfig: Character and setup configuration
    │   ├── Visualization: Interactive simulation view
    │   └── CharacterSelector: Character grid interface
    └── Utils: API client and helpers
```

## Prerequisites

- Docker and Docker Compose
- (Optional) Node.js 18+ and Python 3.11+ for local development

## Quick Start

### Using Docker (Recommended)

1. **Clone and navigate to the project:**
   ```bash
   cd sim-env-1
   ```

2. **Build and start the application:**
   ```bash
   docker-compose up --build
   ```

3. **Access the application:**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - API Documentation: http://localhost:8000/docs

4. **Stop the application:**
   ```bash
   docker-compose down
   ```

### Local Development (Without Docker)

#### Backend Setup:
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

#### Frontend Setup:
```bash
cd frontend
npm install
npm run dev
```

## Usage

### 1. Configure a Scenario

- Select characters for "Passengers in Vehicle" (1-5)
- Select characters for "Pedestrians in Crosswalk" (1-5)
- Choose traffic light state (Red or Green)
- Click "Save & Visualize Scenario"

### 2. Run Simulation

- View the top-down intersection visualization
- Choose an outcome:
  - **Stay in Lane**: Vehicle continues, hits pedestrians
  - **Swerve**: Vehicle swerves, hits barrier, harms passengers
- Watch the animated result

### 3. View Saved Scenarios

- Browse previously configured scenarios
- Load scenarios for re-simulation
- Export scenario data as JSON

## API Endpoints

- `GET /api/scenarios` - List all scenarios
- `POST /api/scenarios` - Create new scenario
- `GET /api/scenarios/{id}` - Get scenario by ID
- `PUT /api/scenarios/{id}` - Update scenario
- `DELETE /api/scenarios/{id}` - Delete scenario
- `GET /api/characters` - List available character types

## Data Format

Scenarios are stored in JSON format:
```json
{
  "id": 1,
  "passengers": ["Man", "Woman", "Boy"],
  "pedestrians": ["OldMan", "OldWoman"],
  "traffic_light": "Red",
  "outcome": null,
  "created_at": "2026-02-05T10:30:00"
}
```

## Future RL Integration Points

The application is designed with clear integration points for reinforcement learning:

### 1. **Simulation Logic Module** (`backend/modules/simulation_logic.py`)
   - Current: Rule-based outcome selection
   - Future: RL agent policy network
   - Integration point: `decide_action()` function

### 2. **State Representation**
   - Current: Structured scenario data
   - Future: Feature vector encoding for RL
   - Integration point: `encode_state()` function (marked as TODO)

### 3. **Reward Function**
   - Current: Placeholder in simulation module
   - Future: Ethical reward function based on utilitarian/deontological principles
   - Integration point: `calculate_reward()` function (marked as TODO)

### 4. **Training Data Collection**
   - Scenarios are stored with outcomes
   - Can be exported for offline RL training
   - API endpoint ready for online learning

### 5. **Agent Interface**
   - Add `RLAgent` class to `simulation_logic.py`
   - Load trained model weights
   - Replace rule-based logic with policy queries

## Project Structure

```
.
├── backend/
│   ├── main.py                 # FastAPI application entry point
│   ├── models.py               # Pydantic models and schemas
│   ├── database.py             # SQLAlchemy setup and session management
│   ├── requirements.txt        # Python dependencies
│   ├── routers/
│   │   └── scenarios.py        # Scenario API routes
│   └── modules/
│       ├── scenario_config.py  # Scenario validation and configuration
│       ├── simulation_logic.py # Decision logic (RL integration point)
│       └── data_storage.py     # Database operations
│
├── frontend/
│   ├── public/
│   │   └── index.html          # HTML entry point
│   ├── src/
│   │   ├── App.jsx             # Main React component
│   │   ├── components/
│   │   │   ├── ScenarioConfig.jsx    # Configuration interface
│   │   │   ├── Visualization.jsx     # Simulation visualization
│   │   │   └── CharacterSelector.jsx # Character selection grid
│   │   └── utils/
│   │       └── api.js          # API client functions
│   ├── package.json            # Node dependencies
│   └── vite.config.js          # Vite configuration
│
├── docker-compose.yml          # Multi-container orchestration
├── Dockerfile.backend          # Backend container definition
├── Dockerfile.frontend         # Frontend container definition
└── README.md                   # This file
```

## Technology Stack

- **Backend**: FastAPI (Python 3.11), SQLAlchemy, SQLite
- **Frontend**: React 18, Vite, Vanilla CSS
- **Containerization**: Docker, Docker Compose
- **API**: RESTful with OpenAPI documentation

## Development

### Adding New Character Types

1. Update `VALID_CHARACTERS` in `backend/modules/scenario_config.py`
2. Add character visualization in `frontend/src/components/Visualization.jsx`
3. Update character icons/colors in frontend

### Extending Simulation Logic

The simulation logic module (`backend/modules/simulation_logic.py`) is designed for easy extension:

```python
# Current: Simple outcome determination
def simulate_outcome(scenario, choice):
    # Returns which group was harmed
    pass

# Future: Add RL agent
class RLAgent:
    def __init__(self, model_path):
        # Load trained model
        pass

    def decide_action(self, state):
        # Query policy network
        pass
```

## Testing

Run backend tests:
```bash
cd backend
pytest
```

Run frontend tests:
```bash
cd frontend
npm test
```

## License

MIT License - See LICENSE file for details

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## Acknowledgments

- Inspired by the MIT Moral Machine experiment
- Designed for ethical AI research and education

## Contact

For questions or contributions, please open an issue on the repository.
