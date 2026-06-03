// F-02 — Collecteur de pages institutionnelles (CEN, JRC, DIN, Battery Pass, DG ENVI).
// Pas de flux : on capture un instantane de la page (titre + extrait). Le contenu nourrit
// la detection de changement (dedup content_hash) facon changedetection.io.
import type { DppItem, Source } from '../types.js';

type HttpGet = (url: string) => Promise<string>;

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstTag(html: string, name: string): string | undefined {
  const m = html.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? stripTags(m[1]) : undefined;
}

function metaDescription(html: string): string | undefined {
  const m = html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i);
  return m ? m[1].trim() : undefined;
}

export async function collectInstitutional(source: Source, httpGet: HttpGet): Promise<DppItem[]> {
  const html = await httpGet(source.url);
  const title = firstTag(html, 'h1') ?? firstTag(html, 'title') ?? source.nom;
  const bodyText = stripTags(html);
  const excerpt = metaDescription(html) ?? bodyText.slice(0, 280);

  return [
    {
      title,
      sourceId: source.id,
      sourceTier: source.tier,
      url: source.url,
      excerpt,
      theme: source.pole,
      // Texte complet pour la detection de changement (T2 content_hash).
      content: bodyText,
    } satisfies DppItem,
  ];
}
