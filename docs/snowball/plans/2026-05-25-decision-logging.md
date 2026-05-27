# Decision Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Phase 1 of the decision-logging system: three Claude Code hooks that write MADR markdown for operator decisions and an append-only JSONL stream for agent observations, with output going to `<repo>/docs/snowball/decisions/`.

**Architecture:** A new `skills/decision-logging/` directory containing thin shell hook handlers that delegate to Node writer scripts. Stop hook forks a detached background worker that invokes `claude -p` to extract observations from the session transcript. All hooks no-op cleanly when outside a git repo.

**Tech Stack:** Bash (hook handlers), Node.js CommonJS (writers; existing snowball dependency via `brainstorming/scripts/server.cjs`), js-yaml for frontmatter assembly. All subprocess invocations use `child_process.execFileSync(cmd, [args])` (no string-command `exec`) to avoid shell-injection patterns. Tests use plain `node --test` + `assert` and bash for shell integration.

**Spec:** `docs/snowball/specs/2026-05-25-decision-logging-design.md` — read first.

---

## File Structure

**Created:**

```text
skills/decision-logging/
├── SKILL.md                              # protocol/schema reference (Task 1 stub, Task 12 polish)
├── references/
│   └── schema.md                         # versioned schema spec (Task 1)
└── scripts/
    ├── approval-phrases.cjs              # APPROVAL_PHRASES + matcher (Task 3)
    ├── git-root.cjs                      # safe git-root detection helper (Task 4)
    ├── write-madr.cjs                    # MADR assembly + writer (Tasks 4, 5)
    ├── append-observation.cjs            # JSONL validator + appender (Task 6)
    ├── on-ask-user-question.sh           # PostToolUse handler (Task 7)
    ├── ask-user-question-bridge.cjs      # Node bridge invoked by the handler (Task 7)
    ├── on-user-prompt.sh                 # UserPromptSubmit handler (Task 8)
    ├── user-prompt-bridge.cjs            # Node bridge invoked by the handler (Task 8)
    ├── extract-observations.md           # subagent prompt (Task 9)
    ├── extract-worker.sh                 # detached background worker (Task 10)
    └── on-stop.sh                        # Stop handler — forks worker (Task 10)

tests/decision-logging/
├── package.json                          # CJS test package (Task 2)
├── test-helpers.cjs                      # shared fixtures + assertions (Task 2)
├── approval-phrases.test.cjs             # unit (Task 3)
├── write-madr.test.cjs                   # unit (Tasks 4, 5)
├── append-observation.test.cjs           # unit (Task 6)
├── on-ask-user-question.test.sh          # integration (Task 7)
├── on-user-prompt.test.sh                # integration (Task 8)
└── on-stop.test.sh                       # integration (Task 10)
```

**Modified:**

- `hooks/hooks.json` — add PostToolUse, UserPromptSubmit, Stop entries (Task 11)

**Design note on bridges:** The shell handlers (`on-ask-user-question.sh`, `on-user-prompt.sh`) read hook stdin, then invoke a Node bridge file via `node <bridge.cjs>` and pipe the payload. The bridge does the JSON parsing and writer invocation. Keeping the Node logic in a real file (not a bash heredoc) avoids quoting hazards and is unit-testable.

---

## Task 1: Skill skeleton

**Files:**
- Create: `skills/decision-logging/SKILL.md` (stub)
- Create: `skills/decision-logging/references/schema.md`

- [ ] **Step 1: Create directories**

```bash
mkdir -p skills/decision-logging/scripts skills/decision-logging/references
```

- [ ] **Step 2: Write SKILL.md stub**

Content for `skills/decision-logging/SKILL.md`:

```markdown
---
name: decision-logging
description: Documents the snowball decision-logging schema and capture mechanism. This skill is reference documentation for the hook-driven decision capture system. Agents do not invoke this skill directly — hooks do the work. Use to look up MADR/JSONL schema, capture-mechanism enum values, or flannel ingestion contract.
---

# Decision Logging

Captures operator decisions (high confidence) as MADR markdown and agent observations (lower confidence) as append-only JSONL, in `<repo>/docs/snowball/decisions/`. Written automatically by hooks during snowball-driven Claude Code sessions.

See `references/schema.md` for the schema contract.
See `docs/snowball/specs/2026-05-25-decision-logging-design.md` for the design.
```

- [ ] **Step 3: Write schema reference**

Content for `skills/decision-logging/references/schema.md`:

````markdown
# Decision Logging Schema (version 1.0)

Snowball-committed contract for `<repo>/docs/snowball/decisions/` artifacts.

## MADR file format

Filename: `<ISO-timestamp-to-minute>-<slug>.md` (e.g. `2026-05-25T1430-spec-approved.md`).

```yaml
---
title: string
status: proposed | accepted | rejected | deprecated | superseded
date: ISO-8601 datetime with timezone
deciders: [string]
snowball:
  schema_version: "1.0"
  source: operator | agent
  confidence: high | medium | low
  capture_mechanism: ask-user-question | user-prompt-pattern | stop-hook-subagent | manual
  session_id: string
  source_event_id: string
  supersedes: filename | null
  tags: [string]                     # tags[0] required; see source-skill enum
---
```

`snowball.tags[0]` (required first tag): `brainstorming | writing-plans | systematic-debugging | code-review | ambient`
`snowball.tags[1..]`: freeform.

Body follows MADR conventions: `## Context and Problem Statement`, `## Considered Options`, `## Decision Outcome`, `## Consequences`, `## Links`. Only Context and Decision Outcome are required; others may be empty.

## Observation JSONL format

File: `<repo>/docs/snowball/decisions/observations.jsonl`. Append-only. One JSON object per line.

```json
{
  "schema_version": "1.0",
  "timestamp": "ISO-8601 datetime with timezone",
  "session_id": "string",
  "type": "observation | implementation-choice | hypothesis | constraint",
  "confidence": "high | medium | low",
  "source": "agent | subagent",
  "content": "string",
  "rationale": "string",
  "related_files": ["string"],
  "related_decision": "filename | null",
  "tags": ["string"]
}
```

All fields required; `related_files` and `related_decision` may be empty array / null respectively.

## Versioning

- `1.0` frozen at Phase 1 launch.
- Additive changes (new optional fields): bump to `1.1`.
- Breaking changes (remove fields, change enum semantics): bump to `2.0`.
````

- [ ] **Step 4: Commit**

```bash
git add skills/decision-logging/SKILL.md skills/decision-logging/references/schema.md
git commit -m "Add decision-logging skill skeleton with schema reference"
```

---

## Task 2: Test infrastructure

**Files:**
- Create: `tests/decision-logging/package.json`
- Create: `tests/decision-logging/test-helpers.cjs`

- [ ] **Step 1: Create test package.json**

Content for `tests/decision-logging/package.json`:

```json
{
  "name": "decision-logging-tests",
  "version": "1.0.0",
  "scripts": {
    "test": "node --test approval-phrases.test.cjs write-madr.test.cjs append-observation.test.cjs"
  },
  "dependencies": {
    "js-yaml": "^4.1.0"
  }
}
```

- [ ] **Step 2: Install test deps**

```bash
cd tests/decision-logging && npm install && cd ../..
```

Expected: `js-yaml` resolves to `tests/decision-logging/node_modules/`. `package-lock.json` is created.

- [ ] **Step 3: Write test helpers**

Content for `tests/decision-logging/test-helpers.cjs`:

