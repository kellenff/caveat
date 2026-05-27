# PreCompact Observation Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `PreCompact` Claude Code hook that extracts agent observations alongside the existing `Stop` hook, with a per-session line cursor + `flock` so each transcript region is processed exactly once.

**Architecture:** Both hooks fork the same detached `extract-worker.sh`. The worker reads `~/.snowball/checkpoints/<session_id>.cursor`, slices the transcript via `tail -n +N`, pipes only the unprocessed tail to `claude -p`, appends results to `<repo>/docs/snowball/decisions/observations.jsonl`, then atomically writes the new cursor. `flock -n` on a per-session lockfile serializes concurrent workers.

**Tech Stack:** Bash (`flock`, `tail`, `mv`-atomic rename), TypeScript + `bun:test` (test scaffolding), Claude Code `hooks.json`.

**Spec:** [`docs/snowball/specs/2026-05-26-precompact-observation-extraction-design.md`](../specs/2026-05-26-precompact-observation-extraction-design.md)

---

## File Structure

**Modified:**

- `skills/decision-logging/scripts/extract-worker.sh` — gains test seam, cursor read/write, slicing, locking.
- `skills/decision-logging/SKILL.md` — documents the new PreCompact hook.
- `hooks/hooks.json` — registers `PreCompact`.
- `.gitlab/duo/hooks.json` — mirrors the registration.

**Created:**

- `skills/decision-logging/scripts/on-pre-compact.sh` — hook entrypoint for `PreCompact`.
- `tests/decision-logging/extract-worker.test.ts` — `bun:test` covering all worker behaviors.
- `tests/decision-logging/worker-test-helpers.ts` — fixture helpers (fake claude binary, transcript setup, cursor inspection).

**Not touched:**

- `skills/decision-logging/scripts/append-observation.cjs` / `src/append-observation.ts` — appender is unchanged.
- `skills/decision-logging/scripts/extract-observations.md` — extraction prompt is unchanged.
- `skills/decision-logging/references/schema.md` — schema is unchanged.

---

## Task 1: Test seam + worker test scaffolding

**Goal:** Introduce `SNOWBALL_CLAUDE_BIN` so tests can substitute a fixture for the real `claude` binary. Establish the helper module and one passing smoke test.

**Files:**
- Modify: `skills/decision-logging/scripts/extract-worker.sh:23-27` (the `claude -p` invocation)
- Create: `tests/decision-logging/worker-test-helpers.ts`
- Create: `tests/decision-logging/extract-worker.test.ts`

- [ ] **Step 1: Write the helper module**

Create `tests/decision-logging/worker-test-helpers.ts`:

