import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./db.js', () => ({
  getRecentlySupersededMemories: vi.fn(),
}));

vi.mock('./logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { buildSupersededReport, sendSupersededReport } from './memory-report.js';
import { getRecentlySupersededMemories } from './db.js';
import type { SupersededPair } from './db.js';

const mockGetSuperseded = vi.mocked(getRecentlySupersededMemories);

function makePair(staleId: number, newId: number, staleSummary: string, newSummary: string): SupersededPair {
  return {
    stale_id: staleId,
    stale_summary: staleSummary,
    stale_created_at: 1_700_000_000,
    new_id: newId,
    new_summary: newSummary,
    new_created_at: 1_700_086_400,
  };
}

describe('buildSupersededReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when there are no superseded memories (RAS)', () => {
    mockGetSuperseded.mockReturnValue([]);
    expect(buildSupersededReport('chat1')).toBeNull();
  });

  it('formats a report with each perime->remplace pair', () => {
    mockGetSuperseded.mockReturnValue([
      makePair(10, 20, 'User lives in Paris', 'User moved to Lyon'),
      makePair(30, 40, 'Meeting on Monday', 'Meeting rescheduled to Tuesday'),
    ]);

    const html = buildSupersededReport('chat1');
    expect(html).not.toBeNull();
    // mentions both stale and replacement IDs
    expect(html).toContain('#10');
    expect(html).toContain('#20');
    expect(html).toContain('#30');
    expect(html).toContain('#40');
    // includes the summaries
    expect(html).toContain('User lives in Paris');
    expect(html).toContain('User moved to Lyon');
    expect(html).toContain('Meeting rescheduled to Tuesday');
    // count of contradictions surfaced
    expect(html).toContain('2 mémoire');
  });

  it('escapes HTML-unsafe characters in summaries', () => {
    mockGetSuperseded.mockReturnValue([
      makePair(1, 2, 'old <value> & stuff', 'new <thing>'),
    ]);
    const html = buildSupersededReport('chat1')!;
    expect(html).toContain('&lt;value&gt;');
    expect(html).toContain('&amp;');
    // raw unescaped angle brackets from the summary must not leak through
    expect(html).not.toContain('<value>');
    expect(html).not.toContain('<thing>');
  });

  it('passes the sinceTs window through to the DB query', () => {
    mockGetSuperseded.mockReturnValue([]);
    buildSupersededReport('chat1', 12345);
    expect(mockGetSuperseded).toHaveBeenCalledWith('chat1', 12345);
  });
});

describe('sendSupersededReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not call the sender when there is nothing to report', async () => {
    mockGetSuperseded.mockReturnValue([]);
    const sender = vi.fn(() => Promise.resolve());
    const sent = await sendSupersededReport('chat1', sender);
    expect(sent).toBe(false);
    expect(sender).not.toHaveBeenCalled();
  });

  it('sends the report when contradictions exist', async () => {
    mockGetSuperseded.mockReturnValue([makePair(10, 20, 'old', 'new')]);
    const sender = vi.fn(() => Promise.resolve());
    const sent = await sendSupersededReport('chat1', sender);
    expect(sent).toBe(true);
    expect(sender).toHaveBeenCalledTimes(1);
    expect(sender).toHaveBeenCalledWith(expect.stringContaining('#10'));
  });

  it('swallows sender errors and reports failure', async () => {
    mockGetSuperseded.mockReturnValue([makePair(10, 20, 'old', 'new')]);
    const sender = vi.fn(() => Promise.reject(new Error('telegram down')));
    const sent = await sendSupersededReport('chat1', sender);
    expect(sent).toBe(false);
  });
});
