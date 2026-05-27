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

CHECKPOINT_DIR="$HOME/.snowball/checkpoints"
mkdir -p "$CHECKPOINT_DIR"
CURSOR="$CHECKPOINT_DIR/${SESSION_ID}.cursor"

# Encode project path the way Claude Code stores transcripts: leading dash, then '/' → '-'
ENCODED="-$(echo "$GIT_ROOT" | sed 's|^/||; s|/|-|g')"
TRANSCRIPT="$HOME/.claude/projects/$ENCODED/$SESSION_ID.jsonl"

if [ ! -f "$TRANSCRIPT" ]; then
  echo "[$(date)] transcript not found: $TRANSCRIPT" >>"$ERROR_LOG"
  exit 0
fi

PROCESSED=$(cat "$CURSOR" 2>/dev/null || echo 0)
TOTAL=$(wc -l <"$TRANSCRIPT" | tr -d ' ')

if [ "$TOTAL" -le "$PROCESSED" ]; then
  exit 0
fi

CLAUDE_BIN="${SNOWBALL_CLAUDE_BIN:-claude}"

# Slice transcript to unprocessed tail and pipe to headless claude
SYSTEM_PROMPT=$(cat "$PROMPT_FILE")
EXTRACTION=$(tail -n +$((PROCESSED + 1)) "$TRANSCRIPT" | "$CLAUDE_BIN" -p \
  --append-system-prompt "$SYSTEM_PROMPT" \
  --output-format text 2>>"$ERROR_LOG") || {
  echo "[$(date)] claude -p failed for session $SESSION_ID" >>"$ERROR_LOG"
  exit 0
}

# Pipe extracted JSONL to the appender (it skips invalid lines internally)
echo "$EXTRACTION" | (cd "$GIT_ROOT" && node "$APPENDER") 2>>"$ERROR_LOG"

# Atomic cursor update: write to tmp, then rename
echo "$TOTAL" >"${CURSOR}.tmp" && mv "${CURSOR}.tmp" "$CURSOR"
