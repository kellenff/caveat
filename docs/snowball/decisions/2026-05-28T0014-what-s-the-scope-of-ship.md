---
title: What's the scope of "ship"
status: accepted
date: '2026-05-28T00:14:51.940Z'
deciders:
  - kellen
snowball:
  schema_version: '1.0'
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: 7b5ca525-b8b6-4d46-8338-5f22a57a5ab4
  source_event_id: toolu_01HfQ9LTvYMhRx7buHBKVhiN
  supersedes: null
  tags:
    - ambient
---

# What's the scope of "ship"

## Context and Problem Statement

Question category: Ship scope.

## Considered Options

- **Bump version files (5.1.0 → 5.2.0)** — Run scripts/bump-version.sh 5.2.0 to update all six declared files.
- **Add v5.2.0 entry to RELEASE-NOTES.md** — Summarize fork divergence since 5.1.0 (PreCompact extraction, Duo install, argdown skill, etc.).
- **Commit + tag v5.2.0** — Release commit on main, plus an annotated tag.
- **Push commit + tag to origin** — git push origin main && git push origin v5.2.0.

## Decision Outcome

Chose **Bump version files (5.1.0 → 5.2.0), Add v5.2.0 entry to RELEASE-NOTES.md, Commit + tag v5.2.0, Push commit + tag to origin**.
