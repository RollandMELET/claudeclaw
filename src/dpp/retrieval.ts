// F-08 — Retrieval semantique.
// Embed la requete, cosineSimilarity sur dpp_index, top-k ordonne. Confiance = f(similarite, tier).
import Database from 'better-sqlite3';

import { cosineSimilarity } from '../embeddings.js';

import { blobToEmbedding, type Embedder } from './corpus-index.js';
import { tierWeight } from './scoring.js';
import type { Tier } from './types.js';

export interface RetrievedChunk {
  notePath: string;
  chunkText: string;
  similarity: number;
  sourceTier: Tier;
  confidence: number;
}

export interface RetrieveDeps {
  embed: Embedder;
  /** Nombre de passages a retourner. Defaut 5. */
  k?: number;
  /** Similarite minimale pour retenir un passage. Defaut 0 (aucun filtre). */
  minSimilarity?: number;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Confiance d'un passage = 0.7 * similarite + 0.3 * poids du tier. Bornee [0,1]. */
export function retrievalConfidence(similarity: number, tier: Tier): number {
  const sim = Math.max(0, Math.min(1, similarity));
  return round3(Math.max(0, Math.min(1, 0.7 * sim + 0.3 * tierWeight(tier))));
}

interface IndexRow {
  note_path: string;
  chunk_text: string;
  embedding: Buffer;
  source_tier: string;
}

/** Recupere les top-k passages les plus proches de la requete, ordonnes par similarite. */
export async function retrieve(
  db: Database.Database,
  query: string,
  deps: RetrieveDeps,
): Promise<RetrievedChunk[]> {
  const k = deps.k ?? 5;
  const minSim = deps.minSimilarity ?? 0;
  const qvec = await deps.embed(query);

  const rows = db
    .prepare('SELECT note_path, chunk_text, embedding, source_tier FROM dpp_index')
    .all() as IndexRow[];

  const scored = rows.map((r) => {
    const similarity = cosineSimilarity(qvec, blobToEmbedding(r.embedding));
    const tier = (r.source_tier as Tier) ?? 'T2';
    return {
      notePath: r.note_path,
      chunkText: r.chunk_text,
      similarity: round3(similarity),
      sourceTier: tier,
      confidence: retrievalConfidence(similarity, tier),
    } satisfies RetrievedChunk;
  });

  return scored
    .filter((c) => c.similarity >= minSim)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, k);
}
