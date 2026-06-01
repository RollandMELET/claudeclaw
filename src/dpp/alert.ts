// F-06 — Alerte Telegram sur signal fort.
// Selectionne les signaux forts NON deja notifies (dedup via dpp_alerts), formate UN seul
// message groupe, appelle le notifier (scripts/notify.sh en prod, mock en test). Anti-spam.
import { execFile } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import Database from 'better-sqlite3';

import type { ScoredItem, Tier } from './types.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NOTIFY_SCRIPT = path.resolve(__dirname, '../../scripts/notify.sh');

/** Item scoré porteur de son id SQLite (issu de markSeen). */
export interface AlertItem extends ScoredItem {
  id: number;
}

/** Envoie un message (injecté : mockable). */
export type Notifier = (message: string) => Promise<void> | void;

export interface AlertDeps {
  notify: Notifier;
  now?: number;
}

export interface AlertResult {
  sent: number;
  alertedIds: number[];
}

const SAME_EVENT = /journal officiel|\bJO\b|entr[ée]e en vigueur|adopt[ée]|publi[ée]|norme\s+(finalis[ée]e|publi[ée]e|adopt[ée]e)/i;

/** Raison explicite pour laquelle l'item est un signal fort (affichee dans l'alerte). */
export function strongReason(item: AlertItem): string {
  const text = `${item.title} ${item.excerpt ?? ''}`;
  if (SAME_EVENT.test(text)) return 'evenement reglementaire (publication / entree en vigueur)';
  if (item.reliability === 'T1') return 'source officielle T1, pertinence haute';
  if (item.reliability === 'T2') return 'normalisation / institutionnel T2, pertinence haute';
  return 'signal fort';
}

/** Formate un message groupé pour un lot de signaux forts. */
export function formatAlert(items: AlertItem[]): string {
  const header = items.length === 1 ? '🔴 Signal fort DPP Batterie' : `🔴 ${items.length} signaux forts DPP Batterie`;
  const blocks = items.map((i) =>
    [`• ${i.title}`, `  Source : ${i.sourceId} (${i.reliability as Tier})`, `  Pourquoi : ${strongReason(i)}`, `  ${i.url}`].join(
      '\n',
    ),
  );
  return [header, '', ...blocks].join('\n');
}

/**
 * Selectionne les signaux forts jamais notifies, envoie un message groupe, marque les alertes.
 * Idempotent : un item deja alerté n'est jamais re-notifié. Aucun envoi si rien de nouveau.
 */
export async function sendAlerts(
  db: Database.Database,
  items: AlertItem[],
  deps: AlertDeps,
): Promise<AlertResult> {
  const now = deps.now ?? Date.now();
  const already = db.prepare('SELECT 1 FROM dpp_alerts WHERE item_id = ?');
  const fresh = items.filter((i) => i.strongSignal && already.get(i.id) === undefined);

  if (fresh.length === 0) return { sent: 0, alertedIds: [] };

  await deps.notify(formatAlert(fresh));

  const insert = db.prepare('INSERT OR IGNORE INTO dpp_alerts (item_id, sent_at) VALUES (?, ?)');
  const tx = db.transaction((rows: AlertItem[]) => {
    for (const r of rows) insert.run(r.id, now);
  });
  tx(fresh);

  return { sent: fresh.length, alertedIds: fresh.map((i) => i.id) };
}

/** Notifier par defaut (prod) : delegue a scripts/notify.sh (canal Telegram existant). */
export const defaultNotify: Notifier = async (message: string) => {
  await execFileAsync(NOTIFY_SCRIPT, [message]);
};
