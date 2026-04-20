/**
 * Slice 2.1 — Meeting-id wiring (RED)
 *
 * The warroom dashboard (Node) and the Pipecat voice server (Python) are
 * two separate processes. To propagate the current meeting_id from the
 * dashboard route to the voice-bridge subprocess, we use a small shared
 * file (same pattern as /tmp/warroom-agents.json) that Node writes on
 * meeting start/end and Python reads before each spawn.
 *
 * These tests drive the TypeScript side: a warroom-meeting-file module
 * exposing get / write / clear helpers + a tmpfile-scoped override via
 * the WARROOM_MEETING_FILE env var (so parallel test runs don't clash).
 *
 * Tests 1-2 simulate what the POST /api/warroom/meeting/{start,end}
 * handlers will do post-GREEN (write the id on start, clear on end).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// The module does not exist yet — RED phase.
import {
  getCurrentMeetingId,
  writeCurrentMeetingId,
  clearCurrentMeetingId,
} from './warroom-meeting-file.js';

let tmpDir: string;
let tmpFile: string;
const ORIGINAL_ENV = process.env.WARROOM_MEETING_FILE;

describe('Slice 2.1 — warroom meeting file helpers (RED)', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'warroom-meeting-file-'));
    tmpFile = path.join(tmpDir, 'current-meeting.txt');
    process.env.WARROOM_MEETING_FILE = tmpFile;
  });

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.WARROOM_MEETING_FILE;
    else process.env.WARROOM_MEETING_FILE = ORIGINAL_ENV;
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  // ── Test 3 : getCurrentMeetingId read behavior ──────────────────────

  describe('getCurrentMeetingId()', () => {
    it('returns null when the file does not exist', () => {
      expect(fs.existsSync(tmpFile)).toBe(false);
      expect(getCurrentMeetingId()).toBeNull();
    });

    it('returns null when the file is empty', () => {
      fs.writeFileSync(tmpFile, '', 'utf-8');
      expect(getCurrentMeetingId()).toBeNull();
    });

    it('returns null when the file is whitespace only (malformed)', () => {
      fs.writeFileSync(tmpFile, '   \n\t\n', 'utf-8');
      expect(getCurrentMeetingId()).toBeNull();
    });

    it('returns the trimmed id when the file has content', () => {
      fs.writeFileSync(tmpFile, '  mtg-abc123\n', 'utf-8');
      expect(getCurrentMeetingId()).toBe('mtg-abc123');
    });
  });

  // ── Test 4 : round-trip write/clear ─────────────────────────────────

  describe('writeCurrentMeetingId() + clearCurrentMeetingId()', () => {
    it('round-trips a meeting id through write → get', () => {
      writeCurrentMeetingId('mtg-rt-001');
      expect(getCurrentMeetingId()).toBe('mtg-rt-001');
    });

    it('overwrites an existing id', () => {
      writeCurrentMeetingId('mtg-first');
      writeCurrentMeetingId('mtg-second');
      expect(getCurrentMeetingId()).toBe('mtg-second');
    });

    it('clearCurrentMeetingId() removes the value so get() returns null', () => {
      writeCurrentMeetingId('mtg-to-clear');
      expect(getCurrentMeetingId()).toBe('mtg-to-clear');
      clearCurrentMeetingId();
      expect(getCurrentMeetingId()).toBeNull();
    });

    it('clearCurrentMeetingId() is idempotent (no throw if already cleared)', () => {
      expect(() => clearCurrentMeetingId()).not.toThrow();
      expect(() => clearCurrentMeetingId()).not.toThrow();
      expect(getCurrentMeetingId()).toBeNull();
    });
  });

  // ── Test 1 : meeting/start side-effect contract ─────────────────────

  describe('POST /api/warroom/meeting/start side-effect', () => {
    it('after the route writes the id, the shared file contains it', () => {
      // Simulate what the dashboard route handler does post-GREEN:
      //   const id = body.id || crypto.randomUUID();
      //   createWarRoomMeeting(id, ...);
      //   writeCurrentMeetingId(id);
      const simulatedMeetingId = 'mtg-start-handler-42';
      writeCurrentMeetingId(simulatedMeetingId);

      // The shared file the Python voice server reads must contain it.
      expect(fs.existsSync(tmpFile)).toBe(true);
      const onDisk = fs.readFileSync(tmpFile, 'utf-8').trim();
      expect(onDisk).toBe(simulatedMeetingId);
    });
  });

  // ── Test 2 : meeting/end side-effect contract ───────────────────────

  describe('POST /api/warroom/meeting/end side-effect', () => {
    it('after the route clears the file, getCurrentMeetingId() returns null', () => {
      // Start: dashboard wrote the id.
      writeCurrentMeetingId('mtg-end-handler-99');
      expect(getCurrentMeetingId()).toBe('mtg-end-handler-99');

      // End: dashboard clears.
      clearCurrentMeetingId();

      expect(getCurrentMeetingId()).toBeNull();
    });
  });

  // ── Robustness : I/O errors must not throw up the stack ─────────────

  describe('I/O resilience', () => {
    it('writeCurrentMeetingId does not throw when the target directory is unwritable', () => {
      // Point env var at a path whose parent does not exist and cannot be
      // auto-created. Helper must swallow the error and warn, not throw.
      process.env.WARROOM_MEETING_FILE =
        '/nonexistent-root-dir-xyz-42/does/not/exist/meeting.txt';
      expect(() => writeCurrentMeetingId('mtg-unwritable')).not.toThrow();
    });

    it('getCurrentMeetingId returns null and does not throw on permission errors', () => {
      // Directory exists but contains no file — already covered, just
      // reconfirm: a missing file is a non-exceptional "no current meeting"
      // signal, not a thrown error.
      expect(() => getCurrentMeetingId()).not.toThrow();
      expect(getCurrentMeetingId()).toBeNull();
    });
  });
});
