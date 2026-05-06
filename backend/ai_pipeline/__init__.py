"""Badminton/sport video analysis pipeline.

Public entrypoint:
    from ai_pipeline import analyze_video
    result = analyze_video(video_path, sport="badminton", target_player="auto")
"""
from .pipeline import analyze_video

__all__ = ["analyze_video"]
