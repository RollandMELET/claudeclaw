/**
 * Slice 5 — Obsidian agents wrapper (TypeScript loader, RED stub).
 *
 * Loads config/obsidian-agents.yaml and resolves each entry into an
 * ObsidianAgent with an absolute, path-safe `cwd` anchored inside its
 * declared vault_root. GREEN phase replaces the stubs.
 *
 * Also exports parseVoiceBridgeArgs() — extracted from agent-voice-bridge.ts
 * so the CLI arg parser is unit-testable without spawning a subprocess.
 */

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

/**
 * Read config/obsidian-agents.yaml and return the list of validated
 * agents. Returns [] on missing/empty/malformed file or when every
 * entry fails path validation. Never throws.
 */
export function loadObsidianAgents(_yamlPath: string): ObsidianAgent[] {
  throw new Error('not implemented — Slice 5 GREEN');
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
export function parseVoiceBridgeArgs(_argv: string[]): VoiceBridgeArgs {
  throw new Error('not implemented — Slice 5 GREEN');
}