```ts
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { execFileSync } from "node:child_process";

export interface WorkerEnv {
  root: string;
  home: string;
  gitRoot: string;
  sessionId: string;
  transcriptPath: string;
  observationsPath: string;
  checkpointDir: string;
  cursorPath: string;
  lockPath: string;
  fakeClaudeBin: string;
  claudeStdinSink: string;
  claudeMarker: string;
}

export interface SetupOptions {
  transcriptLines: string[];
  fakeClaudeOutput?: string;
  fakeClaudeExitCode?: number;
  initialCursor?: number;
}

export function setupWorkerEnv(opts: SetupOptions): WorkerEnv {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "snowball-worker-"));
  const home = path.join(root, "home");
  const gitRoot = path.join(root, "repo");
  const sessionId = "test-" + Math.random().toString(36).slice(2, 10);

  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(gitRoot, { recursive: true });
  fs.mkdirSync(path.join(gitRoot, "docs", "snowball", "decisions"), {
    recursive: true,
  });
  execFileSync("git", ["init", "-q"], { cwd: gitRoot });

  const encoded = "-" + gitRoot.slice(1).replace(/\//g, "-");
  const transcriptDir = path.join(home, ".claude", "projects", encoded);
  fs.mkdirSync(transcriptDir, { recursive: true });
  const transcriptPath = path.join(transcriptDir, sessionId + ".jsonl");
  const body = opts.transcriptLines.join("\n") + "\n";
  fs.writeFileSync(transcriptPath, body);

  const checkpointDir = path.join(home, ".snowball", "checkpoints");
  fs.mkdirSync(checkpointDir, { recursive: true });
  const cursorPath = path.join(checkpointDir, sessionId + ".cursor");
  if (opts.initialCursor !== undefined) {
    fs.writeFileSync(cursorPath, String(opts.initialCursor));
  }

  const claudeStdinSink = path.join(root, "claude-stdin.txt");
  const claudeMarker = path.join(root, "claude-invoked.marker");
  const fakeClaudeBin = path.join(root, "fake-claude.sh");
  const output = opts.fakeClaudeOutput ?? "";
  const exitCode = opts.fakeClaudeExitCode ?? 0;
  const script =
    "#!/usr/bin/env bash\n" +
    `touch ${shq(claudeMarker)}\n` +
    `cat > ${shq(claudeStdinSink)}\n` +
    `printf '%s' ${shq(output)}\n` +
    `exit ${exitCode}\n`;
  fs.writeFileSync(fakeClaudeBin, script);
  fs.chmodSync(fakeClaudeBin, 0o755);

  return {
    root,
    home,
    gitRoot,
    sessionId,
    transcriptPath,
    observationsPath: path.join(
      gitRoot,
      "docs",
      "snowball",
      "decisions",
      "observations.jsonl",
    ),
    checkpointDir,
    cursorPath,
    lockPath: path.join(checkpointDir, sessionId + ".lock"),
    fakeClaudeBin,
    claudeStdinSink,
    claudeMarker,
  };
}

export function runWorker(env: WorkerEnv): SpawnSyncReturns<string> {
  const workerPath = path.resolve(
    __dirname,
    "..",
    "..",
    "skills",
    "decision-logging",
    "scripts",
    "extract-worker.sh",
  );
  return spawnSync("bash", [workerPath, env.sessionId, env.gitRoot], {
    env: {
      ...process.env,
      HOME: env.home,
      SNOWBALL_CLAUDE_BIN: env.fakeClaudeBin,
    },
    encoding: "utf-8",
  });
}

export function cleanupWorkerEnv(env: WorkerEnv): void {
  if (env.root && env.root.startsWith(os.tmpdir())) {
    fs.rmSync(env.root, { recursive: true, force: true });
  }
}

function shq(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}
```

- [ ] **Step 2: Write the failing smoke test**

Create `tests/decision-logging/extract-worker.test.ts`:

```ts
import { test, expect } from "bun:test";
import * as fs from "node:fs";
import {
  setupWorkerEnv,
  runWorker,
  cleanupWorkerEnv,
} from "./worker-test-helpers";

const validObservation = JSON.stringify({
  schema_version: "1.0",
  timestamp: "2026-05-26T12:00:00Z",
  session_id: "fixture",
  type: "observation",
  confidence: "high",
  source: "subagent",
  content: "Fixture observation.",
  rationale: "Test seam.",
  related_files: [],
  related_decision: null,
  tags: ["ambient"],
});

test("worker honors SNOWBALL_CLAUDE_BIN env var", () => {
  const env = setupWorkerEnv({
    transcriptLines: ['{"turn": 1}'],
    fakeClaudeOutput: validObservation + "\n",
  });
  try {
    const result = runWorker(env);
    expect(result.status).toBe(0);
    expect(fs.existsSync(env.claudeMarker)).toBe(true);
  } finally {
    cleanupWorkerEnv(env);
  }
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd tests/decision-logging && bun test extract-worker.test.ts
```

