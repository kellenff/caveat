---
title: RELEASE-NOTES.md still reads "# Superpowers Release Notes". What header treatment
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

# RELEASE-NOTES.md still reads "# Superpowers Release Notes". What header treatment

## Context and Problem Statement

Question category: Notes header.

## Considered Options

- **Rename to Snowball (Recommended)** — Change to "# Snowball Release Notes" since this is the first fork release.
- **Leave as-is** — Keep upstream header as historical artifact.
- **Skip release notes entirely** — Just bump version numbers; defer the notes question.

## Decision Outcome

Chose **Rename to Snowball (Recommended)**. Change to "# Snowball Release Notes" since this is the first fork release.
