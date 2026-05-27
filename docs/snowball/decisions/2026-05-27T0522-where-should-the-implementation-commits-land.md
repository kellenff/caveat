---
title: Where should the implementation commits land
status: accepted
date: '2026-05-27T05:22:16.601Z'
deciders:
  - kellen
snowball:
  schema_version: '1.0'
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: 46ef8433-7370-4918-9bd2-b7814b013497
  source_event_id: toolu_01BV42Vyj63ZKQvLjJuLaDVX
  supersedes: null
  tags:
    - ambient
---

# Where should the implementation commits land

## Context and Problem Statement

Question category: Branch strategy.

## Considered Options

- **New feature branch (recommended)** — Create `feat/precompact-observation-extraction` off main, commit there, open a PR when done. Matches snowball's recent worktree-based workflow.
- **Worktree via snowball skill** — Invoke snowball:using-git-worktrees to create a fully isolated worktree. Heavier but most aligned with the snowball default workflow.
- **Just keep going on main** — Explicit consent to commit straight to main. Fine for solo dev on a personal fork.

## Decision Outcome

Chose **New feature branch (recommended)**. Create `feat/precompact-observation-extraction` off main, commit there, open a PR when done. Matches snowball's recent worktree-based workflow.
