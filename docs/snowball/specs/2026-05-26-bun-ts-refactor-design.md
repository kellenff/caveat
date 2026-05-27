# Decision-Logging Refactor: TypeScript Source + Bundled Output + Repo-Wide Dev Hygiene

**Date:** 2026-05-26
**Status:** Draft
**Scope:** decision-logging TS refactor + repo-wide pre-commit hooks (oxlint, oxfmt, shellcheck, shfmt, markdownlint, pre-commit-hooks builtins)
**Supersedes-context:** the js-yaml zero-deps regression documented in `2026-05-25-decision-logging-design.md` and the README exception note added in commit `f240531`. This refactor resolves that regression.

## Problem

Two issues, addressed together because the second is enabled by tooling we're adding for the first:

1. **Decision-logging shipped a runtime npm dependency.** `skills/decision-logging/scripts/write-madr.cjs` calls `require('js-yaml')`. Resolution requires `node_modules/js-yaml` somewhere on Node's lookup path — meaning consumers running snowball must `npm install` at the snowball root for the hooks to work. That violates snowball's "zero runtime dependencies for skill loading" stance documented in the README. The previous spec accepted this as a documented divergence; this spec eliminates it.
2. **Snowball has no consistent dev-hygiene enforcement.** No formatter, no linter, no consistent bash style, no whitespace normalisation, no markdown rules. Adding any tooling here is a one-time investment that compounds over future work, and the TypeScript build chain we need for the first issue already requires us to install Bun on maintainer machines — so adding adjacent tooling has marginal cost.

## Goals

1. Eliminate the js-yaml runtime dependency by bundling decision-logging scripts at build time; consumers only need Node.
2. Move decision-logging source to TypeScript for type safety on the writer logic and schema enums.
3. Establish a pre-commit hook pipeline that enforces formatting (oxfmt, shfmt), linting (oxlint, shellcheck, markdownlint-cli2), and basic correctness checks (yaml/json validity, trailing whitespace, EOF newlines, merge conflicts, large files) across the repo.
4. Run the initial cleanup aggressively — fix everything the linters flag in existing files, not just decision-logging.
5. Keep the maintainer workflow simple: a single `pre-commit install`, then commit normally.

## Non-Goals

- **Replacing Node with Bun at runtime.** Bun stays a maintainer-side build tool. Consumers continue to invoke `node` for the hook bridges (the bundled `.cjs` outputs).
- **Refactoring `brainstorming/scripts/server.cjs`, `.opencode/plugins/snowball.js`, or other JS outside decision-logging into TypeScript.** Those keep their current language. They will be reformatted and linted by oxfmt/oxlint, but their content shape stays JS/CJS.
- **CI integration.** Pre-commit framework runs locally only in this phase. Adding GitHub Actions or similar is out of scope.
- **Reformatting hand-crafted prose.** Markdownlint configured to NOT reflow line lengths in spec/plan files so design docs stay legible.
- **Test-environment Bun installs for end-user repos.** Bun is required only when developing snowball itself; the hooks shipped to consumers invoke plain Node against bundled `.cjs`.

## Design Principles

### Build artifacts are committed, not generated on install

Consumers get fully-bundled `.cjs` files in `skills/decision-logging/scripts/` ready to invoke. No postinstall step, no Bun requirement, no `npm install`. The cost is committing bundled JS to git — a tradeoff we accept to preserve the zero-runtime-deps stance.

### Source and bundle both committed; pre-commit hook prevents drift

`src/*.ts` is the source of truth. `scripts/*.cjs` is the shipped artifact. A pre-commit hook (`build-decision-logging`) regenerates the bundles whenever source files change and stages them, so the two stay in sync. Drift is prevented by automation, not discipline.

### Aggressive initial cleanup, focused ongoing hooks

Phase 1 runs every linter and formatter against every applicable file in the repo and fixes the lot. From then on, hooks operate per-file on commits. This front-loads the disruption into one mechanical PR rather than spreading it across many "fix lint while you're here" diffs.

