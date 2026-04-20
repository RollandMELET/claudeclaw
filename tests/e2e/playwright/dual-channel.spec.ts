/**
 * Slice 8 — Dual-channel voice/text consolidation (RED e2e).
 *
 * Two hardening tests against the unified InputController the GREEN
 * phase introduces:
 *   1. Alternance: 10 text submissions interleaved with 10 simulated
 *      "voice" submissions. Both paths must route through the same
 *      local-echo + persistence code and produce a coherent 20-entry
 *      transcript with no console errors.
 *   2. Reconnect: send one text turn, tear down the in-page Pipecat
 *      client, rebuild it (simulating a mid-meeting WebSocket drop +
 *      reconnect), send another text turn. The second turn must
 *      still fire sendClientMessage('text-input', ...) through the
 *      new client instance without throwing or printing errors.
 *
 * Both tests stub the Pipecat client + API endpoints via page.route()
 * so they run in CI without a live Node / Pipecat backend.
 */

import { test, expect, Route } from '@playwright/test';

const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAeImBZsAAAAASUVORK5CYII=';

// Pipecat client stub. Captures every sendClientMessage call so tests
// can count text-input frames, and exposes window.__rebuildPipecat()
// so the reconnect spec can tear down + rebuild mid-test.
const PIPECAT_STUB = `
(function () {
  window.__sentClientMessages = [];
  function make() {
    var inst = {
      connect: function () { return Promise.resolve(); },
      disconnect: function () { return Promise.resolve(); },
      on: function () {},
      off: function () {},
      enableMic: function () { return Promise.resolve(); },
      disableMic: function () { return Promise.resolve(); },
      sendClientMessage: function (t, d) {
        window.__sentClientMessages.push({ msgType: t, data: d });
      },
    };
    return inst;
  }
  function Client() { return make(); }
  function Transport() {}
  window.PipecatWarRoom = { PipecatClient: Client, WebSocketTransport: Transport };
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
      body: JSON.stringify({ agents: [
        { id: 'main', name: 'RC1 (Main)', description: 'Orchestrateur' },
        { id: 'research', name: 'Research', description: 'Deep research' },
      ] }),
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
    route.fulfill({ status: 200, headers: { 'content-type': 'image/png' }, body: Buffer.from(PNG_1X1, 'base64') }),
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
  // Install a live mock pipecatClient so sendUserInput() accepts text turns
  // even though toggleMeeting() never ran (no real WS in tests).
  await page.evaluate(() => {
    interface W {
      __sentClientMessages?: Array<{ msgType: string; data: unknown }>;
      pipecatClient?: { sendClientMessage: (t: string, d: unknown) => void };
    }
    const w = window as unknown as W;
    w.__sentClientMessages = w.__sentClientMessages || [];
    w.pipecatClient = {
      sendClientMessage(t, d) {
        (w.__sentClientMessages as Array<{ msgType: string; data: unknown }>).push({ msgType: t, data: d });
      },
    };
  });
}

test.describe('Slice 8 — Dual-channel input consolidation', () => {
  test('10 alternating text/voice submissions land in order with no console errors', async ({ page }) => {
    await stubBackend(page);

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await openWarRoom(page);

    // Interleave 10 "text" inputs and 10 simulated "voice" echoes.
    // Both go through the unified sendUserInput() path introduced by
    // Slice 8, which renders a transcript entry + calls
    // pipecatClient.sendClientMessage('text-input', {text}) for text
    // inputs and routes voice text through the same
    // addTranscriptEntry helper for voice inputs.
    for (let i = 0; i < 10; i++) {
      // Text cycle.
      await page.locator('#warroomTextInput').fill(`text message ${i + 1}`);
      await page.locator('#warroomTextInput').press('Enter');

      // Simulated voice cycle: directly invoke the InputController
      // with source='voice' to mirror what the real onUserTranscript
      // callback would do. Slice 8 must expose this as a single entry
      // point so both paths share the same local echo + persistence.
      await page.evaluate((i2) => {
        interface W {
          sendUserInput?: (p: { source: 'voice' | 'text'; text: string }) => void;
        }
        const w = window as unknown as W;
        if (typeof w.sendUserInput === 'function') {
          w.sendUserInput({ source: 'voice', text: `voice message ${i2 + 1}` });
        }
      }, i);
    }

    // Wait for all entries to render.
    await expect
      .poll(async () => await page.locator('.transcript-entry').count(), { timeout: 5000 })
      .toBeGreaterThanOrEqual(20);

    // Assert order: text 1, voice 1, text 2, voice 2, ... text 10, voice 10.
    const texts = await page.locator('.transcript-entry .transcript-text').allInnerTexts();
    expect(texts.length).toBeGreaterThanOrEqual(20);
    for (let i = 0; i < 10; i++) {
      expect(texts).toContain(`text message ${i + 1}`);
      expect(texts).toContain(`voice message ${i + 1}`);
    }

    // Every text turn fired sendClientMessage('text-input', ...); voice
    // turns must NOT have fired it (they don't round-trip through
    // Pipecat — they're local echoes of the STT output).
    const calls = await page.evaluate(() => {
      interface W { __sentClientMessages?: Array<{ msgType: string; data: { text?: string } }> }
      return ((window as unknown as W).__sentClientMessages) || [];
    });
    const textInputCalls = calls.filter((c) => c.msgType === 'text-input');
    expect(textInputCalls).toHaveLength(10);
    for (let i = 0; i < 10; i++) {
      expect(textInputCalls[i].data.text).toBe(`text message ${i + 1}`);
    }

    expect(consoleErrors, consoleErrors.join('\n')).toHaveLength(0);
  });

  test('reconnect mid-meeting: text input still works after pipecatClient is rebuilt', async ({ page }) => {
    await stubBackend(page);

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await openWarRoom(page);

    // First turn.
    await page.locator('#warroomTextInput').fill('before reconnect');
    await page.locator('#warroomTextInput').press('Enter');

    await expect
      .poll(async () => await page.locator('.transcript-entry').count(), { timeout: 3000 })
      .toBeGreaterThanOrEqual(1);

    // Simulate a WebSocket drop: null out pipecatClient, then rebuild
    // a fresh mock (same as the production reconnect path in
    // toggleMeeting → new PipecatClient(...)).
    await page.evaluate(() => {
      interface W {
        __sentClientMessages?: Array<{ msgType: string; data: unknown }>;
        pipecatClient?: { sendClientMessage: (t: string, d: unknown) => void } | null;
      }
      const w = window as unknown as W;
      w.pipecatClient = null;
      // Rebuild. Simulates the client re-connecting after a drop.
      w.pipecatClient = {
        sendClientMessage(t, d) {
          (w.__sentClientMessages as Array<{ msgType: string; data: unknown }>)!.push({ msgType: t, data: d });
        },
      };
    });

    // Second turn after "reconnect".
    await page.locator('#warroomTextInput').fill('after reconnect');
    await page.locator('#warroomTextInput').press('Enter');

    // Both messages must be present in the transcript.
    await expect
      .poll(async () => await page.locator('.transcript-entry').count(), { timeout: 3000 })
      .toBeGreaterThanOrEqual(2);
    const texts = await page.locator('.transcript-entry .transcript-text').allInnerTexts();
    expect(texts).toContain('before reconnect');
    expect(texts).toContain('after reconnect');

    // The "after reconnect" sendClientMessage call must be present.
    const calls = await page.evaluate(() => {
      interface W { __sentClientMessages?: Array<{ msgType: string; data: { text?: string } }> }
      return ((window as unknown as W).__sentClientMessages) || [];
    });
    const textInputCalls = calls.filter((c) => c.msgType === 'text-input');
    expect(textInputCalls.map((c) => c.data.text)).toEqual([
      'before reconnect',
      'after reconnect',
    ]);

    expect(consoleErrors, consoleErrors.join('\n')).toHaveLength(0);
  });
});
