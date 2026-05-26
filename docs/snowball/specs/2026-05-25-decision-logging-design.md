# Decision Logging for External Consumption

**Date:** 2026-05-25
**Status:** Draft
**Scope:** Claude Code only (Phase 1)
**Primary consumer:** flannel (`/Users/kellen/Projects/flannel`)

## Problem

Snowball-mediated work produces a continuous stream of decisions — operator approvals during brainstorming, design forks chosen mid-plan, root causes confirmed during debugging, code review verdicts, and agent observations during execution. None of this is persisted in a structured, externally consumable form. Future agents working in the same repo have to re-derive context from git history and prose. External consumers like flannel — whose evidence base treats Design Rationale (DR) capture as a load-bearing primitive — have no machine-readable surface to ingest.

Two consequences:

1. **Operational loss.** Future sessions in a project re-deliberate decisions that were already made. The auto-memory system (`~/.claude/projects/<encoded>/memory/`) captures *some* context but is scoped to continuity, not external consumption.
2. **Research loss.** Flannel's framing (per `part_5_comprehension_empirical_base.md`) is that LLMs are high-recall, low-precision on architectural reasoning — useful for generating candidate rationales, not authoritative. The empirical case for that framing needs real-world decision data, structured into authoritative-operator and candidate-agent layers. Without instrumentation, the data doesn't exist.

Decision logging closes both gaps with one artifact: an MADR-shaped log in `<repo>/docs/snowball/decisions/`, written by hooks during normal snowball-driven work.

## Goals

1. Persist operator decisions (high confidence) in MADR-compatible markdown for human and agent re-consumption.
2. Persist agent observations and implementation choices (lower confidence) in an append-only JSONL stream for research ingestion.
3. Make capture passive — no skill-by-skill modifications, no operator discipline required to log entries; hooks fire automatically at known checkpoints.
4. Commit logs to the target repo's git history so the artifact is durable and reviewable.
5. Provide flannel a stable schema contract with versioning.

## Non-Goals

- **Cross-harness support.** Phase 1 is Claude Code only. The mechanism leans on `AskUserQuestion` (Claude Code-specific) and Claude Code hook events. Other harnesses are out of scope until Phase 2.
- **A flannel ingester.** This spec defines the producer side. Flannel reads filesystem paths directly; its scanner is its own concern.
- **Decision lifecycle automation.** `superseded`/`deprecated` linkage is supported in the schema but not auto-emitted. Operators update status by hand.
- **Cross-session linking.** Same-session linking via `session_id` is supported. Cross-session correlation is flannel's job.
- **Multi-operator workflows.** `deciders` defaults to a single entry. Multi-operator concurrency is out of scope.
- **A global decision registry.** Logs are per-repo. There's no `~/.snowball/projects-with-decisions.json` index.

## Design Principles

### Two streams, two ceremonies

Operator decisions are sparse and high-ceremony (a few per project per week). Agent observations are dense and low-ceremony (dozens per session). Forcing both into the same file shape distorts one or the other. Two formats — one MADR file per operator decision plus one rolling JSONL stream for observations — matches the volume and ceremony of each layer.

### MADR-compatible, not MADR-pure

MADR is the consume-rather-than-rebuild surface flannel's P65 names. Decision files are valid MADR markdown for any MADR-aware tool. Snowball extensions (source, confidence, capture_mechanism, session_id, source_event_id) live under a `snowball:` namespace key in frontmatter so they don't collide with MADR's standard field set.

### Snowball convention over MADR convention

Where MADR and snowball conventions conflict, snowball wins. Specifically:

- **Path:** `<repo>/docs/snowball/decisions/`, not MADR-canonical `docs/decisions/`. Matches existing `docs/snowball/specs/`, `docs/snowball/plans/`.
- **Filenames:** `YYYY-MM-DDTHHMM-<slug>.md`, not MADR-canonical `NNNN-title.md`. Matches snowball's date-prefixed convention and dodges worktree collision.
- **Root detection:** `git rev-parse --show-toplevel`, matching the existing convention in `using-git-worktrees`, `finishing-a-development-branch`, `requesting-code-review`.

### Hooks do the work; the skill documents the contract

`skills/decision-logging/SKILL.md` is the canonical reference for schema, capture mechanism, and ingestion contract. The actual capture happens in hook handlers. Existing skills (brainstorming, writing-plans, systematic-debugging, code-review) are not modified — they generate the events that hooks detect.

