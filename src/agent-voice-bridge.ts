/**
 * Agent Voice Bridge
 *
 * Lightweight CLI script that the War Room Pipecat server calls to invoke
 * a ClaudeClaw agent via the Claude Code SDK and return the text response.
 *
 * Usage: node dist/agent-voice-bridge.js --agent research --message "What did you find?"
 *
 * Outputs JSON to stdout: {"response": "...", "usage": {...}, "error": null}
 *
 * The Pipecat server spawns this as a subprocess for each agent turn,
 * reads the JSON response, and pipes the text to TTS.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import fs from 'fs';
import yaml from 'js-yaml';
import { readEnvFile } from './env.js';
import {
  initDatabase,
  getSession,
  setSession,
  getDatabase,
  createWarRoomAgentSession,
  getWarRoomAgentSession,
  addWarRoomTurn,
} from './db.js';
import { buildMemoryContext } from './memory.js';
import { loadMcpServers } from './agent.js';
import { parseVoiceBridgeArgs } from './warroom-obsidian-agents.js';
import path from 'path';
import { fileURLToPath } from 'url';

// The voice bridge is a standalone subprocess — initialize the DB
// connection before any getSession/setSession calls run. Without this,
// db is undefined and every call fails with "Cannot read properties of
// undefined (reading 'prepare')".
initDatabase();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Parse CLI args via the pure parser (Slice 5). `--cwd` is the new
// flag, used when spawning Obsidian-backed agents whose project
// folder lives outside PROJECT_ROOT/agents/. Quick mode: cap turns
// hard, used by warroom auto-routing where voice latency matters
// more than thoroughness. The agent still has MCP access but can
// only do ~1 tool call round-trip before it has to answer.
const parsed = parseVoiceBridgeArgs(process.argv.slice(2));
const agentId = parsed.agentId;
const message = parsed.message;
const chatId = parsed.chatId;
const quickMode = parsed.quickMode;
// Slice 2 — optional meeting_id. When present, writes rich session/turn
// rows to warroom_agent_sessions + warroom_turns in addition to the
// legacy warroom_transcript. Absent = legacy behavior, no new writes.
const meetingId = parsed.meetingId;
// Slice 5 — optional --cwd override for Obsidian agents. When set,
// the Claude Code SDK runs with this cwd instead of PROJECT_ROOT/agents/<id>.
const cwdOverride = parsed.cwd;

if (!message) {
  console.error(JSON.stringify({ response: null, usage: null, error: 'No --message provided' }));
  process.exit(1);
}

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

async function main() {
  try {
    const secrets = readEnvFile(['CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY']);
    const sdkEnv: Record<string, string | undefined> = { ...process.env };
    // Strip env vars set by a wrapping Claude Code session. When the voice
    // bridge is launched indirectly from inside a Claude Code session (e.g.
    // during local testing where the Pipecat server was started from a
    // Claude Code shell), the nested claude subprocess inherits these and
    // exits with code 1. Clearing them guarantees the SDK spawns a fresh
    // unrelated Claude Code process regardless of launch context.
    for (const k of [
      'CLAUDECODE',
      'CLAUDE_CODE_ENTRYPOINT',
      'CLAUDE_CODE_EXECPATH',
      'CLAUDE_CODE_SSE_PORT',
      'CLAUDE_CODE_IPC_PORT',
      'CLAUDE_CODE_MAX_OUTPUT_TOKENS',
      'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS',
    ]) {
      delete sdkEnv[k];
    }
    if (secrets.CLAUDE_CODE_OAUTH_TOKEN) sdkEnv.CLAUDE_CODE_OAUTH_TOKEN = secrets.CLAUDE_CODE_OAUTH_TOKEN;
    if (secrets.ANTHROPIC_API_KEY) sdkEnv.ANTHROPIC_API_KEY = secrets.ANTHROPIC_API_KEY;

    // Validate agent ID format (prevent path traversal)
    if (agentId !== 'main' && !/^[a-z][a-z0-9_-]{0,29}$/.test(agentId)) {
      throw new Error(`Invalid agent ID: ${agentId}`);
    }

    // Resolve agent working directory:
    //   - Slice 5: if --cwd is set (Obsidian agent), trust the caller
    //     (warroom/server.py resolves it from config/obsidian-agents.yaml
    //     which already validated the path is inside vault_root).
    //   - Otherwise: PROJECT_ROOT for 'main', PROJECT_ROOT/agents/<id>
    //     for the 6 directory-backed agents (with the usual guard).
    let agentDir: string;
    if (cwdOverride) {
      agentDir = path.resolve(cwdOverride);
      if (!fs.existsSync(agentDir)) {
        throw new Error(`--cwd path does not exist: ${agentDir}`);
      }
    } else {
      agentDir = agentId === 'main'
        ? PROJECT_ROOT
        : path.join(PROJECT_ROOT, 'agents', agentId);
      const resolved = path.resolve(agentDir);
      if (!resolved.startsWith(path.resolve(PROJECT_ROOT) + path.sep) && resolved !== path.resolve(PROJECT_ROOT)) {
        throw new Error(`Agent path outside project: ${resolved}`);
      }
    }

    // Read the agent's MCP allowlist from its agent.yaml (if present). The
    // text bot does this via loadAgentConfig in src/bot.ts; we do a minimal
    // inline read to avoid pulling bot.ts's heavy init chain into the voice
    // bridge subprocess.
    let mcpAllowlist: string[] | undefined;
    try {
      const yamlPath = path.join(agentDir, 'agent.yaml');
      if (fs.existsSync(yamlPath)) {
        const raw = yaml.load(fs.readFileSync(yamlPath, 'utf-8')) as Record<string, unknown> | undefined;
        const list = raw?.['mcp_servers'];
        if (Array.isArray(list)) mcpAllowlist = list.filter((x): x is string => typeof x === 'string');
      }
    } catch (err) {
      // Non-fatal: fall through with undefined allowlist (loads all MCPs)
      process.stderr.write(`[voice-bridge] agent.yaml read failed: ${err}\n`);
    }

    // Load MCP servers for this agent, mirroring the text-bot's behavior.
    // Without this, voice-invoked agents can only use built-in tools (Bash,
    // Read, Grep, etc.) — no Gmail, Slack, Linear, Fireflies, etc.
    const mcpServers = loadMcpServers(mcpAllowlist, agentDir);
    const mcpServerNames = Object.keys(mcpServers);
    process.stderr.write(`[voice-bridge] agent=${agentId} mcpServers=${JSON.stringify(mcpServerNames)}\n`);

    // Resume session if one exists for this chat+agent
    const sessionId = getSession(chatId, agentId) ?? undefined;

    // Build memory context
    const { contextText: memCtx } = await buildMemoryContext(chatId, message, agentId);
    const parts: string[] = [];
    if (memCtx) parts.push(memCtx);

    // Add voice-meeting context hint. Quick mode is stricter because
    // Gemini Live will read the answer verbatim over voice —
    // long responses break the meeting feel.
    if (quickMode) {
      parts.push('[War Room auto-routing: the user is in a voice meeting and this answer will be read aloud verbatim. Respond in 1-2 short sentences. No preamble, no caveats, no lists. If the question genuinely needs a long answer, say "I need to dig into this, want me to queue it" so the user can choose to delegate the full task.]');
    } else {
      parts.push('[Voice meeting mode: Keep responses concise and conversational. Aim for 2-3 sentences unless asked for detail. Start with a brief acknowledgment.]');
    }
    parts.push(message);
    const fullMessage = parts.join('\n\n');

    let resultText: string | null = null;
    let newSessionId: string | undefined;
    let usage: Record<string, number> = {};
    // Slice 2 — capture the SDK message UUID (if exposed) for turn persistence.
    let messageUuid: string | null = null;
    let didCompact = false;
    const turnStartMs = Date.now();

    for await (const event of query({
      prompt: singleTurn(fullMessage),
      options: {
        cwd: agentDir,
        resume: sessionId,
        settingSources: ['project', 'user'],
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        // Quick mode caps turns hard so an auto-routed voice answer
        // can't spiral into a 30s tool-use loop. Direct mode keeps the
        // higher ceiling for more substantive voice conversations.
        maxTurns: quickMode ? 3 : 15,
        env: sdkEnv,
        ...(mcpServerNames.length > 0 ? { mcpServers } : {}),
      },
    })) {
      const ev = event as Record<string, unknown>;

      if (ev['type'] === 'system' && ev['subtype'] === 'init') {
        newSessionId = ev['session_id'] as string;
      }

      if (ev['type'] === 'system' && ev['subtype'] === 'compact_boundary') {
        didCompact = true;
      }

      if (ev['type'] === 'assistant') {
        // The SDK surfaces the assistant message UUID in `message.id`.
        // Keep the latest one — it's the anchor for resumption forks.
        const msg = ev['message'] as Record<string, unknown> | undefined;
        const id = msg?.['id'];
        if (typeof id === 'string') messageUuid = id;
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

    // Save session for continuity
    if (newSessionId) {
      setSession(chatId, newSessionId, agentId);
    }

    // Slice 2 — double-write to warroom_agent_sessions + warroom_turns
    // when a meeting context is provided. The legacy transcript write
    // stays in dashboard.ts (POST /api/warroom/meeting/transcript) so we
    // don't touch the on-screen transcript path.
    if (meetingId && newSessionId) {
      try {
        const database = getDatabase();
        // Reuse the existing agent_session row if one already exists for
        // this (meeting, agent) — otherwise create it. This keeps
        // `turn_number` auto-increment scoped to a single session across
        // all turns of a meeting.
        const agentSession =
          getWarRoomAgentSession(database, meetingId, agentId) ??
          createWarRoomAgentSession(database, {
            meeting_id: meetingId,
            agent_id: agentId,
            session_id: newSessionId,
          });
        addWarRoomTurn(database, {
          agent_session_id: agentSession.id,
          meeting_id: meetingId,
          input_source: 'voice',
          user_message: message,
          agent_response: resultText,
          claude_message_uuid: messageUuid,
          input_tokens: usage['input_tokens'] ?? 0,
          output_tokens: usage['output_tokens'] ?? 0,
          cost_usd: usage['cost_usd'] ?? 0,
          did_compact: didCompact,
          duration_ms: Date.now() - turnStartMs,
        });
      } catch (err) {
        // Non-fatal: session-store write failure must not break the
        // voice response path. The legacy transcript write (in
        // dashboard.ts) is unaffected.
        process.stderr.write(
          `[voice-bridge] warroom session-store write failed: ${err}\n`,
        );
      }
    }

    console.log(JSON.stringify({
      response: resultText,
      usage,
      error: null,
    }));
  } catch (err) {
    console.log(JSON.stringify({
      response: null,
      usage: null,
      error: err instanceof Error ? err.message : String(err),
    }));
    process.exit(1);
  }
}

main();
