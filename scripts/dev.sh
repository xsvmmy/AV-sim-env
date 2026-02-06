#!/bin/bash

# Development helper script for AV Ethics Simulator

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print colored messages
print_info() {
    echo -e "${BLUE}ℹ ${1}${NC}"
}

print_success() {
    echo -e "${GREEN}✓ ${1}${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ ${1}${NC}"
}

print_error() {
    echo -e "${RED}✗ ${1}${NC}"
}

# Function to check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker and try again."
        exit 1
    fi
    print_success "Docker is running"
}

# Function to start the application
start() {
    print_info "Starting AV Ethics Simulator..."
    check_docker
    docker-compose up
}

# Function to start in detached mode
start_detached() {
    print_info "Starting AV Ethics Simulator in background..."
    check_docker
    docker-compose up -d
    print_success "Application started!"
    print_info "Frontend: http://localhost:3000"
    print_info "Backend: http://localhost:8000"
    print_info "API Docs: http://localhost:8000/docs"
}

# Function to stop the application
stop() {
    print_info "Stopping AV Ethics Simulator..."
    docker-compose down
    print_success "Application stopped"
}

# Function to rebuild and start
rebuild() {
    print_info "Rebuilding and starting AV Ethics Simulator..."
    check_docker
    docker-compose down
    docker-compose up --build
}

# Function to view logs
logs() {
    if [ -z "$1" ]; then
        docker-compose logs -f
    else
        docker-compose logs -f "$1"
    fi
}

# Function to reset database
reset_db() {
    print_warning "This will delete all scenario data. Are you sure? (y/N)"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        print_info "Stopping containers..."
        docker-compose down
        print_info "Removing database..."
        rm -rf data/
        print_success "Database reset complete"
        print_info "Restart the application to create a fresh database"
    else
        print_info "Database reset cancelled"
    fi
}

# Function to run backend tests
test_backend() {
    print_info "Running backend tests..."
    docker-compose exec backend pytest
}

# Function to export scenarios
export_data() {
    print_info "Exporting scenarios..."
    curl -s http://localhost:8000/api/export/json | jq .
    print_success "Export complete. Check scenarios_export.json"
}

# Function to show statistics
stats() {
    print_info "Fetching statistics..."
    curl -s http://localhost:8000/api/statistics | jq .
}

# Function to create a test scenario
create_test_scenario() {
    print_info "Creating test scenario..."
    curl -X POST http://localhost:8000/api/scenarios \
        -H "Content-Type: application/json" \
        -d '{
            "passengers": ["Man", "Woman"],
            "pedestrians": ["Boy", "Girl", "OldMan"],
            "traffic_light": "Red"
        }' | jq .
    print_success "Test scenario created"
}

# Function to clean Docker resources
clean() {
    print_warning "This will remove all stopped containers, networks, and build cache. Continue? (y/N)"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        print_info "Cleaning Docker resources..."
        docker-compose down
        docker system prune -af
        print_success "Cleanup complete"
    else
        print_info "Cleanup cancelled"
    fi
}

# Function to show help
show_help() {
    cat << EOF
${GREEN}AV Ethics Simulator - Development Helper${NC}

${BLUE}Usage:${NC}
    ./scripts/dev.sh [command]

${BLUE}Commands:${NC}
    ${GREEN}start${NC}           Start the application (foreground)
    ${GREEN}start-bg${NC}        Start the application (background)
    ${GREEN}stop${NC}            Stop the application
    ${GREEN}rebuild${NC}         Rebuild and start the application
    ${GREEN}logs${NC} [service]  View logs (optional: backend/frontend)
    ${GREEN}reset-db${NC}        Reset the database (WARNING: deletes all data)
    ${GREEN}test${NC}            Run backend tests
    ${GREEN}export${NC}          Export scenarios to JSON
    ${GREEN}stats${NC}           Show statistics
    ${GREEN}test-create${NC}     Create a test scenario via API
    ${GREEN}clean${NC}           Clean Docker resources
    ${GREEN}help${NC}            Show this help message

${BLUE}Examples:${NC}
    ./scripts/dev.sh start
    ./scripts/dev.sh logs backend
    ./scripts/dev.sh stats
    ./scripts/dev.sh rebuild

${BLUE}Quick Access:${NC}
    Frontend:  http://localhost:3000
    Backend:   http://localhost:8000
    API Docs:  http://localhost:8000/docs
EOF
}

# Main script logic
case "$1" in
    start)
        start
        ;;
    start-bg)
        start_detached
        ;;
    stop)
        stop
        ;;
    rebuild)
        rebuild
        ;;
    logs)
        logs "$2"
        ;;
    reset-db)
        reset_db
        ;;
    test)
        test_backend
        ;;
    export)
        export_data
        ;;
    stats)
        stats
        ;;
    test-create)
        create_test_scenario
        ;;
    clean)
        clean
        ;;
    help|--help|-h|"")
        show_help
        ;;
    *)
        print_error "Unknown command: $1"
        echo ""
        show_help
        exit 1
        ;;
esac
