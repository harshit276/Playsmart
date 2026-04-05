#!/bin/bash
# ============================================================
# AthlyticAI - Oracle Cloud VM Setup Script
# Run on a fresh Ubuntu 22.04+ VM as root or with sudo
# Usage: sudo bash setup-vm.sh
# ============================================================

set -euo pipefail

APP_DIR="/opt/playsmart"
APP_USER="playsmart"
PYTHON_VERSION="3.10"
REPO_URL="${PLAYSMART_REPO_URL:-https://github.com/YOUR_ORG/playsmart.git}"

echo "=========================================="
echo "  AthlyticAI VM Setup"
echo "=========================================="

# ─── 1. System Update ───
echo "[1/10] Updating system packages..."
apt-get update -y
apt-get upgrade -y

# ─── 2. Install Python 3.10 ───
echo "[2/10] Installing Python ${PYTHON_VERSION}..."
apt-get install -y software-properties-common
add-apt-repository -y ppa:deadsnakes/ppa
apt-get update -y
apt-get install -y \
    python${PYTHON_VERSION} \
    python${PYTHON_VERSION}-venv \
    python${PYTHON_VERSION}-dev \
    python3-pip

# Set python3.10 as default python3 if not already
update-alternatives --install /usr/bin/python3 python3 /usr/bin/python${PYTHON_VERSION} 1 || true

# ─── 3. Install System Dependencies ───
echo "[3/10] Installing system dependencies..."
apt-get install -y \
    ffmpeg \
    libgl1-mesa-glx \
    libglib2.0-0 \
    curl \
    git \
    unzip

# ─── 4. Install Nginx ───
echo "[4/10] Installing nginx..."
apt-get install -y nginx

# ─── 5. Install Certbot for SSL ───
echo "[5/10] Installing certbot..."
apt-get install -y certbot python3-certbot-nginx

# ─── 6. Create App User ───
echo "[6/10] Creating app user..."
if ! id "${APP_USER}" &>/dev/null; then
    useradd --system --shell /bin/false --home-dir ${APP_DIR} ${APP_USER}
fi

# ─── 7. Create App Directory ───
echo "[7/10] Setting up app directory..."
mkdir -p ${APP_DIR}
mkdir -p ${APP_DIR}/uploads
mkdir -p ${APP_DIR}/logs

# ─── 8. Clone/Copy App Files ───
echo "[8/10] Cloning application..."
if [ -d "${APP_DIR}/backend" ]; then
    echo "  App directory already has files, skipping clone."
    echo "  Use deploy/update.sh to pull latest changes."
else
    git clone "${REPO_URL}" ${APP_DIR}/repo || {
        echo "  Git clone failed. Copy files manually to ${APP_DIR}/"
        echo "  Required directories: backend/, app/ (AI engine)"
    }
    # Move files into place if clone succeeded
    if [ -d "${APP_DIR}/repo" ]; then
        cp -r ${APP_DIR}/repo/Playsmart/backend ${APP_DIR}/backend
        cp -r ${APP_DIR}/repo/app ${APP_DIR}/ai_engine 2>/dev/null || true
        rm -rf ${APP_DIR}/repo
    fi
fi

# ─── 9. Python Virtual Environment & Dependencies ───
echo "[9/10] Setting up Python virtual environment..."
python${PYTHON_VERSION} -m venv ${APP_DIR}/venv
source ${APP_DIR}/venv/bin/activate
pip install --upgrade pip
pip install -r ${APP_DIR}/backend/requirements.txt

# Install AI engine requirements if present
if [ -f "${APP_DIR}/ai_engine/requirements.txt" ]; then
    pip install -r ${APP_DIR}/ai_engine/requirements.txt
fi

deactivate

# Set ownership
chown -R ${APP_USER}:${APP_USER} ${APP_DIR}

# ─── 10. Install Service & Nginx Config ───
echo "[10/10] Installing systemd service and nginx config..."

# Copy systemd service
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp "${SCRIPT_DIR}/playsmart.service" /etc/systemd/system/playsmart.service
cp "${SCRIPT_DIR}/nginx.conf" /etc/nginx/sites-available/playsmart

# Enable nginx site
ln -sf /etc/nginx/sites-available/playsmart /etc/nginx/sites-enabled/playsmart
rm -f /etc/nginx/sites-enabled/default

# Reload and start services
systemctl daemon-reload
systemctl enable playsmart
systemctl start playsmart

nginx -t && systemctl restart nginx

# ─── Firewall ───
echo "Configuring firewall..."
if command -v ufw &>/dev/null; then
    ufw allow 22/tcp
    ufw allow 80/tcp
    ufw allow 443/tcp
    ufw --force enable
fi

echo ""
echo "=========================================="
echo "  Setup Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Copy your .env file to ${APP_DIR}/backend/.env"
echo "  2. Restart the service: sudo systemctl restart playsmart"
echo "  3. Set up SSL: sudo certbot --nginx -d your-domain.com"
echo "  4. Check status: sudo systemctl status playsmart"
echo "  5. View logs: sudo journalctl -u playsmart -f"
echo ""
