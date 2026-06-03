// TDD RED PHASE — F-07 Indexation corpus. Cible : src/dpp/corpus-index.ts (réutilise embeddings.ts)
import { describe, it, expect } from 'vitest';

describe('F-07: Indexation du corpus (embeddings)', () => {
  describe('AC-01/02: chunk 005+002+digests, embed, upsert dpp_index avec notePath+tier', () => {
    it('indexe une note en chunks avec embeddings', () => {
      expect(true).toBe(false); // RED
    });
  });
  describe('AC-03: incrémental via note_mtime', () => {
    it('ne réindexe pas une note inchangée', () => {
      expect(true).toBe(false); // RED
    });
  });
});
