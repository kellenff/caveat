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
#   --uninstall    Remove Snowball artifacts (copies + generated hooks.json)
#   --no-skills    Skip the skills/ install (AGENTS.md + hooks.json only)
#   -h, --help     Show this help
#
# Duo does not follow symlinks when discovering AGENTS.md, skill
# directories, or hook scripts, so this installer writes real files:
# AGENTS.md is copied (with a marker block delimiting Snowball's
# managed content), each skill directory is copied with cp -R, and
# the hook scripts are copied under .gitlab/duo/hooks/ so the project
# is self-contained.
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
    sed -n '3,25p' "$0" | sed 's/^# \{0,1\}//'
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

# Manifest of skill directories this installer wrote into target/skills/.
# Used by re-runs to refresh in place, and by --uninstall to remove only
# Snowball-managed entries.
SKILLS_MANIFEST_REL=".gitlab/duo/snowball-skills.json"

# hooks.json command. Resolves to project-local copies of the hook scripts
# via Duo's ${DUO_PROJECT_DIR} expansion, with SNOWBALL_PLUGIN_ROOT
# pointing the session-start script at the project's copied skills/.
# shellcheck disable=SC2016  # ${DUO_PROJECT_DIR} is expanded by Duo at hook-run time, not here.
HOOK_COMMAND='SNOWBALL_PLUGIN_ROOT="${DUO_PROJECT_DIR}" "${DUO_PROJECT_DIR}/.gitlab/duo/hooks/run-hook.cmd" session-start'

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

