#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────
# install-warroom-launchd.sh
#
# Installs the War Room LaunchAgent. Assumes warroom/.venv/ exists
# (create it manually with `python3 -m venv warroom/.venv` and
# `pip install -r warroom/requirements.txt` before running this).
#
# Uninstall: bash scripts/uninstall-warroom-launchd.sh
# ──────────────────────────────────────────────────────────────────────

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
SRC_PLIST="$REPO_ROOT/launchd/com.claudeclaw.warroom.plist"
DST_PLIST="$HOME/Library/LaunchAgents/com.claudeclaw.warroom.plist"
VENV_PY="$REPO_ROOT/warroom/.venv/bin/python"

if [[ ! -f "$SRC_PLIST" ]]; then
  echo "❌ $SRC_PLIST not found" >&2
  exit 1
fi

if [[ ! -x "$VENV_PY" ]]; then
  echo "❌ Python venv not found at $VENV_PY" >&2
  echo "   Create it first:" >&2
  echo "     cd $REPO_ROOT" >&2
  echo "     python3 -m venv warroom/.venv" >&2
  echo "     source warroom/.venv/bin/activate" >&2
  echo "     pip install -r warroom/requirements.txt" >&2
  exit 1
fi

# Unload if already running
if launchctl list | grep -q "com.claudeclaw.warroom"; then
  echo "↻ Unloading existing War Room LaunchAgent..."
  launchctl bootout "gui/$(id -u)" "$DST_PLIST" 2>/dev/null || true
fi

cp "$SRC_PLIST" "$DST_PLIST"
chmod 644 "$DST_PLIST"

launchctl bootstrap "gui/$(id -u)" "$DST_PLIST"
launchctl enable "gui/$(id -u)/com.claudeclaw.warroom"

echo "✅ installed com.claudeclaw.warroom"
echo ""
echo "Check status:"
echo "  launchctl list | grep warroom"
echo "  tail /tmp/claudeclaw-warroom.log"
echo ""
echo "Restart:"
echo "  launchctl kickstart -k gui/\$(id -u)/com.claudeclaw.warroom"
