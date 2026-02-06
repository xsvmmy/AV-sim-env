# Quick Start Guide

Get the AV Ethics Simulator up and running in minutes!

## Prerequisites

- Docker and Docker Compose installed
- 4GB free disk space
- Internet connection (for initial build)

## Installation Steps

### 1. Navigate to Project Directory

```bash
cd sim-env-1
```

### 2. Start the Application

```bash
docker-compose up --build
```

This command will:
- Build the backend container (FastAPI + Python)
- Build the frontend container (React + Nginx)
- Start both services
- Initialize the database

**First build takes ~3-5 minutes**. Subsequent starts are much faster!

### 3. Access the Application

Once you see these messages:
```
backend  | INFO:     Application startup complete.
frontend | /docker-entrypoint.sh: Configuration complete
```

Open your browser to:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

## Using the Application

### Create a Scenario

1. **Select Passengers** (1-5 characters)
   - Click on character cards to select
   - Selected characters show a checkmark
   - Maximum 5 can be selected

2. **Select Pedestrians** (1-5 characters)
   - Same process as passengers
   - Choose different or same character types

3. **Choose Traffic Light**
   - Click either "Red Light" or "Green Light"

4. **Save & Visualize**
   - Click "Save & Visualize Scenario"
   - System creates and saves the scenario

### Run Simulation

1. **View Visualization**
   - Top-down intersection view
   - See vehicle with passengers
   - See pedestrians in crosswalk
   - Traffic light displayed

2. **Make Decision**
   - Click "Stay in Lane" (hits pedestrians)
   - OR click "Swerve" (hits barrier, harms passengers)

3. **See Results**
   - Animation shows outcome
   - Results panel displays:
     - Action taken
     - Group harmed
     - Number harmed

4. **Continue**
   - Try different outcome
   - Create new scenario

## Common Commands

### Start Application
```bash
docker-compose up
```

### Start in Background
```bash
docker-compose up -d
```

### Stop Application
```bash
docker-compose down
```

### View Logs
```bash
# All services
docker-compose logs -f

# Backend only
docker-compose logs -f backend

# Frontend only
docker-compose logs -f frontend
```

### Rebuild After Code Changes
```bash
docker-compose up --build
```

### Reset Database
```bash
# Stop containers
docker-compose down

# Remove database volume
rm -rf data/

# Restart
docker-compose up
```

## Development Mode

### Backend Development

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend Development

```bash
cd frontend
npm install
npm run dev
```

Frontend will be at http://localhost:5173 (Vite default)

## API Quick Reference

### Get Characters
```bash
curl http://localhost:8000/api/characters
```

### Create Scenario
```bash
curl -X POST http://localhost:8000/api/scenarios \
  -H "Content-Type: application/json" \
  -d '{
    "passengers": ["Man", "Woman"],
    "pedestrians": ["Boy", "Girl"],
    "traffic_light": "Red"
  }'
```

### List Scenarios
```bash
curl http://localhost:8000/api/scenarios
```

### Run Simulation
```bash
curl -X POST "http://localhost:8000/api/scenarios/1/simulate?action=stay"
```

### Get Statistics
```bash
curl http://localhost:8000/api/statistics
```

## Troubleshooting

### Port Already in Use

If port 3000 or 8000 is already in use:

1. Edit `docker-compose.yml`
2. Change ports:
   ```yaml
   ports:
     - "3001:3000"  # Frontend
     - "8001:8000"  # Backend
   ```

### Cannot Connect to Backend

1. Check backend is running:
   ```bash
   docker-compose ps
   ```

2. Check backend logs:
   ```bash
   docker-compose logs backend
   ```

3. Verify health:
   ```bash
   curl http://localhost:8000/health
   ```

### Database Issues

Reset database:
```bash
docker-compose down
rm -rf data/
docker-compose up
```

### Build Failures

Clear Docker cache:
```bash
docker-compose down
docker system prune -a
docker-compose up --build
```

## Next Steps

- Read [README.md](README.md) for full documentation
- Check [RL_INTEGRATION_GUIDE.md](RL_INTEGRATION_GUIDE.md) for RL integration
- Explore API documentation at http://localhost:8000/docs
- Create diverse scenarios and analyze patterns

## Support

For issues:
1. Check logs: `docker-compose logs`
2. Verify ports are free: `lsof -i :3000` and `lsof -i :8000`
3. Ensure Docker daemon is running
4. Try rebuilding: `docker-compose up --build`

Happy simulating!
