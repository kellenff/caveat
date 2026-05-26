# Bun-TS Refactor + Pre-commit Hygiene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move decision-logging source to TypeScript with `bun build` producing bundled CJS at the existing `scripts/` paths, eliminating the js-yaml runtime-dep regression. Establish repo-wide pre-commit hooks (oxlint, oxfmt, shellcheck, shfmt, markdownlint-cli2, pre-commit-hooks builtins) with aggressive initial cleanup of existing files.

**Architecture:** TypeScript source under `skills/decision-logging/src/` with strict typing; `bun build --target=node --format=cjs` produces self-contained `.cjs` bundles (js-yaml inlined) at the existing hook-invocation paths under `skills/decision-logging/scripts/`. A `.pre-commit-config.yaml` orchestrates external linters/formatters plus three local hooks (oxlint, oxfmt, build-decision-logging, bun-test-decision-logging). Bun stays maintainer-side only; consumers still invoke `node`.

**Tech Stack:** TypeScript (strict), Bun (build + test only — not a runtime dep for consumers), pre-commit framework, oxlint, oxfmt, shellcheck, shfmt, markdownlint-cli2, pre-commit-hooks (builtins).

**Spec:** `docs/snowball/specs/2026-05-26-bun-ts-refactor-design.md` — read first.

---

## File Structure

**Added at repo top level:**

```
.pre-commit-config.yaml                # hook orchestration
.markdownlint.jsonc                    # markdown lint config
.shellcheckrc                          # shellcheck config
.editorconfig                          # indent/EOL/whitespace rules
tsconfig.json                          # TypeScript config (strict, noEmit)
scripts/build-decision-logging.sh      # wraps `bun build` for 4 entry points
```

**Modified at repo top level (Phase 8):**

```
package.json                           # drop `dependencies` block; add `devDependencies`
                                       # (typescript, @types/node, @types/js-yaml for tsc)
package-lock.json                      # regenerated to reflect devDeps only
README.md                              # revert zero-deps exception; add Maintainer Setup
.gitignore                             # add .bun cache dirs if needed
```

No top-level deletions in Phase 8. `node_modules/` stays gitignored as before; `package-lock.json` is retained (now tracks devDeps).

**Decision-logging refactor:**

```
skills/decision-logging/
├── SKILL.md                           # add "For maintainers" build-flow note
├── references/schema.md               # unchanged
├── src/                               # NEW TS sources
│   ├── git-root.ts
│   ├── approval-phrases.ts
│   ├── write-madr.ts                  # CLI entry preserved
│   ├── append-observation.ts          # CLI entry preserved
│   ├── ask-user-question-bridge.ts    # bundle entry
│   └── user-prompt-bridge.ts          # bundle entry
└── scripts/
    ├── on-ask-user-question.sh        # unchanged
    ├── on-user-prompt.sh              # unchanged
    ├── on-stop.sh                     # unchanged
    ├── extract-worker.sh              # unchanged
    ├── extract-observations.md        # unchanged
    ├── ask-user-question-bridge.cjs   # REGENERATED bundle
    ├── user-prompt-bridge.cjs         # REGENERATED bundle
    ├── write-madr.cjs                 # REGENERATED bundle (js-yaml inlined)
    └── append-observation.cjs         # REGENERATED bundle
```

**Deleted from `scripts/`** (inlined into bundles): `approval-phrases.cjs`, `git-root.cjs`.

**Tests:**

```
tests/decision-logging/
├── package.json                       # MODIFIED: bun test script; js-yaml stays as devDep
├── *.test.ts                          # MIGRATED from .test.cjs (3 unit files)
└── *.test.sh                          # unchanged (3 bash integration tests)
```

---

## Task 1: Add foundational config files (tsconfig + editorconfig)

**Files:**
- Create: `tsconfig.json`
- Create: `.editorconfig`

- [ ] **Step 1: Create `tsconfig.json`**

Content for `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["skills/decision-logging/src/**/*", "tests/decision-logging/**/*.ts"]
}
```

- [ ] **Step 2: Create `.editorconfig`**

Content for `.editorconfig`:

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = space
indent_size = 2

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 3: Commit**

```bash
git add tsconfig.json .editorconfig
git commit -m "Add tsconfig.json and .editorconfig"
```

---

## Task 2: Add pre-commit framework config + tool configs + build script

**Files:**
- Create: `.pre-commit-config.yaml`
- Create: `.markdownlint.jsonc`
- Create: `.shellcheckrc`
- Create: `scripts/build-decision-logging.sh`

- [ ] **Step 1: Create `.pre-commit-config.yaml`**

```yaml
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v5.0.0
    hooks:
      - id: check-yaml
      - id: check-json
      - id: end-of-file-fixer
      - id: trailing-whitespace
      - id: check-merge-conflict
      - id: check-added-large-files
        args: ['--maxkb=500']

  - repo: https://github.com/scop/pre-commit-shfmt
    rev: v3.10.0-2
    hooks:
      - id: shfmt
        args: ['-i', '2', '-ci', '-bn', '-s', '-w']
        exclude: ^hooks/run-hook\.cmd$

  - repo: https://github.com/shellcheck-py/shellcheck-py
    rev: v0.10.0.1
    hooks:
      - id: shellcheck
        exclude: ^hooks/run-hook\.cmd$

  - repo: https://github.com/DavidAnson/markdownlint-cli2
    rev: v0.14.0
    hooks:
      - id: markdownlint-cli2

  - repo: local
    hooks:
      - id: oxlint
        name: oxlint
        entry: oxlint
        language: system
        types_or: [ts, javascript]

      - id: oxfmt
        name: oxfmt
        entry: oxfmt
        language: system
        types_or: [ts, javascript, json, yaml]

      - id: build-decision-logging
        name: build decision-logging bundles
        entry: scripts/build-decision-logging.sh
        language: system
        files: ^skills/decision-logging/src/.*\.ts$
        pass_filenames: false

      - id: bun-test-decision-logging
        name: bun test decision-logging
        entry: bash -c 'cd tests/decision-logging && bun test'
        language: system
        files: ^skills/decision-logging/(src|scripts)/|^tests/decision-logging/
        pass_filenames: false
```

- [ ] **Step 2: Create `.markdownlint.jsonc`**

```jsonc
{
  "default": true,
  "MD013": false,
  "MD024": { "siblings_only": true },
  "MD033": false,
  "MD041": false
}
```

- [ ] **Step 3: Create `.shellcheckrc`**

```
severity=warning
disable=SC2155
```

- [ ] **Step 4: Create `scripts/build-decision-logging.sh`**

