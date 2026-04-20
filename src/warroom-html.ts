/**
 * War Room dashboard page.
 * Cinematic voice meeting interface with agent team.
 * Plays entrance music, staggered agent reveal, live transcript.
 */
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function getWarRoomHtml(
  token: string,
  chatId: string,
  warroomPort: number,
  /** Slice 4 feature flag. Default true = show hybrid text input. */
  textInputEnabled: boolean = true,
  /** Slice 6 feature flag. Default true = show Resume button + allow POST. */
  resumeEnabled: boolean = true,
  /** Slice 7 feature flag. Default true = show the gear icon + Settings panel. */
  settingsEnabled: boolean = true,
): string {
  const safeToken = escapeHtml(token);
  const safeChatId = escapeHtml(chatId);
  const jsToken = JSON.stringify(token);
  const jsChatId = JSON.stringify(chatId);
  // Emitted to the client as a JSON string so the inline JS can probe it
  // the same way the server does. "1" / "0" keeps the ambient value small
  // and stable (avoids truthy/falsy surprises on tags like "yes"/"no").
  const jsTextInputFlag = textInputEnabled ? '"1"' : '"0"';
  const jsResumeFlag = resumeEnabled ? '"1"' : '"0"';
  const jsSettingsFlag = settingsEnabled ? '"1"' : '"0"';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>War Room</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #050505;
    color: #e0e0e0;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    height: 100vh;
    overflow: hidden;
  }

  /* ── Cinematic intro overlay ── */
  .intro-overlay {
    position: fixed;
    inset: 0;
    background: #000;
    z-index: 100;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    transition: opacity 1.5s ease;
  }
  .intro-overlay.fade-out {
    opacity: 0;
    pointer-events: none;
  }
  .intro-title {
    font-size: 48px;
    font-weight: 800;
    letter-spacing: 12px;
    text-transform: uppercase;
    color: #fff;
    opacity: 0;
    animation: titleReveal 2s ease forwards 0.5s;
  }
  .intro-subtitle {
    font-size: 14px;
    letter-spacing: 4px;
    text-transform: uppercase;
    color: #3b82f6;
    opacity: 0;
    margin-top: 12px;
    animation: titleReveal 1.5s ease forwards 1.5s;
  }
  .intro-line {
    width: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, #3b82f6, transparent);
    margin-top: 20px;
    animation: lineExpand 2s ease forwards 1s;
  }
  @keyframes titleReveal {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes lineExpand {
    from { width: 0; }
    to { width: 300px; }
  }

  /* ── Boardroom stage (between intro and app) ── */
  .stage {
    position: fixed;
    inset: 0;
    background:
      radial-gradient(ellipse 80% 60% at 50% 55%, #0b1022 0%, #050513 55%, #000 100%),
      #000;
    z-index: 95;
    display: none;
    opacity: 0;
    transition: opacity 1s ease;
    overflow: hidden;
  }
  .stage.active { display: block; opacity: 1; }
  .stage.fade-out { opacity: 0; pointer-events: none; }

  .stage-title {
    position: absolute;
    top: 8%;
    left: 50%;
    transform: translateX(-50%);
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 5px;
    text-transform: uppercase;
    color: rgba(99, 102, 241, 0.6);
    opacity: 0;
    transition: opacity 1s ease 0.2s;
  }
  .stage.active .stage-title { opacity: 1; }

  /* Subtle light beam behind the table */
  .stage-beam {
    position: absolute;
    top: 18%;
    left: 50%;
    width: 700px;
    height: 500px;
    background: radial-gradient(ellipse at center top, rgba(99,102,241,0.12) 0%, rgba(99,102,241,0) 70%);
    transform: translateX(-50%);
    pointer-events: none;
  }

  .table-wrap {
    position: absolute;
    left: 50%;
    top: 58%;
    width: 560px;
    height: 280px;
    transform: translate(-50%, -50%);
  }
  .table-surface {
    position: absolute;
    inset: 0;
    border-radius: 50% / 50%;
    background:
      radial-gradient(ellipse at 50% 40%, #1a1f3a 0%, #0d1126 60%, #05060f 100%);
    border: 1px solid rgba(99, 102, 241, 0.35);
    box-shadow:
      0 0 50px rgba(99, 102, 241, 0.18),
      inset 0 0 60px rgba(0,0,0,0.7),
      inset 0 -20px 40px rgba(0,0,0,0.5);
  }
  .table-rim {
    position: absolute;
    inset: 6px;
    border-radius: 50% / 50%;
    border: 1px solid rgba(255, 255, 255, 0.04);
    pointer-events: none;
  }

  /* Avatars that arrange around the table, then fly to the sidebar */
  .stage-avatar {
    position: absolute;
    width: 78px;
    height: 78px;
    border-radius: 50%;
    overflow: hidden;
    border: 2px solid rgba(255,255,255,0.12);
    box-shadow: 0 0 0 1px rgba(99,102,241,0.25), 0 10px 30px rgba(0,0,0,0.6);
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%) translate(var(--target-x, 0px), var(--target-y, 0px)) scale(0.2);
    opacity: 0;
    transition:
      opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1),
      transform 0.9s cubic-bezier(0.16, 1, 0.3, 1),
      width 0.7s ease,
      height 0.7s ease;
  }
  .stage-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .stage-avatar.seated {
    opacity: 1;
    transform: translate(-50%, -50%) translate(var(--seat-x), var(--seat-y)) scale(1);
  }
  .stage-avatar.flying {
    transition:
      opacity 0.9s ease,
      transform 0.9s cubic-bezier(0.65, 0, 0.35, 1),
      width 0.9s cubic-bezier(0.65, 0, 0.35, 1),
      height 0.9s cubic-bezier(0.65, 0, 0.35, 1);
    transform: translate(-50%, -50%) translate(var(--fly-x), var(--fly-y)) scale(1);
  }
  .stage-avatar.landed {
    opacity: 0;
  }

  .stage-nameplate {
    position: absolute;
    left: 50%;
    top: 0;
    transform: translate(-50%, calc(100% + 8px));
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: rgba(255,255,255,0.55);
    white-space: nowrap;
    opacity: 0;
    transition: opacity 0.5s ease 0.3s;
  }
  .stage-avatar.seated .stage-nameplate { opacity: 1; }

  /* ── Main layout ── */
  .app {
    height: 100vh;
    display: flex;
    flex-direction: column;
    opacity: 0;
    transition: opacity 1s ease;
  }
  .app.visible { opacity: 1; }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 24px;
    background: rgba(10,10,10,0.95);
    border-bottom: 1px solid rgba(255,255,255,0.06);
    backdrop-filter: blur(20px);
    z-index: 10;
  }
  .header h1 {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 3px;
    text-transform: uppercase;
    color: #3b82f6;
  }
  .header .back-link {
    color: #444;
    text-decoration: none;
    font-size: 12px;
    transition: color 0.2s;
  }
  .header .back-link:hover { color: #888; }
  .header .cost-display {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    color: #333;
  }

  .main { flex: 1; display: flex; overflow: hidden; }

  /* ── Agent panel ── */
  .agents-panel {
    width: 300px;
    background: rgba(8,8,8,0.95);
    border-right: 1px solid rgba(255,255,255,0.04);
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow-y: auto;
  }
  .panel-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #333;
    margin-bottom: 4px;
  }

  .agent-card {
    background: rgba(255,255,255,0.02);
    border: 1px solid rgba(255,255,255,0.04);
    border-radius: 12px;
    padding: 14px 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    opacity: 0;
    transform: translateX(-20px);
    transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    cursor: pointer;
    position: relative;
  }
  .agent-card.revealed {
    opacity: 1;
    transform: translateX(0);
  }
  .agent-card:hover {
    background: rgba(255,255,255,0.04);
    border-color: rgba(255,255,255,0.08);
  }
  .agent-card.speaking {
    border-color: rgba(34, 197, 94, 0.4);
    background: rgba(34, 197, 94, 0.05);
    box-shadow: 0 0 20px rgba(34, 197, 94, 0.08);
  }
  .agent-card.thinking {
    border-color: rgba(245, 158, 11, 0.3);
    background: rgba(245, 158, 11, 0.03);
  }
  .agent-card.pinned {
    border-color: rgba(99, 102, 241, 0.5);
    background: rgba(99, 102, 241, 0.07);
    box-shadow: 0 0 22px rgba(99, 102, 241, 0.12);
  }
  .agent-card.pinned::after {
    content: 'PINNED';
    position: absolute;
    top: 6px;
    right: 8px;
    font-size: 8px;
    font-weight: 800;
    letter-spacing: 1.5px;
    color: #818cf8;
    background: rgba(99, 102, 241, 0.12);
    padding: 2px 6px;
    border-radius: 4px;
  }

  /* Hand-up animation for auto mode. Fires when Gemini's router picks
     this agent via answer_as_agent, a beat before the agent's answer
     is spoken. The card lifts, glows amber, and a small raised-hand
     glyph appears in the corner. */
  .agent-card.hand-up {
    border-color: rgba(251, 191, 36, 0.7);
    background: rgba(251, 191, 36, 0.08);
    box-shadow: 0 0 26px rgba(251, 191, 36, 0.2);
    transform: translateX(0) translateY(-3px) scale(1.02);
  }
  .agent-card.hand-up::before {
    content: '✋';
    position: absolute;
    top: -10px;
    right: -6px;
    font-size: 18px;
    animation: hand-wave 0.9s ease-out;
  }
  @keyframes hand-wave {
    0%   { transform: rotate(-20deg) scale(0.4); opacity: 0; }
    30%  { transform: rotate(8deg) scale(1.2); opacity: 1; }
    60%  { transform: rotate(-4deg) scale(1); opacity: 1; }
    100% { transform: rotate(0deg) scale(1); opacity: 1; }
  }

  /* Mode selector styling */
  .mode-selector {
    display: flex;
    gap: 4px;
    background: rgba(0,0,0,0.3);
    border-radius: 8px;
    padding: 3px;
  }
  .mode-btn {
    flex: 1;
    background: transparent;
    border: none;
    color: rgba(255,255,255,0.5);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    padding: 6px 4px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  .mode-btn:hover {
    color: rgba(255,255,255,0.8);
  }
  .mode-btn.active {
    background: rgba(251, 191, 36, 0.15);
    color: #fbbf24;
    box-shadow: 0 0 10px rgba(251, 191, 36, 0.1);
  }
  .mode-btn.switching {
    opacity: 0.4;
    pointer-events: none;
  }

  .agent-avatar {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    font-weight: 800;
    color: #fff;
    flex-shrink: 0;
    position: relative;
    overflow: hidden;
  }
  .agent-avatar::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 2px solid rgba(255,255,255,0.1);
  }

  .agent-info { flex: 1; min-width: 0; }
  .agent-name { font-size: 13px; font-weight: 700; color: #e0e0e0; }
  .agent-role { font-size: 11px; color: #555; margin-top: 2px; }

  .agent-indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #1a1a1a;
    flex-shrink: 0;
    transition: all 0.3s;
  }
  .agent-indicator.online { background: #22c55e; box-shadow: 0 0 8px rgba(34,197,94,0.4); }
  .agent-indicator.busy { background: #f59e0b; animation: pulse 1.5s ease-in-out infinite; }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  /* ── Transcript ── */
  .transcript-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: rgba(5,5,5,0.95);
    position: relative; /* anchor for the absolutely-positioned archive panel */
  }
  .transcript-area {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
    scroll-behavior: smooth;
  }
  .transcript-area::-webkit-scrollbar { width: 4px; }
  .transcript-area::-webkit-scrollbar-thumb { background: #222; border-radius: 4px; }

  .transcript-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 8px;
  }
  .transcript-placeholder .icon { font-size: 32px; opacity: 0.15; }
  .transcript-placeholder .text { font-size: 13px; color: #333; }

  .transcript-entry {
    margin-bottom: 20px;
    animation: entrySlide 0.3s ease;
  }
  @keyframes entrySlide {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .transcript-speaker {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 1px;
    text-transform: uppercase;
    margin-bottom: 4px;
  }
  .transcript-speaker.user { color: #60a5fa; }
  .transcript-speaker.agent { color: #22c55e; }
  .transcript-speaker.system { color: #333; }
  .transcript-text {
    font-size: 14px;
    line-height: 1.6;
    color: #aaa;
  }
  .transcript-text.system-text { color: #333; font-size: 12px; }

  /* ── Archive view (Slice 3, Past Meetings) ── */
  /* Header button: compact, matches .back-link + .mode-btn tone. */
  .btn-archive {
    background: transparent;
    border: 1px solid rgba(255,255,255,0.08);
    color: rgba(255,255,255,0.55);
    font-family: 'Inter', sans-serif;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.5px;
    padding: 6px 14px;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    margin-left: 16px;
  }
  .btn-archive:hover {
    background: rgba(255,255,255,0.04);
    color: #fff;
    border-color: rgba(255,255,255,0.12);
  }
  .btn-archive.active {
    background: rgba(59,130,246,0.1);
    border-color: rgba(59,130,246,0.25);
    color: #3b82f6;
  }

  .archive-panel {
    position: absolute;
    inset: 0;
    background: rgba(5,5,5,0.98);
    display: none;
    flex-direction: column;
    z-index: 8;
    overflow: hidden;
  }
  .archive-panel.visible { display: flex; }
  .archive-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 28px;
    border-bottom: 1px solid rgba(255,255,255,0.04);
  }
  .archive-header .archive-title {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #3b82f6;
  }
  .archive-back-btn {
    background: transparent;
    border: 1px solid rgba(255,255,255,0.08);
    color: rgba(255,255,255,0.65);
    font-family: 'Inter', sans-serif;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.5px;
    padding: 6px 14px;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
  }
  .archive-back-btn:hover {
    background: rgba(255,255,255,0.04);
    color: #fff;
  }

  .archive-body {
    flex: 1;
    overflow-y: auto;
    padding: 20px 28px;
  }
  .archive-body::-webkit-scrollbar { width: 4px; }
  .archive-body::-webkit-scrollbar-thumb { background: #222; border-radius: 4px; }

  .archive-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 10px;
    padding: 40px;
  }
  .archive-empty .icon { font-size: 36px; opacity: 0.18; }
  .archive-empty .text {
    font-size: 13px;
    color: #555;
    letter-spacing: 0.5px;
  }

  .archive-row {
    display: grid;
    grid-template-columns: 1fr auto auto auto auto;
    gap: 16px;
    align-items: center;
    padding: 14px 16px;
    margin-bottom: 8px;
    background: rgba(255,255,255,0.02);
    border: 1px solid rgba(255,255,255,0.04);
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .archive-row:hover {
    background: rgba(255,255,255,0.05);
    border-color: rgba(59,130,246,0.2);
  }
  .archive-row .col-date {
    font-size: 13px;
    color: #ddd;
    font-weight: 500;
  }
  .archive-row .col-agent {
    font-size: 11px;
    color: #22c55e;
    font-weight: 600;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }
  .archive-row .col-duration,
  .archive-row .col-mode,
  .archive-row .col-entries {
    font-size: 11px;
    color: #666;
    font-family: 'JetBrains Mono', monospace;
  }

  .archive-detail-header {
    padding: 6px 0 18px;
    border-bottom: 1px solid rgba(255,255,255,0.04);
    margin-bottom: 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
  }
  .archive-detail-header .meta {
    font-size: 11px;
    color: #666;
    font-family: 'JetBrains Mono', monospace;
    letter-spacing: 0.5px;
  }
  .archive-detail-header .meta strong {
    color: #ddd;
    font-weight: 600;
  }

  /* Slice 6 — Resume button in archive detail + live-view badge. */
  .resume-btn {
    background: rgba(59,130,246,0.1);
    border: 1px solid rgba(59,130,246,0.3);
    color: #3b82f6;
    font-family: 'Inter', sans-serif;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.4px;
    padding: 8px 16px;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }
  .resume-btn:hover:not(:disabled) {
    background: rgba(59,130,246,0.2);
    color: #fff;
    border-color: rgba(59,130,246,0.5);
  }
  .resume-btn:disabled { opacity: 0.4; cursor: wait; }

  .resume-badge {
    position: fixed;
    top: 70px;
    right: 24px;
    z-index: 9;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    background: rgba(59,130,246,0.12);
    border: 1px solid rgba(59,130,246,0.3);
    border-radius: 10px;
    color: #93c5fd;
    font-family: 'Inter', sans-serif;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.5px;
    box-shadow: 0 2px 12px rgba(59,130,246,0.12);
    animation: badgeSlideIn 0.25s ease;
  }
  .resume-badge .dismiss {
    cursor: pointer;
    opacity: 0.6;
    font-size: 14px;
    line-height: 1;
    padding: 0 2px;
  }
  .resume-badge .dismiss:hover { opacity: 1; }
  @keyframes badgeSlideIn {
    from { transform: translateY(-6px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }

  /* Slice 7 — Settings panel (overlay over the transcript, like Archive). */
  .btn-settings {
    background: transparent;
    border: 1px solid rgba(255,255,255,0.08);
    color: rgba(255,255,255,0.55);
    font-family: 'Inter', sans-serif;
    font-size: 13px;
    padding: 5px 10px;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    margin-left: 8px;
    line-height: 1;
  }
  .btn-settings:hover {
    background: rgba(255,255,255,0.04);
    color: #fff;
    border-color: rgba(255,255,255,0.12);
  }
  .btn-settings.active {
    background: rgba(59,130,246,0.1);
    border-color: rgba(59,130,246,0.25);
    color: #3b82f6;
  }

  .settings-panel {
    position: absolute;
    inset: 0;
    background: rgba(5,5,5,0.98);
    display: none;
    flex-direction: column;
    z-index: 8;
    overflow: hidden;
  }
  .settings-panel.visible { display: flex; }
  .settings-panel .section {
    margin-bottom: 26px;
  }
  .settings-panel .section-title {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #3b82f6;
    margin-bottom: 12px;
  }
  .settings-panel .section-hint {
    font-size: 11px;
    color: #555;
    margin-bottom: 12px;
  }
  .settings-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    background: rgba(255,255,255,0.02);
    border: 1px solid rgba(255,255,255,0.04);
    border-radius: 8px;
    margin-bottom: 6px;
  }
  .settings-row .sr-main {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    flex: 1;
  }
  .settings-row .sr-name {
    font-size: 13px;
    color: #ddd;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .settings-row .sr-desc {
    font-size: 11px;
    color: #666;
    font-family: 'JetBrains Mono', monospace;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .settings-row .sr-actions {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .reorder-btn {
    background: transparent;
    border: 1px solid rgba(255,255,255,0.08);
    color: rgba(255,255,255,0.5);
    width: 26px;
    height: 26px;
    border-radius: 6px;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    line-height: 1;
  }
  .reorder-btn:hover:not(:disabled) {
    background: rgba(255,255,255,0.05);
    color: #fff;
  }
  .reorder-btn:disabled { opacity: 0.25; cursor: not-allowed; }
  .toggle-wrap {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: #888;
    cursor: pointer;
    user-select: none;
  }
  .toggle-wrap input[type="checkbox"] {
    accent-color: #3b82f6;
    cursor: pointer;
  }

  .add-obsidian-form {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    padding: 14px;
    background: rgba(255,255,255,0.02);
    border: 1px solid rgba(255,255,255,0.04);
    border-radius: 10px;
  }
  .add-obsidian-form label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 10px;
    color: rgba(255,255,255,0.5);
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }
  .add-obsidian-form label.full { grid-column: 1 / -1; }
  .add-obsidian-form input,
  .add-obsidian-form select {
    padding: 8px 10px;
    border-radius: 6px;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(0,0,0,0.25);
    color: #ddd;
    font-family: 'Inter', sans-serif;
    font-size: 12px;
  }
  .add-obsidian-form input:focus,
  .add-obsidian-form select:focus {
    outline: none;
    border-color: rgba(59,130,246,0.4);
  }
  .add-obsidian-form .submit-row {
    grid-column: 1 / -1;
    display: flex;
    gap: 10px;
    align-items: center;
  }
  .save-settings-row {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid rgba(255,255,255,0.04);
  }
  .save-settings-row .save-feedback {
    font-size: 11px;
    color: #10b981;
  }
  .save-settings-row .save-feedback.error { color: #ef4444; }

  .archive-entry {
    display: grid;
    grid-template-columns: 80px 100px 1fr;
    gap: 14px;
    padding: 10px 0;
    border-bottom: 1px solid rgba(255,255,255,0.03);
    align-items: flex-start;
  }
  .archive-entry:last-child { border-bottom: none; }
  .archive-entry .times {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: #555;
  }
  .archive-entry .times .absolute {
    color: #888;
    font-weight: 500;
  }
  .archive-entry .times .relative {
    color: #3b82f6;
  }
  .archive-entry .speaker {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: #22c55e;
    padding-top: 2px;
  }
  .archive-entry .speaker.user { color: #60a5fa; }
  .archive-entry .speaker.system { color: #555; }
  .archive-entry .text {
    font-size: 13px;
    line-height: 1.55;
    color: #bbb;
    word-break: break-word;
  }

  /* ── Controls ── */
  .controls {
    padding: 16px 24px;
    background: rgba(10,10,10,0.95);
    border-top: 1px solid rgba(255,255,255,0.04);
    display: flex;
    align-items: center;
    gap: 14px;
    backdrop-filter: blur(20px);
  }

  .btn {
    padding: 10px 28px;
    border-radius: 10px;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.03);
    color: #ccc;
    font-family: 'Inter', sans-serif;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    letter-spacing: 0.3px;
  }
  .btn:hover { background: rgba(255,255,255,0.06); }
  .btn.start { background: rgba(34,197,94,0.1); border-color: rgba(34,197,94,0.2); color: #22c55e; }
  .btn.start:hover { background: rgba(34,197,94,0.15); }
  .btn.end { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.2); color: #ef4444; }
  .btn.end:hover { background: rgba(239,68,68,0.15); }

  .mic-btn {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    border: 2px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.02);
    color: #555;
    font-size: 20px;
    cursor: pointer;
    transition: all 0.3s;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .mic-btn:hover { border-color: rgba(255,255,255,0.15); color: #888; }
  .mic-btn.recording {
    background: rgba(239,68,68,0.15);
    border-color: rgba(239,68,68,0.4);
    color: #ef4444;
    box-shadow: 0 0 20px rgba(239,68,68,0.15);
    animation: pulse 1.5s ease-in-out infinite;
  }

  .status-text {
    font-size: 12px;
    color: #333;
    text-align: center;
    font-family: 'JetBrains Mono', monospace;
    white-space: nowrap;
  }

  /* ── Hybrid text input (Slice 4) ── */
  .text-input-row {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 220px;
    max-width: 520px;
  }
  .text-input-row input[type="text"] {
    flex: 1;
    min-width: 0;
    padding: 10px 14px;
    border-radius: 10px;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.02);
    color: #ddd;
    font-family: 'Inter', sans-serif;
    font-size: 13px;
    transition: all 0.2s;
  }
  .text-input-row input[type="text"]::placeholder {
    color: rgba(255,255,255,0.25);
  }
  .text-input-row input[type="text"]:focus {
    outline: none;
    border-color: rgba(59,130,246,0.4);
    background: rgba(255,255,255,0.04);
  }
  .text-input-row input[type="text"]:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
  .text-input-row .send-btn {
    background: rgba(59,130,246,0.1);
    border: 1px solid rgba(59,130,246,0.2);
    color: #3b82f6;
    font-family: 'Inter', sans-serif;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.5px;
    padding: 10px 16px;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .text-input-row .send-btn:hover:not(:disabled) {
    background: rgba(59,130,246,0.18);
    color: #fff;
  }
  .text-input-row .send-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  /* ── Live mic waveform ── */
  .wave-wrap {
    flex: 1;
    height: 48px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 12px;
    background: rgba(255,255,255,0.015);
    border: 1px solid rgba(255,255,255,0.04);
    border-radius: 10px;
    min-width: 0;
  }
  .wave-wrap .wave-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: #333;
    flex-shrink: 0;
  }
  .wave-wrap.active .wave-label { color: #22c55e; }
  #micWaveCanvas {
    flex: 1;
    height: 36px;
    display: block;
    min-width: 0;
  }
  .wave-level {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: #333;
    flex-shrink: 0;
    width: 28px;
    text-align: right;
  }
  .wave-wrap.active .wave-level { color: #22c55e; }

  .mode-selector {
    display: flex;
    gap: 2px;
    padding: 3px;
    background: rgba(255,255,255,0.02);
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.04);
  }
  .mode-btn {
    padding: 5px 12px;
    border-radius: 6px;
    border: none;
    background: transparent;
    color: #444;
    font-size: 11px;
    font-family: 'Inter', sans-serif;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }
  .mode-btn:hover { color: #666; }
  .mode-btn.active { background: rgba(59,130,246,0.1); color: #3b82f6; }

  /* ── Audio visualizer ring (around speaking agent) ── */
  @keyframes audioRing {
    0% { box-shadow: 0 0 0 0 rgba(34,197,94,0.3); }
    70% { box-shadow: 0 0 0 10px rgba(34,197,94,0); }
    100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); }
  }
  .agent-card.speaking .agent-avatar {
    animation: audioRing 1.2s ease-in-out infinite;
  }

  /* ── Mobile responsive ── */
  @media (max-width: 768px) {
    .main {
      flex-direction: column;
    }
    .agents-panel {
      width: 100%;
      flex-direction: row;
      overflow-x: auto;
      overflow-y: hidden;
      padding: 12px;
      gap: 8px;
      border-right: none;
      border-bottom: 1px solid rgba(255,255,255,0.04);
      max-height: 110px;
    }
    .agents-panel .panel-label {
      display: none;
    }
    .agents-panel .mode-selector {
      display: none;
    }
    .agent-card {
      flex: 0 0 auto;
      min-width: 100px;
      padding: 10px 12px;
      gap: 8px;
    }
    .agent-card .agent-info .agent-role {
      display: none;
    }
    .agent-avatar {
      width: 32px !important;
      height: 32px !important;
    }
    .agent-avatar img {
      width: 28px !important;
      height: 28px !important;
    }
    .transcript {
      padding: 12px;
    }
    .controls {
      padding: 10px 12px;
      gap: 8px;
      flex-wrap: wrap;
    }
    .btn {
      padding: 8px 16px;
      font-size: 12px;
      flex: 1;
      min-width: 0;
    }
    .mic-btn {
      width: 44px;
      height: 44px;
    }
    .waveform-wrap {
      flex: 1;
      min-width: 80px;
    }
    .waveform-wrap canvas {
      height: 36px !important;
    }
    .header {
      padding: 8px 12px;
    }
    .header .back-link {
      font-size: 11px;
    }
    .header .title {
      font-size: 14px;
    }
    /* Skip cinematic intro on mobile for faster access */
    .stage {
      display: none !important;
    }
  }
</style>
</head>
<body>

<!-- Cinematic intro (click to enter, which also satisfies Chrome autoplay policy) -->
<div class="intro-overlay" id="introOverlay" onclick="enterWarRoom()" style="cursor:pointer">
  <div class="intro-title">War Room</div>
  <div class="intro-line"></div>
  <div class="intro-subtitle" id="introSubtitle">Click to enter</div>
</div>

<!-- Boardroom stage: shows the agents assembling around the table, then flying out to the sidebar -->
<div class="stage" id="stage">
  <div class="stage-beam"></div>
  <div class="stage-title">Assembling your war council</div>
  <div class="table-wrap">
    <div class="table-surface"></div>
    <div class="table-rim"></div>
    <div class="stage-avatar" data-agent="main" style="--seat-x:0px;--seat-y:-150px">
      <img src="/warroom-avatar/main?token=${safeToken}" alt="Main">
      <div class="stage-nameplate">MAIN</div>
    </div>
    <div class="stage-avatar" data-agent="research" style="--seat-x:-250px;--seat-y:-40px">
      <img src="/warroom-avatar/research?token=${safeToken}" alt="Research">
      <div class="stage-nameplate">RESEARCH</div>
    </div>
    <div class="stage-avatar" data-agent="comms" style="--seat-x:250px;--seat-y:-40px">
      <img src="/warroom-avatar/comms?token=${safeToken}" alt="Comms">
      <div class="stage-nameplate">COMMS</div>
    </div>
    <div class="stage-avatar" data-agent="content" style="--seat-x:-165px;--seat-y:135px">
      <img src="/warroom-avatar/content?token=${safeToken}" alt="Content">
      <div class="stage-nameplate">CONTENT</div>
    </div>
    <div class="stage-avatar" data-agent="ops" style="--seat-x:165px;--seat-y:135px">
      <img src="/warroom-avatar/ops?token=${safeToken}" alt="Ops">
      <div class="stage-nameplate">OPS</div>
    </div>
  </div>
</div>

<!-- Background music -->
<audio id="bgMusic" loop preload="auto">
  <source src="/warroom-music?token=${safeToken}" type="audio/mpeg">
</audio>

<!-- Pipecat client SDK (bundled) -->
<script src="/warroom-client.js?token=${safeToken}&v=${Date.now()}"></script>

<!-- Main app (hidden during intro) -->
<div class="app" id="app">
  <div class="header">
    <a href="/?token=${safeToken}&chatId=${safeChatId}" class="back-link">&larr; Mission Control</a>
    <h1>War Room</h1>
    <div style="display:flex;align-items:center;gap:10px">
      <!-- Slice 3: Past Meetings archive (read-only). Toggles the overlay panel. -->
      <button type="button" class="btn-archive" id="pastMeetingsBtn" onclick="togglePastMeetings()">Past Meetings</button>
      ${settingsEnabled ? '<!-- Slice 7: Settings panel (roster management). -->\n      <button type="button" class="btn-settings" id="settingsBtn" title="Settings" aria-label="Settings" onclick="toggleSettings()">&#9881;</button>' : ''}
      <div class="cost-display" id="costDisplay">$0.000</div>
    </div>
  </div>

  <div class="main">
    <div class="agents-panel">
      <div class="panel-label">Your Team</div>

      <!-- Agent cards rendered dynamically from /api/warroom/agents -->
      <div id="agent-cards-container"></div>

      <div style="margin-top:auto;padding-top:12px;border-top:1px solid rgba(255,255,255,0.04)">
        <div class="panel-label" style="margin-bottom:8px">Meeting Mode</div>
        <div class="mode-selector">
          <button class="mode-btn active" id="mode-direct" onclick="setMode('direct',this)">Direct</button>
          <button class="mode-btn" id="mode-auto" onclick="setMode('auto',this)">Hand&nbsp;Up</button>
        </div>
        <div style="font-size:10px;color:rgba(255,255,255,0.35);margin-top:6px;line-height:1.4">
          <span id="mode-hint">Direct: talk to the pinned agent. Hand Up: the team listens, best-fit answers.</span>
        </div>
        <div style="margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.04)">
          <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:10px;color:rgba(255,255,255,0.4)">
            <span>&#9835; Entrance music</span>
            <input type="file" accept="audio/mpeg,audio/*" style="display:none" onchange="uploadMusic(this)">
            <span style="text-decoration:underline;color:rgba(255,255,255,0.55)">upload</span>
          </label>
          <span id="musicStatus" style="font-size:10px;color:#10b981;margin-left:6px;display:none">saved</span>
        </div>
      </div>
    </div>

    <div class="transcript-panel">
      <div class="transcript-area" id="transcript">
        <div class="transcript-placeholder" id="placeholder">
          <div class="icon">&#127908;</div>
          <div class="text">Start a meeting to begin</div>
        </div>
      </div>

      <!-- Slice 3: archive overlay. Hidden by default; togglePastMeetings() reveals it. -->
      <div class="archive-panel" id="archivePanel" aria-hidden="true">
        <div class="archive-header">
          <div class="archive-title" id="archiveTitle">Past Meetings</div>
          <button type="button" class="archive-back-btn" id="archiveBackBtn" onclick="closeArchive()">&larr; Back to Live</button>
        </div>
        <div class="archive-body" id="archiveBody">
          <!-- Populated by renderArchiveList() / renderArchiveDetail(). -->
        </div>
      </div>

      ${settingsEnabled ? `<!-- Slice 7: settings overlay. Hidden by default; toggleSettings() reveals it. -->
      <div class="settings-panel" id="settingsPanel" aria-hidden="true">
        <div class="archive-header">
          <div class="archive-title">Settings</div>
          <button type="button" class="archive-back-btn" onclick="closeSettings()">&larr; Back to Live</button>
        </div>
        <div class="archive-body" id="settingsBody">
          <!-- Populated by renderSettings(). -->
        </div>
      </div>` : ''}

      <div class="controls">
        <button class="btn start" id="meetingBtn" onclick="toggleMeeting()">Start Meeting</button>
        <button class="mic-btn" id="micBtn" onclick="toggleMic()" disabled>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
        </button>
        ${textInputEnabled ? `<div class="text-input-row">
          <input type="text" id="warroomTextInput" placeholder="Type to inject into the meeting, Enter to send"
                 autocomplete="off" autocapitalize="sentences"
                 onkeydown="if(event.key==='Enter'){event.preventDefault();sendWarRoomText();}" />
          <button type="button" class="send-btn" id="warroomTextSendBtn" onclick="sendWarRoomText()">Send</button>
        </div>` : ''}
        <div class="wave-wrap" id="waveWrap">
          <div class="wave-label">MIC</div>
          <canvas id="micWaveCanvas"></canvas>
          <div class="wave-level" id="waveLevel">--</div>
        </div>
        <div class="status-text" id="statusText">ready</div>
      </div>
    </div>
  </div>
</div>

<script>
const TOKEN = ${jsToken};
const CHAT_ID = ${jsChatId};
const WARROOM_PORT = ${warroomPort};
const API_BASE = window.location.origin;

let meetingActive = false;
var currentMeetingId = null;
var transcriptEntryCount = 0;
let micActive = false;
let currentMode = 'direct';
let totalCost = 0;
let meetingStartTime = null;
let ws = null;

// ── Cinematic intro sequence ──
// Triggered by user click on the intro overlay (required for Chrome autoplay policy)
// Stages:
//   1. Intro title ("War Room") fades out (~1.5s)
//   2. Boardroom stage fades in: oval table + subtle beam
//   3. Five agent avatars slide/scale in to their table seats (staggered, ~1.8s)
//   4. Hold the group shot (~1.2s)
//   5. Measure sidebar target positions and "fly" each avatar from the table
//      to its sidebar slot (~0.9s)
//   6. Reveal the real sidebar cards, fade out the stage
var entered = false;
function enterWarRoom() {
  if (entered) return;
  entered = true;

  // Start music (user just clicked, so autoplay is allowed)
  // Skip music on mobile (no cinematic intro, so no time for it to play)
  var isMobile = window.innerWidth <= 768;
  var music = document.getElementById('bgMusic');
  if (music && !isMobile) {
    music.volume = 0.3;
    music.play().catch(function(){});
  }

  // Stage 1 → 2: fade the intro, show the boardroom
  setTimeout(function() {
    var overlay = document.getElementById('introOverlay');
    if (overlay) overlay.classList.add('fade-out');
    var stage = document.getElementById('stage');
    if (stage) stage.classList.add('active');
  }, 1300);

  // Stage 3: seat the agents around the table, staggered
  var seatDelays = [1900, 2150, 2400, 2650, 2900];
  var stageAvatars = null;
  setTimeout(function() {
    stageAvatars = document.querySelectorAll('.stage-avatar');
    stageAvatars.forEach(function(av, i) {
      setTimeout(function() { av.classList.add('seated'); }, seatDelays[i] - 1900);
    });
  }, 1900);

  // Remove the intro overlay from the DOM once it's finished fading
  setTimeout(function() {
    var overlay = document.getElementById('introOverlay');
    if (overlay) overlay.remove();
  }, 3200);

  // Stage 4 → 5: after hold, fly the avatars to their sidebar slots
  setTimeout(function() { flyToSidebar(); }, 4300);
}

function flyToSidebar() {
  // Show the app so its sidebar cards have layout, but keep the cards
  // invisible until we're ready to reveal them. We temporarily neutralize
  // the cards' entrance transform (translateX(-20px)) and transitions so
  // getBoundingClientRect returns the FINAL resting position, not a
  // translated one. Without this the flying avatars land 20px to the
  // right of where the real sidebar slots end up.
  var app = document.getElementById('app');
  app.classList.add('visible');

  var cards = document.querySelectorAll('.agent-card');
  cards.forEach(function(c) {
    c.style.transition = 'none';
    c.style.transform = 'translateX(0)';
  });
  // Force a reflow so the style changes commit before we measure
  void document.body.offsetHeight;

  var stageAvatars = document.querySelectorAll('.stage-avatar');
  var cx0 = window.innerWidth / 2;
  var cy0 = window.innerHeight / 2;

  stageAvatars.forEach(function(av) {
    var id = av.getAttribute('data-agent');
    var target = document.querySelector('#agent-' + id + ' .agent-avatar');
    if (!target) return;
    var r = target.getBoundingClientRect();
    var tx = r.left + r.width / 2;
    var ty = r.top + r.height / 2;
    av.style.setProperty('--fly-x', (tx - cx0) + 'px');
    av.style.setProperty('--fly-y', (ty - cy0) + 'px');
    av.style.width = r.width + 'px';
    av.style.height = r.height + 'px';
  });

  // Force a reflow so the --fly-x/--fly-y writes flush before adding
  // .flying (which transitions to those custom-property values). We
  // intentionally do NOT wrap this in requestAnimationFrame — rAF is
  // throttled or paused entirely in some headless/background-tab
  // conditions, which would leave the avatars stuck at their seats.
  void document.body.offsetHeight;
  stageAvatars.forEach(function(av) { av.classList.add('flying'); });

  // Restore the cards' normal transition and transform behavior so the
  // .revealed class we apply below takes effect the usual way
  cards.forEach(function(c) {
    c.style.transition = '';
    c.style.transform = '';
  });

  // Near the end of the flight, reveal the real sidebar cards (their
  // 0.4s fade-in overlaps the last moment of the avatar flight so the
  // handoff is seamless).
  setTimeout(function() {
    cards.forEach(function(c) { c.classList.add('revealed'); });
  }, 750);

  // After the flight lands, hide the flying avatars and fade the stage
  setTimeout(function() {
    stageAvatars.forEach(function(av) { av.classList.add('landed'); });
    var stage = document.getElementById('stage');
    if (stage) stage.classList.add('fade-out');
    setTimeout(function() { if (stage) stage.remove(); }, 1100);
  }, 950);
}

// ── Mode switching ──
// Upload custom entrance music
async function uploadMusic(input) {
  if (!input.files || !input.files[0]) return;
  var file = input.files[0];
  if (file.size > 20 * 1024 * 1024) { alert('Max 20MB'); return; }
  var form = new FormData();
  form.append('file', file);
  try {
    var res = await fetch('/warroom-music-upload?token=' + TOKEN, { method: 'POST', body: form });
    if (res.ok) {
      var status = document.getElementById('musicStatus');
      if (status) { status.style.display = 'inline'; setTimeout(function(){ status.style.display = 'none'; }, 3000); }
      // Reload the audio element so next meeting uses the new track
      var audio = document.getElementById('bgMusic');
      if (audio) { audio.load(); }
    }
  } catch(e) { console.error('Music upload failed', e); }
}

// Flipping mode rewrites /tmp/warroom-pin.json on the server and then
// kills the warroom subprocess. Main's auto-respawn brings up a fresh
// one with the new persona + tool set. If a meeting is currently live,
// we tear it down and reconnect through the same path togglePin uses.
async function setMode(mode, el) {
  if (switching) return;
  if (mode === currentMode) return;

  var prevMode = currentMode;
  currentMode = mode;
  document.querySelectorAll('.mode-btn').forEach(function(b) { b.classList.remove('active'); });
  if (el) el.classList.add('active');

  var hint = document.getElementById('mode-hint');
  if (hint) {
    hint.textContent = mode === 'auto'
      ? 'Hand Up: the team listens, best-fit answers. No need to name an agent.'
      : 'Direct: talk to the pinned agent. Hand Up: the team listens, best-fit answers.';
  }

  try {
    var resp = await fetch(API_BASE + '/api/warroom/pin?token=' + TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: mode }),
    });
    var data = await resp.json();
    if (!data || !data.ok) {
      // Roll back the UI
      currentMode = prevMode;
      document.querySelectorAll('.mode-btn').forEach(function(b) { b.classList.remove('active'); });
      var prevBtn = document.getElementById('mode-' + prevMode);
      if (prevBtn) prevBtn.classList.add('active');
      addTranscriptEntry('system', 'Mode switch failed: ' + (data && data.error));
      return;
    }
  } catch (err) {
    currentMode = prevMode;
    addTranscriptEntry('system', 'Mode switch failed: ' + formatErr(err));
    return;
  }

  // If no meeting is active, we're done. The next Start Meeting click
  // will pick up the new mode automatically on the respawned server.
  if (!meetingActive) {
    addTranscriptEntry('system', mode === 'auto'
      ? 'Hand Up mode armed. Click Start Meeting when ready.'
      : 'Direct mode armed. Pick an agent to pin, then Start Meeting.');
    return;
  }

  // Meeting is live — tear down and reconnect.
  var label = mode === 'auto' ? 'Hand Up' : 'Direct';
  addTranscriptEntry('system', 'Switching to ' + label + ' mode...');
  await reloadMeetingAfterRespawn(label, pinnedAgent || 'main');
}

// Tear down the active Pipecat client, wait for the warroom server to
// respawn, and reconnect a fresh client. Shared by togglePin and setMode
// so the reconnect sequence doesn't drift between the two.
async function reloadMeetingAfterRespawn(statusLabel, targetAgent) {
  switching = true;
  try {
    if (pipecatClient) {
      try { await pipecatClient.disconnect(); } catch(e){}
      pipecatClient = null;
    }
    if (currentTransport) {
      try { forceCloseTransport(currentTransport); } catch(e){}
      currentTransport = null;
    }
    stopWaveform();
    document.getElementById('micBtn').disabled = true;
    document.getElementById('micBtn').classList.remove('recording');

    var ready = false;
    var waited = 0;
    while (!ready && waited < 15000) {
      await new Promise(function(r){ setTimeout(r, 500); });
      waited += 500;
      try {
        var probe = await fetch(API_BASE + '/api/warroom/start?token=' + TOKEN, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId: CHAT_ID, mode: currentMode }),
        });
        var pdata = await probe.json();
        if (pdata && pdata.ok) ready = true;
      } catch(e){}
    }
    if (!ready) {
      addTranscriptEntry('system', 'Switch timed out. Click Start Meeting to retry.');
      document.getElementById('statusText').textContent = 'disconnected';
      meetingActive = false;
      var btn = document.getElementById('meetingBtn');
      btn.textContent = 'Start Meeting';
      btn.className = 'btn start';
      btn.disabled = false;
      return;
    }

    // Connect directly to the War Room Python WebSocket server.
    // Upstream routes through dashboard proxy (/ws/warroom), but we run
    // the server as a separate LaunchAgent on its own port.
    var wsUrl = 'ws://' + window.location.hostname + ':' + WARROOM_PORT;
    var WebSocketTransport = window.PipecatWarRoom.WebSocketTransport;
    var PipecatClient = window.PipecatWarRoom.PipecatClient;
    currentTransport = new WebSocketTransport({ wsUrl: wsUrl });
    pipecatClient = new PipecatClient({
      transport: currentTransport,
      enableMic: true,
      enableCam: false,
      callbacks: {
        onConnected: function() {
          document.getElementById('micBtn').disabled = false;
          document.getElementById('micBtn').classList.add('recording');
          document.getElementById('statusText').textContent = 'meeting active (' + statusLabel + ')';
          addTranscriptEntry('system', statusLabel + ' is ready. Speak now.');
          startWaveform();
        },
        onDisconnected: function() {
          if (currentTransport) { try { forceCloseTransport(currentTransport); } catch(e){} currentTransport = null; }
          switching = false;
          stopWaveform();
          meetingActive = false;
          document.getElementById('statusText').textContent = 'disconnected';
          addTranscriptEntry('system', 'Connection lost. Click Start Meeting to reconnect.');
          var btn = document.getElementById('meetingBtn');
          btn.textContent = 'Start Meeting'; btn.className = 'btn start'; btn.disabled = false;
          document.getElementById('micBtn').disabled = true;
        },
        onBotReady: function() {},
        onUserTranscript: function(d) {
          if (d && d.final) addTranscriptEntry('You', d.text);
        },
        onBotTranscript: function(d) {
          if (d) addTranscriptEntry(statusLabel, d.text || '', targetAgent || 'main');
        },
        onServerMessage: function(msg) { handleServerMessage(msg); },
        onError: function(err) {
          var m = formatErr(err);
          // During a pin/mode switch the Python server is restarting;
          // show a friendly reconnect hint instead of the raw error.
          if (switching) {
            addTranscriptEntry('system', 'Reconnexion…');
            return;
          }
          addTranscriptEntry('system', '⚠️ Erreur de connexion. Clique Stop Meeting puis Start Meeting pour réessayer. (Details: ' + (m || 'unknown').slice(0, 120) + ')');
        },
      },
    });
    pipecatClient.connect({ wsUrl: wsUrl }).catch(function(){});
  } finally {
    switching = false;
  }
}

// ── Server-pushed hand-up events (auto mode) ──
// The warroom server's answer_as_agent tool handler pushes an
// OutputTransportMessageUrgentFrame with
//   { type: 'server-message', data: { event: 'agent_selected', agent: '...' } }
// before it spawns the voice bridge subprocess. We listen for that here
// and animate the matching agent card. The animation auto-clears a few
// seconds later so the card doesn't stay stuck in hand-up.
var handUpTimer = null;
function handleServerMessage(msg) {
  try {
    if (!msg) return;
    // Pipecat's JS client unwraps the outer frame, so we may get either
    // the raw data payload or the whole {type, data} envelope depending
    // on version. Accept both.
    var data = msg.data || msg;
    if (!data || typeof data !== 'object') return;
    if (data.event !== 'agent_selected') return;
    var agent = data.agent;
    if (!agent) return;
    var card = document.getElementById('agent-' + agent);
    if (!card) return;

    // Clear any prior hand-up state on all cards so only one agent shows it
    document.querySelectorAll('.agent-card').forEach(function(c) { c.classList.remove('hand-up'); });
    card.classList.add('hand-up');
    addTranscriptEntry('system', (AGENT_LABELS[agent] || agent) + ' is taking this.');

    if (handUpTimer) clearTimeout(handUpTimer);
    handUpTimer = setTimeout(function() {
      card.classList.remove('hand-up');
      handUpTimer = null;
    }, 6000);
  } catch (e) {
    console.warn('[WarRoom] handleServerMessage failed', e);
  }
}

// ── Transcript management ──
function addTranscriptEntry(speaker, text, agentId) {
  var area = document.getElementById('transcript');
  var ph = document.getElementById('placeholder');
  if (ph) ph.remove();

  var entry = document.createElement('div');
  entry.className = 'transcript-entry';

  var speakerEl = document.createElement('div');
  var speakerClass = speaker === 'You' ? 'user' : (speaker === 'system' ? 'system' : 'agent');
  speakerEl.className = 'transcript-speaker ' + speakerClass;
  speakerEl.textContent = speaker === 'system' ? '' : speaker;

  var textEl = document.createElement('div');
  textEl.className = 'transcript-text' + (speaker === 'system' ? ' system-text' : '');
  textEl.textContent = text;

  if (speaker !== 'system') entry.appendChild(speakerEl);
  entry.appendChild(textEl);
  area.appendChild(entry);
  area.scrollTop = area.scrollHeight;

  if (agentId) setAgentSpeaking(agentId);

  // Persist to database (fire-and-forget)
  transcriptEntryCount++;
  if (currentMeetingId && speaker !== 'system') {
    fetch(API_BASE + '/api/warroom/meeting/transcript?token=' + TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meetingId: currentMeetingId, speaker: speaker === 'You' ? 'user' : (agentId || speaker), text: text }),
    }).catch(function(){});
  }
}

// ── Agent state management ──
function setAgentSpeaking(agentId) {
  document.querySelectorAll('.agent-card').forEach(function(c) {
    c.classList.remove('speaking', 'thinking');
  });
  var card = document.getElementById('agent-' + agentId);
  if (card) card.classList.add('speaking');
  document.querySelectorAll('.agent-indicator').forEach(function(s) { s.className = 'agent-indicator'; });
  var status = document.getElementById('status-' + agentId);
  if (status) status.classList.add('online');
}

function setAgentThinking(agentId) {
  var card = document.getElementById('agent-' + agentId);
  if (card) { card.classList.remove('speaking'); card.classList.add('thinking'); }
  var status = document.getElementById('status-' + agentId);
  if (status) { status.className = 'agent-indicator busy'; }
}

function clearAgentStates() {
  document.querySelectorAll('.agent-card').forEach(function(c) { c.classList.remove('speaking', 'thinking'); });
  document.querySelectorAll('.agent-indicator').forEach(function(s) { s.className = 'agent-indicator'; });
}

function updateCost(amount) {
  totalCost += amount;
  document.getElementById('costDisplay').textContent = '$' + totalCost.toFixed(3);
}

// ── Pipecat client instance ──
var pipecatClient = null;
// Current WebSocketTransport tied to pipecatClient. Kept at module scope
// so the End Meeting path can reach past Pipecat's client wrapper and
// force-close the underlying socket. pipecatClient.disconnect() on its
// own does not reliably close the WS in pipecat-ai/client-js 0.0.75, so
// the server never sees an orderly disconnect until the next Start
// Meeting click kicks the stale client slot.
var currentTransport = null;

// Pending "connection timed out" safety timer. We want exactly ONE of
// these alive at a time, and we need to cancel it as soon as the server
// actually connects — otherwise it fires and shows a red error AFTER the
// meeting is already working, which is confusing.
var connectTimeoutHandle = null;
function clearConnectTimeout() {
  if (connectTimeoutHandle !== null) {
    clearTimeout(connectTimeoutHandle);
    connectTimeoutHandle = null;
  }
}

// pipecat-ai/client-js 0.0.75's WebSocketTransport.disconnect() is
// unreliable: it marks itself disconnected but doesn't always close the
// underlying WS, so the Pipecat Python server never fires
// on_client_disconnected until a subsequent Start Meeting click forces
// the stale client slot to be kicked. Reach through every shape the
// transport might expose its socket under and close it ourselves.
function forceCloseTransport(t) {
  if (!t) return;
  var candidates = ['_ws', 'ws', '_socket', 'socket', '_connection', 'connection'];
  for (var i = 0; i < candidates.length; i++) {
    var sock = t[candidates[i]];
    if (sock && typeof sock.close === 'function') {
      try { sock.close(1000, 'client ended meeting'); } catch (e) {}
    }
  }
}

// Format an error for display. Pipecat's callbacks sometimes pass plain
// strings, sometimes Error objects, sometimes RTVI message objects with
// no .message property — the naive "' + err" coercion produced the
// infamous "Error: [object Object]" transcript line. We try a few fields
// and fall back to JSON.stringify before the last-resort String(err).
function formatErr(err) {
  if (err == null) return 'unknown error';
  if (typeof err === 'string') return err;
  if (err.message && typeof err.message === 'string') return err.message;
  if (err.error && typeof err.error === 'string') return err.error;
  if (err.data && err.data.error && typeof err.data.error === 'string') return err.data.error;
  if (err.type && typeof err.type === 'string') {
    return err.type + (err.message ? ': ' + err.message : '');
  }
  try {
    var s = JSON.stringify(err);
    if (s && s !== '{}') return s;
  } catch (e) { /* fall through */ }
  return String(err);
}

// ── Click-to-pin an agent ──
// Clicking an agent card sets that agent as the default route for all
// subsequent voice utterances. Stored server-side in /tmp/warroom-pin.json
// via POST /api/warroom/pin; read by warroom/router.py on each utterance.
// Spoken prefixes ("research, ...") and broadcast triggers ("everyone")
// still take precedence over the pin.
var pinnedAgent = null;

function _renderPin() {
  document.querySelectorAll('.agent-card').forEach(function(c){
    var aid = c.getAttribute('data-agent');
    if (aid === pinnedAgent) c.classList.add('pinned');
    else c.classList.remove('pinned');
  });
}

var AGENT_LABELS = { main: 'Main', research: 'Research', comms: 'Comms', content: 'Content', ops: 'Ops' };

// Switching-in-progress guard so a rapid double-click doesn't spawn two
// reconnect cycles.
var switching = false;

async function togglePin(agentId) {
  if (switching) return;
  try {
    var targetAgent;
    if (pinnedAgent === agentId && agentId !== 'main') {
      // Clicking the currently-pinned non-main agent again unpins back to main
      targetAgent = null;
    } else {
      targetAgent = agentId;
    }

    // 1. Optimistic UI update
    pinnedAgent = targetAgent;
    _renderPin();
    var statusLabel = targetAgent ? (AGENT_LABELS[targetAgent] || targetAgent) : 'Main';
    addTranscriptEntry('system', 'Switching to ' + statusLabel + '...');
    document.getElementById('statusText').textContent = 'switching to ' + statusLabel + '...';

    // 2. Call the pin/unpin endpoint. Only restart the server if a meeting
    //    is active. When no meeting is active, just update the pin file
    //    and the server picks it up on the next Start Meeting click.
    var endpoint = targetAgent
      ? { url: '/api/warroom/pin?token=' + TOKEN, body: JSON.stringify({ agent: targetAgent, restart: meetingActive }) }
      : { url: '/api/warroom/unpin?token=' + TOKEN, body: null };
    var headers = targetAgent ? { 'Content-Type': 'application/json' } : undefined;
    var resp = await fetch(API_BASE + endpoint.url, { method: 'POST', headers: headers, body: endpoint.body });
    var data = await resp.json();
    if (!data || !data.ok) {
      addTranscriptEntry('system', 'Switch failed: ' + (data && data.error));
      document.getElementById('statusText').textContent = 'ready';
      return;
    }

    // 3. If there's no active meeting, we're done. Next time the user
    // clicks Start Meeting, the server will already be running with the
    // new agent's config.
    if (!meetingActive) {
      addTranscriptEntry('system', 'Active agent set to ' + statusLabel + '. Click Start Meeting to talk.');
      document.getElementById('statusText').textContent = 'ready';
      return;
    }

    // 4. Meeting is active — tear down the current Pipecat client and
    // the waveform, wait for the warroom subprocess to respawn on the
    // server side (main's auto-respawn logic in src/index.ts takes about
    // 1 second), then reconnect with the same flow as Start Meeting.
    switching = true;
    try {
      if (pipecatClient) {
        try { await pipecatClient.disconnect(); } catch(e){}
        pipecatClient = null;
      }
      if (currentTransport) {
        try { forceCloseTransport(currentTransport); } catch(e){}
        currentTransport = null;
      }
      stopWaveform();
      // Hold the meeting UI in "switching" state so toggleMeeting doesn't
      // think we ended. We keep meetingActive=true but disable the mic btn.
      document.getElementById('micBtn').disabled = true;
      document.getElementById('micBtn').classList.remove('recording');

      // Wait for the warroom server to come back up. Probe /api/warroom/start
      // (cheap endpoint that just returns the ws url) as a heartbeat for
      // the whole stack being healthy.
      var ready = false;
      var waited = 0;
      while (!ready && waited < 15000) {
        await new Promise(function(r){ setTimeout(r, 500); });
        waited += 500;
        try {
          var probe = await fetch(API_BASE + '/api/warroom/start?token=' + TOKEN, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId: CHAT_ID, mode: currentMode }),
          });
          var pdata = await probe.json();
          if (pdata && pdata.ok) ready = true;
        } catch(e){}
      }
      if (!ready) {
        addTranscriptEntry('system', 'Switch timed out. Click Start Meeting to retry.');
        document.getElementById('statusText').textContent = 'disconnected';
        meetingActive = false;
        var btn = document.getElementById('meetingBtn');
        btn.textContent = 'Start Meeting';
        btn.className = 'btn start';
        btn.disabled = false;
        return;
      }

      // 5. Reconnect a fresh Pipecat client to the respawned server
      // Connect directly to the War Room Python WebSocket server.
    // Upstream routes through dashboard proxy (/ws/warroom), but we run
    // the server as a separate LaunchAgent on its own port.
    var wsUrl = 'ws://' + window.location.hostname + ':' + WARROOM_PORT;
      var WebSocketTransport = window.PipecatWarRoom.WebSocketTransport;
      var PipecatClient = window.PipecatWarRoom.PipecatClient;
      currentTransport = new WebSocketTransport({ wsUrl: wsUrl });
      pipecatClient = new PipecatClient({
        transport: currentTransport,
        enableMic: true,
        enableCam: false,
        callbacks: {
          onConnected: function() {
            console.log('[WarRoom] Reconnected to Pipecat server as', statusLabel);
            document.getElementById('micBtn').disabled = false;
            document.getElementById('micBtn').classList.add('recording');
            document.getElementById('statusText').textContent = 'meeting active (' + statusLabel + ')';
            addTranscriptEntry('system', statusLabel + ' is ready. Speak now.');
            startWaveform();
          },
          onDisconnected: function() {
            console.log('[WarRoom] Disconnected after switch');
            if (currentTransport) { try { forceCloseTransport(currentTransport); } catch(e){} currentTransport = null; }
            switching = false;
            stopWaveform();
            meetingActive = false;
            document.getElementById('statusText').textContent = 'disconnected';
            addTranscriptEntry('system', 'Connection lost. Click Start Meeting to reconnect.');
            var btn = document.getElementById('meetingBtn');
            btn.textContent = 'Start Meeting'; btn.className = 'btn start'; btn.disabled = false;
            document.getElementById('micBtn').disabled = true;
          },
          onBotReady: function() { console.log('[WarRoom] Bot ready after switch'); },
          onUserTranscript: function(d) {
            if (d && d.final) addTranscriptEntry('You', d.text);
          },
          onBotTranscript: function(d) {
            if (d) addTranscriptEntry(statusLabel, d.text || '', targetAgent || 'main');
          },
          onServerMessage: function(msg) { handleServerMessage(msg); },
          onError: function(err) {
            console.error('[WarRoom] Post-switch error:', err);
            var msg = formatErr(err);
            // Silent during switching — server respawn is expected.
            if (switching) {
              addTranscriptEntry('system', 'Reconnexion…');
              return;
            }
            addTranscriptEntry('system', '⚠️ Erreur post-switch. Clique Stop Meeting puis Start Meeting pour relancer. (Details: ' + (msg || 'unknown').slice(0, 120) + ')');
          },
        },
      });
      pipecatClient.connect({ wsUrl: wsUrl }).catch(function(err) {
        console.log('[WarRoom] reconnect connect() resolved:', err && err.message);
      });
    } finally {
      switching = false;
    }
  } catch (err) {
    console.error('[WarRoom] togglePin failed', err);
    addTranscriptEntry('system', 'Pin error: ' + (err && err.message || err));
    switching = false;
  }
}

// Role labels for known agents (cosmetic only, custom agents get their description)
var AGENT_ROLES = {
  main: 'The Hand of the King',
  research: 'Grand Maester',
  comms: 'Master of Whisperers',
  content: 'The Royal Bard',
  ops: 'Master of War',
};
var AGENT_LABELS = AGENT_LABELS || {};

// Load agent cards dynamically from the API
(async function loadAgentCards(){
  try {
    var r = await fetch(API_BASE + '/api/warroom/agents?token=' + TOKEN);
    var data = await r.json();
    if (data && data.agents) {
      var container = document.getElementById('agent-cards-container');
      if (!container) return;
      container.innerHTML = '';
      data.agents.forEach(function(agent) {
        var role = AGENT_ROLES[agent.id] || agent.description || 'Specialist';
        AGENT_LABELS[agent.id] = agent.name || agent.id;
        var card = document.createElement('div');
        card.className = 'agent-card';
        card.id = 'agent-' + agent.id;
        card.setAttribute('data-agent', agent.id);
        card.onclick = function(){ togglePin(agent.id); };
        card.innerHTML = '<div class="agent-avatar"><img src="/warroom-avatar/' + encodeURIComponent(agent.id) + '?token=' + encodeURIComponent(TOKEN) + '" alt="' + (agent.name || agent.id) + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.style.display=\\'none\\'"></div>'
          + '<div class="agent-info"><div class="agent-name">' + (agent.name || agent.id) + '</div><div class="agent-role">' + role + '</div></div>'
          + '<div class="agent-indicator" id="status-' + agent.id + '"></div>';
        // Fade in
        setTimeout(function(){ card.style.opacity = '1'; card.style.transform = 'translateX(0)'; }, 50);
        container.appendChild(card);
      });
    }
  } catch(e) { console.error('[WarRoom] Failed to load agents:', e); }
})();

// Load the initial pin state on page load so the UI reflects server state
(async function loadInitialPin(){
  try {
    var r = await fetch(API_BASE + '/api/warroom/pin?token=' + TOKEN);
    var j = await r.json();
    if (j && j.agent) {
      pinnedAgent = j.agent;
      _renderPin();
    }
    if (j && j.mode && (j.mode === 'direct' || j.mode === 'auto')) {
      currentMode = j.mode;
      document.querySelectorAll('.mode-btn').forEach(function(b){ b.classList.remove('active'); });
      var btn = document.getElementById('mode-' + j.mode);
      if (btn) btn.classList.add('active');
      var hint = document.getElementById('mode-hint');
      if (hint && j.mode === 'auto') {
        hint.textContent = 'Hand Up: the team listens, best-fit answers. No need to name an agent.';
      }
    }
  } catch(e){}
})();

// Warmup socket removed: the /api/warroom/start endpoint now does a real
// WebSocket health probe, so the browser only connects once the server is
// genuinely ready. The old warmup raced with Start Meeting clicks and
// stole the single Pipecat client slot.

// ── Live mic waveform ──
// Opens a parallel mic stream (second getUserMedia call) just for
// visualization. Chrome reuses the same permission grant so there is no
// extra prompt. The Pipecat client owns its own capture for the server
// pipeline; we don't touch that.
var waveState = null;
async function startWaveform() {
  if (waveState) return;
  try {
    var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    try { if (ctx.state === 'suspended') await ctx.resume(); } catch(e){}
    var src = ctx.createMediaStreamSource(stream);
    var analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.4;
    src.connect(analyser);

    var canvas = document.getElementById('micWaveCanvas');
    var wrap = document.getElementById('waveWrap');
    var level = document.getElementById('waveLevel');
    wrap.classList.add('active');

    // Resize canvas to DPR so lines stay crisp
    var dpr = window.devicePixelRatio || 1;
    var sizeCanvas = function() {
      var w = canvas.clientWidth, h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
    };
    sizeCanvas();
    // Keep a reference so stop() can removeEventListener — otherwise
    // each meeting start/stop cycle leaks a closure holding the old
    // AudioContext and MediaStreamSource.
    var resizeHandler = sizeCanvas;
    window.addEventListener('resize', resizeHandler);

    var time = new Uint8Array(analyser.fftSize);
    var running = true;
    var rafId = null;
    function draw() {
      if (!running) return;
      rafId = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(time);
      var ctx2d = canvas.getContext('2d');
      var w = canvas.width, h = canvas.height;
      ctx2d.clearRect(0, 0, w, h);

      // Baseline
      ctx2d.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx2d.lineWidth = 1 * dpr;
      ctx2d.beginPath();
      ctx2d.moveTo(0, h / 2);
      ctx2d.lineTo(w, h / 2);
      ctx2d.stroke();

      // Waveform
      ctx2d.strokeStyle = '#22c55e';
      ctx2d.lineWidth = 1.5 * dpr;
      ctx2d.beginPath();
      var slice = w / time.length;
      var peak = 0;
      for (var i = 0; i < time.length; i++) {
        var v = (time[i] - 128) / 128; // -1..1
        if (Math.abs(v) > peak) peak = Math.abs(v);
        var y = (1 - v) * h / 2;
        var x = i * slice;
        if (i === 0) ctx2d.moveTo(x, y);
        else ctx2d.lineTo(x, y);
      }
      ctx2d.stroke();

      // Peak readout as crude dB
      var db = peak > 0.0001 ? Math.round(20 * Math.log10(peak)) : -60;
      if (db < -60) db = -60;
      level.textContent = db + 'dB';
    }
    draw();

    waveState = {
      stop: function() {
        running = false;
        if (rafId !== null) cancelAnimationFrame(rafId);
        try { window.removeEventListener('resize', resizeHandler); } catch(e){}
        try { stream.getTracks().forEach(function(t){ t.stop(); }); } catch(e){}
        try { src.disconnect(); } catch(e){}
        try { ctx.close(); } catch(e){}
        wrap.classList.remove('active');
        level.textContent = '--';
        // Clear canvas
        try {
          var c2 = canvas.getContext('2d');
          c2.clearRect(0, 0, canvas.width, canvas.height);
        } catch(e){}
      }
    };
  } catch (err) {
    console.error('[WarRoom] waveform capture failed:', err);
    var wrap2 = document.getElementById('waveWrap');
    if (wrap2) wrap2.classList.remove('active');
    var lvl2 = document.getElementById('waveLevel');
    if (lvl2) lvl2.textContent = 'err';
  }
}
function stopWaveform() {
  if (waveState) { try { waveState.stop(); } catch(e){} waveState = null; }
}

// Release the mic + cut the Pipecat WebSocket when the tab goes away.
// Without this, closing the tab or hitting back leaves the Chrome
// mic-in-use indicator lit (the MediaStream tracks aren't eagerly
// released on unload) and leaves the Pipecat server holding a
// half-open client slot.
function __warRoomCleanup() {
  try { stopWaveform(); } catch(e){}
  try { if (pipecatClient) { pipecatClient.disconnect(); pipecatClient = null; } } catch(e){}
  try { if (currentTransport) { forceCloseTransport(currentTransport); currentTransport = null; } } catch(e){}
}
window.addEventListener('pagehide', __warRoomCleanup);
window.addEventListener('beforeunload', __warRoomCleanup);

// ── Meeting controls ──
async function toggleMeeting() {
  var btn = document.getElementById('meetingBtn');
  if (!meetingActive) {
    var agentLabel = pinnedAgent ? (AGENT_LABELS[pinnedAgent] || pinnedAgent) : 'Main';
    btn.textContent = 'Setting up ' + agentLabel + '...';
    btn.disabled = true;
    btn.className = 'btn';
    document.getElementById('statusText').textContent = 'preparing ' + agentLabel + '...';

    try {
      // Get the WebSocket URL from our API (may take ~8s if agent was just switched)
      var resp = await fetch(API_BASE + '/api/warroom/start?token=' + TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: CHAT_ID, mode: currentMode })
      });
      var data = await resp.json();

      if (data.error) {
        addTranscriptEntry('system', data.error);
        btn.textContent = 'Start Meeting';
        btn.className = 'btn start';
        btn.disabled = false;
        return;
      }

      // Connect directly to War Room Python server (separate LaunchAgent).
      var wsUrl = data.ws_url || ('ws://' + window.location.hostname + ':' + WARROOM_PORT);

      // Create the Pipecat client with WebSocket transport
      var WebSocketTransport = window.PipecatWarRoom.WebSocketTransport;
      var PipecatClient = window.PipecatWarRoom.PipecatClient;

      // Helper to transition UI to "meeting active" state
      function activateMeeting() {
        if (meetingActive) return;
        // Cancel the pending "connection timed out" safety timer the
        // moment we know we're connected. Without this, the timer still
        // fires after a successful connection and flashes a red error
        // on top of a working meeting.
        clearConnectTimeout();
        meetingActive = true;
        meetingStartTime = Date.now();
        transcriptEntryCount = 0;
        // Create meeting record in DB
        fetch(API_BASE + '/api/warroom/meeting/start?token=' + TOKEN, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: currentMode, agent: pinnedAgent || 'main' }),
        }).then(function(r){ return r.json(); }).then(function(d){
          if (d && d.meetingId) currentMeetingId = d.meetingId;
        }).catch(function(){});
        btn.textContent = 'End Meeting';
        btn.className = 'btn end';
        btn.disabled = false;
        document.getElementById('micBtn').disabled = false;
        micActive = true;
        document.getElementById('micBtn').classList.add('recording');
        document.getElementById('statusText').textContent = 'meeting active';

        // Kill music (immediate on mobile, fade on desktop)
        var music = document.getElementById('bgMusic');
        if (music) {
          if (window.innerWidth <= 768) { music.volume = 0; music.pause(); }
          var fadeInterval = setInterval(function() {
            if (music.volume > 0.05) { music.volume = Math.max(0, music.volume - 0.03); }
            else { music.volume = 0; music.pause(); clearInterval(fadeInterval); }
          }, 100);
        }

        document.querySelectorAll('.agent-indicator').forEach(function(s) { s.classList.add('online'); });
        addTranscriptEntry('system', 'Meeting started. Speak now.');
        // Kick off the live mic waveform for visual feedback
        startWaveform();
      }

      // Build a fresh PipecatClient WITH a fresh WebSocketTransport each
      // time. Reusing a single WebSocketTransport across retries was the
      // reason the silent retry never actually saved the first click: the
      // transport is stateful, and its second connect attaches to a
      // half-dead socket, so the WS 'open' event never re-fires and
      // onConnected never gets called. Always build a clean transport.
      var connectAttempts = 0;
      var retryTimerHandle = null;
      function buildClient() {
        currentTransport = new WebSocketTransport({ wsUrl: wsUrl });
        return new PipecatClient({
          transport: currentTransport,
          enableMic: true,
          enableCam: false,
          callbacks: {
            onConnected: function() {
              console.log('[WarRoom] Connected to Pipecat server (attempt ' + connectAttempts + ')');
              if (retryTimerHandle) { clearTimeout(retryTimerHandle); retryTimerHandle = null; }
              // pipecat-ai 0.0.75 server doesn't send botReady, activate as soon as WS opens
              activateMeeting();
            },
            onDisconnected: function() {
              console.log('[WarRoom] Disconnected');
              if (!meetingActive) return;
              // Clear switching guard in case disconnect happened during a pin/mode switch
              switching = false;
              // Force-close the transport so the server frees the client slot
              if (currentTransport) { try { forceCloseTransport(currentTransport); } catch(e){} currentTransport = null; }
              stopWaveform();
              document.getElementById('statusText').textContent = 'reconnecting...';
              document.getElementById('micBtn').disabled = true;
              // Single auto-reconnect attempt after 2s. If it fails, give up
              // and let the user click Start Meeting manually.
              setTimeout(function() {
                if (!meetingActive) return;
                try {
                  var WebSocketTransport = window.PipecatWarRoom.WebSocketTransport;
                  var PipecatClient = window.PipecatWarRoom.PipecatClient;
                  currentTransport = new WebSocketTransport({ wsUrl: wsUrl });
                  pipecatClient = new PipecatClient({
                    transport: currentTransport,
                    enableMic: true,
                    enableCam: false,
                    callbacks: {
                      onConnected: function() {
                        document.getElementById('statusText').textContent = 'meeting active (reconnected)';
                        document.getElementById('micBtn').disabled = false;
                        document.getElementById('micBtn').classList.add('recording');
                        addTranscriptEntry('system', 'Reconnected.');
                        startWaveform();
                      },
                      onDisconnected: function() {
                        // Second disconnect = give up
                        if (currentTransport) { try { forceCloseTransport(currentTransport); } catch(e){} currentTransport = null; }
                        stopWaveform();
                        document.getElementById('statusText').textContent = 'disconnected';
                        addTranscriptEntry('system', 'Connection lost. Click Start Meeting to reconnect.');
                        meetingActive = false;
                        var btn = document.getElementById('meetingBtn');
                        btn.textContent = 'Start Meeting';
                        btn.className = 'btn start';
                        btn.disabled = false;
                        document.getElementById('micBtn').disabled = true;
                        document.getElementById('micBtn').classList.remove('recording');
                      },
                      onBotReady: function() {},
                      onUserTranscript: function(data) { if (data && data.final) addTranscriptEntry('You', data.text); },
                      onBotTranscript: function(data) { if (data) addTranscriptEntry(AGENT_LABELS[pinnedAgent] || pinnedAgent || 'Main', data.text || '', pinnedAgent || 'main'); },
                      onServerMessage: function(msg) { handleServerMessage(msg); },
                      onError: function(err) { console.error('[WarRoom] Reconnect error:', err); },
                    },
                  });
                  pipecatClient.connect({ wsUrl: wsUrl }).catch(function(err) {
                    console.log('[WarRoom] reconnect failed:', err && err.message);
                  });
                } catch(e) {
                  console.error('[WarRoom] Reconnect setup failed:', e);
                  document.getElementById('statusText').textContent = 'disconnected';
                  addTranscriptEntry('system', 'Reconnect failed. Click Start Meeting to retry.');
                  meetingActive = false;
                  var btn = document.getElementById('meetingBtn');
                  btn.textContent = 'Start Meeting';
                  btn.className = 'btn start';
                  btn.disabled = false;
                }
              }, 2000);
            },
            onBotReady: function() {
              console.log('[WarRoom] Bot ready');
              if (retryTimerHandle) { clearTimeout(retryTimerHandle); retryTimerHandle = null; }
              activateMeeting();
            },
            onUserTranscript: function(data) {
              if (data && data.final) {
                addTranscriptEntry('You', data.text);
              }
            },
            onBotTranscript: function(data) {
              if (data) addTranscriptEntry(AGENT_LABELS[pinnedAgent] || pinnedAgent || 'Main', data.text || '', pinnedAgent || 'main');
            },
            onServerMessage: function(msg) { handleServerMessage(msg); },
            onError: function(error) {
              console.error('[WarRoom] Error (attempt ' + connectAttempts + '):', error);
              var msg = formatErr(error);
              // During a silent retry window we swallow the error so the
              // user doesn't see a "connection failed" flash before the
              // retry succeeds.
              if (!meetingActive && connectAttempts < 2) {
                return;
              }
              // During a pin/mode switch the Python server respawns (~2-3 s).
              // Show a reconnect hint rather than the raw error.
              if (switching) {
                addTranscriptEntry('system', 'Reconnexion…');
                return;
              }
              // Gemini Live (1011 internal error) or other backend failures.
              // Surface a clear, actionable message so the user knows to
              // retry rather than wondering why their voice gets no reply.
              addTranscriptEntry('system', '⚠️ Le service vocal a rencontré une erreur. Clique Stop Meeting puis Start Meeting pour réessayer. (Details: ' + (msg || 'unknown').slice(0, 120) + ')');
            },
          },
        });
      }

      function attemptConnect() {
        connectAttempts += 1;
        // Tear down a stale client AND its transport if we're retrying
        // so we don't leak a half-open websocket into the server. The
        // transport is what actually owns the WS, so closing it directly
        // is the only reliable way to guarantee a clean slot on retry.
        if (connectAttempts > 1) {
          if (pipecatClient) {
            try { pipecatClient.disconnect(); } catch (e) {}
            pipecatClient = null;
          }
          if (currentTransport) {
            try { forceCloseTransport(currentTransport); } catch (e) {}
            currentTransport = null;
          }
        }
        pipecatClient = buildClient();
        pipecatClient.connect({ wsUrl: wsUrl }).catch(function(err) {
          // Connection might "fail" because botReady never arrives, but
          // onConnected has already fired. If we're still in the retry
          // window, just log and let the retry timer handle it.
          console.log('[WarRoom] connect() attempt ' + connectAttempts + ' resolved:', err && err.message);
        });

        // If onConnected hasn't fired in 3.5s, silently retry once. This
        // fixes the "first click always fails" symptom: the first attempt
        // often lands on a server that's mid-init and drops the client
        // slot, Pipecat logs "Only one client allowed" when the retry
        // connects, and the retry gets a clean slot.
        if (connectAttempts < 2) {
          retryTimerHandle = setTimeout(function() {
            retryTimerHandle = null;
            if (!meetingActive) {
              console.log('[WarRoom] First connect stalled, silently retrying');
              attemptConnect();
            }
          }, 3500);
        }
      }

      attemptConnect();

      // Safety: if onConnected hasn't fired in 20s total, show an error.
      // We store the handle so activateMeeting() can cancel it the moment
      // it fires — without this, the timeout still fires AFTER a
      // successful connection and flashes "Connection timed out" on top
      // of a working meeting. 20s covers the real health probe wait plus
      // Gemini Live init on a cold server plus the silent retry window.
      clearConnectTimeout();
      connectTimeoutHandle = setTimeout(function() {
        connectTimeoutHandle = null;
        if (retryTimerHandle) { clearTimeout(retryTimerHandle); retryTimerHandle = null; }
        if (!meetingActive && pipecatClient) {
          addTranscriptEntry('system', 'Connection timed out. Check the server logs.');
          btn.textContent = 'Start Meeting';
          btn.className = 'btn start';
          btn.disabled = false;
          // Belt-and-braces: if anything started the waveform early, stop it
          stopWaveform();
        }
      }, 20000);

    } catch (err) {
      console.error('[WarRoom] Connection failed:', err);
      clearConnectTimeout();
      addTranscriptEntry('system', 'Connection failed: ' + formatErr(err));
      stopWaveform();
      btn.textContent = 'Start Meeting';
      btn.className = 'btn start';
      btn.disabled = false;
    }
  } else {
    // End meeting
    clearConnectTimeout();
    meetingActive = false;
    // Persist meeting end to DB
    if (currentMeetingId) {
      fetch(API_BASE + '/api/warroom/meeting/end?token=' + TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: currentMeetingId, entryCount: transcriptEntryCount }),
      }).catch(function(){});
      currentMeetingId = null;
    }
    btn.textContent = 'Start Meeting';
    btn.className = 'btn start';
    document.getElementById('micBtn').disabled = true;
    micActive = false;
    document.getElementById('micBtn').classList.remove('recording');
    clearAgentStates();
    stopWaveform();

    if (pipecatClient) {
      try { await pipecatClient.disconnect(); } catch(e) {}
      pipecatClient = null;
    }
    // pipecatClient.disconnect() does not reliably close the WS in
    // pipecat-ai/client-js 0.0.75. Force-close the underlying socket so
    // the Pipecat server fires on_client_disconnected immediately and
    // the client slot is free for the NEXT Start Meeting click. Without
    // this, the next click lands on a server that still thinks the old
    // client is attached, logs "Only one client allowed", replaces the
    // slot, and leaves the new client in a half-broken state that never
    // fires onConnected until a SECOND click.
    if (currentTransport) {
      try { forceCloseTransport(currentTransport); } catch(e) {}
      currentTransport = null;
    }

    // meetingStartTime is null until activateMeeting() fires. If the
    // user clicks Start then immediately clicks End before onConnected
    // arrives, Date.now() - null would be NaN and the transcript would
    // show "Meeting ended. NaNm NaNs". Treat that path as a 0-duration
    // end so the line stays readable.
    var duration = meetingStartTime ? Math.round((Date.now() - meetingStartTime) / 1000) : 0;
    var mins = Math.floor(duration / 60);
    var secs = duration % 60;
    document.getElementById('statusText').textContent = 'ended';
    addTranscriptEntry('system', 'Meeting ended. ' + mins + 'm ' + secs + 's. Cost: $' + totalCost.toFixed(3));
  }
}

