# PlaySmart Deployment Guide

Complete guide for deploying PlaySmart with:
- **Backend**: Oracle Cloud VM (Ubuntu) with FastAPI + Uvicorn
- **Frontend**: Cloudflare Pages (React)
- **Database**: MongoDB Atlas

---

## Prerequisites

- Oracle Cloud account (free tier works for ARM VMs)
- Cloudflare account
- MongoDB Atlas account
- A domain name (optional but recommended)
- Git repository with the PlaySmart codebase

---

## Step 1: MongoDB Atlas Setup

1. **Create a cluster** at [cloud.mongodb.com](https://cloud.mongodb.com)
   - Free tier (M0) works for development
   - Choose a region close to your Oracle Cloud VM

2. **Create a database user**
   - Go to Database Access > Add New Database User
   - Use password authentication
   - Grant "Read and write to any database"

3. **Configure network access**
   - Go to Network Access > Add IP Address
   - Add your Oracle Cloud VM's public IP
   - For development, you can use `0.0.0.0/0` (allow all - not recommended for production)

4. **Get connection string**
   - Go to your cluster > Connect > Drivers
   - Copy the connection string, it looks like:
     ```
     mongodb+srv://username:password@cluster.xxxxx.mongodb.net/playsmart?retryWrites=true&w=majority
     ```

5. **Create the `.env` file** for the backend:
   ```env
   MONGO_URL=mongodb+srv://username:password@cluster.xxxxx.mongodb.net/playsmart?retryWrites=true&w=majority
   DB_NAME=playsmart
   JWT_SECRET=your-secure-random-secret-key-here
   OPENAI_API_KEY=sk-...
   GOOGLE_API_KEY=AIza...
   ```

---

## Step 2: Oracle Cloud VM Setup

### Create the VM

1. Go to Oracle Cloud Console > Compute > Instances > Create Instance
2. Recommended configuration:
   - **Shape**: VM.Standard.A1.Flex (ARM, free tier eligible)
   - **OCPUs**: 2-4
   - **Memory**: 12-24 GB
   - **OS**: Ubuntu 22.04
   - **Boot volume**: 50 GB
3. Download the SSH key pair during creation
4. Note the public IP address after creation

### Configure Security Lists

In Oracle Cloud Console > Networking > Virtual Cloud Networks > Security Lists:

Add ingress rules:
| Port | Protocol | Source    | Description |
|------|----------|----------|-------------|
| 22   | TCP      | Your IP  | SSH         |
| 80   | TCP      | 0.0.0.0/0| HTTP        |
| 443  | TCP      | 0.0.0.0/0| HTTPS       |

### Connect to the VM

```bash
ssh -i /path/to/private-key ubuntu@YOUR_VM_IP
```

---

## Step 3: Backend Deployment

### Option A: Automated Setup (Recommended)

1. Copy the deploy files to the VM:
   ```bash
   scp -i /path/to/key -r deploy/ ubuntu@YOUR_VM_IP:~/deploy/
   ```

2. SSH into the VM and run setup:
   ```bash
   ssh -i /path/to/key ubuntu@YOUR_VM_IP
   sudo bash ~/deploy/setup-vm.sh
   ```

3. Copy your `.env` file:
   ```bash
   scp -i /path/to/key backend/.env ubuntu@YOUR_VM_IP:/tmp/.env
   ssh -i /path/to/key ubuntu@YOUR_VM_IP "sudo mv /tmp/.env /opt/playsmart/backend/.env && sudo chown playsmart:playsmart /opt/playsmart/backend/.env"
   ```

4. Restart the service:
   ```bash
   ssh -i /path/to/key ubuntu@YOUR_VM_IP "sudo systemctl restart playsmart"
   ```

### Option B: Manual Setup

Follow the steps in `deploy/setup-vm.sh` manually. The script is well-commented and each section can be run independently.

### Verify Backend

```bash
# Check service status
sudo systemctl status playsmart

# View logs
sudo journalctl -u playsmart -f

# Test the API
curl http://YOUR_VM_IP/
```

---

## Step 4: Cloudflare Pages Frontend Deployment

### Connect Repository

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) > Workers & Pages > Create
2. Select "Pages" > Connect to Git
3. Select your repository and the `Playsmart/frontend` directory

### Build Configuration

| Setting            | Value                    |
|--------------------|--------------------------|
| Framework preset   | Create React App         |
| Build command      | `npm run build`          |
| Build output dir   | `build`                  |
| Root directory     | `Playsmart/frontend`     |

