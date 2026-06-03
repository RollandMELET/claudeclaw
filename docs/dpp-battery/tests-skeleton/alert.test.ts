// TDD RED PHASE — F-06 Alerte Telegram. Cible : src/dpp/alert.ts (réutilise notify.sh)
import { describe, it, expect } from 'vitest';

describe('F-06: Alerte Telegram sur signal fort', () => {
  describe('AC-01/02: message titre+source+tier+raison+lien via canal existant', () => {
    it('formate et envoie une alerte sur signal fort', () => {
      // TODO: sendAlerts(items, {notify: mockNotify})
      expect(true).toBe(false); // RED
    });
  });
  describe('AC-03: anti-spam + dédup des alertes', () => {
    it('item ordinaire -> 0 alerte ; signal déjà notifié -> 0 alerte', () => {
      expect(true).toBe(false); // RED
    });
  });
  describe('AC-04: plusieurs signaux -> un seul message groupé', () => {
    it('groupe les signaux forts du même cycle', () => {
      expect(true).toBe(false); // RED
    });
  });
});
