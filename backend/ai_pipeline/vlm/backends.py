"""VLM backends — unified interface across Gemini, Anthropic, OpenAI, local Ollama.

Each backend's `call(system_prompt, user_message, frames_jpeg) -> str` returns
the model's raw response (expected to be JSON). Parsing happens in classifier.py.

Auto-selection: at import time we check env vars and pick the first available.
Order: GEMINI_API_KEY > ANTHROPIC_API_KEY > OPENAI_API_KEY > LOCAL_VLM_URL.
"""
from __future__ import annotations

import json
import os
import sys
from abc import ABC, abstractmethod
from pathlib import Path


# ─── Backend base ────────────────────────────────────────────────────────
class VLMBackend(ABC):
    name: str = "base"

    @abstractmethod
    def call(self, system_prompt: str, user_message: str,
             frames_jpeg: list[bytes]) -> str: ...

    @abstractmethod
    def is_available(self) -> tuple[bool, str]: ...


# ─── Gemini ──────────────────────────────────────────────────────────────
class GeminiBackend(VLMBackend):
    name = "gemini"

    def __init__(self, model: str | None = None):
        # Google retired gemini-2.0-flash for new accounts. Current stable
        # model is gemini-2.5-flash. Override via GEMINI_MODEL env var if you
        # want flash-lite (cheaper) or pro (better, ~10x cost).
        self.model_name = model or os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
        self._client = None

    def is_available(self) -> tuple[bool, str]:
        if not os.getenv("GEMINI_API_KEY"):
            return False, "GEMINI_API_KEY not set"
        try:
            import google.generativeai  # noqa: F401
        except ImportError:
            return False, "pip install google-generativeai"
        return True, "ok"

    def _get(self):
        if self._client is None:
            import google.generativeai as genai
            genai.configure(api_key=os.environ["GEMINI_API_KEY"])
            self._client = genai.GenerativeModel(self.model_name)
        return self._client

    def call(self, system_prompt, user_message, frames_jpeg):
        import google.generativeai as genai
        model = self._get()
        # Gemini supports inline_data parts
        parts: list = [{"text": system_prompt}, {"text": user_message}]
        for j in frames_jpeg:
            parts.append({"mime_type": "image/jpeg", "data": j})
        resp = model.generate_content(
            parts,
            generation_config={
                "temperature": 0.0,
                "response_mime_type": "application/json",
            },
        )
        return resp.text


# ─── Anthropic ───────────────────────────────────────────────────────────
class AnthropicBackend(VLMBackend):
    name = "anthropic"

    def __init__(self, model: str = "claude-haiku-4-5-20251001"):
        self.model_name = model
        self._client = None

    def is_available(self) -> tuple[bool, str]:
        if not os.getenv("ANTHROPIC_API_KEY"):
            return False, "ANTHROPIC_API_KEY not set"
        try:
            import anthropic  # noqa: F401
        except ImportError:
            return False, "pip install anthropic"
        return True, "ok"

    def _get(self):
        if self._client is None:
            import anthropic
            self._client = anthropic.Anthropic()
        return self._client

    def call(self, system_prompt, user_message, frames_jpeg):
        import base64
        client = self._get()
        content: list = [{"type": "text", "text": user_message}]
        for j in frames_jpeg:
            content.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/jpeg",
                    "data": base64.b64encode(j).decode("ascii"),
                },
            })
        # Use prompt caching on the system prompt (it's reused across many shots).
        resp = client.messages.create(
            model=self.model_name,
            max_tokens=1024,
            system=[{"type": "text", "text": system_prompt,
                     "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": content}],
        )
        return resp.content[0].text


