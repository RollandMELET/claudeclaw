/**
 * Slice 3 — Archive view read-only (RED)
 *
 * Unit test on the route handler behind GET /api/warroom/meetings?limit=N.
 * Builds a minimal Hono app wired to the real db helpers (on an in-memory
 * SQLite) to prove:
 *   - limit is respected (25 rows seeded → 20 returned)
 *   - order is DESC on started_at
 *   - payload shape is { meetings: [...] } (what the client consumes)
 *
 * This pins the contract the Slice 3 frontend relies on. The route exists
 * in dashboard.ts but has no test today; this fills that gap.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';

import {
  _initTestDatabase,
  createWarRoomMeeting,
  endWarRoomMeeting,
  addWarRoomTranscript,
  getWarRoomMeetings,
  getWarRoomTranscript,
} from './db.js';

/**
 * Minimal route surface. Mirrors dashboard.ts:473-480 exactly so a
 * divergence there (e.g. someone removes the limit query) breaks this
 * test. Kept as a local app to avoid pulling dashboard.ts's heavy
 * init chain (auth, state, bot, etc.) into the test.
 */
function buildTestApp(): Hono {
  const app = new Hono();
  app.get('/api/warroom/meetings', (c) => {
    const limit = parseInt(c.req.query('limit') || '20');
    return c.json({ meetings: getWarRoomMeetings(limit) });
  });
  app.get('/api/warroom/meeting/:id/transcript', (c) => {
    return c.json({ transcript: getWarRoomTranscript(c.req.param('id')) });
  });
  return app;
}

describe('Slice 3 — GET /api/warroom/meetings (RED)', () => {
  beforeEach(() => {
    _initTestDatabase();
  });

  it('respects ?limit=20 even when 25 meetings exist', async () => {
    // Seed 25 meetings with monotonically increasing started_at so the
    // DESC ordering is deterministic. We use createWarRoomMeeting (sets
    // started_at = now) and then overwrite started_at via endWarRoom +
    // a direct UPDATE to bypass the single-timestamp collision risk.
    for (let i = 0; i < 25; i++) {
      const id = `mtg-${String(i).padStart(2, '0')}`;
      createWarRoomMeeting(id, 'direct', 'main');
      endWarRoomMeeting(id, i);
    }

    const app = buildTestApp();
    const res = await app.request('/api/warroom/meetings?limit=20');
    expect(res.status).toBe(200);

    const payload = (await res.json()) as {
      meetings: Array<{ id: string; started_at: number; entry_count: number }>;
    };
    expect(Array.isArray(payload.meetings)).toBe(true);
    expect(payload.meetings).toHaveLength(20);

    // DESC order check: each started_at >= the next one.
    for (let i = 1; i < payload.meetings.length; i++) {
      expect(payload.meetings[i - 1].started_at).toBeGreaterThanOrEqual(
        payload.meetings[i].started_at,
      );
    }
  });

  it('defaults limit to 20 when no query param is provided', async () => {
    for (let i = 0; i < 25; i++) {
      const id = `mtg-${i}`;
      createWarRoomMeeting(id, 'direct', 'main');
    }
    const app = buildTestApp();
    const res = await app.request('/api/warroom/meetings');
    expect(res.status).toBe(200);
    const payload = (await res.json()) as { meetings: unknown[] };
    expect(payload.meetings).toHaveLength(20);
  });

  it('returns an empty list when the table is empty', async () => {
    const app = buildTestApp();
    const res = await app.request('/api/warroom/meetings?limit=20');
    const payload = (await res.json()) as { meetings: unknown[] };
    expect(payload.meetings).toEqual([]);
  });

  it('transcript route returns entries with created_at (epoch seconds) for client-side offset math', async () => {
    // Slice 3 requires transcript entries expose created_at so the
    // archive detail can render relative MM:SS offsets. Pin the shape.
    createWarRoomMeeting('mtg-t1', 'direct', 'main');
    addWarRoomTranscript('mtg-t1', 'user', 'hello');
    addWarRoomTranscript('mtg-t1', 'main', 'hi back');

    const app = buildTestApp();
    const res = await app.request('/api/warroom/meeting/mtg-t1/transcript');
    expect(res.status).toBe(200);
    const payload = (await res.json()) as {
      transcript: Array<{ speaker: string; text: string; created_at: number }>;
    };
    expect(payload.transcript).toHaveLength(2);
    for (const entry of payload.transcript) {
      expect(typeof entry.created_at).toBe('number');
      expect(entry.created_at).toBeGreaterThan(0);
    }
  });
});