### Best-effort agent stream

The agent observation stream is enrichment, not session-critical. If the Stop hook's extraction subagent fails, observations.jsonl is unchanged and the user is not interrupted. The in-session MADR captures happened synchronously and stand on their own.

## Architecture

```
┌─────────────────────────── Claude Code session ────────────────────────────┐
│                                                                            │
│   Agent ── AskUserQuestion ──> User                                        │
│                  │                                                         │
│                  └─ PostToolUse hook ───┐                                  │
│                                          │                                 │
│   User ── free-text approval ─────────> Agent                              │
│                  │                                                         │
│                  └─ UserPromptSubmit hook (pattern match) ─┐               │
│                                                             │              │
│   Session ends ──> Stop hook ──fork──> detached worker ──> │              │
│                                        headless claude -p   │              │
│                                        (reads transcript)   │              │
│                                                        │    │              │
│                                                        ▼    ▼              │
│                    skills/decision-logging/scripts/write-madr.cjs          │
│                    skills/decision-logging/scripts/append-observation.cjs  │
│                                                        │    │              │
└────────────────────────────────────────────────────────┼────┼──────────────┘
                                                         ▼    ▼
                                            <target-repo>/docs/snowball/decisions/
                                              ├── 2026-05-25T1430-spec-approved.md
                                              ├── 2026-05-25T1612-root-cause-cache.md
                                              └── observations.jsonl
                                                         │
                                                         └─> consumed by flannel
                                                             and future agents in repo
```

Three components: the skill (documentation + writer scripts + extraction prompt), three hook handlers (two synchronous in-session, one async on Stop), two output artifacts (MADR files and observations.jsonl).

## Components

### `skills/decision-logging/`

```
skills/decision-logging/
├── SKILL.md                         # protocol/schema reference
├── scripts/
│   ├── write-madr.cjs               # writes a MADR file from structured stdin
│   ├── append-observation.cjs       # validates + appends a JSONL line
│   ├── approval-phrases.cjs         # exported APPROVAL_PHRASES list
│   ├── extract-observations.md      # subagent prompt
│   ├── on-ask-user-question.sh      # PostToolUse handler
│   ├── on-user-prompt.sh            # UserPromptSubmit handler
│   ├── on-stop.sh                   # Stop handler (forks extract-worker)
│   └── extract-worker.sh            # detached background worker for transcript extraction
└── references/
    └── schema.md                    # versioned schema reference (1.0)
```

Node is already a snowball dependency (`brainstorming/scripts/server.cjs`), so the writer scripts can be CommonJS without adding a new runtime. The shell handlers are thin: parse hook stdin, shell out to Node writers.

### Hook registration

Added to `hooks/hooks.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "AskUserQuestion",
        "hooks": [{
          "type": "command",
          "command": "\"${CLAUDE_PLUGIN_ROOT}/skills/decision-logging/scripts/on-ask-user-question.sh\"",
          "async": false
        }]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [{
          "type": "command",
          "command": "\"${CLAUDE_PLUGIN_ROOT}/skills/decision-logging/scripts/on-user-prompt.sh\"",
          "async": false
        }]
      }
    ],
    "Stop": [
      {
        "hooks": [{
          "type": "command",
          "command": "\"${CLAUDE_PLUGIN_ROOT}/skills/decision-logging/scripts/on-stop.sh\"",
          "async": false
        }]
      }
    ]
  }
}
```

Existing SessionStart hook is unchanged.

## Schemas

### MADR file (`<timestamp>-<slug>.md`)

```yaml
---
# MADR standard fields
title: "Choose two-tier storage for decision logs"
status: accepted
date: 2026-05-25T14:30:00-07:00
deciders: [kellen]

# Snowball extensions
snowball:
  schema_version: "1.0"
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: "abc-123-def"
  source_event_id: "tooluse-42"
  supersedes: null
  tags: [brainstorming, architecture]
---

# Choose two-tier storage for decision logs

## Context and Problem Statement
<brief framing from the surrounding context>

## Considered Options
- **Two-tier** — MADR + observations.jsonl
- **Uniform MADR** — every event a file
- **Single rolling log** — append-only markdown
- **Decisions only** — no observation stream

## Decision Outcome
Chose **Two-tier**. Format matches ceremony level.

## Consequences
- Two formats to parse (acceptable for flannel)
- MADR dir stays clean for human readers
- observations.jsonl can grow without polluting decision-file diffs

## Links
- Spec: `docs/snowball/specs/2026-05-25-decision-logging-design.md`
```

