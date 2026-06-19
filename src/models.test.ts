import { describe, it, expect } from 'vitest';
import {
  AVAILABLE_MODELS,
  DEFAULT_MODEL,
  DEFAULT_MODEL_LABEL,
  VALID_MODELS,
  HAIKU_MODEL,
  SONNET_MODEL,
  OPUS_MODEL,
  resolveModel,
} from './models.js';

describe('models — cohérence labels <-> ids', () => {
  it('chaque label mappe un id non vide commençant par "claude-"', () => {
    for (const [label, id] of Object.entries(AVAILABLE_MODELS)) {
      expect(id, `label ${label}`).toBeTruthy();
      expect(id.startsWith('claude-'), `label ${label} -> ${id}`).toBe(true);
    }
  });

  it('DEFAULT_MODEL_LABEL pointe vers un id valide', () => {
    expect(AVAILABLE_MODELS[DEFAULT_MODEL_LABEL]).toBe(DEFAULT_MODEL);
    expect(DEFAULT_MODEL.startsWith('claude-')).toBe(true);
  });

  it('VALID_MODELS = valeurs de AVAILABLE_MODELS', () => {
    expect(VALID_MODELS).toEqual(Object.values(AVAILABLE_MODELS));
  });

  it('constantes spécialisées alignées sur le mapping', () => {
    expect(OPUS_MODEL).toBe(AVAILABLE_MODELS.opus);
    expect(SONNET_MODEL).toBe(AVAILABLE_MODELS.sonnet);
    expect(HAIKU_MODEL).toBe(AVAILABLE_MODELS.haiku);
  });
});

describe('models — garde anti-régression (pas d\'IDs périmés)', () => {
  it('opus est claude-opus-4-8 (pas une version périmée)', () => {
    expect(AVAILABLE_MODELS.opus).toBe('claude-opus-4-8');
  });

  it('sonnet est claude-sonnet-4-6 (pas une version périmée)', () => {
    expect(AVAILABLE_MODELS.sonnet).toBe('claude-sonnet-4-6');
  });

  it('haiku est claude-haiku-4-5', () => {
    expect(AVAILABLE_MODELS.haiku).toBe('claude-haiku-4-5');
  });

  it('VALID_MODELS ne contient aucun ID opus/sonnet périmé', () => {
    expect(VALID_MODELS).not.toContain('claude-opus-4-6');
    expect(VALID_MODELS).not.toContain('claude-sonnet-4-5');
  });
});

describe('resolveModel', () => {
  it('résout un label court vers son id', () => {
    expect(resolveModel('opus')).toBe('claude-opus-4-8');
    expect(resolveModel('sonnet')).toBe('claude-sonnet-4-6');
    expect(resolveModel('haiku')).toBe('claude-haiku-4-5');
  });

  it('undefined -> DEFAULT_MODEL', () => {
    expect(resolveModel(undefined)).toBe(DEFAULT_MODEL);
  });

  it('chaîne vide -> DEFAULT_MODEL', () => {
    expect(resolveModel('')).toBe(DEFAULT_MODEL);
  });

  it('id complet renvoyé tel quel', () => {
    expect(resolveModel('claude-haiku-4-5')).toBe('claude-haiku-4-5');
    expect(resolveModel('claude-opus-4-8')).toBe('claude-opus-4-8');
  });

  it('label inconnu non-id -> DEFAULT_MODEL', () => {
    expect(resolveModel('gpt-4')).toBe(DEFAULT_MODEL);
  });
});
