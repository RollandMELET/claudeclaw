/**
 * Slice 6 — Resume d'archive (RED, DB + helpers).
 *
 * Two surfaces under test:
 *   - `getResumePayload(meeting_id, n)` in src/db.ts: gathers every
 *     warroom_agent_sessions row for the meeting + the last N
 *     warroom_turns per agent_session, sorted chronologically.
 *   - `src/warroom-resume-file.ts`: writes/reads/clears a JSON file
 *     (same pattern as Slice 2.1 warroom-meeting-file) so the Pipecat
 *     Python server can read the pending resume state on voice-bridge
 *     spawn and one-shot-consume it.
 *
 * The Playwright spec (resume.spec.ts) will exercise the full UI flow
 * with page.route() mocks — no live Node server.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  _initTestDatabase,
  _testDb,
  createWarRoomMeeting,
  createWarRoomAgentSession,
  addWarRoomTurn,
  getResumePayload,
} from './db.js';

import {
  writeResumeState,
  getResumeForAgent,
  clearResumeState,
  getResumeFilePath,
} from './warroom-resume-file.js';

// ── DB helper: getResumePayload ─────────────────────────────────────

describe('Slice 6 — getResumePayload (RED)', () => {
  beforeEach(() => {
    _initTestDatabase();
  });

  it('returns an empty sessions array for a meeting with no agent sessions', () => {
    const db = _testDb();
    createWarRoomMeeting('mtg-empty', 'direct', 'main');
    const payload = getResumePayload(db, 'mtg-empty');
    expect(payload.meeting_id).toBe('mtg-empty');
    expect(payload.sessions).toEqual([]);
  });

  it('returns one session entry per warroom_agent_sessions row + last N turns (chrono asc)', () => {
    const db = _testDb();
    createWarRoomMeeting('mtg-a', 'direct', 'main');
    const agentSession = createWarRoomAgentSession(db, {
      meeting_id: 'mtg-a',
      agent_id: 'rc1',
      session_id: 'cc-session-abc-123',
    });
    for (let i = 1; i <= 7; i++) {
      addWarRoomTurn(db, {
        agent_session_id: agentSession.id,
        meeting_id: 'mtg-a',
        input_source: 'voice',
        user_message: `user turn ${i}`,
        agent_response: `agent turn ${i}`,
      });
    }

    const payload = getResumePayload(db, 'mtg-a', 5);
    expect(payload.sessions).toHaveLength(1);
    const s = payload.sessions[0];
    expect(s.agent_id).toBe('rc1');
    expect(s.session_id).toBe('cc-session-abc-123');
    expect(s.last_turns).toHaveLength(5);
    // Chronological ASC order (earliest first) — last 5 of 7 = turns 3..7.
    expect(s.last_turns.map((t) => t.turn_number)).toEqual([3, 4, 5, 6, 7]);
    expect(s.last_turns[0].user_message).toBe('user turn 3');
    expect(s.last_turns[4].agent_response).toBe('agent turn 7');
  });

  it('returns multiple session entries for a meeting with multiple agents', () => {
    const db = _testDb();
    createWarRoomMeeting('mtg-multi', 'direct', 'main');
    const a = createWarRoomAgentSession(db, {
      meeting_id: 'mtg-multi',
      agent_id: 'rc1',
      session_id: 'cc-a',
    });
    const b = createWarRoomAgentSession(db, {
      meeting_id: 'mtg-multi',
      agent_id: 'research',
      session_id: 'cc-b',
    });
    addWarRoomTurn(db, { agent_session_id: a.id, meeting_id: 'mtg-multi', user_message: 'q1', agent_response: 'a1' });
    addWarRoomTurn(db, { agent_session_id: b.id, meeting_id: 'mtg-multi', user_message: 'q2', agent_response: 'a2' });

    const payload = getResumePayload(db, 'mtg-multi');
    expect(payload.sessions).toHaveLength(2);
    const ids = payload.sessions.map((s) => s.agent_id).sort();
    expect(ids).toEqual(['rc1', 'research']);
  });

  it('falls back to last_turns even when session_id is null-ish (graceful degrade)', () => {
    // Simulate a row where session_id was later purged: we can't insert
    // NULL directly (NOT NULL constraint) — the helper must still handle
    // empty-string session_id as a "no resume anchor" case and expose
    // last_turns for the Python fallback path.
    const db = _testDb();
    createWarRoomMeeting('mtg-purged', 'direct', 'main');
    const agentSession = createWarRoomAgentSession(db, {
      meeting_id: 'mtg-purged',
      agent_id: 'rc1',
      session_id: 'to-purge',
    });
    addWarRoomTurn(db, {
      agent_session_id: agentSession.id,
      meeting_id: 'mtg-purged',
      user_message: 'q',
      agent_response: 'a',
    });
    // Simulate a purge: clear the session_id.
    db.prepare(
      'UPDATE warroom_agent_sessions SET session_id = ? WHERE id = ?',
    ).run('', agentSession.id);

    const payload = getResumePayload(db, 'mtg-purged');
    expect(payload.sessions).toHaveLength(1);
    const s = payload.sessions[0];
    // session_id comes through as '' (or null depending on GREEN
    // choice) — callers treat empty as "no anchor, use turns".
    expect(s.session_id === '' || s.session_id === null).toBe(true);
    expect(s.last_turns.length).toBeGreaterThan(0);
  });
});

// ── Shared file helpers ─────────────────────────────────────────────

describe('Slice 6 — warroom-resume-file (RED)', () => {
  let tmpDir: string;
  let tmpFile: string;
  const ORIGINAL_ENV = process.env.WARROOM_RESUME_FILE;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'warroom-resume-'));
    tmpFile = path.join(tmpDir, 'resume.json');
    process.env.WARROOM_RESUME_FILE = tmpFile;
  });

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.WARROOM_RESUME_FILE;
    else process.env.WARROOM_RESUME_FILE = ORIGINAL_ENV;
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  describe('getResumeForAgent()', () => {
    it('returns null when the file does not exist', () => {
      expect(fs.existsSync(tmpFile)).toBe(false);
      expect(getResumeForAgent('rc1')).toBeNull();
    });

    it('returns null when the file is empty / malformed JSON', () => {
      fs.writeFileSync(tmpFile, '', 'utf-8');
      expect(getResumeForAgent('rc1')).toBeNull();
      fs.writeFileSync(tmpFile, 'not-json', 'utf-8');
      expect(getResumeForAgent('rc1')).toBeNull();
    });

    it('returns null for an agent id absent from the payload', () => {
      writeResumeState({
        meeting_id: 'mtg-x',
        sessions: [{ agent_id: 'rc1', session_id: 'cc-1', last_turns: [] }],
      });
      expect(getResumeForAgent('research')).toBeNull();
    });

    it('returns the session_id + last_turns for the requested agent', () => {
      writeResumeState({
        meeting_id: 'mtg-y',
        sessions: [
          { agent_id: 'rc1', session_id: 'cc-rc1', last_turns: [
            { turn_number: 1, user_message: 'q1', agent_response: 'a1' },
            { turn_number: 2, user_message: 'q2', agent_response: 'a2' },
          ] },
          { agent_id: 'research', session_id: 'cc-res', last_turns: [] },
        ],
      });
      const rc1 = getResumeForAgent('rc1');
      expect(rc1).not.toBeNull();
      expect(rc1!.session_id).toBe('cc-rc1');
      expect(rc1!.last_turns).toHaveLength(2);
    });
  });

  describe('clearResumeState()', () => {
    it('removes the file so subsequent reads return null (one-shot contract)', () => {
      writeResumeState({ meeting_id: 'mtg-z', sessions: [] });
      expect(fs.existsSync(tmpFile)).toBe(true);
      clearResumeState();
      expect(fs.existsSync(tmpFile)).toBe(false);
      expect(getResumeForAgent('rc1')).toBeNull();
    });

    it('is idempotent (no throw if already cleared)', () => {
      expect(() => clearResumeState()).not.toThrow();
      expect(() => clearResumeState()).not.toThrow();
    });
  });

  describe('getResumeFilePath()', () => {
    it('respects WARROOM_RESUME_FILE env override', () => {
      expect(getResumeFilePath()).toBe(tmpFile);
    });

    it('defaults to /tmp/warroom-resume-session.json when env is unset', () => {
      delete process.env.WARROOM_RESUME_FILE;
      expect(getResumeFilePath()).toBe('/tmp/warroom-resume-session.json');
    });
  });

  describe('I/O resilience', () => {
    it('writeResumeState does not throw when the target directory is unwritable', () => {
      process.env.WARROOM_RESUME_FILE =
        '/nonexistent-root-dir-xyz-9999/does/not/exist/resume.json';
      expect(() =>
        writeResumeState({ meeting_id: 'x', sessions: [] }),
      ).not.toThrow();
    });
  });
});
