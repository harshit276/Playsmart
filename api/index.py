"""
Vercel serverless entry point for AthlyticAI API.
Wraps the existing FastAPI app for serverless deployment.
"""
import sys
import os

# On Vercel, __file__ is /var/task/api/index.py
# Project root is /var/task/
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
backend_dir = os.path.join(project_root, "backend")

# Add backend to path so server.py and its imports (research_loader, etc.) work
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# Set environment defaults for serverless
os.environ.setdefault("ENVIRONMENT", "production")
os.environ.setdefault("VERCEL", "1")

# Set working directory to backend so relative paths work
os.chdir(backend_dir)

from server import app
