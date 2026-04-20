/**
 * Slice 7 — Settings & roster management (RED e2e).
 *
 * When the user opens Settings (gear icon in the header), they can:
 *   A. Toggle agents on/off — persists via POST /api/warroom/settings.
 *   B. Add a new Obsidian agent via a form — persists via same POST.
 *   C. Reorder the sidebar via ↑/↓ buttons (chose buttons over
 *      drag-and-drop: HTML5 DnD in Playwright is notoriously flaky
 *      against custom dispatch code + ↑/↓ is keyboard-accessible).
 *
 * All network traffic stubbed via page.route(); runs in CI without a
 * live Node backend. The POST payload is recorded so we can assert
 * on the exact field values the server will receive.
 */

import { test, expect, Route } from '@playwright/test';

const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAeImBZsAAAAASUVORK5CYII=';

const BASE_AGENTS = [
  { id: 'main', name: 'RC1 (Main)', description: 'Orchestrateur' },
  { id: 'research', name: 'Research', description: 'Deep research' },
  { id: 'comms', name: 'Comms', description: 'Master of Whisperers' },
  { id: 'rc2', name: 'RC2', description: 'Dev agent' },
];

type RecordedCall = { url: string; method: string; body: string };

async function stubBackend(
  page: import('@playwright/test').Page,
  recorded: RecordedCall[],
  opts: { initialPrefs?: unknown } = {},
): Promise<void> {
  const { getWarRoomHtml } = await import('../../../src/warroom-html.js');
  const html = getWarRoomHtml('test-token', 'test-chat', 7860);

  // Catch-all first.
  await page.route('**/api/warroom/**', (route: Route) =>
    route.fulfill({ status: 200, body: '{"ok":true}', headers: { 'content-type': 'application/json' } }),
  );

  await page.route('**/api/warroom/agents**', (route: Route) =>
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agents: BASE_AGENTS }),
    }),
  );

  // Settings GET + POST.
  const initialPrefs = opts.initialPrefs ?? {
    disabled_agents: [],
    order: [],
    added_obsidian_agents: [],
  };
  await page.route(/\/api\/warroom\/settings(\?|$)/, async (route: Route) => {
    const req = route.request();
    if (req.method() === 'GET') {
      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prefs: initialPrefs,
          base_roster: BASE_AGENTS,
        }),
      });
    }
    // POST — record and echo ok.
    recorded.push({ url: req.url(), method: req.method(), body: req.postData() || '' });
    return route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    });
  });

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

test.describe('Slice 7 — Settings & roster management', () => {
  test('A. Toggling off an agent POSTs {disabled_agents:[id]}', async ({ page }) => {
    const recorded: RecordedCall[] = [];
    await stubBackend(page, recorded);
    await openWarRoom(page);

    const gear = page.locator('#settingsBtn');
    await expect(gear).toBeVisible({ timeout: 5000 });
    await gear.click();

    // Settings panel opens and lists each base agent.
    const panel = page.locator('#settingsPanel');
    await expect(panel).toBeVisible();

    // Toggle off 'research' via its [data-toggle-agent] checkbox.
    const researchToggle = page.locator('[data-toggle-agent="research"]');
    await expect(researchToggle).toBeChecked();
    await researchToggle.uncheck();

    // Save. The Settings panel has an explicit [data-save-settings] button
    // so toggles don't fire a request on every click (debouncing via save).
    await page.locator('[data-save-settings]').click();

    await page.waitForFunction(
      () => !!document.querySelector('[data-settings-saved]'),
      { timeout: 5000 },
    );

    const posts = recorded.filter((c) => c.method === 'POST');
    expect(posts.length).toBeGreaterThanOrEqual(1);
    const body = JSON.parse(posts[posts.length - 1].body || '{}');
    expect(body.disabled_agents).toContain('research');
  });

  test('B. Add-Obsidian form POSTs a new added_obsidian_agents entry', async ({ page }) => {
    const recorded: RecordedCall[] = [];
    await stubBackend(page, recorded);
    await openWarRoom(page);

    await page.locator('#settingsBtn').click();
    await expect(page.locator('#settingsPanel')).toBeVisible();

    // Fill the form.
    await page.locator('[data-new-obs="id"]').fill('my-new-vault');
    await page.locator('[data-new-obs="name"]').fill('My New Vault');
    await page.locator('[data-new-obs="description"]').fill('Personal notes');
    await page.locator('[data-new-obs="vault_root"]').fill('/tmp/some-vault');
    await page.locator('[data-new-obs="project_folder"]').fill('Notes');
    await page.locator('[data-new-obs="voice"]').fill('kokoro');

    await page.locator('[data-add-obsidian-submit]').click();

    // Save settings (the form adds to local state; save persists).
    await page.locator('[data-save-settings]').click();

    await page.waitForFunction(
      () => !!document.querySelector('[data-settings-saved]'),
      { timeout: 5000 },
    );

    const posts = recorded.filter((c) => c.method === 'POST');
    expect(posts.length).toBeGreaterThanOrEqual(1);
    const body = JSON.parse(posts[posts.length - 1].body || '{}');
    expect(body.added_obsidian_agents).toBeDefined();
    const added = body.added_obsidian_agents;
    expect(Array.isArray(added)).toBe(true);
    expect(added.some((e: { id: string }) => e.id === 'my-new-vault')).toBe(true);
  });

  test('C. Reorder ↑/↓ buttons POST an explicit {order:[...]}', async ({ page }) => {
    const recorded: RecordedCall[] = [];
    await stubBackend(page, recorded);
    await openWarRoom(page);

    await page.locator('#settingsBtn').click();
    await expect(page.locator('#settingsPanel')).toBeVisible();

    // Reorder: click ↓ on 'main' twice to push it below 'comms'.
    // Expected resulting order: research, comms, main, rc2.
    await page.locator('[data-reorder-down="main"]').click();
    await page.locator('[data-reorder-down="main"]').click();

    await page.locator('[data-save-settings]').click();

    await page.waitForFunction(
      () => !!document.querySelector('[data-settings-saved]'),
      { timeout: 5000 },
    );

    const posts = recorded.filter((c) => c.method === 'POST');
    const body = JSON.parse(posts[posts.length - 1].body || '{}');
    expect(body.order).toEqual(['research', 'comms', 'main', 'rc2']);
  });
});
