import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { gatherCorpus, loadCorpusConfig, walkMarkdown } from '../index-cli.js';

describe('loadCorpusConfig', () => {
  it('parse les dossiers et leur tier', () => {
    const cfg = loadCorpusConfig('corpus:\n  - path: "a/b"\n    tier: T1\n  - path: "c"\n    tier: T2\n');
    expect(cfg.folders).toEqual([
      { path: 'a/b', tier: 'T1' },
      { path: 'c', tier: 'T2' },
    ]);
  });

  it('tier T2 par defaut si absent', () => {
    const cfg = loadCorpusConfig('corpus:\n  - path: "a"\n');
    expect(cfg.folders[0].tier).toBe('T2');
  });

  it('exclude par defaut = _archive', () => {
    const cfg = loadCorpusConfig('corpus:\n  - path: "a"\n');
    expect(cfg.exclude).toEqual(['_archive']);
  });

  it('exclude personnalise respecte', () => {
    const cfg = loadCorpusConfig('corpus:\n  - path: "a"\nexclude:\n  - x\n  - y\n');
    expect(cfg.exclude).toEqual(['x', 'y']);
  });

  it('throw si cle corpus manquante', () => {
    expect(() => loadCorpusConfig('autre: 1\n')).toThrow(/corpus/);
  });

  it('throw si tier inconnu', () => {
    expect(() => loadCorpusConfig('corpus:\n  - path: "a"\n    tier: T9\n')).toThrow(/tier inconnu/);
  });
});

describe('walkMarkdown / gatherCorpus', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dpp-corpus-'));
    fs.writeFileSync(path.join(dir, 'note1.md'), '# Note 1\nContenu un.');
    fs.writeFileSync(path.join(dir, 'note2.MD'), '# Note 2\nContenu deux.');
    fs.writeFileSync(path.join(dir, 'ignore.txt'), 'pas du markdown');
    fs.mkdirSync(path.join(dir, 'sub'));
    fs.writeFileSync(path.join(dir, 'sub', 'note3.md'), '# Note 3\nContenu trois.');
    fs.mkdirSync(path.join(dir, '_archive'));
    fs.writeFileSync(path.join(dir, '_archive', 'old.md'), '# Old\nA ignorer.');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('liste les .md recursivement, ignore non-md et dossiers exclus', () => {
    const files = walkMarkdown(dir, ['_archive']).map((f) => path.basename(f)).sort();
    expect(files).toEqual(['note1.md', 'note2.MD', 'note3.md']);
  });

  it('dossier absent -> liste vide, pas d erreur', () => {
    expect(walkMarkdown(path.join(dir, 'nexistepas'), [])).toEqual([]);
  });

  it('gatherCorpus assigne le tier du dossier et lit le contenu', () => {
    const base = path.basename(dir);
    const root = path.dirname(dir);
    const files = gatherCorpus(root, [{ path: base, tier: 'T1' }], ['_archive']);
    expect(files.length).toBe(3);
    expect(files.every((f) => f.tier === 'T1')).toBe(true);
    expect(files.every((f) => f.content.length > 0)).toBe(true);
    expect(files.every((f) => typeof f.mtime === 'number')).toBe(true);
  });
});
