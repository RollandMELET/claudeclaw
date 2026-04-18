/**
 * Smoke tests for getWarRoomHtml — the fork-only cinematic War Room page.
 *
 * No mocks needed: warroom-html.ts has zero imports. We check structural
 * invariants, interpolation of (token, chatId, warroomPort), HTML escaping,
 * and the presence of the fork's canonical agent roster in the stage layout.
 */

import { describe, it, expect } from 'vitest';
import { getWarRoomHtml } from './warroom-html.js';

describe('getWarRoomHtml', () => {
  it('returns a non-empty HTML document with DOCTYPE', () => {
    const html = getWarRoomHtml('t0k3n', 'chat42', 7860);
    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain('<!DOCTYPE html>');
  });

  it('interpolates the warroomPort into the inline JS', () => {
    const html = getWarRoomHtml('t0k3n', 'chat42', 7860);
    expect(html).toContain('const WARROOM_PORT = 7860;');
  });

  it('interpolates the token and chatId into avatar URLs and the inline JS', () => {
    const html = getWarRoomHtml('abc123', 'chat-99', 7860);
    // Escaped attributes on the stage (safeToken).
    expect(html).toContain('/warroom-avatar/main?token=abc123');
    // JSON-quoted in the inline JS (jsToken / jsChatId).
    expect(html).toContain('"abc123"');
    expect(html).toContain('"chat-99"');
  });

  it('HTML-escapes the token in attribute contexts (no raw injection)', () => {
    const html = getWarRoomHtml('"><x y=', 'chat42', 7860);
    // safeToken is used in href/src attributes — must be escaped there.
    expect(html).toContain('/warroom-avatar/main?token=&quot;&gt;&lt;x y=');
    // Raw attribute-breaking sequence must not land in an attribute.
    expect(html).not.toContain('/warroom-avatar/main?token="><x y=');
  });

  it('hard-codes the fork roster of 5 stage agents (main, research, comms, content, ops)', () => {
    const html = getWarRoomHtml('t', 'c', 7860);
    for (const agent of ['main', 'research', 'comms', 'content', 'ops']) {
      expect(html).toContain(`data-agent="${agent}"`);
    }
  });
});
