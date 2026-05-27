---
name: decision-logging
description: Documents the snowball decision-logging schema and capture mechanism. This skill is reference documentation for the hook-driven decision capture system. Agents do not invoke this skill directly — hooks do the work. Use to look up MADR/JSONL schema, capture-mechanism enum values, or flannel ingestion contract.
---

# Decision Logging

Captures decisions made during snowball-driven Claude Code sessions, in two streams:

1. **Operator decisions** (high confidence) as MADR-compatible markdown at `<repo>/docs/snowball/decisions/<timestamp>-<slug>.md`.
2. **Agent observations** (lower confidence) as JSONL at `<repo>/docs/snowball/decisions/observations.jsonl`.

Designed for external consumers like flannel to ingest as Design Rationale data, and for future agents in the same repo to re-consume as operational context.

See `references/schema.md` for the schema contract.
See `docs/snowball/specs/2026-05-25-decision-logging-design.md` for the full design.

## Capture mechanisms

Three Claude Code hooks emit decisions automatically:

| Hook | Trigger | Produces |
|---|---|---|
| PostToolUse on `AskUserQuestion` | User picks an option from a structured prompt | One MADR per question-answer pair (`capture_mechanism: ask-user-question`) |
| UserPromptSubmit (pattern match) | User submits a free-text prompt matching an approval phrase | One MADR (`capture_mechanism: user-prompt-pattern`), deduped against recent `ask-user-question` captures |
| Stop → detached worker | Session ends | Headless `claude -p` extracts observations from the transcript; appends to `observations.jsonl` (`source: subagent`). |

All hooks no-op silently when the session is outside a git repo.

## Why hooks, not skill cross-references

Capture is passive: no existing skill needs modification, and operators don't need to remember to log decisions. The brainstorming, writing-plans, systematic-debugging, and code-review skills are untouched — they generate the events; the hooks observe them.

## Privacy notes

- The Stop-hook subagent reads the **full session transcript**. Same trust boundary as the main session, but operators in sensitive projects should review observations.jsonl entries before commit and consider `.gitignore`-ing the file.
- `observations.jsonl` and MADR files may contain file paths, code snippets, or API responses from the session.

## Flannel ingestion contract

Snowball commits to the schema in `references/schema.md` with `schema_version: "1.0"` for Phase 1. Additive changes bump minor; breaking changes bump major. Flannel scans known repo paths via its own filesystem-side configuration; snowball does not maintain a global registry.

## Phase 1 limitations

- Claude Code only — `AskUserQuestion` is harness-specific.
- Source-skill tag defaults to `ambient`; transcript-based skill detection is deferred to Phase 2.
- No manual `/log-decision` slash command yet.
- No `superseded` linkage automation — operators hand-edit.
- `capture_mechanism: stop-hook-subagent` is reserved in the schema for Phase 2 but not yet emitted; the Phase 1 worker only appends observations.

## For maintainers

The shipped artifacts in `scripts/*.cjs` are bundled outputs from `src/*.ts`. Don't edit `scripts/*.cjs` directly — edit the TS source and let the build regenerate.

```bash
# Build manually
bash scripts/build-decision-logging.sh

# Or rely on the pre-commit hook: editing src/*.ts auto-triggers the build
# and stages the regenerated bundles before each commit.
```

Bundled output uses Bun (`bun build --target=node --format=cjs`). Bun is a maintainer dependency only; consumers continue to invoke `node` against the committed bundles.
