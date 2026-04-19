# RFC: War Room v2 — Session-centric meetings, hybrid voice/text, and vault-backed agents

## Status

Draft

## Summary

Evolve the War Room from a stateless, voice-only meeting surface to a **session-centric** one. Persist each meeting and its turns alongside the Claude Code session IDs that produced them, so conversations survive reconnects and can be **resumed** with full context. Add a **text input channel** usable mid-session (voice and text interchangeable within the same conversation). Make **Obsidian-backed project contexts** (arbitrary directories holding a `CLAUDE.md`) first-class participants, selectable from the same sidebar as the built-in agents.

Incremental, additive, progressive — shipped as **8 vertical slices**, each independently testable and independently revertible behind a feature flag. The current War Room keeps running in parallel on its usual port while v2 matures on a dev port.

Estimated scope: ~3-5 weeks calendar, ~3,500 LOC across 8 pull requests.

---

## Motivation

### 1. Sessions are ephemeral

In the live mode (Gemini Live), the server calls `context.messages.clear()` when a client reconnects (`warroom/server.py:676-687`). Any conversation stops dead at the first reconnect. There is no backing store for turns with speaker attribution — only a flat transcript log (`warroom_transcript`) that records `speaker TEXT, text TEXT, created_at INTEGER` and is not linked to the Claude Code session IDs that the voice bridge already uses (`src/agent-voice-bridge.ts:140-199`).

A user who runs a long conversation with a pinned agent — brainstorming on a project, drafting an email, walking through a decision tree — pays for context they cannot recover.

### 2. Speaker identity leaks

The transcript panel labels bot responses with `'Agent'` hard-coded (`src/warroom-html.ts:1782`) in the reconnect auto-retry closure, even though the correct label flows fine in the normal direct-mode path (`src/warroom-html.ts:1090`). Users running multi-agent sessions regularly see "Agent" instead of "RC1", "Comms", or "Ops". The DB inherits this: `SELECT DISTINCT speaker FROM warroom_transcript` returns `'Agent'` alongside real IDs.

### 3. Voice-only is a hard floor

The War Room is currently voice-first by design (Pipecat + Gemini Live native audio). When the user is in a context where speaking aloud is not possible (coworking, train, late at night next to a sleeping household), the tool is unusable. A hybrid path — type-in at any moment, agent keeps replying in voice — unblocks the mobile-first daily usage that motivated the project.

### 4. Project context is a first-class concept

Outside the War Room, the primary way users interact with Claude Code is `cd ~/work/my-project && claude`. The project's `CLAUDE.md` plus the directory's files forms a coherent context that the user has already invested in. Right now, the War Room hosts a fixed roster of 6-8 agents hard-coded in `warroom/personas.py:45-180` plus a hardcoded avatar registry. There is a fallback for dynamic entries in `/tmp/warroom-agents.json`, but it assumes the invoked agent is a ClaudeClaw agent (spawned via `src/agent-voice-bridge.ts` with a fixed cwd).

For users who maintain project-specific assistants in their vault (for example, an administration-of-a-small-company context, a market-research-for-a-niche context, a legal-onboarding-of-a-client context), there is no way to surface them in the War Room.

### 5. Testability

Currently the War Room has essentially **no automated test coverage**. A single `warroom/test_voxtral_mode.py` covers some env handling. The TypeScript side (`src/warroom-html.ts`, `src/dashboard.ts` War Room endpoints) has unit tests only for the static HTML smoke. There is no e2e harness, no integration path.

Adding session persistence makes previously-untestable flows testable: the DB becomes a source of truth, mock transports replace real Pipecat WS, Playwright can assert on rendered transcripts.

---

## Current architecture

