// F-07 — Indexation du corpus (embeddings).
// Chunk les notes (005 reglements + 002 atelier + digests), embed via embeddings.ts,
// upsert dans dpp_index. Incremental : une note inchangee (meme note_mtime) n'est pas reindexee.
import Database from 'better-sqlite3';

import type { Tier } from './types.js';

/** Fonction d'embedding injectee (embeddings.ts en prod, mock en test). */
export type Embedder = (text: string) => Promise<number[]>;

export interface CorpusFile {
  path: string;
  content: string;
  mtime: number;
  tier: Tier;
}

export interface IndexDeps {
  embed: Embedder;
  now?: number;
  chunkSize?: number;
  overlap?: number;
}

export interface IndexResult {
  indexed: number; // notes reindexees
  skipped: number; // notes inchangees
  chunks: number; // chunks ecrits
}

export interface Chunk {
  text: string;
  offset: number;
}

/** Decoupe un texte en chunks chevauchants, sur des bornes de caracteres. */
export function chunkText(text: string, size = 1000, overlap = 200): Chunk[] {
  const clean = text.replace(/\r\n/g, '\n').trim();
  if (clean.length === 0) return [];
  if (clean.length <= size) return [{ text: clean, offset: 0 }];

  const step = Math.max(1, size - overlap);
  const chunks: Chunk[] = [];
  for (let start = 0; start < clean.length; start += step) {
    const slice = clean.slice(start, start + size).trim();
    if (slice.length > 0) chunks.push({ text: slice, offset: start });
    if (start + size >= clean.length) break;
  }
  return chunks;
}

/** Sérialise un vecteur d'embedding en BLOB (Float32). */
export function embeddingToBlob(vec: number[]): Buffer {
  return Buffer.from(new Float32Array(vec).buffer);
}

/** Désérialise un BLOB Float32 en vecteur. */
export function blobToEmbedding(blob: Buffer): number[] {
  return Array.from(new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4));
}

/** Vrai si la note est deja indexee a ce note_mtime (donc inchangee). */
function isUpToDate(db: Database.Database, notePath: string, mtime: number): boolean {
  const row = db.prepare('SELECT note_mtime FROM dpp_index WHERE note_path = ? LIMIT 1').get(notePath) as
    | { note_mtime: number }
    | undefined;
  return row !== undefined && row.note_mtime === mtime;
}

/** Indexe une note : chunk + embed + remplace ses lignes dans dpp_index. */
export async function indexNote(db: Database.Database, file: CorpusFile, deps: IndexDeps): Promise<number> {
  const now = deps.now ?? Date.now();
  const chunks = chunkText(file.content, deps.chunkSize, deps.overlap);

  // Remplacement non destructif des chunks de CETTE note uniquement.
  db.prepare('DELETE FROM dpp_index WHERE note_path = ?').run(file.path);

  const insert = db.prepare(
    `INSERT INTO dpp_index (note_path, chunk_text, embedding, offset, source_tier, indexed_at, note_mtime)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const chunk of chunks) {
    const vec = await deps.embed(chunk.text);
    insert.run(file.path, chunk.text, embeddingToBlob(vec), chunk.offset, file.tier, now, file.mtime);
  }
  return chunks.length;
}

/** Indexe un corpus de notes, incrementalement (saute les notes inchangees). */
export async function indexCorpus(db: Database.Database, files: CorpusFile[], deps: IndexDeps): Promise<IndexResult> {
  let indexed = 0;
  let skipped = 0;
  let chunks = 0;
  for (const file of files) {
    if (isUpToDate(db, file.path, file.mtime)) {
      skipped++;
      continue;
    }
    chunks += await indexNote(db, file, deps);
    indexed++;
  }
  return { indexed, skipped, chunks };
}