**Closed enums:**

- `status`: `proposed | accepted | rejected | deprecated | superseded` (Phase 1 hooks always emit `accepted`)
- `snowball.source`: `operator | agent`
- `snowball.confidence`: `high | medium | low`
- `snowball.capture_mechanism`: `ask-user-question | user-prompt-pattern | stop-hook-subagent | manual`
- `snowball.tags[0]` (required first tag): `brainstorming | writing-plans | systematic-debugging | code-review | ambient`
- `snowball.tags[1..]`: freeform

**Body structure:** MADR-canonical sections. `Considered Options`, `Pros and Cons`, and `Links` are optional. PostToolUse-emitted MADRs may have only `Context and Problem Statement` + `Decision Outcome` from a structured Q+A; richer bodies come from operator hand-editing or from the stop-hook subagent's transcript reconstruction.

### Observation JSONL line

```json
{
  "schema_version": "1.0",
  "timestamp": "2026-05-25T14:30:45-07:00",
  "session_id": "abc-123-def",
  "type": "observation",
  "confidence": "medium",
  "source": "subagent",
  "content": "Detected that the cache invalidation key uses timestamp instead of content hash — likely contributor to the staleness reported in tests.",
  "rationale": "Saw the agent investigate cache.ts after the test failure and pivot to fixing the key generation. Confirmed by the eventual fix.",
  "related_files": ["src/cache.ts", "test/cache.test.ts"],
  "related_decision": null,
  "tags": ["systematic-debugging", "caching"]
}
```

**Closed enums:**

- `type`: `observation | implementation-choice | hypothesis | constraint`
- `confidence`: `high | medium | low`
- `source`: `agent | subagent` (Phase 1 hooks always emit `subagent`)
- `tags[0]`: same source-skill enum as MADR

**Field discipline:**

- `content` is the observation itself.
- `rationale` is the transcript-grounded justification — what the subagent saw that supports the observation. Required. This is the audit hook for flannel.
- `related_files` is optional; populated when the subagent can identify file paths in the transcript context for this observation.
- `related_decision` is optional; populated when the observation arose in the context of a specific MADR (e.g., during brainstorming for a particular decision).

## Hook handlers

### `on-ask-user-question.sh` (PostToolUse, sync)

```
1. git_root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
2. Read hook stdin (PostToolUse payload): tool_input.questions, tool_response.answers, tool_use_id, session_id
3. For each (question, answer) pair:
     a. Determine source-skill tag by scanning the last 50 transcript messages for the most recent Skill tool invocation; if none found within that window, use `ambient`
     b. Invoke write-madr.cjs with structured input
4. Exit 0 on success or any handled error
```

`write-madr.cjs` receives JSON on stdin with all fields needed to assemble frontmatter and body. The structured Q+A produces a complete MADR with title, options, and decision outcome filled in.

### `on-user-prompt.sh` (UserPromptSubmit, sync)

```
1. git_root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
2. Read prompt text from stdin (UserPromptSubmit payload: user_message)
3. Match prompt (case-insensitive) against APPROVAL_PHRASES; exit 0 if no match
4. Dedup check:
     a. Find the MADR file with the most recent timestamp in docs/snowball/decisions/
     b. If it was written less than 60 seconds ago AND its capture_mechanism is `ask-user-question`, treat this prompt as a redundant ratification of that decision; exit 0
     c. Otherwise proceed (the approval refers to a different proposal, e.g. an agent's free-text design suggestion)
5. Read recent transcript for the agent's most recent proposal/question to use as decision context
6. Invoke write-madr.cjs with capture_mechanism=user-prompt-pattern
7. Exit 0
```

**APPROVAL_PHRASES** (defined in `approval-phrases.cjs`):

```js
module.exports = [
  "lgtm",
  "looks good",
  "ship it",
  "approved",
  "approve",
  "go ahead",
  "let's do that",
  "yes do that",
  "merge it",
  "do it",
];
```

Match policy: the prompt is one of these phrases (exactly, case-insensitive) OR starts with one followed by whitespace or punctuation. Deliberately excludes bare `yes/yeah/ok/sure/i agree` to keep false positives low.

