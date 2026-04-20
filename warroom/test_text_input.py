"""
Tests for the War Room text-input handler (Slice 4).

The handler is a thin wrapper that catches RTVI client messages of
type "text-input" and queues an LLMMessagesAppendFrame into the live
Gemini pipeline so the typed text becomes a user turn. We mock the
pipecat frames module so this test runs without a live pipeline.

Runs under pytest in warroom/.venv/ (from the sibling ClaudeClaw clone
or any venv with pipecat-ai + pytest + pytest-asyncio installed):

  /Users/macminirolland/Dev/ClaudeClaw/warroom/.venv/bin/python \\
      -m pytest warroom/test_text_input.py -v
"""

from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest


# Make warroom/ importable when running from project root
sys.path.insert(0, str(Path(__file__).resolve().parent))


@pytest.mark.asyncio
async def test_text_input_handler_queues_llm_messages_append_frame():
    """
    handle_text_input_message(task, message) must queue a
    LLMMessagesAppendFrame with role='user' and run_llm=True when the
    incoming RTVI message carries type='text-input' + data['text'].
    """
    # Stub pipecat frames so the SUT can import LLMMessagesAppendFrame
    # without a live pipecat install leaking into this test.
    fake_frames_mod = MagicMock()

    class _FakeFrame:
        def __init__(self, messages=None, run_llm=None):
            self.messages = messages
            self.run_llm = run_llm

    fake_frames_mod.LLMMessagesAppendFrame = _FakeFrame
    sys.modules["pipecat"] = MagicMock()
    sys.modules["pipecat.frames"] = MagicMock()
    sys.modules["pipecat.frames.frames"] = fake_frames_mod

    # Import the module under test (must exist pre-GREEN as a stub that
    # raises NotImplementedError).
    from warroom_text_input import handle_text_input_message

    # Build a fake task with an async queue_frame() that records calls.
    task = SimpleNamespace(queue_frame=AsyncMock())

    # Build a fake RTVI.ClientMessage. The handler only reads .type and
    # .data (per pipecat 0.0.108 on_client_message signature).
    message = SimpleNamespace(
        msg_id="msg-1",
        type="text-input",
        data={"text": "Bonjour RC1"},
    )

    await handle_text_input_message(task, message)

    task.queue_frame.assert_awaited_once()
    (queued_frame,), _ = task.queue_frame.await_args
    assert isinstance(queued_frame, _FakeFrame)
    assert queued_frame.messages == [{"role": "user", "content": "Bonjour RC1"}]
    assert queued_frame.run_llm is True


@pytest.mark.asyncio
async def test_text_input_handler_ignores_non_text_input_types():
    """Messages of a different type must be a silent no-op (no frame queued)."""
    fake_frames_mod = MagicMock()

    class _FakeFrame:
        def __init__(self, messages=None, run_llm=None):
            self.messages = messages
            self.run_llm = run_llm

    fake_frames_mod.LLMMessagesAppendFrame = _FakeFrame
    sys.modules["pipecat"] = MagicMock()
    sys.modules["pipecat.frames"] = MagicMock()
    sys.modules["pipecat.frames.frames"] = fake_frames_mod

    from warroom_text_input import handle_text_input_message

    task = SimpleNamespace(queue_frame=AsyncMock())
    message = SimpleNamespace(msg_id="x", type="not-text-input", data={})
    await handle_text_input_message(task, message)
    task.queue_frame.assert_not_awaited()


@pytest.mark.asyncio
async def test_text_input_handler_ignores_empty_text():
    """Empty / whitespace text is a silent no-op — no stray user turn."""
    fake_frames_mod = MagicMock()

    class _FakeFrame:
        def __init__(self, messages=None, run_llm=None):
            self.messages = messages
            self.run_llm = run_llm

    fake_frames_mod.LLMMessagesAppendFrame = _FakeFrame
    sys.modules["pipecat"] = MagicMock()
    sys.modules["pipecat.frames"] = MagicMock()
    sys.modules["pipecat.frames.frames"] = fake_frames_mod

    from warroom_text_input import handle_text_input_message

    task = SimpleNamespace(queue_frame=AsyncMock())
    for empty in ("", "   ", "\n\t"):
        message = SimpleNamespace(msg_id="x", type="text-input", data={"text": empty})
        await handle_text_input_message(task, message)
    task.queue_frame.assert_not_awaited()


@pytest.mark.asyncio
async def test_text_input_handler_respects_disabled_flag(monkeypatch):
    """When WARROOM_TEXT_INPUT=0 is set in env, the handler must no-op.

    Defense in depth: the UI also hides the input client-side, but a
    compromised / stale client must not be able to inject turns when
    the admin has disabled the feature server-side.
    """
    fake_frames_mod = MagicMock()

    class _FakeFrame:
        def __init__(self, messages=None, run_llm=None):
            self.messages = messages
            self.run_llm = run_llm

    fake_frames_mod.LLMMessagesAppendFrame = _FakeFrame
    sys.modules["pipecat"] = MagicMock()
    sys.modules["pipecat.frames"] = MagicMock()
    sys.modules["pipecat.frames.frames"] = fake_frames_mod

    # Reload the module so it picks up the monkeypatched env.
    monkeypatch.setenv("WARROOM_TEXT_INPUT", "0")
    if "warroom_text_input" in sys.modules:
        del sys.modules["warroom_text_input"]
    from warroom_text_input import handle_text_input_message

    task = SimpleNamespace(queue_frame=AsyncMock())
    message = SimpleNamespace(msg_id="x", type="text-input", data={"text": "blocked"})
    await handle_text_input_message(task, message)
    task.queue_frame.assert_not_awaited()
