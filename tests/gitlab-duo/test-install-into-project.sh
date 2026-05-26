#!/usr/bin/env bash
# Test: install-into-project.sh
# Verifies the install script symlinks AGENTS.md and skills/, generates a
# hooks.json with the absolute Snowball path, and that the generated hooks.json
# command produces valid Duo-shaped JSON when invoked with DUO_SESSION_ID set.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
INSTALLER="$REPO_ROOT/scripts/install-into-project.sh"

if [ ! -x "$INSTALLER" ]; then
    echo "FAIL: $INSTALLER not executable"
    exit 1
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "=== Test: install-into-project.sh ==="
echo "Target: $tmp"
echo "Snowball: $REPO_ROOT"

echo
echo "Test 1: install into an empty project..."
"$INSTALLER" "$tmp" >/dev/null
[ -L "$tmp/AGENTS.md" ] || { echo "  [FAIL] AGENTS.md not a symlink"; exit 1; }
[ "$(readlink "$tmp/AGENTS.md")" = "$REPO_ROOT/AGENTS.md" ] || { echo "  [FAIL] AGENTS.md symlink target wrong"; exit 1; }
[ -d "$tmp/skills" ] || { echo "  [FAIL] skills/ not a directory"; exit 1; }
[ -L "$tmp/skills" ] && { echo "  [FAIL] skills/ should be a directory, not a symlink"; exit 1; }
[ -L "$tmp/skills/using-snowball" ] || { echo "  [FAIL] using-snowball skill not symlinked"; exit 1; }
[ "$(readlink "$tmp/skills/using-snowball")" = "$REPO_ROOT/skills/using-snowball" ] || { echo "  [FAIL] using-snowball symlink target wrong"; exit 1; }
# Every snowball skill should be linked
for src in "$REPO_ROOT"/skills/*/; do
    name="$(basename "$src")"
    [ -L "$tmp/skills/$name" ] || { echo "  [FAIL] missing per-skill symlink: $name"; exit 1; }
done
[ -f "$tmp/.gitlab/duo/hooks.json" ] || { echo "  [FAIL] hooks.json missing"; exit 1; }
grep -q "$REPO_ROOT/hooks/run-hook.cmd" "$tmp/.gitlab/duo/hooks.json" || { echo "  [FAIL] hooks.json missing absolute path"; exit 1; }
echo "  [PASS] AGENTS.md, per-skill symlinks, and hooks.json all created"

echo
echo "Test 2: generated hooks.json command emits Duo-shaped JSON..."
cmd=$(python3 -c "import json; print(json.load(open('$tmp/.gitlab/duo/hooks.json'))['hooks']['SessionStart'][0]['hooks'][0]['command'])")
out=$(DUO_SESSION_ID=test bash -c "$cmd")
echo "$out" | python3 -c "
import json, sys
d = json.load(sys.stdin)
assert 'hookSpecificOutput' in d, 'missing hookSpecificOutput'
assert d['hookSpecificOutput']['hookEventName'] == 'SessionStart', 'wrong hookEventName'
assert 'EXTREMELY_IMPORTANT' in d['hookSpecificOutput']['additionalContext'], 'framing missing'
"
echo "  [PASS] bootstrap fires through generated path"

echo
echo "Test 3: re-running is idempotent..."
"$INSTALLER" "$tmp" >/dev/null
[ "$(readlink "$tmp/AGENTS.md")" = "$REPO_ROOT/AGENTS.md" ] || { echo "  [FAIL] AGENTS.md changed"; exit 1; }
echo "  [PASS] re-run leaves things in place"

echo
echo "Test 4: refuse to overwrite non-symlink without --force..."
rm "$tmp/AGENTS.md"
echo "user content" > "$tmp/AGENTS.md"
if "$INSTALLER" "$tmp" >/dev/null 2>&1; then
    echo "  [FAIL] should have refused"; exit 1
fi
[ "$(cat "$tmp/AGENTS.md")" = "user content" ] || { echo "  [FAIL] user file was clobbered"; exit 1; }
echo "  [PASS] refused and left user file alone"

echo
echo "Test 5: --force overwrites..."
"$INSTALLER" --force "$tmp" >/dev/null
[ -L "$tmp/AGENTS.md" ] || { echo "  [FAIL] AGENTS.md not relinked"; exit 1; }
echo "  [PASS] --force replaced user file with symlink"

echo
echo "Test 6: --uninstall removes only snowball-owned artifacts..."
"$INSTALLER" --uninstall "$tmp" >/dev/null
[ ! -e "$tmp/AGENTS.md" ] || { echo "  [FAIL] AGENTS.md still present"; exit 1; }
[ ! -e "$tmp/skills" ] || { echo "  [FAIL] skills still present"; exit 1; }
[ ! -e "$tmp/.gitlab/duo/hooks.json" ] || { echo "  [FAIL] hooks.json still present"; exit 1; }
[ ! -e "$tmp/.gitlab" ] || { echo "  [FAIL] empty .gitlab dir not cleaned up"; exit 1; }
echo "  [PASS] uninstall removed all snowball artifacts"

echo
echo "Test 7: refuse to install into snowball root..."
if "$INSTALLER" "$REPO_ROOT" >/dev/null 2>&1; then
    echo "  [FAIL] should have refused"; exit 1
fi
echo "  [PASS] refused to install into snowball itself"

echo
echo "Test 8: --no-skills skips the skills symlinks..."
"$INSTALLER" --no-skills "$tmp" >/dev/null
[ -L "$tmp/AGENTS.md" ] || { echo "  [FAIL] AGENTS.md missing"; exit 1; }
[ ! -e "$tmp/skills" ] || { echo "  [FAIL] skills was created"; exit 1; }
[ -f "$tmp/.gitlab/duo/hooks.json" ] || { echo "  [FAIL] hooks.json missing"; exit 1; }
"$INSTALLER" --uninstall "$tmp" >/dev/null
echo "  [PASS] --no-skills skipped skills/ but installed the rest"

echo
echo "Test 10: project-defined skills coexist with Snowball skills..."
# Pre-create a project-defined skill before install
mkdir -p "$tmp/skills/my-project-skill"
cat >"$tmp/skills/my-project-skill/SKILL.md" <<'EOF'
---
name: my-project-skill
description: Project-defined skill that should survive install/uninstall
---
EOF
# Also pre-create a same-named override for a snowball skill
mkdir -p "$tmp/skills/brainstorming"
echo "project override" >"$tmp/skills/brainstorming/SKILL.md"

"$INSTALLER" "$tmp" >/dev/null

# Project-defined skill should be untouched (still a real dir with original content)
[ -d "$tmp/skills/my-project-skill" ] || { echo "  [FAIL] project skill removed"; exit 1; }
[ -L "$tmp/skills/my-project-skill" ] && { echo "  [FAIL] project skill replaced with symlink"; exit 1; }
grep -q "Project-defined skill" "$tmp/skills/my-project-skill/SKILL.md" || { echo "  [FAIL] project skill content changed"; exit 1; }

# Same-named override should also be preserved (project wins)
[ -L "$tmp/skills/brainstorming" ] && { echo "  [FAIL] project's brainstorming override was replaced by symlink"; exit 1; }
[ "$(cat "$tmp/skills/brainstorming/SKILL.md")" = "project override" ] || { echo "  [FAIL] project's brainstorming override changed"; exit 1; }

# Other snowball skills should still be linked
[ -L "$tmp/skills/using-snowball" ] || { echo "  [FAIL] non-conflicting snowball skill not linked"; exit 1; }

echo "  [PASS] per-skill install preserves project content and links the rest"

echo
echo "Test 11: uninstall removes only Snowball symlinks, preserves project skills..."
"$INSTALLER" --uninstall "$tmp" >/dev/null
[ -d "$tmp/skills/my-project-skill" ] || { echo "  [FAIL] uninstall removed project skill"; exit 1; }
[ -d "$tmp/skills/brainstorming" ] || { echo "  [FAIL] uninstall removed project override"; exit 1; }
[ ! -L "$tmp/skills/using-snowball" ] || { echo "  [FAIL] uninstall left a snowball symlink in place"; exit 1; }
[ ! -e "$tmp/AGENTS.md" ] || { echo "  [FAIL] AGENTS.md not removed"; exit 1; }
[ -d "$tmp/skills" ] || { echo "  [FAIL] skills/ removed even though it still has project content"; exit 1; }
echo "  [PASS] uninstall preserved project skills and skills/ dir"

# Clean up project content so subsequent tests start fresh
rm -rf "$tmp/skills"

echo
echo "Test 12: migrates legacy whole-directory skills symlink..."
# Simulate the previous install model
ln -s "$REPO_ROOT/skills" "$tmp/skills"
[ -L "$tmp/skills" ] || { echo "  [FAIL] precondition: skills not a symlink"; exit 1; }
"$INSTALLER" "$tmp" >/dev/null
[ -L "$tmp/skills" ] && { echo "  [FAIL] still a whole-dir symlink after migration"; exit 1; }
[ -d "$tmp/skills" ] || { echo "  [FAIL] skills/ not a dir after migration"; exit 1; }
[ -L "$tmp/skills/using-snowball" ] || { echo "  [FAIL] per-skill symlinks missing after migration"; exit 1; }
echo "  [PASS] legacy whole-directory symlink auto-migrated to per-skill model"

"$INSTALLER" --uninstall "$tmp" >/dev/null

echo
echo "Test 13: uninstall handles legacy whole-dir symlink directly..."
ln -s "$REPO_ROOT/skills" "$tmp/skills"
"$INSTALLER" --uninstall "$tmp" >/dev/null 2>&1 || true
[ ! -e "$tmp/skills" ] || { echo "  [FAIL] legacy symlink not removed"; exit 1; }
echo "  [PASS] legacy whole-dir symlink removed by --uninstall"

echo
echo "Test 9: CWD detection (no arg = \$PWD)..."
(cd "$tmp" && "$INSTALLER" >/dev/null)
[ -L "$tmp/AGENTS.md" ] || { echo "  [FAIL] AGENTS.md not installed in PWD"; exit 1; }
echo "  [PASS] script auto-detects target from PWD"

echo
echo "=== All install-into-project.sh tests passed ==="
