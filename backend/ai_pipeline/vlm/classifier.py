"""Top-level VLM shot classifier — orchestrates frames + prompt + backend + cache.

Usage:
    clf = VLMShotClassifier(backend="auto", sport="badminton")
    res = clf.predict("video.mp4", start_sec=1.2, end_sec=4.2,
                      target_player="auto")
    # res = {"shot_type": "smash", "confidence": 0.85,
    #        "reasoning": "...", "alternatives": [...],
    #        "form_feedback": {...}, "estimated_skill": "Advanced",
    #        "_meta": {"backend": "gemini", "model": "...", "cached": False}}
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from . import cache as _cache
from .backends import VLMBackend, available_backends, pick_backend
from .frame_extract import extract_keyframes, frame_to_jpeg_bytes
from .prompts import (
    GENERIC_SCHEMA_KEYS, SHOT_VOCAB, shot_vocabulary,
    system_prompt, user_message,
    system_prompt_batch, user_message_batch,
)


class VLMShotClassifier:
    def __init__(
        self,
        backend: str | None = "auto",
        sport: str = "badminton",
        n_frames: int = 5,
        max_dim: int = 720,
        use_cache: bool = True,
    ):
        self.sport = sport
        self.n_frames = n_frames
        self.max_dim = max_dim
        self.use_cache = use_cache
        self._backend: VLMBackend = pick_backend(backend or "auto")

    @property
    def backend_name(self) -> str:
        return self._backend.name

    @property
    def model_name(self) -> str:
        return self._backend.model_name

    def predict(
        self,
        video_path: str | Path,
        start_sec: float | None = None,
        end_sec: float | None = None,
        target_player: str = "auto",
    ) -> dict:
        # 1. cache lookup
        if self.use_cache:
            hit = _cache.get(
                str(video_path), start_sec, end_sec,
                self.sport, self.backend_name, self.model_name, target_player,
            )
            if hit is not None:
                hit.setdefault("_meta", {})["cached"] = True
                return hit

        # 2. extract keyframes
        frames = extract_keyframes(
            video_path,
            start_sec=start_sec, end_sec=end_sec,
            n_frames=self.n_frames, target_player=target_player,
            max_dim=self.max_dim,
        )
        if len(frames) < 2:
            return {
                "shot_type": "unknown", "confidence": 0.0,
                "reasoning": "Could not extract enough frames from this window.",
                "alternatives": [], "form_feedback": {},
                "estimated_skill": "Unknown",
                "_meta": {"backend": self.backend_name, "model": self.model_name,
                          "cached": False, "n_frames": len(frames),
                          "error": "insufficient frames"},
            }

        jpegs = [frame_to_jpeg_bytes(f) for f in frames]

        # 3. build prompts + call backend
        sys_prompt = system_prompt(self.sport).replace("{n_frames}", str(len(jpegs)))
        usr_msg = user_message(self.sport, len(jpegs), target_player)

        try:
            raw = self._backend.call(sys_prompt, usr_msg, jpegs)
        except Exception as exc:
            err_msg = str(exc)
            err_class = exc.__class__.__name__
            friendly = err_msg[:200]
            if "429" in err_msg or "quota" in err_msg.lower() or "ResourceExhausted" in err_class:
                friendly = ("Gemini free-tier quota exceeded. Wait ~24h for reset, "
                           "or set ANTHROPIC_API_KEY / install Ollama for an alternative.")
            elif "401" in err_msg or "PermissionDenied" in err_class or "API_KEY_INVALID" in err_msg:
                friendly = "API key invalid or revoked. Rotate at https://aistudio.google.com/apikey."
            return {
                "shot_type": "unknown", "confidence": 0.0,
                "reasoning": friendly,
                "alternatives": [], "form_feedback": {},
                "estimated_skill": "Unknown",
                "_meta": {"backend": self.backend_name, "model": self.model_name,
                          "cached": False, "error": err_msg[:200]},
            }

        # 4. parse JSON (with fallback recovery)
        parsed = _parse_json_response(raw, self.sport)
        parsed["_meta"] = {
            "backend": self.backend_name,
            "model": self.model_name,
            "cached": False,
            "n_frames": len(jpegs),
        }
        # Keep the raw response so we can debug "unknown" mappings.
        parsed["_raw_response"] = (raw or "")[:2000]

        # 5. cache + return
        if self.use_cache:
            _cache.put(
                parsed, str(video_path), start_sec, end_sec,
                self.sport, self.backend_name, self.model_name, target_player,
            )
        return parsed


    def predict_batch(
        self,
        video_path: str | Path,
        windows: list[tuple[float | None, float | None]],
        target_player: str = "auto",
    ) -> list[dict]:
        """Classify N shot moments in ONE API call. Returns list of N dicts
        in the same order as windows. Cache hits are served from disk; only
        cache misses are batched.
        """
        if not windows:
            return []
        if len(windows) == 1:
            return [self.predict(video_path, windows[0][0], windows[0][1], target_player)]

        # Cache lookup per window
        results: list[dict | None] = [None] * len(windows)
        miss_indices: list[int] = []
        for i, (s, e) in enumerate(windows):
            if self.use_cache:
                hit = _cache.get(
                    str(video_path), s, e,
                    self.sport, self.backend_name, self.model_name, target_player,
                )
                if hit is not None:
                    hit.setdefault("_meta", {})["cached"] = True
                    results[i] = hit
                    continue
            miss_indices.append(i)

        if not miss_indices:
            return [r for r in results]  # type: ignore[misc]

        # Extract frames for the misses; track frames-per-shot so the model
        # can split the interleaved image stream back into per-shot groups.
        all_jpegs: list[bytes] = []
        frames_per_shot: list[int] = []
        for i in miss_indices:
            s, e = windows[i]
            frames = extract_keyframes(
                video_path, start_sec=s, end_sec=e,
                n_frames=self.n_frames, target_player=target_player,
                max_dim=self.max_dim,
            )
            if len(frames) < 2:
                # Mark as insufficient — handled below
                frames_per_shot.append(0)
                continue
            jpegs = [frame_to_jpeg_bytes(f) for f in frames]
            all_jpegs.extend(jpegs)
            frames_per_shot.append(len(jpegs))

        # If everything was insufficient, return stubs
        if not all_jpegs:
            for i in miss_indices:
                results[i] = {
                    "shot_type": "unknown", "confidence": 0.0,
                    "reasoning": "Could not extract enough frames.",
                    "alternatives": [], "form_feedback": {},
                    "estimated_skill": "Unknown",
                    "_meta": {"backend": self.backend_name, "model": self.model_name,
                              "cached": False, "error": "insufficient frames"},
                }
            return [r for r in results]  # type: ignore[misc]

        # Build batch prompts (counting only shots with frames)
        nonzero_per_shot = [n for n in frames_per_shot if n > 0]
        sys_prompt = system_prompt_batch(self.sport).replace("{n_shots}", str(len(nonzero_per_shot)))
        usr_msg = user_message_batch(self.sport, nonzero_per_shot, target_player)

        try:
            raw = self._backend.call(sys_prompt, usr_msg, all_jpegs)
        except Exception as exc:
            err_msg = str(exc)
            err_class = exc.__class__.__name__
            friendly = err_msg[:200]
            if "429" in err_msg or "quota" in err_msg.lower() or "ResourceExhausted" in err_class:
                friendly = ("Gemini quota exceeded. Switch GEMINI_MODEL=gemini-2.0-flash "
                           "(6× higher daily quota) or use VLM backend=local.")
            elif "401" in err_msg or "PermissionDenied" in err_class:
                friendly = "API key invalid. Rotate at https://aistudio.google.com/apikey."
            for i in miss_indices:
                results[i] = {
                    "shot_type": "unknown", "confidence": 0.0,
                    "reasoning": friendly,
                    "alternatives": [], "form_feedback": {},
                    "estimated_skill": "Unknown",
                    "_meta": {"backend": self.backend_name, "model": self.model_name,
                              "cached": False, "error": err_msg[:200]},
                }
            return [r for r in results]  # type: ignore[misc]

        parsed_list = _parse_batch_response(raw, self.sport, len(nonzero_per_shot))

        # Distribute parsed results back to miss_indices, accounting for
        # any windows we skipped due to insufficient frames.
        parsed_iter = iter(parsed_list)
        for idx_in_misses, shot_idx in enumerate(miss_indices):
            n_frames_for_shot = frames_per_shot[idx_in_misses]
            if n_frames_for_shot == 0:
                results[shot_idx] = {
                    "shot_type": "unknown", "confidence": 0.0,
                    "reasoning": "Could not extract enough frames.",
                    "alternatives": [], "form_feedback": {},
                    "estimated_skill": "Unknown",
                    "_meta": {"backend": self.backend_name, "model": self.model_name,
                              "cached": False, "error": "insufficient frames"},
                }
                continue
            parsed = next(parsed_iter, None)
            if parsed is None:
                parsed = _stub("batch underflow")
            parsed["_meta"] = {
                "backend": self.backend_name,
                "model": self.model_name,
                "cached": False,
                "n_frames": n_frames_for_shot,
                "batched": True,
            }
            parsed["_raw_response"] = (raw or "")[:2000]
            results[shot_idx] = parsed
            if self.use_cache:
                s, e = windows[shot_idx]
                _cache.put(
                    parsed, str(video_path), s, e,
                    self.sport, self.backend_name, self.model_name, target_player,
                )

        return [r for r in results]  # type: ignore[misc]


    def predict_batch_from_keyframes(
        self,
        keyframes_per_shot: list[list[bytes]],
        target_player: str = "auto",
    ) -> list[dict]:
        """Same as predict_batch, but accepts pre-extracted JPEG bytes per
        shot (no video decode). Used when the browser already extracted
        keyframes and POSTs them to the server.

        keyframes_per_shot[i] is a list of JPEG bytes for shot i.
        Returns N dicts in input order. Slots with <2 frames become unknown stubs.
        """
        if not keyframes_per_shot:
            return []

        # Filter shots with enough frames
        all_jpegs: list[bytes] = []
        frames_per_shot: list[int] = []
        for jpegs in keyframes_per_shot:
            if not jpegs or len(jpegs) < 2:
                frames_per_shot.append(0)
                continue
            all_jpegs.extend(jpegs)
            frames_per_shot.append(len(jpegs))

        # Single-shot fallback: still goes through batch prompt for consistency,
        # since per-shot prompt expects only one shot's frames
        if not all_jpegs:
            return [
                {
                    "shot_type": "unknown", "confidence": 0.0,
                    "reasoning": "Could not extract enough frames.",
                    "alternatives": [], "form_feedback": {},
                    "estimated_skill": "Unknown", "power_level": "medium",
                    "_meta": {"backend": self.backend_name, "model": self.model_name,
                              "cached": False, "error": "insufficient frames"},
                }
                for _ in keyframes_per_shot
            ]

        nonzero_per_shot = [n for n in frames_per_shot if n > 0]
        sys_prompt = system_prompt_batch(self.sport).replace("{n_shots}", str(len(nonzero_per_shot)))
        usr_msg = user_message_batch(self.sport, nonzero_per_shot, target_player)

        try:
            raw = self._backend.call(sys_prompt, usr_msg, all_jpegs)
        except Exception as exc:
            err_msg = str(exc)
            err_class = exc.__class__.__name__
            friendly = err_msg[:200]
            if "429" in err_msg or "quota" in err_msg.lower() or "ResourceExhausted" in err_class:
                friendly = ("Gemini quota exceeded. Set GEMINI_MODEL=gemini-2.0-flash "
                           "for higher daily quota or switch backend.")
            elif "401" in err_msg or "PermissionDenied" in err_class:
                friendly = "API key invalid. Rotate at https://aistudio.google.com/apikey."
            return [
                {
                    "shot_type": "unknown", "confidence": 0.0,
                    "reasoning": friendly,
                    "alternatives": [], "form_feedback": {},
                    "estimated_skill": "Unknown", "power_level": "medium",
                    "_meta": {"backend": self.backend_name, "model": self.model_name,
                              "cached": False, "error": err_msg[:200]},
                }
                for _ in keyframes_per_shot
            ]

        parsed_list = _parse_batch_response(raw, self.sport, len(nonzero_per_shot))
        parsed_iter = iter(parsed_list)

        # Distribute parsed results back, accounting for shots with insufficient frames
        results: list[dict] = []
        for n in frames_per_shot:
            if n == 0:
                results.append({
                    "shot_type": "unknown", "confidence": 0.0,
                    "reasoning": "Could not extract enough frames.",
                    "alternatives": [], "form_feedback": {},
                    "estimated_skill": "Unknown", "power_level": "medium",
                    "_meta": {"backend": self.backend_name, "model": self.model_name,
                              "cached": False, "error": "insufficient frames"},
                })
                continue
            parsed = next(parsed_iter, None) or _stub("batch underflow")
            parsed["_meta"] = {
                "backend": self.backend_name, "model": self.model_name,
                "cached": False, "n_frames": n, "batched": True, "from_keyframes": True,
            }
            results.append(parsed)

        return results


# ─── Convenience function: one-liner predict ───
def predict_shot(
    video_path: str | Path,
    sport: str = "badminton",
    backend: str = "auto",
    start_sec: float | None = None,
    end_sec: float | None = None,
    target_player: str = "auto",
    n_frames: int = 5,
) -> dict:
    return VLMShotClassifier(
        backend=backend, sport=sport, n_frames=n_frames,
    ).predict(video_path, start_sec, end_sec, target_player)


# ─── Robust JSON parsing (some VLMs wrap in markdown despite our request) ──
_FENCE_RE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL)


def _parse_json_response(raw: str, sport: str) -> dict:
    """Tolerant JSON parser. Returns a normalized dict matching our schema."""
    if not raw or not raw.strip():
        return _stub("empty response")
    text = raw.strip()
    # Strip markdown fences if any
    m = _FENCE_RE.search(text)
    if m:
        text = m.group(1).strip()

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        # Try to find the first { ... } block
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            try:
                data = json.loads(text[start : end + 1])
            except json.JSONDecodeError:
                return _stub("malformed JSON")
        else:
            return _stub("no JSON found")

    if not isinstance(data, dict):
        return _stub("response not a JSON object")

    # Normalize: clamp + fill missing keys
    vocab = shot_vocabulary(sport)
    shot = str(data.get("shot_type", "unknown")).lower().strip().replace(" ", "_")
    if shot not in vocab and shot != "unknown":
        # Try fuzzy match (e.g. model returned "smashing" or "smash shot")
        match = next((v for v in vocab if v in shot or shot in v), None)
        shot = match or "unknown"

    conf = float(data.get("confidence", 0.0) or 0.0)
    conf = max(0.0, min(1.0, conf))

    alts = data.get("alternatives") or []
    norm_alts: list[dict] = []
    for a in alts[:3]:
        if isinstance(a, dict) and "shot" in a:
            s = str(a["shot"]).lower().strip().replace(" ", "_")
            if s in vocab:
                norm_alts.append({
                    "shot": s,
                    "confidence": max(0.0, min(1.0, float(a.get("confidence", 0.0) or 0.0))),
                })

    skill = str(data.get("estimated_skill", "Intermediate")).strip().title()
    if skill not in ("Beginner", "Intermediate", "Advanced", "Pro"):
        skill = "Intermediate"

    power = str(data.get("power_level", "medium")).strip().lower()
    if power not in ("soft", "medium", "hard", "max"):
        power = "medium"

    ff = data.get("form_feedback") or {}
    if not isinstance(ff, dict):
        ff = {}
    ff = {
        "strengths": [str(x) for x in (ff.get("strengths") or [])[:5]],
        "weaknesses": [str(x) for x in (ff.get("weaknesses") or [])[:5]],
        "tip": str(ff.get("tip", "")),
    }

    return {
        "shot_type": shot,
        "confidence": conf,
        "reasoning": str(data.get("reasoning", "")),
        "alternatives": norm_alts,
        "form_feedback": ff,
        "estimated_skill": skill,
        "power_level": power,
    }


def _parse_batch_response(raw: str, sport: str, expected_n: int) -> list[dict]:
    """Parse the batch JSON {"shots": [...]}. Returns N normalized dicts.
    Pads or truncates to expected_n; missing slots become 'unknown' stubs."""
    if not raw or not raw.strip():
        return [_stub("empty response")] * expected_n
    text = raw.strip()
    m = _FENCE_RE.search(text)
    if m:
        text = m.group(1).strip()
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            try:
                data = json.loads(text[start:end + 1])
            except json.JSONDecodeError:
                return [_stub("malformed batch JSON")] * expected_n
        else:
            return [_stub("no JSON found")] * expected_n

    if not isinstance(data, dict) or not isinstance(data.get("shots"), list):
        return [_stub("batch missing 'shots' array")] * expected_n

    items = data["shots"]
    parsed: list[dict] = []
    for it in items[:expected_n]:
        if not isinstance(it, dict):
            parsed.append(_stub("shot entry not object"))
            continue
        # Reuse the single-shot normalizer by wrapping
        single = _normalize_shot_dict(it, sport)
        parsed.append(single)
    while len(parsed) < expected_n:
        parsed.append(_stub("batch returned fewer shots than requested"))
    return parsed


def _normalize_shot_dict(data: dict, sport: str) -> dict:
    """Same normalization _parse_json_response does, factored for batch reuse."""
    vocab = shot_vocabulary(sport)
    shot = str(data.get("shot_type", "unknown")).lower().strip().replace(" ", "_")
    if shot not in vocab and shot != "unknown":
        match = next((v for v in vocab if v in shot or shot in v), None)
        shot = match or "unknown"
    conf = max(0.0, min(1.0, float(data.get("confidence", 0.0) or 0.0)))
    alts = data.get("alternatives") or []
    norm_alts: list[dict] = []
    for a in alts[:3]:
        if isinstance(a, dict) and "shot" in a:
            s = str(a["shot"]).lower().strip().replace(" ", "_")
            if s in vocab:
                norm_alts.append({
                    "shot": s,
                    "confidence": max(0.0, min(1.0, float(a.get("confidence", 0.0) or 0.0))),
                })
    skill = str(data.get("estimated_skill", "Intermediate")).strip().title()
    if skill not in ("Beginner", "Intermediate", "Advanced", "Pro"):
        skill = "Intermediate"
    power = str(data.get("power_level", "medium")).strip().lower()
    if power not in ("soft", "medium", "hard", "max"):
        power = "medium"
    ff = data.get("form_feedback") or {}
    if not isinstance(ff, dict):
        ff = {}
    ff = {
        "strengths": [str(x) for x in (ff.get("strengths") or [])[:5]],
        "weaknesses": [str(x) for x in (ff.get("weaknesses") or [])[:5]],
        "tip": str(ff.get("tip", "")),
    }
    return {
        "shot_type": shot,
        "confidence": conf,
        "reasoning": str(data.get("reasoning", "")),
        "alternatives": norm_alts,
        "form_feedback": ff,
        "estimated_skill": skill,
        "power_level": power,
    }


def _stub(reason: str) -> dict:
    return {
        "shot_type": "unknown",
        "confidence": 0.0,
        "reasoning": f"Parse error: {reason}",
        "alternatives": [],
        "form_feedback": {"strengths": [], "weaknesses": [], "tip": ""},
        "estimated_skill": "Intermediate",
        "power_level": "medium",
    }
