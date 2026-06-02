// TDD RED PHASE — Service A entrypoint. Cible : src/dpp/veille.ts
import { describe, it, expect } from 'vitest';

describe('Service A: runVeilleDpp() (orchestration)', () => {
  describe('enchaîne collect -> dedup -> score -> persist -> digest -> alert', () => {
    it('produit un digest et déclenche les alertes signal fort', () => {
      expect(true).toBe(false); // RED
    });
  });
  describe('idempotence', () => {
    it('relancé le même jour -> 0 doublon, 0 alerte en double', () => {
      expect(true).toBe(false); // RED
    });
  });
});