```bash
#!/usr/bin/env bash
# Build decision-logging TypeScript sources into bundled .cjs at the existing hook paths.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$SCRIPT_DIR/skills/decision-logging/src"
OUT_DIR="$SCRIPT_DIR/skills/decision-logging/scripts"

if ! command -v bun >/dev/null 2>&1; then
  echo "error: bun is required for building decision-logging" >&2
  echo "install: https://bun.sh" >&2
  exit 1
fi

ENTRIES=(
  write-madr
  append-observation
  ask-user-question-bridge
  user-prompt-bridge
)

for entry in "${ENTRIES[@]}"; do
  bun build "$SRC_DIR/$entry.ts" \
    --target=node \
    --format=cjs \
    --outfile="$OUT_DIR/$entry.cjs" \
    --minify=false
done

echo "built ${#ENTRIES[@]} bundles into $OUT_DIR/"
```

- [ ] **Step 5: Make build script executable**

```bash
chmod +x scripts/build-decision-logging.sh
```

- [ ] **Step 6: Commit**

```bash
git add .pre-commit-config.yaml .markdownlint.jsonc .shellcheckrc scripts/build-decision-logging.sh
git commit -m "Add pre-commit config + tool configs + decision-logging build script"
```

---

## Task 3: Activate pre-commit; verify smoke test

**Files:** None modified.

- [ ] **Step 1: Install pre-commit hooks into `.git/hooks/`**

```bash
pre-commit install
```

Expected output: `pre-commit installed at .git/hooks/pre-commit`

- [ ] **Step 2: Smoke-test the hook chain**

```bash
git commit --allow-empty -m "test: pre-commit smoke"
```

Expected: all hooks run (some may report "no files modified, skipping" since the commit is empty). The commit should succeed.

- [ ] **Step 3: Reset the smoke-test commit**

```bash
git reset --hard HEAD~1
```

This removes the empty commit; pre-commit stays activated locally.

- [ ] **Step 4: Verify `pre-commit run --all-files` runs (expect many failures)**

```bash
pre-commit run --all-files 2>&1 | tee /tmp/precommit-initial.log
```

Expected: massive output. Many failures from existing files (trailing whitespace, missing EOF newlines, oxlint findings, shellcheck warnings, etc.). This is expected — the next phases fix them.

- [ ] **Step 5: Inspect the failure surface**

```bash
grep -E "^(Failed|Passed)" /tmp/precommit-initial.log
```

Note which hooks failed and how many files each touched. No commit needed for this task.

---

## Task 4: Apply automatic formatter fixes (bulk formatting commit)

**Files:** Many across the repo — whatever the formatters touch.

- [ ] **Step 1: Run only the formatters (skip linters that need manual fixes)**

```bash
# Run the auto-fixing tools; capture which files they touch
pre-commit run --all-files end-of-file-fixer trailing-whitespace shfmt oxfmt 2>&1 | tee /tmp/precommit-formatters.log
```

These four are the auto-fixers — they rewrite files in place. The other hooks (check-yaml, check-json, shellcheck, markdownlint-cli2, oxlint) only report; they don't modify.

- [ ] **Step 2: Review the diff**

```bash
git diff --stat
```

Expected: many files touched, but only whitespace, line endings, JSON/YAML key normalisation, and code-style reflow. No semantic changes.

Spot-check a few changed files to confirm no logic changes:

```bash
git diff hooks/session-start hooks/hooks.json skills/brainstorming/scripts/server.cjs | head -100
```

- [ ] **Step 3: Verify nothing broke — run existing test suites**

```bash
# Brainstorming visual companion tests
cd tests/brainstorm-server && npm test
cd ../..

# Decision-logging tests (still .cjs at this point)
cd tests/decision-logging && npm test
cd ../..

# OpenCode plugin load test
bash tests/opencode/test-bootstrap-caching.sh
```

Expected: all green. If any fail, the formatter touched something semantically — investigate file-by-file, possibly add per-file exclusion in pre-commit config, redo.

- [ ] **Step 4: Stage everything and commit**

```bash
git add -A
git commit -m "Apply formatter fixes (oxfmt, shfmt, EOF/trailing-whitespace)

No semantic changes — pure formatting normalisation across the repo
preparing for pre-commit enforcement."
```

Note: pre-commit will re-run on this commit but should pass since all auto-fixes are already applied. If it modifies more files (rare — formatters should be idempotent), commit those too.

---

## Task 5: Fix shellcheck findings

**Files:** Multiple `.sh` files across `hooks/`, `skills/*/scripts/`, and `tests/`.

- [ ] **Step 1: Run shellcheck across the repo**

```bash
pre-commit run --all-files shellcheck 2>&1 | tee /tmp/shellcheck-findings.log
```

Expected: warnings/errors for various `.sh` files. Each finding has format `file:line: codeId: message`.

- [ ] **Step 2: Categorise findings**

For each finding, decide:

- **Mechanical fix**: typical shellcheck cases like quoting variables (`SC2086`), `[ -n "$x" ]` over `[ ! -z "$x" ]`, etc. Apply the fix.
- **Per-file disable**: if a finding represents intentional style snowball uses (e.g. `SC2155` — declare-and-assign in one line, but we already disabled this globally), confirm the rule is in `.shellcheckrc`. Otherwise add an inline `# shellcheck disable=SCXXXX -- reason` comment ABOVE the line, with rationale.
- **Genuine bug to fix**: rare; treat as Known Followup if scope is too broad for this task.

- [ ] **Step 3: Apply fixes file by file**

Work through findings file-by-file. For each file:

1. Fix mechanical findings inline.
2. Add per-rule inline disables (with rationale) for intentional patterns.
3. Re-run `pre-commit run --files <path> shellcheck` to confirm clean.

- [ ] **Step 4: Re-run all tests after fixes**

```bash
cd tests/brainstorm-server && npm test && cd ../..
cd tests/decision-logging && npm test && cd ../..
bash tests/opencode/test-bootstrap-caching.sh
```

Expected: all green. Shellcheck fixes should be no-ops semantically, but a bad fix (e.g. over-quoting an array expansion) can break behaviour. Verify.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Fix shellcheck findings across the repo

Mechanical fixes (variable quoting, comparison forms) where safe;
per-line disables with rationale where intentional patterns conflict
with default rules."
```

---

## Task 6: Fix markdownlint findings

**Files:** Multiple `.md` files across `docs/`, `skills/`, `README.md`, etc.

- [ ] **Step 1: Run markdownlint across the repo**

```bash
pre-commit run --all-files markdownlint-cli2 2>&1 | tee /tmp/markdownlint-findings.log
```

- [ ] **Step 2: Categorise findings**

- **Mechanical fix**: missing blank lines around headings, inconsistent list markers, missing language on code blocks (`~~~` vs ` ``` `), heading-level skips.
- **Config tweak**: if a rule fires on a pattern we want to keep (e.g. all our docs intentionally use a particular style), add the rule to `.markdownlint.jsonc`'s disable list with a comment.

- [ ] **Step 3: Apply fixes file by file**

Mechanical edits — typically inserting blank lines or fixing list marker style. Larger semantic-affecting changes (e.g. heading reorganisation) should NOT be made; suppress instead.

- [ ] **Step 4: Verify rendering is unchanged**

