@echo off
REM Stop Docker containers for DocManager
echo Stopping DocManager containers...
cd /d "%~dp0.."
docker-compose down
docker-compose -f docker-compose.dev.yml down 2>nul
echo.
echo DocManager containers stopped.
pause