# ─── OpenAI (GPT-4o family) ──────────────────────────────────────────────
class OpenAIBackend(VLMBackend):
    name = "openai"

    def __init__(self, model: str = "gpt-4o-mini"):
        self.model_name = model
        self._client = None

    def is_available(self) -> tuple[bool, str]:
        if not os.getenv("OPENAI_API_KEY"):
            return False, "OPENAI_API_KEY not set"
        try:
            import openai  # noqa: F401
        except ImportError:
            return False, "pip install openai"
        return True, "ok"

    def _get(self):
        if self._client is None:
            from openai import OpenAI
            self._client = OpenAI()
        return self._client

    def call(self, system_prompt, user_message, frames_jpeg):
        import base64
        client = self._get()
        user_content: list = [{"type": "text", "text": user_message}]
        for j in frames_jpeg:
            b64 = base64.b64encode(j).decode("ascii")
            user_content.append({
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{b64}"},
            })
        resp = client.chat.completions.create(
            model=self.model_name,
            temperature=0.0,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
        )
        return resp.choices[0].message.content


# ─── Local: Ollama with a multimodal model (Qwen2.5-VL, MiniCPM-V, LLaVA) ─
class OllamaBackend(VLMBackend):
    name = "local"

    def __init__(self, model: str | None = None, url: str | None = None):
        # Default model + URL. Override via env or constructor.
        self.model_name = model or os.getenv("LOCAL_VLM_MODEL", "qwen2.5vl:7b")
        self.url = url or os.getenv("LOCAL_VLM_URL", "http://localhost:11434")

    def is_available(self) -> tuple[bool, str]:
        try:
            import requests
            r = requests.get(f"{self.url}/api/tags", timeout=2)
            r.raise_for_status()
            models = [m["name"] for m in r.json().get("models", [])]
            if self.model_name not in models:
                return False, f"Ollama up but {self.model_name} not pulled (try: ollama pull {self.model_name})"
            return True, "ok"
        except Exception as exc:
            return False, f"Ollama not reachable at {self.url}: {exc}"

    def call(self, system_prompt, user_message, frames_jpeg):
        import base64
        import requests
        images = [base64.b64encode(j).decode("ascii") for j in frames_jpeg]
        payload = {
            "model": self.model_name,
            "stream": False,
            "format": "json",
            "options": {"temperature": 0.0},
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message, "images": images},
            ],
        }
        r = requests.post(f"{self.url}/api/chat", json=payload, timeout=180)
        r.raise_for_status()
        return r.json().get("message", {}).get("content", "")


# ─── Backend selection ──────────────────────────────────────────────────
_BACKENDS: dict[str, type[VLMBackend]] = {
    "gemini": GeminiBackend,
    "anthropic": AnthropicBackend,
    "openai": OpenAIBackend,
    "local": OllamaBackend,
}

_PRIORITY = ["gemini", "anthropic", "openai", "local"]


def available_backends() -> list[dict]:
    """Return [{name, available, reason}] for every known backend."""
    out = []
    for name, cls in _BACKENDS.items():
        b = cls()
        ok, reason = b.is_available()
        out.append({"name": name, "available": ok, "reason": reason,
                    "model": b.model_name})
    return out


def pick_backend(name: str = "auto", model: str | None = None) -> VLMBackend:
    """Resolve backend name to an instance. 'auto' returns the first available.

    `model` (optional): explicit model name override. Useful for upgrading
    the default Gemini Flash to Gemini 2.5 Pro for premium-tier analyses,
    without changing GEMINI_MODEL globally.
    """
    if name and name != "auto":
        cls = _BACKENDS.get(name)
        if cls is None:
            raise ValueError(f"unknown VLM backend: {name}")
        b = cls(model=model) if model else cls()
        ok, reason = b.is_available()
        if not ok:
            raise RuntimeError(f"VLM backend '{name}' not available: {reason}")
        return b

    # auto: try in priority order
    failures: list[str] = []
    for n in _PRIORITY:
        b = _BACKENDS[n]()
        ok, reason = b.is_available()
        if ok:
            return b
        failures.append(f"{n}: {reason}")
    raise RuntimeError("no VLM backend available. tried:\n  " + "\n  ".join(failures))
