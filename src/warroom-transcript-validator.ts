/**
 * Validator for `POST /api/warroom/meeting/transcript` speaker field.
 *
 * Slice 1 of the War Room v2 migration: prevent the generic 'Agent' label
 * (historical bug from a pair of onBotTranscript callbacks that had
 * hard-coded `'Agent'` and `'main'`) from ever reaching
 * warroom_transcript.speaker. The client-side fix propagates the real
 * pinnedAgent id; this validator is the server-side belt-and-braces guard.
 *
 * See docs/rfc-warroom-v2.md, section "API changes".
 */

export type TranscriptSpeakerValidation =
  | { ok: true }
  | { ok: false; reason: 'empty' | 'generic-agent-label' | 'non-string' };

/**
 * Returns whether `speaker` is an acceptable value for
 * `warroom_transcript.speaker`.
 *
 * Accepted:
 *   - "user" (marker for the human side)
 *   - any non-empty, non-"agent" identifier ("main", "rc2", "comms", ...)
 *
 * Rejected:
 *   - non-strings
 *   - empty or whitespace-only strings
 *   - "agent" in any case — historical leak from the pre-Slice-1 client
 */
export function validateTranscriptSpeaker(
  speaker: unknown,
): TranscriptSpeakerValidation {
  if (typeof speaker !== 'string') {
    return { ok: false, reason: 'non-string' };
  }

  const trimmed = speaker.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: 'empty' };
  }

  if (trimmed.toLowerCase() === 'agent') {
    return { ok: false, reason: 'generic-agent-label' };
  }

  return { ok: true };
}