function toggleMic() {
  if (!pipecatClient) return;
  micActive = !micActive;
  var btn = document.getElementById('micBtn');
  pipecatClient.enableMic(micActive);
  if (micActive) {
    btn.classList.add('recording');
    document.getElementById('statusText').textContent = 'listening...';
  } else {
    btn.classList.remove('recording');
    document.getElementById('statusText').textContent = 'muted';
  }
}

// ── Slice 4: hybrid text input ─────────────────────────────────────────
// Feature flag mirrors src/config.ts WARROOM_TEXT_INPUT. Emitted as
// "1" / "0" so the inline client JS can noop when disabled.
window.WARROOM_TEXT_INPUT = ${jsTextInputFlag};

// ── Slice 6: archive resume ────────────────────────────────────────────
window.WARROOM_RESUME_ENABLED = ${jsResumeFlag};

function resumeMeeting(meetingId) {
  if (window.WARROOM_RESUME_ENABLED === '0') return;
  if (!meetingId) return;
  var btn = document.querySelector('[data-resume-btn][data-meeting-id="' + meetingId + '"]');
  if (btn) btn.disabled = true;

  fetch(
    API_BASE + '/api/warroom/meeting/' + encodeURIComponent(meetingId) +
    '/resume?token=' + encodeURIComponent(TOKEN),
    { method: 'POST', headers: { 'Content-Type': 'application/json' } }
  )
    .then(function(r) {
      if (!r.ok) throw new Error('resume endpoint returned ' + r.status);
      return r.json();
    })
    .then(function(payload) {
      // Close the archive overlay + flash a visible badge so the user
      // knows the next question will resume this meeting. The voice
      // path consumes the resume one-shot via the Python server, so
      // we just surface the intent locally — nothing else to do.
      try { closeArchive(); } catch (e) { /* no-op */ }
      showResumeBadge(meetingId, payload);
    })
    .catch(function(err) {
      console.warn('resume: POST failed', err);
      if (btn) btn.disabled = false;
      try {
        addTranscriptEntry('system', 'Resume failed: ' + (err && err.message ? err.message : 'unknown'));
      } catch (e) { /* */ }
    });
}

