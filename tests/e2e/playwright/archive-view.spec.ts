/**
 * Slice 3 — Archive view read-only (RED e2e)
 *
 * Tests the "Past Meetings" UI against a fully stubbed dashboard. We
 * intercept every network request Playwright makes via page.route(), so
 * these specs run in CI without a real Node/Pipecat backend.
 *
 * Pre-GREEN, these tests fail because:
 *   - The "Past Meetings" header button does not exist yet (test 1).
 *   - There is no archive list / detail view to navigate (tests 2-3).
 *   - There is no empty-state string for zero meetings (test 4).
 *
 * Post-GREEN, src/warroom-html.ts owns the markup + client-side state
 * machine (currentView = 'live' | 'archive' | 'detail').
 */

import { test, expect, Route } from '@playwright/test';

// ── Fixtures ─────────────────────────────────────────────────────────

type Meeting = {
  id: string;
  started_at: number;
  ended_at: number | null;
  duration_s: number | null;
  mode: string;
  pinned_agent: string;
  entry_count: number;
};

type TranscriptEntry = {
  id: number;
  meeting_id: string;
  speaker: string;
  text: string;
  created_at: number;
};

const NOW = 1_700_000_000; // fixed epoch for stable HH:MM:SS rendering

const THREE_MEETINGS: Meeting[] = [
  {
    id: 'mtg-recent',
    started_at: NOW + 3600 * 24 * 2, // 2 days later (newest)
    ended_at: NOW + 3600 * 24 * 2 + 600,
    duration_s: 600,
    mode: 'direct',
    pinned_agent: 'research',
    entry_count: 4,
  },
  {
    id: 'mtg-middle',
    started_at: NOW + 3600 * 24, // 1 day later
    ended_at: NOW + 3600 * 24 + 300,
    duration_s: 300,
    mode: 'direct',
    pinned_agent: 'main',
    entry_count: 2,
  },
  {
    id: 'mtg-old',
    started_at: NOW, // oldest
    ended_at: NOW + 120,
    duration_s: 120,
    mode: 'auto',
    pinned_agent: 'comms',
    entry_count: 3,
  },
];

const TRANSCRIPT_RECENT: TranscriptEntry[] = [
  { id: 1, meeting_id: 'mtg-recent', speaker: 'user', text: 'Status on the Qonto PR?', created_at: NOW + 3600 * 24 * 2 },
  { id: 2, meeting_id: 'mtg-recent', speaker: 'research', text: 'I pulled the diff, looks clean.', created_at: NOW + 3600 * 24 * 2 + 15 },
  { id: 3, meeting_id: 'mtg-recent', speaker: 'user', text: 'Ship it after tests pass.', created_at: NOW + 3600 * 24 * 2 + 42 },
  { id: 4, meeting_id: 'mtg-recent', speaker: 'research', text: 'Done, CI green.', created_at: NOW + 3600 * 24 * 2 + 90 },
];

// Transparent 1x1 PNG (base64).
const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAeImBZsAAAAASUVORK5CYII=';

// ── Route stubs ──────────────────────────────────────────────────────

/**
 * Install request interception. Serves the real War Room HTML document
 * with stubbed external resources and the mocked `/api/warroom/*`
 * endpoints defined by the caller.
 */
async function stubBackend(
  page: import('@playwright/test').Page,
  opts: {
    meetings: Meeting[];
    transcriptFor: Record<string, TranscriptEntry[]>;
  },
): Promise<void> {
  // Dynamic import of the server-side HTML generator so the test harness
  // does not need a real dashboard running.
  const { getWarRoomHtml } = await import('../../../src/warroom-html.js');
  const html = getWarRoomHtml('test-token', 'test-chat', 7860);

  await page.route('**/warroom**', (route: Route) => {
    const url = route.request().url();
    // Only intercept the HTML page (not the JSON API, which has its own handlers).
    if (url.includes('/api/warroom/')) return route.fallback();
    if (url.includes('/warroom-avatar/') || url.includes('/warroom-music') || url.includes('/warroom-client.js')) {
      return route.fallback();
    }
    return route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: html,
    });
  });

  // Stub the Pipecat client bundle — not needed for archive UI.
  await page.route('**/warroom-client.js**', (route: Route) =>
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/javascript' },
      body: '/* archive-view test: pipecat client stubbed */',
    }),
  );

  // Stub avatars with a 1x1 PNG so <img> requests resolve.
  await page.route('**/warroom-avatar/**', (route: Route) =>
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'image/png' },
      body: Buffer.from(PNG_1X1, 'base64'),
    }),
  );

  await page.route('**/warroom-music**', (route: Route) =>
    route.fulfill({ status: 204, body: '' }),
  );

  // Playwright resolves page.route() handlers in REVERSE registration
  // order — the most recently registered matcher wins. So we register
  // the catch-all FIRST and the specific endpoints LAST, so the specific
  // ones take priority.

  // Any other /api/warroom/* endpoint the UI might probe: return empty OK.
  await page.route('**/api/warroom/**', (route: Route) =>
    route.fulfill({ status: 200, body: '{}' }),
  );

  // Agents roster — the UI fetches this on load to render the sidebar.
  await page.route('**/api/warroom/agents**', (route: Route) =>
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        agents: [
          { id: 'main', name: 'Main' },
          { id: 'research', name: 'Research' },
          { id: 'comms', name: 'Comms' },
          { id: 'content', name: 'Content' },
          { id: 'ops', name: 'Ops' },
        ],
      }),
    }),
  );

  // Per-meeting transcript endpoint (registered BEFORE /meetings so the
  // /meetings/:id/transcript pattern wins against the broader /meetings).
  await page.route('**/api/warroom/meeting/**', (route: Route) => {
    const url = route.request().url();
    const match = url.match(/\/api\/warroom\/meeting\/([^/?#]+)\/transcript/);
    if (!match) return route.fallback();
    const meetingId = decodeURIComponent(match[1]);
    const transcript = opts.transcriptFor[meetingId] ?? [];
    return route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ transcript }),
    });
  });

  // Archive list endpoint — register LAST so it takes precedence over
  // the catch-all above.
  await page.route('**/api/warroom/meetings**', (route: Route) =>
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ meetings: opts.meetings }),
    }),
  );
}

