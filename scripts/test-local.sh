#!/bin/bash

# Elova Local Testing Script
# Builds and runs the application in a temporary directory to keep the dev repo clean.

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

TEST_DIR="/tmp/elova-local-test"
REPO_DIR=$(pwd)

echo -e "${BLUE}Preparing local test environment...${NC}"

# Cleanup previous test
if [ -d "$TEST_DIR" ]; then
    echo "Cleaning up previous test environment..."
    rm -rf "$TEST_DIR"
fi

mkdir -p "$TEST_DIR"

echo "Copying files to $TEST_DIR..."

# Copy essential files for build
cp package.json package-lock.json "$TEST_DIR/"
cp Dockerfile docker-compose.yml "$TEST_DIR/"
cp next.config.ts tsconfig.json postcss.config.mjs tailwind.config.ts eslint.config.mjs "$TEST_DIR/"
cp -r src "$TEST_DIR/"
cp -r public "$TEST_DIR/"

# Copy database directory if it exists (schema/migrations)
if [ -d "database" ]; then
    cp -r database "$TEST_DIR/"
fi

# Copy .env.local if exists, otherwise .env.example
if [ -f ".env.local" ]; then
    cp .env.local "$TEST_DIR/.env"
elif [ -f ".env.example" ]; then
    cp .env.example "$TEST_DIR/.env"
    echo -e "${GREEN}Using .env.example (rename to .env.local in dev repo to use custom settings)${NC}"
fi

# Switch to test directory
cd "$TEST_DIR"

echo -e "${BLUE}Building Docker image...${NC}"
docker build -t elova:local .

echo -e "${BLUE}Starting container...${NC}"
# Run with docker compose but override image to use the local build
# We use a simplified compose configuration for testing
cat > docker-compose.test.yml <<EOF
services:
  app:
    image: elova:local
    ports:
      - "3000:3000"
    env_file:
      - .env
    environment:
      - NEXT_PUBLIC_ENABLE_DEMO_MODE=true
    volumes:
      - ./app-data:/app/data
EOF

echo -e "${GREEN}Starting application on http://localhost:3000${NC}"
echo "Press Ctrl+C to stop"

docker compose -f docker-compose.test.yml up

# Cleanup on exit
# Note: This trap won't execute if the script is killed with SIGKILL, but Ctrl+C (SIGINT) works.
trap "echo 'Stopping containers...'; docker compose -f docker-compose.test.yml down" EXIT
