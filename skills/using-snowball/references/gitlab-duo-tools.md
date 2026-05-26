# GitLab Duo Tool Mapping

Skills use Claude Code tool names. When you encounter these in a skill, use your GitLab Duo equivalent.

GitLab Duo discovers Snowball's skills automatically: any `skills/<name>/SKILL.md` at the repo root with frontmatter `name` + `description` is loaded as a [Duo Agent Skill](https://docs.gitlab.com/user/duo_agent_platform/customize/agent_skills/). To invoke a skill, follow Duo's slash-command convention (`/<skill-name>`) or reference the skill by name in your prompt.

| Skill references | GitLab Duo surface |
|------------------|--------------------|
| `Skill` tool (invoke a skill) | Slash command `/<skill-name>` (Agentic Chat / Duo CLI); skills are auto-discovered from `skills/<name>/SKILL.md` |
| `Read`, `Write`, `Edit` (file operations) | Duo's native file tools |
| `Bash` (run commands) | Duo CLI: native shell access. Agentic Chat / Flows: limited or unavailable depending on surface |
| `Grep`, `Glob` (search) | Duo's native code-search tools |
| `WebFetch` / `WebSearch` | Surface-dependent — Duo CLI exposes web access; check your surface's tool list |
| `Task` tool (dispatch subagent) | [Agent Platform Flows](https://docs.gitlab.com/user/duo_agent_platform/flows/) for delegated work; no direct equivalent inside a single chat session |
| `TodoWrite` (task tracking) | No native equivalent — track in chat or via GitLab issues |
| `EnterPlanMode` / `ExitPlanMode` | No equivalent — stay in the main session |

## Surface differences

GitLab Duo exposes Snowball through multiple surfaces; the tool surface varies:

| Duo surface | Reads `AGENTS.md` | Reads `skills/<name>/SKILL.md` | Runs `.gitlab/duo/hooks.json` |
|-------------|-------------------|-------------------------------|-------------------------------|
| Duo Agentic Chat | yes | yes | no |
| Agent Platform Flows | yes (except Code Review Flow) | yes | no |
| Duo CLI (`glab duo cli` or `duo`) | yes | yes | yes, when launched with `--enable-project-hooks` (or `GITLAB_ENABLE_PROJECT_HOOKS=true`) |
| Duo Chat (basic) | limited | no | no |
| Code Suggestions (inline) | no | no | no |

For the dynamic SessionStart bootstrap (injecting the `using-snowball` framing per session), only the Duo CLI surface runs the hook. On other surfaces, the static [`AGENTS.md`](../../../AGENTS.md) at the repo root carries the framing.

## Where to put new rules

- Repo-wide instructions Snowball ships → `AGENTS.md` at repo root.
- GitLab-only overrides a user wants on top of Snowball → `.gitlab/duo/chat-rules.md` (not shipped by Snowball; user-provided).
- New skills → `skills/<name>/SKILL.md` with frontmatter; auto-discovered by Duo.

Canonical docs:

- [AGENTS.md customization](https://docs.gitlab.com/user/duo_agent_platform/customize/agents_md/)
- [Custom rules (`chat-rules.md`)](https://docs.gitlab.com/user/duo_agent_platform/customize/custom_rules/)
- [Agent Skills (`SKILL.md`)](https://docs.gitlab.com/user/duo_agent_platform/customize/agent_skills/)
- [Duo CLI hooks](https://docs.gitlab.com/user/gitlab_duo_cli/)
