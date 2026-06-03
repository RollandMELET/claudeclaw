// TDD RED PHASE — F-01 Registre des sources. Ne pas modifier les expect(false) avant d'avoir le code.
// Cible : src/dpp/sources.ts + config/dpp-sources.yaml
import { describe, it, expect } from 'vitest';

describe('F-01: Registre des sources hiérarchisé', () => {
  describe('AC-01: chaque source porte id/nom/url/pole/tier/méthode/fréquence', () => {
    it('charge un registre valide et expose getSources()', () => {
      // TODO: getSources() depuis config/dpp-sources.yaml
      expect(true).toBe(false); // RED
    });
  });
  describe('AC-02: tiers T1-T4 définis', () => {
    it('tierOf(sourceId) retourne le tier de fiabilité', () => {
      // TODO: tierOf('eurlex-32023R1542') === 'T1'
      expect(true).toBe(false); // RED
    });
  });
  describe('AC-03: registre versionné, éditable sans toucher au code', () => {
    it('rejette un registre invalide (tier inconnu, champ manquant)', () => {
      // TODO: validation schema -> throw sur registre malformé
      expect(true).toBe(false); // RED
    });
  });
  describe('AC-04: sources MVP T1-T2 présentes', () => {
    it('contient EUR-Lex, ePing, DG ENVI, CEN, JRC, DIN, Battery Pass', () => {
      expect(true).toBe(false); // RED
    });
  });
});
