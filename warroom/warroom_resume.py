"""
Slice 6 — Resume d'archive (Python consumer).

Reads /tmp/warroom-resume-session.json (or WARROOM_RESUME_FILE env
override) and returns the pending resume payload for a given agent.
consume_resume_session() is one-shot: it clears the file after the
first successful read so subsequent voice-bridge spawns don't pick up
a stale resume.

WARROOM_RESUME_ENABLED=0 (or "false" / "no") disables the feature
server-side: consume_resume_session() returns None without touching
the file.

All I/O errors are swallowed (logger.warning); the voice path must
never break on a misconfigured file.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


def _resume_enabled() -> bool:
    """Mirror the TypeScript flag parsing. Default ON."""
    raw = os.environ.get("WARROOM_RESUME_ENABLED", "").strip().lower()
    return raw not in ("0", "false", "no")


def _resume_file_path() -> str:
    return os.environ.get(
        "WARROOM_RESUME_FILE", "/tmp/warroom-resume-session.json"
    )


def _load_payload() -> dict[str, Any] | None:
    path = Path(_resume_file_path())
    try:
        if not path.exists():
            return None
        raw = path.read_text(encoding="utf-8").strip()
        if not raw:
            return None
        parsed = json.loads(raw)
        if not isinstance(parsed, dict):
            return None
        return parsed
    except Exception as exc:
        logger.warning(
            "warroom_resume: read %s failed: %s", path, exc
        )
        return None


def pending_resume_session(agent_id: str) -> dict[str, Any] | None:
    """Return the pending resume entry for `agent_id`, or None.

    Does NOT clear the file. Use consume_resume_session() for the
    one-shot semantics.
    """
    payload = _load_payload()
    if not payload:
        return None
    sessions = payload.get("sessions")
    if not isinstance(sessions, list):
        return None
    for entry in sessions:
        if isinstance(entry, dict) and entry.get("agent_id") == agent_id:
            return entry
    return None


def consume_resume_session(agent_id: str) -> dict[str, Any] | None:
    """One-shot: read the resume for `agent_id`, then clear the file.

    Returns None (without touching the file) when
    WARROOM_RESUME_ENABLED=0.
    """
    if not _resume_enabled():
        return None
    entry = pending_resume_session(agent_id)
    if entry is None:
        # Nothing for this agent — leave the file in place in case
        # another agent spawn consumes it. A stale file is cleaned up
        # by the /api/warroom/meeting/end handler (dashboard.ts).
        return None

    # Clear: one-shot contract. A typo or a crash mid-read just means
    # the resume didn't land — not a disaster.
    try:
        path = Path(_resume_file_path())
        if path.exists():
            path.unlink()
    except Exception as exc:
        logger.warning("warroom_resume: clear failed: %s", exc)
    return entry
