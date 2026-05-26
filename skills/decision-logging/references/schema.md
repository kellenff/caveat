# Decision Logging Schema (version 1.0)

Snowball-committed contract for `<repo>/docs/snowball/decisions/` artifacts.

## MADR file format

Filename: `<ISO-timestamp-to-minute>-<slug>.md` (e.g. `2026-05-25T1430-spec-approved.md`).

```yaml
---
title: string
status: proposed | accepted | rejected | deprecated | superseded
date: ISO-8601 datetime with timezone
deciders: [string]
snowball:
  schema_version: "1.0"
  source: operator | agent
  confidence: high | medium | low
  capture_mechanism: ask-user-question | user-prompt-pattern | stop-hook-subagent | manual
  # stop-hook-subagent and manual are reserved for Phase 2 — not emitted by Phase 1 hooks.
  session_id: string
  source_event_id: string
  supersedes: filename | null
  tags: [string]                     # tags[0] required; see source-skill enum
---
```

`snowball.tags[0]` (required first tag): `brainstorming | writing-plans | systematic-debugging | code-review | ambient`
`snowball.tags[1..]`: freeform.

Body follows MADR conventions: `## Context and Problem Statement`, `## Considered Options`, `## Decision Outcome`, `## Consequences`, `## Links`. Only Context and Decision Outcome are required; others may be empty.

## Observation JSONL format

File: `<repo>/docs/snowball/decisions/observations.jsonl`. Append-only. One JSON object per line.

```json
{
  "schema_version": "1.0",
  "timestamp": "ISO-8601 datetime with timezone",
  "session_id": "string",
  "type": "observation | implementation-choice | hypothesis | constraint",
  "confidence": "high | medium | low",
  "source": "agent | subagent",
  "content": "string",
  "rationale": "string",
  "related_files": ["string"],
  "related_decision": "filename | null",
  "tags": ["string"]
}
```

All fields required; `related_files` and `related_decision` may be empty array / null respectively.

## Versioning

- `1.0` frozen at Phase 1 launch.
- Additive changes (new optional fields): bump to `1.1`.
- Breaking changes (remove fields, change enum semantics): bump to `2.0`.