### Environment Variables

Set these in Cloudflare Pages settings > Environment Variables:

| Variable               | Value                              |
|------------------------|------------------------------------|
| `REACT_APP_BACKEND_URL`| `https://api.yourdomain.com`       |
| `NODE_VERSION`         | `18`                               |

### Deploy

Cloudflare Pages auto-deploys on push to `main`. You can also trigger manual deploys from the dashboard.

Your frontend will be available at: `https://your-project.pages.dev`

---

## Step 5: Domain & DNS Configuration

### If using Cloudflare for DNS

1. Add your domain to Cloudflare
2. Update nameservers at your registrar

3. **Frontend (Cloudflare Pages)**:
   - Go to Pages project > Custom domains > Add
   - Add `yourdomain.com` or `app.yourdomain.com`
   - Cloudflare handles SSL automatically

4. **Backend API**:
   - Add an A record:
     | Type | Name  | Content      | Proxy |
     |------|-------|-------------|-------|
     | A    | api   | YOUR_VM_IP  | DNS only (grey cloud) |
   - Use "DNS only" (not proxied) so Let's Encrypt can issue certificates directly

### If using another DNS provider

- Point your frontend domain (CNAME) to `your-project.pages.dev`
- Point your API subdomain (A record) to your VM's IP

---

## Step 6: SSL Setup with Let's Encrypt

SSH into your VM and run:

```bash
# Make sure your domain's DNS is pointing to the VM first
sudo certbot --nginx -d api.yourdomain.com
```

Certbot will:
- Obtain an SSL certificate
- Auto-configure nginx
- Set up auto-renewal

Verify auto-renewal:
```bash
sudo certbot renew --dry-run
```

After SSL setup, update the nginx config:
1. Uncomment the HTTPS server block in `/etc/nginx/sites-available/playsmart`
2. Update the `$cors_origin` variable to match your frontend domain
3. Reload nginx: `sudo nginx -t && sudo systemctl reload nginx`

---

## Deploying Updates

Use the update script on the VM:

```bash
# Full update (pull code + install deps + restart)
sudo bash /opt/playsmart/deploy/update.sh

# Quick update (skip dependency installation)
sudo bash /opt/playsmart/deploy/update.sh --skip-deps
```

Or manually:
```bash
cd /opt/playsmart
sudo -u playsmart git pull origin main
source venv/bin/activate
pip install -r backend/requirements.txt
deactivate
sudo systemctl restart playsmart
```

For the frontend, just push to `main` -- Cloudflare Pages deploys automatically.

---

## Troubleshooting

### Backend won't start

```bash
# Check logs
sudo journalctl -u playsmart -n 100 --no-pager

# Test manually
cd /opt/playsmart/backend
sudo -u playsmart /opt/playsmart/venv/bin/uvicorn server:app --host 0.0.0.0 --port 8000

# Check .env file exists and is readable
sudo -u playsmart cat /opt/playsmart/backend/.env
```

### 502 Bad Gateway from nginx

- Backend isn't running: `sudo systemctl start playsmart`
- Wrong port: Ensure uvicorn is on port 8000 and nginx proxies to 8000
- Check nginx config: `sudo nginx -t`

### MongoDB connection failures

- Verify the VM's IP is whitelisted in Atlas Network Access
- Test connectivity: `curl -s https://cloud.mongodb.com`
- Check the MONGO_URL in `.env` is correct

### CORS errors in browser

- Update `$cors_origin` in nginx.conf to match your exact frontend URL
- Ensure the backend's CORS middleware also allows your frontend origin
- Check that both HTTP and HTTPS origins are covered

### Large file upload failures

- nginx is configured for 500MB max (`client_max_body_size`)
- If uploads time out, increase `proxy_read_timeout` in nginx.conf
- Check disk space: `df -h`

### SSL certificate issues

```bash
# Check certificate status
sudo certbot certificates

# Force renewal
sudo certbot renew --force-renewal

# Check nginx SSL config
sudo nginx -t
```

### VM running out of memory

```bash
# Check memory usage
free -h

# Add swap space (2GB)
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### Checking service health

```bash
# Service status
sudo systemctl status playsmart

# API health
curl -s http://localhost:8000/

# Nginx status
sudo systemctl status nginx

# Disk space
df -h

# Memory
free -h

# CPU
top -bn1 | head -5
```