function showResumeBadge(meetingId, payload) {
  // Idempotent: replace any existing badge.
  var existing = document.querySelector('[data-resume-badge]');
  if (existing) existing.remove();

  var shortId = (meetingId || '').slice(0, 8);
  var sessCount = (payload && payload.sessions && payload.sessions.length) || 0;
  var countLabel = sessCount === 1 ? '1 session' : sessCount + ' sessions';

  var badge = document.createElement('div');
  badge.className = 'resume-badge';
  badge.setAttribute('data-resume-badge', '');
  badge.setAttribute('data-meeting-id', meetingId);
  badge.innerHTML =
    '<span>&#10227; Resuming: <strong>' + escapeHtml(shortId) + '</strong> (' + escapeHtml(countLabel) + ')</span>' +
    '<span class="dismiss" onclick="dismissResumeBadge()">&times;</span>';
  document.body.appendChild(badge);
}

function dismissResumeBadge() {
  var el = document.querySelector('[data-resume-badge]');
  if (el) el.remove();
}

// ── Slice 7: settings panel (roster management) ────────────────────────
// Feature flag mirrors src/config.ts WARROOM_SETTINGS_ENABLED.
window.WARROOM_SETTINGS_ENABLED = ${jsSettingsFlag};

// Local editable copy of the preferences, plus the base_roster snapshot.
// Populated by loadSettings() from GET /api/warroom/settings. Persisted
// to the server via a single POST when the user clicks "Save".
var settingsState = null;

