/**
 * Slice 5 — Obsidian agents wrapper (RED, TypeScript side).
 *
 * The TypeScript loader reads config/obsidian-agents.yaml and returns
 * a list of { id, name, description, cwd } entries that the dashboard
 * exposes via GET /api/warroom/agents alongside the 6 existing dirs.
 *
 * These tests drive:
 *   - Absent/empty YAML → returns [] (no error).
 *   - Valid YAML → returns the merged entries with absolute cwd.
 *   - Path traversal guard: project_folder with ".." must not escape
 *     the resolved vault_root (rejected with warning, entry skipped).
 *
 * Also tests the voice-bridge CLI arg parser gains a --cwd flag.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  loadObsidianAgents,
  parseVoiceBridgeArgs,
} from './warroom-obsidian-agents.js';

let tmpDir: string;
let tmpVault: string;

describe('Slice 5 — Obsidian agents loader (RED)', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'obsidian-agents-'));
    // Minimal fake vault layout so path validation has something real.
    tmpVault = path.join(tmpDir, 'VAULT');
    fs.mkdirSync(path.join(tmpVault, 'Projects', 'RoR'), { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  describe('loadObsidianAgents()', () => {
    it('returns [] when the YAML file does not exist', () => {
      const missing = path.join(tmpDir, 'nope.yaml');
      expect(loadObsidianAgents(missing)).toEqual([]);
    });

    it('returns [] when the YAML is empty', () => {
      const p = path.join(tmpDir, 'empty.yaml');
      fs.writeFileSync(p, '', 'utf-8');
      expect(loadObsidianAgents(p)).toEqual([]);
    });

    it('returns [] when the YAML lacks the obsidian_agents root key', () => {
      const p = path.join(tmpDir, 'malformed.yaml');
      fs.writeFileSync(p, 'something_else: {}\n', 'utf-8');
      expect(loadObsidianAgents(p)).toEqual([]);
    });

    it('parses a valid YAML into agent entries with absolute cwd', () => {
      const yamlPath = path.join(tmpDir, 'obsidian-agents.yaml');
      fs.writeFileSync(
        yamlPath,
        `obsidian_agents:
  rorworld-warroom:
    name: RoRworld Admin
    description: Administration RoRworld, compta, refacturation GS1
    vault_root: ${tmpVault}
    project_folder: Projects/RoR
    voice: kokoro
    avatar: rorworld.png
    model: sonnet
`,
        'utf-8',
      );

      const agents = loadObsidianAgents(yamlPath);
      expect(agents).toHaveLength(1);
      expect(agents[0]).toMatchObject({
        id: 'rorworld-warroom',
        name: 'RoRworld Admin',
        description: 'Administration RoRworld, compta, refacturation GS1',
        voice: 'kokoro',
        avatar: 'rorworld.png',
        model: 'sonnet',
      });
      // cwd is absolute and points inside the vault.
      expect(path.isAbsolute(agents[0].cwd)).toBe(true);
      expect(agents[0].cwd).toBe(path.join(tmpVault, 'Projects', 'RoR'));
    });

    it('skips an entry whose project_folder resolves outside vault_root (path traversal guard)', () => {
      const yamlPath = path.join(tmpDir, 'traversal.yaml');
      fs.writeFileSync(
        yamlPath,
        `obsidian_agents:
  evil:
    name: Evil
    description: tries to escape
    vault_root: ${tmpVault}
    project_folder: ../../../etc
    voice: kokoro
    avatar: evil.png
`,
        'utf-8',
      );
      const agents = loadObsidianAgents(yamlPath);
      // The traversal entry is dropped; no crash.
      expect(agents).toEqual([]);
    });

    it('skips an entry whose resolved cwd does not exist on disk', () => {
      const yamlPath = path.join(tmpDir, 'missing-folder.yaml');
      fs.writeFileSync(
        yamlPath,
        `obsidian_agents:
  ghost:
    name: Ghost
    description: nonexistent folder
    vault_root: ${tmpVault}
    project_folder: does-not-exist
    voice: kokoro
    avatar: ghost.png
`,
        'utf-8',
      );
      expect(loadObsidianAgents(yamlPath)).toEqual([]);
    });

    it('returns multiple valid entries while dropping invalid ones', () => {
      // Second valid folder
      fs.mkdirSync(path.join(tmpVault, 'Projects', 'Other'));
      const yamlPath = path.join(tmpDir, 'mixed.yaml');
      fs.writeFileSync(
        yamlPath,
        `obsidian_agents:
  valid-a:
    name: Valid A
    description: first
    vault_root: ${tmpVault}
    project_folder: Projects/RoR
    voice: kokoro
    avatar: a.png
  evil:
    name: Evil
    description: tries to escape
    vault_root: ${tmpVault}
    project_folder: ../../etc
    voice: kokoro
    avatar: evil.png
  valid-b:
    name: Valid B
    description: second
    vault_root: ${tmpVault}
    project_folder: Projects/Other
    voice: kokoro
    avatar: b.png
`,
        'utf-8',
      );
      const agents = loadObsidianAgents(yamlPath);
      expect(agents).toHaveLength(2);
      expect(agents.map((a) => a.id).sort()).toEqual(['valid-a', 'valid-b']);
    });
  });

  describe('parseVoiceBridgeArgs()', () => {
    it('returns defaults for empty args', () => {
      const r = parseVoiceBridgeArgs([]);
      expect(r.agentId).toBe('main');
      expect(r.message).toBe('');
      expect(r.chatId).toBe('warroom');
      expect(r.quickMode).toBe(false);
      expect(r.meetingId).toBeUndefined();
      expect(r.cwd).toBeUndefined();
    });

    it('parses --cwd as a separate CLI flag', () => {
      const r = parseVoiceBridgeArgs([
        '--agent', 'rorworld-warroom',
        '--message', 'hello',
        '--cwd', '/abs/path/to/vault/project',
      ]);
      expect(r.agentId).toBe('rorworld-warroom');
      expect(r.message).toBe('hello');
      expect(r.cwd).toBe('/abs/path/to/vault/project');
    });

    it('keeps all the pre-Slice-5 flags working (--agent, --message, --chat-id, --meeting-id, --quick)', () => {
      const r = parseVoiceBridgeArgs([
        '--agent', 'rc2',
        '--message', 'Hi',
        '--chat-id', 'test-chat',
        '--meeting-id', 'mtg-42',
        '--quick',
      ]);
      expect(r.agentId).toBe('rc2');
      expect(r.message).toBe('Hi');
      expect(r.chatId).toBe('test-chat');
      expect(r.meetingId).toBe('mtg-42');
      expect(r.quickMode).toBe(true);
      expect(r.cwd).toBeUndefined();
    });
  });
});
