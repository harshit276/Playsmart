#!/bin/bash
# ============================================================
# AthlyticAI - Update/Deploy Script
# Pulls latest code, installs deps, restarts service
# Usage: sudo bash update.sh [--skip-deps]
# ============================================================

set -euo pipefail

APP_DIR="/opt/playsmart"
SERVICE_NAME="playsmart"
SKIP_DEPS=false

# Parse args
for arg in "$@"; do
    case $arg in
        --skip-deps) SKIP_DEPS=true ;;
    esac
done

echo "=========================================="
echo "  AthlyticAI Update"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================="

# ─── 1. Pull Latest Code ───
echo "[1/4] Pulling latest code..."
cd ${APP_DIR}

if [ -d ".git" ]; then
    git fetch origin
    git pull origin main
else
    echo "  WARNING: Not a git repo. Copy updated files manually:"
    echo "    - backend/ -> ${APP_DIR}/backend/"
    echo "    - app/ -> ${APP_DIR}/ai_engine/ (if applicable)"
    echo "  Then re-run this script with --skip-deps or without."
fi

# ─── 2. Install Dependencies ───
if [ "$SKIP_DEPS" = false ]; then
    echo "[2/4] Installing dependencies..."
    source ${APP_DIR}/venv/bin/activate
    pip install -r ${APP_DIR}/backend/requirements.txt --quiet

    if [ -f "${APP_DIR}/ai_engine/requirements.txt" ]; then
        pip install -r ${APP_DIR}/ai_engine/requirements.txt --quiet
    fi
    deactivate
else
    echo "[2/4] Skipping dependency installation (--skip-deps)"
fi

# ─── 3. Fix Permissions ───
echo "[3/4] Fixing permissions..."
chown -R playsmart:playsmart ${APP_DIR}

# ─── 4. Restart Service ───
echo "[4/4] Restarting service..."
systemctl restart ${SERVICE_NAME}

# Wait for startup
sleep 3

# ─── Health Check ───
echo ""
echo "Running health check..."
HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/ 2>/dev/null || echo "000")

if [ "$HEALTH_STATUS" = "200" ] || [ "$HEALTH_STATUS" = "404" ]; then
    echo "  Backend is UP (HTTP ${HEALTH_STATUS})"
else
    echo "  WARNING: Backend may not be healthy (HTTP ${HEALTH_STATUS})"
    echo "  Check logs: sudo journalctl -u ${SERVICE_NAME} -n 50 --no-pager"
fi

# Show service status
echo ""
systemctl status ${SERVICE_NAME} --no-pager -l | head -15

echo ""
echo "=========================================="
echo "  Update Complete!"
echo "=========================================="