function toggleSettings() {
  if (window.WARROOM_SETTINGS_ENABLED === '0') return;
  var panel = document.getElementById('settingsPanel');
  var btn = document.getElementById('settingsBtn');
  if (!panel || !btn) return;
  if (panel.classList.contains('visible')) {
    closeSettings();
  } else {
    openSettings();
  }
}

function openSettings() {
  var panel = document.getElementById('settingsPanel');
  var btn = document.getElementById('settingsBtn');
  if (!panel) return;
  panel.classList.add('visible');
  panel.setAttribute('aria-hidden', 'false');
  if (btn) btn.classList.add('active');
  loadSettings();
}

function closeSettings() {
  var panel = document.getElementById('settingsPanel');
  var btn = document.getElementById('settingsBtn');
  if (!panel) return;
  panel.classList.remove('visible');
  panel.setAttribute('aria-hidden', 'true');
  if (btn) btn.classList.remove('active');
}

function loadSettings() {
  var body = document.getElementById('settingsBody');
  if (!body) return;
  body.innerHTML = '<div style="font-size:11px;color:#444;padding:20px 0">Loading settings...</div>';

  fetch(API_BASE + '/api/warroom/settings?token=' + encodeURIComponent(TOKEN))
    .then(function(r) { return r.json(); })
    .then(function(payload) {
      if (!payload || payload.ok === false) {
        body.innerHTML = '<div class="archive-empty" data-archive-empty><div class="text">Settings disabled.</div></div>';
        return;
      }
      settingsState = {
        base_roster: Array.isArray(payload.base_roster) ? payload.base_roster : [],
        prefs: {
          disabled_agents: (payload.prefs && Array.isArray(payload.prefs.disabled_agents)) ? payload.prefs.disabled_agents.slice() : [],
          order: (payload.prefs && Array.isArray(payload.prefs.order)) ? payload.prefs.order.slice() : [],
          added_obsidian_agents: (payload.prefs && Array.isArray(payload.prefs.added_obsidian_agents)) ? payload.prefs.added_obsidian_agents.slice() : [],
        }
      };
      renderSettings();
    })
    .catch(function(err) {
      console.warn('settings: GET failed', err);
      body.innerHTML = '<div class="archive-empty"><div class="text" style="color:#ef4444">Failed to load settings</div></div>';
    });
}

