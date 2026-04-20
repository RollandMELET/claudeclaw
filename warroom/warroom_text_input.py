"""
War Room text-input handler (Slice 4).

Parses RTVI client messages of type "text-input" and queues an
LLMMessagesAppendFrame into the live Gemini pipeline so typed text
becomes a user turn. The agent response stays in audio (Option A per
§4.4.1 of the Slice 4 plan).

Wiring in server.py (inside the live mode pipeline builder, after the
PipelineTask is created):

    from warroom_text_input import handle_text_input_message

    @task.rtvi.event_handler("on_client_message")
    async def _on_client_message(rtvi, message):
        await handle_text_input_message(task, message)

The handler is tolerant: wrong type, missing data, empty text, or a
disabled WARROOM_TEXT_INPUT env flag all no-op. This keeps the voice
path bullet-proof against malformed client messages.
"""

from __future__ import annotations

import os
from typing import Any


def _text_input_enabled() -> bool:
    """Mirror the TypeScript WARROOM_TEXT_INPUT parsing.

    Default is ON. Only explicit "0" / "false" / "no" disable the
    feature server-side. Anything else is treated as enabled, so a
    missing env var (fresh install) behaves the same as "1".
    """
    raw = os.environ.get("WARROOM_TEXT_INPUT", "").strip().lower()
    return raw not in ("0", "false", "no")


async def handle_text_input_message(task: Any, message: Any) -> None:
    """Route an RTVI client message of type 'text-input' into the pipeline.

    Parameters:
        task: the pipecat PipelineTask whose .queue_frame() accepts
              frames. We call task.queue_frame(frame) to inject the
              user turn into the live Gemini context.
        message: an object with `.type` (str) and `.data` (dict). In
                 pipecat 0.0.108 this is an RTVI.ClientMessage
                 yielded by the on_client_message event handler.

    Behaviour:
        * Non-"text-input" message types → no-op.
        * Empty / whitespace-only text → no-op (no stray user turn).
        * WARROOM_TEXT_INPUT disabled → no-op (defense in depth).
        * Otherwise: queue an LLMMessagesAppendFrame with a single
          role='user' message and run_llm=True so Gemini replies.
    """
    if not _text_input_enabled():
        return

    # Server-side validation of the message type so a client that's
    # been tricked into sending arbitrary types can't piggy-back.
    msg_type = getattr(message, "type", None)
    if msg_type != "text-input":
        return

    data = getattr(message, "data", None) or {}
    raw_text = data.get("text") if isinstance(data, dict) else None
    if not isinstance(raw_text, str):
        return
    text = raw_text.strip()
    if not text:
        return

    # Import the frame type lazily so unit tests can mock
    # pipecat.frames.frames via sys.modules without the real install.
    # InputTextRawFrame is the frame Gemini Live consumes for user text turns
    # (see pipecat.services.google.gemini_live.llm:1063). LLMMessagesAppendFrame
    # only works as a legacy kickoff when no context aggregator is attached.
    from pipecat.frames.frames import InputTextRawFrame  # type: ignore

    frame = InputTextRawFrame(text=text)
    await task.queue_frame(frame)
