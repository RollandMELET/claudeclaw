// F-02 — Collecteur ePing OMC (API JSON, notifications TBT batteries).
// Tolerant sur la forme de la reponse (results / notifications / liste racine).
import type { DppItem, Source } from '../types.js';

type HttpGet = (url: string) => Promise<string>;

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
  const body = await httpGet(source.url);
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
