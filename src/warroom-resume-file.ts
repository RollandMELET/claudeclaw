/**
 * Slice 6 — Resume file bridge.
 *
 * Shared JSON file between the dashboard (Node, writes on POST
 * /api/warroom/meeting/:id/resume) and the Pipecat voice server
 * (Python, reads on voice-bridge spawn and clears on consumption).
 *
 * Same pattern as warroom-meeting-file.ts (Slice 2.1), with a richer
 * payload per agent: { session_id, last_turns }. One-shot semantics
 * are enforced on the Python read side (warroom_resume.py).
 *
 * I/O errors are swallowed (logger.warn) — a misconfigured WARROOM_RESUME_FILE
 * path must never take down the voice path.
 */

import fs from 'fs';

import { logger } from './logger.js';

export interface ResumeTurn {
  turn_number: number;
  user_message: string | null;
  agent_response: string | null;
  created_at?: number;
}

export interface ResumeSessionEntry {
  agent_id: string;
  /** Claude Code session_id; may be '' when the anchor was purged — caller uses last_turns fallback. */
  session_id: string;
  last_turns: ResumeTurn[];
}

export interface ResumePayload {
  meeting_id: string;
  sessions: ResumeSessionEntry[];
}

export function getResumeFilePath(): string {
  return (
    process.env.WARROOM_RESUME_FILE ?? '/tmp/warroom-resume-session.json'
  );
}

export function writeResumeState(payload: ResumePayload): void {
  const file = getResumeFilePath();
  try {
    fs.writeFileSync(file, JSON.stringify(payload), 'utf-8');
  } catch (err) {
    logger.warn(
      { file, err: (err as Error).message },
      'warroom-resume-file: write failed, resume will not propagate',
    );
  }
}

/**
 * Read the resume state and return the entry for `agentId` (or null).
 * Does NOT clear the file — that's the consumer's (Python) job.
 */
export function getResumeForAgent(agentId: string): ResumeSessionEntry | null {
  const file = getResumeFilePath();
  try {
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, 'utf-8').trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ResumePayload;
    if (!parsed || !Array.isArray(parsed.sessions)) return null;
    const entry = parsed.sessions.find((s) => s && s.agent_id === agentId);
    return entry ?? null;
  } catch (err) {
    logger.warn(
      { file, err: (err as Error).message },
      'warroom-resume-file: read failed, treating as absent',
    );
    return null;
  }
}

/** Remove the resume file (idempotent). Never throws. */
export function clearResumeState(): void {
  const file = getResumeFilePath();
  try {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch (err) {
    logger.warn(
      { file, err: (err as Error).message },
      'warroom-resume-file: clear failed, file may be stale',
    );
  }
}
