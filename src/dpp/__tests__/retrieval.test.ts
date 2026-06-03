// T11 — F-08 Retrieval. GREEN. Cible : src/dpp/retrieval.ts (cosineSimilarity)
import { describe, it, expect } from 'vitest';

import { openDppTestDb } from '../db.js';
import { indexCorpus, type CorpusFile, type Embedder } from '../corpus-index.js';
import { retrieve, retrievalConfidence } from '../retrieval.js';

/**
 * Embedder mock : vecteurs fixes par mot-cle pour controler la similarite.
 * "passeport" et la requete partagent une direction ; "recyclage" est orthogonal.
 */
const VECTORS: Record<string, number[]> = {
  passeport: [1, 0, 0],
  recyclage: [0, 1, 0],
  query: [1, 0, 0],
};
const mockEmbed: Embedder = async (t: string) => {
  if (t === 'ma question') return VECTORS.query;
  if (t.includes('passeport')) return VECTORS.passeport;
  if (t.includes('recyclage')) return VECTORS.recyclage;
  return [0, 0, 1];
};

const files: CorpusFile[] = [
  { path: 'note-passeport.md', content: 'passeport numerique batterie', mtime: 1, tier: 'T1' },
  { path: 'note-recyclage.md', content: 'recyclage des batteries', mtime: 1, tier: 'T2' },
];

describe('F-08: Retrieval semantique', () => {
  describe('AC-01: cosineSimilarity top-k sur l index', () => {
    it('retourne les chunks les plus proches, ordonnes', async () => {
      const db = openDppTestDb();
      await indexCorpus(db, files, { embed: mockEmbed });

      const results = await retrieve(db, 'ma question', { embed: mockEmbed, k: 2 });
      expect(results).toHaveLength(2);
      expect(results[0].notePath).toBe('note-passeport.md'); // plus proche en tete
      expect(results[0].similarity).toBeGreaterThan(results[1].similarity);
    });

    it('respecte k et minSimilarity', async () => {
      const db = openDppTestDb();
      await indexCorpus(db, files, { embed: mockEmbed });
      const top1 = await retrieve(db, 'ma question', { embed: mockEmbed, k: 1 });
      expect(top1).toHaveLength(1);

      const filtered = await retrieve(db, 'ma question', { embed: mockEmbed, minSimilarity: 0.5 });
      expect(filtered.every((c) => c.similarity >= 0.5)).toBe(true);
      expect(filtered.map((c) => c.notePath)).toEqual(['note-passeport.md']); // recyclage orthogonal exclu
    });
  });

  describe('AC-03: confiance derivee de similarite + tier', () => {
    it('calcule un niveau de confiance coherent', () => {
      // tier plus fiable -> confiance plus haute a similarite egale
      expect(retrievalConfidence(0.9, 'T1')).toBeGreaterThan(retrievalConfidence(0.9, 'T4'));
      // similarite plus haute -> confiance plus haute a tier egal
      expect(retrievalConfidence(0.9, 'T1')).toBeGreaterThan(retrievalConfidence(0.2, 'T1'));
      // bornee [0,1]
      const c = retrievalConfidence(1, 'T1');
      expect(c).toBeLessThanOrEqual(1);
      expect(c).toBeGreaterThanOrEqual(0);
    });
  });
});
