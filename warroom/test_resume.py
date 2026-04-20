"""
Slice 6 — Resume d'archive (Python, RED).

Parallel to src/warroom-resume-file.ts. The Python side is consumed
by warroom/server.py at voice-bridge spawn time to read the pending
resume payload and forward --resume-session (or --resume-turns
fallback) to the subprocess. One-shot: the file is cleared after
the first successful read.

Runs in any venv with pytest (no pipecat dependency).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest


sys.path.insert(0, str(Path(__file__).resolve().parent))


@pytest.fixture(autouse=True)
def isolate_resume_file(tmp_path, monkeypatch):
    """Redirect WARROOM_RESUME_FILE to a per-test tmp path."""
    resume_file = tmp_path / "resume.json"
    monkeypatch.setenv("WARROOM_RESUME_FILE", str(resume_file))
    yield resume_file


def test_pending_resume_session_returns_none_when_file_missing(isolate_resume_file):
    from warroom_resume import pending_resume_session

    assert not isolate_resume_file.exists()
    assert pending_resume_session("rc1") is None


def test_pending_resume_session_returns_none_when_file_empty(isolate_resume_file):
    from warroom_resume import pending_resume_session

    isolate_resume_file.write_text("", encoding="utf-8")
    assert pending_resume_session("rc1") is None


def test_pending_resume_session_returns_none_on_malformed_json(isolate_resume_file):
    from warroom_resume import pending_resume_session

    isolate_resume_file.write_text("{not json", encoding="utf-8")
    assert pending_resume_session("rc1") is None


def test_pending_resume_session_returns_none_for_unknown_agent(isolate_resume_file):
    from warroom_resume import pending_resume_session

    isolate_resume_file.write_text(
        json.dumps(
            {
                "meeting_id": "mtg-x",
                "sessions": [
                    {"agent_id": "rc1", "session_id": "cc-1", "last_turns": []}
                ],
            }
        ),
        encoding="utf-8",
    )
    assert pending_resume_session("research") is None


def test_pending_resume_session_returns_session_and_turns(isolate_resume_file):
    from warroom_resume import pending_resume_session

    payload = {
        "meeting_id": "mtg-y",
        "sessions": [
            {
                "agent_id": "rc1",
                "session_id": "cc-abc-123",
                "last_turns": [
                    {"turn_number": 1, "user_message": "q1", "agent_response": "a1"},
                    {"turn_number": 2, "user_message": "q2", "agent_response": "a2"},
                ],
            }
        ],
    }
    isolate_resume_file.write_text(json.dumps(payload), encoding="utf-8")

    got = pending_resume_session("rc1")
    assert got is not None
    assert got["session_id"] == "cc-abc-123"
    assert len(got["last_turns"]) == 2
    assert got["last_turns"][0]["user_message"] == "q1"


def test_consume_resume_session_clears_file_after_read(isolate_resume_file):
    """One-shot: after consume_resume_session returns, the file is gone."""
    from warroom_resume import consume_resume_session

    payload = {
        "meeting_id": "mtg-z",
        "sessions": [
            {"agent_id": "rc1", "session_id": "cc-z", "last_turns": []}
        ],
    }
    isolate_resume_file.write_text(json.dumps(payload), encoding="utf-8")

    got = consume_resume_session("rc1")
    assert got is not None
    assert got["session_id"] == "cc-z"
    # File must be removed (or cleared) so a second call returns None.
    assert consume_resume_session("rc1") is None


def test_consume_resume_session_is_noop_when_disabled(isolate_resume_file, monkeypatch):
    """WARROOM_RESUME_ENABLED=0 → handler returns None unconditionally."""
    from warroom_resume import consume_resume_session

    payload = {
        "meeting_id": "mtg-d",
        "sessions": [{"agent_id": "rc1", "session_id": "cc-d", "last_turns": []}],
    }
    isolate_resume_file.write_text(json.dumps(payload), encoding="utf-8")
    monkeypatch.setenv("WARROOM_RESUME_ENABLED", "0")

    assert consume_resume_session("rc1") is None
    # File must still exist — disabled handler must not mutate state.
    assert isolate_resume_file.exists()
