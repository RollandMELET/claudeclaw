import { generateContent, parseJsonResponse } from './gemini.js';
import {
  getUnconsolidatedMemories,
  saveConsolidationAtomic,
  saveConsolidationEmbedding,
} from './db.js';
import { embedText } from './embeddings.js';
import { logger } from './logger.js';
import { sendSupersededReport, type ReportSender } from './memory-report.js';

interface ConsolidationResult {
  summary: string;
  insight: string;
  connections: Array<{
    from_id: number;
    to_id: number;
    relationship: string;
  }>;
  contradictions?: Array<{
    stale_id: number;
    supersedes_id: number;
    reason: string;
  }>;
}

const CONSOLIDATION_PROMPT = `You are a memory consolidation agent. You find patterns and connections across a user's recent memories.

Given these unconsolidated memories:
{MEMORIES}

Your job:
1. Find cross-cutting patterns, themes, or connections between memories
2. Create a synthesized summary that captures the overall picture
3. Identify one key insight that emerges from these memories together
4. Map connections between specific memories (use their IDs)
5. Check for CONTRADICTIONS: if any memory updates, corrects, or supersedes an earlier one, flag it. IMPORTANT: Compare the created_at timestamps to determine which is newer. The memory with the LATER timestamp is authoritative (it's the correction). Set stale_id to the OLDER memory's ID and supersedes_id to the NEWER memory's ID.

Return JSON:
{
  "summary": "A synthesized view across all source memories",
  "insight": "One key pattern or insight that emerges",
  "connections": [
    {"from_id": N, "to_id": M, "relationship": "description of how they relate"}
  ],
  "contradictions": [
    {"stale_id": N, "supersedes_id": M, "reason": "why the newer one replaces the older"}
  ]
}

If memories are unrelated, still summarize but note they cover different topics. Connections and contradictions arrays can be empty if none exist.`;

// Guard against overlapping consolidation runs (keyed by chatId)
const consolidatingChats = new Set<string>();

/**
 * Run consolidation for a given chat. Finds patterns across unconsolidated
 * memories and creates synthesis records. Safe to call frequently; it's
 * a no-op if fewer than 2 memories are pending or if already running.
 */
export async function runConsolidation(chatId: string): Promise<void> {
  if (consolidatingChats.has(chatId)) {
    logger.debug({ chatId }, 'Consolidation already running for this chat, skipping');
    return;
  }

  consolidatingChats.add(chatId);
  try {
    const memories = getUnconsolidatedMemories(chatId, 20);

    if (memories.length < 2) {
      logger.debug({ count: memories.length }, 'Not enough memories to consolidate');
      return;
    }

    // Format memories for Gemini
    const memoriesJson = memories.map((m) => ({
      id: m.id,
      summary: m.summary,
      entities: JSON.parse(m.entities),
      topics: JSON.parse(m.topics),
      importance: m.importance,
      created_at: new Date(m.created_at * 1000).toISOString(),
    }));

    const prompt = CONSOLIDATION_PROMPT.replace(
      '{MEMORIES}',
      JSON.stringify(memoriesJson, null, 2),
    );

    const raw = await generateContent(prompt);
    const result = parseJsonResponse<ConsolidationResult>(raw);

    if (!result || !result.summary || !result.insight) {
      logger.warn({ raw: raw.slice(0, 200) }, 'Consolidation produced invalid result');
      return;
    }

    const sourceIds = memories.map((m) => m.id);

    // Build validated connections list
    const validConnections: Array<{ from_id: number; to_id: number; relationship: string }> = [];
    if (result.connections && result.connections.length > 0) {
      for (const conn of result.connections) {
        if (!conn.from_id || !conn.to_id) continue;
        if (!sourceIds.includes(conn.from_id) || !sourceIds.includes(conn.to_id)) continue;
        validConnections.push(conn);
      }
    }

    // Build validated contradictions list with timestamp correction
    const validContradictions: Array<{ stale_id: number; superseded_by: number }> = [];
    if (result.contradictions && result.contradictions.length > 0) {
      for (const contra of result.contradictions) {
        if (!sourceIds.includes(contra.stale_id) || !sourceIds.includes(contra.supersedes_id)) {
          logger.warn(
            { staleId: contra.stale_id, supersededBy: contra.supersedes_id, reason: contra.reason },
            'Contradiction detected but IDs not in current batch, skipping',
          );
          continue;
        }
        const staleMem = memories.find((m) => m.id === contra.stale_id);
        const newMem = memories.find((m) => m.id === contra.supersedes_id);
        let staleId = contra.stale_id;
        let supersededBy = contra.supersedes_id;
        if (staleMem && newMem && staleMem.created_at > newMem.created_at) {
          staleId = contra.supersedes_id;
          supersededBy = contra.stale_id;
          logger.warn(
            { originalStale: contra.stale_id, correctedStale: staleId },
            'Corrected contradiction direction (LLM assigned newer memory as stale)',
          );
        }
        validContradictions.push({ stale_id: staleId, superseded_by: supersededBy });
        logger.info(
          { staleId, supersededBy, reason: contra.reason },
          'Memory superseded (contradiction resolved)',
        );
      }
    }

    // Atomically save consolidation, wire connections, handle contradictions,
    // and mark source memories as consolidated. All or nothing.
    const consolidationId = saveConsolidationAtomic(
      chatId, sourceIds, result.summary, result.insight,
      validConnections, validContradictions,
    );

    // Generate embedding (non-critical, outside transaction)
    try {
      const embeddingText = `${result.summary} ${result.insight}`;
      const embedding = await embedText(embeddingText);
      if (embedding.length > 0) {
        saveConsolidationEmbedding(consolidationId, embedding);
      }
    } catch (embErr) {
      logger.warn({ err: embErr, consolidationId }, 'Failed to embed consolidation');
    }

    logger.info(
      {
        chatId,
        sourceCount: sourceIds.length,
        connections: result.connections?.length ?? 0,
        insight: result.insight.slice(0, 80),
      },
      'Consolidation complete',
    );
  } catch (err) {
    logger.error({ err }, 'Consolidation failed');
  } finally {
    consolidatingChats.delete(chatId);
  }
}

