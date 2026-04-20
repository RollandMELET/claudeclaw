# War Room v2 — End-to-End Tests

Test harness for the War Room v2 migration. Complements the existing Vitest (TS unit) and pytest (Python unit) suites with browser-level and integration-level scenarios.

## Layout

```
tests/e2e/
├── README.md                      # This file
├── playwright/                    # Browser scenarios (Playwright)
│   ├── helpers.ts                 # Page-object helpers (startMeeting, endMeeting, ...)
│   └── *.spec.ts                  # Individual scenarios
└── fixtures/                      # Python integration fixtures (pytest)
    ├── __init__.py
    ├── war_room_harness.py        # Start/stop Pipecat server, reset DB, inject transcripts
    └── pipecat_mock.py            # Mock transport + scripted RTVI frames
```

## Why two stacks

| Level | Framework | What it covers |
|-------|-----------|----------------|
| Browser e2e | Playwright | Full user scenarios in a real browser against a dev dashboard on port 3142 |
| Integration | pytest + Pipecat mock | Pipecat pipeline without a real Gemini Live connection — asserts on frames, DB rows, server state |

Unit tests stay where they are: `src/**/*.test.ts` (Vitest) and `warroom/test_*.py` (pytest).

## Running

### Prerequisites

Worktree-local setup (only needed once per worktree):

```bash
cd /Users/macminirolland/Dev/ClaudeClaw-v2
npm install                          # Installs @playwright/test devDependency
npx playwright install chromium      # Downloads Chromium browser (~150MB)
```

Python e2e fixtures also require the pytest suite:

```bash
python3 -m venv warroom/.venv
source warroom/.venv/bin/activate
pip install -r warroom/requirements.txt pytest pytest-asyncio
```

### Commands

| Command | Purpose |
|---------|---------|
| `npm run test:e2e` | Run Playwright browser tests against the dev dashboard |
| `npm run test:e2e:watch` | Same, watch mode for TDD |
| `pytest tests/e2e/fixtures` | Run pytest integration fixtures (once we add tests) |

## Dev dashboard

The Playwright tests assume a dashboard running on port **3142** (not the prod 3141). The harness starts it via:

```
DASHBOARD_PORT=3142 WARROOM_PORT=7861 WARROOM_DEV_MODE=1 npm run dev
```

These variables are already set in the worktree's `.env` (Slice 0).

## Writing new tests (TDD workflow)

1. Write the spec first, make it fail (RED)
2. Implement the minimal code to pass (GREEN)
3. Commit the spec and the implementation as two separate commits (documentation trail)
4. When the slice is complete, the full e2e suite is expected to stay GREEN

See `docs/rfc-warroom-v2.md` §7 for the per-slice acceptance checklist.

## Known limitations

- **Audio quality**: Pipecat/WebRTC real-time audio is not testable end-to-end in Playwright. Voice-related assertions go through Pipecat mocks (`pipecat_mock.py`). A manual checklist in §6.2 of the plan covers residual voice QA.
- **External services**: tests mock Gemini Live, Telegram bot APIs, and MCP tools. No live API calls in e2e.
