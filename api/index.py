"""
Vercel serverless entry point for AthlyticAI API.
Wraps the existing FastAPI app for serverless deployment.
"""
import sys
import os

# Add backend and app directories to path
backend_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "backend")
app_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "app")
sys.path.insert(0, backend_dir)
sys.path.insert(0, app_dir)

# Set environment defaults for serverless
os.environ.setdefault("ENVIRONMENT", "production")

from server import app
