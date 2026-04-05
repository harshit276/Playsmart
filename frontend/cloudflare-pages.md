# Deploying PlaySmart Frontend on Cloudflare Pages

## Build Configuration

| Setting            | Value            |
|--------------------|------------------|
| Build command      | `npm run build`  |
| Output directory   | `build`          |
| Root directory     | `frontend`       |
| Node.js version    | 18 (or later)    |

## Environment Variables

Set these in **Cloudflare Pages > Settings > Environment Variables**:

| Variable                  | Value                              | Required |
|---------------------------|------------------------------------|----------|
| `REACT_APP_BACKEND_URL`   | `https://api.yourdomain.com`       | Yes      |
| `NODE_VERSION`            | `18`                               | Recommended |

`REACT_APP_BACKEND_URL` must point to your deployed backend (e.g., on Railway).
Leave it empty only if the backend is served from the same origin.

## Custom Domain

1. Go to **Cloudflare Pages > your project > Custom domains**.
2. Add your domain (e.g., `app.yourdomain.com`).
3. Cloudflare will automatically configure DNS if the domain is on Cloudflare.

## CORS Configuration (Backend)

The backend must allow requests from the frontend domain. In your FastAPI backend,
ensure CORS middleware includes the Cloudflare Pages URL:

```python
allow_origins=[
    "https://app.yourdomain.com",
    "https://your-project.pages.dev",
    "http://localhost:3000",  # local dev
]
```

## SPA Routing

The `public/_redirects` file handles client-side routing by sending all requests
to `index.html`. This is included in the build output automatically.

## Deployment Methods

**Git integration (recommended):**
Connect your GitHub repo to Cloudflare Pages. Every push to main triggers a deploy.

**Manual deploy:**
```bash
cd frontend
npm run build
npx wrangler pages deploy build --project-name=playsmart
```
