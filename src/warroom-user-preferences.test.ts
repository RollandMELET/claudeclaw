/**
 * Slice 7 — Settings & roster management (RED, TypeScript).
 *
 * Drives the user-preferences helpers:
 *   - loadUserPreferences(path?) : YAML → UserPreferences (empty if file
 *     missing / malformed / empty; never throws).
 *   - saveUserPreferences(prefs, path?) : write-rename atomic. Round-trip.
 *   - applyUserPreferences(baseRoster, prefs) : drop disabled, reorder,
 *     append new Obsidian entries declared via Settings.
 *   - validateNewObsidianInput(form) : server-side validation mirror
 *     for the POST /api/warroom/settings add-agent form. Path traversal,
 *     missing-on-disk, id syntax.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  loadUserPreferences,
  saveUserPreferences,
  applyUserPreferences,
  validateNewObsidianInput,
  type UserPreferences,
  type RosterEntry,
} from './warroom-user-preferences.js';

let tmpDir: string;
let prefsPath: string;

describe('Slice 7 — user preferences (RED)', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'warroom-prefs-'));
    prefsPath = path.join(tmpDir, 'user-preferences.yaml');
  });
  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  // ── loadUserPreferences ──────────────────────────────────────────

  describe('loadUserPreferences()', () => {
    it('returns empty defaults when the YAML file does not exist', () => {
      expect(fs.existsSync(prefsPath)).toBe(false);
      const prefs = loadUserPreferences(prefsPath);
      expect(prefs).toEqual({
        disabled_agents: [],
        order: [],
        added_obsidian_agents: [],
      });
    });

    it('returns empty defaults on empty / malformed YAML', () => {
      fs.writeFileSync(prefsPath, '', 'utf-8');
      expect(loadUserPreferences(prefsPath)).toEqual({
        disabled_agents: [], order: [], added_obsidian_agents: [],
      });
      fs.writeFileSync(prefsPath, '    \n\t\n', 'utf-8');
      expect(loadUserPreferences(prefsPath)).toEqual({
        disabled_agents: [], order: [], added_obsidian_agents: [],
      });
      fs.writeFileSync(prefsPath, ':::not-yaml:::\n- bad', 'utf-8');
      expect(loadUserPreferences(prefsPath)).toEqual({
        disabled_agents: [], order: [], added_obsidian_agents: [],
      });
    });

    it('loads a valid YAML with disabled_agents / order / added entries', () => {
      fs.writeFileSync(
        prefsPath,
        `disabled_agents:
  - research
order:
  - main
  - rc2
  - comms
added_obsidian_agents:
  - id: custom-1
    name: Custom One
    description: My own agent
    vault_root: ~/Vault
    project_folder: Proj/One
    voice: kokoro
`,
        'utf-8',
      );
      const prefs = loadUserPreferences(prefsPath);
      expect(prefs.disabled_agents).toEqual(['research']);
      expect(prefs.order).toEqual(['main', 'rc2', 'comms']);
      expect(prefs.added_obsidian_agents).toHaveLength(1);
      expect(prefs.added_obsidian_agents[0].id).toBe('custom-1');
    });
  });

  // ── saveUserPreferences round-trip ───────────────────────────────

  describe('saveUserPreferences()', () => {
    it('round-trips a payload through save → load', () => {
      const payload: UserPreferences = {
        disabled_agents: ['qonto'],
        order: ['main', 'rorworld-warroom'],
        added_obsidian_agents: [
          {
            id: 'my-vault',
            name: 'My Vault',
            description: 'desc',
            vault_root: '~/Vault',
            project_folder: 'Proj',
            voice: 'kokoro',
          },
        ],
      };
      saveUserPreferences(payload, prefsPath);
      expect(fs.existsSync(prefsPath)).toBe(true);
      const roundTripped = loadUserPreferences(prefsPath);
      expect(roundTripped).toEqual(payload);
    });

    it('does not throw on unwritable path (graceful degrade)', () => {
      expect(() =>
        saveUserPreferences(
          { disabled_agents: [], order: [], added_obsidian_agents: [] },
          '/nonexistent-root-xyz-7777/nested/dir/prefs.yaml',
        ),
      ).not.toThrow();
    });
  });

  // ── applyUserPreferences (roster transform) ──────────────────────

  describe('applyUserPreferences()', () => {
    const BASE: RosterEntry[] = [
      { id: 'main', name: 'Main', description: 'orch' },
      { id: 'research', name: 'Research', description: 'deep' },
      { id: 'comms', name: 'Comms', description: 'mail' },
      { id: 'content', name: 'Content', description: 'write' },
      { id: 'ops', name: 'Ops', description: 'cron' },
      { id: 'rc2', name: 'RC2', description: 'dev' },
    ];

    it('returns the base roster unchanged when prefs are empty', () => {
      const out = applyUserPreferences(BASE, {
        disabled_agents: [], order: [], added_obsidian_agents: [],
      });
      expect(out.map((a) => a.id)).toEqual(['main', 'research', 'comms', 'content', 'ops', 'rc2']);
    });

    it('filters out disabled agents', () => {
      const out = applyUserPreferences(BASE, {
        disabled_agents: ['research', 'qonto-does-not-exist'],
        order: [], added_obsidian_agents: [],
      });
      expect(out.map((a) => a.id)).toEqual(['main', 'comms', 'content', 'ops', 'rc2']);
    });

    it('applies explicit order, keeping unlisted agents at the end in original order', () => {
      const out = applyUserPreferences(BASE, {
        disabled_agents: [],
        order: ['rc2', 'main', 'ops'],
        added_obsidian_agents: [],
      });
      // rc2, main, ops first (from explicit order); then research, comms,
      // content (remaining, in original order).
      expect(out.map((a) => a.id)).toEqual(['rc2', 'main', 'ops', 'research', 'comms', 'content']);
    });

    it('appends added_obsidian_agents after the base roster (not subject to order)', () => {
      const out = applyUserPreferences(BASE, {
        disabled_agents: [],
        order: ['rc2', 'main'],
        added_obsidian_agents: [
          {
            id: 'rorworld-warroom',
            name: 'RoRworld',
            description: 'obs',
            vault_root: '~/V',
            project_folder: 'P',
            voice: 'kokoro',
          },
        ],
      });
      const ids = out.map((a) => a.id);
      // rc2, main first, the rest in original, then rorworld-warroom at the end.
      expect(ids).toEqual(['rc2', 'main', 'research', 'comms', 'content', 'ops', 'rorworld-warroom']);
      // And carries the `origin: 'obsidian'` marker.
      expect(out[out.length - 1].origin).toBe('obsidian');
    });

    it('drops duplicate added_obsidian_agents (id collision with base)', () => {
      const out = applyUserPreferences(BASE, {
        disabled_agents: [],
        order: [],
        added_obsidian_agents: [
          {
            id: 'rc2', // collides with base
            name: 'Fake RC2',
            description: '',
            vault_root: '~/V',
            project_folder: 'P',
            voice: 'kokoro',
          },
        ],
      });
      // Still only one 'rc2' — the base rc2, not the Obsidian imposter.
      const rc2s = out.filter((a) => a.id === 'rc2');
      expect(rc2s).toHaveLength(1);
      expect(rc2s[0].name).toBe('RC2');
    });
  });

  // ── validateNewObsidianInput (server-side form validation) ──────

  describe('validateNewObsidianInput()', () => {
    let vault: string;
    let projInside: string;
    beforeEach(() => {
      vault = path.join(tmpDir, 'VAULT');
      projInside = path.join(vault, 'Proj');
      fs.mkdirSync(projInside, { recursive: true });
    });

    it('accepts a valid form', () => {
      const r = validateNewObsidianInput({
        id: 'valid-id',
        name: 'Valid',
        description: 'ok',
        vault_root: vault,
        project_folder: 'Proj',
        voice: 'kokoro',
      });
      expect(r.ok).toBe(true);
    });

    it('rejects a malformed id (not a-z0-9_-, must start with a letter)', () => {
      const r = validateNewObsidianInput({
        id: '1bad',
        name: 'x', description: '', vault_root: vault, project_folder: 'Proj', voice: 'kokoro',
      });
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/id/i);
    });

    it('rejects missing vault_root or project_folder', () => {
      expect(
        validateNewObsidianInput({
          id: 'valid', name: 'x', description: '', vault_root: '', project_folder: 'Proj', voice: 'kokoro',
        }).ok,
      ).toBe(false);
      expect(
        validateNewObsidianInput({
          id: 'valid', name: 'x', description: '', vault_root: vault, project_folder: '', voice: 'kokoro',
        }).ok,
      ).toBe(false);
    });

    it('rejects a project_folder that escapes vault_root (path traversal)', () => {
      const r = validateNewObsidianInput({
        id: 'evil', name: 'x', description: '', vault_root: vault, project_folder: '../../../etc', voice: 'kokoro',
      });
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/traversal|escape/i);
    });

    it('rejects a project_folder that does not exist on disk', () => {
      const r = validateNewObsidianInput({
        id: 'ghost', name: 'x', description: '', vault_root: vault, project_folder: 'Nope', voice: 'kokoro',
      });
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/exist|found|missing/i);
    });
  });
});
