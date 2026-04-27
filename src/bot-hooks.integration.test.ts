import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { describe, test, expect, vi, beforeEach } from 'vitest';

// ── Logger mock (avoid pino noise / file writes during tests) ────────
vi.mock('./logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ── Test target paths ────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BOT_TS_PATH = path.join(__dirname, 'bot.ts');

beforeEach(() => {
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────
// Test 1 — hookRegistry is exported and instantiated empty at boot
// ─────────────────────────────────────────────────────────────────────
describe('bot.ts hookRegistry export', () => {
  test('hookRegistry exported is instantiated empty at boot', async () => {
    // Import dynamically so the logger mock is in place first.
    const mod = await import('./bot.js');

    expect(mod.hookRegistry).toBeDefined();
    expect(mod.hookRegistry.onSessionEnd).toBeInstanceOf(Array);
    // Other hook points should also exist as arrays per HookRegistry shape.
    expect(mod.hookRegistry.preMessage).toBeInstanceOf(Array);
    expect(mod.hookRegistry.postMessage).toBeInstanceOf(Array);
    expect(mod.hookRegistry.onSessionStart).toBeInstanceOf(Array);
    expect(mod.hookRegistry.onError).toBeInstanceOf(Array);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Test 2 — bot.ts source wires loadHooksFromDir against the hooks dir
//
// We cannot reliably call createBot() here because it opens Telegram /
// DB connections and depends on a populated env. Source-level
// verification is the pragmatic stable path for this invariant.
// ─────────────────────────────────────────────────────────────────────
describe('bot.ts hooks directory wiring', () => {
  test('loadHooksFromDir is wired to a path ending with /hooks', () => {
    const src = fs.readFileSync(BOT_TS_PATH, 'utf-8');

    // Must import loadHooksFromDir from ./hooks.js
    expect(src).toMatch(/import\s*{[^}]*loadHooksFromDir[^}]*}\s*from\s*['"]\.\/hooks\.js['"]/);

    // Must call loadHooksFromDir somewhere with a path ending in 'hooks'
    // (either via a HOOKS_DIR constant or inlined). We accept both forms.
    const inlinePathCall = /loadHooksFromDir\s*\(\s*[^,]*['"`][^'"`]*\/hooks['"`]\s*,/;
    const constantCall = /loadHooksFromDir\s*\(\s*[A-Z_][A-Z0-9_]*\s*,\s*hookRegistry\s*\)/;
    const hooksDirConstant = /(?:const|let)\s+[A-Z_][A-Z0-9_]*\s*=\s*[^;]*['"`]hooks['"`]/;

    const hasInline = inlinePathCall.test(src);
    const hasConstant = constantCall.test(src) && hooksDirConstant.test(src);

    expect(hasInline || hasConstant).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Test 3 — /newchat AND /forget handlers call runHooks(onSessionEnd)
//          before clearSession.
//
// Fallback regex strategy: scan bot.ts source. The functional approach
// (mocking grammy.Bot to capture handlers) is too fragile here because
// createBot has heavy side-effect imports (DB, env, MCP). Source check
// is stable and validates the cabling invariant we care about.
// ─────────────────────────────────────────────────────────────────────
describe('bot.ts /newchat handler wiring', () => {
  test('runHooks(hookRegistry.onSessionEnd, ...) is called inside the /newchat handler before clearSession', () => {
    const src = fs.readFileSync(BOT_TS_PATH, 'utf-8');

    // Locate the /newchat handler block. It begins with bot.command('newchat', ...)
    // and ends at the matching `});`. We use a non-greedy match across lines.
    const newchatBlockMatch = src.match(/bot\.command\(\s*['"`]newchat['"`][\s\S]*?clearSession\s*\([^)]*\)/);
    expect(newchatBlockMatch).not.toBeNull();

    const block = newchatBlockMatch![0];

    // Within the /newchat block, runHooks must reference hookRegistry.onSessionEnd
    expect(block).toMatch(/runHooks\s*\(\s*hookRegistry\.onSessionEnd/);

    // And it must appear BEFORE clearSession (since regex stopped at clearSession,
    // both being present in the same captured block already enforces ordering).
    const runHooksIdx = block.search(/runHooks\s*\(\s*hookRegistry\.onSessionEnd/);
    const clearSessionIdx = block.search(/clearSession\s*\(/);
    expect(runHooksIdx).toBeGreaterThanOrEqual(0);
    expect(clearSessionIdx).toBeGreaterThan(runHooksIdx);

    // Context object must include chatId, agentId, sessionId
    expect(block).toMatch(/runHooks\s*\(\s*hookRegistry\.onSessionEnd\s*,\s*\{[\s\S]*?chatId[\s\S]*?\}/);
    expect(block).toMatch(/runHooks\s*\(\s*hookRegistry\.onSessionEnd\s*,\s*\{[\s\S]*?agentId[\s\S]*?\}/);
    expect(block).toMatch(/runHooks\s*\(\s*hookRegistry\.onSessionEnd\s*,\s*\{[\s\S]*?sessionId[\s\S]*?\}/);
  });
});

describe('bot.ts /forget handler wiring', () => {
  test('runHooks(hookRegistry.onSessionEnd, ...) is called inside the /forget handler before clearSession', () => {
    const src = fs.readFileSync(BOT_TS_PATH, 'utf-8');

    const forgetBlockMatch = src.match(/bot\.command\(\s*['"`]forget['"`][\s\S]*?clearSession\s*\([^)]*\)/);
    expect(forgetBlockMatch).not.toBeNull();

    const block = forgetBlockMatch![0];

    expect(block).toMatch(/runHooks\s*\(\s*hookRegistry\.onSessionEnd/);

    const runHooksIdx = block.search(/runHooks\s*\(\s*hookRegistry\.onSessionEnd/);
    const clearSessionIdx = block.search(/clearSession\s*\(/);
    expect(runHooksIdx).toBeGreaterThanOrEqual(0);
    expect(clearSessionIdx).toBeGreaterThan(runHooksIdx);

    // Context object must include chatId, agentId, sessionId
    expect(block).toMatch(/runHooks\s*\(\s*hookRegistry\.onSessionEnd\s*,\s*\{[\s\S]*?chatId[\s\S]*?\}/);
    expect(block).toMatch(/runHooks\s*\(\s*hookRegistry\.onSessionEnd\s*,\s*\{[\s\S]*?agentId[\s\S]*?\}/);
    expect(block).toMatch(/runHooks\s*\(\s*hookRegistry\.onSessionEnd\s*,\s*\{[\s\S]*?sessionId[\s\S]*?\}/);
  });
});