```javascript
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

function makeTempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snowball-decisions-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'test'], { cwd: dir });
  return dir;
}

function cleanupTempRepo(dir) {
  if (dir && dir.startsWith(os.tmpdir())) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function readDecisionsDir(repo) {
  const dir = path.join(repo, 'docs', 'snowball', 'decisions');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).sort();
}

module.exports = { makeTempRepo, cleanupTempRepo, readDecisionsDir };
```

- [ ] **Step 4: Commit**

```bash
git add tests/decision-logging/package.json tests/decision-logging/test-helpers.cjs tests/decision-logging/package-lock.json
git commit -m "Add test scaffolding for decision-logging"
```

---

## Task 3: APPROVAL_PHRASES module (TDD)

**Files:**
- Create: `tests/decision-logging/approval-phrases.test.cjs`
- Create: `skills/decision-logging/scripts/approval-phrases.cjs`

- [ ] **Step 1: Write failing tests**

Content for `tests/decision-logging/approval-phrases.test.cjs`:

```javascript
const test = require('node:test');
const assert = require('node:assert');
const { APPROVAL_PHRASES, matchesApproval } = require('../../skills/decision-logging/scripts/approval-phrases.cjs');

test('APPROVAL_PHRASES contains the locked Phase-1 list', () => {
  assert.deepStrictEqual(APPROVAL_PHRASES, [
    'lgtm', 'looks good', 'ship it', 'approved', 'approve',
    'go ahead', "let's do that", 'yes do that', 'merge it', 'do it',
  ]);
});

test('matchesApproval handles exact match case-insensitively', () => {
  assert.strictEqual(matchesApproval('lgtm'), true);
  assert.strictEqual(matchesApproval('LGTM'), true);
  assert.strictEqual(matchesApproval('Ship It'), true);
});

test('matchesApproval handles phrase followed by punctuation or whitespace', () => {
  assert.strictEqual(matchesApproval('lgtm!'), true);
  assert.strictEqual(matchesApproval('lgtm, ship it'), true);
  assert.strictEqual(matchesApproval('looks good to me'), true);
  assert.strictEqual(matchesApproval('approved.'), true);
});

test('matchesApproval rejects non-approval prompts', () => {
  assert.strictEqual(matchesApproval('thanks'), false);
  assert.strictEqual(matchesApproval('what about edge case X'), false);
  assert.strictEqual(matchesApproval(''), false);
  assert.strictEqual(matchesApproval('   '), false);
});

test('matchesApproval rejects bare affirmations (excluded by policy)', () => {
  assert.strictEqual(matchesApproval('yes'), false);
  assert.strictEqual(matchesApproval('yeah'), false);
  assert.strictEqual(matchesApproval('ok'), false);
  assert.strictEqual(matchesApproval('sure'), false);
  assert.strictEqual(matchesApproval('i agree'), false);
});

test('matchesApproval rejects substring-only matches inside longer prose', () => {
  assert.strictEqual(matchesApproval('i would not say lgtm here'), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tests/decision-logging && node --test approval-phrases.test.cjs
```

Expected: FAIL — module not found at `../../skills/decision-logging/scripts/approval-phrases.cjs`.

- [ ] **Step 3: Implement the module**

Content for `skills/decision-logging/scripts/approval-phrases.cjs`:

```javascript
const APPROVAL_PHRASES = [
  'lgtm',
  'looks good',
  'ship it',
  'approved',
  'approve',
  'go ahead',
  "let's do that",
  'yes do that',
  'merge it',
  'do it',
];

function matchesApproval(prompt) {
  if (typeof prompt !== 'string') return false;
  const trimmed = prompt.trim().toLowerCase();
  if (!trimmed) return false;

  for (const phrase of APPROVAL_PHRASES) {
    if (trimmed === phrase) return true;
    if (trimmed.startsWith(phrase)) {
      const next = trimmed[phrase.length];
      if (/[\s.,;:!?]/.test(next)) return true;
    }
  }
  return false;
}

module.exports = { APPROVAL_PHRASES, matchesApproval };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd tests/decision-logging && node --test approval-phrases.test.cjs
```

Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add skills/decision-logging/scripts/approval-phrases.cjs tests/decision-logging/approval-phrases.test.cjs
git commit -m "Add APPROVAL_PHRASES matcher with case-insensitive boundary detection"
```

---

## Task 4: `git-root.cjs` helper + `write-madr.cjs` assembly (TDD)

**Files:**
- Create: `skills/decision-logging/scripts/git-root.cjs`
- Create: `skills/decision-logging/scripts/write-madr.cjs`
- Create: `tests/decision-logging/write-madr.test.cjs` (assembly tests only — file-writing tests added in Task 5)

- [ ] **Step 1: Implement `git-root.cjs`** (no tests; thin wrapper around safe execFile)

Content for `skills/decision-logging/scripts/git-root.cjs`:

```javascript
const { execFileSync } = require('child_process');

function detectGitRoot(startDir) {
  try {
    const out = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: startDir || process.cwd(),
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.toString().trim();
  } catch {
    return null;
  }
}

module.exports = { detectGitRoot };
```

- [ ] **Step 2: Write failing tests for assembly**

Content for `tests/decision-logging/write-madr.test.cjs`:

```javascript
const test = require('node:test');
const assert = require('node:assert');
const yaml = require('js-yaml');
const { assembleMadr, slugify } = require('../../skills/decision-logging/scripts/write-madr.cjs');

const sampleInput = {
  title: 'Choose two-tier storage for decision logs',
  status: 'accepted',
  date: '2026-05-25T14:30:00-07:00',
  deciders: ['kellen'],
  snowball: {
    schema_version: '1.0',
    source: 'operator',
    confidence: 'high',
    capture_mechanism: 'ask-user-question',
    session_id: 'abc-123',
    source_event_id: 'tooluse-42',
    supersedes: null,
    tags: ['brainstorming', 'architecture'],
  },
  body: {
    context: 'We need a place to store decisions.',
    considered_options: [
      { name: 'Two-tier', description: 'MADR + observations.jsonl' },
      { name: 'Uniform MADR', description: 'every event a file' },
    ],
    decision_outcome: 'Chose Two-tier. Format matches ceremony level.',
    consequences: ['Two formats to parse'],
    links: ['Spec: docs/snowball/specs/2026-05-25-decision-logging-design.md'],
  },
};

test('assembleMadr produces parseable frontmatter', () => {
  const md = assembleMadr(sampleInput);
  const fmMatch = md.match(/^---\n([\s\S]+?)\n---\n/);
  assert.ok(fmMatch, 'expected frontmatter delimiters');
  const fm = yaml.load(fmMatch[1]);
  assert.strictEqual(fm.title, sampleInput.title);
  assert.strictEqual(fm.snowball.schema_version, '1.0');
  assert.deepStrictEqual(fm.snowball.tags, ['brainstorming', 'architecture']);
});

test('assembleMadr renders body sections in canonical order', () => {
  const md = assembleMadr(sampleInput);
  const ctxIdx = md.indexOf('## Context and Problem Statement');
  const optIdx = md.indexOf('## Considered Options');
  const outIdx = md.indexOf('## Decision Outcome');
  const consIdx = md.indexOf('## Consequences');
  const linkIdx = md.indexOf('## Links');
  assert.ok(ctxIdx < optIdx && optIdx < outIdx && outIdx < consIdx && consIdx < linkIdx,
    'body sections must appear in MADR-canonical order');
});

test('assembleMadr omits empty optional sections', () => {
  const minimal = {
    ...sampleInput,
    body: { context: 'ctx', decision_outcome: 'chose X' },
  };
  const md = assembleMadr(minimal);
  assert.ok(md.includes('## Context and Problem Statement'));
  assert.ok(md.includes('## Decision Outcome'));
  assert.ok(!md.includes('## Considered Options'));
  assert.ok(!md.includes('## Consequences'));
  assert.ok(!md.includes('## Links'));
});

