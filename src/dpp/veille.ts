// Service A — entrypoint orchestration.
// Enchaine : collect -> dedup -> score (LLM sur nouveautes seules) -> persist -> digest -> alert.
// Idempotent : relance le meme jour -> 0 doublon (dedup avant scoring), 0 alerte en double
// (dedup dpp_alerts), digest jamais ecrase (writeDigest non destructif).
import Database from 'better-sqlite3';

import { logger } from '../logger.js';

import { sendAlerts, type AlertItem, type Notifier } from './alert.js';
import { collect, type CollectError, type HttpGet } from './collect.js';
import { fingerprint, hasContentChanged, isKnown, markSeen } from './dedup.js';
import { renderDigest, writeDigest } from './digest.js';
import { scoreItems, type RelevanceScorer } from './scoring.js';
import { getSources } from './sources.js';
import type { DppItem, ScoredItem, Source } from './types.js';

export interface VeilleDeps {
  db: Database.Database;
  /** Sources surveillees (defaut : registre config/dpp-sources.yaml). */
  sources?: Source[];
  httpGet: HttpGet;
  /** Moteur de pertinence (Claude CLI en prod, mock en test). */
  relevance: RelevanceScorer;
  /** Canal d'alerte (scripts/notify.sh en prod, mock en test). */
  notify: Notifier;
  /** Dossier d'ecriture du digest (vault + 04-Veille en prod, tmp en test). */
  digestDir: string;
  /** Date du digest (YYYY-MM-DD). Defaut : derivee de now. */
  date?: string;
  now?: number;
}

export interface VeilleResult {
  collected: number;
  fresh: number;
  digestPath: string;
  digestWritten: boolean;
  alertsSent: number;
  errors: CollectError[];
  /** Items nouveaux (deja dedup) scores ce cycle. Sert au flag CLI --json (Digest aval). */
  freshItems: ScoredItem[];
}

/** Nouveaute = empreinte inconnue OU contenu change sur une empreinte connue (AC-03 dedup). */
function isFresh(db: Database.Database, item: DppItem): boolean {
  return !isKnown(db, fingerprint(item)) || hasContentChanged(db, item);
}

function persistScores(db: Database.Database, scored: Array<ScoredItem & { id: number }>): void {
  const stmt = db.prepare(
    'UPDATE dpp_items SET relevance = ?, confidence = ?, strong_signal = ?, theme = ?, excerpt = ? WHERE id = ?',
  );
  const tx = db.transaction((rows: Array<ScoredItem & { id: number }>) => {
    for (const r of rows) {
      stmt.run(r.relevance, r.confidence, r.strongSignal ? 1 : 0, r.theme ?? null, r.excerpt ?? null, r.id);
    }
  });
  tx(scored);
}

export async function runVeilleDpp(deps: VeilleDeps): Promise<VeilleResult> {
  const now = deps.now ?? Date.now();
  const date = deps.date ?? new Date(now).toISOString().slice(0, 10);
  const sources = deps.sources ?? getSources();
  const { db } = deps;

  // 1. Collecte (erreurs isolees par source).
  const { items, errors } = await collect(sources, { httpGet: deps.httpGet });
  if (errors.length > 0) {
    logger.warn({ errors }, 'DPP veille : sources en echec');
  }

  // 2. Dedup AVANT scoring : ne traite que les nouveautes.
  const fresh = items.filter((item) => isFresh(db, item));
  const withIds = fresh.map((item) => ({ item, id: markSeen(db, item, now) }));

  // 3. Scoring (LLM sur les nouveautes seules).
  const scored = await scoreItems(
    withIds.map((w) => w.item),
    { relevance: deps.relevance },
  );
  const scoredWithIds: AlertItem[] = scored.map((s, i) => ({ ...s, id: withIds[i].id }));

  // 4. Persistance des scores.
  persistScores(db, scoredWithIds);

  // 5. Digest (non destructif : RAS si aucune nouveaute, jamais d'ecrasement).
  renderDigest(scored, date); // garantit qu'un rendu valide est toujours possible
  const { path: digestPath, written: digestWritten } = writeDigest(scored, date, deps.digestDir);

  // 6. Alerte (signaux forts, dedup dpp_alerts).
  const { sent: alertsSent } = await sendAlerts(db, scoredWithIds, { notify: deps.notify, now });

  return {
    collected: items.length,
    fresh: fresh.length,
    digestPath,
    digestWritten,
    alertsSent,
    errors,
    freshItems: scored,
  };
}
