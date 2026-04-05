#!/usr/bin/env bash
# AthlyticAI — Production startup script
# Works with or without Docker.
# Usage:  chmod +x start.sh && ./start.sh

set -euo pipefail

# ── Defaults ─────────────────────────────────────────────
export PORT="${PORT:-8000}"
export PYTHONUNBUFFERED="${PYTHONUNBUFFERED:-1}"
export PYTHONDONTWRITEBYTECODE="${PYTHONDONTWRITEBYTECODE:-1}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# If running outside Docker, set AI_ENGINE_DIR relative to repo root
if [ -z "${AI_ENGINE_DIR:-}" ]; then
    export AI_ENGINE_DIR="${SCRIPT_DIR}/../app"
fi

# Load .env if it exists
if [ -f "${SCRIPT_DIR}/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    source "${SCRIPT_DIR}/.env"
    set +a
fi

# ── Sanity checks ────────────────────────────────────────
if [ -z "${MONGO_URL:-}" ]; then
    echo "ERROR: MONGO_URL is not set. Copy .env.example to .env and fill it in."
    exit 1
fi
if [ -z "${DB_NAME:-}" ]; then
    echo "ERROR: DB_NAME is not set."
    exit 1
fi

echo "Starting AthlyticAI API on port ${PORT} ..."

exec python -m uvicorn backend.server:app \
    --host 0.0.0.0 \
    --port "${PORT}" \
    --workers 2 \
    --log-level info
