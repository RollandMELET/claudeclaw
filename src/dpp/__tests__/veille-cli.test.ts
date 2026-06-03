// T8 — CLI dpp:veille + cablage scheduler. GREEN. Cible : src/dpp/veille-cli.ts
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

import { _initTestDatabase, getAllScheduledTasks, getDatabase } from '../../db.js';
import { openDppTestDb } from '../db.js';
import {
  VEILLE_TASK_ID,
  formatSummary,
  registerVeilleRoutine,
  runVeilleCli,
} from '../veille-cli.js';
import type { RelevanceScorer } from '../scoring.js';
import type { VeilleDeps } from '../veille.js';
import type { Source } from '../types.js';

const SOURCES: Source[] = [
  { id: 'eurlex-32023R1542', nom: 'EUR-Lex', url: 'https://eurlex.test/rss', pole: 'reglementaire', tier: 'T1', methode: 'eurlex-rss', frequence: 'daily' },
];

const RSS = `<rss><channel><item>
  <title>Acte publie au Journal officiel - batteries</title>
  <link>https://eur-lex.europa.eu/eli/reg_del/2024/1234</link>
  <pubDate>Wed, 15 May 2024 10:00:00 GMT</pubDate>
  <description>Empreinte carbone batteries.</description>
</item></channel></rss>`;

const fixedRelevance: RelevanceScorer = async () => 0.9;

describe('T8: CLI dpp:veille', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dpp-cli-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe('declenchement manuel', () => {
    it('runVeilleCli execute un cycle et retourne un resume', async () => {
      const notify = vi.fn(async (_msg: string) => {});
      const deps: VeilleDeps = {
        db: openDppTestDb(),
        sources: SOURCES,
        httpGet: async () => RSS,
        relevance: fixedRelevance,
        notify,
        digestDir: dir,
        date: '2024-05-15',
        now: 1000,
      };
      const summary = await runVeilleCli(deps);
      expect(summary).toContain('1 collectes');
      expect(summary).toContain('1 nouveautes');
      expect(summary).toContain('digest ecrit');
      expect(summary).toContain('1 alerte');
      // effet de bord reel : digest sur disque
      expect(fs.existsSync(path.join(dir, '2024-05-15_VEILLE_DPP-Batterie.md'))).toBe(true);
    });
  });

  describe('formatSummary', () => {
    it('signale les sources en echec et le digest non ecrase', () => {
      const s = formatSummary({
        collected: 3,
        fresh: 0,
        digestPath: '/x/2024-05-15_VEILLE_DPP-Batterie.md',
        digestWritten: false,
        alertsSent: 0,
        errors: [{ sourceId: 'din-batteries', error: 'HTTP 503' }],
      });
      expect(s).toContain('digest deja present');
      expect(s).toContain('1 source(s) en echec');
    });
  });

  describe('cablage scheduler (routine cron)', () => {
    it('registerVeilleRoutine enregistre une tache, idempotent', () => {
      _initTestDatabase();
      expect(getAllScheduledTasks('main').some((t) => t.id === VEILLE_TASK_ID)).toBe(false);

      const first = registerVeilleRoutine('0 7 * * *', 'main');
      expect(first).toBe(true);
      const task = getAllScheduledTasks('main').find((t) => t.id === VEILLE_TASK_ID);
      expect(task).toBeDefined();
      expect(task!.schedule).toBe('0 7 * * *');

      // deuxieme appel : pas de double enregistrement
      const second = registerVeilleRoutine('0 7 * * *', 'main');
      expect(second).toBe(false);
      expect(getAllScheduledTasks('main').filter((t) => t.id === VEILLE_TASK_ID)).toHaveLength(1);
      // la base de test reste accessible
      expect(getDatabase()).toBeDefined();
    });
  });
});
