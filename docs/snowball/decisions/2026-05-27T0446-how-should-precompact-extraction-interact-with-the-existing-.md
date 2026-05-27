---
title: How should PreCompact extraction interact with the existing Stop-hook extraction
status: accepted
date: '2026-05-27T04:46:08.958Z'
deciders:
  - kellen
snowball:
  schema_version: '1.0'
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: 46ef8433-7370-4918-9bd2-b7814b013497
  source_event_id: toolu_01VCt6RW1UrZw6YZeL1c4teJ
  supersedes: null
  tags:
    - ambient
---

# How should PreCompact extraction interact with the existing Stop-hook extraction

## Context and Problem Statement

Question category: Coexistence.

## Considered Options

- **Both, with checkpointing** — PreCompact extracts everything since last checkpoint and records a cursor (e.g. last transcript line index or timestamp). Stop extracts only what's after the cursor. No duplicates, no gaps. (Recommended)
- **PreCompact replaces Stop** — Only PreCompact runs. If a session ends without compacting, observations from short sessions are lost — but we avoid the dedup problem entirely.
- **Both, dedup after the fact** — Both fire independently against the full transcript each time. Appender dedupes by content hash / (session_id, timestamp, content) tuple before writing. Simpler control flow, more work for the appender.
- **Both, no dedup** — Both fire, transcript is processed multiple times, duplicates accepted. Cheapest to build but compounds the existing dup problem visible in your observations.jsonl today.

## Decision Outcome

Chose **Both, with checkpointing**. PreCompact extracts everything since last checkpoint and records a cursor (e.g. last transcript line index or timestamp). Stop extracts only what's after the cursor. No duplicates, no gaps. (Recommended)
