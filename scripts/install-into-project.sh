#!/usr/bin/env bash
#
# install-into-project.sh — Install Snowball's GitLab Duo integration
# into a local project. Auto-detects the Snowball clone location from
# this script's own path, so Snowball can live anywhere (not just
# ~/Projects/snowball).
#
# Default target is the current working directory; pass a path as the
# first positional argument to override.
#
# Usage:
#   install-into-project.sh [options] [target-dir]
#
#   --force        Overwrite existing files / symlinks
#   --uninstall    Remove Snowball symlinks and generated hooks.json
#   --no-skills    Skip the skills/ symlink (AGENTS.md + hooks.json only)
#   -h, --help     Show this help
#
set -euo pipefail

# --- resolve script and snowball paths (follow symlinks) ---

resolve_script_dir() {
    local src="${BASH_SOURCE[0]}"
    while [ -L "$src" ]; do
        local dir
        dir="$(cd -P "$(dirname "$src")" && pwd)"
        src="$(readlink "$src")"
        [[ "$src" != /* ]] && src="$dir/$src"
    done
    cd -P "$(dirname "$src")" && pwd
}

SCRIPT_DIR="$(resolve_script_dir)"
SNOWBALL_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# --- args ---

force=0
uninstall=0
install_skills=1
target=""

usage() {
    sed -n '3,20p' "$0" | sed 's/^# \{0,1\}//'
}

while [ $# -gt 0 ]; do
    case "$1" in
        --force)      force=1 ;;
        --uninstall)  uninstall=1 ;;
        --no-skills)  install_skills=0 ;;
        -h|--help)    usage; exit 0 ;;
        --)           shift; target="${1:-}"; break ;;
        -*)           echo "error: unknown option: $1" >&2; usage >&2; exit 2 ;;
        *)            target="$1" ;;
    esac
    shift
done

target="${target:-$PWD}"

if [ ! -d "$target" ]; then
    echo "error: target directory does not exist: $target" >&2
    exit 1
fi

target="$(cd "$target" && pwd)"

if [ "$target" = "$SNOWBALL_ROOT" ]; then
    echo "error: target is the Snowball clone itself; nothing to do" >&2
    echo "(open Duo directly in $SNOWBALL_ROOT — files are already in place)" >&2
    exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
    echo "error: python3 is required (used for AGENTS.md and hooks.json merging)" >&2
    exit 1
fi

# Sentinel markers identifying the Snowball-managed block inside a user-owned
# AGENTS.md. HTML comments are valid markdown and render as nothing.
AGENTS_MARKER_BEGIN="<!-- snowball:agents:begin (managed block; do not edit between markers) -->"
AGENTS_MARKER_END="<!-- snowball:agents:end -->"

# --- helpers ---

is_snowball_symlink() {
    local path="$1" expected="$2"
    [ -L "$path" ] || return 1
    local resolved
    resolved="$(readlink "$path")"
    case "$resolved" in
        "$expected"|"$expected/") return 0 ;;
        *) return 1 ;;
    esac
}

# Merge the Snowball block into an existing AGENTS.md (or create as symlink
# if the target doesn't exist). Idempotent.
agents_install() {
    local src="$SNOWBALL_ROOT/AGENTS.md"
    local dst="$target/AGENTS.md"

    if [ ! -e "$dst" ] && [ ! -L "$dst" ]; then
        ln -s "$src" "$dst"
        echo "  linked AGENTS.md → $src"
        return 0
    fi

    if [ -L "$dst" ]; then
        if is_snowball_symlink "$dst" "$src"; then
            echo "  AGENTS.md already linked"
            return 0
        fi
        if [ "$force" -eq 1 ]; then
            rm -f "$dst"
            ln -s "$src" "$dst"
            echo "  replaced (--force) AGENTS.md symlink with Snowball symlink"
            return 0
        fi
        echo "error: $dst is a symlink to something other than Snowball" >&2
        echo "       re-run with --force to replace, or convert it to a regular file first" >&2
        return 1
    fi

    # Regular file with user content.
    if [ "$force" -eq 1 ]; then
        rm -f "$dst"
        ln -s "$src" "$dst"
        echo "  replaced (--force) AGENTS.md with Snowball symlink"
        return 0
    fi

    # Default: merge a marked block in place.
    SNOWBALL_AGENTS_DST="$dst" \
    SNOWBALL_AGENTS_SRC="$src" \
    SNOWBALL_MARKER_BEGIN="$AGENTS_MARKER_BEGIN" \
    SNOWBALL_MARKER_END="$AGENTS_MARKER_END" \
    python3 - <<'PY'
import os, re
dst = os.environ['SNOWBALL_AGENTS_DST']
src = os.environ['SNOWBALL_AGENTS_SRC']
mb  = os.environ['SNOWBALL_MARKER_BEGIN']
me  = os.environ['SNOWBALL_MARKER_END']

with open(dst, 'r', encoding='utf-8') as f:
    content = f.read()
with open(src, 'r', encoding='utf-8') as f:
    snowball = f.read().rstrip() + '\n'

block = f"{mb}\n\n{snowball}\n{me}"
pattern = re.compile(re.escape(mb) + r'.*?' + re.escape(me), re.DOTALL)

if pattern.search(content):
    new_content = pattern.sub(block, content)
    action = "updated"
else:
    sep = '' if content.endswith('\n\n') else ('\n' if content.endswith('\n') else '\n\n')
    new_content = content + sep + block + '\n'
    action = "appended"

if new_content == content:
    print("  AGENTS.md Snowball block already up to date")
else:
    with open(dst, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print(f"  {action} Snowball block in existing AGENTS.md (user content preserved)")
PY
}

# Inverse of agents_install: remove the marked block, or remove the symlink.
agents_uninstall() {
    local src="$SNOWBALL_ROOT/AGENTS.md"
    local dst="$target/AGENTS.md"

    if [ ! -e "$dst" ] && [ ! -L "$dst" ]; then
        return 0
    fi

    if [ -L "$dst" ]; then
        if is_snowball_symlink "$dst" "$src"; then
            rm -f "$dst"
            echo "  removed AGENTS.md symlink"
            return 0
        fi
        if [ "$force" -eq 1 ]; then
            rm -f "$dst"
            echo "  removed (--force) AGENTS.md symlink (target was not Snowball)"
            return 0
        fi
        echo "  preserving AGENTS.md (symlink to non-Snowball target): $dst"
        return 0
    fi

    if grep -qF "$AGENTS_MARKER_BEGIN" "$dst" 2>/dev/null; then
        SNOWBALL_AGENTS_DST="$dst" \
        SNOWBALL_MARKER_BEGIN="$AGENTS_MARKER_BEGIN" \
        SNOWBALL_MARKER_END="$AGENTS_MARKER_END" \
        python3 - <<'PY'
import os, re
dst = os.environ['SNOWBALL_AGENTS_DST']
mb  = os.environ['SNOWBALL_MARKER_BEGIN']
me  = os.environ['SNOWBALL_MARKER_END']

with open(dst, 'r', encoding='utf-8') as f:
    content = f.read()

# Strip the marked block plus any surrounding blank lines so the file
# isn't left with a hole.
pattern = re.compile(r'\n*' + re.escape(mb) + r'.*?' + re.escape(me) + r'\n*', re.DOTALL)
new_content = pattern.sub('\n\n', content).strip('\n')

if new_content:
    with open(dst, 'w', encoding='utf-8') as f:
        f.write(new_content + '\n')
    print("  removed Snowball block from AGENTS.md (user content preserved)")
else:
    os.remove(dst)
    print("  removed AGENTS.md (file was Snowball-only after block removal)")
PY
        return 0
    fi

    if [ "$force" -eq 1 ]; then
        rm -f "$dst"
        echo "  removed (--force) AGENTS.md (no Snowball marker found)"
    else
        echo "  preserving AGENTS.md (no Snowball marker; not Snowball-owned): $dst"
    fi
}

# Merge our SessionStart entry into the project's .gitlab/duo/hooks.json.
# Creates the file if missing; preserves any existing user hooks.
hooks_install() {
    local hooks_dir="$target/.gitlab/duo"
    local dst="$hooks_dir/hooks.json"
    mkdir -p "$hooks_dir"

    SNOWBALL_HOOKS_DST="$dst" \
    SNOWBALL_ROOT="$SNOWBALL_ROOT" \
    python3 - <<'PY'
import json, os, sys
dst = os.environ['SNOWBALL_HOOKS_DST']
snowball = os.environ['SNOWBALL_ROOT']
command = f'"{snowball}/hooks/run-hook.cmd" session-start'

if os.path.exists(dst):
    with open(dst, 'r', encoding='utf-8') as f:
        try:
            data = json.load(f)
        except json.JSONDecodeError as e:
            print(f"error: {dst} is not valid JSON: {e}", file=sys.stderr)
            sys.exit(1)
    pre_existing = True
else:
    data = {}
    pre_existing = False

hooks_root = data.setdefault('hooks', {})
session_start = hooks_root.setdefault('SessionStart', [])

# Already-installed detection: any entry whose hooks include our exact command.
for matcher_entry in session_start:
    for h in matcher_entry.get('hooks', []):
        if h.get('command') == command:
            print(f"  hooks.json: Snowball SessionStart entry already present (no change)")
            sys.exit(0)

new_entry = {
    "matcher": "startup|resume|clear",
    "hooks": [
        {"type": "command", "command": command}
    ]
}
session_start.append(new_entry)

with open(dst, 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2)
    f.write('\n')

if pre_existing:
    print(f"  merged Snowball SessionStart entry into existing hooks.json (other hooks preserved)")
else:
    print(f"  wrote .gitlab/duo/hooks.json (bootstrap path: {snowball}/hooks/run-hook.cmd)")
PY
}

# Inverse: filter Snowball's SessionStart entry out of hooks.json. Preserves
# any other entries and any other event types.
hooks_uninstall() {
    local dst="$target/.gitlab/duo/hooks.json"
    [ -f "$dst" ] || return 0

    SNOWBALL_HOOKS_DST="$dst" \
    SNOWBALL_ROOT="$SNOWBALL_ROOT" \
    python3 - <<'PY'
import json, os, sys
dst = os.environ['SNOWBALL_HOOKS_DST']
snowball = os.environ['SNOWBALL_ROOT']
command = f'"{snowball}/hooks/run-hook.cmd" session-start'

with open(dst, 'r', encoding='utf-8') as f:
    try:
        data = json.load(f)
    except json.JSONDecodeError:
        print(f"  preserving hooks.json (not valid JSON; not modifying): {dst}")
        sys.exit(0)

removed = 0
session_start = data.get('hooks', {}).get('SessionStart', [])
new_session_start = []
for entry in session_start:
    kept_hooks = [h for h in entry.get('hooks', []) if h.get('command') != command]
    if not kept_hooks:
        # Whole entry was Snowball's
        removed += 1
        continue
    if len(kept_hooks) != len(entry.get('hooks', [])):
        removed += 1
    entry['hooks'] = kept_hooks
    new_session_start.append(entry)

if removed == 0:
    print("  hooks.json: no Snowball entry found (nothing to remove)")
    sys.exit(0)

if new_session_start:
    data['hooks']['SessionStart'] = new_session_start
else:
    del data['hooks']['SessionStart']
    if not data.get('hooks'):
        data.pop('hooks', None)

if data:
    with open(dst, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)
        f.write('\n')
    print(f"  removed Snowball entry from hooks.json ({removed}); other hooks preserved")
else:
    os.remove(dst)
    print(f"  removed hooks.json (only Snowball entry was present)")
PY
}

remove_with_confirmation() {
    local path="$1" kind="$2" expected_target="$3"
    if is_snowball_symlink "$path" "$expected_target"; then
        rm -f "$path"
        echo "  removed $kind symlink: $path"
    elif [ -e "$path" ] || [ -L "$path" ]; then
        if [ "$force" -eq 1 ]; then
            rm -rf "$path"
            echo "  removed (--force) $kind: $path"
        else
            echo "  refusing to remove $kind (not a Snowball symlink): $path" >&2
            return 1
        fi
    fi
}

# --- uninstall path ---

if [ "$uninstall" -eq 1 ]; then
    echo "Uninstalling Snowball from $target"
    rc=0
    agents_uninstall || rc=1

    # skills/: handle both the legacy whole-directory symlink and the per-skill model.
    if [ -L "$target/skills" ]; then
        if is_snowball_symlink "$target/skills" "$SNOWBALL_ROOT/skills"; then
            rm -f "$target/skills"
            echo "  removed skills/ symlink (legacy whole-directory install)"
        elif [ "$force" -eq 1 ]; then
            rm -f "$target/skills"
            echo "  removed (--force) skills/ symlink: $target/skills"
        else
            echo "  refusing to remove skills/ symlink (not a Snowball symlink): $target/skills" >&2
            rc=1
        fi
    elif [ -d "$target/skills" ]; then
        removed_skills=0
        for entry in "$target"/skills/*; do
            [ -e "$entry" ] || [ -L "$entry" ] || continue
            name="$(basename "$entry")"
            if [ -L "$entry" ] && is_snowball_symlink "$entry" "$SNOWBALL_ROOT/skills/$name"; then
                rm -f "$entry"
                removed_skills=$((removed_skills + 1))
            fi
        done
        if [ "$removed_skills" -gt 0 ]; then
            echo "  removed $removed_skills Snowball skill symlink(s) from skills/"
        fi
        if rmdir "$target/skills" 2>/dev/null; then
            echo "  removed empty skills/"
        else
            echo "  preserved skills/ (contains project-defined entries)"
        fi
    fi

    hooks_uninstall || rc=1

    # Remove empty .gitlab/duo and .gitlab dirs if we own them
    if rmdir "$target/.gitlab/duo" 2>/dev/null; then echo "  removed empty .gitlab/duo/"; fi
    if rmdir "$target/.gitlab" 2>/dev/null; then echo "  removed empty .gitlab/"; fi

    exit $rc
fi

# --- install path ---

echo "Installing Snowball into $target"
echo "Snowball clone: $SNOWBALL_ROOT"

agents_install || exit 1

if [ "$install_skills" -eq 1 ]; then
    # Per-skill symlinks under <target>/skills/. Project-defined skill directories
    # (anything that isn't a Snowball symlink) are preserved — they represent
    # intentional local overrides and take priority over Snowball's defaults.

    # Migrate legacy whole-directory symlink, if present.
    if [ -L "$target/skills" ]; then
        if is_snowball_symlink "$target/skills" "$SNOWBALL_ROOT/skills"; then
            rm -f "$target/skills"
            echo "  migrated legacy whole-directory skills symlink to per-skill model"
        elif [ "$force" -eq 1 ]; then
            rm -f "$target/skills"
            echo "  removed (--force) existing skills/ symlink"
        else
            echo "error: $target/skills is a symlink to something other than Snowball" >&2
            echo "       re-run with --force to overwrite, or remove the link first" >&2
            exit 1
        fi
    fi

    mkdir -p "$target/skills"

    linked=0
    already=0
    preserved=0
    for src_skill in "$SNOWBALL_ROOT"/skills/*/; do
        [ -d "$src_skill" ] || continue
        name="$(basename "$src_skill")"
        src="$SNOWBALL_ROOT/skills/$name"
        dst="$target/skills/$name"

        if [ -L "$dst" ] && is_snowball_symlink "$dst" "$src"; then
            already=$((already + 1))
            continue
        fi

        if [ -e "$dst" ] || [ -L "$dst" ]; then
            if [ "$force" -eq 1 ]; then
                rm -rf "$dst"
                ln -s "$src" "$dst"
                linked=$((linked + 1))
            else
                preserved=$((preserved + 1))
            fi
            continue
        fi

        ln -s "$src" "$dst"
        linked=$((linked + 1))
    done

    echo "  skills: $linked linked, $already already in place, $preserved project-defined (kept)"
else
    echo "  --no-skills: skipping skills/ symlinks (Duo Agent Skills won't be discoverable)"
fi

hooks_install || exit 1

cat <<EOF

Done. Verify with:

  cd "$target"
  ls -la AGENTS.md skills .gitlab/duo/hooks.json

For Duo CLI users, launch with project hooks enabled:

  glab duo cli --enable-project-hooks

To remove later: $0 --uninstall "$target"
EOF
