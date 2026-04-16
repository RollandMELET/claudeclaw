import { describe, it, expect, beforeEach } from 'vitest';
import {
  _initTestDatabase,
  _testDb,
  setSession,
  getSession,
  clearSession,
  saveStructuredMemory,
  searchMemories,
  getRecentMemories,
  getRecentHighImportanceMemories,
  touchMemory,
  decayMemories,
  getUnconsolidatedMemories,
  saveConsolidation,
  markMemoriesConsolidated,
  getRecentConsolidations,
  searchConsolidations,
  updateMemoryConnections,
  getDashboardMemoryStats,
  getDashboardLowSalienceMemories,
  getDashboardTopAccessedMemories,
  getDashboardMemoriesList,
  getDashboardMemoryTimeline,
} from './db.js';

describe('database', () => {
  beforeEach(() => {
    _initTestDatabase();
  });

  // ── Sessions ────────────────────────────────────────────────────

  describe('sessions', () => {
    it('returns undefined for missing session', () => {
      expect(getSession('unknown')).toBeUndefined();
    });

    it('setSession then getSession returns the session ID', () => {
      setSession('chat1', 'sess-abc');
      expect(getSession('chat1')).toBe('sess-abc');
    });

    it('setSession overwrites existing session', () => {
      setSession('chat1', 'sess-1');
      setSession('chat1', 'sess-2');
      expect(getSession('chat1')).toBe('sess-2');
    });

    it('clearSession removes the session', () => {
      setSession('chat1', 'sess-abc');
      clearSession('chat1');
      expect(getSession('chat1')).toBeUndefined();
    });

    it('clearSession on missing session does not throw', () => {
      expect(() => clearSession('nonexistent')).not.toThrow();
    });
  });

  // ── Structured Memories ────────────────────────────────────────

  describe('saveStructuredMemory', () => {
    it('saves a memory with all fields persisted', () => {
      saveStructuredMemory('chat1', 'I like pizza', 'User enjoys pizza', ['pizza'], ['food', 'preferences'], 0.7);
      const mems = getRecentMemories('chat1', 10);
      expect(mems).toHaveLength(1);
      expect(mems[0].chat_id).toBe('chat1');
      expect(mems[0].raw_text).toBe('I like pizza');
      expect(mems[0].summary).toBe('User enjoys pizza');
      expect(JSON.parse(mems[0].entities)).toEqual(['pizza']);
      expect(JSON.parse(mems[0].topics)).toEqual(['food', 'preferences']);
      expect(mems[0].importance).toBe(0.7);
      expect(mems[0].salience).toBe(1.0);
      expect(mems[0].consolidated).toBe(0);
      expect(mems[0].source).toBe('conversation');
      expect(mems[0].created_at).toBeGreaterThan(0);
    });

    it('returns the memory ID', () => {
      const id = saveStructuredMemory('chat1', 'test', 'test summary', [], [], 0.5);
      expect(id).toBeGreaterThan(0);
    });
  });

  describe('searchMemories', () => {
    it('finds matching summary via FTS5', () => {
      saveStructuredMemory('chat1', 'raw text about TypeScript', 'User enjoys TypeScript programming', ['TypeScript'], ['coding'], 0.6);
      saveStructuredMemory('chat1', 'weather stuff', 'The weather is nice today', [], ['weather'], 0.3);
      const results = searchMemories('chat1', 'TypeScript', 5);
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].summary).toContain('TypeScript');
    });

    it('returns empty array for no match', () => {
      saveStructuredMemory('chat1', 'raw', 'I love TypeScript', [], [], 0.5);
      const results = searchMemories('chat1', 'xyznonexistent', 5);
      expect(results).toEqual([]);
    });

    it('returns empty array for empty query', () => {
      saveStructuredMemory('chat1', 'raw', 'something', [], [], 0.5);
      const results = searchMemories('chat1', '', 5);
      expect(results).toEqual([]);
    });

    it('does not return memories from other chats', () => {
      saveStructuredMemory('chat1', 'raw', 'I love TypeScript', [], [], 0.5);
      saveStructuredMemory('chat2', 'raw', 'I love Python', [], [], 0.5);
      const results = searchMemories('chat1', 'Python', 5);
      expect(results).toEqual([]);
    });

    it('respects limit parameter', () => {
      saveStructuredMemory('chat1', 'raw', 'first topic about coding', [], ['coding'], 0.5);
      saveStructuredMemory('chat1', 'raw', 'second topic about coding', [], ['coding'], 0.5);
      saveStructuredMemory('chat1', 'raw', 'third topic about coding', [], ['coding'], 0.5);
      const results = searchMemories('chat1', 'coding', 2);
      expect(results).toHaveLength(2);
    });
  });

  describe('getRecentHighImportanceMemories', () => {
    it('only returns memories with importance >= 0.5', () => {
      saveStructuredMemory('chat1', 'raw', 'low importance', [], [], 0.3);
      saveStructuredMemory('chat1', 'raw', 'high importance', [], [], 0.8);
      const mems = getRecentHighImportanceMemories('chat1', 10);
      expect(mems).toHaveLength(1);
      expect(mems[0].summary).toBe('high importance');
    });
  });

  describe('touchMemory', () => {
    it('increments salience by 0.1', () => {
      saveStructuredMemory('chat1', 'raw', 'test memory', [], [], 0.5);
      const before = getRecentMemories('chat1', 1)[0];
      expect(before.salience).toBe(1.0);

      touchMemory(before.id);
      const after = getRecentMemories('chat1', 1)[0];
      expect(after.salience).toBeCloseTo(1.1, 5);
    });

    it('caps salience at 5.0', () => {
      saveStructuredMemory('chat1', 'raw', 'test memory', [], [], 0.5);
      const mem = getRecentMemories('chat1', 1)[0];

      for (let i = 0; i < 50; i++) {
        touchMemory(mem.id);
      }

      const after = getRecentMemories('chat1', 1)[0];
      expect(after.salience).toBe(5.0);
    });
  });

  describe('decayMemories', () => {
    it('does not throw on empty database', () => {
      expect(() => decayMemories()).not.toThrow();
    });

    it('does not decay recent memories', () => {
      saveStructuredMemory('chat1', 'raw', 'fresh memory', [], [], 0.5);
      const before = getRecentMemories('chat1', 1)[0];

      decayMemories();

      const after = getRecentMemories('chat1', 1)[0];
      expect(after.salience).toBe(before.salience);
    });
  });

  // ── Consolidation ────────────────────────────────────────────────

  describe('consolidation', () => {
    it('getUnconsolidatedMemories returns only unconsolidated', () => {
      saveStructuredMemory('chat1', 'raw', 'mem1', [], [], 0.5);
      saveStructuredMemory('chat1', 'raw', 'mem2', [], [], 0.6);
      const uncon = getUnconsolidatedMemories('chat1', 10);
      expect(uncon).toHaveLength(2);
    });

    it('markMemoriesConsolidated marks them', () => {
      const id1 = saveStructuredMemory('chat1', 'raw', 'mem1', [], [], 0.5);
      const id2 = saveStructuredMemory('chat1', 'raw', 'mem2', [], [], 0.6);
      markMemoriesConsolidated([id1, id2]);
      const uncon = getUnconsolidatedMemories('chat1', 10);
      expect(uncon).toHaveLength(0);
    });

    it('saveConsolidation creates a record', () => {
      const id1 = saveStructuredMemory('chat1', 'raw', 'mem1', [], [], 0.5);
      const id2 = saveStructuredMemory('chat1', 'raw', 'mem2', [], [], 0.6);
      saveConsolidation('chat1', [id1, id2], 'Both relate to work', 'User is focused on productivity');
      const cons = getRecentConsolidations('chat1', 5);
      expect(cons).toHaveLength(1);
      expect(cons[0].insight).toBe('User is focused on productivity');
      expect(JSON.parse(cons[0].source_ids)).toEqual([id1, id2]);
    });

    it('getUnconsolidatedMemories respects limit', () => {
      for (let i = 0; i < 5; i++) {
        saveStructuredMemory('chat1', 'raw', `mem${i}`, [], [], 0.5);
      }
      const uncon = getUnconsolidatedMemories('chat1', 3);
      expect(uncon).toHaveLength(3);
    });

    it('getUnconsolidatedMemories does not return memories from other chats', () => {
      saveStructuredMemory('chat1', 'raw', 'mine', [], [], 0.5);
      saveStructuredMemory('chat2', 'raw', 'theirs', [], [], 0.5);
      const uncon = getUnconsolidatedMemories('chat1', 10);
      expect(uncon).toHaveLength(1);
      expect(uncon[0].summary).toBe('mine');
    });

    it('markMemoriesConsolidated handles empty array', () => {
      expect(() => markMemoriesConsolidated([])).not.toThrow();
    });

    it('getRecentConsolidations respects limit', () => {
      const id1 = saveStructuredMemory('chat1', 'raw', 'mem1', [], [], 0.5);
      saveConsolidation('chat1', [id1], 'summary1', 'insight1');
      saveConsolidation('chat1', [id1], 'summary2', 'insight2');
      saveConsolidation('chat1', [id1], 'summary3', 'insight3');
      const cons = getRecentConsolidations('chat1', 2);
      expect(cons).toHaveLength(2);
    });

    it('getRecentConsolidations returns empty for chat with no consolidations', () => {
      const cons = getRecentConsolidations('empty-chat', 5);
      expect(cons).toEqual([]);
    });
  });

  // ── searchConsolidations ──────────────────────────────────────────

  describe('searchConsolidations', () => {
    it('finds consolidations matching summary', () => {
      const id1 = saveStructuredMemory('chat1', 'raw', 'mem', [], [], 0.5);
      saveConsolidation('chat1', [id1], 'Morning email routine is important', 'User has structured mornings');
      const results = searchConsolidations('chat1', 'email', 5);
      expect(results).toHaveLength(1);
      expect(results[0].summary).toContain('email');
    });

    it('finds consolidations matching insight', () => {
      const id1 = saveStructuredMemory('chat1', 'raw', 'mem', [], [], 0.5);
      saveConsolidation('chat1', [id1], 'General summary', 'User prefers TypeScript for all projects');
      const results = searchConsolidations('chat1', 'TypeScript', 5);
      expect(results).toHaveLength(1);
    });

    it('returns empty for no match', () => {
      const id1 = saveStructuredMemory('chat1', 'raw', 'mem', [], [], 0.5);
      saveConsolidation('chat1', [id1], 'About coding', 'Coding insight');
      const results = searchConsolidations('chat1', 'xyznonexistent', 5);
      expect(results).toEqual([]);
    });
  });

  // ── updateMemoryConnections ───────────────────────────────────────

  describe('updateMemoryConnections', () => {
    it('appends connections to an existing memory', () => {
      const id = saveStructuredMemory('chat1', 'raw', 'mem', [], [], 0.5);
      updateMemoryConnections(id, [{ linked_to: 99, relationship: 'related to' }]);
      const mem = getRecentMemories('chat1', 1)[0];
      const conns = JSON.parse(mem.connections);
      expect(conns).toHaveLength(1);
      expect(conns[0]).toEqual({ linked_to: 99, relationship: 'related to' });
    });

    it('appends to existing connections without overwriting', () => {
      const id = saveStructuredMemory('chat1', 'raw', 'mem', [], [], 0.5);
      updateMemoryConnections(id, [{ linked_to: 10, relationship: 'first' }]);
      updateMemoryConnections(id, [{ linked_to: 20, relationship: 'second' }]);
      const mem = getRecentMemories('chat1', 1)[0];
      const conns = JSON.parse(mem.connections);
      expect(conns).toHaveLength(2);
      expect(conns[0].linked_to).toBe(10);
      expect(conns[1].linked_to).toBe(20);
    });

    it('does not throw for nonexistent memory ID', () => {
      expect(() => updateMemoryConnections(99999, [{ linked_to: 1, relationship: 'test' }])).not.toThrow();
    });
  });

  // ── FTS5 multi-column search ──────────────────────────────────────

  describe('FTS5 multi-column search', () => {
    it('finds memory by entity match', () => {
      saveStructuredMemory('chat1', 'raw text', 'summary text', ['OpenAI', 'GPT-4'], ['AI'], 0.6);
      const results = searchMemories('chat1', 'OpenAI', 5);
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('finds memory by topic match', () => {
      saveStructuredMemory('chat1', 'raw text', 'summary text', [], ['productivity', 'workflow'], 0.6);
      const results = searchMemories('chat1', 'productivity', 5);
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('finds memory by raw_text match', () => {
      saveStructuredMemory('chat1', 'I absolutely love hiking in the mountains', 'User enjoys outdoor activities', ['hiking'], ['hobbies'], 0.5);
      const results = searchMemories('chat1', 'hiking mountains', 5);
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('handles special characters in search query', () => {
      saveStructuredMemory('chat1', 'raw', 'summary', [], [], 0.5);
      const results = searchMemories('chat1', '!!!???', 5);
      expect(results).toEqual([]);
    });
  });

  // ── getRecentHighImportanceMemories edge cases ────────────────────

  describe('getRecentHighImportanceMemories edge cases', () => {
    it('includes memories with importance exactly 0.5', () => {
      saveStructuredMemory('chat1', 'raw', 'borderline', [], [], 0.5);
      const mems = getRecentHighImportanceMemories('chat1', 10);
      expect(mems).toHaveLength(1);
    });

    it('excludes memories with importance 0.49', () => {
      saveStructuredMemory('chat1', 'raw', 'just below', [], [], 0.49);
      const mems = getRecentHighImportanceMemories('chat1', 10);
      expect(mems).toHaveLength(0);
    });

    it('respects limit parameter', () => {
      for (let i = 0; i < 10; i++) {
        saveStructuredMemory('chat1', 'raw', `high${i}`, [], [], 0.8);
      }
      const mems = getRecentHighImportanceMemories('chat1', 3);
      expect(mems).toHaveLength(3);
    });
  });

  // ── Dashboard queries ─────────────────────────────────────────────

  describe('dashboard queries', () => {
    it('getDashboardMemoryStats returns correct totals', () => {
      saveStructuredMemory('chat1', 'raw', 'high', [], [], 0.9);
      saveStructuredMemory('chat1', 'raw', 'mid', [], [], 0.6);
      saveStructuredMemory('chat1', 'raw', 'low', [], [], 0.3);
      saveConsolidation('chat1', [1], 'summary', 'insight');

      const stats = getDashboardMemoryStats('chat1');
      expect(stats.total).toBe(3);
      expect(stats.consolidations).toBe(1);
      expect(stats.avgImportance).toBeCloseTo(0.6, 1);
      expect(stats.importanceDistribution.length).toBeGreaterThan(0);
    });

    it('getDashboardMemoryStats returns zeroes for empty chat', () => {
      const stats = getDashboardMemoryStats('empty');
      expect(stats.total).toBe(0);
      expect(stats.consolidations).toBe(0);
    });

    it('getDashboardLowSalienceMemories returns nothing for fresh memories', () => {
      saveStructuredMemory('chat1', 'raw', 'fresh', [], [], 0.5);
      const fading = getDashboardLowSalienceMemories('chat1', 10);
      // Fresh memory has salience 1.0, threshold is 0.5
      expect(fading).toHaveLength(0);
    });

    it('getDashboardTopAccessedMemories only returns importance >= 0.5', () => {
      saveStructuredMemory('chat1', 'raw', 'low imp', [], [], 0.3);
      saveStructuredMemory('chat1', 'raw', 'high imp', [], [], 0.7);
      const top = getDashboardTopAccessedMemories('chat1', 10);
      expect(top).toHaveLength(1);
      expect(top[0].summary).toBe('high imp');
    });

    it('getDashboardMemoriesList sorts by importance', () => {
      saveStructuredMemory('chat1', 'raw', 'low', [], [], 0.2);
      saveStructuredMemory('chat1', 'raw', 'high', [], [], 0.9);
      saveStructuredMemory('chat1', 'raw', 'mid', [], [], 0.5);

      const result = getDashboardMemoriesList('chat1', 10, 0, 'importance');
      expect(result.total).toBe(3);
      expect(result.memories[0].summary).toBe('high');
      expect(result.memories[1].summary).toBe('mid');
      expect(result.memories[2].summary).toBe('low');
    });

    it('getDashboardMemoriesList supports pagination', () => {
      for (let i = 0; i < 5; i++) {
        saveStructuredMemory('chat1', 'raw', `mem${i}`, [], [], 0.5);
      }
      const page1 = getDashboardMemoriesList('chat1', 2, 0);
      const page2 = getDashboardMemoriesList('chat1', 2, 2);
      expect(page1.memories).toHaveLength(2);
      expect(page2.memories).toHaveLength(2);
      expect(page1.total).toBe(5);
      // No overlap between pages
      const ids1 = page1.memories.map(m => m.id);
      const ids2 = page2.memories.map(m => m.id);
      expect(ids1.filter(id => ids2.includes(id))).toHaveLength(0);
    });

    it('getDashboardMemoryTimeline returns data', () => {
      saveStructuredMemory('chat1', 'raw', 'today', [], [], 0.5);
      const timeline = getDashboardMemoryTimeline('chat1', 30);
      expect(timeline.length).toBeGreaterThanOrEqual(1);
      expect(timeline[0]).toHaveProperty('date');
      expect(timeline[0]).toHaveProperty('count');
    });
  });
});

// ────────────────────────────────────────────────────────────────────
// ccos phase 0 — new tables for war room + meet-cli + skill health
// ────────────────────────────────────────────────────────────────────

describe('ccos phase 0 tables', () => {
  beforeEach(() => {
    _initTestDatabase();
  });

  describe('meet_sessions', () => {
    it('accepts INSERT with all fields and returns row via SELECT', () => {
      const db = _testDb();
      const now = Math.floor(Date.now() / 1000);
      db.prepare(`
        INSERT INTO meet_sessions
          (id, agent_id, meet_url, platform, provider, status, voice_id,
           image_path, brief_path, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'ms-1', 'research', 'https://meet.google.com/abc',
        'google_meet', 'recall', 'joining', 'voice-fr',
        '/tmp/avatar.png', '/tmp/brief.md', now,
      );
      const row = db
        .prepare('SELECT * FROM meet_sessions WHERE id = ?')
        .get('ms-1') as Record<string, unknown>;
      expect(row).toBeDefined();
      expect(row.agent_id).toBe('research');
      expect(row.meet_url).toBe('https://meet.google.com/abc');
      expect(row.provider).toBe('recall');
    });

    it('applies defaults for platform, provider, status when omitted', () => {
      const db = _testDb();
      const now = Math.floor(Date.now() / 1000);
      db.prepare(
        `INSERT INTO meet_sessions (id, agent_id, created_at) VALUES (?, ?, ?)`,
      ).run('ms-2', 'main', now);
      const row = db
        .prepare('SELECT * FROM meet_sessions WHERE id = ?')
        .get('ms-2') as Record<string, unknown>;
      expect(row.platform).toBe('google_meet');
      expect(row.provider).toBe('pika');
      expect(row.status).toBe('joining');
    });

    it('rejects INSERT missing required id or agent_id', () => {
      const db = _testDb();
      const now = Math.floor(Date.now() / 1000);
      expect(() =>
        db
          .prepare(`INSERT INTO meet_sessions (agent_id, created_at) VALUES (?, ?)`)
          .run('main', now),
      ).toThrow();
    });
  });

  describe('warroom_meetings', () => {
    it('accepts INSERT and returns row via SELECT', () => {
      const db = _testDb();
      const now = Math.floor(Date.now() / 1000);
      db.prepare(`
        INSERT INTO warroom_meetings
          (id, started_at, ended_at, duration_s, mode, pinned_agent, entry_count)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('wm-1', now, now + 900, 900, 'direct', 'research', 42);
      const row = db
        .prepare('SELECT * FROM warroom_meetings WHERE id = ?')
        .get('wm-1') as Record<string, unknown>;
      expect(row).toBeDefined();
      expect(row.pinned_agent).toBe('research');
      expect(row.duration_s).toBe(900);
    });

    it('applies defaults mode=direct, pinned_agent=main', () => {
      const db = _testDb();
      const now = Math.floor(Date.now() / 1000);
      db.prepare(
        `INSERT INTO warroom_meetings (id, started_at) VALUES (?, ?)`,
      ).run('wm-2', now);
      const row = db
        .prepare('SELECT * FROM warroom_meetings WHERE id = ?')
        .get('wm-2') as Record<string, unknown>;
      expect(row.mode).toBe('direct');
      expect(row.pinned_agent).toBe('main');
    });
  });

  describe('warroom_transcript', () => {
    it('autoincrements id and stores entries per meeting', () => {
      const db = _testDb();
      const now = Math.floor(Date.now() / 1000);
      db.prepare(`INSERT INTO warroom_meetings (id, started_at) VALUES (?, ?)`).run(
        'wm-1',
        now,
      );
      db.prepare(
        `INSERT INTO warroom_transcript (meeting_id, speaker, text, created_at)
         VALUES (?, ?, ?, ?)`,
      ).run('wm-1', 'user', 'hello world', now);
      db.prepare(
        `INSERT INTO warroom_transcript (meeting_id, speaker, text, created_at)
         VALUES (?, ?, ?, ?)`,
      ).run('wm-1', 'main', 'hi there', now + 1);
      const rows = db
        .prepare('SELECT * FROM warroom_transcript WHERE meeting_id = ? ORDER BY id')
        .all('wm-1') as Record<string, unknown>[];
      expect(rows).toHaveLength(2);
      expect(rows[0].speaker).toBe('user');
      expect(rows[1].speaker).toBe('main');
      expect(rows[1].id).toBeGreaterThan(rows[0].id as number);
    });

    it('requires meeting_id (NOT NULL)', () => {
      const db = _testDb();
      expect(() =>
        db
          .prepare(
            `INSERT INTO warroom_transcript (speaker, text, created_at) VALUES (?, ?, ?)`,
          )
          .run('user', 'orphan', Math.floor(Date.now() / 1000)),
      ).toThrow();
    });
  });

  describe('skill_health', () => {
    it('accepts INSERT with default status=unchecked', () => {
      const db = _testDb();
      const now = Math.floor(Date.now() / 1000);
      db.prepare(
        `INSERT INTO skill_health (skill_id, created_at) VALUES (?, ?)`,
      ).run('mailcheck', now);
      const row = db
        .prepare('SELECT * FROM skill_health WHERE skill_id = ?')
        .get('mailcheck') as Record<string, unknown>;
      expect(row.status).toBe('unchecked');
      expect(row.error_msg).toBeNull();
    });

    it('UPSERT via INSERT OR REPLACE updates last_check and status', () => {
      const db = _testDb();
      const now = Math.floor(Date.now() / 1000);
      db.prepare(
        `INSERT INTO skill_health (skill_id, status, created_at) VALUES (?, ?, ?)`,
      ).run('qonto', 'ok', now);
      db.prepare(
        `INSERT OR REPLACE INTO skill_health
           (skill_id, status, error_msg, last_check, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run('qonto', 'error', 'timeout', now + 10, now);
      const row = db
        .prepare('SELECT * FROM skill_health WHERE skill_id = ?')
        .get('qonto') as Record<string, unknown>;
      expect(row.status).toBe('error');
      expect(row.error_msg).toBe('timeout');
      expect(row.last_check).toBe(now + 10);
    });
  });

  describe('skill_usage', () => {
    it('autoincrements id and tracks invocations per skill', () => {
      const db = _testDb();
      const now = Math.floor(Date.now() / 1000);
      db.prepare(
        `INSERT INTO skill_usage (skill_id, invocations, last_invoked) VALUES (?, ?, ?)`,
      ).run('daily-plan', 1, now);
      db.prepare(
        `INSERT INTO skill_usage (skill_id, invocations, last_invoked) VALUES (?, ?, ?)`,
      ).run('daily-plan', 2, now + 60);
      const rows = db
        .prepare('SELECT * FROM skill_usage WHERE skill_id = ? ORDER BY id')
        .all('daily-plan') as Record<string, unknown>[];
      expect(rows).toHaveLength(2);
      expect(rows[1].invocations).toBe(2);
      expect(rows[1].id).toBeGreaterThan(rows[0].id as number);
    });
  });
});
