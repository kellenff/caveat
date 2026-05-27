# PreCompact Observation Extraction

**Date:** 2026-05-26
**Status:** Draft
**Scope:** Claude Code only (extends Phase 1 of decision-logging)
**Builds on:** [`2026-05-25-decision-logging-design.md`](./2026-05-25-decision-logging-design.md)

## Problem

Today's `decision-logging` skill only extracts agent observations at session end (the `Stop` hook). When Claude Code auto-compacts a long session — summarizing the early transcript to free context window — the session continues, but the extraction worker only runs once, at the eventual `Stop`. Two failure modes follow:

1. **Re-processing on every Stop.** The Stop hook reads the full on-disk transcript each time it fires. The current `observations.jsonl` shows the symptom: five unique observations from one session, each duplicated three times. The session_id is identical across the triplicates and the wording varies slightly, indicating the extractor re-ran on the full transcript and `claude -p` produced non-deterministic output each pass.

2. **Loss-on-abandonment between compactions.** If a session compacts, continues, and is then terminated abnormally (kill, crash, lost terminal) before `Stop` fires, no observations are captured for that session at all. PreCompact is the last guaranteed-to-fire moment in a long session.

The decision-logging spec already names this stream as "best-effort enrichment, not session-critical." That framing remains. The fix is to make the best-effort path actually fire at every checkpoint, exactly once per transcript region.

## Goals

1. Extract observations at `PreCompact` in addition to `Stop`, so long sessions emit observations even when they don't terminate cleanly.
2. Guarantee each transcript region is processed by `claude -p` at most once, eliminating the duplicate-observation pattern visible in the current `observations.jsonl`.
3. Preserve crash-safety: a worker that dies mid-run must not advance the cursor, so the next event reprocesses that slice. At worst a duplicate; never a gap.
4. Preserve the existing invariant that decision-logging never breaks the user's session — all failure modes still exit 0 and log to `~/.snowball/decision-logging-errors.log`.

## Non-Goals

- **Backfilling the existing triplicated entries** in `observations.jsonl`. Out of scope; the operator can clean them up manually whenever. This spec prevents new duplicates.
- **Cleaning up cursor files.** Garbage collection of `~/.snowball/checkpoints/*.cursor` is deferred until accumulation is a measurable problem. A future cron / `find -mtime +30 -delete` is sufficient when needed.
- **Manual `/compact` slash command.** Claude Code fires `PreCompact` for both auto and manual compactions; no separate handling is needed. (Confirming behavior with the harness in implementation; spec assumes the documented behavior.)
- **Cross-harness support.** Same Phase 1 limitation as decision-logging: Claude Code only.
- **Changing the extraction prompt or the JSONL schema.** Capture timing changes only.

## Design

### Architecture

```text
Stop event ─────┐                  ┌─→ flock(session.lock, non-blocking)
                ├─→ extract-worker.sh ─→ read cursor (default 0)
PreCompact ─────┘                  │   slice transcript[cursor:end]
                                   │   claude -p < slice
                                   │   append-observation.cjs (cwd = git_root)
                                   │   write new cursor atomically
                                   └─→ release lock
```

Both hooks fork the same detached worker (`nohup ... & disown`). The worker reads a per-session line cursor, slices the transcript to only the unprocessed tail, pipes that slice to `claude -p`, appends the extracted observations, and atomically updates the cursor.

### Cursor mechanism

**Location:** `~/.snowball/checkpoints/<session_id>.cursor`

**Format:** Plain text — a single integer, the number of transcript lines already processed. Created on first run with content `0` (or absent, treated as `0`).

**Why line count, not timestamp:**

- Transcript JSONL is strictly append-only; line N always identifies the same turn.
- Timestamps in the transcript can have ties or skew across hook fires; line indices cannot.
- `wc -l` and `tail -n +N` are O(transcript size) but trivially correct.

**Update protocol:** Write to `${CURSOR}.tmp`, then `mv` it onto `${CURSOR}`. `mv` within the same directory on POSIX is atomic, so a partial cursor file cannot be observed by a concurrent reader.

### Locking

**File:** `~/.snowball/checkpoints/<session_id>.lock`

