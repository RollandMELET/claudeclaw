#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────
# uninstall-warroom-launchd.sh
#
# Unloads the War Room LaunchAgent and removes the plist. The warroom/
# code and venv are preserved — only the auto-start daemon is removed.
# ──────────────────────────────────────────────────────────────────────

set -euo pipefail

DST_PLIST="$HOME/Library/LaunchAgents/com.claudeclaw.warroom.plist"

if launchctl list | grep -q "com.claudeclaw.warroom"; then
  echo "↻ Unloading com.claudeclaw.warroom..."
  launchctl bootout "gui/$(id -u)" "$DST_PLIST" 2>/dev/null || true
fi

if [[ -f "$DST_PLIST" ]]; then
  rm "$DST_PLIST"
  echo "✅ removed $DST_PLIST"
else
  echo "ℹ️  $DST_PLIST not found (already uninstalled)"
fi

echo ""
echo "The warroom/ source and warroom/.venv/ are preserved."
echo "To remove them: rm -rf $PWD/warroom/.venv"
