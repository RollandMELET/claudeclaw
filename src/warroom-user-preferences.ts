/**
 * Slice 7 — User preferences for the War Room roster.
 *
 * Loads / saves config/user-preferences.yaml and applies its state on
 * top of the base roster (the directory-backed agents + any
 * config/obsidian-agents.yaml entries loaded at Slice 5).
 *
 * Prefs schema:
 *   disabled_agents:        string[]   -- filtered out of the roster
 *   order:                  string[]   -- explicit sidebar order (unlisted → end)
 *   added_obsidian_agents:  entries    -- new Obsidian agents authored via Settings UI
 *
 * I/O errors are swallowed (logger.warn); a broken prefs file must not
 * take down the dashboard.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

import yaml from 'js-yaml';

import { logger } from './logger.js';

export interface AddedObsidianAgent {
  id: string;
  name: string;
  description: string;
  vault_root: string;
  project_folder: string;
  voice: string;
  avatar?: string;
  model?: string;
}

export interface UserPreferences {
  disabled_agents: string[];
  order: string[];
  added_obsidian_agents: AddedObsidianAgent[];
}

export interface RosterEntry {
  id: string;
  name: string;
  description: string;
  origin?: string;
  vault_root?: string;
  project_folder?: string;
  voice?: string;
  avatar?: string;
  model?: string;
}

const EMPTY_PREFS: UserPreferences = {
  disabled_agents: [],
  order: [],
  added_obsidian_agents: [],
};

function expandTilde(p: string): string {
  if (!p) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

function sanitizeStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

function sanitizeAddedList(v: unknown): AddedObsidianAgent[] {
  if (!Array.isArray(v)) return [];
  const out: AddedObsidianAgent[] = [];
  for (const e of v) {
    if (!e || typeof e !== 'object') continue;
    const o = e as Record<string, unknown>;
    const id = typeof o.id === 'string' ? o.id : '';
    const vault_root = typeof o.vault_root === 'string' ? o.vault_root : '';
    const project_folder = typeof o.project_folder === 'string' ? o.project_folder : '';
    if (!id || !vault_root || !project_folder) continue;
    out.push({
      id,
      name: typeof o.name === 'string' ? o.name : id,
      description: typeof o.description === 'string' ? o.description : '',
      vault_root,
      project_folder,
      voice: typeof o.voice === 'string' ? o.voice : 'kokoro',
      avatar: typeof o.avatar === 'string' ? o.avatar : undefined,
      model: typeof o.model === 'string' ? o.model : undefined,
    });
  }
  return out;
}

export function loadUserPreferences(yamlPath: string): UserPreferences {
  try {
    if (!fs.existsSync(yamlPath)) return { ...EMPTY_PREFS };
    const raw = fs.readFileSync(yamlPath, 'utf-8');
    if (!raw.trim()) return { ...EMPTY_PREFS };
    const doc = yaml.load(raw) as Record<string, unknown> | null;
    if (!doc || typeof doc !== 'object') return { ...EMPTY_PREFS };
    return {
      disabled_agents: sanitizeStringArray(doc.disabled_agents),
      order: sanitizeStringArray(doc.order),
      added_obsidian_agents: sanitizeAddedList(doc.added_obsidian_agents),
    };
  } catch (err) {
    logger.warn(
      { yamlPath, err: (err as Error).message },
      'user-preferences: load failed, falling back to empty defaults',
    );
    return { ...EMPTY_PREFS };
  }
}

export function saveUserPreferences(prefs: UserPreferences, yamlPath: string): void {
  try {
    // Ensure the parent directory exists (best-effort — not creating
    // the whole tree, just the immediate parent for common cases).
    try {
      const dir = path.dirname(yamlPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    } catch { /* fall through to the write; if it fails, we log below */ }

    const payload: UserPreferences = {
      disabled_agents: sanitizeStringArray(prefs.disabled_agents),
      order: sanitizeStringArray(prefs.order),
      added_obsidian_agents: sanitizeAddedList(prefs.added_obsidian_agents),
    };
    const serialized = yaml.dump(payload, { noRefs: true, lineWidth: 120 });
    // Write-then-rename for atomicity — a crash mid-write won't leave
    // the primary file in a broken half-state.
    const tmp = yamlPath + '.tmp';
    fs.writeFileSync(tmp, serialized, 'utf-8');
    fs.renameSync(tmp, yamlPath);
  } catch (err) {
    logger.warn(
      { yamlPath, err: (err as Error).message },
      'user-preferences: save failed, prefs will not persist',
    );
  }
}

