"""
Vercel serverless entry point for Atheonics API.
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
app = FastAPI(title="Atheonics API")

try:
    if os.path.isdir(backend_dir):
        os.chdir(backend_dir)
    from server import app  # noqa: F811 - intentional override
except Exception as e:
    # If server import fails, surface the real error on EVERY HTTP method —
    # previously this only caught GET, so POSTs returned a misleading 405
    # ("Method Not Allowed") which masked the underlying import failure.
    import traceback as _tb
    _error = f"{type(e).__name__}: {str(e)}"
    _trace = _tb.format_exc()
    _info = {
        "error": _error,
        "trace": _trace.split("\n")[-15:],
        "backend_dir": backend_dir,
        "backend_exists": os.path.isdir(backend_dir),
        "env_mongo": "set" if os.environ.get("MONGO_URL") else "NOT SET",
        "env_db": os.environ.get("DB_NAME", "NOT SET"),
        "env_groq": "set" if os.environ.get("GROQ_API_KEY") else "NOT SET",
        "env_gemini": "set" if os.environ.get("GEMINI_API_KEY") else "NOT SET",
    }

    @app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
    def fallback(path: str):
        return _info
