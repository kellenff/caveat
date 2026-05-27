---
title: What to do about the existing triplicated entries in observations.jsonl
status: accepted
date: '2026-05-27T04:47:23.722Z'
deciders:
  - kellen
snowball:
  schema_version: '1.0'
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: 46ef8433-7370-4918-9bd2-b7814b013497
  source_event_id: toolu_01MxodMh64pL8ohZgJXogbb8
  supersedes: null
  tags:
    - ambient
---

# What to do about the existing triplicated entries in observations.jsonl

## Context and Problem Statement

Question category: Backfill.

## Considered Options

- **Leave them; only prevent future dupes** — Scope this spec to the new behavior. Existing dupes are a one-time artifact you can clean up manually whenever. Keeps the change focused. (Recommended)
- **Add a one-shot dedup pass** — Include a script in this work that rewrites observations.jsonl in place, keeping only the first occurrence of each (session_id, timestamp, content) tuple. Useful if you want the file clean now.
- **Skip dedup but document the cause** — Investigate why the Stop hook fired 3× for one session, document the root cause in the spec, but don't clean the file. Useful if you want to understand the bug before deciding.

## Decision Outcome

Chose **Leave them; only prevent future dupes**. Scope this spec to the new behavior. Existing dupes are a one-time artifact you can clean up manually whenever. Keeps the change focused. (Recommended)
