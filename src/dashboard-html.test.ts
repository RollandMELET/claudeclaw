/**
 * Smoke tests for getDashboardHtml — fork Mission Control page.
 *
 * Zero mocks: dashboard-html.ts has no external imports. We check the
 * document shell, (token, chatId) interpolation into the inline JS, and
 * that the core fork sections (agents / hive mind / mission board /
 * memories) are present.
 */

import { describe, it, expect } from 'vitest';
import { getDashboardHtml } from './dashboard-html.js';

describe('getDashboardHtml', () => {
  it('returns a non-empty HTML document with DOCTYPE', () => {
    const html = getDashboardHtml('t0k3n', 'chat42');
    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain('<!DOCTYPE html>');
  });

  it('JSON-quotes the token and chatId into the inline JS globals', () => {
    const html = getDashboardHtml('abc"xyz', 'chat-99');
    // JSON.stringify escapes the embedded quote — the raw double-quote must
    // not slip into the source untouched, which would break the JS.
    expect(html).toContain('const TOKEN = "abc\\"xyz";');
    expect(html).toContain('const CHAT_ID = "chat-99";');
  });

  it('includes the expected fork sections (agents, hive, mission, tasks inbox)', () => {
    const html = getDashboardHtml('t', 'c');
    expect(html).toContain('id="agents-section"');
    expect(html).toContain('id="agents-container"');
    expect(html).toContain('id="hive-section"');
    expect(html).toContain('id="mission-section"');
    expect(html).toContain('id="tasks-inbox-section"');
  });
});