**Mechanism:** `flock -n` (non-blocking) on fd 9. If another worker holds the lock, the second worker exits 0 silently — the running worker will see the additional transcript lines when it iterates. This avoids serialized stalls when `PreCompact` and a subsequent event fire close together.

The non-blocking semantics are deliberate: PreCompact must return quickly so the harness can compact. The worker is detached and PreCompact-the-hook returns immediately regardless, but a holding-lock scenario shouldn't queue up backlog of workers either.

### Crash safety

- **Worker dies before claude returns:** Cursor untouched. Next event reprocesses the same slice. `claude -p` runs again; observations are re-appended. Duplicates possible only in this narrow failure mode — and the operator can detect them via identical content within a small time window.
- **Worker dies after claude returns, before append:** Cursor untouched. Same as above.
- **Worker dies after append, before cursor write:** Cursor untouched. Next event reprocesses, producing duplicates. Same caveat as above.
- **Cursor write succeeds but lock release fails:** Lock is released on process exit (`flock` is fd-based). Cannot orphan a lock.

The duplicate window is genuinely narrow (process killed in the few-second gap between append and atomic rename), and decision-logging is explicitly best-effort. Accepting this is correct.

### Backward compatibility

A missing cursor file is treated as cursor=0, so the worker's first run on any pre-existing session processes the whole transcript — matching today's behavior. No migration needed.

### Files to add and modify

**New:**

- `skills/decision-logging/scripts/on-pre-compact.sh` — detached fork of `extract-worker.sh`. Structurally identical to `on-stop.sh`: read session_id from stdin payload, validate git root, `nohup` the worker, exit 0.

**Modified:**

- `skills/decision-logging/scripts/extract-worker.sh` — gains cursor read, transcript slicing, `flock`, atomic cursor write. Accepts the same `(SESSION_ID, GIT_ROOT)` args as today.
- `hooks/hooks.json` — register `PreCompact` → `on-pre-compact.sh`.
- `.gitlab/duo/hooks.json` — mirror the same registration (GitLab Duo install path).
- `skills/decision-logging/SKILL.md` — add `PreCompact` row to the capture-mechanisms table; brief paragraph on compaction-resilience.

**Not touched:**

- `append-observation.cjs` / `append-observation.ts` — the appender doesn't know about cursors.
- `extract-observations.md` — the LLM prompt is unchanged. It receives a partial transcript instead of the whole thing; the prompt's framing ("extract observations from this transcript") is correct either way.
- `references/schema.md` — schema is unaffected.

### Worker pseudo-code

```bash
#!/usr/bin/env bash
set -uo pipefail

SESSION_ID="$1"
GIT_ROOT="$2"

CHECKPOINT_DIR="$HOME/.snowball/checkpoints"
mkdir -p "$CHECKPOINT_DIR"
LOCK="$CHECKPOINT_DIR/${SESSION_ID}.lock"
CURSOR="$CHECKPOINT_DIR/${SESSION_ID}.cursor"
ERROR_LOG="$HOME/.snowball/decision-logging-errors.log"

CLAUDE_BIN="${SNOWBALL_CLAUDE_BIN:-claude}"

# Encode project path the way Claude Code stores transcripts
ENCODED="-$(echo "$GIT_ROOT" | sed 's|^/||; s|/|-|g')"
TRANSCRIPT="$HOME/.claude/projects/$ENCODED/$SESSION_ID.jsonl"

if [ ! -f "$TRANSCRIPT" ]; then
  echo "[$(date)] transcript not found: $TRANSCRIPT" >>"$ERROR_LOG"
  exit 0
fi

exec 9>"$LOCK"
flock -n 9 || exit 0   # another worker holds the lock; bail silently

PROCESSED=$(cat "$CURSOR" 2>/dev/null || echo 0)
TOTAL=$(wc -l <"$TRANSCRIPT" | tr -d ' ')

if [ "$TOTAL" -le "$PROCESSED" ]; then
  exit 0   # nothing new
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SYSTEM_PROMPT=$(cat "$SCRIPT_DIR/extract-observations.md")
APPENDER="$SCRIPT_DIR/append-observation.cjs"

SLICE=$(tail -n +$((PROCESSED + 1)) "$TRANSCRIPT")

EXTRACTION=$(echo "$SLICE" | "$CLAUDE_BIN" -p \
  --append-system-prompt "$SYSTEM_PROMPT" \
  --output-format text 2>>"$ERROR_LOG") || {
    echo "[$(date)] claude -p failed for session $SESSION_ID" >>"$ERROR_LOG"
    exit 0
}

echo "$EXTRACTION" | (cd "$GIT_ROOT" && node "$APPENDER") 2>>"$ERROR_LOG"

echo "$TOTAL" > "${CURSOR}.tmp" && mv "${CURSOR}.tmp" "$CURSOR"
```

