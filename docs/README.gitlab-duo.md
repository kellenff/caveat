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

## Install path B: cross-project (user-level)

Use this when you want Snowball to apply across all your projects, not just inside the Snowball clone. Duo reads per-user files from `~/.gitlab/duo/` on Linux/macOS and `%APPDATA%\GitLab\duo\` on Windows. User-level files merge with whatever the project repo provides; Snowball can live entirely at user level.

### Linux / macOS

```bash
mkdir -p ~/.gitlab/duo

# 1. AGENTS.md — system-level framing for all Duo surfaces
ln -s ~/Projects/snowball/AGENTS.md ~/.gitlab/duo/AGENTS.md

# 2. hooks.json — Duo CLI SessionStart bootstrap (CLI only)
ln -s ~/Projects/snowball/.gitlab/duo/hooks.json ~/.gitlab/duo/hooks.json
```

The hook command in `hooks.json` uses `$DUO_PROJECT_DIR`, which Duo sets to the user's project — not to Snowball. For user-level install you need to override that path so the hook still finds Snowball's bootstrap script. Copy the file instead of symlinking it and edit the path:

```bash
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

### Skills discovery for cross-project

Duo discovers Agent Skills from `skills/<name>/SKILL.md` at the **project root**, not from user-level config. To make Snowball's skills available cross-project, either:

- keep working inside the Snowball clone (path A); or
- symlink the Snowball `skills/` directory into each project that needs it: `ln -s ~/Projects/snowball/skills <your-project>/skills` (only safe if your project doesn't already have a `skills/` directory); or
- rely on the `AGENTS.md` framing alone, which carries the priority and skill-discovery instructions even without the SKILL.md files being discovered.

A future Snowball release may add user-level skill discovery once Duo documents that surface.

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

If you installed at user level by copying `hooks.json` (not symlinking), re-run the copy + path-patch step after pulling.

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
