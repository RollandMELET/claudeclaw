"""
Tests for voxtral_mode.py (fork-specific War Room voice mode).

Runs under pytest inside warroom/.venv/ (install deps first):
  python3 -m venv warroom/.venv
  source warroom/.venv/bin/activate
  pip install -r warroom/requirements.txt pytest pytest-asyncio

Then:
  pytest warroom/test_voxtral_mode.py -v
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest


# Make warroom/ importable when running from project root
sys.path.insert(0, str(Path(__file__).resolve().parent))


@pytest.fixture(autouse=True)
def isolate_env(monkeypatch):
    """Clear voxtral-related env vars before each test."""
    for k in (
        "GROQ_API_KEY",
        "VOXTRAL_LOCAL_URL",
        "VOXTRAL_VOICE",
        "VOXTRAL_MODEL",
        "GROQ_STT_MODEL",
    ):
        monkeypatch.delenv(k, raising=False)
    yield


class TestCheckRequiredKeys:
    def test_raises_when_groq_key_missing(self):
        from voxtral_mode import check_required_keys

        with pytest.raises(RuntimeError, match=r"GROQ_API_KEY"):
            check_required_keys()

    def test_passes_when_groq_key_present(self, monkeypatch, caplog):
        monkeypatch.setenv("GROQ_API_KEY", "gsk_test_value")
        from voxtral_mode import check_required_keys

        # Should not raise
        check_required_keys()

    def test_raises_when_groq_key_empty_string(self, monkeypatch):
        monkeypatch.setenv("GROQ_API_KEY", "   ")
        from voxtral_mode import check_required_keys

        with pytest.raises(RuntimeError, match=r"GROQ_API_KEY"):
            check_required_keys()


class TestServiceBuilders:
    def test_stt_service_uses_groq_endpoint(self, monkeypatch):
        monkeypatch.setenv("GROQ_API_KEY", "gsk_test")

        fake_stt = MagicMock(name="OpenAISTTService")
        with patch.dict(
            "sys.modules",
            {
                "pipecat": MagicMock(),
                "pipecat.services": MagicMock(),
                "pipecat.services.openai": MagicMock(),
                "pipecat.services.openai.stt": MagicMock(OpenAISTTService=fake_stt),
            },
        ):
            from voxtral_mode import _build_stt_service, GROQ_STT_BASE_URL

            _build_stt_service()
            fake_stt.assert_called_once()
            kwargs = fake_stt.call_args.kwargs
            assert kwargs["api_key"] == "gsk_test"
            assert kwargs["base_url"] == GROQ_STT_BASE_URL

    def test_tts_service_uses_voxtral_local_url(self, monkeypatch):
        monkeypatch.setenv("VOXTRAL_LOCAL_URL", "http://localhost:9999")
        monkeypatch.setenv("VOXTRAL_VOICE", "fr_female")

        fake_tts = MagicMock(name="OpenAITTSService")
        with patch.dict(
            "sys.modules",
            {
                "pipecat": MagicMock(),
                "pipecat.services": MagicMock(),
                "pipecat.services.openai": MagicMock(),
                "pipecat.services.openai.tts": MagicMock(OpenAITTSService=fake_tts),
            },
        ):
            from voxtral_mode import _build_tts_service

            _build_tts_service()
            fake_tts.assert_called_once()
            kwargs = fake_tts.call_args.kwargs
            assert kwargs["base_url"] == "http://localhost:9999/v1"
            assert kwargs["voice"] == "fr_female"

    def test_tts_service_defaults_when_env_not_set(self, monkeypatch):
        fake_tts = MagicMock(name="OpenAITTSService")
        with patch.dict(
            "sys.modules",
            {
                "pipecat": MagicMock(),
                "pipecat.services": MagicMock(),
                "pipecat.services.openai": MagicMock(),
                "pipecat.services.openai.tts": MagicMock(OpenAITTSService=fake_tts),
            },
        ):
            from voxtral_mode import (
                _build_tts_service,
                DEFAULT_VOXTRAL_URL,
                DEFAULT_VOXTRAL_VOICE,
            )

            _build_tts_service()
            kwargs = fake_tts.call_args.kwargs
            assert kwargs["base_url"] == f"{DEFAULT_VOXTRAL_URL}/v1"
            assert kwargs["voice"] == DEFAULT_VOXTRAL_VOICE


class TestModuleContract:
    def test_exports_run_voxtral_mode(self):
        import voxtral_mode

        assert callable(voxtral_mode.run_voxtral_mode)

    def test_defaults_are_sensible(self):
        import voxtral_mode

        assert voxtral_mode.DEFAULT_VOXTRAL_URL.startswith("http")
        assert voxtral_mode.GROQ_STT_BASE_URL == "https://api.groq.com/openai/v1"
