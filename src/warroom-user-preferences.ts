/**
 * Slice 7 — User preferences for the War Room roster (RED stub).
 *
 * Loads / saves config/user-preferences.yaml and applies its state on
 * top of the base roster (the 6 directory-backed agents + any
 * config/obsidian-agents.yaml entries loaded at Slice 5). GREEN phase
 * replaces the stubs with real fs + js-yaml logic.
 *
 * Prefs schema:
 *   disabled_agents:  string[]   -- agent ids filtered out of the roster
 *   order:            string[]   -- explicit sidebar order (unlisted → end)
 *   added_obsidian_agents:       -- new entries authored via the Settings UI
 *     - id, name, description, vault_root, project_folder, voice, avatar?, model?
 */

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
  // Carried through for added Obsidian entries (so server.py can map
  // id → cwd at spawn time).
  vault_root?: string;
  project_folder?: string;
  voice?: string;
  avatar?: string;
  model?: string;
}

export function loadUserPreferences(_yamlPath: string): UserPreferences {
  throw new Error('not implemented — Slice 7 GREEN');
}

export function saveUserPreferences(_prefs: UserPreferences, _yamlPath: string): void {
  throw new Error('not implemented — Slice 7 GREEN');
}

export function applyUserPreferences(
  _baseRoster: RosterEntry[],
  _prefs: UserPreferences,
): RosterEntry[] {
  throw new Error('not implemented — Slice 7 GREEN');
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

export function validateNewObsidianInput(_form: AddedObsidianAgent): ValidationResult {
  throw new Error('not implemented — Slice 7 GREEN');
}
