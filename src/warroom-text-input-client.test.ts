/**
 * Slice 4 — Text input mi-session (RED)
 *
 * Structural tests on the HTML emitted by getWarRoomHtml(): the text
 * input bar must render (by default), carry the right IDs, wire
 * `sendClientMessage('text-input', ...)` through Pipecat, and be gated
 * by the WARROOM_TEXT_INPUT feature flag.
 *
 * These tests inspect the rendered template without a browser — cheap
 * assertions that break fast if the UI regresses or the Pipecat API
 * name drifts. Browser-level behaviour (actual keystroke, transcript
 * echo, etc.) lives in tests/e2e/playwright/text-input.spec.ts.
 */

import { describe, it, expect } from 'vitest';
import { getWarRoomHtml } from './warroom-html.js';

describe('Slice 4 — War Room text input (client, RED)', () => {
  describe('feature flag default = enabled', () => {
    it('renders the #warroomTextInput field when the flag is not passed (default on)', () => {
      const html = getWarRoomHtml('t', 'c', 7860);
      expect(html).toMatch(/id="warroomTextInput"/);
    });

    it('renders the #warroomTextSendBtn submit button by default', () => {
      const html = getWarRoomHtml('t', 'c', 7860);
      expect(html).toMatch(/id="warroomTextSendBtn"/);
    });

    it('exposes the feature-flag value to the client as window.WARROOM_TEXT_INPUT', () => {
      // GREEN will expose the resolved flag value to client JS so the
      // submit handler can noop when the flag is off (defense in depth:
      // server-side gating + client-side gating).
      const html = getWarRoomHtml('t', 'c', 7860);
      expect(html).toMatch(/window\.WARROOM_TEXT_INPUT\s*=/);
    });
  });

  describe('feature flag OFF hides the input', () => {
    it('does NOT render #warroomTextInput when WARROOM_TEXT_INPUT=false is passed', () => {
      // The signature extension adds an optional 4th arg `textInputEnabled`.
      // When false, the entire text-input row is omitted from the DOM.
      const html = (getWarRoomHtml as (
        t: string,
        c: string,
        p: number,
        textInputEnabled?: boolean,
      ) => string)('t', 'c', 7860, false);
      expect(html).not.toMatch(/id="warroomTextInput"/);
      expect(html).not.toMatch(/id="warroomTextSendBtn"/);
    });

    it('still emits window.WARROOM_TEXT_INPUT = "0" when disabled (so client JS can probe it)', () => {
      const html = (getWarRoomHtml as (
        t: string,
        c: string,
        p: number,
        textInputEnabled?: boolean,
      ) => string)('t', 'c', 7860, false);
      expect(html).toMatch(/window\.WARROOM_TEXT_INPUT\s*=\s*['"]0['"]/);
    });
  });

  describe('Pipecat wiring', () => {
    it('calls pipecatClient.sendClientMessage("text-input", { text }) on submit', () => {
      const html = getWarRoomHtml('t', 'c', 7860);
      // The client calls sendClientMessage with the typed string as the
      // second argument (data payload). Match the literal RTVI message
      // type — this pins the contract against the Python handler in
      // warroom/server.py (on_client_message, message.type == "text-input").
      expect(html).toMatch(/sendClientMessage\s*\(\s*['"]text-input['"]/);
    });

    it('echoes the typed text locally via addTranscriptEntry before the server round-trip', () => {
      // Local echo prevents the visible lag while Gemini Live processes.
      // We search for the pattern "addTranscriptEntry('user'" (or "user")
      // triggered from the text submit handler. Close enough as a pin.
      const html = getWarRoomHtml('t', 'c', 7860);
      expect(html).toMatch(/sendWarRoomText/);
      expect(html).toMatch(/addTranscriptEntry\s*\(\s*['"]user['"]/);
    });

    it('persists the text turn via POST /api/warroom/meeting/transcript', () => {
      // So the archive (Slice 3) and session store (Slice 2) both see the
      // user's text turn, not just the voice transcript. The client
      // posts with speaker='user' alongside the local echo.
      const html = getWarRoomHtml('t', 'c', 7860);
      expect(html).toMatch(/\/api\/warroom\/meeting\/transcript/);
    });
  });
});
