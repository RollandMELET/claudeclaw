/**
 * Slice 4 — Text input mi-session (RED e2e)
 *
 * Scenario: the War Room exposes a text input bar next to the mic. A
 * user can type a message and press Enter to inject it into the
 * conversation as if they had spoken it aloud. The agent response
 * stays audio (Option A per §4.4.1 of the Slice 4 plan).
 *
 * We stub the @pipecat-ai/client-js bundle with a minimal mock that
 * records every sendClientMessage() call. No Pipecat server or Gemini
 * Live connection is required — the test asserts on:
 *   - presence and visibility of the input,
 *   - correct RTVI message type ("text-input") + payload ({ text }),
 *   - immediate local echo in the transcript panel as speaker="You".
 *
 * Audio response from the agent is out of scope (no Gemini Live in CI).
 */

import { test, expect, Route } from '@playwright/test';

const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAeImBZsAAAAASUVORK5CYII=';

/**
 * Stub script served in place of /warroom-client.js. Installs a fake
 * PipecatClient into window.PipecatWarRoom so the real handshake never
 * runs. Every sendClientMessage() call is pushed into
 * window.__sentClientMessages for the test to inspect.
 */
const PIPECAT_STUB = `
(function () {
  window.__sentClientMessages = [];
  function MockClient(opts) {
    this.opts = opts;
  }
  MockClient.prototype.connect = function () { return Promise.resolve(); };
  MockClient.prototype.disconnect = function () { return Promise.resolve(); };
  MockClient.prototype.sendClientMessage = function (msgType, data) {
    window.__sentClientMessages.push({ msgType: msgType, data: data });
  };
  // Fire listeners registered via .on(evt, cb) synchronously for the
  // subset the warroom UI cares about (connected, disconnected, botReady).
  MockClient.prototype.on = function (evt, cb) { this['_' + evt] = cb; };
  MockClient.prototype.off = function () {};
  MockClient.prototype.enableMic = function () { return Promise.resolve(); };
  MockClient.prototype.disableMic = function () { return Promise.resolve(); };
  function MockTransport() {}
  window.PipecatWarRoom = {
    PipecatClient: MockClient,
    WebSocketTransport: MockTransport,
  };
})();
`;

async function stubBackend(page: import('@playwright/test').Page): Promise<void> {
  const { getWarRoomHtml } = await import('../../../src/warroom-html.js');
  const html = getWarRoomHtml('test-token', 'test-chat', 7860);

  await page.route('**/api/warroom/**', (route: Route) =>
    route.fulfill({ status: 200, body: '{"ok":true}', headers: { 'content-type': 'application/json' } }),
  );

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

  await page.route('**/warroom-client.js**', (route: Route) =>
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/javascript' },
      body: PIPECAT_STUB,
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
  if (await overlay.isVisible().catch(() => false)) {
    await overlay.click();
  }
  await page.waitForSelector('#app');
}

test.describe('Slice 4 — War Room text input', () => {
  test('the #warroomTextInput field is visible by default in the controls bar', async ({ page }) => {
    await stubBackend(page);
    await openWarRoom(page);
    const input = page.locator('#warroomTextInput');
    await expect(input).toBeVisible({ timeout: 5000 });
    await expect(input).toBeEnabled();
  });

  test('typing + Enter pushes the text into the local transcript as speaker=You', async ({ page }) => {
    await stubBackend(page);
    await openWarRoom(page);

    const input = page.locator('#warroomTextInput');
    await input.fill('Bonjour RC1');
    await input.press('Enter');

    // Local echo: a transcript entry labelled "You" (or "user") appears
    // immediately, before any server round-trip.
    const transcript = page.locator('#transcript');
    await expect(transcript).toContainText('Bonjour RC1', { timeout: 3000 });
    // Speaker label "You" (via resolveSpeakerLabel added in Slice 3) or
    // the raw "user" class — either way the .transcript-speaker.user
    // class must be present.
    await expect(page.locator('.transcript-speaker.user').first()).toBeVisible();
  });

  test('typing + Enter fires pipecatClient.sendClientMessage("text-input", { text })', async ({ page }) => {
    await stubBackend(page);
    await openWarRoom(page);

    // Simulate a meeting in progress: the real path constructs
    // pipecatClient inside toggleMeeting() → connect(), which we don't
    // want to run in this test (no WS server). Instead we install the
    // mock client directly. This exercises the same sendWarRoomText()
    // path a live user would trigger after starting a meeting.
    await page.evaluate(() => {
      interface MockClient { sendClientMessage: (t: string, d: unknown) => void }
      interface W { __sentClientMessages?: Array<{ msgType: string; data: unknown }>; pipecatClient?: MockClient }
      const w = window as unknown as W;
      w.__sentClientMessages = w.__sentClientMessages || [];
      w.pipecatClient = {
        sendClientMessage(msgType: string, data: unknown) {
          (w.__sentClientMessages as Array<{ msgType: string; data: unknown }>).push({ msgType, data });
        },
      };
    });

    const input = page.locator('#warroomTextInput');
    await input.fill('Hello from text');
    await input.press('Enter');

    // The mock client records every call into window.__sentClientMessages.
    const calls = await page.evaluate(() => {
      return (
        (window as unknown as { __sentClientMessages?: Array<{ msgType: string; data: unknown }> })
          .__sentClientMessages || []
      );
    });
    const textInputCalls = calls.filter((c) => c.msgType === 'text-input');
    expect(textInputCalls).toHaveLength(1);
    expect(textInputCalls[0].data).toMatchObject({ text: 'Hello from text' });

    // Field clears after submit (UX).
    await expect(input).toHaveValue('');
  });

  test('empty / whitespace-only submission is ignored (no client message fired)', async ({ page }) => {
    await stubBackend(page);
    await openWarRoom(page);

    const input = page.locator('#warroomTextInput');
    await input.fill('   ');
    await input.press('Enter');

    const calls = await page.evaluate(() => {
      return (
        (window as unknown as { __sentClientMessages?: Array<{ msgType: string }> })
          .__sentClientMessages || []
      );
    });
    expect(calls.filter((c) => c.msgType === 'text-input')).toHaveLength(0);
  });
});
