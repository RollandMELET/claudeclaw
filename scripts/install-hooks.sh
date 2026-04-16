#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────
# install-hooks.sh
#
# Installs Git hooks from scripts/hooks/ into .git/hooks/.
# Idempotent: re-running overwrites existing hooks with current content.
#
# Hooks installed:
#   - pre-commit → scripts/hooks/pre-commit-voice-guard.sh
#     Blocks src/voice.ts modifications on feat/ccos-* branches.
# ──────────────────────────────────────────────────────────────────────

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOKS_SRC="$REPO_ROOT/scripts/hooks"
HOOKS_DST="$REPO_ROOT/.git/hooks"

if [[ ! -d "$HOOKS_SRC" ]]; then
  echo "❌ $HOOKS_SRC not found." >&2
  exit 1
fi

if [[ ! -d "$HOOKS_DST" ]]; then
  echo "❌ $HOOKS_DST not found (is this a git repo?)." >&2
  exit 1
fi

install_hook() {
  local src="$1"
  local name="$2"
  local dst="$HOOKS_DST/$name"

  cp "$src" "$dst"
  chmod +x "$dst"
  echo "✅ installed $name → $dst"
}

install_hook "$HOOKS_SRC/pre-commit-voice-guard.sh" "pre-commit"

echo ""
echo "Hooks installed. Test with:"
echo "  git checkout -b test-voice-guard"
echo "  echo '// test' >> src/voice.ts"
echo "  git add src/voice.ts && git commit -m 'test'"
echo "  # (expect: commit blocked on feat/ccos-* — but this branch isn't ccos, so test on a ccos branch)"
