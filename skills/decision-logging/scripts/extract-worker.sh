#!/usr/bin/env bash
# Detached background worker: reads transcript, calls claude -p, appends observations.
set -uo pipefail

SESSION_ID="$1"
GIT_ROOT="$2"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROMPT_FILE="$SCRIPT_DIR/extract-observations.md"
APPENDER="$SCRIPT_DIR/append-observation.cjs"
ERROR_LOG="$HOME/.snowball/decision-logging-errors.log"
mkdir -p "$(dirname "$ERROR_LOG")"

# Encode project path the way Claude Code stores transcripts: leading dash, then '/' → '-'
ENCODED="-$(echo "$GIT_ROOT" | sed 's|^/||; s|/|-|g')"
TRANSCRIPT="$HOME/.claude/projects/$ENCODED/$SESSION_ID.jsonl"

if [ ! -f "$TRANSCRIPT" ]; then
  echo "[$(date)] transcript not found: $TRANSCRIPT" >> "$ERROR_LOG"
  exit 0
fi

# Invoke headless claude with the extraction prompt; pipe transcript on stdin
SYSTEM_PROMPT=$(cat "$PROMPT_FILE")
EXTRACTION=$(claude -p \
  --append-system-prompt "$SYSTEM_PROMPT" \
  --output-format text \
  < "$TRANSCRIPT" 2>>"$ERROR_LOG") || {
    echo "[$(date)] claude -p failed for session $SESSION_ID" >> "$ERROR_LOG"
    exit 0
  }

# Pipe extracted JSONL to the appender (it skips invalid lines internally)
echo "$EXTRACTION" | ( cd "$GIT_ROOT" && node "$APPENDER" ) 2>>"$ERROR_LOG"
