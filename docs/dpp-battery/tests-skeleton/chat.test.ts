// TDD RED PHASE — F-09 Interface chatbot Telegram. Cible : src/dpp/chat.ts
import { describe, it, expect } from 'vitest';

describe('F-09: Interface chatbot Telegram', () => {
  describe('AC-01: commande/intent dédiée sans casser les autres usages', () => {
    it('route une question DPP vers le RAG', () => {
      expect(true).toBe(false); // RED
    });
  });
  describe('AC-02/03: réponse formatée Telegram avec sources + confiance', () => {
    it('formate la réponse avec citations et niveau de confiance', () => {
      expect(true).toBe(false); // RED
    });
  });
});
