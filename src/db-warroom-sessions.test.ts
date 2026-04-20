/**
 * Slice 2 — Session store étendu — RED tests
 *
 * Ces 4 tests (unit) + 1 test intégration (session-persistence.integration.test.ts)
 * constituent la phase RED du TDD pour les 3 nouvelles tables :
 *   - warroom_agent_sessions
 *   - warroom_turns
 *   - warroom_resumption_checkpoints
 *
 * Les fonctions importées lèvent "not implemented" → tests échouent en RED.
 * Ils passeront au GREEN une fois l'implémentation ajoutée.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  _initTestDatabase,
  _testDb,
  createWarRoomAgentSession,
  addWarRoomTurn,
  saveResumptionCheckpoint,
  createWarRoomMeeting,
} from './db.js';

describe('Slice 2 — warroom session store (RED)', () => {
  beforeEach(() => {
    _initTestDatabase();
  });

  // ── Test 1 : createWarRoomAgentSession ───────────────────────────────

  describe('createWarRoomAgentSession', () => {
    it('inserts a row into warroom_agent_sessions and returns the persisted row', () => {
      const db = _testDb();
      // Pré-requis : le meeting doit exister (FK)
      createWarRoomMeeting('mtg-1', 'direct', 'main');

      const row = createWarRoomAgentSession(db, {
        meeting_id: 'mtg-1',
        agent_id: 'rc1',
        session_id: 'cc-session-abc123',
      });

      // La fonction doit retourner la row persistée avec un id auto-généré
      expect(row).toBeDefined();
      expect(row.id).toBeTruthy();
      expect(row.meeting_id).toBe('mtg-1');
      expect(row.agent_id).toBe('rc1');
      expect(row.session_id).toBe('cc-session-abc123');
      expect(row.status).toBe('active');

      // Vérification DB directe
      const persisted = db
        .prepare('SELECT * FROM warroom_agent_sessions WHERE id = ?')
        .get(row.id) as Record<string, unknown> | undefined;
      expect(persisted).toBeDefined();
      expect(persisted!.session_id).toBe('cc-session-abc123');
    });
  });

  // ── Test 2 : addWarRoomTurn ──────────────────────────────────────────

  describe('addWarRoomTurn', () => {
    it('inserts turns and auto-increments turn_number within the same agent_session', () => {
      const db = _testDb();
      createWarRoomMeeting('mtg-2', 'direct', 'main');
      const agentSession = createWarRoomAgentSession(db, {
        meeting_id: 'mtg-2',
        agent_id: 'rc1',
        session_id: 'cc-sess-xyz',
      });

      const turn1 = addWarRoomTurn(db, {
        agent_session_id: agentSession.id,
        meeting_id: 'mtg-2',
        input_source: 'voice',
        user_message: 'Premier message',
        agent_response: 'Première réponse',
      });

      const turn2 = addWarRoomTurn(db, {
        agent_session_id: agentSession.id,
        meeting_id: 'mtg-2',
        input_source: 'voice',
        user_message: 'Deuxième message',
        agent_response: 'Deuxième réponse',
      });

      // turn_number doit s'incrémenter automatiquement : 1, 2, ...
      expect(turn1.turn_number).toBe(1);
      expect(turn2.turn_number).toBe(2);

      // Vérification DB : 2 rows pour cette agent_session
      const rows = db
        .prepare(
          'SELECT * FROM warroom_turns WHERE agent_session_id = ? ORDER BY turn_number',
        )
        .all(agentSession.id) as Record<string, unknown>[];
      expect(rows).toHaveLength(2);
      expect(rows[0].turn_number).toBe(1);
      expect(rows[1].turn_number).toBe(2);
    });
  });

  // ── Test 3 : saveResumptionCheckpoint ────────────────────────────────

  describe('saveResumptionCheckpoint', () => {
    it('persists a checkpoint row with the provided message UUID', () => {
      const db = _testDb();
      createWarRoomMeeting('mtg-3', 'direct', 'main');
      const agentSession = createWarRoomAgentSession(db, {
        meeting_id: 'mtg-3',
        agent_id: 'rc2',
        session_id: 'cc-sess-resumption',
      });

      const checkpoint = saveResumptionCheckpoint(db, {
        agent_session_id: agentSession.id,
        from_message_id: 'msg-uuid-0042',
        reason: 'speaker_change',
      });

      expect(checkpoint).toBeDefined();
      expect(checkpoint.id).toBeTruthy();
      expect(checkpoint.agent_session_id).toBe(agentSession.id);
      expect(checkpoint.from_message_id).toBe('msg-uuid-0042');

      // Vérification DB directe
      const persisted = db
        .prepare('SELECT * FROM warroom_resumption_checkpoints WHERE id = ?')
        .get(checkpoint.id) as Record<string, unknown> | undefined;
      expect(persisted).toBeDefined();
      expect(persisted!.from_message_id).toBe('msg-uuid-0042');
    });
  });

  // ── Test 4 : Migration idempotence ───────────────────────────────────

  describe('migration idempotence', () => {
    it('calling _initTestDatabase() twice does not throw (CREATE TABLE IF NOT EXISTS)', () => {
      // Premier init dans beforeEach, un deuxième ici
      expect(() => {
        _initTestDatabase();
      }).not.toThrow();

      // Les 3 nouvelles tables doivent exister après double-init
      const db = _testDb();
      const tables = (
        db
          .prepare(
            `SELECT name FROM sqlite_master WHERE type='table' AND name IN (
              'warroom_agent_sessions', 'warroom_turns', 'warroom_resumption_checkpoints'
            )`,
          )
          .all() as Array<{ name: string }>
      ).map((r) => r.name);

      expect(tables).toContain('warroom_agent_sessions');
      expect(tables).toContain('warroom_turns');
      expect(tables).toContain('warroom_resumption_checkpoints');
    });
  });
});