### `on-stop.sh` (Stop, detaches a background worker)

```
1. git_root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
2. Read session metadata from stdin (capture session_id, project_dir)
3. Fork a detached extraction worker:
     nohup bash "${CLAUDE_PLUGIN_ROOT}/skills/decision-logging/scripts/extract-worker.sh" \
       "$session_id" "$git_root" \
       >> ~/.snowball/decision-logging.log 2>&1 &
     disown
4. Exit 0 immediately so Stop returns fast
```

The detached worker (`extract-worker.sh`) does the real work:

```
1. Locate transcript at ~/.claude/projects/<encoded>/<session_id>.jsonl
2. Dispatch headless extraction:
     claude -p \
       --append-system-prompt "$(cat scripts/extract-observations.md)" \
       --output-format text \
       < transcript.jsonl
3. Parse output as JSONL; for each valid line, invoke append-observation.cjs
4. On any error, log to ~/.snowball/decision-logging-errors.log

The `capture_mechanism: stop-hook-subagent` enum value is reserved for Phase 2, where the worker will also be allowed to write MADRs for operator decisions the in-session hooks missed. Phase 1's worker only appends observations.
```

This explicit `nohup ... & disown` pattern means the design doesn't depend on whether the hook framework respects an `async: true` field. The Stop hook returns within milliseconds; extraction runs out-of-band.

### Subagent prompt (`extract-observations.md`)

Stored as a static markdown file so it's version-controlled and reviewable. Outline:

> You are reviewing a Claude Code session transcript. Extract agent observations, implementation choices, hypotheses, and discovered constraints into JSONL lines matching the schema below. Be high-recall and low-precision: capture candidate observations even when uncertain, and set `confidence` accordingly.
>
> Do NOT extract: routine tool calls, conversational filler, completed-task acks.
> DO extract: moments where the agent recognised a pattern, chose between alternatives without operator input, formed a hypothesis, or noticed a constraint.
>
> Each output line MUST be a single JSON object with all required schema fields. Populate `rationale` with the transcript evidence that supports the observation.
>
> Schema: <inlined>
> Transcript: <piped via stdin>
>
> Output: one JSON object per line, nothing else.

## Operational concerns

### Failure modes

| Condition | Behavior |
|---|---|
| Not in a git repo | All hooks no-op silently |
| `docs/snowball/decisions/` doesn't exist | Hooks create it on first write |
| Writer script throws | Logged to `~/.snowball/decision-logging-errors.log`; hook exits 0 |
| Stop-hook `claude -p` times out or errors | Logged; observations.jsonl unchanged; session is not interrupted |
| Subagent returns malformed JSONL | Per-line parse: valid lines appended, invalid lines logged with raw payload |
| Concurrent worktree writes | Date-prefixed filenames make collisions vanishingly rare; observations.jsonl appends are line-buffered |
| `/clear` mid-session | SessionStart fires on `clear`; Stop may or may not. Missed extractions acceptable |
| Disk full | Write fails, logged, hook exits 0 |
| Hook fires inside snowball repo itself | Writes to snowball's own `docs/snowball/decisions/` — dogfooding |

### Privacy

- The Stop-hook subagent reads the full session transcript. This is the same trust boundary as the main session — no new exfiltration, but explicitly documented.
- `observations.jsonl` may contain file paths, code snippets, or API responses the agent saw during work. Operators should review the first few committed entries and `.gitignore` `observations.jsonl` for sensitive projects.
- The `claude -p` subagent invocation uses the same API auth as the main session.

### Performance

- **PostToolUse**: synchronous, ~50ms per write. Acceptable.
- **UserPromptSubmit**: synchronous, pattern match is cheap; transcript read happens only on match.
- **Stop**: the hook itself forks a detached worker and returns within milliseconds. The worker spends ~5-20¢ per session in API cost (one `claude -p` invocation over the transcript). Worth budgeting for high-volume use.

### Edge cases deferred

