#!/usr/bin/env bash
# PostToolUse hook for AskUserQuestion: writes one MADR per question-answer pair.
set -uo pipefail

# No-op outside a git repo
git rev-parse --show-toplevel >/dev/null 2>&1 || exit 0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRIDGE="$SCRIPT_DIR/ask-user-question-bridge.cjs"

# Bridge always exits 0 (errors logged internally); pass stdin through unchanged
node "$BRIDGE" || true
exit 0