### Tools we already trust over tools we'd have to learn

`oxlint`/`oxfmt` because the user picked them. `shellcheck`/`shfmt` because they're the canonical bash tooling. `markdownlint-cli2` because it's the standard markdown linter with mature rule coverage. `pre-commit-hooks` (the official upstream) for filesystem-level checks. No custom-rolled tools; no exotic formatters.

### Bundles are CommonJS, not ESM

The hook handlers invoke `node "$BRIDGE"` and the existing CJS pattern works. Switching to ESM would require updating shell handlers and complicate `require.main === module` style CLI guards. Stay with CJS at the output boundary.

## Architecture

### File inventory

**Added at repo top level:**

```text
.pre-commit-config.yaml           # hooks definition (see Section 2)
.markdownlint.jsonc               # markdownlint rules + per-file ignores
.shellcheckrc                     # shellcheck severity + ignores
.editorconfig                     # 2-space indent, LF line endings, trim trailing WS
tsconfig.json                     # strict TS config for skills/decision-logging/src/
scripts/build-decision-logging.sh # wraps `bun build` for the bundle entry points
```

**Modified at repo top level:**

```text
README.md             # revert the zero-deps exception note (commit f240531); add "Maintainer setup" section
package.json          # drop js-yaml runtime dep
package-lock.json     # delete (no more npm install at root)
.gitignore            # add: tests/decision-logging/node_modules, .oxc-cache, .bun cache dirs as needed
```

**Decision-logging refactor:**

```text
skills/decision-logging/
├── SKILL.md                              # add a "for maintainers" subsection on the build flow
├── references/schema.md                  # unchanged
├── src/                                  # NEW — TypeScript source
│   ├── git-root.ts
│   ├── approval-phrases.ts
│   ├── write-madr.ts                     # also CLI entry (preserves stdin→file behaviour)
│   ├── append-observation.ts             # also CLI entry
│   ├── ask-user-question-bridge.ts       # bundle entry
│   └── user-prompt-bridge.ts             # bundle entry
└── scripts/
    ├── on-ask-user-question.sh           # unchanged
    ├── on-user-prompt.sh                 # unchanged
    ├── on-stop.sh                        # unchanged
    ├── extract-worker.sh                 # unchanged
    ├── extract-observations.md           # unchanged
    ├── ask-user-question-bridge.cjs      # REGENERATED bundle (was hand-written)
    ├── user-prompt-bridge.cjs            # REGENERATED bundle
    ├── write-madr.cjs                    # REGENERATED bundle (js-yaml inlined)
    └── append-observation.cjs            # REGENERATED bundle
```

`approval-phrases.cjs` ceases to exist as a standalone shipped artifact — the bridges import from `./approval-phrases.ts` and `bun build` inlines the contents. Same for `git-root.ts` (imported by all writers).

**Tests:**

```text
tests/decision-logging/
├── package.json                          # drop js-yaml runtime dep; add `bun test` script; keep bash integration
├── *.test.ts                             # MIGRATED from .test.cjs (3 files)
│   ├── approval-phrases.test.ts
│   ├── write-madr.test.ts
│   └── append-observation.test.ts
└── *.test.sh                             # unchanged (3 bash integration tests)
```

### Bundling

Each entry point becomes one self-contained `.cjs`. Command pattern:

```bash
bun build skills/decision-logging/src/write-madr.ts \
  --target=node \
  --format=cjs \
  --outfile=skills/decision-logging/scripts/write-madr.cjs \
  --minify=false
```

`--minify=false` keeps the output readable for grep/debug. The build script (`scripts/build-decision-logging.sh`) runs this for each of the four entry points in sequence (`write-madr`, `append-observation`, `ask-user-question-bridge`, `user-prompt-bridge`).

### TypeScript configuration

