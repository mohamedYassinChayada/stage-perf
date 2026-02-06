# Diagramme de Deploiement

Ce diagramme illustre l'architecture de deploiement de l'application en production.

```mermaid
graph TB
    subgraph "Client"
        Browser["fa:fa-globe Navigateur Web<br/>(Chrome, Firefox, Safari)"]
    end

    subgraph "Vercel (Frontend)"
        CDN["CDN Global Vercel"]
        SPA["SPA React/TypeScript<br/>Build Vite<br/>vercel.json (SPA rewrites)"]
        CDN --> SPA
    end

    subgraph "Microsoft Azure (Backend)"
        subgraph "Azure Container Apps"
            Ingress["Ingress HTTPS<br/>(TLS termination)"]
            Container["Conteneur Docker"]
            subgraph "Container Runtime"
                Gunicorn["Gunicorn WSGI<br/>1 worker / 4 threads"]
                Django["Django 5.2<br/>REST Framework"]
                WhiteNoise["WhiteNoise<br/>(static files)"]
                EasyOCR["EasyOCR Engine"]
            end
        end
    end

    subgraph "GitHub (CI/CD)"
        Repo["Repository GitHub"]
        Actions["GitHub Actions<br/>Workflow"]
        GHCR["GitHub Container<br/>Registry (GHCR)"]
        Repo --> Actions
        Actions -->|"docker build & push"| GHCR
        Actions -->|"az containerapp update"| Container
    end

    subgraph "Neon Cloud (Database)"
        PG["PostgreSQL 15+<br/>Serverless"]
    end

    Browser -->|"HTTPS"| CDN
    SPA -->|"API REST HTTPS<br/>(CORS enabled)"| Ingress
    Ingress --> Gunicorn
    Gunicorn --> Django
    Django --> WhiteNoise
    Django --> EasyOCR
    Django -->|"SSL (sslmode=require)"| PG
    GHCR -->|"Pull image"| Container

    style Browser fill:#e1f5fe,stroke:#0288d1
    style CDN fill:#f3e5f5,stroke:#7b1fa2
    style SPA fill:#f3e5f5,stroke:#7b1fa2
    style Ingress fill:#e8f5e9,stroke:#388e3c
    style Container fill:#e8f5e9,stroke:#388e3c
    style Gunicorn fill:#c8e6c9,stroke:#388e3c
    style Django fill:#c8e6c9,stroke:#388e3c
    style WhiteNoise fill:#c8e6c9,stroke:#388e3c
    style EasyOCR fill:#c8e6c9,stroke:#388e3c
    style PG fill:#fff3e0,stroke:#f57c00
    style Repo fill:#fce4ec,stroke:#c62828
    style Actions fill:#fce4ec,stroke:#c62828
    style GHCR fill:#fce4ec,stroke:#c62828
```

## Description des composants

| Composant | Service Cloud | Role |
|-----------|--------------|------|
| Frontend SPA | **Vercel** | Hebergement du build React/Vite avec CDN global, deploiement automatique depuis la branche `main`, rewrites SPA pour le routage client-side |
| Backend API | **Azure Container Apps** | Execution du conteneur Docker avec Gunicorn, auto-scaling, terminaison TLS a l'ingress, variables d'environnement configurees |
| Base de donnees | **Neon Cloud** | PostgreSQL serverless avec connexion SSL, haute disponibilite, stockage des donnees applicatives et des avatars (base64) |
| Registry | **GitHub Container Registry** | Stockage des images Docker taguees par SHA de commit |
| CI/CD | **GitHub Actions** | Pipeline automatise : build de l'image Docker, push vers GHCR, deploiement sur Azure Container Apps |

## Flux de deploiement

```mermaid
sequenceDiagram
    actor Dev as Developpeur
    participant GH as GitHub
    participant GA as GitHub Actions
    participant GHCR as GHCR
    participant Azure as Azure Container Apps

    Dev->>GH: git push (branche main)
    GH->>GA: Declencher workflow
    GA->>GA: Checkout du code
    GA->>GA: docker build (backend)
    GA->>GHCR: docker push image:sha
    GA->>Azure: az containerapp update --image
    Azure->>GHCR: Pull nouvelle image
    Azure->>Azure: Demarrer nouveau conteneur
    Azure->>Azure: python manage.py migrate
    Azure->>Azure: gunicorn --bind 0.0.0.0:8000
    Note over Azure: Backend operationnel
```

## Variables d'environnement en production

| Variable | Service | Description |
|----------|---------|-------------|
| `DATABASE_URL` | Azure Container Apps | URL de connexion Neon PostgreSQL (avec sslmode=require) |
| `DJANGO_SECRET_KEY` | Azure Container Apps | Cle secrete Django pour la production |
| `ALLOWED_HOSTS` | Azure Container Apps | Domaines autorises (domaine Azure Container Apps) |
| `CORS_ALLOWED_ORIGINS` | Azure Container Apps | Origines CORS autorisees (https://stage-perf.vercel.app) |
| `CSRF_TRUSTED_ORIGINS` | Azure Container Apps | Origines CSRF de confiance |
| `VITE_API_URL` | Vercel | URL de l'API backend Azure |