// Compute the effective sidebar order the user sees: user-specified
// order first (minus disabled), then unlisted base agents (minus
// disabled) in their original order.
function effectiveOrder() {
  if (!settingsState) return [];
  var disabled = new Set(settingsState.prefs.disabled_agents);
  var baseIds = settingsState.base_roster.map(function(a) { return a.id; });
  var known = new Set(baseIds);
  var explicit = settingsState.prefs.order.filter(function(id) { return known.has(id) && !disabled.has(id); });
  var seen = new Set(explicit);
  var rest = baseIds.filter(function(id) { return !seen.has(id) && !disabled.has(id); });
  return explicit.concat(rest);
}

function renderSettings() {
  var body = document.getElementById('settingsBody');
  if (!body || !settingsState) return;

  // ── Section 1: Agents actifs (toggle on/off) ──
  var disabled = new Set(settingsState.prefs.disabled_agents);
  var toggleRows = settingsState.base_roster.map(function(a) {
    var checked = !disabled.has(a.id);
    return (
      '<div class="settings-row">' +
        '<div class="sr-main">' +
          '<div class="sr-name">' + escapeHtml(a.name || a.id) + '</div>' +
          '<div class="sr-desc">' + escapeHtml(a.id) + '</div>' +
        '</div>' +
        '<label class="toggle-wrap">' +
          '<input type="checkbox" data-toggle-agent="' + escapeAttr(a.id) + '" ' +
            (checked ? 'checked' : '') + ' ' +
            'onchange="onToggleAgent(this)" />' +
          '<span>active</span>' +
        '</label>' +
      '</div>'
    );
  }).join('');

  // ── Section 2: Add Obsidian agent form ──
  var formHtml =
    '<div class="add-obsidian-form" id="addObsidianForm">' +
      '<label>id<input type="text" data-new-obs="id" placeholder="my-vault" autocapitalize="off"></label>' +
      '<label>name<input type="text" data-new-obs="name" placeholder="My Vault"></label>' +
      '<label class="full">description<input type="text" data-new-obs="description" placeholder="Short tag line"></label>' +
      '<label class="full">vault_root<input type="text" data-new-obs="vault_root" placeholder="~/Obsidian" autocapitalize="off"></label>' +
      '<label>project_folder<input type="text" data-new-obs="project_folder" placeholder="Notes" autocapitalize="off"></label>' +
      '<label>voice<input type="text" data-new-obs="voice" placeholder="kokoro" value="kokoro"></label>' +
      '<label>avatar (optional)<input type="text" data-new-obs="avatar" placeholder="my-vault.png"></label>' +
      '<label>model (optional)<input type="text" data-new-obs="model" placeholder="sonnet"></label>' +
      '<div class="submit-row">' +
        '<button type="button" class="resume-btn" data-add-obsidian-submit onclick="addObsidianFromForm()">Add to list</button>' +
        '<span id="addObsidianFeedback" style="font-size:11px;color:#666"></span>' +
      '</div>' +
    '</div>';

  // List of already-added entries (to show the user what they queued).
  var addedList = settingsState.prefs.added_obsidian_agents.map(function(e) {
    return (
      '<div class="settings-row">' +
        '<div class="sr-main">' +
          '<div class="sr-name">' + escapeHtml(e.name || e.id) + '</div>' +
          '<div class="sr-desc">' + escapeHtml(e.vault_root) + '/' + escapeHtml(e.project_folder) + '</div>' +
        '</div>' +
        '<div class="sr-actions">' +
          '<button type="button" class="reorder-btn" onclick="removeAddedObsidian(\\''+ escapeAttr(e.id) +'\\')" title="Remove">&times;</button>' +
        '</div>' +
      '</div>'
    );
  }).join('');

  // ── Section 3: Reorder ──
  var order = effectiveOrder();
  var byId = {};
  for (var i = 0; i < settingsState.base_roster.length; i++) {
    byId[settingsState.base_roster[i].id] = settingsState.base_roster[i];
  }
  var reorderRows = order.map(function(id, idx) {
    var a = byId[id] || { id: id, name: id };
    var upDisabled = idx === 0 ? 'disabled' : '';
    var downDisabled = idx === order.length - 1 ? 'disabled' : '';
    return (
      '<div class="settings-row">' +
        '<div class="sr-main">' +
          '<div class="sr-name">' + escapeHtml(a.name || id) + '</div>' +
          '<div class="sr-desc">' + escapeHtml(id) + '</div>' +
        '</div>' +
        '<div class="sr-actions">' +
          '<button type="button" class="reorder-btn" data-reorder-up="' + escapeAttr(id) + '" ' + upDisabled + ' onclick="reorderAgent(\\''+ escapeAttr(id) +'\\',-1)" title="Move up">&uarr;</button>' +
          '<button type="button" class="reorder-btn" data-reorder-down="' + escapeAttr(id) + '" ' + downDisabled + ' onclick="reorderAgent(\\''+ escapeAttr(id) +'\\',1)" title="Move down">&darr;</button>' +
        '</div>' +
      '</div>'
    );
  }).join('');

  body.innerHTML =
    '<div class="section">' +
      '<div class="section-title">Active agents</div>' +
      '<div class="section-hint">Toggle agents off to hide them from the sidebar. Disabled agents are also excluded from auto-routing.</div>' +
      toggleRows +
    '</div>' +
    '<div class="section">' +
      '<div class="section-title">Add Obsidian agent</div>' +
      '<div class="section-hint">Declare a new agent whose Claude Code session runs inside an Obsidian project folder.</div>' +
      formHtml +
      (addedList ? '<div style="margin-top:12px"><div class="section-hint">Queued additions:</div>' + addedList + '</div>' : '') +
    '</div>' +
    '<div class="section">' +
      '<div class="section-title">Sidebar order</div>' +
      '<div class="section-hint">Use &uarr; / &darr; to reorder. Unlisted agents (including newly-added Obsidian ones) land at the end.</div>' +
      reorderRows +
    '</div>' +
    '<div class="save-settings-row">' +
      '<span id="saveSettingsFeedback" class="save-feedback"></span>' +
      '<button type="button" class="resume-btn" data-save-settings onclick="saveSettings()">Save</button>' +
    '</div>';
}

