# Snowball for GitLab Duo

Complete guide for using Snowball with [GitLab Duo](https://about.gitlab.com/gitlab-duo/).

Duo has no plugin marketplace and no install-time registration step. Integration is by **file presence**: Duo reads `AGENTS.md`, `skills/<name>/SKILL.md`, and (CLI only) `.gitlab/duo/hooks.json` from either the repository root or a per-user config directory. "Installing" Snowball for Duo means putting these files where Duo will look for them.

## Surfaces and what they read

| Duo surface | `AGENTS.md` | `skills/<name>/SKILL.md` | `.gitlab/duo/hooks.json` |
|-------------|-------------|--------------------------|--------------------------|
| Duo Agentic Chat | yes | yes | no |
| Agent Platform Flows | yes (except Code Review Flow) | yes | no |
| Duo CLI (`glab duo cli` or `duo`) | yes | yes | yes (opt-in) |
| Duo Chat (basic) | limited | no | no |
| Code Suggestions (inline) | no | no | no |

Snowball ships matching files for all three integration points; pick the install path that matches how you use Duo.

## Prerequisites

- A GitLab account with Duo enabled. See [GitLab Duo setup](https://docs.gitlab.com/user/gitlab_duo/turn_on_off/) for licensing and enablement.
- (CLI only) the `glab` CLI with Duo extension, or the standalone `duo` binary. See [Duo CLI install](https://docs.gitlab.com/user/gitlab_duo_cli/).
- Git, and a clone of Snowball:

  ```bash
  git clone https://github.com/kellenff/snowball.git ~/Projects/snowball
  ```

## Install path A: work inside the Snowball clone

The simplest case. If you are using Snowball itself as the working repository (for example, to develop new skills), no install step is required:

1. `cd ~/Projects/snowball`
2. Open Duo Agentic Chat on the repo, or launch the Duo CLI.

Duo will:

- read [`AGENTS.md`](../AGENTS.md) as system-level guidance;
- auto-discover every `skills/<name>/SKILL.md` as a [Duo Agent Skill](https://docs.gitlab.com/user/duo_agent_platform/customize/agent_skills/);
- (CLI only, when you pass `--enable-project-hooks`) run the SessionStart hook registered in [`.gitlab/duo/hooks.json`](../.gitlab/duo/hooks.json), which injects the `using-snowball` framing into every session.

Verify by asking Duo: "What is Snowball?" — it should describe the skills library.

## Install path B: into another project (recommended for cross-project use)

When you want Snowball framing applied to a project other than the Snowball clone itself, use the bundled installer. It auto-detects both the Snowball clone (from its own location) and the target project (from `$PWD` or a path argument):

```bash
cd ~/work/my-project
~/Projects/snowball/scripts/install-into-project.sh
```

The installer is **non-destructive by default**: it adds to what's already there rather than overwriting. Duo doesn't follow symlinks when discovering `AGENTS.md`, skill directories, or hook scripts, so the installer writes real files in every case. For each artifact:

- **`AGENTS.md`** — written as a real file (not a symlink) containing Snowball's framing wrapped in `<!-- snowball:agents:begin ... -->` markers. If the target already has its own `AGENTS.md`, the marked block is appended; user content outside the block is preserved verbatim. Re-running the installer updates the marked block in place without duplicating it. To pick up Snowball updates after `git pull`-ing the Snowball clone, re-run the installer.
- **`skills/`** — a real directory containing one copy per Snowball skill (`skills/brainstorming/` is a `cp -R` of `<snowball>/skills/brainstorming/`, etc.). Snowball does **not** symlink the entire `skills/` directory or any individual skill; it copies each one so the project can keep its own `skills/<custom-skill>/` alongside Snowball's. Project-defined entries with the same name as a Snowball skill are left untouched. The set of skills the installer wrote is tracked in `.gitlab/duo/snowball-skills.json` so re-runs can refresh in place and `--uninstall` knows which directories to remove.
- **`.gitlab/duo/hooks/`** — Snowball's `run-hook.cmd` and `session-start` are copied into this directory so the project is fully self-contained (no path back into the Snowball clone). The copied `session-start` reads its `using-snowball` framing from the project's own `skills/using-snowball/SKILL.md`.
- **`.gitlab/duo/hooks.json`** — if the file doesn't exist, it's generated with Snowball's `SessionStart` entry. If it exists with user-defined hooks, the installer parses it as JSON and **appends** Snowball's `SessionStart` matcher entry alongside any others — including hooks under other event types like `PreToolUse`, which are left untouched. The Snowball entry's command resolves to the project-local script via Duo's `${DUO_PROJECT_DIR}` expansion: `SNOWBALL_PLUGIN_ROOT="${DUO_PROJECT_DIR}" "${DUO_PROJECT_DIR}/.gitlab/duo/hooks/run-hook.cmd" session-start`.

Installs created by earlier versions of this script (whole-directory or per-skill `skills/` symlinks, AGENTS.md symlinks, hooks.json with an absolute Snowball clone path) are auto-migrated on re-run.

### Project-defined skills coexist with Snowball's

The per-skill copy model lets a project define its own skills next to Snowball's:

```
<project>/skills/
├── brainstorming/          → copy of <snowball>/skills/brainstorming/
├── test-driven-development/ → copy of <snowball>/skills/test-driven-development/
├── ...                     → (the rest of Snowball's skills, all copied)
└── my-deploy-workflow/     → real directory: a project-defined skill
    └── SKILL.md
```

If a project already has its own `skills/<name>/` with the **same name** as a Snowball skill, the installer leaves the project's version alone — that's an intentional local override. The using-snowball framing tells agents to prefer project-defined skills over Snowball-shipped ones when both could apply (see [`AGENTS.md`](../AGENTS.md) and [`skills/using-snowball/SKILL.md`](../skills/using-snowball/SKILL.md), "Instruction Priority").

The manifest `.gitlab/duo/snowball-skills.json` records which directories the installer wrote so re-runs refresh those entries and `--uninstall` removes only them.

A summary line at the end of install lists how many skills were copied, how many were refreshed from a previous install, how many were migrated from a legacy symlink, and how many project-defined skills were preserved.

### Migrating from the previous symlink-based installs

Early versions of this installer symlinked the entire `skills/` directory, or each individual skill, and symlinked `AGENTS.md`. Duo doesn't follow those symlinks reliably across all surfaces, so the current installer copies everything instead. Re-running the installer over a target left behind by an older version auto-migrates whatever it finds (whole-directory symlink, per-skill symlinks, AGENTS.md symlink, hooks.json with an absolute Snowball path) — no manual cleanup required. `--uninstall` handles all formats.

### Flags and uninstall

Re-running the installer is idempotent. Other useful flags:

```bash
install-into-project.sh --no-skills           # AGENTS.md + hooks.json only (don't touch skills/)
install-into-project.sh --force               # replace user content instead of merging
install-into-project.sh --uninstall           # remove only the artifacts this script created
install-into-project.sh /path/to/other/proj   # explicit target path instead of $PWD
```

`--force` switches to a destructive overwrite: a user-owned `AGENTS.md` is replaced by a Snowball-only copy, a non-Snowball `AGENTS.md` symlink is removed, and any project-defined `skills/<name>/` that collides with a Snowball skill name is overwritten with Snowball's copy. The merge / preserve behavior is the default; pass `--force` only when you genuinely want to discard what was there.

`--uninstall` is also non-destructive: it removes the per-skill copies listed in `.gitlab/duo/snowball-skills.json` (plus any legacy per-skill symlinks that still resolve into this Snowball clone), removes the AGENTS.md marker block (leaving the rest of the file intact), removes the copied hook scripts under `.gitlab/duo/hooks/`, and removes only the Snowball entry from `hooks.json` (leaving user-defined entries — and other event types — alone). The `skills/` directory itself is preserved if any project-defined skills remain inside it; an `AGENTS.md` is preserved if it had user content outside the marked block.

### python3 requirement

The installer uses `python3` to merge `AGENTS.md` markers and `hooks.json` JSON. It's expected to be available on any Unix-like system. If it isn't, install python3 first or fall back to manual setup (path C below).

## Install path C: cross-project (user-level config)

Use this when you want Snowball framing applied across **every** project without per-project install. Duo reads per-user files from `~/.gitlab/duo/` on Linux/macOS and `%APPDATA%\GitLab\duo\` on Windows. User-level files merge with whatever the project repo provides.

### Linux / macOS

Duo doesn't follow symlinks for `AGENTS.md` or hook scripts, so copy the files into your user config dir — don't symlink them. Re-run the copy after a `git pull` in the Snowball clone to pick up updates.

```bash
mkdir -p ~/.gitlab/duo

# 1. AGENTS.md — system-level framing for all Duo surfaces
cp ~/Projects/snowball/AGENTS.md ~/.gitlab/duo/AGENTS.md

# 2. hooks.json — Duo CLI SessionStart bootstrap (CLI only)
# The hook command uses $DUO_PROJECT_DIR, which Duo sets to the user's
# project — not to Snowball. Patch it to point at the Snowball clone so
# the bootstrap script can find the using-snowball framing.
cp ~/Projects/snowball/.gitlab/duo/hooks.json ~/.gitlab/duo/hooks.json
sed -i 's|${DUO_PROJECT_DIR}|'"$HOME"'/Projects/snowball|' ~/.gitlab/duo/hooks.json
```

(Use `sed -i ''` on macOS instead of `sed -i`.)

### Windows

```powershell
$duoDir = "$env:APPDATA\GitLab\duo"
New-Item -ItemType Directory -Force -Path $duoDir | Out-Null

# AGENTS.md
Copy-Item "$HOME\Projects\snowball\AGENTS.md" "$duoDir\AGENTS.md"

# hooks.json with path patched to point at the snowball clone
$snowballPath = "$HOME\Projects\snowball" -replace '\\', '/'
(Get-Content "$HOME\Projects\snowball\.gitlab\duo\hooks.json") `
  -replace '\$\{DUO_PROJECT_DIR\}', $snowballPath `
  | Set-Content "$duoDir\hooks.json"
```

### Skills discovery for cross-project (user-level)

Duo discovers Agent Skills from `skills/<name>/SKILL.md` at the **project root**, not from user-level config. To make Snowball's skills available cross-project, either:

- keep working inside the Snowball clone (path A);
- run `scripts/install-into-project.sh` in each project that needs them (path B); or
- rely on the `AGENTS.md` framing alone, which carries the priority and skill-discovery instructions even without the SKILL.md files being discovered.

## Duo CLI: enabling the SessionStart hook

Project-level Duo CLI hooks are gated behind an experimental flag. Without it the `.gitlab/duo/hooks.json` file is ignored:

```bash
glab duo cli --enable-project-hooks
# or
GITLAB_ENABLE_PROJECT_HOOKS=true glab duo cli
```

User-level hooks (`~/.gitlab/duo/hooks.json`) run without the flag and execute before project-level hooks. If both are installed, expect the user-level bootstrap to fire and the project-level one to be skipped (or fire after, depending on Duo CLI version — see the [Duo CLI hooks docs](https://docs.gitlab.com/user/gitlab_duo_cli/) for current behavior).

## How it works

The bootstrap is the same script all Snowball harnesses share: [`hooks/session-start`](../hooks/session-start). It reads `skills/using-snowball/SKILL.md`, wraps it in `<EXTREMELY_IMPORTANT>` framing, and emits a JSON object on stdout. For Duo CLI, the script detects the `DUO_SESSION_ID` environment variable and emits the [Duo-expected shape](https://docs.gitlab.com/user/gitlab_duo_cli/):

```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "<EXTREMELY_IMPORTANT>...using-snowball content...</EXTREMELY_IMPORTANT>"
  }
}
```

Non-CLI Duo surfaces don't run hooks; for them the same framing is delivered statically via [`AGENTS.md`](../AGENTS.md).

For tool-name mapping (e.g. `Skill` → Duo's slash-command convention), see [`skills/using-snowball/references/gitlab-duo-tools.md`](../skills/using-snowball/references/gitlab-duo-tools.md).

## Updating

Pull the latest Snowball:

```bash
cd ~/Projects/snowball
git pull
```

Because all installed artifacts (AGENTS.md, skills, hook scripts) are now copies rather than symlinks, re-run the relevant install step after pulling to propagate updates:

- **Path B (per-project):** re-run `scripts/install-into-project.sh` in the target project. The AGENTS.md marker block is updated in place, each Snowball skill listed in `.gitlab/duo/snowball-skills.json` is refreshed, and the hook scripts under `.gitlab/duo/hooks/` are replaced. Project-defined skills and user content outside the marker block are left alone.
- **Path C (user-level):** re-run the copy + path-patch step.

## Troubleshooting

**Duo isn't using Snowball skills.** Verify your Duo plan supports Agent Skills — see [Agent Skills docs](https://docs.gitlab.com/user/duo_agent_platform/customize/agent_skills/). Confirm the `skills/<name>/SKILL.md` files have valid YAML frontmatter (`name:` and `description:`) — Duo skips skills without it. Start a fresh Duo session; existing sessions don't reload skills.

**`AGENTS.md` framing isn't visible in Duo's behavior.** Confirm the file exists at the repo root (or in `~/.gitlab/duo/` for user-level). Start a new conversation — Duo loads context files at session start. Code Review Flow doesn't read `AGENTS.md` by design; that's expected.

**Duo CLI SessionStart hook never fires.** Make sure you launched with `--enable-project-hooks` (or set `GITLAB_ENABLE_PROJECT_HOOKS=true`). Confirm `.gitlab/duo/hooks.json` is at the repo root. Test the hook script directly:

```bash
DUO_SESSION_ID=test bash hooks/session-start | head -c 200
```

The output should start with `{"hookSpecificOutput":` and contain `EXTREMELY_IMPORTANT`. If not, file an issue.

**Sensitive env vars stripped.** Duo CLI scrubs `GITLAB_TOKEN`, `GITLAB_OAUTH_TOKEN`, and `CI_JOB_TOKEN` from the hook environment. Snowball's bootstrap doesn't need them; if you add custom hooks that do, work around this with a wrapper script.

## Getting help

- Report issues: https://github.com/kellenff/snowball/issues
- Duo customization docs: https://docs.gitlab.com/user/duo_agent_platform/customize/
- Duo CLI docs: https://docs.gitlab.com/user/gitlab_duo_cli/
