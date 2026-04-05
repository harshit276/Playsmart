FROM python:3.10-slim

# Install system deps for OpenCV
RUN apt-get update && apt-get install -y \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy AI engine first (cached layer)
COPY ../app /ai_engine

# Copy backend
COPY backend/ /app/

# Install all Python dependencies
COPY backend/requirements.txt /app/requirements.txt
COPY app/requirements.txt /app/ai_requirements.txt
RUN pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir -r ai_requirements.txt

# Set AI engine path
ENV AI_ENGINE_DIR=/ai_engine
ENV PORT=8000

EXPOSE 8000

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
