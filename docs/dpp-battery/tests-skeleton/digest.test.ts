// TDD RED PHASE — F-05 Digest Obsidian. Cible : src/dpp/digest.ts
import { describe, it, expect } from 'vitest';

describe('F-05: Digest Obsidian quotidien', () => {
  describe('AC-01/02: note datée, frontmatter conforme, items groupés par pôle', () => {
    it('rend un markdown avec frontmatter (type: veille) et sections par pôle', () => {
      // TODO: renderDigest(items, date) -> markdown
      expect(true).toBe(false); // RED
    });
  });
  describe('AC-03: chaque item affiche source/tier/confiance/date/lien/extrait', () => {
    it('chaque item porte ses métadonnées de fiabilité', () => {
      expect(true).toBe(false); // RED
    });
  });
  describe('AC-04: jour sans nouveauté -> note RAS, jamais d erreur', () => {
    it('liste vide -> note RAS valide', () => {
      expect(true).toBe(false); // RED
    });
  });
  describe('AC-05: écriture non destructive', () => {
    it('n écrase jamais une note existante du vault', () => {
      expect(true).toBe(false); // RED
    });
  });
});