- Decision lifecycle automation (`superseded` linkage requires operator hand-edit)
- Cross-session correlation (flannel's job)
- MADR rename/refactor (operator-managed)
- Multi-operator capture
- Cross-harness emitters (Phase 2)

## Testing strategy

Three test groups under `tests/decision-logging/`:

1. **Writer-unit tests** (`tests/decision-logging/unit/`):
   - `write-madr.cjs` with canonical input → expected markdown
   - `append-observation.cjs` validates against schema; rejects malformed lines
   - Filename slug generation handles unicode, long titles, same-minute collisions

2. **Hook-integration tests** (`tests/decision-logging/hooks/`):
   - Synthetic PostToolUse payload with a known Q+A → expected MADR file
   - Synthetic UserPromptSubmit payload for each APPROVAL_PHRASES entry → matches; non-approval phrases → no-op
   - Dedup: PostToolUse + matching UserPromptSubmit in sequence → only one MADR written

3. **Extraction-subagent tests** (`tests/decision-logging/extraction/`):
   - Committed fixture transcripts → snapshot of observation JSONL output
   - Snapshot assertions on schema-validity and presence of key terms, not exact text (handles LLM variance)
   - Fixtures double as concrete examples for flannel's ingester design

Hook handlers are bash-thin and call into Node writers, so most logic lives in unit-testable Node code. Bash shims are tested by invoking them with `bash` and synthetic stdin payloads, following the pattern in `tests/` for existing snowball hooks.

## Flannel ingestion contract

Snowball commits to:

- **`schema_version`** present on every MADR frontmatter and every JSONL line. Frozen at `1.0` for Phase 1.
- **Versioning policy**: additive changes (new optional fields) bump to `1.1`; breaking changes (removing fields, changing enum semantics) bump to `2.0`.
- **Closed enums** documented in `skills/decision-logging/SKILL.md` and treated as part of the schema contract.
- **Discovery paths**: `<repo>/docs/snowball/decisions/<ISO-timestamp>-<slug>.md` and `<repo>/docs/snowball/decisions/observations.jsonl`. Flannel scans known repo paths from its own config.
- **No flannel adapter ships from snowball.** Flannel reads filesystem directly. Lifecycles are decoupled.
- **No global registry.** Snowball does not maintain `~/.snowball/projects-with-decisions.json`; flannel maintains its own scan-path configuration.

This matches flannel's P65 "consume rather than rebuild" posture for design-intent representations.

## Decisions made during brainstorming

Recorded inline so they survive into implementation review:

| Question | Choice | Why |
|---|---|---|
| Primary purpose | Research + operational (equal) | Drives toward layered design with both machine-readable and human-readable surfaces |
| Capture moments | All four streams (operator approvals + design forks; debugging; code review; agent observations) | Broad initial surface; volume mismatch handled by two-tier format |
| Storage | In-repo, MADR-style | Committed artifact, naturally reviewable; flannel reads via filesystem |
| Format | Two-tier (MADR + observations.jsonl) | Ceremony levels diverge; one format would distort one stream |
| Capture mechanism | Hook-driven (PostToolUse + UserPromptSubmit + Stop-hook subagent) | No skill modifications needed; passive capture; honest about high-recall/low-precision agent layer |
| Operator hook trigger | PostToolUse on `AskUserQuestion` + UserPromptSubmit pattern detection | Captures both structured Q+A and free-text approvals |
| Stop-hook analyzer | Subagent dispatched via headless `claude -p` | Uses session auth; runs in background; doesn't block session termination |
| Harness scope | Claude Code only, Phase 1 | Pragmatic; unblocks flannel ingestion fastest |
| Path | `docs/snowball/decisions/` | Snowball convention over MADR canonical `docs/decisions/` |
| Filename | `YYYY-MM-DDTHHMM-<slug>.md` | Snowball convention over MADR canonical sequential numbering; dodges worktree collisions |
| Tag structure | Hybrid: required source-skill enum first + optional freeform | Reliable aggregation primary key plus user flexibility |
| Observation types | Four: observation, implementation-choice, hypothesis, constraint | Distinct semantic categories that flannel can aggregate on |
| Approval phrases | Proposed list of 10; bare affirmations excluded | Keeps false-positive rate low |

## Phase 2 considerations (not in scope here)

- Cross-harness emitters (Cursor, OpenCode, Gemini CLI, Codex, Copilot CLI)
- Manual `/log-decision` slash command for moments the hooks miss
- Decision lifecycle automation (`superseded` auto-linkage when a new MADR addresses the same topic)
- Cross-session correlation tooling (flannel-side, but might benefit from a snowball-emitted session manifest)
- Per-repo configuration (`.snowball/decision-logging.toml` for tag taxonomies, capture toggles)
