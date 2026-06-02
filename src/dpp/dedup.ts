// F-03 — Deduplication.
// Empreinte stable (url normalisee + title). Detection de changement via content_hash.
// Dedup AVANT tout scoring / notification (idempotence, anti-spam).
import crypto from 'crypto';
import Database from 'better-sqlite3';

import type { DppItem } from './types.js';

/** Normalise une URL pour une empreinte stable (scheme/host minuscules, sans fragment ni slash final). */
export function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  try {
    const u = new URL(trimmed);
    u.protocol = u.protocol.toLowerCase();
    u.hostname = u.hostname.toLowerCase();
    u.hash = '';
    let s = u.toString();
    if (s.endsWith('/')) s = s.slice(0, -1);
    return s;
  } catch {
    // Pas une URL absolue : normalisation best-effort.
    return trimmed.replace(/\/+$/, '').toLowerCase();
  }
}

/** Empreinte stable d'un item (hash de url normalisee + title). */
export function fingerprint(item: Pick<DppItem, 'url' | 'title'>): string {
  const basis = `${normalizeUrl(item.url)}\n${item.title.trim()}`;
  return crypto.createHash('sha256').update(basis).digest('hex');
}

/** Hash du contenu servant a detecter une modification d'un item deja vu. */
export function contentHash(item: Pick<DppItem, 'content' | 'excerpt' | 'title'>): string {
  const basis = (item.content ?? item.excerpt ?? item.title ?? '').trim();
  return crypto.createHash('sha256').update(basis).digest('hex');
}

/** Un item dont l'empreinte est deja enregistree. */
export function isKnown(db: Database.Database, fp: string): boolean {
  const row = db.prepare('SELECT 1 FROM dpp_items WHERE fingerprint = ?').get(fp);
  return row !== undefined;
}

/**
 * Vrai si l'empreinte est connue mais le contenu a change (nouvel evenement, AC-03).
 * Faux si inconnu (c'est une nouveaute, pas un changement) ou contenu identique.
 */
export function hasContentChanged(db: Database.Database, item: DppItem): boolean {
  const fp = fingerprint(item);
  const row = db.prepare('SELECT content_hash FROM dpp_items WHERE fingerprint = ?').get(fp) as
    | { content_hash: string | null }
    | undefined;
  if (!row) return false;
  return row.content_hash !== contentHash(item);
}

/**
 * Enregistre (ou met a jour) un item vu. Upsert par empreinte : un changement de
 * contenu rafraichit content_hash et seen_at sans creer de doublon de ligne.
 * Le scoring (relevance/confidence/strong_signal) est applique plus tard.
 */
export function markSeen(db: Database.Database, item: DppItem, seenAt: number): number {
  const fp = fingerprint(item);
  const ch = contentHash(item);
  const stmt = db.prepare(`
    INSERT INTO dpp_items (fingerprint, source_id, source_tier, title, url, published_at, excerpt, theme, content_hash, seen_at)
    VALUES (@fingerprint, @source_id, @source_tier, @title, @url, @published_at, @excerpt, @theme, @content_hash, @seen_at)
    ON CONFLICT(fingerprint) DO UPDATE SET
      content_hash = excluded.content_hash,
      seen_at      = excluded.seen_at,
      excerpt      = excluded.excerpt,
      title        = excluded.title
  `);
  stmt.run({
    fingerprint: fp,
    source_id: item.sourceId,
    source_tier: item.sourceTier,
    title: item.title,
    url: item.url,
    published_at: item.publishedAt ?? null,
    excerpt: item.excerpt ?? null,
    theme: item.theme ?? null,
    content_hash: ch,
    seen_at: seenAt,
  });
  const row = db.prepare('SELECT id FROM dpp_items WHERE fingerprint = ?').get(fp) as { id: number };
  return row.id;
}