```
[Browser — Pipecat JS client]
    │ WebSocket (audio frames)
    ▼
[Python — warroom/server.py]
    │ Mode = 'live' (default) → Gemini Live native-audio
    │      'legacy'|'voxtral'|'kokoro' → STT → Router → Bridge → TTS
    ▼
[Node subprocess — src/agent-voice-bridge.ts]
    │ Invokes query() from @anthropic-ai/claude-agent-sdk
    │ with resume: <sessionId> (already supported)
    ▼
[Claude Code CLI session]
    │ Loads CLAUDE.md from cwd
    │ Tools, MCPs, skills
    ▼
[Text response → TTS → audio frames back to browser]
```

### Observations

1. **Meeting persistence is partial.** `warroom_meetings` + `warroom_transcript` exist (`src/db.ts:299-320`), but nothing ties them to the `sessions` table that tracks Claude Code session IDs per `(chat_id, agent_id)`. A meeting ends, its transcript stays, its underlying agent session cannot be resumed from the War Room UI.

2. **Session resume is already wired.** `CliEngine` (shipped in D4 Phase 1, commit `535a8e5`) and `agent-voice-bridge.ts` both already use `resume: options.sessionId`. We do not need to invent resumption — we need to expose it to the UI and retain enough per-turn metadata to make resumption reliable.

3. **The roster builder is extensible by design.** `personas.py:_generate_persona()` falls back to `/tmp/warroom-agents.json` for unknown IDs. Adding a "project-dir-backed agent" class does not require rewriting the roster, only a small loader.

4. **The dashboard already exposes meeting endpoints.** `GET /api/warroom/meetings`, `GET /api/warroom/meeting/:id/transcript`, `POST /api/warroom/meeting/start|end|transcript` (`src/dashboard.ts:431-459`). The UI does not surface any of them.

---

## Goals

- Persist meetings, agent sessions, and turns in a single store so that resuming a past conversation reloads actual context into the agent.
- Let users switch between voice and text inside a single session, keeping the conversation intact.
- Let users register a project directory (`CLAUDE.md` + working files) as a War Room agent via UI, without editing `personas.py`.
- Expose the past-meetings archive (already persisted server-side) in the UI.
- Fix the hard-coded `'Agent'` speaker label, propagating the real agent id across every reconnection path.
- Ship each of the above as a self-contained slice that can be used, tested, and reverted independently.
- Build a minimal e2e test harness (Playwright + pytest integration fixtures) that the rest of the project can reuse.

## Non-goals

- No rewrite of the Pipecat pipeline or the Gemini Live wiring. The v2 changes sit above and around the pipeline, not inside it.
- No mobile responsive redesign. The audit flagged it; it is valuable but out of scope for this RFC.
- No change to Voxtral / Kokoro / legacy modes beyond best-effort compatibility. The v2 work targets `live` mode first.
- No replacement of the `/tmp/*.json` IPC used for pinning and the roster. It works today; touching it risks regression and pulls in OS-specific concerns (`launchctl`) that this RFC deliberately avoids.
- No new front-end framework. The UI stays vanilla TypeScript producing HTML strings.
- No multi-tenant features or shared-meeting collaboration.

---

## Proposed architecture (v2)

```
[Browser — Pipecat JS client + InputController]
    │
    ├── voice → WebSocket audio frames (unchanged)
    ├── text  → RTVIClientMessage { type: 'text-input', text }
    │          (new in Slice 4)
    ▼
[Python — warroom/server.py]
    │ Session-aware: on meeting start, resolves agent_session_id
    │ On reconnect: loads last-N turns from DB (Slice 2) instead of wiping context
    │ Text-input handler: queues UserMessageFrame into LLMContext (Slice 4)
    ▼
[Node subprocess — src/agent-voice-bridge.ts]
    │ Accepts --cwd <path>   (Slice 5, for Obsidian agents)
    │ Accepts --resume-session <id>  (Slice 6)
    │ Writes per-turn rows to warroom_turns (Slice 2)
    ▼
[Claude Code session (existing)]
```

