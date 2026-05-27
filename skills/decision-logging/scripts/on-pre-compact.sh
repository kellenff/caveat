#!/usr/bin/env bash
# PreCompact hook: forks the extraction worker as a detached subprocess and returns immediately.
set -uo pipefail

GIT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKER="$SCRIPT_DIR/extract-worker.sh"
LOG_DIR="$HOME/.snowball"
mkdir -p "$LOG_DIR"

PAYLOAD=$(cat)
SESSION_ID=$(printf '%s' "$PAYLOAD" | node -e '
let s = "";
process.stdin.on("data", (c) => s += c);
process.stdin.on("end", () => {
  try { process.stdout.write((JSON.parse(s).session_id || "").toString()); }
  catch { process.exit(0); }
});
')

if [ -z "$SESSION_ID" ]; then
  exit 0
fi

nohup bash "$WORKER" "$SESSION_ID" "$GIT_ROOT" >>"$LOG_DIR/decision-logging.log" 2>&1 &
disown

exit 0
