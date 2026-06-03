// T12 — F-08 Reponse sourcee. GREEN. Cible : src/dpp/answer.ts
import { describe, it, expect, vi } from 'vitest';

import { answerQuestion, citationOf } from '../answer.js';
import type { RetrievedChunk } from '../retrieval.js';

function chunk(over: Partial<RetrievedChunk> = {}): RetrievedChunk {
  return {
    notePath: '005 - Ressource/REGLEMENTS EU/Batteries/Reglement-2023-1542.md',
    chunkText: "L empreinte carbone est obligatoire des fevrier 2025.",
    similarity: 0.9,
    sourceTier: 'T1',
    confidence: 0.85,
    ...over,
  };
}

describe('F-08: Reponse sourcee (anti-hallucination)', () => {
  describe('citationOf', () => {
    it('transforme un chemin de note en wikilink', () => {
      expect(citationOf('a/b/Reglement-2023-1542.md')).toBe('[[Reglement-2023-1542]]');
    });
  });

  describe('AC-02/03: reponse sur passages seuls, citations [[notes]] + confiance', () => {
    it('repond avec citations a une question couverte par le corpus', async () => {
      const llm = vi.fn(async (_p: string) => "L empreinte carbone est requise des 2025 [[Reglement-2023-1542]].");
      const ans = await answerQuestion('Quand l empreinte carbone ?', [chunk()], { llm });

      expect(ans.answered).toBe(true);
      expect(llm).toHaveBeenCalledTimes(1);
      // le prompt ne contient que les passages fournis
      const prompt = llm.mock.calls[0][0];
      expect(prompt).toContain('empreinte carbone est obligatoire');
      expect(ans.citations).toContain('[[Reglement-2023-1542]]');
      expect(ans.confidence).toBeCloseTo(0.85, 3);
    });
  });

  describe('AC-04: dit "je ne sais pas" hors corpus', () => {
    it('aveu d ignorance si aucun passage pertinent (et SANS appeler le LLM)', async () => {
      const llm = vi.fn(async (_p: string) => 'ne devrait pas etre appele');
      const ans = await answerQuestion('question hors sujet', [], { llm });
      expect(ans.answered).toBe(false);
      expect(ans.text).toMatch(/je ne sais pas/i);
      expect(ans.citations).toEqual([]);
      expect(llm).not.toHaveBeenCalled();
    });

    it('passages sous le seuil de confiance -> aveu d ignorance', async () => {
      const llm = vi.fn(async (_p: string) => 'x');
      const ans = await answerQuestion('q', [chunk({ confidence: 0.1 })], { llm, minConfidence: 0.35 });
      expect(ans.answered).toBe(false);
      expect(llm).not.toHaveBeenCalled();
    });
  });
});
