"""
Vercel serverless entry point for AthlyticAI API.
"""
import sys
import os

# On Vercel, __file__ is /var/task/api/index.py
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
backend_dir = os.path.join(project_root, "backend")

# Add backend to path
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# Set environment defaults for serverless
os.environ.setdefault("ENVIRONMENT", "production")
os.environ.setdefault("VERCEL", "1")
os.environ.setdefault("DB_NAME", "athlyticai")

# Try to import the main app, with detailed error reporting
try:
    if os.path.isdir(backend_dir):
        os.chdir(backend_dir)
    from server import app
except Exception as e:
    # If server import fails, create a minimal debug app
    from fastapi import FastAPI
    app = FastAPI()

    error_info = {
        "error": f"{type(e).__name__}: {str(e)}",
        "backend_dir": backend_dir,
        "backend_exists": os.path.isdir(backend_dir),
        "backend_files": os.listdir(backend_dir) if os.path.isdir(backend_dir) else [],
        "env_vars": {k: ("set" if v else "NOT SET") for k, v in {
            "MONGO_URL": os.environ.get("MONGO_URL"),
            "DB_NAME": os.environ.get("DB_NAME"),
            "JWT_SECRET": os.environ.get("JWT_SECRET"),
        }.items()},
        "sys_path": sys.path[:5],
        "cwd": os.getcwd(),
    }

    @app.get("/api/{path:path}")
    def debug(path: str):
        return error_info
