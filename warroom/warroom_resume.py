"""
Slice 6 — Resume d'archive (Python, RED stub).

Reads /tmp/warroom-resume-session.json (or WARROOM_RESUME_FILE env
override) and returns the pending resume payload for a given agent.
consume_resume_session() is one-shot: it clears the file after the
first successful read so subsequent voice-bridge spawns don't pick up
a stale resume.

GREEN replaces the stubs with real fs I/O.
"""

from __future__ import annotations

from typing import Any


def pending_resume_session(agent_id: str) -> dict[str, Any] | None:
    """Return the pending resume entry for `agent_id`, or None.

    Does NOT clear the file. Use consume_resume_session() for the
    one-shot semantics.
    """
    raise NotImplementedError("Slice 6 GREEN will implement pending_resume_session")


def consume_resume_session(agent_id: str) -> dict[str, Any] | None:
    """One-shot: read the resume for `agent_id`, then clear the file.

    Returns None (without touching the file) when WARROOM_RESUME_ENABLED=0.
    """
    raise NotImplementedError("Slice 6 GREEN will implement consume_resume_session")
