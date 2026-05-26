#!/usr/bin/env bash
# UserPromptSubmit hook: pattern-matches approval phrases; writes MADR if no recent dedup.
set -uo pipefail

git rev-parse --show-toplevel >/dev/null 2>&1 || exit 0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRIDGE="$SCRIPT_DIR/user-prompt-bridge.cjs"

node "$BRIDGE" || true
exit 0
