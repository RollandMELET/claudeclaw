/**
 * Slice 1 — server-side validation for war room transcript POSTs.
 *
 * `POST /api/warroom/meeting/transcript` must reject the generic speaker
 * label 'Agent' with a warning, so the DB never accumulates ambiguous
 * attribution. See docs/rfc-warroom-v2.md §"API changes".
 */

import { describe, it, expect } from 'vitest';
import { validateTranscriptSpeaker } from './warroom-transcript-validator.js';

describe('validateTranscriptSpeaker', () => {
  it('accepts a real agent id', () => {
    expect(validateTranscriptSpeaker('main')).toEqual({ ok: true });
    expect(validateTranscriptSpeaker('rc2')).toEqual({ ok: true });
    expect(validateTranscriptSpeaker('comms')).toEqual({ ok: true });
    expect(validateTranscriptSpeaker('rorworld-warroom')).toEqual({ ok: true });
  });

  it('accepts the user marker "user"', () => {
    expect(validateTranscriptSpeaker('user')).toEqual({ ok: true });
  });

  it('rejects the generic "Agent" label (case sensitive)', () => {
    const result = validateTranscriptSpeaker('Agent');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('generic-agent-label');
  });

  it('rejects "agent" and "AGENT" as well (case-insensitive)', () => {
    expect(validateTranscriptSpeaker('agent').ok).toBe(false);
    expect(validateTranscriptSpeaker('AGENT').ok).toBe(false);
  });

  it('rejects empty or whitespace-only speakers', () => {
    const r1 = validateTranscriptSpeaker('');
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.reason).toBe('empty');

    const r2 = validateTranscriptSpeaker('   ');
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.reason).toBe('empty');
  });

  it('rejects non-string inputs', () => {
    // The validator accepts `unknown` by design; these are runtime-only checks.
    expect(validateTranscriptSpeaker(null).ok).toBe(false);
    expect(validateTranscriptSpeaker(undefined).ok).toBe(false);
    expect(validateTranscriptSpeaker(42).ok).toBe(false);
  });
});
