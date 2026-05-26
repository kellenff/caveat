#!/usr/bin/env bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
HANDLER="$REPO_ROOT/skills/decision-logging/scripts/on-stop.sh"
FAIL=0

# Test 1: on-stop returns within 2 seconds (detached fork)
TMP_REPO=$(mktemp -d)
( cd "$TMP_REPO" && git init -q && git config user.email t@t && git config user.name t )

START=$(date +%s)
echo '{"session_id":"nonexistent-session"}' | \
  ( cd "$TMP_REPO" && CLAUDE_PLUGIN_ROOT="$REPO_ROOT" bash "$HANDLER" )
END=$(date +%s)
ELAPSED=$((END - START))

if [ "$ELAPSED" -le 2 ]; then
  echo "[PASS] on-stop returns quickly ($ELAPSED s)"
else
  echo "[FAIL] on-stop blocked too long ($ELAPSED s)"
  FAIL=1
fi

# Test 2: on-stop no-ops outside git repo
TMP_NONGIT=$(mktemp -d)
echo '{"session_id":"x"}' | \
  ( cd "$TMP_NONGIT" && CLAUDE_PLUGIN_ROOT="$REPO_ROOT" bash "$HANDLER" )
status=$?
if [ "$status" -eq 0 ]; then
  echo "[PASS] on-stop no-ops outside git repo"
else
  echo "[FAIL] on-stop exit $status outside git repo"
  FAIL=1
fi

# Test 3: on-stop no-ops on missing session_id
echo '{}' | ( cd "$TMP_REPO" && CLAUDE_PLUGIN_ROOT="$REPO_ROOT" bash "$HANDLER" )
status=$?
if [ "$status" -eq 0 ]; then
  echo "[PASS] on-stop no-ops with missing session_id"
else
  echo "[FAIL] on-stop exit $status with missing session_id"
  FAIL=1
fi

rm -rf "$TMP_REPO" "$TMP_NONGIT"
exit $FAIL