async function dismissIntro(page: import('@playwright/test').Page): Promise<void> {
  // The cinematic intro requires a click to satisfy autoplay policy.
  const overlay = page.locator('#introOverlay');
  if (await overlay.isVisible().catch(() => false)) {
    await overlay.click();
  }
  // Wait for the main app to become visible.
  await page.waitForSelector('#app', { state: 'attached' });
}

// ── Specs ────────────────────────────────────────────────────────────

test.describe('Slice 3 — Archive view (Past Meetings)', () => {
  test('clicking the Past Meetings button shows the list in DESC order', async ({ page }) => {
    await stubBackend(page, {
      meetings: THREE_MEETINGS,
      transcriptFor: { 'mtg-recent': TRANSCRIPT_RECENT },
    });

    await page.goto('http://127.0.0.1:9999/warroom?token=test-token');
    await dismissIntro(page);

    // The button lives in the header, labelled "Past Meetings".
    const btn = page.locator('#pastMeetingsBtn');
    await expect(btn).toBeVisible({ timeout: 5000 });
    await btn.click();

    // The archive list renders one row per meeting.
    const rows = page.locator('[data-meeting-row]');
    await expect(rows).toHaveCount(3);

    // DESC order: first row = mtg-recent, last row = mtg-old.
    await expect(rows.nth(0)).toHaveAttribute('data-meeting-id', 'mtg-recent');
    await expect(rows.nth(1)).toHaveAttribute('data-meeting-id', 'mtg-middle');
    await expect(rows.nth(2)).toHaveAttribute('data-meeting-id', 'mtg-old');
  });

  test('clicking a meeting opens the detail with timestamps HH:MM:SS + relative MM:SS', async ({ page }) => {
    await stubBackend(page, {
      meetings: THREE_MEETINGS,
      transcriptFor: { 'mtg-recent': TRANSCRIPT_RECENT },
    });

    await page.goto('http://127.0.0.1:9999/warroom?token=test-token');
    await dismissIntro(page);
    await page.locator('#pastMeetingsBtn').click();
    await page.locator('[data-meeting-row][data-meeting-id="mtg-recent"]').click();

    // Detail shows one entry per transcript line.
    const entries = page.locator('[data-transcript-entry]');
    await expect(entries).toHaveCount(TRANSCRIPT_RECENT.length);

    // Each entry exposes both absolute (HH:MM:SS) and relative (MM:SS)
    // timestamps via data attributes + rendered text.
    for (let i = 0; i < TRANSCRIPT_RECENT.length; i++) {
      const entry = entries.nth(i);
      await expect(entry.locator('[data-absolute-time]')).toBeVisible();
      await expect(entry.locator('[data-relative-offset]')).toBeVisible();
      const abs = await entry.locator('[data-absolute-time]').innerText();
      const rel = await entry.locator('[data-relative-offset]').innerText();
      expect(abs).toMatch(/^\d{2}:\d{2}:\d{2}$/);
      expect(rel).toMatch(/^\d{2}:\d{2}$/);
    }

    // First entry: offset 00:00 (at meeting start).
    const firstRel = await entries.nth(0).locator('[data-relative-offset]').innerText();
    expect(firstRel).toBe('00:00');

    // Last entry: +90 s → 01:30.
    const lastRel = await entries
      .nth(TRANSCRIPT_RECENT.length - 1)
      .locator('[data-relative-offset]')
      .innerText();
    expect(lastRel).toBe('01:30');
  });

  test('empty archive shows a friendly "No past meetings yet" state', async ({ page }) => {
    await stubBackend(page, { meetings: [], transcriptFor: {} });
    await page.goto('http://127.0.0.1:9999/warroom?token=test-token');
    await dismissIntro(page);

    await page.locator('#pastMeetingsBtn').click();
    const empty = page.locator('[data-archive-empty]');
    await expect(empty).toBeVisible();
    await expect(empty).toContainText(/no past meetings/i);
  });
});