```
[DB (single claudeclaw.db, extended)]
    warroom_meetings        (id, started_at, ended_at, mode, pinned_agent, entry_count)
    warroom_transcript      (id, meeting_id, speaker, text, created_at)   ← kept, additive
    warroom_agent_sessions  (id, meeting_id, agent_id, session_id, …)     ← new
    warroom_turns           (id, meeting_id, agent_session_id, turn_number,
                             input_source, user_message, agent_response,
                             claude_message_uuid, tokens, cost, …)         ← new
    warroom_resumption_checkpoints (id, agent_session_id, from_message_id,
                                    reason, metadata)                      ← new
```

```
[Sidebar roster = personas.py AGENT_PERSONAS
                + /tmp/warroom-agents.json (existing dynamic fallback)
                + obsidian_loader.load_agents() ← new in Slice 5]
```

---

## Database schema changes

All additive. Existing tables are untouched; existing queries continue to work.

### `warroom_agent_sessions`

One row per `(meeting, agent)` pair. Records which Claude Code session actually handled the conversation so that `resume` can load it.

```sql
CREATE TABLE warroom_agent_sessions (
  id                  TEXT PRIMARY KEY,
  meeting_id          TEXT NOT NULL,
  agent_id            TEXT NOT NULL,
  session_id          TEXT NOT NULL,         -- Claude Code SDK session id
  mode                TEXT NOT NULL,         -- 'direct' | 'broadcast'
  started_at          INTEGER NOT NULL,
  last_activity_at    INTEGER NOT NULL,
  status              TEXT DEFAULT 'active', -- 'active' | 'paused' | 'resumed'
  fork_at_message_id  TEXT,                  -- message UUID for fork/branch
  created_at          INTEGER NOT NULL,
  FOREIGN KEY (meeting_id) REFERENCES warroom_meetings(id),
  UNIQUE (meeting_id, agent_id)
);
CREATE INDEX idx_warroom_agent_sessions_meeting
  ON warroom_agent_sessions(meeting_id, agent_id);
```

### `warroom_turns`

One row per user/agent exchange. Contains the actual content (for archive + future semantic search) and the token/cost ledger.

```sql
CREATE TABLE warroom_turns (
  id                  TEXT PRIMARY KEY,
  meeting_id          TEXT NOT NULL,
  agent_session_id    TEXT NOT NULL,
  turn_number         INTEGER NOT NULL,
  input_source        TEXT NOT NULL,         -- 'voice' | 'text'
  user_message        TEXT,
  agent_response      TEXT,
  claude_message_uuid TEXT,                  -- SDK message UUID for resumeSessionAt
  input_tokens        INTEGER DEFAULT 0,
  output_tokens       INTEGER DEFAULT 0,
  cost_usd            REAL DEFAULT 0,
  did_compact         INTEGER DEFAULT 0,
  created_at          INTEGER NOT NULL,
  FOREIGN KEY (meeting_id) REFERENCES warroom_meetings(id),
  FOREIGN KEY (agent_session_id) REFERENCES warroom_agent_sessions(id)
);
CREATE INDEX idx_warroom_turns_session
  ON warroom_turns(agent_session_id, turn_number);
```

### `warroom_resumption_checkpoints`

For the future fork/branch case: a user might want to replay a meeting from turn N with a different direction. This table records named checkpoints mapped to message UUIDs (the SDK supports `resumeSessionAt: <uuid>`).

```sql
CREATE TABLE warroom_resumption_checkpoints (
  id               TEXT PRIMARY KEY,
  agent_session_id TEXT NOT NULL,
  from_message_id  TEXT NOT NULL,
  reason           TEXT,                     -- 'user_pause' | 'auto_save' | 'fork'
  checkpoint_at    INTEGER NOT NULL,
  metadata         TEXT,                     -- JSON blob
  created_at       INTEGER NOT NULL,
  FOREIGN KEY (agent_session_id) REFERENCES warroom_agent_sessions(id)
);
CREATE INDEX idx_resumption_checkpoints_session
  ON warroom_resumption_checkpoints(agent_session_id, created_at DESC);
```

