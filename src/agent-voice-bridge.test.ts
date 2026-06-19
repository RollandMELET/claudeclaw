import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the heavy module-level dependencies so importing the bridge doesn't
// pull in the real SDK, DB or MCP discovery. The bridge's stdout guard runs
// at import time; these mocks keep it from touching real I/O.
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: vi.fn() }));
vi.mock('./db.js', () => ({
  initDatabase: vi.fn(),
  getSession: vi.fn(() => undefined),
  setSession: vi.fn(),
}));
vi.mock('./memory.js', () => ({
  buildMemoryContext: vi.fn(async () => ({ contextText: '' })),
}));
vi.mock('./env.js', () => ({ readEnvFile: vi.fn(() => ({})) }));
vi.mock('./security.js', () => ({ getScrubbedSdkEnv: vi.fn(() => ({})) }));
vi.mock('./agent.js', () => ({ loadMcpServers: vi.fn(() => ({})) }));
vi.mock('./kill-switches.js', () => ({ requireEnabled: vi.fn() }));

import {
  parseArgs,
  voiceModeHint,
  runVoiceBridge,
  type BridgeResult,
  type QueryFn,
} from './agent-voice-bridge.js';
import { requireEnabled } from './kill-switches.js';

/** Build a mock SDK query that yields an init event then a result event. */
function mockQuery(events: Array<Record<string, unknown>>): QueryFn {
  return () =>
    (async function* () {
      for (const ev of events) yield ev;
    })();
}

const baseDeps = () => ({
  queryFn: mockQuery([
    { type: 'system', subtype: 'init', session_id: 'sess-123' },
    {
      type: 'result',
      result: 'Hello from the agent.',
      usage: { input_tokens: 100, output_tokens: 20 },
      total_cost_usd: 0.003,
    },
  ]),
  memoryContextFn: vi.fn(async () => ({ contextText: '' })),
  getSessionFn: vi.fn(() => undefined),
  setSessionFn: vi.fn(),
});

describe('parseArgs', () => {
  it('applies contract defaults (agent=main, chat-id=pipecat, quick=false)', () => {
    const opts = parseArgs([]);
    expect(opts).toEqual({ agentId: 'main', message: '', chatId: 'pipecat', quickMode: false });
  });

  it('parses all flags', () => {
    const opts = parseArgs([
      '--agent', 'research',
      '--message', 'what did you find?',
      '--chat-id', 'meeting-7',
      '--quick',
    ]);
    expect(opts).toEqual({
      agentId: 'research',
      message: 'what did you find?',
      chatId: 'meeting-7',
      quickMode: true,
    });
  });

  it('ignores unknown flags and keeps defaults', () => {
    const opts = parseArgs(['--bogus', 'x', '--message', 'hi']);
    expect(opts.message).toBe('hi');
    expect(opts.agentId).toBe('main');
    expect(opts.chatId).toBe('pipecat');
  });

  it('does not treat a missing flag value as the message', () => {
    const opts = parseArgs(['--message']);
    expect(opts.message).toBe('');
  });
});

describe('voiceModeHint', () => {
  it('returns a stricter hint in quick mode', () => {
    expect(voiceModeHint(true)).toContain('1-2 short sentences');
    expect(voiceModeHint(false)).toContain('2-3 sentences');
  });
});

describe('runVoiceBridge — success', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a well-formed BridgeResult and persists the session', async () => {
    const deps = baseDeps();
    const res: BridgeResult = await runVoiceBridge(
      { agentId: 'main', message: 'hi', chatId: 'pipecat', quickMode: false },
      deps,
    );

    // Exact contract shape: response | usage | error | sessionId
    expect(Object.keys(res).sort()).toEqual(['error', 'response', 'sessionId', 'usage']);
    expect(res.response).toBe('Hello from the agent.');
    expect(res.error).toBeNull();
    expect(res.sessionId).toBe('sess-123');
    expect(res.usage).toEqual({ input_tokens: 100, output_tokens: 20, cost_usd: 0.003 });
    // Output must serialize to a single line of valid JSON.
    const line = JSON.stringify(res);
    expect(line).not.toContain('\n');
    expect(JSON.parse(line)).toEqual(res);
    // Session persisted for continuity.
    expect(deps.setSessionFn).toHaveBeenCalledWith('pipecat', 'sess-123', 'main');
  });

  it('passes maxTurns=3 in quick mode, 15 otherwise', async () => {
    const seen: number[] = [];
    const spyQuery: QueryFn = (input) => {
      seen.push(input.options.maxTurns as number);
      return (async function* () {
        yield { type: 'result', result: 'ok' };
      })();
    };
    await runVoiceBridge(
      { agentId: 'main', message: 'hi', chatId: 'pipecat', quickMode: true },
      { ...baseDeps(), queryFn: spyQuery },
    );
    await runVoiceBridge(
      { agentId: 'main', message: 'hi', chatId: 'pipecat', quickMode: false },
      { ...baseDeps(), queryFn: spyQuery },
    );
    expect(seen).toEqual([3, 15]);
  });
});

describe('runVoiceBridge — errors (never throws, always structured)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns an error payload when --message is empty', async () => {
    const res = await runVoiceBridge(
      { agentId: 'main', message: '', chatId: 'pipecat', quickMode: false },
      baseDeps(),
    );
    expect(res.response).toBeNull();
    expect(res.usage).toBeNull();
    expect(res.error).toMatch(/message/i);
    expect(res.sessionId).toBeNull();
  });

  it('returns an error payload for an invalid agent id (no throw)', async () => {
    const res = await runVoiceBridge(
      { agentId: '../etc', message: 'hi', chatId: 'pipecat', quickMode: false },
      baseDeps(),
    );
    expect(res.response).toBeNull();
    expect(res.error).toMatch(/invalid agent id/i);
  });

  it('captures a kill-switch refusal into the error field', async () => {
    (requireEnabled as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error('LLM_SPAWN_ENABLED is disabled');
    });
    const res = await runVoiceBridge(
      { agentId: 'main', message: 'hi', chatId: 'pipecat', quickMode: false },
      baseDeps(),
    );
    expect(res.response).toBeNull();
    expect(res.error).toMatch(/disabled/i);
  });

  it('captures an SDK error into the error field instead of crashing', async () => {
    const boom: QueryFn = () =>
      (async function* () {
        throw new Error('SDK exploded');
        // eslint-disable-next-line no-unreachable
        yield {};
      })();
    const res = await runVoiceBridge(
      { agentId: 'main', message: 'hi', chatId: 'pipecat', quickMode: false },
      { ...baseDeps(), queryFn: boom },
    );
    expect(res.response).toBeNull();
    expect(res.error).toBe('SDK exploded');
    // Still serializes cleanly for stdout.
    expect(() => JSON.parse(JSON.stringify(res))).not.toThrow();
  });

  it('does not let a setSession failure sink a good answer', async () => {
    const deps = {
      ...baseDeps(),
      setSessionFn: vi.fn(() => { throw new Error('db locked'); }),
    };
    const res = await runVoiceBridge(
      { agentId: 'main', message: 'hi', chatId: 'pipecat', quickMode: false },
      deps,
    );
    expect(res.response).toBe('Hello from the agent.');
    expect(res.error).toBeNull();
  });
});
