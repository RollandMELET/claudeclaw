// T1 — F-01 Registre des sources hierarchise. GREEN.
// Cible : src/dpp/sources.ts + config/dpp-sources.yaml
import { describe, it, expect } from 'vitest';

import { getSources, loadRegistry, tierOf, _resetSourcesCache } from '../sources.js';
import { TIERS } from '../types.js';

const VALID_YAML = `
sources:
  - id: src-a
    nom: "Source A"
    url: "https://example.org/a/rss"
    pole: reglementaire
    tier: T1
    methode: eurlex-rss
    frequence: daily
`;

describe('F-01: Registre des sources hierarchise', () => {
  describe('AC-01: chaque source porte id/nom/url/pole/tier/methode/frequence', () => {
    it('charge un registre valide et expose getSources()', () => {
      _resetSourcesCache();
      const sources = getSources();
      expect(sources.length).toBeGreaterThan(0);
      for (const s of sources) {
        expect(s.id).toBeTruthy();
        expect(s.nom).toBeTruthy();
        expect(s.url).toBeTruthy();
        expect(s.pole).toBeTruthy();
        expect(TIERS).toContain(s.tier);
        expect(s.methode).toBeTruthy();
        expect(s.frequence).toBeTruthy();
      }
    });
  });

  describe('AC-02: tiers T1-T4 definis', () => {
    it('tierOf(sourceId) retourne le tier de fiabilite', () => {
      expect(tierOf('eurlex-32023R1542')).toBe('T1');
      expect(tierOf('cen-cenelec-jtc24')).toBe('T2');
    });

    it('tierOf throw sur une source inconnue', () => {
      expect(() => tierOf('source-fantome')).toThrow();
    });
  });

  describe('AC-03: registre versionne, editable sans toucher au code', () => {
    it('charge un registre valide fourni en texte', () => {
      const sources = loadRegistry(VALID_YAML);
      expect(sources).toHaveLength(1);
      expect(sources[0].id).toBe('src-a');
    });

    it('rejette un tier inconnu', () => {
      const bad = VALID_YAML.replace('tier: T1', 'tier: T9');
      expect(() => loadRegistry(bad)).toThrow();
    });

    it('rejette un champ manquant', () => {
      const bad = VALID_YAML.replace('    nom: "Source A"\n', '');
      expect(() => loadRegistry(bad)).toThrow();
    });

    it('rejette une methode inconnue', () => {
      const bad = VALID_YAML.replace('methode: eurlex-rss', 'methode: telepathie');
      expect(() => loadRegistry(bad)).toThrow();
    });

    it('rejette un id duplique', () => {
      const dup = VALID_YAML + VALID_YAML.split('sources:')[1];
      expect(() => loadRegistry(dup)).toThrow();
    });

    it('rejette un couple methode<->url incoherent (eurlex-cellar + url HTML)', () => {
      const bad = VALID_YAML
        .replace('methode: eurlex-rss', 'methode: eurlex-cellar')
        .replace('url: "https://example.org/a/rss"', 'url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R1542"');
      expect(() => loadRegistry(bad)).toThrow(/incoherente|methode/i);
    });

    it('accepte un seed CELLAR coherent avec eurlex-cellar', () => {
      const ok = VALID_YAML
        .replace('methode: eurlex-rss', 'methode: eurlex-cellar')
        .replace('url: "https://example.org/a/rss"', 'url: "cellar:based-on:32023R1542"');
      const sources = loadRegistry(ok);
      expect(sources[0].methode).toBe('eurlex-cellar');
      expect(sources[0].url).toBe('cellar:based-on:32023R1542');
    });
  });

  describe('AC-04: sources MVP T1-T2 presentes', () => {
    it('contient EUR-Lex, ePing, DG ENVI, CEN, JRC, DIN, Battery Pass', () => {
      _resetSourcesCache();
      const ids = getSources().map((s) => s.id);
      expect(ids).toContain('eurlex-32023R1542');
      expect(ids).toContain('eping-omc-batteries');
      expect(ids).toContain('dg-envi-batteries');
      expect(ids).toContain('cen-cenelec-jtc24');
      expect(ids).toContain('jrc-batteries');
      expect(ids).toContain('din-batteries');
      expect(ids).toContain('battery-pass');
    });

    it('toutes les sources MVP sont T1 ou T2', () => {
      _resetSourcesCache();
      for (const s of getSources()) {
        expect(['T1', 'T2']).toContain(s.tier);
      }
    });
  });
});
