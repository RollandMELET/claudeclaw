/**
 * Slice 5 — Obsidian agents wrapper (RED e2e).
 *
 * When config/obsidian-agents.yaml declares rorworld-warroom, the
 * dashboard's GET /api/warroom/agents endpoint must surface it
 * alongside the 6 existing agents so the War Room sidebar renders
 * a "RoRworld Admin" card.
 *
 * The endpoint is stubbed via page.route(); the test does not run a
 * live Node dashboard. We verify that the UI renders the right card
 * when the payload includes an Obsidian entry — the server-side
 * loader logic is exercised by the TS/Python unit tests.
 */

import { test, expect, Route } from '@playwright/test';

const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAeImBZsAAAAASUVORK5CYII=';

const AGENTS_WITH_OBSIDIAN = [
  { id: 'main', name: 'RC1 (Main)', description: 'Orchestrateur principal' },
  { id: 'research', name: 'Research', description: 'Grand Maester' },
  { id: 'comms', name: 'Comms', description: 'Master of Whisperers' },
  { id: 'content', name: 'Content', description: 'Royal Bard' },
  { id: 'ops', name: 'Ops', description: 'Master of War' },
  { id: 'rc2', name: 'RC2', description: 'Dev agent interne' },
  {
    id: 'rorworld-warroom',
    name: 'RoRworld Admin',
    description: 'Administration RoRworld, compta, refacturation GS1',
    origin: 'obsidian',
  },
];

async function stubBackend(
  page: import('@playwright/test').Page,
  agents: unknown[],
): Promise<void> {
  const { getWarRoomHtml } = await import('../../../src/warroom-html.js');
  const html = getWarRoomHtml('test-token', 'test-chat', 7860);

  // Playwright resolves page.route() handlers in reverse registration
  // order — catch-all first, specific last.
  await page.route('**/api/warroom/**', (route: Route) =>
    route.fulfill({ status: 200, body: '{}', headers: { 'content-type': 'application/json' } }),
  );

  await page.route('**/api/warroom/agents**', (route: Route) =>
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agents }),
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
    ) {
      return route.fallback();
    }
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

test.describe('Slice 5 — Obsidian agent visible in War Room sidebar', () => {
  test('sidebar renders the RoRworld Admin card when the API includes rorworld-warroom', async ({ page }) => {
    await stubBackend(page, AGENTS_WITH_OBSIDIAN);
    await openWarRoom(page);

    // The dynamic loader creates one .agent-card per API entry, keyed
    // by data-agent="<id>".
    const card = page.locator('.agent-card[data-agent="rorworld-warroom"]');
    await expect(card).toBeVisible({ timeout: 5000 });
    await expect(card.locator('.agent-name')).toContainText('RoRworld Admin');
  });

  test('sidebar still renders the 6 baseline agents when the Obsidian list is empty', async ({ page }) => {
    // Simulates config/obsidian-agents.yaml absent → only the 6 dirs.
    const baselineOnly = AGENTS_WITH_OBSIDIAN.filter((a) => a.id !== 'rorworld-warroom');
    await stubBackend(page, baselineOnly);
    await openWarRoom(page);

    for (const id of ['main', 'research', 'comms', 'content', 'ops', 'rc2']) {
      await expect(
        page.locator(`.agent-card[data-agent="${id}"]`),
      ).toBeVisible({ timeout: 5000 });
    }
    await expect(
      page.locator('.agent-card[data-agent="rorworld-warroom"]'),
    ).toHaveCount(0);
  });
});