function onToggleAgent(checkbox) {
  if (!settingsState) return;
  var id = checkbox.getAttribute('data-toggle-agent');
  if (!id) return;
  var disabled = settingsState.prefs.disabled_agents;
  if (checkbox.checked) {
    // Active — remove from disabled list.
    settingsState.prefs.disabled_agents = disabled.filter(function(x) { return x !== id; });
  } else {
    if (disabled.indexOf(id) === -1) disabled.push(id);
  }
  // Re-render so the reorder list reflects the new active set.
  renderSettings();
}

function reorderAgent(id, delta) {
  if (!settingsState) return;
  var order = effectiveOrder();
  var idx = order.indexOf(id);
  if (idx < 0) return;
  var target = idx + delta;
  if (target < 0 || target >= order.length) return;
  var tmp = order[idx];
  order[idx] = order[target];
  order[target] = tmp;
  settingsState.prefs.order = order;
  renderSettings();
}

function addObsidianFromForm() {
  if (!settingsState) return;
  var form = document.getElementById('addObsidianForm');
  var feedback = document.getElementById('addObsidianFeedback');
  if (!form) return;
  function val(field) {
    var el = form.querySelector('[data-new-obs="' + field + '"]');
    return el ? (el.value || '').trim() : '';
  }
  var entry = {
    id: val('id'),
    name: val('name'),
    description: val('description'),
    vault_root: val('vault_root'),
    project_folder: val('project_folder'),
    voice: val('voice') || 'kokoro',
  };
  var avatar = val('avatar'); if (avatar) entry.avatar = avatar;
  var model = val('model'); if (model) entry.model = model;

  // Light client-side check before queueing. Server re-validates at Save.
  if (!/^[a-z][a-z0-9_-]{0,29}$/.test(entry.id)) {
    if (feedback) { feedback.textContent = 'id must match [a-z][a-z0-9_-]{0,29}'; feedback.style.color = '#ef4444'; }
    return;
  }
  if (!entry.vault_root || !entry.project_folder) {
    if (feedback) { feedback.textContent = 'vault_root and project_folder are required'; feedback.style.color = '#ef4444'; }
    return;
  }
  // Refuse duplicate id on top of base roster or an existing queued add.
  var baseIds = settingsState.base_roster.map(function(a) { return a.id; });
  var queuedIds = settingsState.prefs.added_obsidian_agents.map(function(a) { return a.id; });
  if (baseIds.indexOf(entry.id) !== -1 || queuedIds.indexOf(entry.id) !== -1) {
    if (feedback) { feedback.textContent = "id '" + entry.id + "' already exists"; feedback.style.color = '#ef4444'; }
    return;
  }

  settingsState.prefs.added_obsidian_agents.push(entry);
  renderSettings();
}

