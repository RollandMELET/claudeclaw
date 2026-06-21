// F-02 — Orchestration de la collecte multi-source.
// Route chaque source vers son collecteur (par methode), isole les erreurs : un collecteur
// en echec est loggue et n'interrompt pas les autres. Declenchable manuel (CLI) et cron.
import { logger } from '../logger.js';

import { collectCircabc } from './collectors/circabc.js';
import { collectEping } from './collectors/eping.js';
import { collectEurlex } from './collectors/eurlex.js';
import { collectInstitutional } from './collectors/institutional.js';
import type { CollectMethod, DppItem, Source } from './types.js';

// Contrat HTTP elargi : 2e parametre optionnel `init` pour porter des en-tetes (auth CIRCABC).
// Retrocompatible : les collecteurs a 1 argument restent assignables (param optionnel).
export type HttpGet = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<string>;

export interface CollectDeps {
  httpGet: HttpGet;
}

export interface CollectError {
  sourceId: string;
  error: string;
}

export interface CollectResult {
  items: DppItem[];
  errors: CollectError[];
}

type Collector = (source: Source, httpGet: HttpGet) => Promise<DppItem[]>;

// Toutes les methodes du registre ont un collecteur. Le guard `if (!collector)` dans
// collect() reste un filet pour une methode future non encore cablee.
const COLLECTORS: Record<CollectMethod, Collector> = {
  'eurlex-rss': collectEurlex,
  'eping-api': collectEping,
  'institutional-scrape': collectInstitutional,
  'circabc-api': collectCircabc,
};

/**
 * GET HTTP par defaut (prod), via fetch global (Node >= 20). Envoie un User-Agent
 * navigateur : nombre de sites institutionnels (ex: CEN-CENELEC) rejettent la connexion
 * (WAF anti-bot) sans UA, ce qui se manifeste par un 'fetch failed'. Timeout 20s.
 */
export async function defaultHttpGet(
  url: string,
  init?: { headers?: Record<string, string> },
): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept:
        'text/html,application/xhtml+xml,application/xml,application/rss+xml;q=0.9,*/*;q=0.8',
      // L'appelant override en dernier (ex: CIRCABC impose Accept: application/json).
      ...init?.headers,
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
  return res.text();
}

/**
 * Collecte les items de toutes les sources. Chaque source est isolee : une erreur
 * (HTTP, parse, methode inconnue) est capturee dans `errors`, jamais propagee.
 */
export async function collect(sources: Source[], deps: CollectDeps): Promise<CollectResult> {
  const items: DppItem[] = [];
  const errors: CollectError[] = [];

  for (const source of sources) {
    const collector = COLLECTORS[source.methode];
    try {
      if (!collector) throw new Error(`Methode de collecte inconnue : ${source.methode}`);
      const collected = await collector(source, deps.httpGet);
      items.push(...collected);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ sourceId: source.id, error: message });
      logger.warn({ sourceId: source.id, error: message }, 'DPP collecte : source en echec, ignoree');
    }
  }

  return { items, errors };
}
