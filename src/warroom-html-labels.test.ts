/**
 * Slice 1 — speaker identity propagation in the War Room client.
 *
 * Bug: src/warroom-html.ts had two onBotTranscript callbacks that hard-coded
 * the speaker label to 'Agent' and the agentId to 'main'. This regressed the
 * transcript rendering whenever those callbacks were used (main connect and
 * the reconnect auto-retry), showing a generic 'Agent' label instead of the
 * real RC1/Comms/Ops/etc. name and polluting warroom_transcript rows with
 * 'main' as the speaker regardless of the pinned agent.
 *
 * These tests assert that both callbacks now derive the label from
 * AGENT_LABELS[pinnedAgent] and the agentId from pinnedAgent, with sane
 * fallbacks for the unpinned case.
 */

import { describe, it, expect } from 'vitest';
import { getWarRoomHtml } from './warroom-html.js';

describe('Slice 1 — bot transcript speaker labels', () => {
  const html = getWarRoomHtml('token', 'chat', 7860);

  it('main onBotTranscript uses AGENT_LABELS[pinnedAgent] instead of hardcoded "Agent"', () => {
    // The fix must derive the label from AGENT_LABELS and pinnedAgent
    expect(html).toContain("AGENT_LABELS[pinnedAgent] || pinnedAgent || 'Main'");
  });

  it('main onBotTranscript uses pinnedAgent as agentId (with main fallback)', () => {
    expect(html).toContain("pinnedAgent || 'main'");
  });

  it('no onBotTranscript hardcodes the string "Agent" as speaker anymore', () => {
    // Extract every line that contains addTranscriptEntry and check none of
    // them pass the literal 'Agent' as the speaker (user entries use 'You'
    // which is fine, and 'system' entries don't render a speaker).
    const addCalls = html
      .split('\n')
      .filter((l) => l.includes('addTranscriptEntry('));
    const hardcodedAgent = addCalls.filter((l) =>
      /addTranscriptEntry\(\s*['"]Agent['"]/.test(l),
    );
    expect(hardcodedAgent).toEqual([]);
  });

  it('no onBotTranscript hardcodes the agentId "main" (always goes through pinnedAgent)', () => {
    // The fix routes the agentId through pinnedAgent so DB persistence is correct.
    // A raw literal 'main' as the third arg of addTranscriptEntry is the bug signature.
    const addCalls = html
      .split('\n')
      .filter((l) => l.includes('addTranscriptEntry('));
    const hardcodedMain = addCalls.filter((l) =>
      /addTranscriptEntry\([^,]+,\s*[^,]+,\s*['"]main['"]\s*\)/.test(l),
    );
    expect(hardcodedMain).toEqual([]);
  });
});