function removeAddedObsidian(id) {
  if (!settingsState) return;
  settingsState.prefs.added_obsidian_agents = settingsState.prefs.added_obsidian_agents.filter(function(e) {
    return e.id !== id;
  });
  renderSettings();
}

function saveSettings() {
  if (!settingsState) return;
  var feedback = document.getElementById('saveSettingsFeedback');
  if (feedback) { feedback.textContent = 'Saving...'; feedback.classList.remove('error'); }

  fetch(API_BASE + '/api/warroom/settings?token=' + encodeURIComponent(TOKEN), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settingsState.prefs),
  })
    .then(function(r) { return r.json().then(function(b) { return { status: r.status, body: b }; }); })
    .then(function(res) {
      if (res.status !== 200 || !res.body || res.body.ok === false) {
        var msg = (res.body && res.body.error) ? res.body.error : 'Save failed';
        if (feedback) { feedback.textContent = msg; feedback.classList.add('error'); }
        return;
      }
      if (feedback) {
        feedback.textContent = 'Saved';
        feedback.classList.remove('error');
        // Data attribute the e2e spec waits on.
        var body = document.getElementById('settingsBody');
        if (body) body.setAttribute('data-settings-saved', '1');
      }
      // Refresh the sidebar so disabled/reordered agents apply immediately.
      try { if (typeof loadAgentCards === 'function') loadAgentCards(); } catch (e) { /* */ }
    })
    .catch(function(err) {
      console.warn('settings: POST failed', err);
      if (feedback) { feedback.textContent = 'Save failed: ' + (err && err.message ? err.message : 'unknown'); feedback.classList.add('error'); }
    });
}

