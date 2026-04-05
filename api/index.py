"""
Vercel serverless entry point for AthlyticAI API.
"""
import sys
import os
from fastapi import FastAPI

# On Vercel, project root is parent of api/
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
backend_dir = os.path.join(project_root, "backend")

# Add backend to path
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# Set environment defaults
os.environ.setdefault("ENVIRONMENT", "production")
os.environ.setdefault("VERCEL", "1")
os.environ.setdefault("DB_NAME", "athlyticai")

# Default app in case import fails
app = FastAPI(title="AthlyticAI API")

try:
    if os.path.isdir(backend_dir):
        os.chdir(backend_dir)
    from server import app  # noqa: F811 - intentional override
except Exception as e:
    # If server import fails, serve debug info
    _error = f"{type(e).__name__}: {str(e)}"
    _info = {
        "error": _error,
        "backend_dir": backend_dir,
        "backend_exists": os.path.isdir(backend_dir),
        "env_mongo": "set" if os.environ.get("MONGO_URL") else "NOT SET",
        "env_db": os.environ.get("DB_NAME", "NOT SET"),
    }

    @app.get("/api/{path:path}")
    def fallback(path: str):
        return _info
