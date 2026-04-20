/**
 * Slice 5 — Obsidian agents wrapper (TypeScript loader).
 *
 * Reads config/obsidian-agents.yaml and returns a list of validated
 * agents that the dashboard surfaces via GET /api/warroom/agents. Each
 * entry carries an absolute `cwd` anchored inside its declared
 * vault_root — path traversal (../../etc) is dropped with a warning.
 *
 * Also exports parseVoiceBridgeArgs() — the pure CLI arg parser used
 * by src/agent-voice-bridge.ts. Extracted so --cwd can be unit-tested
 * without spawning a subprocess.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

import yaml from 'js-yaml';

import { logger } from './logger.js';

export interface ObsidianAgent {
  id: string;
  name: string;
  description: string;
  /** Absolute filesystem path inside vault_root; validated against traversal. */
  cwd: string;
  voice?: string;
  avatar?: string;
  model?: string;
}

interface YamlEntry {
  name?: string;
  description?: string;
  vault_root?: string;
  project_folder?: string;
  voice?: string;
  avatar?: string;
  model?: string;
}

interface YamlDoc {
  obsidian_agents?: Record<string, YamlEntry>;
}

/**
 * Expand a leading ~ to the user's home directory. Node's path.resolve
 * does not do this; we keep it simple (no ~user form support).
 */
function expandTilde(p: string): string {
  if (!p) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

/**
 * Read config/obsidian-agents.yaml and return the list of validated
 * agents. Returns [] on missing/empty/malformed file or when every
 * entry fails path validation. Never throws.
 */
export function loadObsidianAgents(yamlPath: string): ObsidianAgent[] {
  let raw: string;
  try {
    if (!fs.existsSync(yamlPath)) return [];
    raw = fs.readFileSync(yamlPath, 'utf-8');
  } catch (err) {
    logger.warn(
      { yamlPath, err: (err as Error).message },
      'obsidian-agents: read failed, treating as absent',
    );
    return [];
  }
  if (!raw.trim()) return [];

  let doc: YamlDoc | null = null;
  try {
    doc = yaml.load(raw) as YamlDoc | null;
  } catch (err) {
    logger.warn(
      { yamlPath, err: (err as Error).message },
      'obsidian-agents: YAML parse failed, treating as absent',
    );
    return [];
  }
  if (!doc || typeof doc !== 'object') return [];
  const entries = doc.obsidian_agents;
  if (!entries || typeof entries !== 'object') return [];

  const out: ObsidianAgent[] = [];
  for (const [id, entry] of Object.entries(entries)) {
    if (!entry || typeof entry !== 'object') continue;
    if (!entry.vault_root || !entry.project_folder) {
      logger.warn({ id }, 'obsidian-agents: entry missing vault_root or project_folder, skipping');
      continue;
    }

    const vaultRoot = path.resolve(expandTilde(entry.vault_root));
    const candidate = path.resolve(path.join(vaultRoot, entry.project_folder));

    // Path traversal guard: the resolved candidate must live INSIDE
    // (or equal to) the vault_root. Compare the canonical prefixes.
    const vaultPrefix = vaultRoot.endsWith(path.sep) ? vaultRoot : vaultRoot + path.sep;
    if (candidate !== vaultRoot && !candidate.startsWith(vaultPrefix)) {
      logger.warn(
        { id, vaultRoot, projectFolder: entry.project_folder },
        'obsidian-agents: project_folder escapes vault_root (path traversal), skipping',
      );
      continue;
    }

    // Disk existence guard: skip entries whose resolved folder is
    // missing so a typo in the YAML doesn't break the voice path.
    if (!fs.existsSync(candidate)) {
      logger.warn(
        { id, candidate },
        'obsidian-agents: resolved cwd does not exist on disk, skipping',
      );
      continue;
    }

    out.push({
      id,
      name: entry.name || id,
      description: entry.description || '',
      cwd: candidate,
      voice: entry.voice,
      avatar: entry.avatar,
      model: entry.model,
    });
  }
  return out;
}

export interface VoiceBridgeArgs {
  agentId: string;
  message: string;
  chatId: string;
  quickMode: boolean;
  meetingId?: string;
  cwd?: string;
}

/**
 * Parse the CLI arg array of agent-voice-bridge.ts. Pure function, no
 * I/O. Extracted so the RED test for --cwd doesn't need to spawn a
 * subprocess.
 */
export function parseVoiceBridgeArgs(argv: string[]): VoiceBridgeArgs {
  const out: VoiceBridgeArgs = {
    agentId: 'main',
    message: '',
    chatId: 'warroom',
    quickMode: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = argv[i + 1];
    if (flag === '--agent' && next) { out.agentId = next; i++; continue; }
    if (flag === '--message' && next) { out.message = next; i++; continue; }
    if (flag === '--chat-id' && next) { out.chatId = next; i++; continue; }
    if (flag === '--meeting-id' && next) { out.meetingId = next; i++; continue; }
    if (flag === '--cwd' && next) { out.cwd = next; i++; continue; }
    if (flag === '--quick') { out.quickMode = true; continue; }
  }
  return out;
}
