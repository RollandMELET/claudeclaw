#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────
# pre-commit-voice-guard.sh
#
# Blocks commits that modify src/voice.ts when on a feat/ccos-* branch.
# The 7-provider TTS cascade (Voxtral MLX local, Kokoro, Voxtral API,
# Gemini Flash, ElevenLabs, Gradium, macOS say) is custom to this fork
# and must stay intact while cherry-picking features from upstream
# claudeclaw-os (which replaces voice.ts with a Gemini-Live-only path).
#
# Installed as .git/hooks/pre-commit by scripts/install-hooks.sh.
# Override with `git commit --no-verify` if truly intentional.
# ──────────────────────────────────────────────────────────────────────

set -e

BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || echo "")

case "$BRANCH" in
  feat/ccos-*)
    if git diff --cached --name-only | grep -qE '^src/voice\.ts$'; then
      cat <<'EOF' >&2

────────────────────────────────────────────────────────────────
❌ BLOCKED: src/voice.ts cannot be modified on feat/ccos-* branches
────────────────────────────────────────────────────────────────
The 7-provider TTS cascade (Voxtral local + Kokoro + Voxtral API +
Gemini Flash + ElevenLabs + Gradium + macOS say) is custom to this
fork and must remain intact while cherry-picking from upstream.

If this change is truly intentional:
  1. Check out main (or a non-ccos branch)
  2. Make the change there
  3. Rebase or merge back

If you REALLY know what you're doing, bypass with:
  git commit --no-verify

EOF
      exit 1
    fi
    ;;
esac

exit 0
