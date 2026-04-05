#!/bin/bash
set -e
echo "=== AthlyticAI Server Setup ==="
echo "1. Checking system..."
cat /etc/os-release | head -2
python3 --version 2>/dev/null || echo "python3 not found"
free -m

echo ""
echo "2. Installing packages..."
sudo dnf install -y python3 python3-pip nginx 2>/dev/null || sudo yum install -y python3 python3-pip nginx 2>/dev/null
echo "Packages installed!"

echo ""
echo "3. Creating app directory..."
sudo mkdir -p /opt/athlyticai
sudo chown opc:opc /opt/athlyticai

echo ""
echo "4. Setting up Python venv..."
cd /opt/athlyticai
python3 -m venv venv 2>/dev/null || python3 -m ensurepip && python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip

echo ""
echo "5. Creating requirements file..."
cat > requirements.txt << 'EOF'
fastapi==0.104.1
uvicorn[standard]==0.24.0
motor==3.3.2
pymongo[srv]==4.6.1
python-dotenv==1.0.0
PyJWT==2.8.0
python-multipart==0.0.6
dnspython==2.4.2
aiofiles==23.2.1
EOF

echo ""
echo "6. Installing Python dependencies..."
pip install -r requirements.txt
echo "Dependencies installed!"

echo ""
echo "7. Opening firewall ports..."
sudo firewall-cmd --permanent --add-port=80/tcp 2>/dev/null || true
sudo firewall-cmd --permanent --add-port=443/tcp 2>/dev/null || true
sudo firewall-cmd --permanent --add-port=8000/tcp 2>/dev/null || true
sudo firewall-cmd --reload 2>/dev/null || true
echo "Firewall configured!"

echo ""
echo "8. Setting up nginx..."
sudo tee /etc/nginx/conf.d/athlyticai.conf > /dev/null << 'NGINX'
server {
    listen 80;
    server_name _;
    client_max_body_size 500M;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 300s;
    }
}
NGINX
sudo nginx -t && sudo systemctl enable nginx && sudo systemctl restart nginx
echo "Nginx configured!"

echo ""
echo "=== Setup Complete ==="
echo "Ready to receive app files!"
