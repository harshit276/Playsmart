"""
AthlyticAI Unified Launcher
==========================
Run everything with a single command:

    python run.py

This will:
1. Build the React frontend (if needed)
2. Start one FastAPI server that serves both the API and the frontend
3. Open http://localhost:8000 in your browser

Requirements:
- MongoDB running (local or Atlas - set MONGO_URL in backend/.env)
- Node.js + npm installed (for building frontend)
- Python dependencies installed (pip install -r backend/requirements.txt -r ../app/requirements.txt)
"""

import subprocess
import sys
import os
from pathlib import Path

ROOT = Path(__file__).parent
FRONTEND_DIR = ROOT / "frontend"
BACKEND_DIR = ROOT / "backend"
BUILD_DIR = FRONTEND_DIR / "build"
AI_ENGINE_DIR = ROOT.parent / "app"


def build_frontend():
    """Build React frontend if not already built or if source changed."""
    index_html = BUILD_DIR / "index.html"

    # Check if build is needed
    if index_html.exists():
        # Quick check: if any src file is newer than the build
        src_dir = FRONTEND_DIR / "src"
        build_time = index_html.stat().st_mtime
        needs_rebuild = False
        for f in src_dir.rglob("*"):
            if f.is_file() and f.stat().st_mtime > build_time:
                needs_rebuild = True
                break
        if not needs_rebuild:
            print("[Build] Frontend build is up to date.")
            return True

    print("[Build] Building React frontend...")
    print("[Build] This may take a minute on first run...\n")

    env = os.environ.copy()
    env["REACT_APP_BACKEND_URL"] = ""  # Same origin

    result = subprocess.run(
        ["npm", "run", "build"],
        cwd=str(FRONTEND_DIR),
        env=env,
        shell=True,
    )

    if result.returncode != 0:
        print("\n[Build] ERROR: Frontend build failed!")
        print("[Build] Make sure you ran 'npm install' in the frontend/ directory first.")
        return False

    print("\n[Build] Frontend built successfully!")
    return True


def check_env():
    """Check that backend .env exists with required vars."""
    env_file = BACKEND_DIR / ".env"
    if not env_file.exists():
        print("[Setup] Creating backend/.env with defaults...")
        env_file.write_text(
            "MONGO_URL=mongodb://localhost:27017\n"
            "DB_NAME=playsmart\n"
            "JWT_SECRET=playsmart_dev_secret_change_in_prod\n"
            f"AI_ENGINE_DIR={AI_ENGINE_DIR}\n"
        )
        print(f"[Setup] Created {env_file}")
        print("[Setup] Edit this file if you need to change MongoDB URL or other settings.\n")


def check_npm_installed():
    """Check that frontend dependencies are installed."""
    node_modules = FRONTEND_DIR / "node_modules"
    if not node_modules.exists():
        print("[Setup] Installing frontend dependencies (npm install)...")
        result = subprocess.run(
            ["npm", "install"],
            cwd=str(FRONTEND_DIR),
            shell=True,
        )
        if result.returncode != 0:
            print("[Setup] ERROR: npm install failed!")
            return False
        print("[Setup] Frontend dependencies installed.\n")
    return True


def start_server():
    """Start the unified FastAPI server."""
    print("=" * 55)
    print("  AthlyticAI + AI Sports Coach")
    print("  Starting unified server...")
    print("=" * 55)
    print()

    os.environ.setdefault("AI_ENGINE_DIR", str(AI_ENGINE_DIR))

    subprocess.run(
        [
            sys.executable, "-m", "uvicorn",
            "server:app",
            "--host", "0.0.0.0",
            "--port", "8000",
            "--reload",
            "--reload-dir", str(BACKEND_DIR),
        ],
        cwd=str(BACKEND_DIR),
    )


if __name__ == "__main__":
    print()
    print("=" * 55)
    print("  AthlyticAI Unified Launcher")
    print("=" * 55)
    print()

    # Step 1: Check environment
    check_env()

    # Step 2: Check npm dependencies
    if not check_npm_installed():
        sys.exit(1)

    # Step 3: Build frontend
    if not build_frontend():
        print("\n[!] Frontend build failed, but starting server anyway.")
        print("[!] API will work, but frontend won't be available.")
        print("[!] Fix the build error and restart.\n")

    # Step 4: Start server
    print()
    print(f"  Open in browser: http://localhost:8000")
    print(f"  API docs:        http://localhost:8000/docs")
    print()
    start_server()