`tsconfig.json` at repo root:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["skills/decision-logging/src/**/*", "tests/decision-logging/**/*.ts"]
}
```

`noEmit: true` — tsc is for type-checking only; bun does the actual bundling. The pre-commit hooks don't need tsc invocations because bun's TS support is sufficient at build time and the editor handles dev-time type errors.

## Pre-commit configuration

`.pre-commit-config.yaml`:

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

### Tool config files

**`.markdownlint.jsonc`:**

```jsonc
{
  "default": true,
  "MD013": false,          // no line-length enforcement; spec/plan prose stays as written
  "MD024": { "siblings_only": true },  // duplicate headings OK if in different sections
  "MD033": false,          // allow inline HTML (used in some docs)
  "MD041": false           // first-line H1 not required (frontmatter exists)
}
```

**`.shellcheckrc`:**

```ini
# Default severity = warning; fix anything at warning level or above
severity=warning
# Ignore SC2155 (declare-and-assign) — common pattern in snowball
disable=SC2155
```

**Project-local oxlint/oxfmt config**: rely on defaults initially. If specific rules need adjusting after the initial pass, add `.oxlintrc.json` / `.oxfmtrc.json` then.

### Scope of each tool

| Tool | Scope |
|---|---|
| `check-yaml`, `check-json`, `end-of-file-fixer`, `trailing-whitespace`, `check-merge-conflict`, `check-added-large-files` | Whole repo |
| `shfmt`, `shellcheck` | All `*.sh` and shebanged `bash`/`sh` scripts. **Excluded**: `hooks/run-hook.cmd` (bash+batch polyglot — the batch portion confuses both tools). Add to `.shellcheckrc` `exclude` and `.shfmt-excludes` (or use pre-commit `exclude` pattern on the hook). |
| `markdownlint-cli2` | All `*.md` |
| `oxlint` | All `*.js`, `*.cjs`, `*.mjs`, `*.ts` |
| `oxfmt` | All `*.js`, `*.cjs`, `*.mjs`, `*.ts`, `*.json`, `*.jsonc`, `*.yaml`, `*.yml` |
| `build-decision-logging` | Only `skills/decision-logging/src/*.ts` changes |
| `bun-test-decision-logging` | Only `skills/decision-logging/(src|scripts)/*` or `tests/decision-logging/*` changes |

Initial cleanup commits will touch every file the first six rows apply to, which is most of the repo. Subsequent commits touch only what's changed.

## Phased migration plan

Each phase is independently committable. Pre-commit hooks run on each commit; the tree stays green at every step.

### Phase 1: Add tooling infra

Add the six new top-level files. No content changes to existing files yet.

```text
.pre-commit-config.yaml
.markdownlint.jsonc
.shellcheckrc
.editorconfig
tsconfig.json
scripts/build-decision-logging.sh
```

Commit: "Add pre-commit framework + tsconfig + build script."

### Phase 2: Install pre-commit; smoke-test

Maintainer runs `pre-commit install`. Verifies with `git commit --allow-empty -m smoke` that hooks fire (and exit 0 since no files are staged).

No commit (this is a local-only activation step) — but document in README's Maintainer Setup section.

### Phase 3: Bulk formatting commit

Run `pre-commit run --all-files`. Accept everything oxfmt/shfmt/end-of-file-fixer/trailing-whitespace apply. **No semantic changes.** Verify nothing broke:

- `cd tests/brainstorm-server && npm test`
- `bash tests/opencode/test-bootstrap-caching.sh`
- `cd tests/decision-logging && npm test`

Commit: "Apply oxfmt/shfmt/end-of-file-fixer/trailing-whitespace across the repo (no semantic changes)."

### Phase 4: Lint fix commits

Address findings from `shellcheck`, `markdownlint-cli2`, `oxlint`. Split into focused commits:

- "Fix shellcheck warnings in `hooks/` and `skills/*/scripts/`"
- "Fix markdownlint findings"
- "Fix oxlint findings"

After each, re-run brainstorming/opencode/decision-logging test verifications. Any fix that requires real refactoring (not mechanical) gets a per-file disable comment with rationale and a follow-up tracked in the spec's Known Followups section.

### Phase 5: TS refactor of decision-logging source

Create `skills/decision-logging/src/` with TS ports of the current `.cjs` files. Logic preserved exactly; only typing added (and the implicit ESM-style `import` instead of `require`).

Tests stay in `.cjs` form during this phase — they continue to test the existing (still hand-written) `.cjs` files in `scripts/`. The shipped artifacts haven't changed yet.

Commit: "Port decision-logging scripts to TypeScript source under src/."

### Phase 6: Generate bundles, switch shipped artifacts

Run `scripts/build-decision-logging.sh`. The four entry points produce new `.cjs` files in `scripts/`. Delete the hand-written `approval-phrases.cjs` and `git-root.cjs` (inlined into bundles now; no longer separate shipped files).

Verify the bundles work via the existing bash integration tests:

```bash
bash tests/decision-logging/on-ask-user-question.test.sh
bash tests/decision-logging/on-user-prompt.test.sh
bash tests/decision-logging/on-stop.test.sh
```

Commit: "Replace hand-written scripts/*.cjs with bundled output from src/*.ts."

### Phase 7: Migrate unit tests to TS + bun test

Convert each `*.test.cjs` to `*.test.ts`. Update API from `node:test` / `node:assert` to Bun's Jest-compatible `test`/`expect`. Update `tests/decision-logging/package.json` to use `"test:unit": "bun test"`.

Commit: "Migrate decision-logging unit tests to TypeScript + bun test."

### Phase 8: Cleanup

- Remove the entire `dependencies` block from root `package.json` (`js-yaml` is the only entry; the file returns to a deps-free state matching pre-decision-logging snowball).
- Delete root `package-lock.json` and `node_modules/` (the latter is gitignored already).
- Revert the README zero-deps exception note (back to the wording from before commit `f240531`).
- Document the new Maintainer Setup section in README.

Verify the full suite passes end-to-end. Manual smoke: trigger an `AskUserQuestion` in a real Claude Code session against this repo, confirm a MADR appears.

Commit: "Drop js-yaml runtime dep; bundling now inlines it."

## Testing & verification strategy

Per-phase verification commands:

| Phase | Verification |
|---|---|
| 1 | `pre-commit validate-config` (well-formed YAML); `pre-commit run --all-files` (expect many failures — nothing fixed yet) |
| 2 | `git commit --allow-empty -m smoke` triggers hooks |
| 3 | brainstorm-server + opencode + decision-logging test suites all green |
| 4 | Same as phase 3 after each lint-fix commit |
| 5 | `cd tests/decision-logging && npm test` (still .cjs tests) green |
| 6 | `bash tests/decision-logging/*.test.sh` green; `node skills/decision-logging/scripts/write-madr.cjs` smoke test |
| 7 | `cd tests/decision-logging && bun test` green + bash integration green |
| 8 | Full suite + manual `AskUserQuestion` smoke |

**OpenCode plugin verification** (Phases 3, 4): `bash tests/opencode/test-bootstrap-caching.sh`. Exercises the plugin's actual load path.

**Brainstorming visual companion verification** (Phases 3, 4): `cd tests/brainstorm-server && npm test`. Covers HTTP, WebSocket, and lifecycle.

**Pre-commit config sanity**: `pre-commit validate-config` after Phase 1; `pre-commit autoupdate` confirms external repo URLs/revs reachable.

## Operational concerns

### Failure modes

| Condition | Behaviour |
|---|---|
| Bundle silently broken (wrong target option, missing entry) | Caught in Phase 6 integration tests; if it slips through, `~/.snowball/decision-logging-errors.log` reveals it at runtime |
| oxlint flags real bug in `brainstorming/server.cjs` that can't be fixed mechanically | Per-file disable with explanatory comment; track in this spec's Known Followups; do not blanket-allowlist |
| shellcheck flags pre-existing bug in `hooks/session-start` | Fix in Phase 4 if mechanical; otherwise per-file disable + Known Followup |
| Maintainer machine missing `oxlint`/`oxfmt`/`shfmt`/`markdownlint-cli2`/`pre-commit`/`bun` | Hook fails loudly with "command not found"; README Maintainer Setup lists install commands |
| Maintainer uses `git commit --no-verify` | Pre-commit can't defend against this. Trust the maintainer; document the risk in README |
| `bun test` runs slow during pre-commit | Most commits don't touch decision-logging files so the test hook doesn't fire. If it becomes a friction point, skip via `SKIP=bun-test-decision-logging git commit` |
| markdownlint reflows hand-crafted prose | `MD013: false` in `.markdownlint.jsonc` prevents line-length reflow; initial config errs on the side of NOT auto-reformatting prose |
| Bundle output checked in but source not updated (or vice versa) | `build-decision-logging` pre-commit hook regenerates from source on each commit touching `src/*.ts`, eliminating the drift case |
| Pre-commit framework breaks (Python version mismatch, etc.) | README documents `brew install pre-commit` as canonical install; pre-commit's own diagnostics are clear |

### Privacy / security

No new privacy concerns. Bundling inlines third-party code into committed artifacts — the bundle includes js-yaml's source verbatim (Apache 2.0 license, compatible). Add a credit line in the bundle's header comment.

### Performance

- Pre-commit framework overhead: ~200ms startup + per-hook time.
- Most commits touch <5 files; full hook pipeline runs in <2 seconds.
- `bun test` (3 unit-test files, ~21 tests) runs in <1s.
- `bun build` (4 entry points) runs in <500ms.
- Initial `pre-commit run --all-files` (Phase 3): expect 30-60 seconds for the first run, sub-second incrementally thereafter.

### Edge cases deferred

- CI integration (GitHub Actions running pre-commit + tests in CI) — separate spec.
- Pre-commit hook for Claude Code session-start integration — already exists; not in scope here.
- Custom `oxlint` rules — defaults only for now.
- Bundling for other snowball JS (`brainstorming/server.cjs`, `.opencode/plugins/snowball.js`) — not needed; they have no third-party runtime deps.

## Decisions made during brainstorming

| Question | Choice | Why |
|---|---|---|
| Runtime: Bun or Node? | Node (consumers); Bun (maintainer-only build) | Consumers shouldn't need a new runtime; bundling resolves the js-yaml issue |
| Bundler tool | `bun build` | Already installed for the maintainer; zero new dev deps; native TS |
| File layout | `src/` for TS, `scripts/` for bundles, both committed | Existing hook paths unchanged; clearest source-vs-output separation |
| Tests | Unit in TS via `bun test`; bash integration unchanged | Fast iteration; integration tests already verify bundled output |
| Build trigger | `scripts/build-decision-logging.sh` + pre-commit framework hook | Automatic regeneration; no drift |
| Initial lint/format pass | Aggressive — fix everything flagged | Highest correctness; front-loads disruption into one PR |
| Hook lineup | pre-commit-hooks + shfmt + shellcheck + markdownlint-cli2 + oxlint + oxfmt + local bun build/test | Canonical tools; user-picked oxc replaces prettier/eslint |
| oxfmt scope | JS/TS + JSON + YAML | Single formatter covers all structured formats |

## Known followups (not in scope here)

- CI integration (GitHub Actions running pre-commit + tests on push).
- If oxlint flags unfixable issues in `brainstorming/server.cjs`, evaluate a Phase 2 server.cjs rewrite.
- Investigate whether `brainstorming/scripts/server.cjs` also benefits from TS+bundle (it's stdlib-only Node so the js-yaml argument doesn't apply, but typing the HTTP/WebSocket handlers might catch real bugs).
- Add a `oxlint.json` / `oxfmt.json` config once initial pass reveals which rules need adjustment.
