---
title: >-
  Local repo git config is `test / test@example.com` (global is your real identity). How should I author the release
  commit + tag
status: accepted
date: '2026-05-28T00:33:06.343Z'
deciders:
  - kellen
snowball:
  schema_version: '1.0'
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: 7b5ca525-b8b6-4d46-8338-5f22a57a5ab4
  source_event_id: toolu_01NQcnk3MRK5pzk12rNwBUbP
  supersedes: null
  tags:
    - ambient
---

# Local repo git config is `test / test@example.com` (global is your real identity). How should I author the release commit + tag

## Context and Problem Statement

Question category: Commit author.

## Considered Options

- **Pass --author flag explicitly (Recommended)** — Use git commit --author='Kellen Frodelius-Fujimoto <kellen@kellenfujimoto.com>' and tag with -u/--local-user equivalent. Leaves local config untouched.
- **Let me fix the local config first** — You'll run `git config user.name ...` yourself, then I'll commit.
- **Commit as test/test@example.com** — Use whatever the current local config produces (likely wrong attribution on a release tag).

## Decision Outcome

Chose **Pass --author flag explicitly (Recommended)**. Use git commit --author='Kellen Frodelius-Fujimoto <kellen@kellenfujimoto.com>' and tag with -u/--local-user equivalent. Leaves local config untouched.
