// TDD RED PHASE — F-02 Collecte multi-source. Cible : src/dpp/collect.ts + collectors/*
import { describe, it, expect } from 'vitest';

describe('F-02: Collecte multi-source', () => {
  describe('AC-01: items normalisés {title, source, tier, url, date, excerpt, theme}', () => {
    it('normalise un item EUR-Lex (fixture HTTP)', () => {
      // TODO: collecteur eurlex -> DppItem normalisé
      expect(true).toBe(false); // RED
    });
  });
  describe('AC-02: un collecteur par méthode MVP (EUR-Lex, ePing, scraping)', () => {
    it('collecte ePing (fixture API) et page institutionnelle (fixture HTML)', () => {
      expect(true).toBe(false); // RED
    });
  });
  describe('AC-03: isolation des erreurs', () => {
    it('un collecteur en échec n arrête pas les autres', () => {
      // TODO: collecteur qui throw -> log + autres items retournés
      expect(true).toBe(false); // RED
    });
  });
  describe('AC-04: déclenchable manuel + cron', () => {
    it('collect() exécutable à la demande', () => {
      expect(true).toBe(false); // RED
    });
  });
});
