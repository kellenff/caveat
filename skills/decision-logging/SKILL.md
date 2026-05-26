---
name: decision-logging
description: Documents the snowball decision-logging schema and capture mechanism. This skill is reference documentation for the hook-driven decision capture system. Agents do not invoke this skill directly — hooks do the work. Use to look up MADR/JSONL schema, capture-mechanism enum values, or flannel ingestion contract.
---

# Decision Logging

Captures operator decisions (high confidence) as MADR markdown and agent observations (lower confidence) as append-only JSONL, in `<repo>/docs/snowball/decisions/`. Written automatically by hooks during snowball-driven Claude Code sessions.

See `references/schema.md` for the schema contract.
See `docs/snowball/specs/2026-05-25-decision-logging-design.md` for the design.
