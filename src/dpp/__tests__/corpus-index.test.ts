// T10 — F-07 Indexation corpus. GREEN. Cible : src/dpp/corpus-index.ts (reutilise embeddings.ts)
import { describe, it, expect, vi } from 'vitest';

import { openDppTestDb } from '../db.js';
import {
  blobToEmbedding,
  chunkText,
  embeddingToBlob,
  indexCorpus,
  type CorpusFile,
  type Embedder,
} from '../corpus-index.js';

/** Embedder mock deterministe : longueur du texte sur 3 dims. */
const mockEmbed: Embedder = async (t: string) => [t.length, t.length % 7, 1];

function file(over: Partial<CorpusFile> = {}): CorpusFile {
  return {
    path: '005 - Ressource/REGLEMENTS EU/Batteries/note.md',
    content: 'Le passeport numerique de batterie est requis au 18 fevrier 2027.',
    mtime: 1000,
    tier: 'T1',
    ...over,
  };
}

describe('F-07: Indexation du corpus (embeddings)', () => {
  describe('chunkText', () => {
    it('decoupe un texte long en chunks chevauchants', () => {
      const chunks = chunkText('a'.repeat(2500), 1000, 200);
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0].offset).toBe(0);
      expect(chunks[1].offset).toBe(800); // step = size - overlap
    });

    it('texte court -> un seul chunk', () => {
      expect(chunkText('court', 1000, 200)).toEqual([{ text: 'court', offset: 0 }]);
    });
  });

  describe('serialisation embedding <-> blob', () => {
    it('round-trip Float32', () => {
      const v = [1.5, -2.25, 3];
      expect(blobToEmbedding(embeddingToBlob(v))).toEqual(v);
    });
  });

  describe('AC-01/02: chunk + embed + upsert dpp_index avec notePath + tier', () => {
    it('indexe une note en chunks avec embeddings', async () => {
      const db = openDppTestDb();
      const res = await indexCorpus(db, [file()], { embed: mockEmbed });
      expect(res.indexed).toBe(1);
      expect(res.chunks).toBeGreaterThanOrEqual(1);

      const rows = db.prepare('SELECT note_path, source_tier, embedding FROM dpp_index').all() as {
        note_path: string;
        source_tier: string;
        embedding: Buffer;
      }[];
      expect(rows[0].note_path).toContain('REGLEMENTS EU/Batteries');
      expect(rows[0].source_tier).toBe('T1');
      expect(blobToEmbedding(rows[0].embedding).length).toBe(3);
    });
  });

  describe('AC-03: incremental via note_mtime', () => {
    it('ne reindexe pas une note inchangee', async () => {
      const db = openDppTestDb();
      const embed = vi.fn(mockEmbed);
      await indexCorpus(db, [file({ mtime: 1000 })], { embed });
      const callsAfterFirst = embed.mock.calls.length;

      const res = await indexCorpus(db, [file({ mtime: 1000 })], { embed });
      expect(res.skipped).toBe(1);
      expect(res.indexed).toBe(0);
      expect(embed.mock.calls.length).toBe(callsAfterFirst); // pas de re-embed
    });

    it('reindexe si note_mtime change (et remplace les anciens chunks)', async () => {
      const db = openDppTestDb();
      await indexCorpus(db, [file({ mtime: 1000 })], { embed: mockEmbed });
      await indexCorpus(db, [file({ mtime: 2000, content: 'Contenu revise.' })], { embed: mockEmbed });

      const rows = db.prepare('SELECT DISTINCT note_mtime FROM dpp_index').all() as { note_mtime: number }[];
      expect(rows).toEqual([{ note_mtime: 2000 }]); // anciens chunks remplaces
    });
  });
});
