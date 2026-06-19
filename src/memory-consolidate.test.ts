import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./gemini.js', () => ({
  generateContent: vi.fn(),
  parseJsonResponse: vi.fn(),
}));

vi.mock('./db.js', () => ({
  getUnconsolidatedMemories: vi.fn(),
  saveConsolidationAtomic: vi.fn(() => 1),
  saveConsolidationEmbedding: vi.fn(),
}));

vi.mock('./embeddings.js', () => ({
  embedText: vi.fn(() => Promise.resolve([])),
}));

vi.mock('./logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('./memory-report.js', () => ({
  sendSupersededReport: vi.fn(() => Promise.resolve(true)),
}));

import {
  runConsolidation,
  shouldRunAutoDream,
  runAutoDream,
} from './memory-consolidate.js';
import { generateContent, parseJsonResponse } from './gemini.js';
import {
  getUnconsolidatedMemories,
  saveConsolidationAtomic,
} from './db.js';
import { sendSupersededReport } from './memory-report.js';

const mockGetUnconsolidated = vi.mocked(getUnconsolidatedMemories);
const mockGenerateContent = vi.mocked(generateContent);
const mockParseJson = vi.mocked(parseJsonResponse);
const mockSaveAtomic = vi.mocked(saveConsolidationAtomic);
const mockSendReport = vi.mocked(sendSupersededReport);

function makeMemory(id: number, summary: string) {
  return {
    id,
    chat_id: 'chat1',
    source: 'conversation',
    agent_id: 'main',
    raw_text: 'raw',
    summary,
    entities: '[]',
    topics: '[]',
    connections: '[]',
    importance: 0.6,
    salience: 1.0,
    consolidated: 0,
    pinned: 0,
    embedding: null,
    created_at: Math.floor(Date.now() / 1000) - 3600,
    accessed_at: Math.floor(Date.now() / 1000) - 3600,
  };
}

