// T2 — F-03 Deduplication. GREEN. Cible : src/dpp/dedup.ts
import { describe, it, expect } from 'vitest';

import { openDppTestDb } from '../db.js';
import { contentHash, fingerprint, hasContentChanged, isKnown, markSeen, normalizeUrl } from '../dedup.js';
import type { DppItem } from '../types.js';

function item(over: Partial<DppItem> = {}): DppItem {
  return {
    title: 'Acte delegue 2023/1542',
    sourceId: 'eurlex-32023R1542',
    sourceTier: 'T1',
    url: 'https://eur-lex.europa.eu/eli/reg/2023/1542',
    excerpt: 'extrait',
    content: 'contenu initial',
    ...over,
  };
}

describe('F-03: Deduplication', () => {
  describe('AC-01: empreinte stable (hash url normalisee + title)', () => {
    it('fingerprint() est stable pour le meme item', () => {
      expect(fingerprint(item())).toBe(fingerprint(item()));
    });

    it('normalise l URL (fragment, slash final, casse du host)', () => {
      expect(normalizeUrl('https://EUR-Lex.europa.eu/a/')).toBe(
        normalizeUrl('https://eur-lex.europa.eu/a#section'),
      );
    });

    it('empreinte differente si URL differente', () => {
      expect(fingerprint(item())).not.toBe(fingerprint(item({ url: 'https://eur-lex.europa.eu/autre' })));
    });
  });

  describe('AC-02: un item connu est ignore', () => {
    it('isKnown() vrai apres markSeen()', () => {
      const db = openDppTestDb();
      const it1 = item();
      expect(isKnown(db, fingerprint(it1))).toBe(false);
      markSeen(db, it1, 1000);
      expect(isKnown(db, fingerprint(it1))).toBe(true);
    });

    it('markSeen() deux fois ne cree pas de doublon de ligne', () => {
      const db = openDppTestDb();
      markSeen(db, item(), 1000);
      markSeen(db, item(), 2000);
      const count = db.prepare('SELECT COUNT(*) AS n FROM dpp_items').get() as { n: number };
      expect(count.n).toBe(1);
    });
  });

  describe('AC-03: contenu change sur URL connue = nouvel evenement', () => {
    it('detecte un content_hash different comme nouveaute', () => {
      const db = openDppTestDb();
      const original = item({ content: 'contenu initial' });
      markSeen(db, original, 1000);

      const modifie = item({ content: 'contenu revise' });
      expect(contentHash(modifie)).not.toBe(contentHash(original));
      expect(hasContentChanged(db, modifie)).toBe(true);

      // apres re-enregistrement, plus de changement detecte
      markSeen(db, modifie, 2000);
      expect(hasContentChanged(db, modifie)).toBe(false);
    });

    it('un item inconnu n est pas un "changement" (c est une nouveaute)', () => {
      const db = openDppTestDb();
      expect(hasContentChanged(db, item())).toBe(false);
    });
  });
});
