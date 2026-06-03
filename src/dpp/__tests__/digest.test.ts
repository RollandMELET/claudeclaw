// T5 — F-05 Digest Obsidian. GREEN. Cible : src/dpp/digest.ts
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, it, expect } from 'vitest';

import { digestFilename, renderDigest, writeDigest } from '../digest.js';
import type { ScoredItem } from '../types.js';

function scored(over: Partial<ScoredItem> = {}): ScoredItem {
  return {
    title: 'Acte delegue 2024/1234',
    sourceId: 'eurlex-32023R1542',
    sourceTier: 'T1',
    url: 'https://eur-lex.europa.eu/x',
    publishedAt: '2024-05-15T10:00:00.000Z',
    excerpt: 'Methodologie empreinte carbone.',
    theme: 'reglementaire',
    relevance: 0.8,
    reliability: 'T1',
    confidence: 0.83,
    strongSignal: true,
    ...over,
  };
}

describe('F-05: Digest Obsidian quotidien', () => {
  describe('AC-01/02: note datee, frontmatter conforme, items groupes par pole', () => {
    it('rend un markdown avec frontmatter (type: veille) et sections par pole', () => {
      const md = renderDigest(
        [scored({ theme: 'reglementaire' }), scored({ theme: 'normalisation', sourceId: 'din-batteries', reliability: 'T2' })],
        '2024-05-15',
      );
      expect(md).toMatch(/^---\n/);
      expect(md).toContain('type: veille');
      expect(md).toContain('created: 2024-05-15');
      expect(md).toContain('## normalisation');
      expect(md).toContain('## reglementaire');
    });
  });

  describe('AC-03: chaque item affiche source/tier/confiance/date/lien/extrait', () => {
    it('chaque item porte ses metadonnees de fiabilite', () => {
      const md = renderDigest([scored()], '2024-05-15');
      expect(md).toContain('[Acte delegue 2024/1234](https://eur-lex.europa.eu/x)'); // lien
      expect(md).toContain('eurlex-32023R1542 (T1)'); // source + tier
      expect(md).toContain('Confiance : 83 %'); // confiance
      expect(md).toContain('Date : 2024-05-15T10:00:00.000Z'); // date
      expect(md).toContain('Extrait : Methodologie empreinte carbone.'); // extrait
      expect(md).toContain('🔴'); // marqueur signal fort
    });

    it('pas de tirets longs dans le rendu', () => {
      const md = renderDigest([scored()], '2024-05-15');
      expect(md).not.toMatch(/[—–]/);
    });
  });

  describe('AC-04: jour sans nouveaute -> note RAS, jamais d erreur', () => {
    it('liste vide -> note RAS valide', () => {
      const md = renderDigest([], '2024-05-15');
      expect(md).toContain('type: veille');
      expect(md).toContain('items: 0');
      expect(md).toMatch(/RAS/i);
    });
  });

  describe('AC-05: ecriture non destructive', () => {
    let dir: string;
    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dpp-digest-'));
    });
    afterEach(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });

    it('ecrit une nouvelle note datee', () => {
      const res = writeDigest([scored()], '2024-05-15', dir);
      expect(res.written).toBe(true);
      expect(fs.existsSync(res.path)).toBe(true);
      expect(path.basename(res.path)).toBe(digestFilename('2024-05-15'));
    });

    it('n ecrase jamais une note existante du vault', () => {
      const filePath = path.join(dir, digestFilename('2024-05-15'));
      fs.writeFileSync(filePath, 'CONTENU MANUEL A PRESERVER', 'utf-8');
      const res = writeDigest([scored()], '2024-05-15', dir);
      expect(res.written).toBe(false);
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('CONTENU MANUEL A PRESERVER');
    });
  });
});
