# Changelog

All notable changes to ClaudeClaw will be documented here.

## [unreleased] - 2026-05-01

### Fixed — agent file-send awareness
- New agents created via the dashboard wizard now always include the
  `[SEND_FILE:...]` / `[SEND_PHOTO:...]` marker documentation in their
  CLAUDE.md, regardless of which template the user picked. The plumbing
  in `src/bot.ts:637` (`extractFileMarkers`) has always supported these
  for every agent — newly-created agents just didn't know the syntax
  existed and would say things like "I can't send files" when asked to
  attach an image they'd just generated.
- **Action required for existing agents:** after pulling this commit,
  run `bash scripts/upgrade-agent-claude-md.sh` once. It idempotently
  appends the section to any `agents/<id>/CLAUDE.md` (in either the
  repo or `$CLAUDECLAW_CONFIG`) that doesn't already mention
  `SEND_FILE`/`SEND_PHOTO`. Safe to re-run; skips already-patched
  files. Agents pick up the change on their next turn — no restart
  needed.

## [unreleased] - 2026-04-29

### Added — text war room
- Multi-agent text war room (`/warroom/text`) with real-time SSE streaming, sticky-addressee follow-ups, `/standup`, `/discuss`, ack short-circuit, and per-meeting persistence.
- Tool-call disclosure UX in agent bubbles — collapsed by default (`▸ N tool calls`), click to expand for full args + results.
- Prompt-injection delimiters wrapping every retrieved-from-DB block in war-room prompt assembly.

### Added — security hardening
- Centralized kill switches with `requireEnabled()` enforced at every LLM-spawning boundary (`runAgent`, war-room orchestrator, router, gate, voice bridge, Gemini `generateContent`). Refusal counters surfaced via `/api/health.killSwitchRefusals`.
- Single dashboard mutation middleware that returns 503 on every non-GET when `DASHBOARD_MUTATIONS_ENABLED=false`. Replaces scattered per-route checks.
- War-room tool boundary: default-deny side-effect tools (`Bash`, `Write`, `Edit`, `Skill`, all MCPs) unless agent explicitly opts in via `warroom_tools:` in `agent.yaml`. `permissionMode: 'default'` (no bypass). Per-turn 8-tool budget. Audit log writes for every tool call.
- CSRF middleware rejects cross-origin mutating requests outside the allowlist (`localhost`, configured `DASHBOARD_URL`).
- Response headers: `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Cache-Control: no-store` on `/api/`.
- Least-privilege SDK env scrubbing (`getScrubbedSdkEnv()`) drops `DASHBOARD_TOKEN`, third-party API keys, and pattern-matched secret-shaped vars before subprocess inheritance.
- Default bind address `127.0.0.1` (was `0.0.0.0`); `DASHBOARD_BIND` env opt-in for LAN exposure.
- Pre-migration backups written to `store/claudeclaw.db.pre-<version>.bak` with `chmod 0600`, 3-backup rotation, gitignored.

### Added — ops & reliability
- Memory ingestion swapped from Gemini to Claude Haiku via OAuth (no extra API key); Gemini retained as fallback. Quota-aware backoff (5-min cooldown on 429).
- `pruneWarRoomMeetings(retentionDays=90)` integrated into the daily decay sweep.
- `endTextMeeting` now clears SDK sessions tied to the meeting.
- `/api/warroom/voices/apply` 3s cooldown to prevent respawn-storm during voice config edits.
- Voice war room `agent_error` and `hand_down` RTVI frames on OAuth/timeout/bridge failures so the browser surfaces real reasons instead of vague Gemini stutter.

### Added — observability
- `/api/health` exposes `killSwitches`, `killSwitchRefusals`, `memoryIngestion`, `warroom.textOpenMeetings`.
- Audit log writes for every war-room tool call (table existed; now populated).
- Router classifier logs elapsed_ms + outcome (success / parse_failure / timeout_or_error) on every call.

### Tests
- `warroom-text-events.test.ts` (MeetingChannel + finalizedTurns guard).
- `warroom-text-db.test.ts` (saveWarRoomConversationTurn idempotency, multi-agent dedup, memory strict-agent isolation, retention prune).
- `kill-switches.test.ts` extended with `requireEnabled` + refusal-counter coverage.
- All 368+ tests pass.

