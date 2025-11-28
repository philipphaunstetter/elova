#!/bin/bash

# Elova Deployment Script
# Handles both development and production deployments

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Function to show usage
show_usage() {
    echo -e "${BLUE}Elova Deployment Script${NC}"
    echo ""
    echo -e "${YELLOW}Usage:${NC}"
    echo "  $0 <command> [options]"
    echo ""
    echo -e "${YELLOW}Commands:${NC}"
    echo "  dev          Start development environment with your real n8n instance"
    echo "  prod         Deploy production environment with Docker"
    echo "  stop         Stop all containers"
    echo "  clean        Clean up containers and images"
    echo "  logs         Show container logs"
    echo "  help         Show this help message"
    echo ""
    echo -e "${YELLOW}Options:${NC}"
    echo "  --follow     Follow logs in real-time (for logs command)"
    echo ""
    echo -e "${YELLOW}Examples:${NC}"
    echo "  $0 dev                 # Start development with real n8n data"
    echo "  $0 prod                # Deploy production"
    echo "  $0 logs --follow       # Show and follow container logs"
}

# Function to start development environment
start_dev() {
    echo -e "${GREEN}🚀 Starting Elova Development Environment${NC}"
    echo -e "${BLUE}This will use your real n8n instance configuration${NC}"
    echo ""
    
    cd "$PROJECT_ROOT"
    
    # Check if .env.development exists
    if [ ! -f ".env.development" ]; then
        echo -e "${RED}❌ .env.development file not found${NC}"
        echo -e "${YELLOW}Please create .env.development with your n8n instance configuration${NC}"
        exit 1
    fi
    
    # Copy development environment
    cp .env.development .env.local
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}📦 Installing dependencies...${NC}"
        npm install
    fi
    
    # Create development data directory
    mkdir -p dev_data
    
    echo -e "${GREEN}✅ Starting development server...${NC}"
    echo -e "${BLUE}🌐 Your app will be available at: http://localhost:3000${NC}"
    echo -e "${BLUE}📊 Using n8n instance: $(grep N8N_HOST .env.development | cut -d'=' -f2)${NC}"
    echo ""
    echo -e "${PURPLE}Press Ctrl+C to stop the development server${NC}"
    
    npm run dev
}

# Function to deploy production environment
start_prod() {
    echo -e "${GREEN}🐳 Deploying Elova Production Environment${NC}"
    echo ""
    
    cd "$PROJECT_ROOT"
    
    # Check if production environment exists
    if [ ! -f ".env.production" ]; then
        if [ -f ".env.production.template" ]; then
            echo -e "${YELLOW}⚠️  .env.production not found. Creating from template...${NC}"
            cp .env.production.template .env.production
            echo -e "${RED}⚠️  IMPORTANT: Edit .env.production and set secure passwords!${NC}"
            echo -e "${BLUE}   File location: $PROJECT_ROOT/.env.production${NC}"
            echo ""
            read -p "Press Enter to continue after editing .env.production..."
        else
            echo -e "${RED}❌ .env.production.template file not found${NC}"
            exit 1
        fi
    fi
    
    # Source production environment
    set -a
    source .env.production
    set +a
    
    # Create backup directories
    mkdir -p backups/postgres
    
    echo -e "${GREEN}✅ Starting production containers...${NC}"
    docker-compose -f docker-compose.production.yml up -d
    
    echo ""
    echo -e "${GREEN}🎉 Elova Production Environment Started!${NC}"
    echo -e "${BLUE}🌐 Application URL: http://localhost:${PORT:-3000}${NC}"
    echo -e "${BLUE}📊 Health Check: http://localhost:${PORT:-3000}/api/health${NC}"
    echo ""
    echo -e "${YELLOW}📋 Next Steps:${NC}"
    echo "1. Open the application URL in your browser"
    echo "2. Complete the setup wizard to configure your n8n integration"
    echo "3. Set ENABLE_SETUP_WIZARD=false in .env.production after setup"
    echo ""
    echo -e "${PURPLE}Use '$0 logs --follow' to monitor container logs${NC}"
}

# Function to show logs
show_logs() {
    echo -e "${YELLOW}🛑 Stopping Elova containers...${NC}"
    cd "$PROJECT_ROOT"
    
    # Stop production containers
    if [ -f "docker-compose.production.yml" ]; then
        docker-compose -f docker-compose.production.yml down
    fi
    
    # Stop development containers (if any)
    if [ -f "docker-compose.yml" ]; then
        docker-compose down 2>/dev/null || true
    fi
    
    echo -e "${GREEN}✅ Containers stopped${NC}"
}

# Function to show logs
show_logs() {
    cd "$PROJECT_ROOT"
    
    if [[ "$1" == "--follow" ]]; then
        echo -e "${BLUE}📋 Following container logs... (Press Ctrl+C to stop)${NC}"
        docker-compose -f docker-compose.production.yml logs -f
    else
        echo -e "${BLUE}📋 Container logs:${NC}"
        docker-compose -f docker-compose.production.yml logs
    fi
}

# Function to clean up
cleanup() {
    echo -e "${YELLOW}🧹 Cleaning up Elova containers and images...${NC}"
    cd "$PROJECT_ROOT"
    
    # Stop containers
    stop_containers
    
    # Remove images
    docker images --format "table {{.Repository}}\t{{.Tag}}" | grep "^newflowio/elova" | while read -r repo tag; do
        if [ "$repo" != "REPOSITORY" ]; then
            echo -e "${YELLOW}Removing image: ${repo}:${tag}${NC}"
            docker rmi "${repo}:${tag}" 2>/dev/null || true
        fi
    done
    
    echo -e "${GREEN}✅ Cleanup completed${NC}"
}

# Main script logic
case "${1:-help}" in
    "dev")
        start_dev
        ;;
    "prod")
        start_prod "$2"
        ;;
    "stop")
        stop_containers
        ;;
    "logs")
        show_logs "$2"
        ;;
    "clean")
        cleanup
        ;;
    "help"|"--help"|"-h")
        show_usage
        ;;
    *)
        echo -e "${RED}❌ Unknown command: $1${NC}"
        echo ""
        show_usage
        exit 1
        ;;
esac