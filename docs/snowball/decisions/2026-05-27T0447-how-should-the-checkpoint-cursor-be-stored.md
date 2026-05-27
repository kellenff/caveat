---
title: How should the checkpoint cursor be stored
status: accepted
date: '2026-05-27T04:47:01.172Z'
deciders:
  - kellen
snowball:
  schema_version: '1.0'
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: 46ef8433-7370-4918-9bd2-b7814b013497
  source_event_id: toolu_01SYkmz6p3NguxnxFZMKwGbh
  supersedes: null
  tags:
    - ambient
---

# How should the checkpoint cursor be stored

## Context and Problem Statement

Question category: Cursor design.

## Considered Options

- **Per-session file in ~/.snowball/** — e.g. ~/.snowball/checkpoints/<session_id>.cursor containing the last-processed transcript line index. Mirrors the existing ~/.snowball/decision-logging.log convention. Per-session files avoid lock contention; old cursors can be reaped lazily. (Recommended)
- **Scan observations.jsonl for max line/timestamp** — No separate state. On each run, read observations.jsonl, find the highest processed transcript line for this session_id (we'd need to record it in each observation). Self-contained, but slower and couples schema to checkpoint logic.
- **Per-repo checkpoint in .snowball/** — Checkpoint lives inside the repo at .snowball/checkpoints/<session_id>.cursor. Closer to the observations file, but adds a new in-repo directory to gitignore.

## Decision Outcome

Chose **Per-session file in ~/.snowball/**. e.g. ~/.snowball/checkpoints/<session_id>.cursor containing the last-processed transcript line index. Mirrors the existing ~/.snowball/decision-logging.log convention. Per-session files avoid lock contention; old cursors can be reaped lazily. (Recommended)
