# Docker Setup for DocManager

This document provides instructions for running the DocManager application using Docker.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) installed
- [Docker Compose](https://docs.docker.com/compose/install/) installed (included with Docker Desktop)

## Project Structure

```
stage-perf/
├── backend/
│   ├── Dockerfile          # Django backend container
│   ├── .dockerignore
│   └── my_project/
│       └── .env            # Database URL (required)
├── frontend/
│   ├── Dockerfile          # React frontend container
│   ├── .dockerignore
│   └── nginx.conf          # Nginx config for production
├── docker-compose.yml      # Production configuration
├── docker-compose.dev.yml  # Development configuration
└── scripts/
    ├── start.bat           # Start production (Windows)
    ├── start-dev.bat       # Start development (Windows)
    ├── start.sh            # Start production (Linux/Mac)
    ├── start-dev.sh        # Start development (Linux/Mac)
    └── stop.bat            # Stop containers (Windows)
```

## Quick Start

### Windows

**Production Mode:**
```cmd
scripts\start.bat
```

**Development Mode (with hot reload):**
```cmd
scripts\start-dev.bat
```

**Stop Containers:**
```cmd
scripts\stop.bat
```

### Linux/Mac

**Production Mode:**
```bash
chmod +x scripts/*.sh
./scripts/start.sh
```

**Development Mode (with hot reload):**
```bash
./scripts/start-dev.sh
```

**Stop Containers:**
```bash
docker-compose down 
```

## Docker Commands Reference

### Production Mode

| Command | Description |
|---------|-------------|
| `docker-compose up -d --build` | Build and start containers in background |
| `docker-compose up --build` | Build and start containers (foreground with logs) |
| `docker-compose down` | Stop and remove containers |
| `docker-compose logs -f` | View logs (follow mode) |
| `docker-compose logs backend` | View backend logs only |
| `docker-compose logs frontend` | View frontend logs only |
| `docker-compose ps` | List running containers |
| `docker-compose restart` | Restart all containers |
| `docker-compose restart backend` | Restart backend only |

### Development Mode

| Command | Description |
|---------|-------------|
| `docker-compose -f docker-compose.dev.yml up -d --build` | Build and start dev containers |
| `docker-compose -f docker-compose.dev.yml down` | Stop dev containers |
| `docker-compose -f docker-compose.dev.yml logs -f` | View dev logs |
| `docker-compose -f docker-compose.dev.yml restart` | Restart dev containers |

### Container Management

| Command | Description |
|---------|-------------|
| `docker-compose exec backend bash` | Open shell in backend container |
| `docker-compose exec frontend sh` | Open shell in frontend container |
| `docker-compose exec backend python manage.py migrate` | Run Django migrations |
| `docker-compose exec backend python manage.py createsuperuser` | Create admin user |
| `docker-compose exec backend python manage.py shell` | Django shell |

### Cleanup

| Command | Description |
|---------|-------------|
| `docker-compose down -v` | Stop containers and remove volumes |
| `docker-compose down --rmi all` | Stop and remove images |
| `docker system prune -a` | Clean up unused Docker resources |

## URLs

### Production Mode
- **Frontend**: http://localhost (port 80)
- **Backend API**: http://localhost:8000
- **Swagger Docs**: http://localhost:8000/swagger/

### Development Mode
- **Frontend**: http://localhost:5173 (Vite dev server with hot reload)
- **Backend API**: http://localhost:8000
- **Swagger Docs**: http://localhost:8000/swagger/

## Environment Variables

### Backend (.env file in backend/my_project/)

```env
DATABASE_URL='postgresql://user:password@host/database?sslmode=require'
```

The backend container uses the `.env` file for database configuration. Make sure this file exists before starting containers.

### Frontend (Build-time variables)

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API URL | `http://localhost:8000/api` |

In production mode with nginx, API requests are proxied through nginx, so you don't need to change this.

## Troubleshooting

### Container won't start
```bash
# Check logs for errors
docker-compose logs

# Rebuild containers
docker-compose down
docker-compose up -d --build
```

### Database connection issues
```bash
# Verify .env file exists
cat backend/my_project/.env

# Test connection from container
docker-compose exec backend python manage.py check
```

### Frontend not loading
```bash
# Check if nginx is running (production)
docker-compose logs frontend

# Check if build succeeded
docker-compose exec frontend ls /usr/share/nginx/html
```

### Hot reload not working (dev mode)
```bash
# Restart with fresh volumes
docker-compose -f docker-compose.dev.yml down -v
docker-compose -f docker-compose.dev.yml up -d --build
```

### Port already in use
```bash
# Find process using port
netstat -ano | findstr :8000   # Windows
lsof -i :8000                  # Linux/Mac

# Or use different ports in docker-compose.yml
```

## Building for Production

### Build images only (without starting)
```bash
docker-compose build
```

### Tag and push to registry
```bash
docker tag docmanager-backend your-registry/docmanager-backend:latest
docker tag docmanager-frontend your-registry/docmanager-frontend:latest
docker push your-registry/docmanager-backend:latest
docker push your-registry/docmanager-frontend:latest
```

## Resource Usage

The backend container uses significant resources due to:
- PyTorch (for EasyOCR)
- OpenCV
- PDF processing libraries

Recommended minimum:
- **Memory**: 4GB RAM
- **CPU**: 2 cores
- **Disk**: 5GB for images and dependencies

## Security Notes

- The `.env` file contains sensitive database credentials - never commit it to version control
- In production, consider using Docker secrets or external secret management
- The development configuration (`docker-compose.dev.yml`) mounts source code - don't use in production
- Review nginx.conf security headers before deploying
