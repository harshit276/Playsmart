"""Minimal test endpoint to debug Vercel function errors."""
from fastapi import FastAPI

app = FastAPI()

@app.get("/api/test")
def test():
    import sys
    import os

    info = {
        "python_version": sys.version,
        "cwd": os.getcwd(),
        "sys_path": sys.path[:5],
        "env_vars": {
            "VERCEL": os.environ.get("VERCEL"),
            "MONGO_URL": "set" if os.environ.get("MONGO_URL") else "NOT SET",
            "DB_NAME": os.environ.get("DB_NAME"),
        },
        "files_in_cwd": os.listdir(os.getcwd())[:20] if os.path.isdir(os.getcwd()) else "CWD not a dir",
    }

    # Try importing server
    try:
        backend_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend")
        info["backend_dir"] = backend_dir
        info["backend_exists"] = os.path.isdir(backend_dir)
        if os.path.isdir(backend_dir):
            info["backend_files"] = os.listdir(backend_dir)[:20]

        sys.path.insert(0, backend_dir)
        os.chdir(backend_dir)

        from server import app as main_app
        info["server_import"] = "SUCCESS"
    except Exception as e:
        info["server_import"] = f"FAILED: {type(e).__name__}: {str(e)}"

    return info
