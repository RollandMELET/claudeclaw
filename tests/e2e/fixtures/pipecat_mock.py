"""Pipecat transport mock — scripted RTVI frames for integration tests.

Slice 0 — scaffold only. Real implementation arrives when Slice 4 (text input)
or Slice 2 (session store) need to assert on frame flow without a live
WebSocket/Gemini connection.

Usage (once implemented):

    from tests.e2e.fixtures.pipecat_mock import MockPipecatTransport

    async def test_text_input_produces_user_message_frame():
        transport = MockPipecatTransport()
        transport.script([
            # User sends a text-input RTVI message
            {"type": "text-input", "text": "Bonjour RC1"},
        ])
        frames = await transport.collect()
        assert any(f.type == "UserMessageFrame" and f.text == "Bonjour RC1" for f in frames)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class MockFrame:
    """Minimal frame representation for assertions. Slice 4 may replace with real Pipecat types."""

    type: str
    payload: dict[str, Any] = field(default_factory=dict)

    @property
    def text(self) -> str | None:
        return self.payload.get("text")


class MockPipecatTransport:
    """Mock transport that records scripted frames without a live connection."""

    def __init__(self) -> None:
        self._scripted: list[dict[str, Any]] = []
        self._emitted: list[MockFrame] = []

    def script(self, messages: list[dict[str, Any]]) -> None:
        """Queue RTVI client messages to be played back on .collect()."""
        self._scripted.extend(messages)

    async def collect(self) -> list[MockFrame]:
        raise NotImplementedError(
            "MockPipecatTransport.collect() scaffolded in Slice 0; "
            "real playback implemented in Slice 4 (text input)."
        )
