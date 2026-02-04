# ---- Stage 1: Builder ----
FROM python:3.13-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /build

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Create virtual environment and install Python deps
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY my_project/requirements.txt .
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ---- Stage 2: Runtime ----
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /app

# Install only runtime dependencies (no build-essential)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

# Copy virtual environment from builder
COPY --from=builder /opt/venv /opt/venv

# Copy project files
COPY my_project/ .

# Create media directory for uploads
RUN mkdir -p media/qrcodes

# Collect static files for whitenoise
RUN python manage.py collectstatic --noinput

EXPOSE 8000

# 1 worker avoids duplicating PyTorch in memory
# 4 threads provide concurrency sharing the same memory space
# max-requests prevents memory leak accumulation
CMD ["sh", "-c", "python manage.py migrate && gunicorn my_project.wsgi:application --bind 0.0.0.0:8000 --workers 1 --threads 4 --timeout 120 --max-requests 200 --max-requests-jitter 50"]
