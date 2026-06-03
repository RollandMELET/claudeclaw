// F-02 — Collecteur EUR-Lex (flux RSS/Atom CELLAR par CELEX).
// Parse minimal sans dependance XML lourde. Le tier vient de la source (registre), pas du contenu.
import type { DppItem, Source } from '../types.js';

type HttpGet = (url: string) => Promise<string>;

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function tag(block: string, name: string): string | undefined {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decode(m[1]) : undefined;
}

/** Lien : RSS <link>texte</link> ou Atom <link href="..."/>. */
function linkOf(block: string, fallback: string): string {
  const rss = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
  if (rss && decode(rss[1])) return decode(rss[1]);
  const atom = block.match(/<link[^>]*href=["']([^"']+)["']/i);
  if (atom) return atom[1];
  return fallback;
}

function isoDate(raw?: string): string | undefined {
  if (!raw) return undefined;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? raw : new Date(t).toISOString();
}

export async function collectEurlex(source: Source, httpGet: HttpGet): Promise<DppItem[]> {
  const xml = await httpGet(source.url);
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/(item|entry)>/gi) ?? [];
  return blocks.map((block) => {
    const title = tag(block, 'title') ?? '(sans titre)';
    const url = linkOf(block, source.url);
    const excerpt = tag(block, 'description') ?? tag(block, 'summary') ?? tag(block, 'content');
    const publishedAt = isoDate(tag(block, 'pubDate') ?? tag(block, 'updated') ?? tag(block, 'published'));
    return {
      title,
      sourceId: source.id,
      sourceTier: source.tier,
      url,
      publishedAt,
      excerpt,
      theme: source.pole,
      content: excerpt,
    } satisfies DppItem;
  });
}
