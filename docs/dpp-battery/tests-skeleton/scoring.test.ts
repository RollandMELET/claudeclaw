// TDD RED PHASE — F-04 Scoring. Cible : src/dpp/scoring.ts (moteur LLM injecté/mockable)
import { describe, it, expect } from 'vitest';

describe('F-04: Scoring pertinence + confiance + signal fort', () => {
  describe('AC-01: pertinence via Claude CLI contre profil DPP batterie', () => {
    it('score la pertinence avec un moteur LLM mocké', () => {
      // TODO: scoreItem(item, {llm: mockLLM}) -> relevance attendue
      expect(true).toBe(false); // RED
    });
  });
  describe('AC-02: fiabilité = tier (déterministe, pas LLM)', () => {
    it('reliability provient du tier de la source, sans appel LLM', () => {
      expect(true).toBe(false); // RED
    });
  });
  describe('AC-03: confiance = tier + pertinence + accord inter-sources', () => {
    it('calcule un score de confiance reproductible', () => {
      expect(true).toBe(false); // RED
    });
  });
  describe('AC-04: règle signal fort explicite', () => {
    it('marque signal fort sur acte publié JO / norme finalisée / T1-T2 + pertinence haute', () => {
      expect(true).toBe(false); // RED
    });
  });
  describe('AC-05: scoring testable déterministe (LLM mockable)', () => {
    it('fixtures items -> scores attendus', () => {
      expect(true).toBe(false); // RED
    });
  });
});
