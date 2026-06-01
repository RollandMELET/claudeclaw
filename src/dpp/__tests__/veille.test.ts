// T7 — Service A entrypoint. GREEN. Cible : src/dpp/veille.ts
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

import { openDppTestDb } from '../db.js';
import { runVeilleDpp, type VeilleDeps } from '../veille.js';
import type { RelevanceScorer } from '../scoring.js';
import type { Source } from '../types.js';

const SOURCES: Source[] = [
  { id: 'eurlex-32023R1542', nom: 'EUR-Lex', url: 'https://eurlex.test/rss', pole: 'reglementaire', tier: 'T1', methode: 'eurlex-rss', frequence: 'daily' },
];

const RSS = `<rss><channel>
  <item>
    <title>Acte publie au Journal officiel - batteries</title>
    <link>https://eur-lex.europa.eu/eli/reg_del/2024/1234</link>
    <pubDate>Wed, 15 May 2024 10:00:00 GMT</pubDate>
    <description>Empreinte carbone batteries.</description>
  </item>
</channel></rss>`;

const fixedRelevance: RelevanceScorer = async () => 0.9;

function makeDeps(over: Partial<VeilleDeps>): VeilleDeps {
  return {
    db: openDppTestDb(),
    sources: SOURCES,
    httpGet: async () => RSS,
    relevance: fixedRelevance,
    notify: vi.fn(async (_msg: string) => {}),
    digestDir: over.digestDir!,
    date: '2024-05-15',
    now: 1000,
    ...over,
  };
}

describe('Service A: runVeilleDpp() (orchestration)', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dpp-veille-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe('enchaine collect -> dedup -> score -> persist -> digest -> alert', () => {
    it('produit un digest et declenche les alertes signal fort', async () => {
      const notify = vi.fn(async (_msg: string) => {});
      const db = openDppTestDb();
      const res = await runVeilleDpp(makeDeps({ db, digestDir: dir, notify }));

      expect(res.collected).toBe(1);
      expect(res.fresh).toBe(1);
      expect(res.digestWritten).toBe(true);
      expect(fs.existsSync(res.digestPath)).toBe(true);
      // signal fort (T1 + marqueur "Journal officiel") -> alerte
      expect(res.alertsSent).toBe(1);
      expect(notify).toHaveBeenCalledTimes(1);

      // persistance : item score en base
      const row = db.prepare('SELECT relevance, strong_signal FROM dpp_items LIMIT 1').get() as {
        relevance: number;
        strong_signal: number;
      };
      expect(row.relevance).toBe(0.9);
      expect(row.strong_signal).toBe(1);
    });
  });

  describe('idempotence', () => {
    it('relance le meme jour -> 0 doublon, 0 alerte en double', async () => {
      const notify = vi.fn(async (_msg: string) => {});
      const db = openDppTestDb();

      const r1 = await runVeilleDpp(makeDeps({ db, digestDir: dir, notify }));
      const r2 = await runVeilleDpp(makeDeps({ db, digestDir: dir, notify }));

      // pas de nouveaute au second passage
      expect(r2.fresh).toBe(0);
      expect(r2.alertsSent).toBe(0);
      expect(r2.digestWritten).toBe(false); // note du jour deja ecrite, pas d'ecrasement

      // une seule ligne en base, une seule alerte, un seul envoi
      const count = db.prepare('SELECT COUNT(*) AS n FROM dpp_items').get() as { n: number };
      expect(count.n).toBe(1);
      const alerts = db.prepare('SELECT COUNT(*) AS n FROM dpp_alerts').get() as { n: number };
      expect(alerts.n).toBe(1);
      expect(notify).toHaveBeenCalledTimes(1);
      expect(r1.alertsSent).toBe(1);
    });
  });
});
