// T13 — F-09 Interface chatbot Telegram. GREEN. Cible : src/dpp/chat.ts
import { describe, it, expect, vi } from 'vitest';

import { openDppTestDb } from '../db.js';
import { indexCorpus, type CorpusFile, type Embedder } from '../corpus-index.js';
import { handleDppChat, isDppQuestion, stripCommand } from '../chat.js';

const VEC = [1, 0, 0];
const mockEmbed: Embedder = async () => VEC; // tout colle a l unique chunk indexe

const files: CorpusFile[] = [
  { path: 'Reglement-2023-1542.md', content: 'passeport numerique batterie obligatoire 2027', mtime: 1, tier: 'T1' },
];

describe('F-09: Interface chatbot Telegram', () => {
  describe('AC-01: intent dedie sans casser les autres usages', () => {
    it('route une question DPP vers le RAG (commande ou mot-cle)', () => {
      expect(isDppQuestion('/dpp quand le passeport ?')).toBe(true);
      expect(isDppQuestion('parle-moi du DPP batterie')).toBe(true);
      // messages ordinaires NON routes
      expect(isDppQuestion('quelle est la meteo demain ?')).toBe(false);
      expect(isDppQuestion('rappelle-moi d appeler Paul')).toBe(false);
    });

    it('stripCommand retire le prefixe /dpp', () => {
      expect(stripCommand('/dpp ma question')).toBe('ma question');
    });
  });

  describe('AC-02/03: reponse formatee Telegram avec sources + confiance', () => {
    it('formate la reponse avec citations et niveau de confiance', async () => {
      const db = openDppTestDb();
      await indexCorpus(db, files, { embed: mockEmbed });
      const llm = vi.fn(async (_p: string) => 'Le passeport est obligatoire en 2027 [[Reglement-2023-1542]].');

      const out = await handleDppChat('/dpp quand le passeport ?', { db, embed: mockEmbed, llm });
      expect(out).toContain('2027');
      expect(out).toContain('Sources : [[Reglement-2023-1542]]');
      expect(out).toMatch(/Confiance : (haute|moyenne|faible)/);
    });

    it('hors corpus -> message d ignorance, confiance hors corpus', async () => {
      const db = openDppTestDb(); // index vide
      const llm = vi.fn(async (_p: string) => 'ne doit pas etre appele');
      const out = await handleDppChat('/dpp question sans corpus', { db, embed: mockEmbed, llm });
      expect(out).toMatch(/je ne sais pas/i);
      expect(out).toContain('aucune (hors corpus)');
      expect(llm).not.toHaveBeenCalled();
    });
  });
});