test('slugify lowercases and replaces non-alphanumerics with hyphens', () => {
  assert.strictEqual(slugify('Choose Two-tier Storage'), 'choose-two-tier-storage');
  assert.strictEqual(slugify("Don't! Refactor"), 'don-t-refactor');
});

test('slugify truncates to a reasonable max length', () => {
  const long = 'a'.repeat(200);
  const s = slugify(long);
  assert.ok(s.length <= 60, `slug too long: ${s.length} chars`);
});

test('slugify handles non-string input by returning a fallback', () => {
  assert.strictEqual(slugify(null), 'untitled');
  assert.strictEqual(slugify(''), 'untitled');
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd tests/decision-logging && node --test write-madr.test.cjs
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement assembly + slugify**

Content for `skills/decision-logging/scripts/write-madr.cjs` (file-writing logic added in Task 5):

```javascript
const yaml = require('js-yaml');

function slugify(s) {
  if (typeof s !== 'string' || !s.trim()) return 'untitled';
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'untitled';
}

function assembleFrontmatter(input) {
  const fm = {
    title: input.title,
    status: input.status || 'accepted',
    date: input.date,
    deciders: input.deciders || [],
    snowball: input.snowball,
  };
  return yaml.dump(fm, { lineWidth: 120, noRefs: true });
}

function assembleBody(input) {
  const b = input.body || {};
  const sections = [`# ${input.title}\n`];

  if (b.context) {
    sections.push('## Context and Problem Statement\n', b.context + '\n');
  }
  if (b.considered_options && b.considered_options.length) {
    sections.push('## Considered Options\n');
    for (const opt of b.considered_options) {
      sections.push(`- **${opt.name}** — ${opt.description}`);
    }
    sections.push('');
  }
  if (b.decision_outcome) {
    sections.push('## Decision Outcome\n', b.decision_outcome + '\n');
  }
  if (b.consequences && b.consequences.length) {
    sections.push('## Consequences\n');
    for (const c of b.consequences) sections.push(`- ${c}`);
    sections.push('');
  }
  if (b.links && b.links.length) {
    sections.push('## Links\n');
    for (const l of b.links) sections.push(`- ${l}`);
    sections.push('');
  }
  return sections.join('\n');
}

function assembleMadr(input) {
  return `---\n${assembleFrontmatter(input)}---\n\n${assembleBody(input)}`;
}

module.exports = { assembleMadr, assembleFrontmatter, assembleBody, slugify };
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd tests/decision-logging && node --test write-madr.test.cjs
```

Expected: all 6 tests pass.

- [ ] **Step 6: Commit**

```bash
git add skills/decision-logging/scripts/git-root.cjs skills/decision-logging/scripts/write-madr.cjs tests/decision-logging/write-madr.test.cjs
git commit -m "Add git-root helper and MADR frontmatter/body assembly"
```

---

## Task 5: `write-madr.cjs` — file writing + CLI entry (TDD)

**Files:**
- Modify: `tests/decision-logging/write-madr.test.cjs` (append integration tests)
- Modify: `skills/decision-logging/scripts/write-madr.cjs` (add file-writing + CLI entry)

- [ ] **Step 1: Append file-writing tests**

Append the following to the end of `tests/decision-logging/write-madr.test.cjs`:

```javascript
const fs = require('node:fs');
const path = require('node:path');
const { writeMadr } = require('../../skills/decision-logging/scripts/write-madr.cjs');
const { makeTempRepo, cleanupTempRepo, readDecisionsDir } = require('./test-helpers.cjs');

test('writeMadr writes to <repo>/docs/snowball/decisions/<timestamp>-<slug>.md', () => {
  const repo = makeTempRepo();
  try {
    const filePath = writeMadr(sampleInput, { gitRoot: repo });
    assert.ok(filePath.startsWith(path.join(repo, 'docs', 'snowball', 'decisions') + path.sep));
    assert.ok(fs.existsSync(filePath));
    const files = readDecisionsDir(repo);
    assert.strictEqual(files.length, 1);
    assert.match(files[0], /^2026-05-25T1430-choose-two-tier-storage-for-decision-logs\.md$/);
  } finally {
    cleanupTempRepo(repo);
  }
});

test('writeMadr creates the decisions directory if absent', () => {
  const repo = makeTempRepo();
  try {
    writeMadr(sampleInput, { gitRoot: repo });
    assert.ok(fs.existsSync(path.join(repo, 'docs', 'snowball', 'decisions')));
  } finally {
    cleanupTempRepo(repo);
  }
});

test('writeMadr appends a suffix when minute collision occurs', () => {
  const repo = makeTempRepo();
  try {
    writeMadr(sampleInput, { gitRoot: repo });
    const p2 = writeMadr({ ...sampleInput }, { gitRoot: repo });
    assert.ok(fs.existsSync(p2));
    const files = readDecisionsDir(repo);
    assert.strictEqual(files.length, 2);
  } finally {
    cleanupTempRepo(repo);
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd tests/decision-logging && node --test write-madr.test.cjs
```

Expected: FAIL — `writeMadr` not exported.

- [ ] **Step 3: Implement `writeMadr` + CLI entry**

Add the following to `skills/decision-logging/scripts/write-madr.cjs` (between the existing `assembleMadr` definition and the `module.exports` line):

```javascript
const fs = require('fs');
const path = require('path');
const { detectGitRoot } = require('./git-root.cjs');

function timestampPrefix(isoDate) {
  // 2026-05-25T14:30:00-07:00 → 2026-05-25T1430
  const m = isoDate.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (!m) throw new Error(`unparseable date: ${isoDate}`);
  return `${m[1]}T${m[2]}${m[3]}`;
}

function writeMadr(input, opts = {}) {
  const gitRoot = opts.gitRoot || detectGitRoot();
  if (!gitRoot) throw new Error('not in a git repo');

  const dir = path.join(gitRoot, 'docs', 'snowball', 'decisions');
  fs.mkdirSync(dir, { recursive: true });

  const prefix = timestampPrefix(input.date);
  const slug = slugify(input.title);
  let filename = `${prefix}-${slug}.md`;
  let filePath = path.join(dir, filename);

  if (fs.existsSync(filePath)) {
    const suffix = Date.now().toString(36).slice(-4);
    filename = `${prefix}-${slug}-${suffix}.md`;
    filePath = path.join(dir, filename);
  }

  fs.writeFileSync(filePath, assembleMadr(input));
  return filePath;
}

// CLI entry: read JSON from stdin, write MADR, print path on stdout
if (require.main === module) {
  let raw = '';
  process.stdin.on('data', (chunk) => { raw += chunk; });
  process.stdin.on('end', () => {
    try {
      const input = JSON.parse(raw);
      const filePath = writeMadr(input);
      process.stdout.write(filePath + '\n');
    } catch (err) {
      process.stderr.write(`write-madr error: ${err.message}\n`);
      process.exit(1);
    }
  });
}
```

Then change the existing `module.exports` line to:

```javascript
module.exports = { assembleMadr, assembleFrontmatter, assembleBody, slugify, writeMadr, timestampPrefix };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd tests/decision-logging && node --test write-madr.test.cjs
```

Expected: all 9 tests pass.

- [ ] **Step 5: Smoke-test the CLI**

```bash
echo '{"title":"Test entry","date":"2026-05-25T10:00:00-07:00","status":"accepted","deciders":["kellen"],"snowball":{"schema_version":"1.0","source":"operator","confidence":"high","capture_mechanism":"manual","session_id":"s","source_event_id":"e","supersedes":null,"tags":["ambient"]},"body":{"context":"ctx","decision_outcome":"chose X"}}' | node skills/decision-logging/scripts/write-madr.cjs
```

Expected: prints a path under `docs/snowball/decisions/`. Inspect to confirm valid markdown.

Clean up the smoke-test artifact:

```bash
rm docs/snowball/decisions/2026-05-25T1000-test-entry.md
rmdir docs/snowball/decisions docs/snowball 2>/dev/null || true
```

- [ ] **Step 6: Commit**

```bash
git add skills/decision-logging/scripts/write-madr.cjs tests/decision-logging/write-madr.test.cjs
git commit -m "Add writeMadr with git-root detection and minute-collision fallback"
```

---

## Task 6: `append-observation.cjs` — validator + appender (TDD)

**Files:**
- Create: `tests/decision-logging/append-observation.test.cjs`
- Create: `skills/decision-logging/scripts/append-observation.cjs`

- [ ] **Step 1: Write failing tests**

Content for `tests/decision-logging/append-observation.test.cjs`:

```javascript
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { validate, appendObservation } = require('../../skills/decision-logging/scripts/append-observation.cjs');
const { makeTempRepo, cleanupTempRepo } = require('./test-helpers.cjs');

const valid = {
  schema_version: '1.0',
  timestamp: '2026-05-25T14:30:45-07:00',
  session_id: 'abc-123',
  type: 'observation',
  confidence: 'medium',
  source: 'subagent',
  content: 'The cache key uses timestamp.',
  rationale: 'Saw cache.ts investigation pivot.',
  related_files: ['src/cache.ts'],
  related_decision: null,
  tags: ['systematic-debugging', 'caching'],
};

test('validate accepts a canonical observation', () => {
  const { valid: v, errors } = validate(valid);
  assert.strictEqual(v, true, JSON.stringify(errors));
});

test('validate rejects missing required fields', () => {
  const { valid: v, errors } = validate({ ...valid, content: undefined });
  assert.strictEqual(v, false);
  assert.ok(errors.some((e) => e.includes('content')));
});

test('validate rejects out-of-enum values', () => {
  const { valid: v1 } = validate({ ...valid, type: 'bogus' });
  assert.strictEqual(v1, false);
  const { valid: v2 } = validate({ ...valid, confidence: 'extreme' });
  assert.strictEqual(v2, false);
  const { valid: v3 } = validate({ ...valid, source: 'human' });
  assert.strictEqual(v3, false);
});

test('validate requires tags[0] to be in the source-skill enum', () => {
  const { valid: v1 } = validate({ ...valid, tags: ['not-a-skill'] });
  assert.strictEqual(v1, false);
  const { valid: v2 } = validate({ ...valid, tags: ['brainstorming', 'extra'] });
  assert.strictEqual(v2, true);
});

test('appendObservation appends a single line to observations.jsonl', () => {
  const repo = makeTempRepo();
  try {
    appendObservation(valid, { gitRoot: repo });
    appendObservation({ ...valid, content: 'second' }, { gitRoot: repo });
    const file = path.join(repo, 'docs', 'snowball', 'decisions', 'observations.jsonl');
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
    assert.strictEqual(lines.length, 2);
    assert.strictEqual(JSON.parse(lines[0]).content, 'The cache key uses timestamp.');
    assert.strictEqual(JSON.parse(lines[1]).content, 'second');
  } finally {
    cleanupTempRepo(repo);
  }
});

test('appendObservation throws on invalid input', () => {
  const repo = makeTempRepo();
  try {
    assert.throws(
      () => appendObservation({ ...valid, type: 'nope' }, { gitRoot: repo }),
      /validation/,
    );
  } finally {
    cleanupTempRepo(repo);
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd tests/decision-logging && node --test append-observation.test.cjs
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement validator + appender**

Content for `skills/decision-logging/scripts/append-observation.cjs`:

```javascript
const fs = require('fs');
const path = require('path');
const { detectGitRoot } = require('./git-root.cjs');

const TYPES = ['observation', 'implementation-choice', 'hypothesis', 'constraint'];
const CONFIDENCES = ['high', 'medium', 'low'];
const SOURCES = ['agent', 'subagent'];
const SOURCE_SKILLS = ['brainstorming', 'writing-plans', 'systematic-debugging', 'code-review', 'ambient'];

function validate(obs) {
  const errors = [];
  const requireString = (field) => {
    if (typeof obs[field] !== 'string' || !obs[field]) errors.push(`${field} required (non-empty string)`);
  };
  requireString('schema_version');
  requireString('timestamp');
  requireString('session_id');
  requireString('content');
  requireString('rationale');

  if (obs.schema_version !== '1.0') errors.push('schema_version must be "1.0"');
  if (!TYPES.includes(obs.type)) errors.push(`type must be one of ${TYPES.join(', ')}`);
  if (!CONFIDENCES.includes(obs.confidence)) errors.push(`confidence must be one of ${CONFIDENCES.join(', ')}`);
  if (!SOURCES.includes(obs.source)) errors.push(`source must be one of ${SOURCES.join(', ')}`);
  if (!Array.isArray(obs.tags) || obs.tags.length < 1) {
    errors.push('tags must be a non-empty array');
  } else if (!SOURCE_SKILLS.includes(obs.tags[0])) {
    errors.push(`tags[0] must be one of ${SOURCE_SKILLS.join(', ')}`);
  }
  if (!Array.isArray(obs.related_files)) errors.push('related_files must be an array');
  if (obs.related_decision !== null && typeof obs.related_decision !== 'string') {
    errors.push('related_decision must be string or null');
  }

  return { valid: errors.length === 0, errors };
}

function appendObservation(obs, opts = {}) {
  const result = validate(obs);
  if (!result.valid) throw new Error(`validation failed: ${result.errors.join('; ')}`);

  const gitRoot = opts.gitRoot || detectGitRoot();
  if (!gitRoot) throw new Error('not in a git repo');

  const dir = path.join(gitRoot, 'docs', 'snowball', 'decisions');
  fs.mkdirSync(dir, { recursive: true });

  const file = path.join(dir, 'observations.jsonl');
  fs.appendFileSync(file, JSON.stringify(obs) + '\n');
  return file;
}

if (require.main === module) {
  let raw = '';
  process.stdin.on('data', (chunk) => { raw += chunk; });
  process.stdin.on('end', () => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const lines = trimmed.includes('\n') ? trimmed.split('\n') : [trimmed];
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        appendObservation(JSON.parse(line));
      } catch (err) {
        process.stderr.write(`append-observation skipped line: ${err.message}\n`);
      }
    }
  });
}

module.exports = { validate, appendObservation, TYPES, CONFIDENCES, SOURCES, SOURCE_SKILLS };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd tests/decision-logging && node --test append-observation.test.cjs
```

Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add skills/decision-logging/scripts/append-observation.cjs tests/decision-logging/append-observation.test.cjs
git commit -m "Add observation validator and JSONL appender"
```

---

## Task 7: PostToolUse hook — `on-ask-user-question.sh` + bridge

**Files:**
- Create: `skills/decision-logging/scripts/ask-user-question-bridge.cjs`
- Create: `skills/decision-logging/scripts/on-ask-user-question.sh`
- Create: `tests/decision-logging/on-ask-user-question.test.sh`

- [ ] **Step 1: Write failing integration test**

Content for `tests/decision-logging/on-ask-user-question.test.sh`:

```bash
#!/usr/bin/env bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
HANDLER="$REPO_ROOT/skills/decision-logging/scripts/on-ask-user-question.sh"
FAIL=0

# Test 1: handler no-ops outside a git repo
TMP_NONGIT=$(mktemp -d)
echo '{"tool_input":{},"tool_response":{},"session_id":"s","tool_use_id":"t"}' | \
  ( cd "$TMP_NONGIT" && CLAUDE_PLUGIN_ROOT="$REPO_ROOT" bash "$HANDLER" )
status=$?
if [ "$status" -ne 0 ]; then
  echo "[FAIL] handler should exit 0 outside git repo (got $status)"
  FAIL=1
else
  echo "[PASS] handler exits 0 outside git repo"
fi
rm -rf "$TMP_NONGIT"

# Test 2: handler writes a MADR for a synthetic PostToolUse payload
TMP_REPO=$(mktemp -d)
( cd "$TMP_REPO" && git init -q && git config user.email t@t && git config user.name t )

PAYLOAD='{
  "session_id": "test-session-1",
  "tool_use_id": "tooluse-1",
  "tool_input": {
    "questions": [{
      "question": "Which storage approach should we use?",
      "header": "Storage",
      "multiSelect": false,
      "options": [
        {"label": "Two-tier", "description": "MADR + JSONL"},
        {"label": "Uniform", "description": "all MADR"}
      ]
    }]
  },
  "tool_response": {
    "answers": {"Which storage approach should we use?": "Two-tier"}
  }
}'

echo "$PAYLOAD" | ( cd "$TMP_REPO" && CLAUDE_PLUGIN_ROOT="$REPO_ROOT" bash "$HANDLER" )

DECISIONS_DIR="$TMP_REPO/docs/snowball/decisions"
if [ ! -d "$DECISIONS_DIR" ]; then
  echo "[FAIL] decisions dir not created"
  FAIL=1
else
  count=$(ls "$DECISIONS_DIR" 2>/dev/null | grep -c '\.md$' || true)
  if [ "$count" -ne 1 ]; then
    echo "[FAIL] expected 1 MADR file, got $count"
    FAIL=1
  else
    echo "[PASS] MADR file written"
    MADR_FILE=$(ls "$DECISIONS_DIR"/*.md)
    if grep -q 'capture_mechanism: ask-user-question' "$MADR_FILE" && \
       grep -q 'Two-tier' "$MADR_FILE"; then
      echo "[PASS] MADR contains capture_mechanism and chosen option"
    else
      echo "[FAIL] MADR content unexpected:"
      cat "$MADR_FILE" | sed 's/^/    /'
      FAIL=1
    fi
  fi
fi
rm -rf "$TMP_REPO"

exit $FAIL
```

Make it executable:

```bash
chmod +x tests/decision-logging/on-ask-user-question.test.sh
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bash tests/decision-logging/on-ask-user-question.test.sh
```

Expected: FAIL — handler script does not exist.

- [ ] **Step 3: Write the Node bridge**

Content for `skills/decision-logging/scripts/ask-user-question-bridge.cjs`:

```javascript
// Reads a PostToolUse payload from stdin and emits one writeMadr() call
// per question-answer pair. Errors are caught and logged; the bridge always
// exits 0 so the hook doesn't disrupt the session.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { writeMadr } = require('./write-madr.cjs');

const ERROR_LOG = path.join(os.homedir(), '.snowball', 'decision-logging-errors.log');

function logError(msg) {
  try {
    fs.mkdirSync(path.dirname(ERROR_LOG), { recursive: true });
    fs.appendFileSync(ERROR_LOG, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {
    // last-resort: nothing
  }
}

let raw = '';
process.stdin.on('data', (chunk) => { raw += chunk; });
process.stdin.on('end', () => {
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (err) {
    logError(`ask-user-question-bridge: bad JSON payload: ${err.message}`);
    process.exit(0);
  }

  const questions = (payload.tool_input && payload.tool_input.questions) || [];
  const answers = (payload.tool_response && payload.tool_response.answers) || {};
  const sessionId = payload.session_id || 'unknown';
  const sourceEventId = payload.tool_use_id || 'unknown';

  const isoDate = new Date().toISOString();

  for (const q of questions) {
    const answer = answers[q.question];
    if (!answer) continue;

    const chosen = (q.options || []).find((o) => o.label === answer)
      || { label: answer, description: '' };

    const input = {
      title: String(q.question).replace(/\?+$/, ''),
      status: 'accepted',
      date: isoDate,
      deciders: [process.env.USER || 'unknown'],
      snowball: {
        schema_version: '1.0',
        source: 'operator',
        confidence: 'high',
        capture_mechanism: 'ask-user-question',
        session_id: sessionId,
        source_event_id: sourceEventId,
        supersedes: null,
        tags: ['ambient'],
      },
      body: {
        context: q.header ? `Question category: ${q.header}.` : '',
        considered_options: (q.options || []).map((o) => ({
          name: o.label,
          description: o.description || '',
        })),
        decision_outcome: `Chose **${chosen.label}**. ${chosen.description}`,
      },
    };

    try {
      writeMadr(input);
    } catch (err) {
      logError(`ask-user-question-bridge: writeMadr failed: ${err.message}`);
    }
  }

  process.exit(0);
});
```

- [ ] **Step 4: Write the shell handler**

Content for `skills/decision-logging/scripts/on-ask-user-question.sh`:

```bash
#!/usr/bin/env bash
# PostToolUse hook for AskUserQuestion: writes one MADR per question-answer pair.
set -uo pipefail

# No-op outside a git repo
git rev-parse --show-toplevel >/dev/null 2>&1 || exit 0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRIDGE="$SCRIPT_DIR/ask-user-question-bridge.cjs"

# Bridge always exits 0 (errors logged internally); pass stdin through unchanged
node "$BRIDGE" || true
exit 0
```

Make it executable:

```bash
chmod +x skills/decision-logging/scripts/on-ask-user-question.sh
```

- [ ] **Step 5: Run test to verify it passes**

```bash
bash tests/decision-logging/on-ask-user-question.test.sh
```

Expected: three `[PASS]` lines; exit code 0.

- [ ] **Step 6: Commit**

```bash
git add skills/decision-logging/scripts/on-ask-user-question.sh skills/decision-logging/scripts/ask-user-question-bridge.cjs tests/decision-logging/on-ask-user-question.test.sh
git commit -m "Add PostToolUse hook for AskUserQuestion with Node bridge"
```

---

## Task 8: UserPromptSubmit hook — `on-user-prompt.sh` + bridge

**Files:**
- Create: `skills/decision-logging/scripts/user-prompt-bridge.cjs`
- Create: `skills/decision-logging/scripts/on-user-prompt.sh`
- Create: `tests/decision-logging/on-user-prompt.test.sh`

- [ ] **Step 1: Write failing integration test**

Content for `tests/decision-logging/on-user-prompt.test.sh`:

```bash
#!/usr/bin/env bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
HANDLER="$REPO_ROOT/skills/decision-logging/scripts/on-user-prompt.sh"
FAIL=0

# Test 1: non-approval prompt → no MADR
TMP_REPO=$(mktemp -d)
( cd "$TMP_REPO" && git init -q && git config user.email t@t && git config user.name t )

echo '{"prompt":"what about edge case X","session_id":"s1"}' | \
  ( cd "$TMP_REPO" && CLAUDE_PLUGIN_ROOT="$REPO_ROOT" bash "$HANDLER" )

if [ -d "$TMP_REPO/docs/snowball/decisions" ] && [ -n "$(ls "$TMP_REPO/docs/snowball/decisions" 2>/dev/null)" ]; then
  echo "[FAIL] non-approval prompt should not write MADR"
  FAIL=1
else
  echo "[PASS] non-approval prompt no-ops"
fi

# Test 2: approval prompt → writes MADR
echo '{"prompt":"lgtm","session_id":"s1"}' | \
  ( cd "$TMP_REPO" && CLAUDE_PLUGIN_ROOT="$REPO_ROOT" bash "$HANDLER" )

count=$(ls "$TMP_REPO/docs/snowball/decisions"/*.md 2>/dev/null | wc -l | tr -d ' ')
if [ "$count" -ne 1 ]; then
  echo "[FAIL] approval prompt should write 1 MADR, got $count"
  FAIL=1
else
  MADR_FILE=$(ls "$TMP_REPO/docs/snowball/decisions"/*.md)
  if grep -q 'capture_mechanism: user-prompt-pattern' "$MADR_FILE"; then
    echo "[PASS] approval prompt writes MADR with capture_mechanism=user-prompt-pattern"
  else
    echo "[FAIL] capture_mechanism wrong:"
    cat "$MADR_FILE" | sed 's/^/    /'
    FAIL=1
  fi
fi

# Test 3: approval right after ask-user-question MADR → dedupes
NOW_ISO=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EXISTING="$TMP_REPO/docs/snowball/decisions/$(date -u +%Y-%m-%dT%H%M)-existing-aq.md"
cat > "$EXISTING" <<EOF
---
title: existing
status: accepted
date: $NOW_ISO
deciders: [t]
snowball:
  schema_version: "1.0"
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: s1
  source_event_id: e1
  supersedes: null
  tags: [ambient]
---

# existing
EOF

before=$(ls "$TMP_REPO/docs/snowball/decisions"/*.md | wc -l | tr -d ' ')
echo '{"prompt":"ship it","session_id":"s1"}' | \
  ( cd "$TMP_REPO" && CLAUDE_PLUGIN_ROOT="$REPO_ROOT" bash "$HANDLER" )
after=$(ls "$TMP_REPO/docs/snowball/decisions"/*.md | wc -l | tr -d ' ')

if [ "$after" -eq "$before" ]; then
  echo "[PASS] dedup suppresses MADR after recent ask-user-question"
else
  echo "[FAIL] dedup failed: before=$before after=$after"
  FAIL=1
fi

rm -rf "$TMP_REPO"
exit $FAIL
```

Make it executable:

```bash
chmod +x tests/decision-logging/on-user-prompt.test.sh
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bash tests/decision-logging/on-user-prompt.test.sh
```

Expected: FAIL — handler does not exist.

- [ ] **Step 3: Write the Node bridge**

Content for `skills/decision-logging/scripts/user-prompt-bridge.cjs`:

```javascript
// Reads UserPromptSubmit payload from stdin; if it matches APPROVAL_PHRASES,
// writes a MADR with capture_mechanism=user-prompt-pattern, unless a recent
// ask-user-question MADR already captured the same operator approval.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { matchesApproval } = require('./approval-phrases.cjs');
const { writeMadr } = require('./write-madr.cjs');
const { detectGitRoot } = require('./git-root.cjs');

const ERROR_LOG = path.join(os.homedir(), '.snowball', 'decision-logging-errors.log');
const DEDUP_WINDOW_MS = 60 * 1000;

function logError(msg) {
  try {
    fs.mkdirSync(path.dirname(ERROR_LOG), { recursive: true });
    fs.appendFileSync(ERROR_LOG, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}

function isRecentAskUserQuestion(gitRoot) {
  const dir = path.join(gitRoot, 'docs', 'snowball', 'decisions');
  if (!fs.existsSync(dir)) return false;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
  if (!files.length) return false;
  const latest = path.join(dir, files[files.length - 1]);
  const stat = fs.statSync(latest);
  if (Date.now() - stat.mtimeMs > DEDUP_WINDOW_MS) return false;
  const content = fs.readFileSync(latest, 'utf8');
  return /capture_mechanism:\s*ask-user-question/.test(content);
}

let raw = '';
process.stdin.on('data', (chunk) => { raw += chunk; });
process.stdin.on('end', () => {
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (err) {
    logError(`user-prompt-bridge: bad JSON: ${err.message}`);
    process.exit(0);
  }

  const prompt = payload.prompt || '';
  const sessionId = payload.session_id || 'unknown';

  if (!matchesApproval(prompt)) process.exit(0);

  const gitRoot = detectGitRoot();
  if (!gitRoot) process.exit(0);

  if (isRecentAskUserQuestion(gitRoot)) process.exit(0);

  const isoDate = new Date().toISOString();
  const input = {
    title: 'Free-text operator approval',
    status: 'accepted',
    date: isoDate,
    deciders: [process.env.USER || 'unknown'],
    snowball: {
      schema_version: '1.0',
      source: 'operator',
      confidence: 'high',
      capture_mechanism: 'user-prompt-pattern',
      session_id: sessionId,
      source_event_id: `prompt-${Date.now()}`,
      supersedes: null,
      tags: ['ambient'],
    },
    body: {
      context: `Operator submitted approval phrase: "${prompt.trim()}"`,
      decision_outcome:
        "Approved the agent's most recent proposal. (Body is a stub; operator may expand with specifics.)",
    },
  };

  try {
    writeMadr(input);
  } catch (err) {
    logError(`user-prompt-bridge: writeMadr failed: ${err.message}`);
  }

  process.exit(0);
});
```

- [ ] **Step 4: Write the shell handler**

Content for `skills/decision-logging/scripts/on-user-prompt.sh`:

```bash
#!/usr/bin/env bash
# UserPromptSubmit hook: pattern-matches approval phrases; writes MADR if no recent dedup.
set -uo pipefail

git rev-parse --show-toplevel >/dev/null 2>&1 || exit 0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRIDGE="$SCRIPT_DIR/user-prompt-bridge.cjs"

node "$BRIDGE" || true
exit 0
```

Make it executable:

```bash
chmod +x skills/decision-logging/scripts/on-user-prompt.sh
```

- [ ] **Step 5: Run test to verify it passes**

```bash
bash tests/decision-logging/on-user-prompt.test.sh
```

Expected: three `[PASS]` lines; exit code 0.

- [ ] **Step 6: Commit**

```bash
git add skills/decision-logging/scripts/on-user-prompt.sh skills/decision-logging/scripts/user-prompt-bridge.cjs tests/decision-logging/on-user-prompt.test.sh
git commit -m "Add UserPromptSubmit hook with approval-phrase match and 60s dedup"
```

---

## Task 9: Subagent extraction prompt

**Files:**
- Create: `skills/decision-logging/scripts/extract-observations.md`

- [ ] **Step 1: Write the prompt**

Content for `skills/decision-logging/scripts/extract-observations.md`:

````markdown
You are reviewing a Claude Code session transcript. Extract agent observations,
implementation choices, hypotheses, and discovered constraints into JSONL lines.

## Rules

Be high-recall and low-precision: capture candidate observations even when
uncertain. Set `confidence` to reflect how strongly the transcript supports
each observation.

**Do NOT extract:**
- Routine tool calls (Read, Bash for setup, simple Edit operations)
- Conversational filler ("Let me check...", "I'll look at...")
- Completed-task acknowledgements

**DO extract:**
- Moments where the agent recognised a pattern in the codebase
- Choices the agent made between alternatives without operator input
- Hypotheses the agent formed (e.g. "the bug might be in X")
- Constraints the agent discovered (e.g. "the API only accepts Y")

## Schema (version 1.0)

Each output line is a single JSON object:

```json
{
  "schema_version": "1.0",
  "timestamp": "ISO-8601 datetime with timezone",
  "session_id": "from transcript metadata",
  "type": "observation | implementation-choice | hypothesis | constraint",
  "confidence": "high | medium | low",
  "source": "subagent",
  "content": "the observation, one or two sentences",
  "rationale": "what in the transcript supports this — quote or paraphrase the supporting moment",
  "related_files": ["file/paths/from/transcript"],
  "related_decision": null,
  "tags": ["<source-skill>", "<freeform tag>"]
}
```

The first tag must be one of: `brainstorming | writing-plans | systematic-debugging | code-review | ambient`. Pick the source skill if the observation arose during a skill-driven phase; otherwise use `ambient`.

`rationale` is required and must reference what in the transcript supports the
observation. Without rationale, the observation is unfalsifiable — flannel needs
the audit hook.

## Output format

One JSON object per line. Nothing else — no preamble, no commentary, no markdown
fencing. If you find no extractable observations, output zero lines.
````

- [ ] **Step 2: Commit**

```bash
git add skills/decision-logging/scripts/extract-observations.md
git commit -m "Add subagent extraction prompt for observation stream"
```

---

## Task 10: Stop hook + extraction worker

**Files:**
- Create: `skills/decision-logging/scripts/extract-worker.sh`
- Create: `skills/decision-logging/scripts/on-stop.sh`
- Create: `tests/decision-logging/on-stop.test.sh`

- [ ] **Step 1: Write extract-worker.sh**

Content for `skills/decision-logging/scripts/extract-worker.sh`:

```bash
#!/usr/bin/env bash
# Detached background worker: reads transcript, calls claude -p, appends observations.
set -uo pipefail

SESSION_ID="$1"
GIT_ROOT="$2"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROMPT_FILE="$SCRIPT_DIR/extract-observations.md"
APPENDER="$SCRIPT_DIR/append-observation.cjs"
ERROR_LOG="$HOME/.snowball/decision-logging-errors.log"
mkdir -p "$(dirname "$ERROR_LOG")"

# Encode project path the way Claude Code stores transcripts: leading dash, then '/' → '-'
ENCODED="-$(echo "$GIT_ROOT" | sed 's|^/||; s|/|-|g')"
TRANSCRIPT="$HOME/.claude/projects/$ENCODED/$SESSION_ID.jsonl"

if [ ! -f "$TRANSCRIPT" ]; then
  echo "[$(date)] transcript not found: $TRANSCRIPT" >> "$ERROR_LOG"
  exit 0
fi

# Invoke headless claude with the extraction prompt; pipe transcript on stdin
SYSTEM_PROMPT=$(cat "$PROMPT_FILE")
EXTRACTION=$(claude -p \
  --append-system-prompt "$SYSTEM_PROMPT" \
  --output-format text \
  < "$TRANSCRIPT" 2>>"$ERROR_LOG") || {
    echo "[$(date)] claude -p failed for session $SESSION_ID" >> "$ERROR_LOG"
    exit 0
  }

# Pipe extracted JSONL to the appender (it skips invalid lines internally)
echo "$EXTRACTION" | ( cd "$GIT_ROOT" && node "$APPENDER" ) 2>>"$ERROR_LOG"
```

Make it executable:

```bash
chmod +x skills/decision-logging/scripts/extract-worker.sh
```

- [ ] **Step 2: Write on-stop.sh**

Content for `skills/decision-logging/scripts/on-stop.sh`:

```bash
#!/usr/bin/env bash
# Stop hook: forks the extraction worker as a detached subprocess and returns immediately.
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

nohup bash "$WORKER" "$SESSION_ID" "$GIT_ROOT" >> "$LOG_DIR/decision-logging.log" 2>&1 &
disown

exit 0
```

Make it executable:

```bash
chmod +x skills/decision-logging/scripts/on-stop.sh
```

- [ ] **Step 3: Write integration test**

Content for `tests/decision-logging/on-stop.test.sh`:

```bash
#!/usr/bin/env bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
HANDLER="$REPO_ROOT/skills/decision-logging/scripts/on-stop.sh"
FAIL=0

# Test 1: on-stop returns within 2 seconds (detached fork)
TMP_REPO=$(mktemp -d)
( cd "$TMP_REPO" && git init -q && git config user.email t@t && git config user.name t )

START=$(date +%s)
echo '{"session_id":"nonexistent-session"}' | \
  ( cd "$TMP_REPO" && CLAUDE_PLUGIN_ROOT="$REPO_ROOT" bash "$HANDLER" )
END=$(date +%s)
ELAPSED=$((END - START))

if [ "$ELAPSED" -le 2 ]; then
  echo "[PASS] on-stop returns quickly ($ELAPSED s)"
else
  echo "[FAIL] on-stop blocked too long ($ELAPSED s)"
  FAIL=1
fi

# Test 2: on-stop no-ops outside git repo
TMP_NONGIT=$(mktemp -d)
echo '{"session_id":"x"}' | \
  ( cd "$TMP_NONGIT" && CLAUDE_PLUGIN_ROOT="$REPO_ROOT" bash "$HANDLER" )
status=$?
if [ "$status" -eq 0 ]; then
  echo "[PASS] on-stop no-ops outside git repo"
else
  echo "[FAIL] on-stop exit $status outside git repo"
  FAIL=1
fi

# Test 3: on-stop no-ops on missing session_id
echo '{}' | ( cd "$TMP_REPO" && CLAUDE_PLUGIN_ROOT="$REPO_ROOT" bash "$HANDLER" )
status=$?
if [ "$status" -eq 0 ]; then
  echo "[PASS] on-stop no-ops with missing session_id"
else
  echo "[FAIL] on-stop exit $status with missing session_id"
  FAIL=1
fi

rm -rf "$TMP_REPO" "$TMP_NONGIT"
exit $FAIL
```

Make it executable:

```bash
chmod +x tests/decision-logging/on-stop.test.sh
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bash tests/decision-logging/on-stop.test.sh
```

Expected: three `[PASS]` lines; exit code 0.

(Note: the extract-worker's actual `claude -p` invocation is not exercised by these tests — it requires API auth and costs tokens. The worker is exercised manually in the smoke test below.)

- [ ] **Step 5: Commit**

```bash
git add skills/decision-logging/scripts/on-stop.sh skills/decision-logging/scripts/extract-worker.sh tests/decision-logging/on-stop.test.sh
git commit -m "Add Stop hook with detached extraction worker"
```

---

## Task 11: Register hooks in `hooks/hooks.json`

**Files:**
- Modify: `hooks/hooks.json`

- [ ] **Step 1: Read current hooks.json**

```bash
cat hooks/hooks.json
```

Expected current content:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|clear|compact",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd\" session-start",
            "async": false
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2: Replace `hooks/hooks.json`**

New content for `hooks/hooks.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|clear|compact",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd\" session-start",
            "async": false
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "AskUserQuestion",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}/skills/decision-logging/scripts/on-ask-user-question.sh\"",
            "async": false
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}/skills/decision-logging/scripts/on-user-prompt.sh\"",
            "async": false
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}/skills/decision-logging/scripts/on-stop.sh\"",
            "async": false
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 3: Validate JSON**

```bash
node -e 'JSON.parse(require("fs").readFileSync("hooks/hooks.json","utf8")); console.log("valid")'
```

Expected: `valid`.

- [ ] **Step 4: Commit**

```bash
git add hooks/hooks.json
git commit -m "Register PostToolUse, UserPromptSubmit, and Stop hooks for decision logging"
```

---

## Task 12: Polish SKILL.md and full test runner

**Files:**
- Modify: `skills/decision-logging/SKILL.md` (replace stub with complete docs)
- Modify: `tests/decision-logging/package.json` (add shell-test scripts)

- [ ] **Step 1: Replace SKILL.md**

New content for `skills/decision-logging/SKILL.md`:

````markdown
---
name: decision-logging
description: Documents the snowball decision-logging schema and capture mechanism. This skill is reference documentation for the hook-driven decision capture system. Agents do not invoke this skill directly — hooks do the work. Use to look up MADR/JSONL schema, capture-mechanism enum values, or flannel ingestion contract.
---

# Decision Logging

Captures decisions made during snowball-driven Claude Code sessions, in two streams:

1. **Operator decisions** (high confidence) as MADR-compatible markdown at `<repo>/docs/snowball/decisions/<timestamp>-<slug>.md`.
2. **Agent observations** (lower confidence) as JSONL at `<repo>/docs/snowball/decisions/observations.jsonl`.

Designed for external consumers like flannel to ingest as Design Rationale data, and for future agents in the same repo to re-consume as operational context.

See `references/schema.md` for the schema contract.
See `docs/snowball/specs/2026-05-25-decision-logging-design.md` for the full design.

## Capture mechanisms

Three Claude Code hooks emit decisions automatically:

| Hook | Trigger | Produces |
|---|---|---|
| PostToolUse on `AskUserQuestion` | User picks an option from a structured prompt | One MADR per question-answer pair (`capture_mechanism: ask-user-question`) |
| UserPromptSubmit (pattern match) | User submits a free-text prompt matching an approval phrase | One MADR (`capture_mechanism: user-prompt-pattern`), deduped against recent `ask-user-question` captures |
| Stop → detached worker | Session ends | Headless `claude -p` extracts observations from the transcript; appends to `observations.jsonl` (`source: subagent`). May also write missed operator decisions as MADRs (`capture_mechanism: stop-hook-subagent`). |

All hooks no-op silently when the session is outside a git repo.

## Why hooks, not skill cross-references

Capture is passive: no existing skill needs modification, and operators don't need to remember to log decisions. The brainstorming, writing-plans, systematic-debugging, and code-review skills are untouched — they generate the events; the hooks observe them.

## Privacy notes

- The Stop-hook subagent reads the **full session transcript**. Same trust boundary as the main session, but operators in sensitive projects should review observations.jsonl entries before commit and consider `.gitignore`-ing the file.
- `observations.jsonl` and MADR files may contain file paths, code snippets, or API responses from the session.

## Flannel ingestion contract

Snowball commits to the schema in `references/schema.md` with `schema_version: "1.0"` for Phase 1. Additive changes bump minor; breaking changes bump major. Flannel scans known repo paths via its own filesystem-side configuration; snowball does not maintain a global registry.

## Phase 1 limitations

- Claude Code only — `AskUserQuestion` is harness-specific.
- Source-skill tag defaults to `ambient`; transcript-based skill detection is deferred to Phase 2.
- No manual `/log-decision` slash command yet.
- No `superseded` linkage automation — operators hand-edit.
````

- [ ] **Step 2: Update test package.json**

Replace `tests/decision-logging/package.json` with:

```json
{
  "name": "decision-logging-tests",
  "version": "1.0.0",
  "scripts": {
    "test": "npm run test:unit && npm run test:integration",
    "test:unit": "node --test approval-phrases.test.cjs write-madr.test.cjs append-observation.test.cjs",
    "test:integration": "bash on-ask-user-question.test.sh && bash on-user-prompt.test.sh && bash on-stop.test.sh"
  },
  "dependencies": {
    "js-yaml": "^4.1.0"
  }
}
```

- [ ] **Step 3: Run the full test suite**

```bash
cd tests/decision-logging && npm test
```

Expected: unit tests all pass (Node test reporter); then three shell tests each print their `[PASS]` lines and exit 0.

- [ ] **Step 4: Commit**

```bash
git add skills/decision-logging/SKILL.md tests/decision-logging/package.json
git commit -m "Polish decision-logging SKILL.md and add full test runner"
```

---

## Self-Review checklist

After implementing all tasks, verify against the spec:

1. **Spec section: Goals** — every goal has at least one task:
   - Operator MADR persistence: Tasks 4, 5, 7, 8
   - Observation JSONL persistence: Tasks 6, 9, 10
   - Passive capture (no skill modifications): Tasks 7, 8, 10
   - In-repo committed artifacts: Tasks 4, 5, 6 (paths under git root)
   - Stable schema with versioning: Task 1 (`schema.md`), Tasks 5, 6 (schema_version emitted)

2. **Spec section: Components** — every file in the spec's component listing is created:
   - `skills/decision-logging/SKILL.md` — Tasks 1, 12
   - `references/schema.md` — Task 1
   - `scripts/write-madr.cjs` — Tasks 4, 5
   - `scripts/append-observation.cjs` — Task 6
   - `scripts/approval-phrases.cjs` — Task 3
   - `scripts/extract-observations.md` — Task 9
   - `scripts/on-ask-user-question.sh` — Task 7
   - `scripts/on-user-prompt.sh` — Task 8
   - `scripts/on-stop.sh` — Task 10
   - `scripts/extract-worker.sh` — Task 10
   - `hooks/hooks.json` updated — Task 11
   - Plus design refinements: `git-root.cjs` (Task 4), bridge files (Tasks 7, 8)

3. **Spec section: Schemas** — MADR and JSONL schemas implemented:
   - Closed enums for status, source, confidence, capture_mechanism, tags[0], type — Tasks 4, 6
   - `schema_version: "1.0"` — Tasks 5, 6
   - Required vs optional body sections — Task 4

4. **Spec section: Hook handlers** — Logic implemented:
   - Git-root detection via `git rev-parse --show-toplevel` — Tasks 4, 7, 8, 10
   - PostToolUse parses questions array + answers — Task 7
   - UserPromptSubmit pattern-matches APPROVAL_PHRASES — Tasks 3, 8
   - 60s dedup window against ask-user-question — Task 8
   - Stop hook forks via `nohup ... & disown` — Task 10
   - All hooks no-op on missing git root — Tasks 7, 8, 10

5. **Spec section: Operational concerns** — Failure modes:
   - All hooks exit 0 on handled errors — Tasks 7, 8, 10
   - Errors logged to `~/.snowball/decision-logging-errors.log` — Tasks 7, 8, 10
   - Decisions dir created on demand — Tasks 5, 6
   - Invalid JSONL lines skipped + logged — Task 6

6. **Spec section: Testing strategy** — All three test groups present:
   - Writer-unit tests — Tasks 3, 4, 5, 6
   - Hook-integration tests — Tasks 7, 8, 10
   - **Extraction-subagent tests deferred (would require API auth + cost tokens).** The Stop hook fork mechanism is tested; the actual `claude -p` extraction is verified by the manual smoke test below. **Known gap.**

**Manual smoke test after all tasks complete:**

1. Run a real Claude Code session in a test repo (or in snowball itself).
2. Use `AskUserQuestion` once → verify a MADR appears in `docs/snowball/decisions/`.
3. Reply "lgtm" to a free-text proposal → verify a second MADR appears.
4. End the session → wait 30s → check `~/.snowball/decision-logging.log` for worker activity and `docs/snowball/decisions/observations.jsonl` for appended observations.

---

## Execution Handoff

Plan complete and saved to `docs/snowball/plans/2026-05-25-decision-logging.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
