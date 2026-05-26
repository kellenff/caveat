# Snowball

Snowball is an agentic-skills plugin for multiple AI coding harnesses — Claude Code, Codex CLI, Cursor, OpenCode, Gemini CLI, GitHub Copilot CLI, and GitLab Duo. It's a fork of [`obra/superpowers`](https://github.com/obra/superpowers), maintained for personal use. As of 2026-05-25 the fork is a near-mirror of upstream `v5.1.0` with naming changed; substantive divergence will be documented here as it appears.

> [!NOTE]
> Personal fork. Upstream is [`obra/superpowers`](https://github.com/obra/superpowers) — see it for the canonical project, its install paths, and its community.

> [!IMPORTANT]
> Not accepting contributions. Issues and pull requests on this repository will not be reviewed.

## Scope & status

### What this is

- A markdown-based skills library that loads as agent behavior via session-start context injection.
- A multi-harness plugin — one `skills/` directory, six per-harness manifests, one shared bootstrap script that adapts its output to each harness's expected JSON shape.
- Zero runtime dependencies for skill loading. Skills are plain markdown; the bootstrap is one bash file. Exceptions: the `brainstorming` skill ships a local Node HTTP server for its visual companion (`skills/brainstorming/scripts/server.cjs`) — Node is required for that skill, stdlib only. The `decision-logging` skill (Phase 1 fork divergence; see `docs/snowball/specs/2026-05-25-decision-logging-design.md`) requires Node plus a single npm dep (`js-yaml`); run `npm install` at the snowball root after cloning if you want decision-log capture to work.

### What this isn't

- Not an MCP server, not a runtime tool, not a library you import.
- Not on any plugin marketplace. Install is clone-and-link only.
- Not accepting issues, PRs, or feature requests.

### Known stale or broken

These are real artifacts in the repo that haven't been reconciled with the fork's posture. Tracking them here so a future-me debug session doesn't waste time:

- **Install instructions inherited from upstream don't work.** The bulk rename replaced `obra/superpowers-marketplace` with `kellenff/snowball-marketplace` in old documentation text, but that marketplace doesn't exist. The local-setup section below is the real install path.
- **`scripts/sync-to-codex-plugin.sh` targets the wrong destination.** Its `FORK=` constant still points at `prime-radiant-inc/openai-codex-plugins` (upstream's Codex distribution repo). Until rewired to a fork-owned destination, the script will fail or push to a repo I don't own. Codex support itself is intended to stay; only the sync path is broken.
- **`CLAUDE.md` still contains upstream's contributor-policing prose.** The "94% PR rejection rate / anti-slop / fork-specific changes will be closed" sections were written for upstream's open-contribution model. They don't apply to this fork and will be rewritten in a separate cleanup. (`AGENTS.md` is freshly written for this fork and is no longer a symlink to `CLAUDE.md`.)
- **`.github/ISSUE_TEMPLATE/`** carries upstream's open-issues assumption — out of place for a fork that takes no issues.
- **`RELEASE-NOTES.md`** and the historical plans/specs under `docs/plans/`, `docs/snowball/plans/`, `docs/snowball/specs/` are upstream's historical record. Kept verbatim as history; not the current project's documentation.

## Repository map

| Path | What lives here |
|---|---|
| `skills/` | The 14 skills (see [Skills index](#skills-index)). Each is a directory with a `SKILL.md` plus optional `references/` and `scripts/`. |
| `hooks/` | `session-start` (the bash bootstrap script), `run-hook.cmd` (polyglot bash/batch wrapper for Windows), `hooks.json` (Claude Code hook registration), `hooks-cursor.json` (Cursor hook registration). |
| `.claude-plugin/` | Claude Code plugin manifest + dev marketplace manifest. |
| `.codex-plugin/` | Codex plugin manifest, kept in sync (via `scripts/sync-to-codex-plugin.sh`) with a separate Codex distribution repo. |
| `.cursor-plugin/` | Cursor plugin manifest. |
| `.opencode/` | OpenCode JS plugin (`plugins/snowball.js`) and harness-specific install notes. |
| `.gitlab/duo/` | GitLab Duo CLI lifecycle-hooks manifest (`hooks.json`). |
| `gemini-extension.json` | Gemini CLI extension manifest. |
| `AGENTS.md` | Cross-tool context file read by Codex, Cursor, Copilot CLI, OpenCode, and GitLab Duo's non-CLI surfaces. |
| `assets/` | App icon and Codex composer SVG. |
| `scripts/` | `bump-version.sh` (cross-manifest semver bumper driven by `.version-bump.json`), `install-into-project.sh` (symlinks Snowball into a local project for GitLab Duo / cross-tool `AGENTS.md`), and `sync-to-codex-plugin.sh` (currently stale — see above). |
| `tests/` | Seven test groupings: harness-specific bootstrap tests, Codex-sync verification, skill-triggering evals, SDD end-to-end runs against example scaffolds. |
| `docs/` | Setup notes (`README.opencode.md`, `windows/`), testing notes (`testing.md`), and historical design docs under `snowball/`. |
| `AGENTS.md`, `GEMINI.md` | Per-harness context files loaded by each agent at session start. (`CLAUDE.md` is not present in this fork — see "Known stale or broken" above.) |
| `RELEASE-NOTES.md` | Upstream's release history through v5.1.0. Kept as historical record. |

## Per-harness adapters

| Harness | Manifest | Bootstrap loader | Context file |
|---|---|---|---|
| Claude Code | `.claude-plugin/plugin.json` | `hooks/hooks.json` → `hooks/run-hook.cmd session-start` | `CLAUDE.md` |
| Cursor | `.cursor-plugin/plugin.json` | `hooks/hooks-cursor.json` → same script | `AGENTS.md` |
| GitHub Copilot CLI | `.claude-plugin/plugin.json` (shared) | same script, detects `COPILOT_CLI=1` and emits SDK-standard JSON shape | `AGENTS.md` |
| OpenCode | `.opencode/plugins/snowball.js` | JS plugin, `experimental.chat.messages.transform` hook | `AGENTS.md` |
| Codex CLI / Codex App | `.codex-plugin/plugin.json` | distributed via `scripts/sync-to-codex-plugin.sh` (currently stale; see above) | `AGENTS.md` |
| Gemini CLI | `gemini-extension.json` | extension-managed; skills activate via `activate_skill` tool | `GEMINI.md` |
| GitLab Duo | `.gitlab/duo/hooks.json` (CLI only) | hooks.json → `run-hook.cmd session-start`, detects `DUO_SESSION_ID` and emits Claude-Code-shaped JSON. Non-CLI Duo surfaces (Agentic Chat, Agent Platform Flows) read `AGENTS.md` and `skills/<name>/SKILL.md` directly. | `AGENTS.md` |

### How the bootstrap works

The whole plugin hinges on `skills/using-snowball/SKILL.md` being **injected into the agent's context at session start**, not just present on disk. Without injection, the agent never invokes the `Skill` tool and the rest of the library is dead weight.

For shell-driven harnesses (Claude Code, Cursor, Copilot CLI, GitLab Duo CLI), [`hooks/session-start`](hooks/session-start) reads `using-snowball/SKILL.md`, JSON-escapes it via bash parameter substitution (no `jq` dependency), wraps it in `<EXTREMELY_IMPORTANT>` framing, and branches on environment variables to emit harness-specific JSON:

- `CURSOR_PLUGIN_ROOT` set → `additional_context` (snake_case)
- `CLAUDE_PLUGIN_ROOT` set without `COPILOT_CLI` → `hookSpecificOutput.additionalContext`
- `DUO_SESSION_ID` set → `hookSpecificOutput.additionalContext` (GitLab Duo CLI; same shape as Claude Code)
- Otherwise → `additionalContext` (Copilot CLI / SDK standard)

[`hooks/run-hook.cmd`](hooks/run-hook.cmd) is a polyglot file: line 1 (`: << 'CMDBLOCK'`) is a no-op heredoc in bash, allowing Windows batch syntax to live inside the same file. On Windows, `cmd.exe` ignores the bash framing and locates `bash.exe` (Git for Windows, MSYS2, Cygwin, or PATH). On Unix, bash skips the batch block and execs the named script directly.

OpenCode can't shell out reliably, so [`.opencode/plugins/snowball.js`](.opencode/plugins/snowball.js) does the same job in JS — reads the SKILL.md, strips frontmatter inline (no YAML dependency), caches the result module-level, and injects the bootstrap as the first text part of the first user message. A guard (`includes('EXTREMELY_IMPORTANT')`) prevents double-injection when OpenCode re-runs the transform per agent step.

## Skills index

14 skills in four groups. Each links to its `SKILL.md`.

### Bootstrap

- [`using-snowball`](skills/using-snowball/SKILL.md) — the entry-point skill loaded into every session by the bootstrap hook. Sets the "check skills before responding" discipline; defines instruction priority (user > skills > default system prompt); includes tool-mapping references for non-Claude-Code harnesses in [`references/`](skills/using-snowball/references/).

### Process and methodology

- [`brainstorming`](skills/brainstorming/SKILL.md) — gated design exploration; refuses implementation until a design is presented and approved. Ships a [visual companion](skills/brainstorming/visual-companion.md) (local HTTP server) for diagram-driven design review.
- [`writing-plans`](skills/writing-plans/SKILL.md) — produces implementation plans before code is written.
- [`executing-plans`](skills/executing-plans/SKILL.md) — runs an existing plan with review checkpoints.
- [`test-driven-development`](skills/test-driven-development/SKILL.md) — red/green/refactor enforcement.
- [`systematic-debugging`](skills/systematic-debugging/SKILL.md) — root-cause-first debugging process.
- [`verification-before-completion`](skills/verification-before-completion/SKILL.md) — requires running verification commands and confirming output before claiming success.
- [`finishing-a-development-branch`](skills/finishing-a-development-branch/SKILL.md) — structured merge / PR / cleanup decisions at end of work.

### Collaboration

- [`requesting-code-review`](skills/requesting-code-review/SKILL.md) — produces review-ready output.
- [`receiving-code-review`](skills/receiving-code-review/SKILL.md) — disciplined response to review feedback; no performative agreement.
- [`subagent-driven-development`](skills/subagent-driven-development/SKILL.md) — orchestrates implementation work across subagents.
- [`dispatching-parallel-agents`](skills/dispatching-parallel-agents/SKILL.md) — splits independent tasks across parallel agents.

### Infrastructure

- [`using-git-worktrees`](skills/using-git-worktrees/SKILL.md) — sets up isolated workspaces for feature work.
- [`writing-skills`](skills/writing-skills/SKILL.md) — meta-skill for creating and adversarially testing new skills.

## Local setup

This repo is for clone-and-link installation, not marketplace distribution. The exact mechanism varies by harness:

```bash
git clone https://github.com/kellenff/snowball.git ~/Projects/snowball
```

Then install into each harness:

- **Claude Code** — register the repo as a local marketplace via `/plugin marketplace add /path/to/snowball` and install with `/plugin install snowball@snowball-dev` (the marketplace name is set in [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json)). Then run `/reload-plugins`. The hook in [`hooks/hooks.json`](hooks/hooks.json) fires at every `SessionStart`, `/clear`, and `/compact`.
- **OpenCode** — see [`docs/README.opencode.md`](docs/README.opencode.md). The plugin auto-registers its skills path via [`.opencode/plugins/snowball.js`](.opencode/plugins/snowball.js); no manual symlink is needed.
- **Cursor, Codex, Gemini CLI, Copilot CLI** — follow each harness's plugin documentation, pointing at this repo's matching manifest (`.cursor-plugin/plugin.json`, `.codex-plugin/plugin.json`, `gemini-extension.json`, `.claude-plugin/plugin.json`).
- **GitLab Duo** — see [`docs/README.gitlab-duo.md`](docs/README.gitlab-duo.md) for the full install paths. Short version: from inside a target project, run [`scripts/install-into-project.sh`](scripts/install-into-project.sh) from this clone — it symlinks `AGENTS.md`, creates per-skill symlinks under `skills/<name>/` (so the project can keep its own `skills/<custom>/` alongside Snowball's), and generates `.gitlab/duo/hooks.json` with the absolute Snowball path patched in. The script auto-detects the Snowball clone from its own path and the target from `$PWD`, so no hard-coded locations. The using-snowball framing directs agents to prefer project-defined skills over Snowball-shipped defaults when both could apply. Duo CLI users still need to launch with `--enable-project-hooks` for the SessionStart hook to fire.
- **Windows specifics** — see [`docs/windows/`](docs/windows/). The polyglot [`hooks/run-hook.cmd`](hooks/run-hook.cmd) handles Windows automatically as long as bash is reachable (Git for Windows, MSYS2, Cygwin, or PATH).

Updating after a `git pull`:

```bash
cd ~/Projects/snowball
git pull
# In Claude Code: /reload-plugins
```

Version bumps across the six manifests (Claude, Codex, Cursor, OpenCode, Gemini, marketplace) are driven by [`scripts/bump-version.sh`](scripts/bump-version.sh) reading [`.version-bump.json`](.version-bump.json).

## Pointers

- [`AGENTS.md`](AGENTS.md), [`GEMINI.md`](GEMINI.md) — per-harness context files. (No `CLAUDE.md` in this fork; see "Known stale or broken".)
- [`docs/testing.md`](docs/testing.md) — what each test grouping under `tests/` covers and how to run it.
- [`docs/README.opencode.md`](docs/README.opencode.md) — OpenCode-specific setup and behavior notes.
- [`docs/README.gitlab-duo.md`](docs/README.gitlab-duo.md) — GitLab Duo install paths (in-repo and cross-project), CLI hook activation, troubleshooting.
- [`docs/windows/`](docs/windows/) — Windows-specific install and bootstrap notes.
- [`docs/snowball/specs/`](docs/snowball/specs/), [`docs/snowball/plans/`](docs/snowball/plans/), [`docs/plans/`](docs/plans/) — historical design specs and implementation plans inherited from upstream.
- [`RELEASE-NOTES.md`](RELEASE-NOTES.md) — upstream release history through v5.1.0.
- `.claude/grfp/` — the four reports (deep-dive, crystal-ball, think-tank, brain-jam) that produced this README.

## License and attribution

MIT, inherited from upstream. See [`LICENSE`](LICENSE).

Snowball is a fork of [`obra/superpowers`](https://github.com/obra/superpowers) by Jesse Vincent and the team at [Prime Radiant](https://primeradiant.com). All skill content, the bootstrap design, and the multi-harness adapter pattern originate there. This fork exists for personal maintenance; substantive credit belongs upstream.