### Docs
- `docs/release-smoke.md` — release runbook (10-step).
- `docs/incident-runbook.md` — kill switch playbook with symptom → action mapping.
- `docs/warroom-mcp-policy.md` — per-agent tool/MCP allowlist + opt-in via `agent.yaml`.
- `docs/redteam-results.md` — adversarial test results (5/5 PASS).
- `docs/voice-smoke-results.md` — voice fix verification.
- `scripts/audit-profile.sh` — isolated red-team harness with canary `.env`, fail-closed gates.
- `scripts/pre-commit-check.sh` — personal-reference scrub.

### Closes Codex adversarial review high findings
- LLM kill switch now enforced at every boundary, not just one route.
- Dashboard mutation kill switch enforced via single middleware on all non-GET routes.
- War-room tool authority restricted to per-agent allowlist; `permissionMode: 'bypassPermissions'` removed from war-room calls.

## [War Room v2] - 2026-04-20

The War Room chantier lands as 8 slices + 1 micro-slice on branch
`feat/warroom-v2`. Each slice is shipped RED then GREEN; hashes below
point to the GREEN commit for each one.

### Added

- **Slice 1** (`c4df66d`): speaker identity propagation in the War Room
  transcript. Each entry carries the resolved agent label (e.g. "RC1
  (Main)"), not just the agent id, across reconnects.
- **Slice 2** (`930e1d7`): session store étendu. Three new SQLite tables
  (`warroom_agent_sessions`, `warroom_turns`, `warroom_resumption_checkpoints`)
  bind each meeting to the real Claude Code SDK session_id. The
  agent-voice-bridge gains a `--meeting-id` flag and double-writes
  turns alongside the legacy `warroom_transcript`.
- **Slice 2.1** (`69e6c60`): meeting-id wiring between the Node
  dashboard and the Pipecat server via a shared file
  (`/tmp/warroom-current-meeting.txt`). `POST /api/warroom/meeting/start`
  writes it; the Python server reads it before each voice-bridge
  spawn and forwards `--meeting-id`.
- **Slice 3** (`b5acb14`): "Past Meetings" archive view. A new button
  in the War Room header opens an overlay listing archived meetings
  (DESC) with a detail view that renders the full transcript with
  absolute HH:MM:SS and relative MM:SS timestamps.
- **Slice 4** (`ebcc38c`): hybrid voice/text input. A text field next
  to the mic button lets the user inject a turn into the live
  conversation; the agent still replies in voice (Option A per
  §4.4.1). Feature flag `WARROOM_TEXT_INPUT` (default on).
- **Slice 5** (`bd5ef72`): Obsidian agents wrapper. New YAML
  (`config/obsidian-agents.yaml`, gitignored) registers Obsidian
  project folders as first-class War Room agents. The voice-bridge
  runs the Claude Code SDK with `cwd=<vault/project>` so the SDK
  picks up that folder's `CLAUDE.md` + skills + MCPs. Pilot agent:
  `rorworld-warroom`.
- **Slice 6** (`4b8d1ba`): resume past meetings with session context.
  A "Resume" button on the archive detail view writes the prior
  session's `session_id` + last N turns to a one-shot file; the
  Python server consumes it on the next spawn and passes
  `--resume-session` (or `--resume-turns` fallback) to the
  voice-bridge. Feature flag `WARROOM_RESUME_ENABLED`.
- **Slice 7** (`f1e583a`): settings & roster management. A gear icon
  opens a Settings panel to toggle agents on/off, add new Obsidian
  agents via a form, and reorder the sidebar via ↑/↓ buttons.
  Persists to `config/user-preferences.yaml` (gitignored) +
  `/tmp/warroom-agents.json`. Feature flag `WARROOM_SETTINGS_ENABLED`.
- **Slice 8** (this release): dual-channel input consolidation via a
  unified `window.sendUserInput({source, text})` entry point. Voice
  and text paths share local echo + persistence + data attributes.
  Documentation refresh (`README.md`, `docs/warroom-v2-user-guide.md`).

### Tests

- vitest: 534 pass (+38 new over War Room v1 baseline)
- playwright: 19 pass (5 baseline + 14 new across slices 3/4/5/6/7/8)
- pytest: 26 pass (1 baseline + 25 new across slices 2/4/5/6/7)

### Feature flags

All War Room v2 features ship ON by default. Set to `0`, `false`, or
`no` to disable:

- `WARROOM_TEXT_INPUT`
- `WARROOM_RESUME_ENABLED`
- `WARROOM_SETTINGS_ENABLED`

## [v1.1.1] - 2026-03-06

### Added
- Migration system with versioned migration files
- `add-migration` Claude skill for scaffolding new versioned migrations
