// TDD RED PHASE — F-08 Réponse sourcée. Cible : src/dpp/answer.ts
import { describe, it, expect } from 'vitest';

describe('F-08: Réponse sourcée (anti-hallucination)', () => {
  describe('AC-02/03: réponse sur passages seuls, citations [[notes]] + confiance', () => {
    it('répond avec citations à une question couverte par le corpus', () => {
      expect(true).toBe(false); // RED
    });
  });
  describe('AC-04: dit "je ne sais pas" hors corpus', () => {
    it('aveu d ignorance si aucun passage pertinent', () => {
      expect(true).toBe(false); // RED
    });
  });
});