Expected: FAIL — the worker still calls bare `claude` (probably exits non-zero because `claude` isn't on PATH in a clean env, or it tries to call the real claude binary). The `claudeMarker` file won't exist.

- [ ] **Step 4: Make the test seam change in the worker**

Edit `skills/decision-logging/scripts/extract-worker.sh`. Replace lines that read:

```bash
# Invoke headless claude with the extraction prompt; pipe transcript on stdin
SYSTEM_PROMPT=$(cat "$PROMPT_FILE")
EXTRACTION=$(claude -p \
  --append-system-prompt "$SYSTEM_PROMPT" \
  --output-format text \
  <"$TRANSCRIPT" 2>>"$ERROR_LOG") || {
  echo "[$(date)] claude -p failed for session $SESSION_ID" >>"$ERROR_LOG"
  exit 0
}
```

with:

```bash
CLAUDE_BIN="${SNOWBALL_CLAUDE_BIN:-claude}"

# Invoke headless claude with the extraction prompt; pipe transcript on stdin
SYSTEM_PROMPT=$(cat "$PROMPT_FILE")
EXTRACTION=$("$CLAUDE_BIN" -p \
  --append-system-prompt "$SYSTEM_PROMPT" \
  --output-format text \
  <"$TRANSCRIPT" 2>>"$ERROR_LOG") || {
  echo "[$(date)] claude -p failed for session $SESSION_ID" >>"$ERROR_LOG"
  exit 0
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd tests/decision-logging && bun test extract-worker.test.ts
```

Expected: PASS. The fake claude binary was invoked, marker file exists.

- [ ] **Step 6: Commit**

```bash
git add skills/decision-logging/scripts/extract-worker.sh \
        tests/decision-logging/extract-worker.test.ts \
        tests/decision-logging/worker-test-helpers.ts
git commit -m "Add SNOWBALL_CLAUDE_BIN test seam to extract-worker"
```

---

## Task 2: Cursor read + atomic write (first-run cursor creation)

**Goal:** On every successful extraction, write `~/.snowball/checkpoints/<session_id>.cursor` containing the number of transcript lines processed. Missing cursor file is treated as `0` (process whole transcript — matches today's behavior).

**Files:**
- Modify: `skills/decision-logging/scripts/extract-worker.sh`
- Modify: `tests/decision-logging/extract-worker.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/decision-logging/extract-worker.test.ts`:

```ts
test("first run creates cursor file at total line count", () => {
  const env = setupWorkerEnv({
    transcriptLines: ['{"turn": 1}', '{"turn": 2}', '{"turn": 3}'],
    fakeClaudeOutput: validObservation + "\n",
  });
  try {
    const result = runWorker(env);
    expect(result.status).toBe(0);
    expect(fs.existsSync(env.cursorPath)).toBe(true);
    expect(fs.readFileSync(env.cursorPath, "utf-8").trim()).toBe("3");
  } finally {
    cleanupWorkerEnv(env);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tests/decision-logging && bun test extract-worker.test.ts
```

Expected: FAIL — cursor file doesn't exist.

- [ ] **Step 3: Add cursor write to the worker**

Edit `skills/decision-logging/scripts/extract-worker.sh`.

After the existing line:

```bash
ERROR_LOG="$HOME/.snowball/decision-logging-errors.log"
mkdir -p "$(dirname "$ERROR_LOG")"
```

insert:

```bash
CHECKPOINT_DIR="$HOME/.snowball/checkpoints"
mkdir -p "$CHECKPOINT_DIR"
CURSOR="$CHECKPOINT_DIR/${SESSION_ID}.cursor"
```

After the existing line:

```bash
TRANSCRIPT="$HOME/.claude/projects/$ENCODED/$SESSION_ID.jsonl"
```

(and after the `if [ ! -f "$TRANSCRIPT" ]` block), insert:

```bash
PROCESSED=$(cat "$CURSOR" 2>/dev/null || echo 0)
TOTAL=$(wc -l <"$TRANSCRIPT" | tr -d ' ')
```

At the very end of the file (after the appender pipe), append:

```bash
# Atomic cursor update: write to tmp, then rename
echo "$TOTAL" >"${CURSOR}.tmp" && mv "${CURSOR}.tmp" "$CURSOR"
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd tests/decision-logging && bun test extract-worker.test.ts
```

Expected: PASS — both tests pass; cursor file exists with content `3`.

- [ ] **Step 5: Commit**

```bash
git add skills/decision-logging/scripts/extract-worker.sh \
        tests/decision-logging/extract-worker.test.ts
git commit -m "Write per-session cursor after successful extraction"
```

---

## Task 3: Exit early when cursor is at end-of-transcript

**Goal:** If `cursor >= total_lines`, skip `claude -p` entirely. This is the core deduplication invariant.

**Files:**
- Modify: `skills/decision-logging/scripts/extract-worker.sh`
- Modify: `tests/decision-logging/extract-worker.test.ts`

- [ ] **Step 1: Write the failing test**

Append:

```ts
test("worker exits early when cursor equals total lines", () => {
  const env = setupWorkerEnv({
    transcriptLines: ['{"turn": 1}', '{"turn": 2}'],
    fakeClaudeOutput: validObservation + "\n",
    initialCursor: 2,
  });
  try {
    const result = runWorker(env);
    expect(result.status).toBe(0);
    expect(fs.existsSync(env.claudeMarker)).toBe(false);
    expect(fs.existsSync(env.observationsPath)).toBe(false);
    expect(fs.readFileSync(env.cursorPath, "utf-8").trim()).toBe("2");
  } finally {
    cleanupWorkerEnv(env);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tests/decision-logging && bun test extract-worker.test.ts
```

Expected: FAIL — fake claude was still invoked (`claudeMarker` exists) because the worker doesn't short-circuit.

- [ ] **Step 3: Add the early-exit check**

Edit `skills/decision-logging/scripts/extract-worker.sh`. Immediately after the `PROCESSED=` and `TOTAL=` lines added in Task 2, insert:

```bash
if [ "$TOTAL" -le "$PROCESSED" ]; then
  exit 0
fi
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd tests/decision-logging && bun test extract-worker.test.ts
```

Expected: PASS — fake claude not invoked, observations file not created, cursor unchanged.

- [ ] **Step 5: Commit**

```bash
git add skills/decision-logging/scripts/extract-worker.sh \
        tests/decision-logging/extract-worker.test.ts
git commit -m "Skip claude invocation when cursor is at transcript end"
```

---

## Task 4: Slice transcript to post-cursor lines only

**Goal:** When cursor is partway through the transcript, pipe only lines `(cursor+1)..end` to `claude -p`, not the whole file. This is what makes incremental extraction work.

**Files:**
- Modify: `skills/decision-logging/scripts/extract-worker.sh`
- Modify: `tests/decision-logging/extract-worker.test.ts`

- [ ] **Step 1: Write the failing test**

Append:

```ts
test("worker pipes only post-cursor transcript lines to claude", () => {
  const env = setupWorkerEnv({
    transcriptLines: [
      '{"line": "L1"}',
      '{"line": "L2"}',
      '{"line": "L3"}',
      '{"line": "L4"}',
      '{"line": "L5"}',
    ],
    fakeClaudeOutput: validObservation + "\n",
    initialCursor: 2,
  });
  try {
    const result = runWorker(env);
    expect(result.status).toBe(0);
    const piped = fs.readFileSync(env.claudeStdinSink, "utf-8");
    expect(piped).not.toContain("L1");
    expect(piped).not.toContain("L2");
    expect(piped).toContain("L3");
    expect(piped).toContain("L4");
    expect(piped).toContain("L5");
    expect(fs.readFileSync(env.cursorPath, "utf-8").trim()).toBe("5");
  } finally {
    cleanupWorkerEnv(env);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tests/decision-logging && bun test extract-worker.test.ts
```

Expected: FAIL — the worker still pipes the full transcript via `<"$TRANSCRIPT"`, so `L1`/`L2` appear in the stdin sink.

- [ ] **Step 3: Change the worker to slice the transcript**

Edit `skills/decision-logging/scripts/extract-worker.sh`. Replace the block:

```bash
CLAUDE_BIN="${SNOWBALL_CLAUDE_BIN:-claude}"

# Invoke headless claude with the extraction prompt; pipe transcript on stdin
SYSTEM_PROMPT=$(cat "$PROMPT_FILE")
EXTRACTION=$("$CLAUDE_BIN" -p \
  --append-system-prompt "$SYSTEM_PROMPT" \
  --output-format text \
  <"$TRANSCRIPT" 2>>"$ERROR_LOG") || {
  echo "[$(date)] claude -p failed for session $SESSION_ID" >>"$ERROR_LOG"
  exit 0
}
```

with:

```bash
CLAUDE_BIN="${SNOWBALL_CLAUDE_BIN:-claude}"

# Slice transcript to unprocessed tail and pipe to headless claude
SYSTEM_PROMPT=$(cat "$PROMPT_FILE")
EXTRACTION=$(tail -n +$((PROCESSED + 1)) "$TRANSCRIPT" | "$CLAUDE_BIN" -p \
  --append-system-prompt "$SYSTEM_PROMPT" \
  --output-format text 2>>"$ERROR_LOG") || {
  echo "[$(date)] claude -p failed for session $SESSION_ID" >>"$ERROR_LOG"
  exit 0
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd tests/decision-logging && bun test extract-worker.test.ts
```

Expected: PASS — stdin sink contains only `L3`, `L4`, `L5`; cursor advances to `5`.

- [ ] **Step 5: Commit**

```bash
git add skills/decision-logging/scripts/extract-worker.sh \
        tests/decision-logging/extract-worker.test.ts
git commit -m "Slice transcript to post-cursor lines before piping to claude"
```

---

## Task 5: Per-session flock to serialize concurrent workers

**Goal:** Two workers fired in rapid succession (e.g., `PreCompact` followed by `Stop`) must not both append. Non-blocking `flock` lets the first worker proceed and makes the second exit 0 silently.

**Files:**
- Modify: `skills/decision-logging/scripts/extract-worker.sh`
- Modify: `tests/decision-logging/extract-worker.test.ts`

- [ ] **Step 1: Write the failing test**

Append:

```ts
import { spawn } from "node:child_process";

test("worker bails when another holds the session lock", async () => {
  const env = setupWorkerEnv({
    transcriptLines: ['{"line": "A"}', '{"line": "B"}'],
    fakeClaudeOutput: validObservation + "\n",
  });
  // Hold the lock externally for the duration of this test.
  // `flock` holds the lock as long as the wrapped command runs.
  const holder = spawn(
    "flock",
    ["-x", env.lockPath, "sh", "-c", "sleep 2"],
    { stdio: "ignore" },
  );
  try {
    // Give flock a moment to acquire the lock.
    await new Promise((r) => setTimeout(r, 200));
    const result = runWorker(env);
    expect(result.status).toBe(0);
    expect(fs.existsSync(env.claudeMarker)).toBe(false);
    expect(fs.existsSync(env.observationsPath)).toBe(false);
    expect(fs.existsSync(env.cursorPath)).toBe(false);
  } finally {
    holder.kill("SIGTERM");
    cleanupWorkerEnv(env);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tests/decision-logging && bun test extract-worker.test.ts
```

Expected: FAIL — the worker has no lock yet, so it proceeds anyway, invokes the fake claude, and writes the cursor.

- [ ] **Step 3: Add flock to the worker**

Edit `skills/decision-logging/scripts/extract-worker.sh`. Immediately after the line:

```bash
CURSOR="$CHECKPOINT_DIR/${SESSION_ID}.cursor"
```

insert:

```bash
LOCK="$CHECKPOINT_DIR/${SESSION_ID}.lock"

# Non-blocking lock: if another worker is running, bail silently.
# It will pick up new transcript lines when it iterates.
exec 9>"$LOCK"
flock -n 9 || exit 0
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd tests/decision-logging && bun test extract-worker.test.ts
```

Expected: PASS — when the lock is held externally, the worker exits 0 immediately with no side effects.

- [ ] **Step 5: Commit**

```bash
git add skills/decision-logging/scripts/extract-worker.sh \
        tests/decision-logging/extract-worker.test.ts
git commit -m "Serialize concurrent workers with non-blocking flock"
```

---

## Task 6: Add `on-pre-compact.sh` hook script

**Goal:** New hook entrypoint that forks the worker on `PreCompact` events. Structurally identical to `on-stop.sh`.

**Files:**
- Create: `skills/decision-logging/scripts/on-pre-compact.sh`
- Modify: `tests/decision-logging/extract-worker.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/decision-logging/extract-worker.test.ts`:

```ts
import { execFileSync } from "node:child_process";
import * as path from "node:path";

test("on-pre-compact.sh exists, is executable, and forks the worker", () => {
  const env = setupWorkerEnv({
    transcriptLines: ['{"line": "A"}'],
    fakeClaudeOutput: validObservation + "\n",
  });
  try {
    const hookPath = path.resolve(
      __dirname,
      "..",
      "..",
      "skills",
      "decision-logging",
      "scripts",
      "on-pre-compact.sh",
    );
    expect(fs.existsSync(hookPath)).toBe(true);
    expect(fs.statSync(hookPath).mode & 0o111).not.toBe(0);
    // Hook reads session_id from stdin payload and forks the worker.
    const payload = JSON.stringify({ session_id: env.sessionId });
    execFileSync("bash", [hookPath], {
      input: payload,
      env: {
        ...process.env,
        HOME: env.home,
        SNOWBALL_CLAUDE_BIN: env.fakeClaudeBin,
      },
      cwd: env.gitRoot,
    });
    // Worker is detached; wait briefly for it to complete.
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && !fs.existsSync(env.cursorPath)) {
      // 50ms poll loop
      execFileSync("sleep", ["0.05"]);
    }
    expect(fs.existsSync(env.cursorPath)).toBe(true);
  } finally {
    cleanupWorkerEnv(env);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tests/decision-logging && bun test extract-worker.test.ts
```

Expected: FAIL — `on-pre-compact.sh` doesn't exist.

- [ ] **Step 3: Create the hook script**

Create `skills/decision-logging/scripts/on-pre-compact.sh`:

```bash
#!/usr/bin/env bash
# PreCompact hook: forks the extraction worker as a detached subprocess and returns immediately.
set -uo pipefail

GIT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKER="$SCRIPT_DIR/extract-worker.sh"
LOG_DIR="$HOME/.snowball"
mkdir -p "$LOG_DIR"

PAYLOAD=$(cat)
SESSION_ID=$(printf '%s' "$PAYLOAD" | node -e '
let s = "";
process.stdin.on("data", (c) => s += c);
process.stdin.on("end", () => {
  try { process.stdout.write((JSON.parse(s).session_id || "").toString()); }
  catch { process.exit(0); }
});
')

if [ -z "$SESSION_ID" ]; then
  exit 0
fi

nohup bash "$WORKER" "$SESSION_ID" "$GIT_ROOT" >>"$LOG_DIR/decision-logging.log" 2>&1 &
disown

exit 0
```

- [ ] **Step 4: Make it executable**

```bash
chmod +x skills/decision-logging/scripts/on-pre-compact.sh
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd tests/decision-logging && bun test extract-worker.test.ts
```

Expected: PASS — hook exists, executable, forks worker, cursor file appears within the polling window.

- [ ] **Step 6: Commit**

```bash
git add skills/decision-logging/scripts/on-pre-compact.sh \
        tests/decision-logging/extract-worker.test.ts
git commit -m "Add on-pre-compact.sh hook script"
```

---

## Task 7: Register `PreCompact` in `hooks.json` files

**Goal:** Tell Claude Code (and GitLab Duo) to fire `on-pre-compact.sh` on the `PreCompact` event.

**Files:**
- Modify: `hooks/hooks.json`
- Modify: `.gitlab/duo/hooks.json`

- [ ] **Step 1: Inspect the current shape of both files**

```bash
cat hooks/hooks.json
cat .gitlab/duo/hooks.json
```

Expected: both contain a `"hooks"` object with `SessionStart`, `PostToolUse`, `UserPromptSubmit`, `Stop` entries.

- [ ] **Step 2: Add `PreCompact` entry to `hooks/hooks.json`**

Edit `hooks/hooks.json`. After the closing `]` of the `"Stop"` array (before the closing `}` of the `"hooks"` object), add a comma and:

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

The full resulting `"hooks"` object should now contain five keys: `SessionStart`, `PostToolUse`, `UserPromptSubmit`, `Stop`, `PreCompact`.

- [ ] **Step 3: Mirror the change in `.gitlab/duo/hooks.json`**

Apply the equivalent edit in `.gitlab/duo/hooks.json`. If that file uses a different placeholder syntax (e.g., GitLab Duo plugin root), preserve its existing convention — match the form already used for the `Stop` entry in the same file, but for `PreCompact`.

- [ ] **Step 4: Verify both files are valid JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('hooks/hooks.json'))" \
  && echo "hooks/hooks.json: OK"
node -e "JSON.parse(require('fs').readFileSync('.gitlab/duo/hooks.json'))" \
  && echo ".gitlab/duo/hooks.json: OK"
```

Expected: both print `OK`. No JSON parse errors.

- [ ] **Step 5: Verify the PreCompact entry is present in both**

```bash
node -e "
const f = (p) => JSON.parse(require('fs').readFileSync(p));
const a = f('hooks/hooks.json').hooks.PreCompact;
const b = f('.gitlab/duo/hooks.json').hooks.PreCompact;
if (!a || !b) { console.error('missing PreCompact'); process.exit(1); }
console.log('PreCompact registered in both files');
"
```

Expected: prints `PreCompact registered in both files`.

- [ ] **Step 6: Commit**

```bash
git add hooks/hooks.json .gitlab/duo/hooks.json
git commit -m "Register PreCompact hook for both Claude Code and GitLab Duo"
```

---

## Task 8: Update `SKILL.md` documentation

**Goal:** Document the new capture mechanism so the skill's reference table stays the authoritative source.

**Files:**
- Modify: `skills/decision-logging/SKILL.md`

- [ ] **Step 1: Add `PreCompact` row to the capture-mechanisms table**

Edit `skills/decision-logging/SKILL.md`. The current table is:

```markdown
| Hook | Trigger | Produces |
|---|---|---|
| PostToolUse on `AskUserQuestion` | User picks an option from a structured prompt | One MADR per question-answer pair (`capture_mechanism: ask-user-question`) |
| UserPromptSubmit (pattern match) | User submits a free-text prompt matching an approval phrase | One MADR (`capture_mechanism: user-prompt-pattern`), deduped against recent `ask-user-question` captures |
| Stop → detached worker | Session ends | Headless `claude -p` extracts observations from the transcript; appends to `observations.jsonl` (`source: subagent`). |
```

Add a fourth row after the `Stop` row:

```markdown
| PreCompact → detached worker | Auto-compaction is about to run | Same detached worker as `Stop`; extracts observations from the unprocessed transcript tail (`source: subagent`). |
```

- [ ] **Step 2: Add a paragraph on compaction-resilience after the table**

Below the table, after the line "All hooks no-op silently when the session is outside a git repo.", insert:

```markdown
The Stop and PreCompact hooks coordinate via a per-session cursor at
`~/.snowball/checkpoints/<session_id>.cursor` and a non-blocking `flock`. Each
transcript region is fed to `claude -p` exactly once: PreCompact captures the
pre-compaction transcript before context is summarized, Stop captures whatever
new turns happened after the last PreCompact (if any). Long sessions that are
abandoned after compacting still emit pre-compaction observations.
```

- [ ] **Step 3: Verify markdownlint passes**

```bash
markdownlint-cli2 skills/decision-logging/SKILL.md
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add skills/decision-logging/SKILL.md
git commit -m "Document PreCompact capture mechanism in decision-logging SKILL.md"
```

---

## Task 9: Full test suite + manual integration verification

**Goal:** Confirm nothing regressed and the new hook actually fires in a real session.

**Files:** (no edits expected; this task verifies)

- [ ] **Step 1: Run the full decision-logging test suite**

```bash
cd tests/decision-logging && bun test
```

Expected: all tests pass (existing `write-madr`, `append-observation`, `approval-phrases` plus the new `extract-worker` tests).

- [ ] **Step 2: Run all pre-commit hooks across the changed files**

```bash
pre-commit run --files \
  skills/decision-logging/scripts/extract-worker.sh \
  skills/decision-logging/scripts/on-pre-compact.sh \
  skills/decision-logging/SKILL.md \
  hooks/hooks.json \
  .gitlab/duo/hooks.json \
  tests/decision-logging/extract-worker.test.ts \
  tests/decision-logging/worker-test-helpers.ts
```

Expected: every hook passes (shfmt, shellcheck, markdownlint, oxlint, oxfmt, bun test, build-decision-logging).

- [ ] **Step 3: Manual integration check (documented, optional in CI)**

In a real Claude Code session inside this repo:

1. Note the current `wc -l docs/snowball/decisions/observations.jsonl` and `ls ~/.snowball/checkpoints/`.
2. Drive the session long enough for auto-compaction to trigger. (Talk to Claude until you see the compaction event.)
3. After compaction completes, wait ~10 seconds for the detached worker.
4. Verify `~/.snowball/checkpoints/<current-session-id>.cursor` exists and contains a positive integer.
5. Verify `observations.jsonl` has gained new lines whose `session_id` matches the current session.
6. End the session (`exit` or Ctrl-D). Wait another ~10 seconds.
7. Verify the cursor file's integer increased and `observations.jsonl` has at most one additional batch (no overlapping duplicates with the PreCompact batch).

Document the result in this task's checkbox before marking it done.

- [ ] **Step 4: Final commit (if any documentation tweaks emerged from manual testing)**

```bash
# Only if manual testing revealed wording fixes to SKILL.md or the spec.
git add -p
git commit -m "Tighten decision-logging docs after manual PreCompact verification"
```

---

## Self-Review (completed)

**Spec coverage:**

- ✅ Goals 1-4 (extract at PreCompact, exactly-once, crash-safety, never break session) — Tasks 2-7.
- ✅ Cursor mechanism (location, format, atomic write) — Task 2.
- ✅ Locking — Task 5.
- ✅ Backward compatibility (missing cursor = 0) — Task 2 (handled by the `|| echo 0` fallback in step 3).
- ✅ Test seam (`SNOWBALL_CLAUDE_BIN`) — Task 1.
- ✅ Unit tests 1-6 from spec — Tasks 1-5 (test 7 about backward compat is implicit in Task 2's first test, which doesn't pre-write a cursor).
- ✅ All four `hooks.json` registrations + SKILL.md update — Tasks 7-8.
- ✅ Manual integration test — Task 9.

**Placeholder scan:** No TBDs, no "fill in", no "similar to Task N", no missing code blocks. Every edit shows before/after text.

**Type consistency:** `SNOWBALL_CLAUDE_BIN`, `CLAUDE_BIN`, `CHECKPOINT_DIR`, `CURSOR`, `LOCK`, `PROCESSED`, `TOTAL` — names are consistent across tasks. TS helper exports `setupWorkerEnv`, `runWorker`, `cleanupWorkerEnv` used identically across all tests.
