// T6 — F-06 Alerte Telegram. GREEN. Cible : src/dpp/alert.ts (reutilise notify.sh)
import { describe, it, expect, vi } from 'vitest';

import { openDppTestDb } from '../db.js';
import { sendAlerts, formatAlert, type AlertItem } from '../alert.js';

let nextId = 1;
function alertItem(over: Partial<AlertItem> = {}): AlertItem {
  return {
    id: nextId++,
    title: 'Acte publie au Journal officiel',
    sourceId: 'eurlex-32023R1542',
    sourceTier: 'T1',
    url: 'https://eur-lex.europa.eu/x',
    excerpt: 'extrait',
    theme: 'reglementaire',
    relevance: 0.9,
    reliability: 'T1',
    confidence: 0.85,
    strongSignal: true,
    ...over,
  };
}

describe('F-06: Alerte Telegram sur signal fort', () => {
  describe('AC-01/02: message titre+source+tier+raison+lien via canal injecte', () => {
    it('formate et envoie une alerte sur signal fort', async () => {
      const db = openDppTestDb();
      const notify = vi.fn(async (_msg: string) => {});
      const item = alertItem({ id: 100 });
      const res = await sendAlerts(db, [item], { notify, now: 1000 });

      expect(res.sent).toBe(1);
      expect(notify).toHaveBeenCalledTimes(1);
      const msg = notify.mock.calls[0][0];
      expect(msg).toContain(item.title);
      expect(msg).toContain('eurlex-32023R1542 (T1)');
      expect(msg).toContain('Pourquoi :');
      expect(msg).toContain(item.url);
      // marqueur persiste
      const row = db.prepare('SELECT item_id FROM dpp_alerts WHERE item_id = 100').get();
      expect(row).toBeDefined();
    });
  });

  describe('AC-03: anti-spam + dedup des alertes', () => {
    it('item ordinaire (pas signal fort) -> 0 alerte', async () => {
      const db = openDppTestDb();
      const notify = vi.fn(async (_msg: string) => {});
      const res = await sendAlerts(db, [alertItem({ strongSignal: false })], { notify });
      expect(res.sent).toBe(0);
      expect(notify).not.toHaveBeenCalled();
    });

    it('signal deja notifie -> 0 alerte au second passage', async () => {
      const db = openDppTestDb();
      const notify = vi.fn(async (_msg: string) => {});
      const item = alertItem({ id: 200 });
      await sendAlerts(db, [item], { notify, now: 1000 });
      const res2 = await sendAlerts(db, [item], { notify, now: 2000 });
      expect(res2.sent).toBe(0);
      expect(notify).toHaveBeenCalledTimes(1); // pas de second envoi
    });
  });

  describe('AC-04: plusieurs signaux -> un seul message groupe', () => {
    it('groupe les signaux forts du meme cycle', async () => {
      const db = openDppTestDb();
      const notify = vi.fn(async (_msg: string) => {});
      const items = [
        alertItem({ id: 301, title: 'Acte delegue empreinte carbone' }),
        alertItem({ id: 302, title: 'Norme finalisee batteries', sourceId: 'din-batteries', sourceTier: 'T2', reliability: 'T2' }),
      ];
      const res = await sendAlerts(db, items, { notify, now: 1000 });
      expect(res.sent).toBe(2);
      expect(notify).toHaveBeenCalledTimes(1); // un seul message
      const msg = notify.mock.calls[0][0];
      expect(msg).toContain('2 signaux forts');
      expect(msg).toContain('Acte delegue empreinte carbone');
      expect(msg).toContain('Norme finalisee batteries');
    });
  });

  describe('formatAlert: pas de tirets longs', () => {
    it('rendu sans tiret long', () => {
      const msg = formatAlert([alertItem()]);
      expect(msg).not.toMatch(/[—–]/);
    });
  });
});
