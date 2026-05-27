---
title: Which compaction event are you targeting
status: accepted
date: '2026-05-27T04:45:48.680Z'
deciders:
  - kellen
snowball:
  schema_version: '1.0'
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: 46ef8433-7370-4918-9bd2-b7814b013497
  source_event_id: toolu_01Kvw9dgEUBPA3a57WHK7NxJ
  supersedes: null
  tags:
    - ambient
---

# Which compaction event are you targeting

## Context and Problem Statement

Question category: Compaction type.

## Considered Options

- **Auto-compaction (PreCompact)** — The harness's PreCompact hook fires before Claude Code auto-compacts when nearing context limits. Lets us extract observations from the about-to-be-summarized transcript.
- **Manual /compact too** — Same PreCompact hook, but also catches when the user explicitly runs /compact. (Both auto and manual fire PreCompact — this just confirms we want both paths covered.)
- **Every user-turn (continuous)** — Run extraction after each agent turn (Stop or SubagentStop) regardless of compaction state. Compaction stops being a concern because we're already up-to-date.

## Decision Outcome

Chose **Auto-compaction (PreCompact)**. The harness's PreCompact hook fires before Claude Code auto-compacts when nearing context limits. Lets us extract observations from the about-to-be-summarized transcript.
