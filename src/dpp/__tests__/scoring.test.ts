// T4 — F-04 Scoring. GREEN. Cible : src/dpp/scoring.ts (moteur LLM injecte/mockable)
import { describe, it, expect, vi } from 'vitest';

import {
  agreementOf,
  computeConfidence,
  isStrongSignal,
  scoreItem,
  scoreItems,
  tierWeight,
  type RelevanceScorer,
} from '../scoring.js';
import type { DppItem } from '../types.js';

function item(over: Partial<DppItem> = {}): DppItem {
  return {
    title: 'Acte delegue 2023/1542',
    sourceId: 'eurlex-32023R1542',
    sourceTier: 'T1',
    url: 'https://eur-lex.europa.eu/x',
    excerpt: 'extrait',
    theme: 'reglementaire',
    ...over,
  };
}

/** LLM mock : pertinence fixe, traçable. */
const fixedRelevance = (v: number): RelevanceScorer => async () => v;

describe('F-04: Scoring pertinence + confiance + signal fort', () => {
  describe('AC-01: pertinence via moteur LLM mocke', () => {
    it('score la pertinence avec un moteur LLM mocke', async () => {
      const llm = vi.fn(fixedRelevance(0.8));
      const scored = await scoreItem(item(), [item()], { relevance: llm });
      expect(scored.relevance).toBe(0.8);
      expect(llm).toHaveBeenCalledTimes(1);
    });
  });

  describe('AC-02: fiabilite = tier (deterministe, pas LLM)', () => {
    it('reliability provient du tier de la source, sans dependre du LLM', async () => {
      const t1 = await scoreItem(item({ sourceTier: 'T1' }), [], { relevance: fixedRelevance(0.1) });
      const t2 = await scoreItem(item({ sourceTier: 'T2' }), [], { relevance: fixedRelevance(0.9) });
      expect(t1.reliability).toBe('T1');
      expect(t2.reliability).toBe('T2');
      expect(tierWeight('T1')).toBeGreaterThan(tierWeight('T2'));
    });
  });

  describe('AC-03: confiance = tier + pertinence + accord inter-sources', () => {
    it('calcule un score de confiance reproductible', () => {
      const c = computeConfidence({ tier: 'T1', relevance: 0.8, agreement: 0 });
      expect(c).toBe(computeConfidence({ tier: 'T1', relevance: 0.8, agreement: 0 }));
      expect(c).toBeCloseTo(0.5 * 1.0 + 0.35 * 0.8, 3);
    });

    it('un tier plus fiable donne une confiance plus haute (pertinence egale)', () => {
      const t1 = computeConfidence({ tier: 'T1', relevance: 0.6, agreement: 0 });
      const t4 = computeConfidence({ tier: 'T4', relevance: 0.6, agreement: 0 });
      expect(t1).toBeGreaterThan(t4);
    });

    it('accord inter-sources : 2 sources distinctes sur le meme theme -> agreement 1', () => {
      const batch = [
        item({ sourceId: 'eurlex-32023R1542', theme: 'reglementaire' }),
        item({ sourceId: 'eping-omc-batteries', theme: 'reglementaire' }),
      ];
      expect(agreementOf(batch[0], batch)).toBe(1);
      // seul sur son theme -> 0
      expect(agreementOf(item({ theme: 'normalisation' }), batch)).toBe(0);
    });
  });

  describe('AC-04: regle signal fort explicite', () => {
    it('T1 + pertinence haute -> signal fort', () => {
      expect(isStrongSignal('T1', 0.75, 'texte neutre')).toBe(true);
      expect(isStrongSignal('T1', 0.5, 'texte neutre')).toBe(false);
    });

    it('T2 exige une pertinence plus haute', () => {
      expect(isStrongSignal('T2', 0.8, 'texte neutre')).toBe(false);
      expect(isStrongSignal('T2', 0.9, 'texte neutre')).toBe(true);
    });

    it('marqueur d evenement (JO, entree en vigueur) -> signal fort sur T1/T2', () => {
      expect(isStrongSignal('T2', 0.3, 'Acte publie au Journal officiel')).toBe(true);
      expect(isStrongSignal('T1', 0.1, "entree en vigueur le 18 fevrier 2027")).toBe(true);
      // tier faible : pas de signal fort meme avec marqueur
      expect(isStrongSignal('T4', 0.1, 'publie au Journal officiel')).toBe(false);
    });
  });

  describe('AC-05: scoring testable deterministe (fixtures -> scores attendus)', () => {
    it('scoreItems applique pertinence + tier + signal fort sur un lot', async () => {
      const batch = [
        item({ sourceId: 'eurlex-32023R1542', sourceTier: 'T1', theme: 'reglementaire' }),
        item({ sourceId: 'din-batteries', sourceTier: 'T2', theme: 'normalisation', title: 'Note technique' }),
      ];
      const scored = await scoreItems(batch, { relevance: fixedRelevance(0.75) });
      expect(scored[0].reliability).toBe('T1');
      expect(scored[0].strongSignal).toBe(true); // T1 + 0.75
      expect(scored[1].reliability).toBe('T2');
      expect(scored[1].strongSignal).toBe(false); // T2 + 0.75 sans marqueur
      // deterministe : re-run identique
      const again = await scoreItems(batch, { relevance: fixedRelevance(0.75) });
      expect(again).toEqual(scored);
    });
  });
});