export function applyUserPreferences(
  baseRoster: RosterEntry[],
  prefs: UserPreferences,
): RosterEntry[] {
  const disabled = new Set(prefs.disabled_agents);

  // 1. Filter disabled from base.
  const filtered = baseRoster.filter((a) => !disabled.has(a.id));

  // 2. Apply explicit order. Listed ids first (in the given order),
  //    then unlisted base entries in their original order.
  let ordered: RosterEntry[];
  if (prefs.order.length === 0) {
    ordered = filtered;
  } else {
    const byId = new Map<string, RosterEntry>();
    for (const a of filtered) byId.set(a.id, a);
    const seen = new Set<string>();
    const front: RosterEntry[] = [];
    for (const id of prefs.order) {
      const entry = byId.get(id);
      if (entry && !seen.has(id)) {
        front.push(entry);
        seen.add(id);
      }
    }
    const rest = filtered.filter((a) => !seen.has(a.id));
    ordered = [...front, ...rest];
  }

  // 3. Append added Obsidian agents (dedup vs base) — these always
  //    land at the end regardless of `order`, so the user discovers
  //    them next to the default roster.
  const finalList: RosterEntry[] = [...ordered];
  const existingIds = new Set(finalList.map((a) => a.id));
  for (const extra of prefs.added_obsidian_agents) {
    if (disabled.has(extra.id)) continue;
    if (existingIds.has(extra.id)) continue;
    finalList.push({
      id: extra.id,
      name: extra.name || extra.id,
      description: extra.description || '',
      origin: 'obsidian',
      vault_root: extra.vault_root,
      project_folder: extra.project_folder,
      voice: extra.voice,
      avatar: extra.avatar,
      model: extra.model,
    });
    existingIds.add(extra.id);
  }
  return finalList;
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

/**
 * Server-side validation for a POST add-obsidian form. Mirrors the
 * Slice 5 loader checks: id syntax, required fields, path traversal,
 * folder-on-disk existence.
 */
export function validateNewObsidianInput(form: AddedObsidianAgent): ValidationResult {
  if (!form || typeof form !== 'object') {
    return { ok: false, error: 'invalid form payload' };
  }
  if (!form.id || !/^[a-z][a-z0-9_-]{0,29}$/.test(form.id)) {
    return { ok: false, error: 'invalid id: must match /^[a-z][a-z0-9_-]{0,29}$/' };
  }
  if (!form.vault_root || !form.project_folder) {
    return { ok: false, error: 'vault_root and project_folder are required' };
  }
  if (!form.voice) {
    return { ok: false, error: 'voice is required' };
  }

  // Path traversal guard (identical to Slice 5 loadObsidianAgents).
  const vaultRoot = path.resolve(expandTilde(form.vault_root));
  const candidate = path.resolve(path.join(vaultRoot, form.project_folder));
  const vaultPrefix = vaultRoot.endsWith(path.sep) ? vaultRoot : vaultRoot + path.sep;
  if (candidate !== vaultRoot && !candidate.startsWith(vaultPrefix)) {
    return {
      ok: false,
      error: 'project_folder escapes vault_root (path traversal rejected)',
    };
  }
  if (!fs.existsSync(candidate)) {
    return {
      ok: false,
      error: `resolved folder does not exist on disk: ${candidate}`,
    };
  }
  return { ok: true };
}