describe('runConsolidation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Skip conditions ───────────────────────────────────────────────

  it('skips when fewer than 2 unconsolidated memories', async () => {
    mockGetUnconsolidated.mockReturnValue([makeMemory(1, 'only one')]);
    await runConsolidation('chat1');
    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(mockSaveAtomic).not.toHaveBeenCalled();
  });

  it('skips when zero unconsolidated memories', async () => {
    mockGetUnconsolidated.mockReturnValue([]);
    await runConsolidation('chat1');
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  // ── Successful consolidation ──────────────────────────────────────

  it('consolidates 2+ memories and saves the result atomically', async () => {
    const memories = [
      makeMemory(10, 'User prefers morning email triage'),
      makeMemory(20, 'User checks Slack after email'),
      makeMemory(30, 'User blocks 9-10am for admin tasks'),
    ];
    mockGetUnconsolidated.mockReturnValue(memories);

    const consolidationResult = {
      summary: 'User has a structured morning routine.',
      insight: 'User organizes mornings around a clear priority order.',
      connections: [
        { from_id: 10, to_id: 20, relationship: 'sequential workflow' },
        { from_id: 20, to_id: 30, relationship: 'part of morning routine' },
      ],
    };
    mockGenerateContent.mockResolvedValue(JSON.stringify(consolidationResult));
    mockParseJson.mockReturnValue(consolidationResult);

    await runConsolidation('chat1');

    // Should call atomic save with all data bundled
    expect(mockSaveAtomic).toHaveBeenCalledTimes(1);
    expect(mockSaveAtomic).toHaveBeenCalledWith(
      'chat1',
      [10, 20, 30],
      consolidationResult.summary,
      consolidationResult.insight,
      // Valid connections passed through
      [
        { from_id: 10, to_id: 20, relationship: 'sequential workflow' },
        { from_id: 20, to_id: 30, relationship: 'part of morning routine' },
      ],
      // No contradictions
      [],
    );
  });

  // ── Connection filtering ──────────────────────────────────────────

  it('ignores connections with IDs outside the source set', async () => {
    const memories = [makeMemory(10, 'mem1'), makeMemory(20, 'mem2')];
    mockGetUnconsolidated.mockReturnValue(memories);

    const result = {
      summary: 'summary',
      insight: 'insight',
      connections: [
        { from_id: 10, to_id: 999, relationship: 'invalid target' },
        { from_id: 888, to_id: 20, relationship: 'invalid source' },
        { from_id: 10, to_id: 20, relationship: 'valid connection' },
      ],
    };
    mockGenerateContent.mockResolvedValue(JSON.stringify(result));
    mockParseJson.mockReturnValue(result);

    await runConsolidation('chat1');

    // Only the valid connection should be passed to atomic save
    expect(mockSaveAtomic).toHaveBeenCalledWith(
      'chat1',
      [10, 20],
      'summary',
      'insight',
      [{ from_id: 10, to_id: 20, relationship: 'valid connection' }],
      [],
    );
  });

  it('handles empty connections array', async () => {
    const memories = [makeMemory(10, 'mem1'), makeMemory(20, 'mem2')];
    mockGetUnconsolidated.mockReturnValue(memories);

    const result = {
      summary: 'These cover different topics',
      insight: 'No clear pattern between these memories',
      connections: [],
    };
    mockGenerateContent.mockResolvedValue(JSON.stringify(result));
    mockParseJson.mockReturnValue(result);

    await runConsolidation('chat1');

    expect(mockSaveAtomic).toHaveBeenCalledWith(
      'chat1',
      [10, 20],
      result.summary,
      result.insight,
      [],
      [],
    );
  });

  // ── Error handling ────────────────────────────────────────────────

  it('handles Gemini API failure gracefully', async () => {
    const memories = [makeMemory(10, 'mem1'), makeMemory(20, 'mem2')];
    mockGetUnconsolidated.mockReturnValue(memories);
    mockGenerateContent.mockRejectedValue(new Error('API timeout'));

    await expect(runConsolidation('chat1')).resolves.not.toThrow();
    expect(mockSaveAtomic).not.toHaveBeenCalled();
  });

  it('handles invalid Gemini response (null parse)', async () => {
    const memories = [makeMemory(10, 'mem1'), makeMemory(20, 'mem2')];
    mockGetUnconsolidated.mockReturnValue(memories);
    mockGenerateContent.mockResolvedValue('garbage');
    mockParseJson.mockReturnValue(null);

    await runConsolidation('chat1');
    expect(mockSaveAtomic).not.toHaveBeenCalled();
  });

  it('handles missing summary in response', async () => {
    const memories = [makeMemory(10, 'mem1'), makeMemory(20, 'mem2')];
    mockGetUnconsolidated.mockReturnValue(memories);

    const result = { summary: '', insight: 'insight', connections: [] };
    mockGenerateContent.mockResolvedValue(JSON.stringify(result));
    mockParseJson.mockReturnValue(result);

    await runConsolidation('chat1');
    expect(mockSaveAtomic).not.toHaveBeenCalled();
  });

  it('handles missing insight in response', async () => {
    const memories = [makeMemory(10, 'mem1'), makeMemory(20, 'mem2')];
    mockGetUnconsolidated.mockReturnValue(memories);

    const result = { summary: 'summary', insight: '', connections: [] };
    mockGenerateContent.mockResolvedValue(JSON.stringify(result));
    mockParseJson.mockReturnValue(result);

    await runConsolidation('chat1');
    expect(mockSaveAtomic).not.toHaveBeenCalled();
  });

  // ── Overlap guard ─────────────────────────────────────────────────

  it('does not run concurrently (overlap guard)', async () => {
    const memories = [makeMemory(10, 'mem1'), makeMemory(20, 'mem2')];
    mockGetUnconsolidated.mockReturnValue(memories);

    let resolveFirst!: (val: string) => void;
    const firstPromise = new Promise<string>((resolve) => { resolveFirst = resolve; });
    mockGenerateContent.mockReturnValueOnce(firstPromise);

    const result = {
      summary: 'summary',
      insight: 'insight',
      connections: [],
    };

    const run1 = runConsolidation('chat1');
    mockGetUnconsolidated.mockReturnValue(memories);
    const run2 = runConsolidation('chat1');

    resolveFirst(JSON.stringify(result));
    mockParseJson.mockReturnValue(result);

    await run1;
    await run2;

    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });
});

// ── Auto-Dream nightly trigger logic ──────────────────────────────────

describe('shouldRunAutoDream', () => {
  // Use a fixed local date; getHours()/getDate() are local-tz, which is what
  // shouldRunAutoDream uses, so constructing with local components is safe.
  function at(hour: number, day = 15): Date {
    return new Date(2026, 5, day, hour, 30, 0); // 2026-06-DD hh:30 local
  }

  it('triggers inside the target hour when not yet run today', () => {
    expect(shouldRunAutoDream(at(3), null, 3)).toBe(true);
  });

  it('does not trigger outside the target hour', () => {
    expect(shouldRunAutoDream(at(2), null, 3)).toBe(false);
    expect(shouldRunAutoDream(at(4), null, 3)).toBe(false);
  });

  it('does not trigger twice on the same day', () => {
    const now = at(3, 15);
    // lastRunDate is today's key → already ran
    const todayKey = `2026-06-15`;
    expect(shouldRunAutoDream(now, todayKey, 3)).toBe(false);
  });

  it('triggers again on the next day', () => {
    const tomorrow = at(3, 16);
    const ranYesterday = '2026-06-15';
    expect(shouldRunAutoDream(tomorrow, ranYesterday, 3)).toBe(true);
  });

  it('respects a configurable target hour', () => {
    expect(shouldRunAutoDream(at(5), null, 5)).toBe(true);
    expect(shouldRunAutoDream(at(3), null, 5)).toBe(false);
  });
});

describe('runAutoDream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forces a consolidation then sends the contradiction report', async () => {
    // Two memories so consolidation actually runs.
    const memories = [makeMemory(10, 'mem1'), makeMemory(20, 'mem2')];
    mockGetUnconsolidated.mockReturnValue(memories);
    const result = { summary: 'summary', insight: 'insight', connections: [] };
    mockGenerateContent.mockResolvedValue(JSON.stringify(result));
    mockParseJson.mockReturnValue(result);

    const sender = vi.fn(() => Promise.resolve());
    await runAutoDream('chat1', sender);

    // consolidation ran
    expect(mockSaveAtomic).toHaveBeenCalledTimes(1);
    // report pushed with the chat + sender + a 24h window
    expect(mockSendReport).toHaveBeenCalledTimes(1);
    const [chatArg, senderArg, sinceArg] = mockSendReport.mock.calls[0];
    expect(chatArg).toBe('chat1');
    expect(senderArg).toBe(sender);
    expect(typeof sinceArg).toBe('number');
  });

  it('still sends the report even if the report step throws', async () => {
    mockGetUnconsolidated.mockReturnValue([makeMemory(10, 'mem1'), makeMemory(20, 'mem2')]);
    const result = { summary: 'summary', insight: 'insight', connections: [] };
    mockGenerateContent.mockResolvedValue(JSON.stringify(result));
    mockParseJson.mockReturnValue(result);
    mockSendReport.mockRejectedValueOnce(new Error('boom'));

    const sender = vi.fn(() => Promise.resolve());
    await expect(runAutoDream('chat1', sender)).resolves.not.toThrow();
  });
});
