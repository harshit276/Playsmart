# Vercel Deployment Guide for AthlyticAI

Complete guide to deploying AthlyticAI on Vercel with a custom domain via Cloudflare.

---

## Prerequisites

- **GitHub account** (to host the repository)
- **Vercel account** (free at [vercel.com](https://vercel.com))
- **MongoDB Atlas** connection string (free tier works)
- **Cloudflare account** (if using a custom domain)

---

## Step 1: Push to GitHub

1. Create a new repository on GitHub named `athlyticai` (or any name you prefer).
2. In your terminal, from the `Playsmart` directory:

```bash
git init
git add -A
git commit -m "Initial commit: AthlyticAI - AI Sports Coach"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/athlyticai.git
git push -u origin main
```

> **Note:** Make sure `.gitignore` is in place before committing so that `node_modules/`, `.env`, video files, and SSH keys are excluded.

---

## Step 2: Connect to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with your GitHub account.
2. Click **"Add New..."** then **"Project"**.
3. Select your `athlyticai` repository from the list.
4. Configure the project settings:

| Setting            | Value                                          |
|--------------------|------------------------------------------------|
| Framework Preset   | **Other**                                      |
| Root Directory     | `./` (the Playsmart folder)                    |
| Build Command      | `cd frontend && npm install && npm run build`  |
| Output Directory   | `frontend/build`                               |

5. Add the following **Environment Variables**:

| Variable        | Value                                        |
|-----------------|----------------------------------------------|
| `MONGO_URL`     | Your MongoDB Atlas connection string         |
| `DB_NAME`       | `athlyticai`                                 |
| `JWT_SECRET`    | A random string, 32+ characters              |
| `CORS_ORIGINS`  | `https://athlyticai.com` (your domain)       |
| `ENVIRONMENT`   | `production`                                 |
| `VERCEL`        | `1`                                          |

> **Tip:** Generate a secure JWT secret with: `openssl rand -hex 32`

6. Click **Deploy**.

---

## Step 3: Backend (Serverless Functions)

Vercel natively supports serverless functions. If the backend is served as Vercel serverless functions, place an `api/` directory at the project root. Otherwise, deploy the FastAPI backend separately on **Railway** or **Render** and set `REACT_APP_API_URL` in Vercel to point to it.

For a separate backend deployment:
1. Deploy the `backend/` folder to Railway/Render.
2. Set `CORS_ORIGINS` on the backend to your Vercel frontend URL.
3. Set `REACT_APP_API_URL` on Vercel to the backend URL (e.g., `https://api.athlyticai.com`).

---

## Step 4: Custom Domain

### In Vercel

1. Go to your Vercel project, then **Settings** then **Domains**.
2. Add your domain: `athlyticai.com`.
3. Vercel will display DNS records you need to configure.

### In Cloudflare DNS

Add these DNS records in Cloudflare:

**Root domain:**

| Type  | Name | Target                  | Proxy Status           |
|-------|------|-------------------------|------------------------|
| CNAME | `@`  | `cname.vercel-dns.com`  | DNS only (gray cloud)  |

**WWW subdomain:**

| Type  | Name  | Target                  | Proxy Status           |
|-------|-------|-------------------------|------------------------|
| CNAME | `www` | `cname.vercel-dns.com`  | DNS only (gray cloud)  |

> **Important:** Set Cloudflare proxy to **DNS only** (gray cloud icon). Vercel handles its own SSL, and orange-cloud proxying will cause certificate conflicts.

### Cloudflare SSL Settings

If you have Cloudflare's SSL settings enabled globally:
- Go to **SSL/TLS** in Cloudflare and set mode to **Full (strict)**.
- Or simply keep the proxy off (gray cloud) for the Vercel records.

---

## Step 5: Verify Deployment

After DNS propagation (can take up to 48 hours, usually minutes):

1. Visit `https://athlyticai.com` -- should load the landing page.
2. Test user registration and login.
3. Test the dashboard and training pages.
4. Test the blog section.
5. Test video analysis (runs on-device via TensorFlow.js).
6. Check the browser console for any API errors.

---

## Redeployment

Every `git push` to the `main` branch automatically triggers a new deployment on Vercel. No manual action needed.

```bash
git add -A
git commit -m "Update: description of changes"
git push origin main
```

Vercel will build and deploy within 1-2 minutes.

---

## Troubleshooting

| Issue                        | Solution                                                    |
|------------------------------|-------------------------------------------------------------|
| Build fails                  | Check the build logs in Vercel dashboard                    |
| API calls failing            | Verify `REACT_APP_API_URL` and CORS settings                |
| Custom domain not working    | Ensure Cloudflare proxy is OFF (gray cloud) for CNAME       |
| Environment vars not loading | Redeploy after adding/changing env vars in Vercel            |
| 404 on page refresh          | Add `frontend/public/_redirects` with `/* /index.html 200`  |
