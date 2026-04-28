#!/usr/bin/env bash
set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
VENV_DIR="$BACKEND_DIR/venv"

info()    { echo -e "${BLUE}[INFO]  $1${NC}"; }
success() { echo -e "${GREEN}[OK]    $1${NC}"; }
error()   { echo -e "${RED}[ERROR] $1${NC}"; }

BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
    echo ""
    info "Shutting down..."
    [ -n "$BACKEND_PID" ]  && kill "$BACKEND_PID"  2>/dev/null && info "Backend stopped"
    [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null && info "Frontend stopped"
    exit 0
}
trap cleanup INT TERM

# ── Python venv ───────────────────────────────────────────────────────────────
if [ ! -d "$VENV_DIR" ]; then
    info "Creating Python virtual environment..."
    python3 -m venv "$VENV_DIR"
    success "Virtual environment created"
fi

info "Installing Python dependencies..."
source "$VENV_DIR/bin/activate"
pip install -q -r "$SCRIPT_DIR/requirements.txt"
success "Python dependencies ready"

# ── Frontend dependencies ─────────────────────────────────────────────────────
if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
    info "Installing frontend dependencies..."
    npm --prefix "$FRONTEND_DIR" install
    success "Frontend dependencies installed"
fi

# ── Start backend ─────────────────────────────────────────────────────────────
info "Starting backend..."
cd "$BACKEND_DIR"
uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!
cd "$SCRIPT_DIR"

sleep 2

# ── Start frontend ────────────────────────────────────────────────────────────
info "Starting frontend..."
npm --prefix "$FRONTEND_DIR" run dev &
FRONTEND_PID=$!

echo ""
success "Application running"
echo -e "  Frontend : ${GREEN}http://localhost:3000${NC}"
echo -e "  Backend  : ${GREEN}http://localhost:8000${NC}"
echo -e "  API docs : ${GREEN}http://localhost:8000/docs${NC}"
echo ""
info "Press Ctrl+C to stop"

wait $BACKEND_PID $FRONTEND_PID
