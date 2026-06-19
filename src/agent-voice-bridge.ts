/**
 * Agent Voice Bridge — STABLE CONTRACT for an external Pipecat client.
 *
 * Lightweight CLI entrypoint that the companion-vocal (Pipecat) server spawns
 * as a subprocess for each agent turn. It invokes a ClaudeClaw agent via the
 * Claude Code SDK and returns the text response so Pipecat can vocalize it.
 *
 * ── Wire contract (DO NOT BREAK — an external Python process depends on it) ──
 *
 *   CLI args:
 *     --agent <id>      agent id           (default: 'main')
 *     --message <text>  user message       (REQUIRED)
 *     --chat-id <id>    session scope key  (default: 'pipecat' — isolates the
 *                                           vocal session from Telegram/warroom)
 *     --quick           short answers, low max-turns, for voice latency
 *
 *   stdout: EXACTLY ONE line of valid JSON, nothing else, ever:
 *     { "response": string|null,
 *       "usage": { input_tokens, output_tokens, cost_usd } | null,
 *       "error": string|null,
 *       "sessionId": string|null }
 *
 *   stderr: ALL logs / diagnostics / stack traces. Pipecat parses stdout, so
 *           a single stray byte on stdout (a pino line, a console.log, a
 *           warning) corrupts the JSON and breaks the turn. To make that
 *           impossible regardless of what any imported module does, we redirect
 *           process.stdout.write -> stderr at module load (BEFORE any other
 *           import runs) and keep a private handle to the real stdout for the
 *           one final JSON emission. pino defaults to fd 1; db.ts migrations,
 *           memory.ts and security.ts all log on the hot path — without this
 *           guard their output would land on stdout.
 *
 *   exit code: 0 on success, non-zero on any error (error payload still
 *              written to stdout first so Pipecat gets a structured reason).
 *
 * ── Latency note (init overhead) ──
 *   Each turn pays: Node process spawn + module graph load + initDatabase()
 *   (schema + migrations on the shared sqlite) + MCP server discovery +
 *   SDK `query()` cold start. Empirically this fixed cost is ~1-2s before the
 *   model even starts thinking, on top of model latency. For a fluid voice
 *   companion this per-turn spawn cost may dominate. If the pilot shows the
 *   spawn overhead hurts conversational feel, the next step is a PERSISTENT
 *   SERVER mode (a long-lived process holding the DB + MCP + one SDK session,
 *   reading turns over a pipe/socket) instead of spawn-per-turn. Not built
 *   here — decision deferred to the pilot.
 *
 * Usage: node dist/agent-voice-bridge.js --message "What did you find?" --quick
 */

// ── stdout guard (must run before anything else can write) ───────────────
// Capture the real stdout writer, then point process.stdout.write at stderr
// so any library noise (pino, console.log) cannot pollute the JSON channel.
const realStdoutWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = ((
  chunk: string | Uint8Array,
  encoding?: BufferEncoding | ((err?: Error) => void),
  cb?: (err?: Error) => void,
): boolean => {
  // Forward everything that *isn't* our final JSON to stderr.
  return (process.stderr.write as (...a: unknown[]) => boolean)(chunk, encoding as never, cb as never);
}) as typeof process.stdout.write;

/** Emit the single authoritative JSON line on the real stdout. */
function emitResult(result: BridgeResult): void {
  realStdoutWrite(JSON.stringify(result) + '\n');
}

import { query as sdkQuery } from '@anthropic-ai/claude-agent-sdk';
import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import { fileURLToPath } from 'url';

import { readEnvFile } from './env.js';
import { initDatabase, getSession, setSession } from './db.js';
import { buildMemoryContext } from './memory.js';
import { getScrubbedSdkEnv } from './security.js';
import { requireEnabled } from './kill-switches.js';
import { loadMcpServers } from './agent.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// ── Public types (the stable contract surface) ───────────────────────────