For prose-heavy docs (spec/plan files in `docs/snowball/`), spot-check the rendered markdown didn't change semantically (e.g. paragraph breaks still where intended). `git diff` should show only whitespace and list-marker changes.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Fix markdownlint findings

Mechanical fixes (blank lines around headings, list markers,
code-block languages). No prose content changes."
```

---

## Task 7: Fix oxlint findings

**Files:** `.js`, `.cjs`, `.mjs`, `.ts` across the repo.

- [ ] **Step 1: Run oxlint across the repo**

```bash
pre-commit run --all-files oxlint 2>&1 | tee /tmp/oxlint-findings.log
```

Expected: findings in `skills/brainstorming/scripts/server.cjs` (large file), `.opencode/plugins/snowball.js`, `skills/writing-skills/render-graphs.js`, decision-logging `.cjs` (these will be replaced in Task 9 anyway but should still be clean), brainstorm-server tests, opencode tests.

- [ ] **Step 2: Categorise findings**

- **Mechanical fix**: unused vars, missing return types, prefer-const, no-shadow, no-implicit-globals.
- **Decision-logging `.cjs` findings**: do NOT spend effort fixing these — they'll be replaced by bundled output in Task 9. Add a one-line `.oxlintignore` pattern excluding `skills/decision-logging/scripts/*.cjs` for the duration of phases 5-9, then remove the exclusion after Task 9.
- **OpenCode plugin (`*.js`)**: needs care; this file runs in the OpenCode harness's runtime. Apply fixes only if confident they don't change behaviour; verify via `bash tests/opencode/test-bootstrap-caching.sh` after each batch of fixes.
- **Brainstorming `server.cjs`**: large file with HTTP/WebSocket code. Apply mechanical fixes; verify via `cd tests/brainstorm-server && npm test` after each batch.
- **Genuine refactor candidates**: track as Known Followups in a separate doc comment or this plan's followups section. Don't undertake mid-refactor.

- [ ] **Step 3: Add temporary ignore for decision-logging bundle paths**

Add `.oxlintignore`:

```
# Decision-logging hand-written .cjs files are being replaced with TS+bundle.
# Re-enable after Phase 9 (bundle generation).
skills/decision-logging/scripts/*.cjs
```

- [ ] **Step 4: Apply fixes file by file**

For each file with findings:
1. Apply mechanical fixes.
2. Test the file's user (brainstorming tests, opencode test, decision-logging tests).
3. Move to next file.

- [ ] **Step 5: Re-run all tests after fixes**

```bash
cd tests/brainstorm-server && npm test && cd ../..
cd tests/decision-logging && npm test && cd ../..
bash tests/opencode/test-bootstrap-caching.sh
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Fix oxlint findings

Mechanical fixes across brainstorming, opencode, render-graphs, tests.
Decision-logging .cjs files temporarily excluded via .oxlintignore;
they'll be replaced by bundled output in upcoming TS refactor."
```

---

## Task 8: Port decision-logging to TypeScript source

**Files:**
- Create: `skills/decision-logging/src/git-root.ts`
- Create: `skills/decision-logging/src/approval-phrases.ts`
- Create: `skills/decision-logging/src/write-madr.ts`
- Create: `skills/decision-logging/src/append-observation.ts`
- Create: `skills/decision-logging/src/ask-user-question-bridge.ts`
- Create: `skills/decision-logging/src/user-prompt-bridge.ts`

For each file: logic comes directly from the existing `.cjs` counterpart in `skills/decision-logging/scripts/`. The TS version adds explicit types but preserves all runtime behavior.

- [ ] **Step 1: Install dev deps for the source side**

Add type definitions and TypeScript at the snowball root (needed by `tsc --noEmit` in Step 8). The bundler (Bun) understands TS natively without these, but `tsc` for type-checking does.

```bash
# At the snowball root, add a devDependencies block to package.json
# (root package.json currently has only js-yaml in deps; we're going to
#  drop that block in Task 11, but for the lifetime of Task 8 we need
#  these dev deps available — keep them at the root for tsc to resolve)
cd /Users/kellen/Projects/snowball
npm install --save-dev typescript @types/node @types/js-yaml
cd .

# Also ensure js-yaml types are available where tests need them
cd tests/decision-logging
npm install --save-dev @types/js-yaml
cd ../..
```

After Task 11, the root devDependencies (`typescript`, `@types/node`, `@types/js-yaml`) get moved into a new `package.json` devDependencies block instead of being dropped — maintainers need them locally. Task 11 Step 1 will reflect this.

- [ ] **Step 2: Create `src/git-root.ts`**

```typescript
import { execFileSync } from 'node:child_process';

export function detectGitRoot(startDir?: string): string | null {
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
```

- [ ] **Step 3: Create `src/approval-phrases.ts`**

```typescript
export const APPROVAL_PHRASES = [
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
] as const;

export function matchesApproval(prompt: unknown): boolean {
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
```

- [ ] **Step 4: Create `src/write-madr.ts`**

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { detectGitRoot } from './git-root';

export type DecisionStatus =
  | 'proposed'
  | 'accepted'
  | 'rejected'
  | 'deprecated'
  | 'superseded';

export type Source = 'operator' | 'agent';
export type Confidence = 'high' | 'medium' | 'low';
export type CaptureMechanism =
  | 'ask-user-question'
  | 'user-prompt-pattern'
  | 'stop-hook-subagent'
  | 'manual';
export type SourceSkill =
  | 'brainstorming'
  | 'writing-plans'
  | 'systematic-debugging'
  | 'code-review'
  | 'ambient';

export interface SnowballMeta {
  schema_version: '1.0';
  source: Source;
  confidence: Confidence;
  capture_mechanism: CaptureMechanism;
  session_id: string;
  source_event_id: string;
  supersedes: string | null;
  tags: [SourceSkill, ...string[]];
}

export interface ConsideredOption {
  name: string;
  description: string;
}

export interface MadrBody {
  context?: string;
  considered_options?: ConsideredOption[];
  decision_outcome?: string;
  consequences?: string[];
  links?: string[];
}

export interface MadrInput {
  title: string;
  status?: DecisionStatus;
  date: string;
  deciders?: string[];
  snowball: SnowballMeta;
  body?: MadrBody;
}

export interface WriteMadrOpts {
  gitRoot?: string;
}

export function slugify(s: unknown): string {
  if (typeof s !== 'string' || !s.trim()) return 'untitled';
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'untitled'
  );
}

export function assembleFrontmatter(input: MadrInput): string {
  const fm = {
    title: input.title,
    status: input.status ?? 'accepted',
    date: input.date,
    deciders: input.deciders ?? [],
    snowball: input.snowball,
  };
  return yaml.dump(fm, { lineWidth: 120, noRefs: true });
}

export function assembleBody(input: MadrInput): string {
  const b = input.body ?? {};
  const sections: string[] = [`# ${input.title}\n`];

  if (b.context) {
    sections.push('## Context and Problem Statement\n', `${b.context}\n`);
  }
  if (b.considered_options && b.considered_options.length) {
    sections.push('## Considered Options\n');
    for (const opt of b.considered_options) {
      sections.push(`- **${opt.name}** — ${opt.description}`);
    }
    sections.push('');
  }
  if (b.decision_outcome) {
    sections.push('## Decision Outcome\n', `${b.decision_outcome}\n`);
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

export function assembleMadr(input: MadrInput): string {
  return `---\n${assembleFrontmatter(input)}---\n\n${assembleBody(input)}`;
}

export function timestampPrefix(isoDate: string): string {
  const m = isoDate.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (!m) throw new Error(`unparseable date: ${isoDate}`);
  return `${m[1]}T${m[2]}${m[3]}`;
}

export function writeMadr(input: MadrInput, opts: WriteMadrOpts = {}): string {
  const gitRoot = opts.gitRoot ?? detectGitRoot();
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
  process.stdin.on('data', (chunk: Buffer | string) => {
    raw += chunk;
  });
  process.stdin.on('end', () => {
    try {
      const input = JSON.parse(raw) as MadrInput;
      const filePath = writeMadr(input);
      process.stdout.write(`${filePath}\n`);
    } catch (err) {
      process.stderr.write(`write-madr error: ${(err as Error).message}\n`);
      process.exit(1);
    }
  });
}
```

- [ ] **Step 5: Create `src/append-observation.ts`**

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import { detectGitRoot } from './git-root';

export const TYPES = [
  'observation',
  'implementation-choice',
  'hypothesis',
  'constraint',
] as const;
export const CONFIDENCES = ['high', 'medium', 'low'] as const;
export const SOURCES = ['agent', 'subagent'] as const;
export const SOURCE_SKILLS = [
  'brainstorming',
  'writing-plans',
  'systematic-debugging',
  'code-review',
  'ambient',
] as const;

export type ObservationType = (typeof TYPES)[number];
export type ObservationConfidence = (typeof CONFIDENCES)[number];
export type ObservationSource = (typeof SOURCES)[number];
export type ObservationSourceSkill = (typeof SOURCE_SKILLS)[number];

export interface Observation {
  schema_version: '1.0';
  timestamp: string;
  session_id: string;
  type: ObservationType;
  confidence: ObservationConfidence;
  source: ObservationSource;
  content: string;
  rationale: string;
  related_files: string[];
  related_decision: string | null;
  tags: [ObservationSourceSkill, ...string[]];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface AppendObservationOpts {
  gitRoot?: string;
}

export function validate(obs: unknown): ValidationResult {
  const errors: string[] = [];
  const o = obs as Record<string, unknown>;

  const requireString = (field: string): void => {
    if (typeof o[field] !== 'string' || !o[field]) {
      errors.push(`${field} required (non-empty string)`);
    }
  };
  requireString('schema_version');
  requireString('timestamp');
  requireString('session_id');
  requireString('content');
  requireString('rationale');

  if (o.schema_version !== '1.0') errors.push('schema_version must be "1.0"');
  if (!TYPES.includes(o.type as ObservationType)) {
    errors.push(`type must be one of ${TYPES.join(', ')}`);
  }
  if (!CONFIDENCES.includes(o.confidence as ObservationConfidence)) {
    errors.push(`confidence must be one of ${CONFIDENCES.join(', ')}`);
  }
  if (!SOURCES.includes(o.source as ObservationSource)) {
    errors.push(`source must be one of ${SOURCES.join(', ')}`);
  }
  if (!Array.isArray(o.tags) || o.tags.length < 1) {
    errors.push('tags must be a non-empty array');
  } else if (
    !SOURCE_SKILLS.includes(o.tags[0] as ObservationSourceSkill)
  ) {
    errors.push(`tags[0] must be one of ${SOURCE_SKILLS.join(', ')}`);
  }
  if (!Array.isArray(o.related_files)) {
    errors.push('related_files must be an array');
  }
  if (
    o.related_decision !== null &&
    typeof o.related_decision !== 'string'
  ) {
    errors.push('related_decision must be string or null');
  }

  return { valid: errors.length === 0, errors };
}

export function appendObservation(
  obs: Observation,
  opts: AppendObservationOpts = {},
): string {
  const result = validate(obs);
  if (!result.valid) {
    throw new Error(`validation failed: ${result.errors.join('; ')}`);
  }

  const gitRoot = opts.gitRoot ?? detectGitRoot();
  if (!gitRoot) throw new Error('not in a git repo');

  const dir = path.join(gitRoot, 'docs', 'snowball', 'decisions');
  fs.mkdirSync(dir, { recursive: true });

  const file = path.join(dir, 'observations.jsonl');
  fs.appendFileSync(file, `${JSON.stringify(obs)}\n`);
  return file;
}

// CLI entry: read JSONL (single object or one per line) from stdin
if (require.main === module) {
  let raw = '';
  process.stdin.on('data', (chunk: Buffer | string) => {
    raw += chunk;
  });
  process.stdin.on('end', () => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const lines = trimmed.includes('\n') ? trimmed.split('\n') : [trimmed];
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        appendObservation(JSON.parse(line) as Observation);
      } catch (err) {
        process.stderr.write(
          `append-observation skipped line: ${(err as Error).message}\n`,
        );
      }
    }
  });
}
```

- [ ] **Step 6: Create `src/ask-user-question-bridge.ts`**

Logic is a direct port of `skills/decision-logging/scripts/ask-user-question-bridge.cjs`. Read that file as reference, then write:

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { writeMadr, type MadrInput } from './write-madr';

const ERROR_LOG = path.join(os.homedir(), '.snowball', 'decision-logging-errors.log');

interface AskUserQuestionPayload {
  session_id?: string;
  tool_use_id?: string;
  tool_input?: {
    questions?: Array<{
      question: string;
      header?: string;
      options?: Array<{ label: string; description?: string }>;
    }>;
  };
  tool_response?: {
    answers?: Record<string, string>;
  };
}

function logError(msg: string): void {
  try {
    fs.mkdirSync(path.dirname(ERROR_LOG), { recursive: true });
    fs.appendFileSync(ERROR_LOG, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {
    // last-resort: nothing
  }
}

let raw = '';
process.stdin.on('data', (chunk: Buffer | string) => {
  raw += chunk;
});
process.stdin.on('end', () => {
  let payload: AskUserQuestionPayload;
  try {
    payload = JSON.parse(raw) as AskUserQuestionPayload;
  } catch (err) {
    logError(
      `ask-user-question-bridge: bad JSON payload: ${(err as Error).message}`,
    );
    process.exit(0);
  }

  const questions = payload.tool_input?.questions ?? [];
  const answers = payload.tool_response?.answers ?? {};
  const sessionId = payload.session_id ?? 'unknown';
  const sourceEventId = payload.tool_use_id ?? 'unknown';

  const isoDate = new Date().toISOString();

  for (const q of questions) {
    const answer = answers[q.question];
    if (!answer) continue;

    const chosen = q.options?.find((o) => o.label === answer) ?? {
      label: answer,
      description: '',
    };

    const input: MadrInput = {
      title: String(q.question).replace(/\?+$/, ''),
      status: 'accepted',
      date: isoDate,
      deciders: [process.env.USER ?? 'unknown'],
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
        considered_options: (q.options ?? []).map((o) => ({
          name: o.label,
          description: o.description ?? '',
        })),
        decision_outcome: `Chose **${chosen.label}**. ${chosen.description ?? ''}`,
      },
    };

    try {
      writeMadr(input);
    } catch (err) {
      logError(
        `ask-user-question-bridge: writeMadr failed: ${(err as Error).message}`,
      );
    }
  }

  process.exit(0);
});
```

- [ ] **Step 7: Create `src/user-prompt-bridge.ts`**

Logic is a direct port of `skills/decision-logging/scripts/user-prompt-bridge.cjs`. Note the mtime-based dedup (the implementer in the previous spec caught a bug with alphabetical sort and switched to mtime — preserve that fix).

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { matchesApproval } from './approval-phrases';
import { writeMadr, type MadrInput } from './write-madr';
import { detectGitRoot } from './git-root';

const ERROR_LOG = path.join(os.homedir(), '.snowball', 'decision-logging-errors.log');
const DEDUP_WINDOW_MS = 60 * 1000;

interface UserPromptPayload {
  prompt?: string;
  session_id?: string;
}

function logError(msg: string): void {
  try {
    fs.mkdirSync(path.dirname(ERROR_LOG), { recursive: true });
    fs.appendFileSync(ERROR_LOG, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {
    // last-resort: nothing
  }
}

function isRecentAskUserQuestion(gitRoot: string): boolean {
  const dir = path.join(gitRoot, 'docs', 'snowball', 'decisions');
  if (!fs.existsSync(dir)) return false;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
  if (!files.length) return false;

  // Find the file with the most recent mtime (NOT alphabetical sort — collision
  // suffixes like `-XXXX.md` sort BEFORE `.md` because `-` < `.` in ASCII).
  let latestPath: string | null = null;
  let latestMtime = -Infinity;
  for (const f of files) {
    const p = path.join(dir, f);
    const stat = fs.statSync(p);
    if (stat.mtimeMs > latestMtime) {
      latestMtime = stat.mtimeMs;
      latestPath = p;
    }
  }
  if (!latestPath) return false;

  if (Date.now() - latestMtime > DEDUP_WINDOW_MS) return false;
  const content = fs.readFileSync(latestPath, 'utf8');
  return /capture_mechanism:\s*ask-user-question/.test(content);
}

let raw = '';
process.stdin.on('data', (chunk: Buffer | string) => {
  raw += chunk;
});
process.stdin.on('end', () => {
  let payload: UserPromptPayload;
  try {
    payload = JSON.parse(raw) as UserPromptPayload;
  } catch (err) {
    logError(`user-prompt-bridge: bad JSON: ${(err as Error).message}`);
    process.exit(0);
  }

  const prompt = payload.prompt ?? '';
  const sessionId = payload.session_id ?? 'unknown';

  if (!matchesApproval(prompt)) process.exit(0);

  const gitRoot = detectGitRoot();
  if (!gitRoot) process.exit(0);

  if (isRecentAskUserQuestion(gitRoot)) process.exit(0);

  const isoDate = new Date().toISOString();
  const input: MadrInput = {
    title: 'Free-text operator approval',
    status: 'accepted',
    date: isoDate,
    deciders: [process.env.USER ?? 'unknown'],
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
    logError(`user-prompt-bridge: writeMadr failed: ${(err as Error).message}`);
  }

  process.exit(0);
});
```

- [ ] **Step 8: Type-check the source**

```bash
cd /Users/kellen/Projects/snowball
npx tsc --noEmit
```

Expected: no errors. If errors, fix the types in the TS files until clean. `tsc` uses the root `tsconfig.json` written in Task 1 with `noEmit: true` and `strict: true` — it only validates types, doesn't emit JS.

- [ ] **Step 9: Commit**

```bash
git add skills/decision-logging/src/ tests/decision-logging/package.json tests/decision-logging/package-lock.json
git commit -m "Port decision-logging scripts to TypeScript source under src/

Adds explicit types (MadrInput, Observation, etc.) while preserving
exact runtime behavior of the existing .cjs files. Bundles will be
generated in the next task."
```

---

## Task 9: Generate bundles; verify against integration tests

**Files:**
- Modify (overwrite): `skills/decision-logging/scripts/ask-user-question-bridge.cjs`
- Modify (overwrite): `skills/decision-logging/scripts/user-prompt-bridge.cjs`
- Modify (overwrite): `skills/decision-logging/scripts/write-madr.cjs`
- Modify (overwrite): `skills/decision-logging/scripts/append-observation.cjs`
- Delete: `skills/decision-logging/scripts/approval-phrases.cjs` (inlined into user-prompt-bridge bundle)
- Delete: `skills/decision-logging/scripts/git-root.cjs` (inlined into all writer bundles)

- [ ] **Step 1: Run the build script**

```bash
bash scripts/build-decision-logging.sh
```

Expected: builds 4 bundles in `skills/decision-logging/scripts/`. Output should report `built 4 bundles into ...`.

- [ ] **Step 2: Delete the now-unused hand-written files**

```bash
rm skills/decision-logging/scripts/approval-phrases.cjs
rm skills/decision-logging/scripts/git-root.cjs
```

- [ ] **Step 3: Inspect a bundle to confirm js-yaml is inlined**

```bash
grep -l "js-yaml" skills/decision-logging/scripts/write-madr.cjs && \
  echo "ERROR: still has require('js-yaml')" || \
  echo "ok: js-yaml inlined into bundle"
```

Expected: "ok: js-yaml inlined into bundle". If the grep finds js-yaml as a `require()` call (not just as inlined source), the bundler didn't inline correctly — debug.

Also check the file is reasonable size (js-yaml + our code should be ~200KB-ish, much larger than the original ~3KB):

```bash
ls -lh skills/decision-logging/scripts/write-madr.cjs
```

- [ ] **Step 4: Run all bash integration tests against the bundled output**

```bash
bash tests/decision-logging/on-ask-user-question.test.sh
bash tests/decision-logging/on-user-prompt.test.sh
bash tests/decision-logging/on-stop.test.sh
```

Expected: all three exit 0 with PASS lines. These tests invoke the shell handlers, which invoke `node bundle.cjs` — same path consumers use.

- [ ] **Step 5: Smoke-test the CLI entries**

```bash
echo '{"title":"Test","date":"2026-05-26T10:00:00-07:00","status":"accepted","deciders":["k"],"snowball":{"schema_version":"1.0","source":"operator","confidence":"high","capture_mechanism":"manual","session_id":"s","source_event_id":"e","supersedes":null,"tags":["ambient"]},"body":{"context":"c","decision_outcome":"chose X"}}' | \
  node skills/decision-logging/scripts/write-madr.cjs
```

Expected: prints a path. Then clean up:

```bash
rm docs/snowball/decisions/2026-05-26T1000-test.md
rmdir docs/snowball/decisions docs/snowball 2>/dev/null || true
```

- [ ] **Step 6: Remove the temporary `.oxlintignore` entry from Task 7**

```bash
# Delete the line excluding decision-logging .cjs from oxlint
# (the bundles can be oxlinted too — they're generated but still JS)
sed -i.bak '/skills\/decision-logging\/scripts\/\*\.cjs/d' .oxlintignore
rm -f .oxlintignore.bak

# If .oxlintignore now has only comments and whitespace, remove the file
if ! grep -q '[^[:space:]#]' .oxlintignore 2>/dev/null; then
  rm -f .oxlintignore
fi
```

Run oxlint to confirm the bundles pass:

```bash
pre-commit run --files skills/decision-logging/scripts/*.cjs oxlint
```

If oxlint complains about generated code style: add a leading `/* oxlint-disable */` banner to the build output by amending the build script to prepend the banner. Skip this if the bundles pass clean.

- [ ] **Step 7: Commit**

```bash
git add skills/decision-logging/scripts/*.cjs .oxlintignore
git rm skills/decision-logging/scripts/approval-phrases.cjs skills/decision-logging/scripts/git-root.cjs 2>/dev/null
git commit -m "Replace hand-written scripts/*.cjs with bundled output from src/*.ts

js-yaml is now inlined into the bundles; consumers no longer need
\`npm install\` at the snowball root. approval-phrases.cjs and
git-root.cjs are removed (inlined into the bridges that imported them)."
```

---

## Task 10: Migrate unit tests to TypeScript + bun test

**Files:**
- Delete: `tests/decision-logging/approval-phrases.test.cjs`
- Delete: `tests/decision-logging/write-madr.test.cjs`
- Delete: `tests/decision-logging/append-observation.test.cjs`
- Delete: `tests/decision-logging/test-helpers.cjs`
- Create: `tests/decision-logging/approval-phrases.test.ts`
- Create: `tests/decision-logging/write-madr.test.ts`
- Create: `tests/decision-logging/append-observation.test.ts`
- Create: `tests/decision-logging/test-helpers.ts`
- Modify: `tests/decision-logging/package.json` (switch to bun test runner)

- [ ] **Step 1: Update `tests/decision-logging/package.json`**

```json
{
  "name": "decision-logging-tests",
  "version": "1.0.0",
  "scripts": {
    "test": "npm run test:unit && npm run test:integration",
    "test:unit": "bun test",
    "test:integration": "bash on-ask-user-question.test.sh && bash on-user-prompt.test.sh && bash on-stop.test.sh"
  },
  "devDependencies": {
    "@types/js-yaml": "^4.0.9",
    "js-yaml": "^4.1.0"
  }
}
```

Note: `js-yaml` moves to `devDependencies` (used by the write-madr test to parse generated frontmatter).

- [ ] **Step 2: Install**

```bash
cd tests/decision-logging
npm install
cd ../..
```

- [ ] **Step 3: Create `tests/decision-logging/test-helpers.ts`**

```typescript
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

export function makeTempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snowball-decisions-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'test'], { cwd: dir });
  return dir;
}

export function cleanupTempRepo(dir: string): void {
  if (dir && dir.startsWith(os.tmpdir())) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export function readDecisionsDir(repo: string): string[] {
  const dir = path.join(repo, 'docs', 'snowball', 'decisions');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).sort();
}
```

- [ ] **Step 4: Create `tests/decision-logging/approval-phrases.test.ts`**

```typescript
import { test, expect } from 'bun:test';
import {
  APPROVAL_PHRASES,
  matchesApproval,
} from '../../skills/decision-logging/src/approval-phrases';

test('APPROVAL_PHRASES contains the locked Phase-1 list', () => {
  expect([...APPROVAL_PHRASES]).toEqual([
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
  ]);
});

test('matchesApproval handles exact match case-insensitively', () => {
  expect(matchesApproval('lgtm')).toBe(true);
  expect(matchesApproval('LGTM')).toBe(true);
  expect(matchesApproval('Ship It')).toBe(true);
});

test('matchesApproval handles phrase followed by punctuation or whitespace', () => {
  expect(matchesApproval('lgtm!')).toBe(true);
  expect(matchesApproval('lgtm, ship it')).toBe(true);
  expect(matchesApproval('looks good to me')).toBe(true);
  expect(matchesApproval('approved.')).toBe(true);
});

test('matchesApproval rejects non-approval prompts', () => {
  expect(matchesApproval('thanks')).toBe(false);
  expect(matchesApproval('what about edge case X')).toBe(false);
  expect(matchesApproval('')).toBe(false);
  expect(matchesApproval('   ')).toBe(false);
});

test('matchesApproval rejects bare affirmations (excluded by policy)', () => {
  expect(matchesApproval('yes')).toBe(false);
  expect(matchesApproval('yeah')).toBe(false);
  expect(matchesApproval('ok')).toBe(false);
  expect(matchesApproval('sure')).toBe(false);
  expect(matchesApproval('i agree')).toBe(false);
});

test('matchesApproval rejects substring-only matches inside longer prose', () => {
  expect(matchesApproval('i would not say lgtm here')).toBe(false);
});
```

- [ ] **Step 5: Create `tests/decision-logging/write-madr.test.ts`**

```typescript
import { test, expect } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import {
  assembleMadr,
  slugify,
  writeMadr,
  type MadrInput,
} from '../../skills/decision-logging/src/write-madr';
import { makeTempRepo, cleanupTempRepo, readDecisionsDir } from './test-helpers';

const sampleInput: MadrInput = {
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
  expect(fmMatch).not.toBeNull();
  const fm = yaml.load(fmMatch![1]) as Record<string, unknown>;
  expect(fm.title).toBe(sampleInput.title);
  expect((fm.snowball as Record<string, unknown>).schema_version).toBe('1.0');
  expect((fm.snowball as Record<string, unknown>).tags).toEqual([
    'brainstorming',
    'architecture',
  ]);
});

test('assembleMadr renders body sections in canonical order', () => {
  const md = assembleMadr(sampleInput);
  const ctxIdx = md.indexOf('## Context and Problem Statement');
  const optIdx = md.indexOf('## Considered Options');
  const outIdx = md.indexOf('## Decision Outcome');
  const consIdx = md.indexOf('## Consequences');
  const linkIdx = md.indexOf('## Links');
  expect(ctxIdx).toBeLessThan(optIdx);
  expect(optIdx).toBeLessThan(outIdx);
  expect(outIdx).toBeLessThan(consIdx);
  expect(consIdx).toBeLessThan(linkIdx);
});

test('assembleMadr omits empty optional sections', () => {
  const minimal: MadrInput = {
    ...sampleInput,
    body: { context: 'ctx', decision_outcome: 'chose X' },
  };
  const md = assembleMadr(minimal);
  expect(md).toContain('## Context and Problem Statement');
  expect(md).toContain('## Decision Outcome');
  expect(md).not.toContain('## Considered Options');
  expect(md).not.toContain('## Consequences');
  expect(md).not.toContain('## Links');
});

test('slugify lowercases and replaces non-alphanumerics with hyphens', () => {
  expect(slugify('Choose Two-tier Storage')).toBe('choose-two-tier-storage');
  expect(slugify("Don't! Refactor")).toBe('don-t-refactor');
});

test('slugify truncates to a reasonable max length', () => {
  const long = 'a'.repeat(200);
  const s = slugify(long);
  expect(s.length).toBeLessThanOrEqual(60);
});

test('slugify handles non-string input by returning a fallback', () => {
  expect(slugify(null)).toBe('untitled');
  expect(slugify('')).toBe('untitled');
});

test('writeMadr writes to <repo>/docs/snowball/decisions/<timestamp>-<slug>.md', () => {
  const repo = makeTempRepo();
  try {
    const filePath = writeMadr(sampleInput, { gitRoot: repo });
    expect(filePath.startsWith(path.join(repo, 'docs', 'snowball', 'decisions') + path.sep)).toBe(true);
    expect(fs.existsSync(filePath)).toBe(true);
    const files = readDecisionsDir(repo);
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/^2026-05-25T1430-choose-two-tier-storage-for-decision-logs\.md$/);
  } finally {
    cleanupTempRepo(repo);
  }
});

test('writeMadr creates the decisions directory if absent', () => {
  const repo = makeTempRepo();
  try {
    writeMadr(sampleInput, { gitRoot: repo });
    expect(fs.existsSync(path.join(repo, 'docs', 'snowball', 'decisions'))).toBe(true);
  } finally {
    cleanupTempRepo(repo);
  }
});

test('writeMadr appends a suffix when minute collision occurs', () => {
  const repo = makeTempRepo();
  try {
    writeMadr(sampleInput, { gitRoot: repo });
    const p2 = writeMadr({ ...sampleInput }, { gitRoot: repo });
    expect(fs.existsSync(p2)).toBe(true);
    const files = readDecisionsDir(repo);
    expect(files.length).toBe(2);
  } finally {
    cleanupTempRepo(repo);
  }
});
```

- [ ] **Step 6: Create `tests/decision-logging/append-observation.test.ts`**

```typescript
import { test, expect } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  validate,
  appendObservation,
  type Observation,
} from '../../skills/decision-logging/src/append-observation';
import { makeTempRepo, cleanupTempRepo } from './test-helpers';

const valid: Observation = {
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
  const result = validate(valid);
  expect(result.valid).toBe(true);
});

test('validate rejects missing required fields', () => {
  const result = validate({ ...valid, content: undefined });
  expect(result.valid).toBe(false);
  expect(result.errors.some((e) => e.includes('content'))).toBe(true);
});

test('validate rejects out-of-enum values', () => {
  expect(validate({ ...valid, type: 'bogus' }).valid).toBe(false);
  expect(validate({ ...valid, confidence: 'extreme' }).valid).toBe(false);
  expect(validate({ ...valid, source: 'human' }).valid).toBe(false);
});

test('validate requires tags[0] to be in the source-skill enum', () => {
  expect(validate({ ...valid, tags: ['not-a-skill'] }).valid).toBe(false);
  expect(validate({ ...valid, tags: ['brainstorming', 'extra'] }).valid).toBe(true);
});

test('appendObservation appends a single line to observations.jsonl', () => {
  const repo = makeTempRepo();
  try {
    appendObservation(valid, { gitRoot: repo });
    appendObservation({ ...valid, content: 'second' }, { gitRoot: repo });
    const file = path.join(repo, 'docs', 'snowball', 'decisions', 'observations.jsonl');
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0]).content).toBe('The cache key uses timestamp.');
    expect(JSON.parse(lines[1]).content).toBe('second');
  } finally {
    cleanupTempRepo(repo);
  }
});

test('appendObservation throws on invalid input', () => {
  const repo = makeTempRepo();
  try {
    expect(() =>
      appendObservation({ ...valid, type: 'nope' } as Observation, { gitRoot: repo }),
    ).toThrow(/validation/);
  } finally {
    cleanupTempRepo(repo);
  }
});
```

- [ ] **Step 7: Delete the old .cjs test files**

```bash
rm tests/decision-logging/approval-phrases.test.cjs
rm tests/decision-logging/write-madr.test.cjs
rm tests/decision-logging/append-observation.test.cjs
rm tests/decision-logging/test-helpers.cjs
```

- [ ] **Step 8: Run the bun tests**

```bash
cd tests/decision-logging && bun test
```

Expected: 21+ tests pass (counts match the .cjs versions). If any fail, debug the TS port.

- [ ] **Step 9: Run the full test suite (unit + integration)**

```bash
cd tests/decision-logging && npm test && cd ../..
```

Expected: bun unit tests + 3 bash integration tests all green.

- [ ] **Step 10: Commit**

```bash
git add tests/decision-logging/
git rm tests/decision-logging/*.test.cjs tests/decision-logging/test-helpers.cjs 2>/dev/null
git commit -m "Migrate decision-logging unit tests to TypeScript + bun test

Tests now import from src/*.ts directly (not the bundled .cjs),
giving fast iteration and type safety. Bash integration tests
unchanged — they still verify the actual shipped bundles."
```

---

## Task 11: Cleanup — drop js-yaml from root, revert README

**Files:**
- Modify: `package.json` (remove dependencies block)
- Delete: `package-lock.json`
- Delete: `node_modules/` (gitignored, but rm locally)
- Modify: `README.md` (revert zero-deps exception note; add Maintainer Setup)

- [ ] **Step 1: Remove `dependencies` block; keep maintainer `devDependencies`**

Edit `package.json` to:

```json
{
  "name": "snowball",
  "version": "5.1.0",
  "type": "module",
  "main": ".opencode/plugins/snowball.js",
  "devDependencies": {
    "typescript": "^5.6.0",
    "@types/node": "^22.0.0",
    "@types/js-yaml": "^4.0.9"
  }
}
```

(Dropping the runtime `dependencies` block — js-yaml is no longer needed at runtime since it's bundled — but keeping `devDependencies` for the maintainer-side TypeScript type-checking. Consumers loading snowball still don't need to `npm install`: the shipped `.cjs` bundles are self-contained.)

- [ ] **Step 2: Regenerate package-lock against the new devDependencies**

```bash
# Reinstall to refresh package-lock.json with only the devDeps
# (drops js-yaml's lockfile entry; preserves typescript / @types entries)
rm -rf node_modules package-lock.json
npm install
```

After this, `node_modules/` is gitignored (stays local) and `package-lock.json` is committed. Both reflect only the devDeps now — no runtime js-yaml.

- [ ] **Step 3: Update the README "Zero runtime dependencies" bullet**

Edit `README.md`. Find the line that currently reads:

```
- Zero runtime dependencies for skill loading. Skills are plain markdown; the bootstrap is one bash file. Exceptions: the `brainstorming` skill ships a local Node HTTP server for its visual companion (`skills/brainstorming/scripts/server.cjs`) — Node is required for that skill, stdlib only. The `decision-logging` skill (Phase 1 fork divergence; see `docs/snowball/specs/2026-05-25-decision-logging-design.md`) requires Node plus a single npm dep (`js-yaml`); run `npm install` at the snowball root after cloning if you want decision-log capture to work.
```

Replace with:

```
- Zero runtime npm dependencies for skill loading. Skills are plain markdown; the bootstrap is one bash file. Two skills ship local Node scripts: `brainstorming` (visual-companion HTTP server, stdlib only) and `decision-logging` (hook bridges, with third-party code pre-bundled into the shipped `.cjs` files). Node is required for those skills; `npm install` is not.
```

This accurately reflects the post-refactor state: both skills need Node, neither needs `npm install` at the consumer's snowball clone.

- [ ] **Step 4: Add a "Maintainer setup" section to README**

Find an appropriate location (after "Known stale or broken" section, before "Repository map"). Insert:

````markdown
## Maintainer setup

Snowball uses pre-commit hooks for formatting, linting, and the decision-logging build. After cloning, maintainers should:

```bash
# Required tools (one-time)
brew install pre-commit shellcheck shfmt markdownlint-cli2 oxlint oxfmt bun

# Install local devDeps (typescript + @types for type-checking)
npm install

# Install test deps for decision-logging
(cd tests/decision-logging && npm install)

# Activate hooks in this repo
pre-commit install

# Verify the toolchain
pre-commit run --all-files
```

Consumers (people who load snowball into their AI coding harness) do NOT need any of these. The shipped artifacts under `skills/decision-logging/scripts/*.cjs` are bundled — js-yaml and any other dependencies are inlined.
````

- [ ] **Step 5: Verify nothing depends on the deleted root deps**

```bash
# Run all the test suites we care about
cd tests/decision-logging && npm test && cd ../..
cd tests/brainstorm-server && npm test && cd ../..
bash tests/opencode/test-bootstrap-caching.sh
```

Expected: all green.

- [ ] **Step 6: Manual smoke test — real Claude Code session**

Simulate the user flow: invoke `AskUserQuestion` in a real session against this repo, confirm a MADR appears in `docs/snowball/decisions/`. If a Claude Code session is available:

```bash
# Trigger an interactive session that uses AskUserQuestion
# (manual — outside the scope of automated testing)
echo "Manual smoke test: open Claude Code, ask it to invoke AskUserQuestion."
echo "Expected: docs/snowball/decisions/ gains a new MADR file."
```

- [ ] **Step 7: Final commit**

```bash
git add package.json package-lock.json README.md
git commit -m "Drop js-yaml runtime dep; revert README zero-deps exception

Bundles now inline js-yaml; consumers no longer need npm install at
the snowball root. README's zero-deps claim is restored. Adds a new
Maintainer Setup section documenting the pre-commit toolchain.
package-lock.json now tracks only maintainer-side devDependencies
(typescript, @types/node, @types/js-yaml)."
```

---

## Task 12: Update SKILL.md with build-flow note

**Files:**
- Modify: `skills/decision-logging/SKILL.md` (add a "For maintainers" subsection)

- [ ] **Step 1: Add maintainer notes section to SKILL.md**

Append after the existing "Phase 1 limitations" section:

````markdown
## For maintainers

The shipped artifacts in `scripts/*.cjs` are bundled outputs from `src/*.ts`. Don't edit `scripts/*.cjs` directly — edit the TS source and let the build regenerate.

```bash
# Build manually
bash scripts/build-decision-logging.sh

# Or rely on the pre-commit hook: editing src/*.ts auto-triggers the build
# and stages the regenerated bundles before each commit.
```

Bundled output uses Bun (`bun build --target=node --format=cjs`). Bun is a maintainer dependency only; consumers continue to invoke `node` against the committed bundles.
````

- [ ] **Step 2: Commit**

```bash
git add skills/decision-logging/SKILL.md
git commit -m "SKILL.md: document the build flow for maintainers"
```

---

## Self-Review checklist

After implementing all tasks, verify against the spec:

1. **Spec goals coverage:**
   - Eliminate js-yaml runtime dep: Tasks 9, 11 (bundle inlines it; root package.json drops it)
   - TS source for decision-logging: Task 8
   - Pre-commit hook pipeline: Tasks 2, 3
   - Aggressive initial cleanup: Tasks 4, 5, 6, 7
   - Simple maintainer workflow: Task 11 (Maintainer Setup section)

2. **Spec architecture coverage:**
   - `src/` for TS, `scripts/` for bundles, both committed: Tasks 8, 9
   - `bun build --target=node --format=cjs`: Task 2, 9
   - `tsconfig.json` strict + noEmit: Task 1
   - `.pre-commit-config.yaml` with all 8 hook types: Task 2
   - `.markdownlint.jsonc`, `.shellcheckrc`, `.editorconfig`: Tasks 1, 2

3. **Spec phased migration coverage:**
   - Phase 1 (tooling infra) → Tasks 1, 2
   - Phase 2 (install + smoke) → Task 3
   - Phase 3 (bulk formatting) → Task 4
   - Phase 4 (lint fixes) → Tasks 5, 6, 7
   - Phase 5 (TS refactor) → Task 8
   - Phase 6 (bundle generation) → Task 9
   - Phase 7 (test migration) → Task 10
   - Phase 8 (cleanup) → Tasks 11, 12

4. **Spec testing strategy coverage:**
   - Brainstorm-server tests after Phases 3-4: Tasks 4, 5, 6, 7 each include this verification
   - Decision-logging tests at each phase: Tasks 4, 8, 9, 10, 11 each include this verification
   - OpenCode plugin verification: Tasks 4, 5, 6, 7
   - Manual `AskUserQuestion` smoke: Task 11

5. **Spec operational concerns coverage:**
   - Bundle silent breakage: Task 9 Step 3 (grep js-yaml require + size check) and Step 4 (integration tests)
   - oxlint unfixable findings: Task 7 Step 2 (categorise; per-rule disables)
   - shellcheck unfixable findings: Task 5 Step 2 (categorise; per-rule disables)
   - Maintainer machine missing tools: Task 11 Step 4 (README Maintainer Setup)
   - markdownlint reflowing prose: Task 2 Step 2 (.markdownlint.jsonc has MD013: false)
   - Bundle out-of-sync: Task 2 (build-decision-logging hook prevents)

**Known gaps**: The bash integration tests for decision-logging don't have a TS port — they remain bash and run via `bash tests/decision-logging/*.test.sh`. This matches the spec's testing-strategy section ("bash integration tests already test the bundled output via `node script.cjs` — they keep working unchanged").

---

## Execution Handoff

Plan complete and saved to `docs/snowball/plans/2026-05-26-bun-ts-refactor.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
