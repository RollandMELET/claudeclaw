/**
 * Slice 2 — Session store étendu — Test 5 (intégration)
 *
 * Simule un meeting complet : start → 3 turns → end.
 * Vérifie que warroom_turns contient 3 rows avec turn_number 1, 2, 3
 * et un agent_session_id non nul.
 *
 * Choix : test vitest (intégration DB in-memory) plutôt que Playwright
 * car le scénario porte sur la persistance DB, pas sur l'UI.
 * Playwright est utilisé pour les specs UI (Slice 1, 3, etc.).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  _initTestDatabase,
  _testDb,
  createWarRoomMeeting,
  endWarRoomMeeting,
  addWarRoomTranscript,
  createWarRoomAgentSession,
  addWarRoomTurn,
} from './db.js';

describe('Slice 2 — warroom session persistence (integration)', () => {
  beforeEach(() => {
    _initTestDatabase();
  });

  it('after a 3-turn meeting, warroom_turns has 3 rows with turn_number 1/2/3 and a non-null agent_session_id', () => {
    const db = _testDb();

    // ── Phase 1 : Démarrage du meeting (équivalent POST /api/warroom/meeting/start) ──
    const meetingId = 'integration-mtg-001';
    createWarRoomMeeting(meetingId, 'direct', 'rc1');

    // Création de la session agent (équivalent interne de createWarRoomAgentSession)
    const agentSession = createWarRoomAgentSession(db, {
      meeting_id: meetingId,
      agent_id: 'rc1',
      session_id: 'cc-session-integ-42',
    });
    expect(agentSession.id).toBeTruthy();

    // ── Phase 2 : 3 tours de parole (équivalent POST /api/warroom/transcript × 3) ──
    const turnData = [
      { user_message: 'Question 1', agent_response: 'Réponse 1' },
      { user_message: 'Question 2', agent_response: 'Réponse 2' },
      { user_message: 'Question 3', agent_response: 'Réponse 3' },
    ];

    const turns = turnData.map((t) =>
      addWarRoomTurn(db, {
        agent_session_id: agentSession.id,
        meeting_id: meetingId,
        input_source: 'voice',
        user_message: t.user_message,
        agent_response: t.agent_response,
      }),
    );

    // Double-write : l'ancien addWarRoomTranscript continue aussi
    turnData.forEach((t) => addWarRoomTranscript(meetingId, 'user', t.user_message ?? ''));

    // ── Phase 3 : Fin du meeting (équivalent POST /api/warroom/meeting/end) ──
    endWarRoomMeeting(meetingId, turnData.length);

    // ── Assertions : warroom_turns contient 3 rows ──────────────────────────
    const rows = db
      .prepare(
        'SELECT * FROM warroom_turns WHERE meeting_id = ? ORDER BY turn_number',
      )
      .all(meetingId) as Array<{
      turn_number: number;
      agent_session_id: string;
      user_message: string | null;
    }>;

    expect(rows).toHaveLength(3);
    expect(rows[0].turn_number).toBe(1);
    expect(rows[1].turn_number).toBe(2);
    expect(rows[2].turn_number).toBe(3);

    // Chaque row doit avoir un agent_session_id non nul
    rows.forEach((row) => {
      expect(row.agent_session_id).toBeTruthy();
      expect(row.agent_session_id).toBe(agentSession.id);
    });

    // Sanity check : les turns[] retournés par la fonction ont aussi les bons numéros
    expect(turns[0].turn_number).toBe(1);
    expect(turns[1].turn_number).toBe(2);
    expect(turns[2].turn_number).toBe(3);
  });
});
