/**
 * Slice 2.1 — Meeting-id file wiring
 *
 * Shared file bridge between the dashboard (Node) and the Pipecat voice
 * server (Python). The dashboard writes the current meeting id on POST
 * /api/warroom/meeting/start and clears it on POST /api/warroom/meeting/end.
 * The Python server reads it before each voice-bridge subprocess spawn
 * and forwards it as --meeting-id, so the session store (Slice 2) can
 * bind turns to the right meeting.
 *
 * Same pattern as /tmp/warroom-agents.json (Node writes, Python reads).
 *
 * Race-condition note: two browsers starting a meeting concurrently (very
 * unlikely — warroom is a single-user, single-instance session) would race
 * on the file. Last writer wins. Accepted for this slice.
 *
 * All helpers swallow I/O errors (logged to stderr) so a misconfigured
 * file path never takes down the voice path.
 */

import fs from 'fs';

import { logger } from './logger.js';

/** Path to the shared file — overridable via env for tests / parallel runs. */
export function getMeetingFilePath(): string {
  return (
    process.env.WARROOM_MEETING_FILE ?? '/tmp/warroom-current-meeting.txt'
  );
}

/** Return the current meeting id (trimmed) or null if absent / empty / malformed. */
export function getCurrentMeetingId(): string | null {
  const file = getMeetingFilePath();
  try {
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, 'utf-8');
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch (err) {
    logger.warn(
      { file, err: (err as Error).message },
      'warroom-meeting-file: read failed, treating as absent',
    );
    return null;
  }
}

/** Persist the given meeting id into the shared file. Never throws. */
export function writeCurrentMeetingId(id: string): void {
  const file = getMeetingFilePath();
  try {
    fs.writeFileSync(file, id, 'utf-8');
  } catch (err) {
    logger.warn(
      { file, err: (err as Error).message },
      'warroom-meeting-file: write failed, meeting_id will not propagate to voice-bridge',
    );
  }
}

/** Remove the shared file (idempotent). Never throws. */
export function clearCurrentMeetingId(): void {
  const file = getMeetingFilePath();
  try {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch (err) {
    logger.warn(
      { file, err: (err as Error).message },
      'warroom-meeting-file: clear failed, file may be stale',
    );
  }
}