export interface BridgeUsage {
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

/** The exact shape written (compact, one line) to stdout. */
export interface BridgeResult {
  response: string | null;
  usage: BridgeUsage | null;
  error: string | null;
  sessionId: string | null;
}

export interface BridgeOptions {
  agentId: string;
  message: string;
  chatId: string;
  quickMode: boolean;
}

/** Minimal shape of the SDK `query` we depend on — injectable for tests. */
export type QueryFn = (input: {
  prompt: AsyncGenerator<unknown> | string;
  options: Record<string, unknown>;
}) => AsyncIterable<Record<string, unknown>>;

// ── Arg parsing (pure) ───────────────────────────────────────────────────

/**
 * Parse the voice-bridge CLI args into a normalized BridgeOptions.
 * Pure: no I/O, no process exit. Unknown flags are ignored. Defaults match
 * the documented contract (agent='main', chat-id='pipecat').
 */
export function parseArgs(argv: string[]): BridgeOptions {
  const out: BridgeOptions = {
    agentId: 'main',
    message: '',
    chatId: 'pipecat',
    quickMode: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = argv[i + 1];
    if (flag === '--agent' && next !== undefined) { out.agentId = next; i++; continue; }
    if (flag === '--message' && next !== undefined) { out.message = next; i++; continue; }
    if (flag === '--chat-id' && next !== undefined) { out.chatId = next; i++; continue; }
    if (flag === '--quick') { out.quickMode = true; continue; }
  }
  return out;
}

// ── Prompt assembly (pure) ───────────────────────────────────────────────

/** Build the per-mode voice hint prepended to the agent turn. */
export function voiceModeHint(quickMode: boolean): string {
  return quickMode
    ? '[War Room auto-routing: the user is in a voice meeting and this answer will be read aloud verbatim. Respond in 1-2 short sentences. No preamble, no caveats, no lists. If the question genuinely needs a long answer, say "I need to dig into this, want me to queue it" so the user can choose to delegate the full task.]'
    : '[Voice meeting mode: Keep responses concise and conversational. Aim for 2-3 sentences unless asked for detail. Start with a brief acknowledgment.]';
}

// ── Core (testable: SDK + memory injectable) ─────────────────────────────

async function* singleTurn(text: string): AsyncGenerator<{
  type: 'user';
  message: { role: 'user'; content: string };
  parent_tool_use_id: null;
  session_id: string;
}> {
  yield {
    type: 'user',
    message: { role: 'user', content: text },
    parent_tool_use_id: null,
    session_id: '',
  };
}

export interface RunDeps {
  /** SDK query function (defaults to the real Claude Agent SDK). */
  queryFn?: QueryFn;
  /** Builds the memory context prefix. Defaults to the real implementation. */
  memoryContextFn?: (
    chatId: string,
    message: string,
    agentId: string,
  ) => Promise<{ contextText: string }>;
  /** Reads the persisted session id. Defaults to db.getSession. */
  getSessionFn?: (chatId: string, agentId: string) => string | undefined;
  /** Persists the new session id. Defaults to db.setSession. */
  setSessionFn?: (chatId: string, sessionId: string, agentId: string) => void;
}

/**
 * Run a single voice-bridge turn and return the structured result. Never
 * throws: every failure (kill switch, bad agent id, SDK error) is captured
 * into a BridgeResult with `error` set and `response` null. The caller maps
 * `error != null` to a non-zero exit code.
 *
 * The brain (`queryFn`), memory and session helpers are injectable so unit
 * tests can exercise arg/output behavior without spawning Claude or touching
 * the real SQLite store.
 */
export async function runVoiceBridge(
  opts: BridgeOptions,
  deps: RunDeps = {},
): Promise<BridgeResult> {
  const queryFn = deps.queryFn ?? (sdkQuery as unknown as QueryFn);
  const memoryContextFn = deps.memoryContextFn ?? buildMemoryContext;
  const readSession = deps.getSessionFn ?? getSession;
  const writeSession = deps.setSessionFn ?? setSession;

  try {
    if (!opts.message) {
      return { response: null, usage: null, error: 'No --message provided', sessionId: null };
    }

    // Kill-switch chokepoint for voice-bridge SDK calls.
    requireEnabled('LLM_SPAWN_ENABLED');

    // Validate agent ID format (prevent path traversal).
    if (opts.agentId !== 'main' && !/^[a-z][a-z0-9_-]{0,29}$/.test(opts.agentId)) {
      throw new Error(`Invalid agent ID: ${opts.agentId}`);
    }

    // Resolve agent directory and verify it stays within the project.
    const agentDir = opts.agentId === 'main'
      ? PROJECT_ROOT
      : path.join(PROJECT_ROOT, 'agents', opts.agentId);
    const resolved = path.resolve(agentDir);
    if (
      !resolved.startsWith(path.resolve(PROJECT_ROOT) + path.sep) &&
      resolved !== path.resolve(PROJECT_ROOT)
    ) {
      throw new Error(`Agent path outside project: ${resolved}`);
    }

    const secrets = readEnvFile(['CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY']);
    const sdkEnv = getScrubbedSdkEnv(secrets);

    // Read the agent's MCP allowlist from its agent.yaml (if present).
    let mcpAllowlist: string[] | undefined;
    try {
      const yamlPath = path.join(agentDir, 'agent.yaml');
      if (fs.existsSync(yamlPath)) {
        const raw = yaml.load(fs.readFileSync(yamlPath, 'utf-8')) as Record<string, unknown> | undefined;
        const list = raw?.['mcp_servers'];
        if (Array.isArray(list)) mcpAllowlist = list.filter((x): x is string => typeof x === 'string');
      }
    } catch (err) {
      // Non-fatal: fall through with undefined allowlist (loads all MCPs).
      process.stderr.write(`[voice-bridge] agent.yaml read failed: ${err}\n`);
    }

    const mcpServers = loadMcpServers(mcpAllowlist, agentDir);
    const mcpServerNames = Object.keys(mcpServers);
    process.stderr.write(
      `[voice-bridge] agent=${opts.agentId} chat=${opts.chatId} quick=${opts.quickMode} mcpServers=${JSON.stringify(mcpServerNames)}\n`,
    );

    // Resume session if one exists for this chat+agent.
    const sessionId = readSession(opts.chatId, opts.agentId) ?? undefined;

    // Build memory context.
    const { contextText: memCtx } = await memoryContextFn(opts.chatId, opts.message, opts.agentId);
    const parts: string[] = [];
    if (memCtx) parts.push(memCtx);
    parts.push(voiceModeHint(opts.quickMode));
    parts.push(opts.message);
    const fullMessage = parts.join('\n\n');

    let resultText: string | null = null;
    let newSessionId: string | undefined;
    let usage: BridgeUsage | null = null;

    for await (const event of queryFn({
      prompt: singleTurn(fullMessage),
      options: {
        cwd: agentDir,
        resume: sessionId,
        settingSources: ['project', 'user'],
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        maxTurns: opts.quickMode ? 3 : 15,
        env: sdkEnv,
        ...(mcpServerNames.length > 0 ? { mcpServers } : {}),
      },
    })) {
      const ev = event as Record<string, unknown>;

      if (ev['type'] === 'system' && ev['subtype'] === 'init') {
        newSessionId = ev['session_id'] as string;
      }

      if (ev['type'] === 'result') {
        resultText = (ev['result'] as string | null | undefined) ?? null;
        const evUsage = ev['usage'] as Record<string, number> | undefined;
        if (evUsage) {
          usage = {
            input_tokens: evUsage['input_tokens'] ?? 0,
            output_tokens: evUsage['output_tokens'] ?? 0,
            cost_usd: (ev['total_cost_usd'] as number) ?? 0,
          };
        }
      }
    }

    // Persist session for conversational continuity.
    if (newSessionId) {
      try {
        writeSession(opts.chatId, newSessionId, opts.agentId);
      } catch (err) {
        // Persisting the session must never sink an otherwise-good answer;
        // the next turn just won't resume. Log and carry on.
        process.stderr.write(`[voice-bridge] setSession failed: ${err}\n`);
      }
    }

    return {
      response: resultText,
      usage,
      error: null,
      sessionId: newSessionId ?? sessionId ?? null,
    };
  } catch (err) {
    return {
      response: null,
      usage: null,
      error: err instanceof Error ? err.message : String(err),
      sessionId: null,
    };
  }
}

// ── Entrypoint ───────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // initDatabase() runs schema + migrations which log via pino; the stdout
  // guard above keeps that off the JSON channel.
  initDatabase();

  const opts = parseArgs(process.argv.slice(2));
  const result = await runVoiceBridge(opts);
  emitResult(result);
  process.exit(result.error ? 1 : 0);
}

// Only run main() when executed directly, not when imported by tests.
const isDirectRun = (() => {
  try {
    return process.argv[1] !== undefined && import.meta.url === `file://${path.resolve(process.argv[1])}`;
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  main().catch((err) => {
    // Last-resort guard: any escape from main() still produces a JSON line on
    // stdout and a non-zero exit, never a bare stack trace on stdout.
    emitResult({
      response: null,
      usage: null,
      error: err instanceof Error ? err.message : String(err),
      sessionId: null,
    });
    process.exit(1);
  });
}
