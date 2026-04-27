/**
 * Tests for hooks/auto-tldr.ts
 *
 * NOTE: vitest.config.ts limits the default test glob to src/**\/*.test.ts.
 * Run this file explicitly:
 *   npx vitest run hooks/auto-tldr.test.ts
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../db.js', () => ({
  getSessionConversation: vi.fn(),
}));

vi.mock('../config.js', () => ({
  GOOGLE_API_KEY: 'test-key',
}));

const mockGenerate = vi.fn();

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: {
      generateContent: mockGenerate,
    },
  })),
}));

vi.mock('../logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

import { onSessionEnd, __test__ } from './auto-tldr.js';
import { getSessionConversation } from '../db.js';
import { logger } from '../logger.js';

const mockGetSession = vi.mocked(getSessionConversation);
const mockLoggerWarn = vi.mocked(logger.warn);

function makeTurn(role: 'user' | 'assistant', content: string, ts = 100) {
  return {
    id: 0,
    chat_id: 'chat1',
    session_id: 'sess1',
    role,
    content,
    created_at: ts,
  };
}

function makeTurns(n: number) {
  return Array.from({ length: n }, (_, i) =>
    makeTurn(i % 2 === 0 ? 'user' : 'assistant', `message ${i}`, 100 + i),
  );
}

const ctx = {
  chatId: 'chat1',
  agentId: 'main',
  sessionId: 'sess1',
};

let tmpHome: string;
let originalHome: string | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  // Redirect HOME so writes land in a tmp dir, but the module already
  // captured SESSIONS_DIR at import time. We patch fs.mkdirSync/writeFileSync
  // observation rather than re-routing HOME.
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-tldr-test-'));
  originalHome = process.env.HOME;
});

afterEach(() => {
  if (originalHome !== undefined) process.env.HOME = originalHome;
  try {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe('auto-tldr onSessionEnd', () => {
  it('skips when fewer than 10 turns', async () => {
    mockGetSession.mockReturnValue(makeTurns(5) as never);

    const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

    await onSessionEnd(ctx);

    expect(mockGenerate).not.toHaveBeenCalled();
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('skips when sessionId is missing', async () => {
    const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

    await onSessionEnd({ chatId: 'chat1', agentId: 'main' });

    expect(mockGetSession).not.toHaveBeenCalled();
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('writes summary to expected path when Gemini returns text', async () => {
    mockGetSession.mockReturnValue(makeTurns(12) as never);
    mockGenerate.mockResolvedValue({ text: '## Topics\n- testing\n## Decisions\n- ship it' });

    const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
    const mkdirSpy = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as never);

    await onSessionEnd(ctx);

    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(writeSpy).toHaveBeenCalledTimes(1);

    const expectedPath = __test__.sessionFilePath(ctx);
    const [actualPath, contents] = writeSpy.mock.calls[0] as [string, string, unknown];
    expect(actualPath).toBe(expectedPath);
    expect(expectedPath).toContain(path.join('.claude', 'memory', 'sessions', 'claudeclaw'));
    expect(expectedPath.endsWith('chat1-main-sess1.md')).toBe(true);

    // Front-matter + summary body present
    expect(contents).toContain('chat_id: chat1');
    expect(contents).toContain('agent_id: main');
    expect(contents).toContain('session_id: sess1');
    expect(contents).toContain('turns: 12');
    expect(contents).toContain('## Topics');

    // Parent dir creation requested with recursive: true
    expect(mkdirSpy).toHaveBeenCalledWith(path.dirname(expectedPath), { recursive: true });
  });

  it('creates the parent directory when missing', async () => {
    mockGetSession.mockReturnValue(makeTurns(15) as never);
    mockGenerate.mockResolvedValue({ text: '## Topics\n- x' });

    const mkdirSpy = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as never);
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

    await onSessionEnd(ctx);

    expect(mkdirSpy).toHaveBeenCalled();
    const call = mkdirSpy.mock.calls[0];
    expect(call?.[1]).toEqual({ recursive: true });
    expect(String(call?.[0])).toContain(path.join('memory', 'sessions', 'claudeclaw'));
  });

  it('respects 4500ms timeout when Gemini hangs (does not throw, swallows)', async () => {
    vi.useFakeTimers();
    mockGetSession.mockReturnValue(makeTurns(20) as never);

    // Gemini call that never resolves
    mockGenerate.mockImplementation(() => new Promise(() => undefined));

    const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as never);

    const promise = onSessionEnd(ctx);

    // Advance just under threshold — still pending
    await vi.advanceTimersByTimeAsync(4400);

    // Cross the timeout boundary
    await vi.advanceTimersByTimeAsync(200);

    await expect(promise).resolves.toBeUndefined();

    expect(writeSpy).not.toHaveBeenCalled();
    // Outer catch logs the timeout
    expect(mockLoggerWarn).toHaveBeenCalled();
    const warnArgs = mockLoggerWarn.mock.calls[0] as [unknown, string];
    expect(JSON.stringify(warnArgs[0])).toContain('timeout');

    vi.useRealTimers();
  });

  it('exposes 4500ms timeout constant', () => {
    expect(__test__.GEMINI_TIMEOUT_MS).toBe(4500);
    expect(__test__.MIN_TURNS).toBe(10);
  });

  it('withTimeout helper rejects after configured ms', async () => {
    vi.useFakeTimers();
    const hung = new Promise(() => undefined);
    const wrapped = __test__.withTimeout(hung as Promise<unknown>, 100);
    const assertion = expect(wrapped).rejects.toThrow(/timeout/);
    await vi.advanceTimersByTimeAsync(150);
    await assertion;
    vi.useRealTimers();
  });
});
