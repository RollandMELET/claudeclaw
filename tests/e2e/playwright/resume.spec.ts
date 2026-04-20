/**
 * Slice 6 — Resume d'archive (RED e2e).
 *
 * When the user clicks "Resume" on a past meeting in the archive
 * detail view, the client POSTs /api/warroom/meeting/:id/resume, then
 * flips back to the live view with a visible "Resuming: <mtg short
 * id>" badge. All network traffic stubbed via page.route(), so the
 * spec runs in CI without a live Node/Pipecat backend.
 *
 * Pre-GREEN, these tests fail because:
 *   - There is no "Resume" button in the archive detail (test 1).
 *   - The POST endpoint isn't invoked by the UI (test 2).
 *   - The "Resuming" badge doesn't exist in the DOM (test 3).
 */

import { test, expect, Route } from '@playwright/test';

const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAeImBZsAAAAASUVORK5CYII=';

const NOW = 1_700_000_000;

const MEETINGS = [
  {
    id: 'mtg-abc12345',
    started_at: NOW,
    ended_at: NOW + 600,
    duration_s: 600,
    mode: 'direct',
    pinned_agent: 'main',
    entry_count: 3,
  },
];

const TRANSCRIPT_ABC = [
  { id: 1, meeting_id: 'mtg-abc12345', speaker: 'user', text: 'Contexte initial', created_at: NOW },
  { id: 2, meeting_id: 'mtg-abc12345', speaker: 'main', text: 'OK, je prends', created_at: NOW + 5 },
  { id: 3, meeting_id: 'mtg-abc12345', speaker: 'user', text: 'Précise le plan', created_at: NOW + 20 },
];

type RecordedCall = { url: string; body: string; method: string };

async function stubBackend(
  page: import('@playwright/test').Page,
  recorded: RecordedCall[],
): Promise<void> {
  const { getWarRoomHtml } = await import('../../../src/warroom-html.js');
  const html = getWarRoomHtml('test-token', 'test-chat', 7860);

  // Catch-all first (specific patterns win via reverse-registration order).
  await page.route('**/api/warroom/**', (route: Route) =>
    route.fulfill({ status: 200, body: '{"ok":true}', headers: { 'content-type': 'application/json' } }),
  );

  await page.route('**/api/warroom/agents**', (route: Route) =>
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agents: [
        { id: 'main', name: 'RC1 (Main)', description: 'Orchestrateur' },
        { id: 'research', name: 'Research', description: 'Deep research' },
      ] }),
    }),
  );

  await page.route('**/api/warroom/meeting/*/transcript', (route: Route) => {
    const m = route.request().url().match(/\/api\/warroom\/meeting\/([^/?#]+)\/transcript/);
    if (!m) return route.fallback();
    return route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ transcript: m[1] === 'mtg-abc12345' ? TRANSCRIPT_ABC : [] }),
    });
  });

  // Resume endpoint — records the hit and returns a realistic payload.
  await page.route(/\/api\/warroom\/meeting\/[^/?#]+\/resume/, async (route: Route) => {
    const req = route.request();
    const body = req.postData() || '';
    recorded.push({ url: req.url(), body, method: req.method() });
    return route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        meeting_id: 'mtg-abc12345',
        sessions: [
          {
            agent_id: 'main',
            session_id: 'cc-session-fake-abc',
            last_turns: TRANSCRIPT_ABC.map((t, i) => ({
              turn_number: i + 1,
              user_message: t.speaker === 'user' ? t.text : null,
              agent_response: t.speaker === 'user' ? null : t.text,
            })),
          },
        ],
      }),
    });
  });

  await page.route('**/api/warroom/meetings**', (route: Route) =>
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ meetings: MEETINGS }),
    }),
  );

  await page.route('**/warroom-client.js**', (route: Route) =>
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/javascript' },
      body:
        'window.PipecatWarRoom={PipecatClient:function(){this.connect=function(){return Promise.resolve()};' +
        'this.disconnect=function(){return Promise.resolve()};this.on=function(){};this.sendClientMessage=function(){};' +
        'this.enableMic=function(){return Promise.resolve()};this.disableMic=function(){return Promise.resolve()}},' +
        'WebSocketTransport:function(){}};',
    }),
  );

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

  await page.route('**/warroom**', (route: Route) => {
    const u = route.request().url();
    if (
      u.includes('/api/warroom/') ||
      u.includes('/warroom-avatar/') ||
      u.includes('/warroom-music') ||
      u.includes('/warroom-client.js')
    ) return route.fallback();
    return route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: html,
    });
  });
}

async function openWarRoom(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('http://127.0.0.1:9999/warroom?token=test-token');
  const overlay = page.locator('#introOverlay');
  if (await overlay.isVisible().catch(() => false)) await overlay.click();
  await page.waitForSelector('#app');
}

test.describe('Slice 6 — Resume d\'archive', () => {
  test('archive detail view renders a Resume button for the meeting', async ({ page }) => {
    const recorded: RecordedCall[] = [];
    await stubBackend(page, recorded);
    await openWarRoom(page);

    await page.locator('#pastMeetingsBtn').click();
    await page
      .locator('[data-meeting-row][data-meeting-id="mtg-abc12345"]')
      .click();

    const resumeBtn = page.locator('[data-resume-btn][data-meeting-id="mtg-abc12345"]');
    await expect(resumeBtn).toBeVisible({ timeout: 5000 });
    await expect(resumeBtn).toContainText(/resume/i);
  });

  test('clicking Resume POSTs /api/warroom/meeting/:id/resume exactly once', async ({ page }) => {
    const recorded: RecordedCall[] = [];
    await stubBackend(page, recorded);
    await openWarRoom(page);

    await page.locator('#pastMeetingsBtn').click();
    await page
      .locator('[data-meeting-row][data-meeting-id="mtg-abc12345"]')
      .click();
    await page.locator('[data-resume-btn][data-meeting-id="mtg-abc12345"]').click();

    // Wait for the fetch to round-trip.
    await page.waitForFunction(() => {
      return document.querySelector('[data-resume-badge]') !== null;
    }, { timeout: 5000 });

    const resumeHits = recorded.filter(
      (c) => c.method === 'POST' && /\/api\/warroom\/meeting\/mtg-abc12345\/resume/.test(c.url),
    );
    expect(resumeHits).toHaveLength(1);
  });

  test('after Resume, the UI flips back to live view with a Resuming badge', async ({ page }) => {
    const recorded: RecordedCall[] = [];
    await stubBackend(page, recorded);
    await openWarRoom(page);

    await page.locator('#pastMeetingsBtn').click();
    await page
      .locator('[data-meeting-row][data-meeting-id="mtg-abc12345"]')
      .click();
    await page.locator('[data-resume-btn][data-meeting-id="mtg-abc12345"]').click();

    // Archive overlay closes.
    const panel = page.locator('#archivePanel');
    await expect(panel).not.toHaveClass(/visible/, { timeout: 5000 });

    // A resume badge shows the short meeting id.
    const badge = page.locator('[data-resume-badge]');
    await expect(badge).toBeVisible({ timeout: 5000 });
    await expect(badge).toContainText(/mtg-abc1/i);
  });
});
