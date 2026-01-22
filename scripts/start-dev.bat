@echo off
REM Start Docker containers for DocManager (Development with hot reload)
echo Starting DocManager containers (Development mode with hot reload)...
cd /d "%~dp0.."
docker-compose -f docker-compose.dev.yml up -d --build
echo.
echo DocManager is starting in development mode...
echo Frontend: http://localhost:5173
echo Backend API: http://localhost:8000
echo.
echo Use 'docker-compose -f docker-compose.dev.yml logs -f' to view logs
echo Use 'docker-compose -f docker-compose.dev.yml down' to stop
pause
