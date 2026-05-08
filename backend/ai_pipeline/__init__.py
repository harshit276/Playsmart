"""Badminton/sport video analysis pipeline.

Public entrypoint:
    from ai_pipeline import analyze_video
    result = analyze_video(video_path, sport="badminton", target_player="auto")

Lazy import: pipeline.py pulls in cv2/torch which are heavy and absent on
Vercel serverless. Importing the lightweight `ai_pipeline.vlm` submodule
must NOT trigger pipeline.py — so we defer pipeline.py's import until the
caller actually requests `analyze_video`.
"""
__all__ = ["analyze_video"]


def __getattr__(name):
    if name == "analyze_video":
        from .pipeline import analyze_video as _av
        globals()["analyze_video"] = _av
        return _av
    raise AttributeError(f"module 'ai_pipeline' has no attribute '{name}'")
