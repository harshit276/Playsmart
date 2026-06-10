"""Vision-LLM-based shot classification.

Public entrypoint:
    from ai_pipeline.vlm import VLMShotClassifier
    clf = VLMShotClassifier(backend="gemini", sport="badminton")
    result = clf.predict(video_path, start_sec=1.2, end_sec=4.2)

Backends (auto-selected by env vars):
    GEMINI_API_KEY    → Gemini Flash 2.0 / 2.5      (recommended; 1M tok/day free)
    ANTHROPIC_API_KEY → Claude Haiku 4.5             (~$1/1M tok input)
    OPENAI_API_KEY    → GPT-4o-mini Vision           (~$0.15/1M tok input)
    LOCAL_VLM_URL     → Ollama / vLLM compatible API (Qwen2.5-VL local, free)

Set VLM_BACKEND=gemini|anthropic|openai|local|auto explicitly to override
auto-detection. Default is "auto" which picks the first available.
"""
from .classifier import VLMShotClassifier, predict_shot
from .backends import available_backends
from .speed import estimate_speed_from_power
from .coaching import (
    compare_analyses, personalized_coaching, detect_sport,
    quiz_personalization, coach_chat, generic_drill_set,
    analyze_video_full, analyze_video_universal,
    describe_players_in_video,
    files_api_upload, files_api_get, files_api_delete,
    files_api_wait_active,
)

__all__ = ["VLMShotClassifier", "predict_shot", "available_backends",
           "estimate_speed_from_power",
           "compare_analyses", "personalized_coaching", "detect_sport",
           "quiz_personalization", "coach_chat", "generic_drill_set",
           "analyze_video_full", "analyze_video_universal",
           "describe_players_in_video",
           "files_api_upload", "files_api_get", "files_api_delete",
           "files_api_wait_active"]