### `on-pre-compact.sh`

Identical structure to `on-stop.sh`. Two scripts rather than a symlink so future event-specific telemetry (e.g., capturing pre-compaction context-size) has a place to live.

### `hooks.json` entry

```json
"PreCompact": [
  {
    "hooks": [
      {
        "type": "command",
        "command": "\"${CLAUDE_PLUGIN_ROOT}/skills/decision-logging/scripts/on-pre-compact.sh\"",
        "async": false
      }
    ]
  }
]
```

The same entry is mirrored in `.gitlab/duo/hooks.json`.

## Testing

### Test seam

The worker calls `claude -p`. Tests cannot invoke the real binary (non-deterministic, slow, token-burning). Introduce `SNOWBALL_CLAUDE_BIN` env var, defaulting to `claude`. Tests set it to a fixture binary that ignores args, reads stdin, and prints fixed JSONL on stdout.

### Unit tests

`skills/decision-logging/src/extract-worker.test.ts` — bun test, shells out to the bash worker as a subprocess (matches the existing TS + bun test pattern from commit `0eeca97`):

1. **Empty cursor, full transcript:** No cursor file present. Worker processes all lines; cursor advances to `wc -l` of the fixture transcript; observations appended in expected count.
2. **Cursor mid-transcript:** Cursor file contains `5`. Worker pipes only lines 6..end to the fake claude; cursor advances to total line count; earlier lines never re-fed.
3. **Cursor at end-of-transcript:** Cursor equals total. Worker exits 0; fake claude not invoked; observations file unchanged; cursor unchanged.
4. **Lock contention:** Worker A holds the lock (sleep fixture). Worker B invoked concurrently exits 0 within milliseconds; no double-append; B does not change the cursor.
5. **Fake claude exits non-zero:** Worker exits 0; cursor unchanged; error log gains one line.
6. **Missing transcript:** Worker exits 0 silently; error log gains one line; cursor file not created.
7. **Backward compat:** First run on a session whose transcript was created before this change processes the whole file (cursor defaults to 0).

### Manual integration test

Documented in the spec, not automated:

- Start a real session. Do enough turns to trigger `PreCompact` (typically dozens of turns). Verify one batch of observations lands in `observations.jsonl`.
- Continue past compaction. End the session. Verify a second batch lands, non-overlapping with the first (no duplicate `content` fields with the same `session_id`).
- Inspect `~/.snowball/checkpoints/<session_id>.cursor`; verify it matches `wc -l <transcript`.

## Risk register

- **Multiple `PreCompact` firings per session in rapid succession** (e.g., compaction triggered, fails, retried): each fires the hook, but `flock -n` ensures only one worker runs at a time, and the cursor ensures even if the second runs after the first, it processes only new lines. Acceptable.
- **Concurrent `PreCompact` + `Stop` race at session end:** Possible if `Stop` fires while a `PreCompact`-launched worker is still running. The lock serializes them. The second-to-acquire processes only what the first missed. Acceptable.
- **Cursor file corruption** (partial write from external tooling): `mv`-atomic write prevents partial writes from this code. If something else writes garbage to the cursor file, `cat | echo 0` fallback in the worker means corruption is treated as cursor=0 (reprocess everything). One round of duplicates, then back to normal.
- **Tail piping behavior with very large transcripts:** `tail -n +N` on a multi-MB JSONL is fine. If a session generates a transcript large enough to be a problem, the existing Stop hook already has the same problem and this spec doesn't make it worse.

## Open questions

None. All design decisions are settled.
