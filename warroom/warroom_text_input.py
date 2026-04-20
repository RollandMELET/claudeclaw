"""
War Room text-input handler (Slice 4 — RED stub).

Parses RTVI client messages of type "text-input" and queues an
LLMMessagesAppendFrame into the live Gemini pipeline so typed text
becomes a user turn. The agent response stays in audio (Option A per
§4.4.1 of the Slice 4 plan).

RED phase: the handler is a stub that always raises NotImplementedError.
Tests assert the runtime contract, not the stub. GREEN replaces the
stub with real frame queuing + feature-flag gating.
"""

from __future__ import annotations

from typing import Any


async def handle_text_input_message(task: Any, message: Any) -> None:
    """Route an RTVI client message of type 'text-input' into the pipeline.

    Parameters:
        task: the pipecat PipelineTask whose .queue_frame() accepts frames.
        message: an RTVI.ClientMessage with .type and .data attributes.
    """
    raise NotImplementedError("Slice 4 GREEN will implement this handler.")
