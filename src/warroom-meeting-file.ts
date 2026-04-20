/**
 * Slice 2.1 — Meeting-id file wiring (RED stub)
 *
 * Shared file bridge between the dashboard (Node) and the Pipecat voice
 * server (Python). See warroom-meeting-file.test.ts for the contract.
 *
 * GREEN phase will replace the stubs with real fs I/O. Stubs throw at
 * runtime so the RED tests fail with a clear signal; TypeScript still
 * compiles, preserving `tsc --noEmit` clean.
 */

/** Path to the shared file — overridable via env for tests / parallel runs. */
export function getMeetingFilePath(): string {
  return (
    process.env.WARROOM_MEETING_FILE ?? '/tmp/warroom-current-meeting.txt'
  );
}

/** Return the current meeting id (trimmed) or null if absent / empty / malformed. */
export function getCurrentMeetingId(): string | null {
  throw new Error('not implemented — Slice 2.1 GREEN');
}

/** Persist the given meeting id into the shared file. Never throws. */
export function writeCurrentMeetingId(_id: string): void {
  throw new Error('not implemented — Slice 2.1 GREEN');
}

/** Remove the shared file (idempotent). Never throws. */
export function clearCurrentMeetingId(): void {
  throw new Error('not implemented — Slice 2.1 GREEN');
}
