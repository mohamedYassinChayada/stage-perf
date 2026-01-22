#!/bin/bash
# Start Docker containers for DocManager (Production)
echo "Starting DocManager containers (Production mode)..."
cd "$(dirname "$0")/.."
docker-compose up -d --build
echo ""
echo "DocManager is starting..."
echo "Frontend: http://localhost (port 80)"
echo "Backend API: http://localhost:8000"
echo ""
echo "Use 'docker-compose logs -f' to view logs"
echo "Use 'docker-compose down' to stop"