// ── Slice 8: InputController (voice + text unified entry point) ────────
// Both the text input bar (sendWarRoomText) and the Pipecat STT
// callback (onUserTranscript) funnel through window.sendUserInput().
// That way the local echo + persistence + data-speaker attribute live
// in one place. Only text-sourced input also rounds-trips through
// pipecatClient.sendClientMessage('text-input') — voice input is
// already on-wire before we see its transcription.
window.sendUserInput = function sendUserInput(input) {
  if (!input || typeof input !== 'object') return;
  var source = input.source === 'voice' ? 'voice' : 'text';
  var raw = typeof input.text === 'string' ? input.text.trim() : '';
  if (!raw) return; // no empty/whitespace turns

  // Local echo — shared between voice and text paths.
  try {
    addTranscriptEntry('You', raw);
    var entries = document.querySelectorAll('#transcript .transcript-entry');
    if (entries.length) {
      entries[entries.length - 1].setAttribute('data-speaker', 'user');
      entries[entries.length - 1].setAttribute('data-source', source);
    }
  } catch (e) { console.warn('sendUserInput: echo failed', e); }

  // Persist as a user turn so the archive (Slice 3) + session store
  // (Slice 2) see BOTH voice and text turns with speaker='user'. For
  // voice turns, Pipecat's own transcript pipeline may also persist —
  // the warroom_transcript schema de-duplicates by (meeting_id, id),
  // so a belt-and-suspenders write here is harmless.
  if (typeof currentMeetingId !== 'undefined' && currentMeetingId) {
    try {
      fetch(API_BASE + '/api/warroom/meeting/transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingId: currentMeetingId, speaker: 'user', text: raw })
      }).catch(function(e) { console.warn('sendUserInput: persist failed', e); });
    } catch (e) { console.warn('sendUserInput: persist setup failed', e); }
  }

  // Only text-sourced input reaches the model via sendClientMessage.
  // Voice input already hit Gemini Live via the WS transport before
  // we saw the transcription.
  if (source === 'text') {
    try {
      if (pipecatClient && typeof pipecatClient.sendClientMessage === 'function') {
        pipecatClient.sendClientMessage('text-input', { text: raw });
      } else {
        console.warn('sendUserInput: no live pipecatClient (meeting not started?)');
      }
    } catch (e) {
      console.warn('sendUserInput: sendClientMessage failed', e);
    }
  }
};

function sendWarRoomText() {
  if (window.WARROOM_TEXT_INPUT === '0') return; // server-disabled
  var input = document.getElementById('warroomTextInput');
  if (!input) return;
  var raw = (input.value || '').trim();
  if (!raw) return;

  // Unified entry point: local echo + persist + Pipecat round-trip
  // live in window.sendUserInput. sendWarRoomText is now a thin shim
  // that owns UX concerns only (clear + refocus).
  window.sendUserInput({ source: 'text', text: raw });

  input.value = '';
  input.focus();
}

// ── Slice 3: Past Meetings archive (read-only) ─────────────────────────
// Simple two-state machine (list -> detail). No router, no framework.
// Data comes from GET /api/warroom/meetings and GET
// /api/warroom/meeting/:id/transcript (both exist in dashboard.ts).
var archiveOpen = false;

function togglePastMeetings() {
  if (archiveOpen) {
    closeArchive();
  } else {
    openArchive();
  }
}

function openArchive() {
  var panel = document.getElementById('archivePanel');
  var btn = document.getElementById('pastMeetingsBtn');
  if (!panel || !btn) return;
  panel.classList.add('visible');
  panel.setAttribute('aria-hidden', 'false');
  btn.classList.add('active');
  archiveOpen = true;
  loadArchiveList();
}

function closeArchive() {
  var panel = document.getElementById('archivePanel');
  var btn = document.getElementById('pastMeetingsBtn');
  if (!panel || !btn) return;
  panel.classList.remove('visible');
  panel.setAttribute('aria-hidden', 'true');
  btn.classList.remove('active');
  archiveOpen = false;
}

function loadArchiveList() {
  var body = document.getElementById('archiveBody');
  var title = document.getElementById('archiveTitle');
  if (!body) return;
  title.textContent = 'Past Meetings';
  body.innerHTML = '<div style="font-size:11px;color:#444;padding:20px 0">Loading...</div>';

  fetch(API_BASE + '/api/warroom/meetings?limit=20&token=' + encodeURIComponent(TOKEN))
    .then(function(r) { return r.json(); })
    .then(function(payload) {
      renderArchiveList(payload && payload.meetings ? payload.meetings : []);
    })
    .catch(function(err) {
      console.warn('archive: fetch list failed', err);
      body.innerHTML = '<div data-archive-empty style="color:#ef4444;font-size:12px;padding:20px 0">Failed to load meetings</div>';
    });
}

function renderArchiveList(meetings) {
  var body = document.getElementById('archiveBody');
  if (!body) return;

  if (!meetings || meetings.length === 0) {
    body.innerHTML =
      '<div class="archive-empty" data-archive-empty>' +
        '<div class="icon">&#128188;</div>' +
        '<div class="text">No past meetings yet</div>' +
      '</div>';
    return;
  }

  var parts = [];
  for (var i = 0; i < meetings.length; i++) {
    var m = meetings[i];
    var pinnedLabel = (typeof AGENT_LABELS !== 'undefined' && AGENT_LABELS[m.pinned_agent])
      ? AGENT_LABELS[m.pinned_agent]
      : (m.pinned_agent || 'Main');
    var dateStr = formatMeetingDate(m.started_at);
    var durStr = formatDurationShort(m.duration_s);
    var mode = (m.mode === 'auto') ? 'Hand Up' : 'Direct';
    var entryCount = (m.entry_count != null ? m.entry_count : 0) + ' entries';

    parts.push(
      '<div class="archive-row" data-meeting-row data-meeting-id="' + escapeAttr(m.id) + '" ' +
           'onclick="openMeetingDetail(\\''+ escapeAttr(m.id) +'\\')">' +
        '<div class="col-date">' + escapeHtml(dateStr) + '</div>' +
        '<div class="col-agent">' + escapeHtml(pinnedLabel) + '</div>' +
        '<div class="col-duration">' + escapeHtml(durStr) + '</div>' +
        '<div class="col-mode">' + escapeHtml(mode) + '</div>' +
        '<div class="col-entries">' + escapeHtml(entryCount) + '</div>' +
      '</div>'
    );
  }
  body.innerHTML = parts.join('');
}

function openMeetingDetail(meetingId) {
  var body = document.getElementById('archiveBody');
  var title = document.getElementById('archiveTitle');
  if (!body) return;
  title.textContent = 'Meeting - ' + meetingId.slice(0, 8);
  body.innerHTML = '<div style="font-size:11px;color:#444;padding:20px 0">Loading transcript...</div>';

  Promise.all([
    fetch(API_BASE + '/api/warroom/meetings?limit=100&token=' + encodeURIComponent(TOKEN))
      .then(function(r) { return r.json(); })
      .catch(function() { return { meetings: [] }; }),
    fetch(API_BASE + '/api/warroom/meeting/' + encodeURIComponent(meetingId) +
          '/transcript?token=' + encodeURIComponent(TOKEN))
      .then(function(r) { return r.json(); })
      .catch(function() { return { transcript: [] }; })
  ]).then(function(results) {
    var meetings = (results[0] && results[0].meetings) || [];
    var transcript = (results[1] && results[1].transcript) || [];
    var meeting = null;
    for (var i = 0; i < meetings.length; i++) {
      if (meetings[i].id === meetingId) { meeting = meetings[i]; break; }
    }
    renderArchiveDetail(meeting, transcript);
  });
}

function renderArchiveDetail(meeting, transcript) {
  var body = document.getElementById('archiveBody');
  if (!body) return;

  var startEpoch = 0;
  if (meeting && typeof meeting.started_at === 'number') {
    startEpoch = meeting.started_at;
  } else if (transcript && transcript.length > 0 && typeof transcript[0].created_at === 'number') {
    // Fallback: first transcript entry time, so offsets still resolve.
    startEpoch = transcript[0].created_at;
  }

  var header = '';
  if (meeting) {
    var pinnedLabel = (typeof AGENT_LABELS !== 'undefined' && AGENT_LABELS[meeting.pinned_agent])
      ? AGENT_LABELS[meeting.pinned_agent]
      : (meeting.pinned_agent || 'Main');
    var resumeButtonHtml = '';
    if (window.WARROOM_RESUME_ENABLED !== '0') {
      // Slice 6 — "Resume" button next to the meta line. Click triggers
      // POST /api/warroom/meeting/:id/resume + flips to the live view.
      resumeButtonHtml =
        '<button type="button" class="resume-btn" ' +
          'data-resume-btn data-meeting-id="' + escapeAttr(meeting.id) + '" ' +
          'onclick="resumeMeeting(\\''+ escapeAttr(meeting.id) +'\\')">' +
          '&#10227; Resume' +
        '</button>';
    }
    header =
      '<div class="archive-detail-header">' +
        '<div class="meta"><strong>' + escapeHtml(formatMeetingDate(meeting.started_at)) + '</strong> - ' +
          'pinned: ' + escapeHtml(pinnedLabel) + ' - ' +
          'duration: ' + escapeHtml(formatDurationShort(meeting.duration_s)) + ' - ' +
          'mode: ' + escapeHtml(meeting.mode === 'auto' ? 'Hand Up' : 'Direct') +
        '</div>' +
        resumeButtonHtml +
      '</div>';
  }

  if (!transcript || transcript.length === 0) {
    body.innerHTML =
      header +
      '<div class="archive-empty" data-archive-empty>' +
        '<div class="icon">&#128196;</div>' +
        '<div class="text">No transcript entries for this meeting</div>' +
      '</div>';
    return;
  }

  var parts = [header];
  for (var j = 0; j < transcript.length; j++) {
    var entry = transcript[j];
    var absTime = formatAbsoluteHMS(entry.created_at);
    var relOffset = formatRelativeOffset(entry.created_at, startEpoch);
    var speaker = entry.speaker || 'agent';
    var speakerLabel = resolveSpeakerLabel(speaker);
    var speakerClass = (speaker === 'user') ? 'user' : (speaker === 'system' ? 'system' : '');

    parts.push(
      '<div class="archive-entry" data-transcript-entry>' +
        '<div class="times">' +
          '<span class="absolute" data-absolute-time>' + escapeHtml(absTime) + '</span>' +
          '<span class="relative" data-relative-offset>' + escapeHtml(relOffset) + '</span>' +
        '</div>' +
        '<div class="speaker ' + speakerClass + '">' + escapeHtml(speakerLabel) + '</div>' +
        '<div class="text">' + escapeHtml(entry.text || '') + '</div>' +
      '</div>'
    );
  }
  body.innerHTML = parts.join('');
}

function resolveSpeakerLabel(speaker) {
  if (!speaker) return 'Agent';
  if (speaker === 'user') return 'You';
  if (speaker === 'system') return 'System';
  if (typeof AGENT_LABELS !== 'undefined' && AGENT_LABELS[speaker]) return AGENT_LABELS[speaker];
  return speaker;
}

function pad2(n) { return (n < 10 ? '0' : '') + n; }

function formatAbsoluteHMS(epochSeconds) {
  if (typeof epochSeconds !== 'number' || !isFinite(epochSeconds)) return '00:00:00';
  var d = new Date(epochSeconds * 1000);
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
}

function formatRelativeOffset(epochSeconds, startEpoch) {
  if (typeof epochSeconds !== 'number' || typeof startEpoch !== 'number') return '00:00';
  var delta = Math.max(0, Math.floor(epochSeconds - startEpoch));
  var m = Math.floor(delta / 60);
  var s = delta % 60;
  return pad2(m) + ':' + pad2(s);
}

function formatMeetingDate(epochSeconds) {
  if (typeof epochSeconds !== 'number' || !isFinite(epochSeconds)) return '-';
  var d = new Date(epochSeconds * 1000);
  // Locale-aware compact: "2026-04-20 14:35"
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
         ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

function formatDurationShort(seconds) {
  if (typeof seconds !== 'number' || seconds <= 0) return '-';
  var m = Math.floor(seconds / 60);
  var s = Math.floor(seconds % 60);
  if (m === 0) return s + 's';
  return m + 'm ' + pad2(s) + 's';
}

function escapeAttr(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Inline escapeHtml for archive rendering. warroom-html already defines
// one server-side; here we need a client-side equivalent that runs in
// the browser without pulling any bundler. Named different from the
// server helper (escapeHtml is local to the template on the server).
(function() {
  if (typeof window.escapeHtml === 'function') return;
  window.escapeHtml = function(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
})();
</script>
</body>
</html>`;
}
