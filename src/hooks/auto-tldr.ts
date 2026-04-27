/**
 * auto-tldr — ClaudeClaw hook
 *
 * Generates a short markdown summary of the session at onSessionEnd and
 * writes it to:
 *   ~/.claude/memory/sessions/claudeclaw/<chatId>-<agentId>-<sessionId>.md
 *
 * Constraints:
 *   - Skip when the session has fewer than 10 logged turns.
 *   - Internal Gemini timeout 4500 ms (under the registry-wide 5000 ms).
 *   - Never throw: failures are logged via the ClaudeClaw logger and swallowed.
 *
 * The hook is loaded at runtime by loadHooksFromDir(); it lives outside
 * src/ on purpose (tsconfig rootDir = ./src) and is executed via tsx.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

import { GoogleGenAI } from '@google/genai';

import { GOOGLE_API_KEY } from '../config.js';
import type { HookContext } from '../hooks.js';
import { logger } from '../logger.js';
import { getSessionConversation } from '../db.js';

const MIN_TURNS = 10;
const GEMINI_TIMEOUT_MS = 4500;
const SUMMARY_WORD_BUDGET = 150;
const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_TEMPERATURE = 0.1;
const GEMINI_MAX_OUTPUT_TOKENS = 300;

let geminiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (geminiClient) return geminiClient;
  if (!GOOGLE_API_KEY) {
    throw new Error('GOOGLE_API_KEY is not set; auto-tldr cannot summarise.');
  }
  geminiClient = new GoogleGenAI({ apiKey: GOOGLE_API_KEY });
  return geminiClient;
}

const SESSIONS_DIR = path.join(
  os.homedir(),
  '.claude',
  'memory',
  'sessions',
  'claudeclaw',
);

interface ConversationTurnRow {
  role: string;
  content: string;
  created_at: number;
}

/**
 * Public hook: invoked once per session at end-of-session.
 * Always resolves; never rejects.
 */
export async function onSessionEnd(ctx: HookContext): Promise<void> {
  try {
    if (!ctx.sessionId) {
      logger.debug({ chatId: ctx.chatId, agentId: ctx.agentId }, 'auto-tldr: no sessionId, skipping');
      return;
    }

    const turns = getSessionConversation(ctx.sessionId, 200) as ConversationTurnRow[];
    if (turns.length < MIN_TURNS) {
      logger.debug(
        { sessionId: ctx.sessionId, turns: turns.length },
        'auto-tldr: too few turns, skipping',
      );
      return;
    }

    const transcript = formatTranscript(turns);
    const prompt = buildPrompt(transcript);

    const summary = await withTimeout(
      generateSummary(prompt),
      GEMINI_TIMEOUT_MS,
    );

    if (!summary || !summary.trim()) {
      logger.debug({ sessionId: ctx.sessionId }, 'auto-tldr: empty summary, skipping write');
      return;
    }

    const outPath = sessionFilePath(ctx);
    writeSummary(outPath, ctx, summary.trim(), turns.length);
    logger.info({ outPath, turns: turns.length }, 'auto-tldr: summary written');
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'auto-tldr: failed, swallowing error',
    );
  }
}

// ── Internals ──────────────────────────────────────────────────────────

function buildPrompt(transcript: string): string {
  return [
    `Summarise the following ClaudeClaw conversation in markdown for the user's memory archive.`,
    `Hard limit: ${SUMMARY_WORD_BUDGET} words. No preamble, no closing remarks.`,
    `Structure with these short sections (omit any that are empty):`,
    `- **Topics**: bullet list of subjects discussed`,
    `- **Decisions**: bullet list of conclusions reached`,
    `- **Next steps**: bullet list of follow-ups`,
    ``,
    `Conversation:`,
    transcript,
  ].join('\n');
}

async function generateSummary(prompt: string): Promise<string> {
  // Direct GoogleGenAI call with markdown-friendly config (the shared
  // src/gemini.ts wrapper forces application/json mime, which we don't
  // want for a markdown summary). Pattern mirrors src/gemini.ts.
  const ai = getGeminiClient();
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      temperature: GEMINI_TEMPERATURE,
      maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
    },
  });
  return response.text ?? '';
}

function formatTranscript(turns: ConversationTurnRow[]): string {
  return turns
    .map((t) => {
      const role = t.role === 'user' ? 'User' : 'Assistant';
      // Cap each turn so a single huge message can't blow the prompt budget.
      const content = t.content.length > 1500 ? t.content.slice(0, 1500) + '…' : t.content;
      return `${role}: ${content}`;
    })
    .join('\n\n');
}

function sessionFilePath(ctx: HookContext): string {
  const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, '_');
  const filename = `${safe(ctx.chatId)}-${safe(ctx.agentId)}-${safe(ctx.sessionId ?? 'unknown')}.md`;
  return path.join(SESSIONS_DIR, filename);
}

function writeSummary(
  outPath: string,
  ctx: HookContext,
  summary: string,
  turnCount: number,
): void {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const header = [
    `---`,
    `chat_id: ${ctx.chatId}`,
    `agent_id: ${ctx.agentId}`,
    `session_id: ${ctx.sessionId ?? ''}`,
    `turns: ${turnCount}`,
    `generated_at: ${new Date().toISOString()}`,
    `---`,
    ``,
  ].join('\n');
  fs.writeFileSync(outPath, header + summary + '\n', 'utf-8');
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`auto-tldr Gemini timeout after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

// Exported for tests only.
export const __test__ = {
  MIN_TURNS,
  GEMINI_TIMEOUT_MS,
  SESSIONS_DIR,
  sessionFilePath,
  formatTranscript,
  withTimeout,
};
