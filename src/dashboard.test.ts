/**
 * Tests for dashboard session-auth helpers: makeSessionToken + verifySessionToken.
 *
 * Dashboard.ts pulls in db/bot/agent/gemini/etc at import time. All heavy deps
 * are mocked so we can load the module and exercise the pure crypto helpers.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('./config.js', () => ({
  AGENT_ID: 'main',
  ALLOWED_CHAT_ID: 0,
  DASHBOARD_PORT: 3141,
  DASHBOARD_TOKEN: 'test-token',
  DASHBOARD_USER: '',
  DASHBOARD_PASSWORD: '',
  PROJECT_ROOT: '/tmp/ccos-test',
  STORE_DIR: '/tmp/ccos-test/store',
  WHATSAPP_ENABLED: false,
  SLACK_USER_TOKEN: '',
  CONTEXT_LIMIT: 100,
  agentDefaultModel: 'claude-opus-4',
  WARROOM_ENABLED: false,
  WARROOM_PORT: 7860,
  DB_ENCRYPTION_KEY: '',
}));

vi.mock('./db.js', () => ({
  getAllScheduledTasks: vi.fn(),
  deleteScheduledTask: vi.fn(),
  pauseScheduledTask: vi.fn(),
  resumeScheduledTask: vi.fn(),
  getConversationPage: vi.fn(),
  getDashboardMemoryStats: vi.fn(),
  getDashboardPinnedMemories: vi.fn(),
  getDashboardLowSalienceMemories: vi.fn(),
  getDashboardTopAccessedMemories: vi.fn(),
  getDashboardMemoryTimeline: vi.fn(),
  getDashboardConsolidations: vi.fn(),
  getDashboardMemoriesList: vi.fn(),
  getDashboardTokenStats: vi.fn(),
  getDashboardCostTimeline: vi.fn(),
  getDashboardRecentTokenUsage: vi.fn(),
  getSession: vi.fn(),
  getSessionTokenUsage: vi.fn(),
  getHiveMindEntries: vi.fn(),
  getAgentTokenStats: vi.fn(),
  getAgentRecentConversation: vi.fn(),
  getMissionTasks: vi.fn(),
  getMissionTask: vi.fn(),
  createMissionTask: vi.fn(),
  cancelMissionTask: vi.fn(),
  deleteMissionTask: vi.fn(),
  reassignMissionTask: vi.fn(),
  assignMissionTask: vi.fn(),
  getUnassignedMissionTasks: vi.fn(),
  getMissionTaskHistory: vi.fn(),
  getAuditLog: vi.fn(),
  getAuditLogCount: vi.fn(),
  getRecentBlockedActions: vi.fn(),
  createWarRoomMeeting: vi.fn(),
  endWarRoomMeeting: vi.fn(),
  addWarRoomTranscript: vi.fn(),
  getWarRoomMeetings: vi.fn(),
  getWarRoomTranscript: vi.fn(),
}));

vi.mock('./gemini.js', () => ({
  generateContent: vi.fn(),
  parseJsonResponse: vi.fn(),
}));

vi.mock('./security.js', () => ({
  getSecurityStatus: vi.fn(),
}));

vi.mock('./agent-config.js', () => ({
  listAgentIds: vi.fn(() => []),
  loadAgentConfig: vi.fn(),
  setAgentModel: vi.fn(),
}));

vi.mock('./agent-create.js', () => ({
  listTemplates: vi.fn(),
  validateAgentId: vi.fn(),
  validateBotToken: vi.fn(),
  createAgent: vi.fn(),
  activateAgent: vi.fn(),
  deactivateAgent: vi.fn(),
  deleteAgent: vi.fn(),
  suggestBotNames: vi.fn(),
  isAgentRunning: vi.fn(),
}));

vi.mock('./bot.js', () => ({
  processMessageFromDashboard: vi.fn(),
}));

vi.mock('./state.js', () => ({
  getTelegramConnected: vi.fn(() => false),
  getBotInfo: vi.fn(() => ({ username: '', name: '' })),
  chatEvents: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
  getIsProcessing: vi.fn(() => false),
  abortActiveQuery: vi.fn(),
}));

import { makeSessionToken, verifySessionToken } from './dashboard.js';

describe('makeSessionToken', () => {
  it('returns a non-empty string', () => {
    const token = makeSessionToken('alice');
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
  });

  it('produces a token with the expected "<base64>.<hex>" shape', () => {
    const token = makeSessionToken('alice');
    const dotIdx = token.indexOf('.');
    expect(dotIdx).toBeGreaterThan(0);
    // signature segment is hex
    expect(token.slice(dotIdx + 1)).toMatch(/^[0-9a-f]+$/);
  });
});

describe('verifySessionToken', () => {
  it('returns true for a token round-tripped through makeSessionToken', () => {
    const token = makeSessionToken('alice');
    expect(verifySessionToken(token)).toBe(true);
  });

  it('returns false for tokens with tampered payload', () => {
    const token = makeSessionToken('alice');
    const dotIdx = token.indexOf('.');
    const sig = token.slice(dotIdx + 1);
    // Replace payload with a forged "bob" entry; signature no longer matches.
    const forged = `${Buffer.from('bob:0').toString('base64')}.${sig}`;
    expect(verifySessionToken(forged)).toBe(false);
  });

  it('returns false for tokens with tampered signature', () => {
    const token = makeSessionToken('alice');
    const dotIdx = token.indexOf('.');
    const payloadB64 = token.slice(0, dotIdx);
    // Flip a bit of the signature — must stay hex + same length for timingSafeEqual.
    const sig = token.slice(dotIdx + 1);
    const flipped =
      (sig[0] === 'a' ? 'b' : 'a') + sig.slice(1);
    expect(verifySessionToken(`${payloadB64}.${flipped}`)).toBe(false);
  });

  it('returns false for strings missing the "." separator', () => {
    expect(verifySessionToken('')).toBe(false);
    expect(verifySessionToken('not-a-token')).toBe(false);
  });

  it('returns false for malformed signatures without throwing', () => {
    expect(verifySessionToken('abc.NOT_HEX')).toBe(false);
    expect(verifySessionToken('abc.')).toBe(false);
  });

  it('distinguishes tokens minted for different users', () => {
    const tokA = makeSessionToken('alice');
    const tokB = makeSessionToken('bob');
    expect(verifySessionToken(tokA)).toBe(true);
    expect(verifySessionToken(tokB)).toBe(true);
    // Swap payloads: re-use Alice's signature with Bob's payload → invalid.
    const [aPayload, aSig] = tokA.split('.');
    const [bPayload] = tokB.split('.');
    expect(aPayload).not.toBe(bPayload);
    expect(verifySessionToken(`${bPayload}.${aSig}`)).toBe(false);
  });
});
