// T9 — Schéma + accès SQLite du module DPP.
// Append-only sur dpp_items, dédup des alertes via dpp_alerts, index vectoriel dpp_index.
// La fiabilité (source_tier) provient du registre, jamais du contenu scrappé.
import Database from 'better-sqlite3';

/**
 * Crée (idempotent) les tables du module DPP dans une base existante.
 * Appelée par le createSchema() principal de src/db.ts et par les tests.
 */
export function createDppSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS dpp_items (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      fingerprint   TEXT NOT NULL UNIQUE,
      source_id     TEXT NOT NULL,
      source_tier   TEXT NOT NULL,
      title         TEXT NOT NULL,
      url           TEXT NOT NULL,
      published_at  TEXT,
      excerpt       TEXT,
      theme         TEXT,
      relevance     REAL,
      confidence    REAL,
      strong_signal INTEGER NOT NULL DEFAULT 0,
      content_hash  TEXT,
      seen_at       INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_dpp_items_seen ON dpp_items(seen_at DESC);

    CREATE TABLE IF NOT EXISTS dpp_alerts (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id  INTEGER NOT NULL UNIQUE,
      sent_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dpp_index (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      note_path   TEXT NOT NULL,
      chunk_text  TEXT NOT NULL,
      embedding   BLOB,
      offset      INTEGER NOT NULL DEFAULT 0,
      source_tier TEXT,
      indexed_at  INTEGER NOT NULL,
      note_mtime  INTEGER NOT NULL,
      UNIQUE (note_path, offset)
    );

    CREATE INDEX IF NOT EXISTS idx_dpp_index_note ON dpp_index(note_path);
  `);
}

/** Ouvre une base SQLite en mémoire avec le schéma DPP (tests). */
export function openDppTestDb(): Database.Database {
  const db = new Database(':memory:');
  createDppSchema(db);
  return db;
}
