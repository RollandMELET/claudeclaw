// TDD RED PHASE — F-03 Déduplication. Cible : src/dpp/dedup.ts
import { describe, it, expect } from 'vitest';

describe('F-03: Déduplication', () => {
  describe('AC-01: empreinte stable (hash url normalisée + title)', () => {
    it('fingerprint() est stable pour le même item', () => {
      // TODO: fingerprint(item) === fingerprint(item)
      expect(true).toBe(false); // RED
    });
  });
  describe('AC-02: un item connu est ignoré', () => {
    it('isKnown() vrai après markSeen()', () => {
      expect(true).toBe(false); // RED
    });
  });
  describe('AC-03: contenu changé sur URL connue = nouvel événement', () => {
    it('détecte un content_hash différent comme nouveauté', () => {
      expect(true).toBe(false); // RED
    });
  });
});
