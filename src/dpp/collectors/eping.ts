// F-02 — Collecteur ePing OMC (API JSON, notifications TBT batteries).
// Tolerant sur la forme de la reponse (results / notifications / liste racine).
// L'API WTO (api.wto.org / apiportal.wto.org) est gated par une cle d'abonnement (Azure APIM) :
// on l'injecte en en-tete via le contrat HttpGet elargi. Sans cle, seul Accept est envoye
// (compat fixtures de test et endpoints ouverts).
import type { DppItem, Source } from '../types.js';

// Contrat elargi (cf. collect.ts) : 2e parametre optionnel pour porter l'en-tete d'auth.
type HttpGet = (url: string, init?: { headers?: Record<string, string> }) => Promise<string>;

/**
 * En-tetes pour l'API WTO ePing. `Accept: application/json` toujours ; cle d'abonnement
 * Azure APIM ajoutee si `process.env.WTO_API_KEY` est definie (le nom d'en-tete exact est
 * `Ocp-Apim-Subscription-Key`, deduit du 401 de api.wto.org).
 */
export function buildEpingHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const key = process.env.WTO_API_KEY;
  if (key) headers['Ocp-Apim-Subscription-Key'] = key;
  return headers;
}

interface EpingNotification {
  title?: string;
  symbol?: string;
  url?: string;
  link?: string;
  distributionDate?: string;
  date?: string;
  summary?: string;
  description?: string;
  product?: string;
}

function isoDate(raw?: string): string | undefined {
  if (!raw) return undefined;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? raw : new Date(t).toISOString();
}

export async function collectEping(source: Source, httpGet: HttpGet): Promise<DppItem[]> {
  const body = await httpGet(source.url, { headers: buildEpingHeaders() });
  const parsed = JSON.parse(body) as unknown;
  const list: EpingNotification[] = Array.isArray(parsed)
    ? parsed
    : ((parsed as Record<string, unknown>).results as EpingNotification[]) ??
      ((parsed as Record<string, unknown>).notifications as EpingNotification[]) ??
      [];

  return list.map((n) => {
    const title = n.title ?? n.symbol ?? '(notification ePing)';
    const url = n.url ?? n.link ?? source.url;
    const excerpt = n.summary ?? n.description ?? n.product;
    return {
      title,
      sourceId: source.id,
      sourceTier: source.tier,
      url,
      publishedAt: isoDate(n.distributionDate ?? n.date),
      excerpt,
      theme: source.pole,
      content: excerpt,
    } satisfies DppItem;
  });
}
