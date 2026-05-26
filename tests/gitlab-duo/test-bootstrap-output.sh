#!/usr/bin/env bash
# Test: GitLab Duo CLI bootstrap output shape
# Verifies hooks/session-start emits the JSON shape Duo CLI expects when DUO_SESSION_ID is set,
# and that the other harness branches still emit their own keys.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BOOTSTRAP="$REPO_ROOT/hooks/session-start"

if [ ! -x "$BOOTSTRAP" ] && [ ! -r "$BOOTSTRAP" ]; then
    echo "FAIL: $BOOTSTRAP not found"
    exit 1
fi

run_bootstrap() {
    env -i HOME="$HOME" PATH="$PATH" "$@" bash "$BOOTSTRAP"
}

assert_json_path() {
    local label="$1" json="$2" path="$3" expected_substring="$4"
    local actual
    actual=$(printf '%s' "$json" | python3 -c "
import json, sys
d = json.load(sys.stdin)
for part in '''$path'''.split('.'):
    d = d[part]
print(d)
")
    case "$actual" in
        *"$expected_substring"*)
            echo "  [PASS] $label"
            ;;
        *)
            echo "  [FAIL] $label"
            echo "    expected substring: $expected_substring"
            echo "    actual (truncated): ${actual:0:200}"
            exit 1
            ;;
    esac
}

echo "=== Test: GitLab Duo CLI bootstrap output shape ==="

echo "Test 1: DUO_SESSION_ID → hookSpecificOutput.additionalContext..."
out=$(run_bootstrap DUO_SESSION_ID=test-session-id)
assert_json_path "hookEventName is SessionStart" "$out" "hookSpecificOutput.hookEventName" "SessionStart"
assert_json_path "additionalContext contains EXTREMELY_IMPORTANT" "$out" "hookSpecificOutput.additionalContext" "EXTREMELY_IMPORTANT"

echo "Test 2: CURSOR_PLUGIN_ROOT still emits additional_context (regression)..."
out=$(run_bootstrap CURSOR_PLUGIN_ROOT=/tmp)
assert_json_path "additional_context populated" "$out" "additional_context" "EXTREMELY_IMPORTANT"

echo "Test 3: CLAUDE_PLUGIN_ROOT still emits hookSpecificOutput.additionalContext (regression)..."
out=$(run_bootstrap CLAUDE_PLUGIN_ROOT=/tmp)
assert_json_path "Claude additionalContext populated" "$out" "hookSpecificOutput.additionalContext" "EXTREMELY_IMPORTANT"

echo "Test 4: No env vars → top-level additionalContext (SDK default / Copilot CLI)..."
out=$(run_bootstrap)
assert_json_path "SDK additionalContext populated" "$out" "additionalContext" "EXTREMELY_IMPORTANT"

echo ""
echo "=== All GitLab Duo bootstrap tests passed ==="
