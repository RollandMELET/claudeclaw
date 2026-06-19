import { getRecentlySupersededMemories } from './db.js';
import type { SupersededPair } from './db.js';
import { logger } from './logger.js';

/** Sender callback: takes an HTML string and delivers it (e.g. to Telegram). */
export type ReportSender = (html: string) => Promise<void>;

/** Escape characters unsafe for Telegram's HTML parse_mode. */
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Format a unix-seconds timestamp as a short, locale-stable date string. */
function fmtDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 16).replace('T', ' ');
}

/**
 * Build a human-readable HTML report of recently superseded (stale /
 * contradictory) memories. Returns the HTML string, or `null` when there is
 * nothing to report (no contradictions in the window). Telegram HTML parse_mode
 * compatible: only <b>, <i>, <code> and entity escaping.
 *
 * @param chatId  the chat whose memories to inspect
 * @param sinceTs unix seconds; only contradictions resolved at/after this time
 *                are included. Pass 0 for all currently-superseded memories.
 */
export function buildSupersededReport(chatId: string, sinceTs = 0): string | null {
  const pairs: SupersededPair[] = getRecentlySupersededMemories(chatId, sinceTs);
  if (pairs.length === 0) {
    return null;
  }

  const header = `🌙 <b>Auto-Dream — rapport mémoire</b>\n`
    + `<i>${pairs.length} mémoire(s) périmée(s) / contradictoire(s) détectée(s) cette nuit.</i>\n`
    + `<i>Vérifie que les remplacements sont corrects.</i>\n`;

  const blocks = pairs.map((p, i) => {
    return `\n<b>${i + 1}.</b> périmé <code>#${p.stale_id}</code> → remplacé par <code>#${p.new_id}</code>\n`
      + `   ⤷ <s>${escapeHtml(p.stale_summary)}</s> <i>(${fmtDate(p.stale_created_at)})</i>\n`
      + `   ✓ ${escapeHtml(p.new_summary)} <i>(${fmtDate(p.new_created_at)})</i>`;
  });

  // TODO(#15): rectification interactive — boutons inline pour annuler un
  // supersede erroné (rétablir la mémoire périmée). MVP = lecture seule.
  const footer = `\n\n<i>MVP lecture seule : pour annuler un remplacement erroné, le faire à la main pour l'instant.</i>`;

  return header + blocks.join('\n') + footer;
}

/**
 * Build the superseded-memory report and push it via the provided sender.
 * No-op (returns false) when there is nothing to report. Errors from the
 * sender are caught and logged so a failed push never breaks the caller
 * (e.g. the nightly Auto-Dream pass).
 *
 * @returns true if a report was sent, false if there was nothing to report.
 */
export async function sendSupersededReport(
  chatId: string,
  sender: ReportSender,
  sinceTs = 0,
): Promise<boolean> {
  const html = buildSupersededReport(chatId, sinceTs);
  if (!html) {
    logger.debug({ chatId }, 'Auto-Dream report: no contradictions to report (RAS)');
    return false;
  }
  try {
    await sender(html);
    logger.info({ chatId }, 'Auto-Dream report sent');
    return true;
  } catch (err) {
    logger.error({ err, chatId }, 'Auto-Dream report failed to send');
    return false;
  }
}
