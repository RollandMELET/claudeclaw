"""War Room test harness — start/stop dev Pipecat server, reset DB, inject transcripts.

Slice 0 — scaffold only. Actual implementation lands in subsequent slices as
tests for each slice land.

Usage (once implemented):

    import pytest
    from tests.e2e.fixtures.war_room_harness import WarRoomHarness

    @pytest.fixture
    async def harness():
        h = WarRoomHarness(port=7861, dev_db=True)
        await h.start()
        yield h
        await h.stop()

    async def test_meeting_persists_turns(harness):
        meeting = await harness.create_meeting(pinned_agent="main", mode="direct")
        await harness.inject_transcript(meeting.id, speaker="main", text="Hello")
        turns = await harness.get_turns(meeting.id)
        assert len(turns) == 1
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass
class MeetingHandle:
    """Opaque handle to a test meeting. Slice 2+ will populate fields."""

    id: str
    pinned_agent: str
    mode: str


class WarRoomHarness:
    """Integration harness for War Room v2 tests.

    Placeholder for Slice 0. Concrete behaviour is implemented incrementally
    as each slice's tests require new capabilities (meetings, agent sessions,
    turns, resume checkpoints).
    """

    def __init__(self, port: int = 7861, dev_db: bool = True) -> None:
        self.port = port
        self.dev_db = dev_db
        self._process: asyncio.subprocess.Process | None = None

    async def start(self) -> None:
        raise NotImplementedError(
            "WarRoomHarness.start() scaffolded in Slice 0; "
            "implemented in Slice 2 (session store) and beyond."
        )

    async def stop(self) -> None:
        raise NotImplementedError(
            "WarRoomHarness.stop() scaffolded in Slice 0."
        )

    async def create_meeting(self, pinned_agent: str, mode: str) -> MeetingHandle:
        raise NotImplementedError("Implemented in Slice 2.")

    async def inject_transcript(
        self, meeting_id: str, speaker: str, text: str
    ) -> None:
        raise NotImplementedError("Implemented in Slice 2.")

    async def get_turns(self, meeting_id: str) -> list[dict[str, Any]]:
        raise NotImplementedError("Implemented in Slice 2.")
