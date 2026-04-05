# AthlyticAI Backend — Production Dockerfile
# Targets: linux/arm64 (Oracle Cloud Ampere A1) and linux/amd64
# Build:   docker build -f Playsmart/Dockerfile -t playsmart-backend .
# Run:     docker run --env-file Playsmart/.env -p 8000:8000 playsmart-backend
# (run both commands from the sportsapp/ root directory)

FROM python:3.10-slim AS base

# Prevent Python from writing .pyc files and enable unbuffered output
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# System dependencies required by OpenCV, TensorFlow, and video processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies (backend first, then AI engine)
# NOTE: build context must be the repo root (sportsapp/).
#       docker-compose.yml sets context: .. to make this work.
COPY Playsmart/backend/requirements.txt /app/backend-requirements.txt
RUN pip install --no-cache-dir -r /app/backend-requirements.txt

# AI engine deps — use headless OpenCV (no GUI needed in container)
COPY app/requirements.txt /app/ai-requirements.txt
RUN pip install --no-cache-dir \
    opencv-python-headless==4.9.0.80 \
    tensorflow==2.15.0 \
    tensorflow-hub==0.15.0

# Copy application source
COPY Playsmart/backend/ /app/backend/
COPY app/               /app/ai_engine/

# Production environment defaults
ENV AI_ENGINE_DIR=/app/ai_engine \
    CORS_ORIGINS=* \
    PORT=8000

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:8000/docs || exit 1

# Run uvicorn in production mode (no --reload, 2 workers for Arm VM)
CMD ["python", "-m", "uvicorn", "backend.server:app", \
     "--host", "0.0.0.0", "--port", "8000", "--workers", "2", \
     "--log-level", "info"]
