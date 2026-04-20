/**
 * Slice 6 — Resume file bridge (RED stub).
 *
 * Shared JSON file between the dashboard (Node, writes on POST
 * /api/warroom/meeting/:id/resume) and the Pipecat voice server
 * (Python, reads on voice-bridge spawn and clears on consumption).
 *
 * Same pattern as warroom-meeting-file.ts (Slice 2.1) but carries a
 * richer payload per agent: { session_id, last_turns }.
 *
 * GREEN phase replaces the stubs with real fs I/O.
 */

export interface ResumeTurn {
  turn_number: number;
  user_message: string | null;
  agent_response: string | null;
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
  throw new Error('not implemented — Slice 6 GREEN');
}

export function writeResumeState(_payload: ResumePayload): void {
  throw new Error('not implemented — Slice 6 GREEN');
}

export function getResumeForAgent(_agentId: string): ResumeSessionEntry | null {
  throw new Error('not implemented — Slice 6 GREEN');
}

export function clearResumeState(): void {
  throw new Error('not implemented — Slice 6 GREEN');
}
