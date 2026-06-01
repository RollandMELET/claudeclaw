// T9 — Migration DB (dpp_items, dpp_alerts, dpp_index). GREEN. Cible : src/dpp/db.ts
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';

import { createDppSchema, openDppTestDb } from '../db.js';

function tableNames(db: Database.Database): string[] {
  return (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(
    (r) => r.name,
  );
}

describe('T9: Schema DPP', () => {
  it('cree les tables dpp_items, dpp_alerts, dpp_index', () => {
    const db = openDppTestDb();
    const tables = tableNames(db);
    expect(tables).toContain('dpp_items');
    expect(tables).toContain('dpp_alerts');
    expect(tables).toContain('dpp_index');
  });

  it('est idempotent (createDppSchema appele deux fois ne throw pas)', () => {
    const db = new Database(':memory:');
    createDppSchema(db);
    expect(() => createDppSchema(db)).not.toThrow();
  });

  it('dpp_items.fingerprint est UNIQUE', () => {
    const db = openDppTestDb();
    const insert = db.prepare(
      'INSERT INTO dpp_items (fingerprint, source_id, source_tier, title, url, seen_at) VALUES (?, ?, ?, ?, ?, ?)',
    );
    insert.run('fp1', 'eurlex-32023R1542', 'T1', 'Titre', 'https://x', 1000);
    expect(() => insert.run('fp1', 'eurlex-32023R1542', 'T1', 'Titre', 'https://x', 2000)).toThrow();
  });

  it('dpp_alerts.item_id est UNIQUE (dedup des alertes)', () => {
    const db = openDppTestDb();
    const insert = db.prepare('INSERT INTO dpp_alerts (item_id, sent_at) VALUES (?, ?)');
    insert.run(42, 1000);
    expect(() => insert.run(42, 2000)).toThrow();
  });
});
