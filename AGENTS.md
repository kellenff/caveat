# Snowball

This repository is [Snowball](https://github.com/kellenff/snowball), a skills library loaded into AI coding harnesses (Claude Code, Codex CLI, Cursor, OpenCode, Gemini CLI, GitHub Copilot CLI, GitLab Duo).

## Instruction priority

1. **User's explicit instructions** (this file, harness-specific context files, direct requests) — highest priority.
2. **Project-defined skills** — any `skills/<name>/SKILL.md` in this repository that is **not** a symlink into the Snowball clone. These represent intentional local overrides and win over Snowball's defaults.
3. **Snowball-shipped skills** — the skills bundled with Snowball (typically reached via symlink, installable via `scripts/install-into-project.sh`).
4. **Default system prompt** — lowest priority.

If a user instruction conflicts with a skill, follow the user. If a project-defined skill conflicts with a Snowball-shipped skill of the same name, follow the project's.

## Skills come first

Before responding to any non-trivial request, check `skills/` for a skill that matches the task. Skills live at `skills/<name>/SKILL.md`, each with frontmatter declaring its `name` and `description`. If a skill applies — even with low confidence — invoke it before answering.

The entry-point skill is [`skills/using-snowball/SKILL.md`](skills/using-snowball/SKILL.md). Read it first; it establishes the discipline of checking skills before acting and lists the full skill index.

## Tool-name mapping

Skills are authored against Claude Code's tool names. If your harness uses different names (Codex, Cursor, Gemini CLI, Copilot CLI, GitLab Duo, OpenCode), see the per-harness mapping under [`skills/using-snowball/references/`](skills/using-snowball/references/).