### Migration strategy for the DB

No destructive changes. On startup, the three `CREATE TABLE IF NOT EXISTS` statements run; existing installations simply pick up the new tables. Slice 2 double-writes to the old `warroom_transcript` and the new `warroom_turns` for one full release cycle, so a rollback does not lose data.

---

## API changes

All additive, all behind feature flags where user-visible.

| Endpoint | Status | Slice | Notes |
|----------|--------|-------|-------|
| `POST /api/warroom/meeting/start` | modified | 2 | Accepts `agent_session_id` payload; still backwards compatible |
| `POST /api/warroom/meeting/transcript` | modified | 1, 2 | Rejects `speaker == 'Agent'` with a warning; dual-writes to `warroom_turns` |
| `GET /api/warroom/meetings` | modified | 3 | Adds `duration_s` and `pinned_agent_label` joined from roster |
| `GET /api/warroom/meeting/:id/agent-sessions` | **new** | 2 | Returns the `warroom_agent_sessions` rows for a meeting |
| `GET /api/warroom/meeting/:id/turns` | **new** | 2 | Returns paginated `warroom_turns` rows |
| `POST /api/warroom/meeting/:id/resume` | **new** | 6 | Marks a session for resumption at the next `start` |
| `GET /api/warroom/settings` | **new** | 7 | Reads `config/user-preferences.yaml` |
| `POST /api/warroom/settings` | **new** | 7 | Updates user prefs (roster toggles, ordering) |
| `POST /api/warroom/agents/obsidian` | **new** | 5/7 | Registers a new Obsidian-backed agent |

---

## Migration strategy — 8 slices

Each slice is a single PR, each shippable and usable on its own, each revertible. Feature flags gate user-visible changes until validated.

### Slice 0 — e2e harness + this RFC (1-2 days)

- Scaffold `tests/e2e/` (Playwright browser, pytest fixtures).
- Add `WARROOM_DEV_MODE`, `DASHBOARD_PORT=3142`, `WARROOM_PORT=7861` overrides.
- Publish this RFC as a Draft PR.

### Slice 1 — Fix speaker name (2 days)

- Replace `'Agent'` hard-coded label at `src/warroom-html.ts:1782` by `AGENT_LABELS[pinnedAgent] || pinnedAgent || 'Main'`.
- Server-side guard: `POST /api/warroom/meeting/transcript` refuses raw `'Agent'` with a warning.
- E2E: after a meeting with RC1 pinned, every bot turn carries the `'RC1 (Main)'` label.

### Slice 2 — Session store extension (3-4 days)

- Add the three tables above to `src/db.ts`.
- Wire `src/agent-voice-bridge.ts` to populate `warroom_agent_sessions` on session creation and `warroom_turns` on each turn.
- Expose `message_uuid` in `CliEngine`'s `init`/`result` events (needed for fork/resume).
- Dual-write with existing `warroom_transcript` for one release.

### Slice 3 — Archive view (2-3 days)

- Add a `?view=archive` toggle in the War Room UI.
- List past meetings (limit 20, ordered by `started_at DESC`) with duration and speaker labels.
- Detail view shows full transcript with absolute and relative timestamps.

### Slice 4 — Text input mid-session (3-4 days)