# Write/update the Snowball block in AGENTS.md. Always produces a real file,
# never a symlink. Idempotent on re-run; preserves user content outside the
# marked block.
agents_install() {
    local src="$SNOWBALL_ROOT/AGENTS.md"
    local dst="$target/AGENTS.md"

    # Migrate legacy Snowball symlink into a real file with the marked block.
    if [ -L "$dst" ] && is_snowball_symlink "$dst" "$src"; then
        rm -f "$dst"
        echo "  migrated legacy AGENTS.md symlink to managed copy"
    fi

    # Symlink to something else: respect unless --force.
    if [ -L "$dst" ]; then
        if [ "$force" -eq 1 ]; then
            rm -f "$dst"
            echo "  removed (--force) non-Snowball AGENTS.md symlink"
        else
            echo "error: $dst is a symlink to something other than Snowball" >&2
            echo "       re-run with --force to replace, or convert it to a regular file first" >&2
            return 1
        fi
    fi

    # --force on a regular file discards user content.
    if [ "$force" -eq 1 ] && [ -f "$dst" ]; then
        rm -f "$dst"
        echo "  removed (--force) existing AGENTS.md"
    fi

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

with open(src, 'r', encoding='utf-8') as f:
    snowball = f.read().rstrip() + '\n'

block = f"{mb}\n\n{snowball}\n{me}"
pattern = re.compile(re.escape(mb) + r'.*?' + re.escape(me), re.DOTALL)

if os.path.exists(dst):
    with open(dst, 'r', encoding='utf-8') as f:
        content = f.read()
else:
    content = ''

if pattern.search(content):
    new_content = pattern.sub(block, content)
    action = "updated"
elif not content.strip():
    new_content = block + '\n'
    action = "created"
else:
    sep = '' if content.endswith('\n\n') else ('\n' if content.endswith('\n') else '\n\n')
    new_content = content + sep + block + '\n'
    action = "appended"

if new_content == content:
    print("  AGENTS.md Snowball block already up to date")
else:
    with open(dst, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print(f"  {action} Snowball block in AGENTS.md")
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
            echo "  removed legacy AGENTS.md symlink"
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

# Copy each Snowball skill directory into target/skills/, tracking installed
# names in a manifest so re-runs can refresh and --uninstall can remove only
# Snowball-managed entries. Project-defined skills (not in the manifest) are
# preserved untouched.
skills_install() {
    # Migrate legacy whole-directory skills symlink.
    if [ -L "$target/skills" ]; then
        if is_snowball_symlink "$target/skills" "$SNOWBALL_ROOT/skills"; then
            rm -f "$target/skills"
            echo "  migrated legacy whole-directory skills symlink"
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
    mkdir -p "$target/.gitlab/duo"

    SNOWBALL_ROOT="$SNOWBALL_ROOT" \
    SNOWBALL_TARGET="$target" \
    SNOWBALL_MANIFEST="$target/$SKILLS_MANIFEST_REL" \
    SNOWBALL_FORCE="$force" \
    python3 - <<'PY'
import json, os, shutil, sys

snowball = os.environ['SNOWBALL_ROOT']
target   = os.environ['SNOWBALL_TARGET']
manifest = os.environ['SNOWBALL_MANIFEST']
force    = os.environ['SNOWBALL_FORCE'] == '1'

src_dir = os.path.join(snowball, 'skills')
dst_dir = os.path.join(target, 'skills')

# Load previous manifest (list of skill names this installer wrote).
prev_installed = set()
if os.path.exists(manifest):
    try:
        with open(manifest, 'r', encoding='utf-8') as f:
            prev_installed = set(json.load(f).get('skills', []))
    except (json.JSONDecodeError, OSError):
        prev_installed = set()

snowball_skills = sorted(
    name for name in os.listdir(src_dir)
    if os.path.isdir(os.path.join(src_dir, name))
)

copied = refreshed = migrated = preserved = 0
new_installed = []

for name in snowball_skills:
    src = os.path.join(src_dir, name)
    dst = os.path.join(dst_dir, name)

    # Legacy per-skill symlink to Snowball: migrate to copy.
    if os.path.islink(dst):
        link_target = os.readlink(dst)
        is_snowball = link_target in (src, src + '/')
        if is_snowball:
            os.unlink(dst)
            shutil.copytree(src, dst)
            migrated += 1
            new_installed.append(name)
            continue
        if force:
            os.unlink(dst)
            shutil.copytree(src, dst)
            copied += 1
            new_installed.append(name)
            continue
        preserved += 1
        continue

    if os.path.isdir(dst):
        if name in prev_installed or force:
            shutil.rmtree(dst)
            shutil.copytree(src, dst)
            if name in prev_installed:
                refreshed += 1
            else:
                copied += 1
            new_installed.append(name)
        else:
            preserved += 1
        continue

    if os.path.exists(dst):
        if force:
            os.remove(dst)
            shutil.copytree(src, dst)
            copied += 1
            new_installed.append(name)
        else:
            preserved += 1
        continue

    shutil.copytree(src, dst)
    copied += 1
    new_installed.append(name)

# Remove orphaned manifest entries (skills that exist in target but no
# longer in Snowball upstream) — only if they're still directories that
# look like our copies.
for name in sorted(prev_installed - set(new_installed)):
    if name in snowball_skills:
        continue
    dst = os.path.join(dst_dir, name)
    if os.path.isdir(dst) and not os.path.islink(dst):
        shutil.rmtree(dst)
        print(f"  removed stale skill (no longer in Snowball upstream): {name}")

with open(manifest, 'w', encoding='utf-8') as f:
    json.dump({'skills': sorted(new_installed)}, f, indent=2)
    f.write('\n')

print(f"  skills: {copied} copied, {refreshed} refreshed, "
      f"{migrated} migrated from symlink, {preserved} project-defined (kept)")
PY
}

# Remove only the skill directories this installer wrote (per manifest).
skills_uninstall() {
    # Handle legacy whole-directory symlink directly.
    if [ -L "$target/skills" ]; then
        if is_snowball_symlink "$target/skills" "$SNOWBALL_ROOT/skills"; then
            rm -f "$target/skills"
            echo "  removed legacy skills/ symlink (whole-directory install)"
            return 0
        elif [ "$force" -eq 1 ]; then
            rm -f "$target/skills"
            echo "  removed (--force) skills/ symlink: $target/skills"
            return 0
        else
            echo "  refusing to remove skills/ symlink (not a Snowball symlink): $target/skills" >&2
            return 1
        fi
    fi

    [ -d "$target/skills" ] || return 0

    SNOWBALL_ROOT="$SNOWBALL_ROOT" \
    SNOWBALL_TARGET="$target" \
    SNOWBALL_MANIFEST="$target/$SKILLS_MANIFEST_REL" \
    python3 - <<'PY'
import json, os, shutil

snowball = os.environ['SNOWBALL_ROOT']
target   = os.environ['SNOWBALL_TARGET']
manifest = os.environ['SNOWBALL_MANIFEST']

dst_dir = os.path.join(target, 'skills')
src_dir = os.path.join(snowball, 'skills')

installed = set()
if os.path.exists(manifest):
    try:
        with open(manifest, 'r', encoding='utf-8') as f:
            installed = set(json.load(f).get('skills', []))
    except (json.JSONDecodeError, OSError):
        installed = set()

removed = 0
for name in sorted(installed):
    dst = os.path.join(dst_dir, name)
    if not os.path.exists(dst) and not os.path.islink(dst):
        continue
    if os.path.islink(dst):
        # Legacy per-skill symlink left over from before manifest tracking.
        link_target = os.readlink(dst)
        src = os.path.join(src_dir, name)
        if link_target in (src, src + '/'):
            os.unlink(dst)
            removed += 1
        continue
    if os.path.isdir(dst):
        shutil.rmtree(dst)
        removed += 1

# Also catch any legacy per-skill symlinks that predate the manifest.
if os.path.isdir(dst_dir):
    for name in os.listdir(dst_dir):
        dst = os.path.join(dst_dir, name)
        if not os.path.islink(dst):
            continue
        link_target = os.readlink(dst)
        src = os.path.join(src_dir, name)
        if link_target in (src, src + '/'):
            os.unlink(dst)
            removed += 1

if removed:
    print(f"  removed {removed} Snowball-managed skill(s) from skills/")

if os.path.exists(manifest):
    os.remove(manifest)
PY
}

# Copy hook scripts into target/.gitlab/duo/hooks/ and merge our SessionStart
# entry into target/.gitlab/duo/hooks.json. The hooks.json command references
# the project-local copies via Duo's ${DUO_PROJECT_DIR} expansion.
hooks_install() {
    local hooks_dir="$target/.gitlab/duo"
    local scripts_dir="$hooks_dir/hooks"
    local dst="$hooks_dir/hooks.json"
    mkdir -p "$scripts_dir"

    install -m 0755 "$SNOWBALL_ROOT/hooks/run-hook.cmd" "$scripts_dir/run-hook.cmd"
    install -m 0755 "$SNOWBALL_ROOT/hooks/session-start" "$scripts_dir/session-start"
    echo "  copied hook scripts to .gitlab/duo/hooks/ (run-hook.cmd, session-start)"

    SNOWBALL_HOOKS_DST="$dst" \
    SNOWBALL_ROOT="$SNOWBALL_ROOT" \
    SNOWBALL_HOOK_COMMAND="$HOOK_COMMAND" \
    python3 - <<'PY'
import json, os, sys
dst = os.environ['SNOWBALL_HOOKS_DST']
snowball = os.environ['SNOWBALL_ROOT']
command = os.environ['SNOWBALL_HOOK_COMMAND']
legacy_command = f'"{snowball}/hooks/run-hook.cmd" session-start'

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

def is_snowball_hook(cmd):
    return cmd == command or cmd == legacy_command

# Update in place if a legacy entry exists; bail if the new entry is
# already present untouched.
updated = False
already = False
for matcher_entry in session_start:
    for h in matcher_entry.get('hooks', []):
        cmd = h.get('command', '')
        if cmd == command:
            already = True
        elif cmd == legacy_command:
            h['command'] = command
            updated = True

if already and not updated:
    print(f"  hooks.json: Snowball SessionStart entry already present (no change)")
    sys.exit(0)

if updated:
    with open(dst, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)
        f.write('\n')
    print(f"  hooks.json: migrated legacy Snowball SessionStart command to project-local form")
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
    print(f"  wrote .gitlab/duo/hooks.json (command resolves to project-local copies)")
PY
}

# Inverse: filter Snowball's SessionStart entry out of hooks.json and remove
# the copied hook scripts. Preserves user-defined entries and other event types.
hooks_uninstall() {
    local hooks_dir="$target/.gitlab/duo"
    local scripts_dir="$hooks_dir/hooks"
    local dst="$hooks_dir/hooks.json"

    if [ -f "$dst" ]; then
        SNOWBALL_HOOKS_DST="$dst" \
        SNOWBALL_ROOT="$SNOWBALL_ROOT" \
        SNOWBALL_HOOK_COMMAND="$HOOK_COMMAND" \
        python3 - <<'PY'
import json, os, sys
dst = os.environ['SNOWBALL_HOOKS_DST']
snowball = os.environ['SNOWBALL_ROOT']
command = os.environ['SNOWBALL_HOOK_COMMAND']
legacy_command = f'"{snowball}/hooks/run-hook.cmd" session-start'

with open(dst, 'r', encoding='utf-8') as f:
    try:
        data = json.load(f)
    except json.JSONDecodeError:
        print(f"  preserving hooks.json (not valid JSON; not modifying): {dst}")
        sys.exit(0)

def is_snowball_hook(cmd):
    return cmd == command or cmd == legacy_command

removed = 0
session_start = data.get('hooks', {}).get('SessionStart', [])
new_session_start = []
for entry in session_start:
    kept_hooks = [h for h in entry.get('hooks', []) if not is_snowball_hook(h.get('command', ''))]
    if not kept_hooks:
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
    fi

    # Remove the copied scripts and their dir if nothing else lives there.
    if [ -d "$scripts_dir" ]; then
        for name in run-hook.cmd session-start; do
            if [ -f "$scripts_dir/$name" ]; then
                rm -f "$scripts_dir/$name"
            fi
        done
        if rmdir "$scripts_dir" 2>/dev/null; then
            echo "  removed .gitlab/duo/hooks/ (copied hook scripts)"
        fi
    fi
}

# --- uninstall path ---

if [ "$uninstall" -eq 1 ]; then
    echo "Uninstalling Snowball from $target"
    rc=0
    agents_uninstall || rc=1
    skills_uninstall || rc=1
    hooks_uninstall  || rc=1

    # Prune now-empty skills/, .gitlab/duo/, and .gitlab/ — but only if WE
    # don't own anything there anymore.
    if [ -d "$target/skills" ] && rmdir "$target/skills" 2>/dev/null; then
        echo "  removed empty skills/"
    elif [ -d "$target/skills" ]; then
        echo "  preserved skills/ (contains project-defined entries)"
    fi
    if rmdir "$target/.gitlab/duo" 2>/dev/null; then echo "  removed empty .gitlab/duo/"; fi
    if rmdir "$target/.gitlab" 2>/dev/null; then echo "  removed empty .gitlab/"; fi

    exit $rc
fi

# --- install path ---

echo "Installing Snowball into $target"
echo "Snowball clone: $SNOWBALL_ROOT"

agents_install || exit 1

if [ "$install_skills" -eq 1 ]; then
    skills_install || exit 1
else
    echo "  --no-skills: skipping skills/ install (Duo Agent Skills won't be discoverable)"
fi

hooks_install || exit 1

cat <<EOF

Done. Verify with:

  cd "$target"
  ls -la AGENTS.md skills .gitlab/duo/hooks.json .gitlab/duo/hooks/

For Duo CLI users, launch with project hooks enabled:

  glab duo cli --enable-project-hooks

To remove later: $0 --uninstall "$target"
EOF
