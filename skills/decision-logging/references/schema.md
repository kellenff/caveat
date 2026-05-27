# Decision Logging Schema (version 1.1)

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
  schema_version: "1.0" | "1.1"
  source: operator | agent
  confidence: high | medium | low
  capture_mechanism: ask-user-question | user-prompt-pattern | stop-hook-subagent | manual
  # stop-hook-subagent and manual are reserved for Phase 2 — not emitted by Phase 1 hooks.
  session_id: string
  source_event_id: string
  supersedes: filename | null
  tags: [string]                     # tags[0] required; see source-skill enum
  argdown_path: string | null        # v1.1 only — relative path to sibling .argdown
  argdown_root_label: string | null  # v1.1 only — conclusion node label inside argdown_path
---
```

`snowball.tags[0]` (required first tag): `brainstorming | writing-plans | systematic-debugging | code-review | ambient`
`snowball.tags[1..]`: freeform.

Body follows MADR conventions: `## Context and Problem Statement`, `## Considered Options`, `## Decision Outcome`, `## Consequences`, `## Links`. Only Context and Decision Outcome are required; others may be empty.

## Observation JSONL format

File: `<repo>/docs/snowball/decisions/observations.jsonl`. Append-only. One JSON object per line.

```json
{
  "schema_version": "1.0" | "1.1",
  "timestamp": "ISO-8601 datetime with timezone",
  "session_id": "string",
  "type": "observation | implementation-choice | hypothesis | constraint",
  "confidence": "high | medium | low",
  "source": "agent | subagent",
  "content": "string",
  "rationale": "string",
  "related_files": ["string"],
  "related_decision": "filename | null",
  "tags": ["string"],
  "argdown_ref": { "path": "string", "node_label": "string" }
}
```

Required fields: `schema_version`, `timestamp`, `session_id`, `type`, `confidence`, `source`, `content`, `rationale`, `related_files`, `related_decision`, `tags`. `related_files` and `related_decision` may be empty array / null respectively.

`argdown_ref` (v1.1, optional) — when present, points at a node label inside a sibling `.argdown` file. Both `path` and `node_label` are required when the field is present; omit the field entirely if no argdown graph is attached. Consumers that don't render argument graphs may ignore this field.

## Versioning

- `1.0` frozen at Phase 1 launch.
- `1.1` adds optional `snowball.argdown_path`, `snowball.argdown_root_label` (MADR) and optional `argdown_ref` (observations). Consumers that ignore unknown fields remain compatible.
- Additive changes (new optional fields): bump minor.
- Breaking changes (remove fields, change enum semantics): bump to `2.0`.

## v1.1 additions

The `1.1` bump is purely additive — every field added is optional, and v1.0 documents continue to parse. The new fields exist to give downstream Design Rationale consumers a parseable handle on the argument structure behind a decision:

- `snowball.argdown_path` — relative path (from the MADR file) to a sibling `.argdown` document.
- `snowball.argdown_root_label` — the `[Label]` of the conclusion node inside that file, so consumers can locate the recommended option without parsing the full graph.
- `argdown_ref` on an observation — pins the observation to a specific node label inside a referenced graph.

**When to claim `schema_version: "1.1"`:** only when at least one of the v1.1 fields is populated. Phase 1 hooks continue to emit `"1.0"` records and do not set the new fields. A future emitter (manual capture, or a Phase 2 hook that recognizes argdown attachments) that writes any of the new fields claims `"1.1"`.

Producers of `.argdown` files should validate them with `node skills/structured-argumentation/scripts/validate-argdown.cjs <path>` before referencing them from a MADR.