// ── Auto-Dream: dedicated nightly consolidation pass + contradiction report ──
//
// The 30-min interval applies contradictions silently. Auto-Dream adds (a) a
// dedicated pass at ~03h (low thermal load on the Mac Mini) that forces a
// consolidation, and (b) a human-readable Telegram report of stale /
// contradictory memories for manual validation. It is IN ADDITION to the
// 30-min pass (not a replacement) and is idempotent — it reuses runConsolidation's
// overlap guard, and a per-day date marker prevents a double-run within the
// trigger window.

/** Local-date key (YYYY-MM-DD) used to ensure Auto-Dream runs at most once/day. */
function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Pure trigger decision for the nightly pass. Returns true when `now` falls in
 * the target hour AND Auto-Dream has not already run today (`lastRunDate` is the
 * date key of the last successful trigger, or null if never).
 *
 * Window = the whole `targetHour` (e.g. 03:00–03:59), so a check interval up to
 * ~30 min is guaranteed to land inside it at least once.
 */
export function shouldRunAutoDream(
  now: Date,
  lastRunDate: string | null,
  targetHour: number,
): boolean {
  if (now.getHours() !== targetHour) return false;
  return lastRunDate !== dateKey(now);
}

/**
 * Run the nightly Auto-Dream pass once: force a consolidation for the chat,
 * then push the contradiction/stale-memory report via `sender`. The report
 * covers contradictions resolved in the last 24h. Resilient: a failure in
 * either step is logged, never thrown.
 */
export async function runAutoDream(chatId: string, sender: ReportSender): Promise<void> {
  logger.info({ chatId }, 'Auto-Dream nightly pass starting');
  await runConsolidation(chatId);
  const since = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
  try {
    await sendSupersededReport(chatId, sender, since);
  } catch (err) {
    logger.error({ err, chatId }, 'Auto-Dream report step failed');
  }
  logger.info({ chatId }, 'Auto-Dream nightly pass complete');
}

/**
 * Wire the nightly Auto-Dream pass. Polls every `checkIntervalMs` (default
 * 15 min) and triggers runAutoDream at most once per day inside the `targetHour`
 * window. Returns the interval handle so callers can clear it (and for tests).
 *
 * @param targetHour 0–23, the local hour to run (AUTODREAM_HOUR, default 3)
 */
export function initAutoDream(
  chatId: string,
  sender: ReportSender,
  targetHour: number,
  checkIntervalMs = 15 * 60 * 1000,
): ReturnType<typeof setInterval> {
  let lastRunDate: string | null = null;
  const handle = setInterval(() => {
    const now = new Date();
    if (!shouldRunAutoDream(now, lastRunDate, targetHour)) return;
    lastRunDate = dateKey(now);
    void runAutoDream(chatId, sender).catch((err) =>
      logger.error({ err, chatId }, 'Auto-Dream pass failed'),
    );
  }, checkIntervalMs);
  logger.info({ targetHour }, `Auto-Dream enabled (nightly pass at ~${targetHour}h)`);
  return handle;
}