- Add a text input bar next to the mic button.
- Client sends `{ type: 'text-input', text }` over RTVI; server queues a `UserMessageFrame` into the Pipecat LLM context.
- Agent always replies in voice (see Open Question #1 for the alternative).
- Flag `WARROOM_TEXT_INPUT` gates the UI.

### Slice 5 — Obsidian agents as first-class (5-7 days)

- New loader `warroom/obsidian_loader.py` reads a YAML config (`config/obsidian-agents.yaml`, git-ignored; `.example` committed).
- Each entry provides `{ name, description, vault_root, project_folder, voice, avatar, model }`.
- `src/agent-voice-bridge.ts` accepts `--cwd <path>`; the Claude Code SDK receives `cwd` so the target directory's `CLAUDE.md` loads as the system context.
- At boot, `/tmp/warroom-agents.json` merges built-in + YAML-declared agents. Personas for new agents are generated via the existing `_generate_persona()` fallback.

### Slice 6 — Resume past meetings (3-4 days)

- A Resume button in the archive detail view hits `POST /api/warroom/meeting/:id/resume`.
- Server sets a one-shot flag; the next meeting `start` passes `resume: sessionId` to the SDK.
- Fallback: if the SDK refuses the session id (purged from `~/.claude/projects/`), the last N turns are injected as synthetic user/agent messages into `LLMContext`.
- Flag `WARROOM_RESUME_ENABLED`.

### Slice 7 — Settings UI (3-4 days)

- Modal "Settings" accessible via a gear icon.
- Toggle roster entries on/off. Reorder sidebar (drag). Add a new Obsidian agent via a form with a path picker.
- Persisted in `config/user-preferences.yaml` (git-ignored).

### Slice 8 — Consolidation + docs (2-3 days)

- Extract an `InputController` that abstracts voice + text behind a single client API.
- Update `CHANGELOG.md`, `README.md`, add `docs/warroom-v2-user-guide.md`.
- Full manual QA checklist (see Testing strategy).

---

## Testing strategy

Four tiers, pyramid-style.

| Tier | Framework | Coverage |
|------|-----------|----------|
| TS unit | Vitest (existing) | `src/db.ts` CRUD, `src/dashboard.ts` handlers, `src/engines/cli-engine.ts` extensions |
| Python unit | pytest | `warroom/personas.py`, `warroom/obsidian_loader.py` |
| Integration | pytest + Pipecat mocks | Pipeline frames without a real Gemini Live connection |
| Browser e2e | Playwright | Full scenarios against a dev dashboard on 3142 |

### TDD per slice

For each slice: the tests are written first, observed RED, then the minimum code change is made, observed GREEN, then refactor. The two commits (tests + implementation) are kept separate for audit readability.

### What we cannot test automatically

Real-time Pipecat audio frames and Gemini Live voice quality. These are covered by a reproducible **manual checklist** executed before each PR:

- [ ] Start dev dashboard (`DASHBOARD_PORT=3142 WARROOM_PORT=7861 WARROOM_DEV_MODE=1 npm run dev`)
- [ ] Open `http://localhost:3142/warroom?token=...` in a clean browser
- [ ] Pin RC1, start meeting, three sentences, check voice replies make sense
- [ ] Unpin RC1, pin Comms, two more sentences, check voice and label switch
- [ ] Type text (Slice 4+), check the agent still replies vocally
- [ ] End meeting; go to Archive (Slice 3+); check the meeting appears with the right speaker label
- [ ] Click Resume (Slice 6+); ask a question that references the earlier conversation
- [ ] Console: no JS error beyond the known `/favicon.ico` 404

---

## Alternatives considered

### A) Patches incrémentaux (Approche 1)

Fix each pain point in isolation: patch the speaker label (Slice 1 only), add a simple file-based archive viewer, add a text input field that posts a synthetic transcript row, skip the session backbone entirely.

Pros: small PRs, fast cycle.

Cons: the resume feature is not achievable without a session-linked store. Without the schema extension, "resume" would become "load the last N transcript texts as a prompt prefix" — a fake resume that discards the real conversation state the SDK already tracks. The cost of a brittle fake is higher than the cost of the right schema.

### B) Ground-up rewrite of the War Room (Approche 2, non-progressive)

Fully redesigned meeting service, new UI stack, CQRS-style event store.

Pros: clean architecture.

Cons: blocks daily usage for 3-4 weeks, drops working Gemini Live wiring, introduces an event store that is entirely unnecessary given the actual feature set. Classic over-engineering.

### C) Vertical slices + existing architecture — this proposal

Pros: each slice shippable; reverts via flags; reuses `@anthropic-ai/claude-agent-sdk` session resumption; no pipeline rewrite.

Cons: leaves some known technical debt untouched (macOS-specific `launchctl` code paths, `/tmp/*.json` IPC). That debt is independent of the features requested and is explicitly out of scope.

---

## Open questions

1. **Voice vs text agent reply.** When the user types text, should the agent reply in voice (consistent with Gemini Live native-audio), in text (miroring the input), or follow a user-configured preference?
   - Default proposed: voice reply. Simple, conservative.
   - To revisit in Slice 4 RC.

2. **Obsidian agent lifecycle.** Does a long-running Obsidian agent session stay bound to a single meeting, or can it span meetings (i.e. a conversation with the RoRworld admin agent that lasts weeks)?
   - Default proposed: one agent session per `(meeting_id, agent_id)`. Resuming an older meeting loads the old session id.
   - Counter-argument: across meetings, users may want a single continuous project session. This can be added later as an opt-in via user preferences (`continuous_session: true`).

3. **Upstream vs fork scope for Slice 5.** The Obsidian agents loader reads YAML from `config/obsidian-agents.yaml`. Should the example file ship upstream with a generic template, or is the whole feature experimental and fork-only?
   - Proposed: ship the loader + the `.example` file upstream; the real `.yaml` stays git-ignored and per-user. The loader is opt-in (no YAML = no Obsidian agents).

4. **Manual QA gate.** Should the CI refuse to merge a PR without a ticked manual checklist, or is that too heavy?
   - Proposed: honour system. PR description must include the completed checklist pasted in.

5. **Archive retention.** Unbounded growth of `warroom_turns` is a concern for long-term use (~1 MB/week at ordinary pace). Should we add a retention policy (e.g. purge > 180 days) in Slice 2?
   - Proposed: defer. The growth is slow, and deleting turns invalidates future resumes. Revisit when the table exceeds 100 MB.

---

## FAQ

**Does this break the existing `main` War Room?**

No. Every schema addition uses `IF NOT EXISTS`; every user-visible change is behind a flag; the mode default stays `live`; the prod dashboard port and daemon stay untouched.

**Why not rewrite the voice pipeline?**

Because it works. Pipecat + Gemini Live is battle-tested in daily use; its failure modes are well-understood. The features requested sit above the pipeline (persistence, UI), not inside it.

**What about Voxtral / Kokoro / legacy modes?**

Best-effort. The session store (Slice 2) and the archive UI (Slice 3) should work for any mode because they are driven by the existing `POST /api/warroom/meeting/transcript` calls. The text input (Slice 4) is Gemini Live-specific for the first release; porting to Voxtral is straightforward and can follow.

**What is the rollback plan if a slice causes a regression in prod?**

Each slice is one PR and one commit on the `main` branch once merged. `git revert <commit>` removes the change. Feature flags (`WARROOM_TEXT_INPUT`, `WARROOM_RESUME_ENABLED`, `WARROOM_DEV_MODE`) let us disable user-visible changes without a revert.

**How do I get involved?**

Comment on the Draft PR for this RFC. Slice 1 is a single-line fix and a good first contribution. The full plan is tracked at `docs/rfc-warroom-v2.md` and in the project's task list.

---

## References

- Code audit (local, 2026-04-19): full architecture dump of `warroom/`, `src/agent-voice-bridge.ts`, `src/engines/cli-engine.ts`, `src/db.ts`
- Usage audit (local, 2026-04-19): 16 observed friction points across desktop and mobile, screenshots archived
- Prior RFC for reference style: `docs/rfc-sdk-engine.md`
- Recent War Room work: commit `535a8e5` (D4 Phase 1 Engine), commit `41cd3e7` (dashboard session auth tests)
