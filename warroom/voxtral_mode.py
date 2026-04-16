"""
Voxtral mode for War Room (fork-specific, not in upstream).

Uses the fork's existing TTS infrastructure instead of Gemini Live:
  - STT: Groq Whisper cloud (GROQ_API_KEY, OpenAI-compat endpoint)
  - TTS: Voxtral MLX local server on port 8881 (VOXTRAL_LOCAL_URL,
         OpenAI-compat /v1/audio/speech endpoint)

Pros over Gemini Live mode:
  - Voice stays consistent with the Telegram bot (same Voxtral cascade)
  - Doesn't consume the shared GOOGLE_API_KEY quota
  - Fully local TTS (no data leaves the machine for speech synthesis)

Cons:
  - ~2-3s end-to-end latency vs ~500ms for Gemini Live
  - Not speech-to-speech; STT → text → LLM → TTS pipeline

Selected via WARROOM_MODE=voxtral. Defaults (live) and legacy
(Deepgram+Cartesia) remain available.
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

# Default HTTP endpoints — overridable via env
DEFAULT_VOXTRAL_URL = "http://localhost:8881"
DEFAULT_VOXTRAL_VOICE = "fr_male"
DEFAULT_VOXTRAL_MODEL = "voxtral-4b-tts-2603-mlx-4bit"
GROQ_STT_BASE_URL = "https://api.groq.com/openai/v1"
GROQ_STT_MODEL = "whisper-large-v3-turbo"


def _require_env(key: str) -> str:
    val = os.environ.get(key, "").strip()
    if not val:
        raise RuntimeError(
            f"WARROOM_MODE=voxtral requires {key} in the environment. "
            f"Set it in .env or export it before launching warroom."
        )
    return val


def check_required_keys() -> None:
    """Fail fast if voxtral mode is selected without the required keys."""
    _require_env("GROQ_API_KEY")
    # VOXTRAL_LOCAL_URL is optional — defaults to localhost:8881
    url = os.environ.get("VOXTRAL_LOCAL_URL", DEFAULT_VOXTRAL_URL)
    logger.info("voxtral mode: using Voxtral at %s", url)


def _build_stt_service():
    """Groq Whisper STT via OpenAI-compatible pipecat service."""
    from pipecat.services.openai.stt import OpenAISTTService

    return OpenAISTTService(
        api_key=_require_env("GROQ_API_KEY"),
        base_url=GROQ_STT_BASE_URL,
        model=os.environ.get("GROQ_STT_MODEL", GROQ_STT_MODEL),
    )


def _build_tts_service():
    """Voxtral MLX TTS via OpenAI-compatible /v1/audio/speech endpoint."""
    from pipecat.services.openai.tts import OpenAITTSService

    voxtral_url = os.environ.get("VOXTRAL_LOCAL_URL", DEFAULT_VOXTRAL_URL)
    return OpenAITTSService(
        api_key="not-needed",  # local server, no auth
        base_url=f"{voxtral_url}/v1",
        voice=os.environ.get("VOXTRAL_VOICE", DEFAULT_VOXTRAL_VOICE),
        model=os.environ.get("VOXTRAL_MODEL", DEFAULT_VOXTRAL_MODEL),
    )


async def run_voxtral_mode():
    """
    Entry point for WARROOM_MODE=voxtral.

    Reuses the legacy-mode pipeline shape (STT → router → agent-bridge → TTS),
    swapping Deepgram→Groq and Cartesia→Voxtral. This keeps upstream
    router.py and agent_bridge.py as the single source of truth for agent
    routing — only the STT/TTS adapters change.
    """
    check_required_keys()

    # Import the legacy-mode pipeline builder from server.py and inject
    # our STT/TTS services. Kept here as a lazy import so `pipecat` is
    # only required when someone actually selects voxtral mode.
    from server import run_legacy_mode_with_services  # type: ignore

    logger.info(
        "voxtral mode: starting with STT=Groq Whisper, TTS=Voxtral MLX local"
    )
    await run_legacy_mode_with_services(
        stt_service=_build_stt_service(),
        tts_service=_build_tts_service(),
    )
