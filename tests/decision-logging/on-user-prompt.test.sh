#!/usr/bin/env bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
HANDLER="$REPO_ROOT/skills/decision-logging/scripts/on-user-prompt.sh"
FAIL=0

# Test 1: non-approval prompt → no MADR
TMP_REPO=$(mktemp -d)
(cd "$TMP_REPO" && git init -q && git config user.email t@t && git config user.name t)

echo '{"prompt":"what about edge case X","session_id":"s1"}' \
  | (cd "$TMP_REPO" && CLAUDE_PLUGIN_ROOT="$REPO_ROOT" bash "$HANDLER")

if [ -d "$TMP_REPO/docs/snowball/decisions" ] && [ -n "$(ls "$TMP_REPO/docs/snowball/decisions" 2>/dev/null)" ]; then
  echo "[FAIL] non-approval prompt should not write MADR"
  FAIL=1
else
  echo "[PASS] non-approval prompt no-ops"
fi

# Test 2: approval prompt → writes MADR
echo '{"prompt":"lgtm","session_id":"s1"}' \
  | (cd "$TMP_REPO" && CLAUDE_PLUGIN_ROOT="$REPO_ROOT" bash "$HANDLER")

count=$(ls "$TMP_REPO/docs/snowball/decisions"/*.md 2>/dev/null | wc -l | tr -d ' ')
if [ "$count" -ne 1 ]; then
  echo "[FAIL] approval prompt should write 1 MADR, got $count"
  FAIL=1
else
  MADR_FILE=$(ls "$TMP_REPO/docs/snowball/decisions"/*.md)
  if grep -q 'capture_mechanism: user-prompt-pattern' "$MADR_FILE"; then
    echo "[PASS] approval prompt writes MADR with capture_mechanism=user-prompt-pattern"
  else
    echo "[FAIL] capture_mechanism wrong:"
    cat "$MADR_FILE" | sed 's/^/    /'
    FAIL=1
  fi
fi

# Test 3: approval right after ask-user-question MADR → dedupes
NOW_ISO=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EXISTING="$TMP_REPO/docs/snowball/decisions/$(date -u +%Y-%m-%dT%H%M)-existing-aq.md"
cat >"$EXISTING" <<EOF
---
title: existing
status: accepted
date: $NOW_ISO
deciders: [t]
snowball:
  schema_version: "1.0"
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: s1
  source_event_id: e1
  supersedes: null
  tags: [ambient]
---

# existing
EOF

before=$(ls "$TMP_REPO/docs/snowball/decisions"/*.md | wc -l | tr -d ' ')
echo '{"prompt":"ship it","session_id":"s1"}' \
  | (cd "$TMP_REPO" && CLAUDE_PLUGIN_ROOT="$REPO_ROOT" bash "$HANDLER")
after=$(ls "$TMP_REPO/docs/snowball/decisions"/*.md | wc -l | tr -d ' ')

if [ "$after" -eq "$before" ]; then
  echo "[PASS] dedup suppresses MADR after recent ask-user-question"
else
  echo "[FAIL] dedup failed: before=$before after=$after"
  FAIL=1
fi

rm -rf "$TMP_REPO"
exit $FAIL
