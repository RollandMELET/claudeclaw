# Changelog

All notable changes to ClaudeClaw will be documented here.

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
