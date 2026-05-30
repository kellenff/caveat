# M2 Brain-Jam Companion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional, session-level "M2 brain-jam" companion to the `brainstorming` skill that delegates to the external `m2-brainstorm:brain-jam` skill at cross-cutting decision points, offered only when the plugin is installed and degrading silently otherwise.

**Architecture:** A documentation-only change to one file (`skills/brainstorming/SKILL.md`). Mirrors the existing Visual Companion pattern across three surfaces — a new prose section, a conditional checklist step, and a process-flow digraph node — plus a cross-reference bullet at the "Exploring approaches" step. No code, no new dependencies; behavior is realized by the prose instructions the model reads.

**Tech Stack:** Markdown; `pre-commit` with the `markdownlint-cli2` hook (the only automated gate); git.

**Spec:** [`docs/snowball/specs/2026-05-30-m2-brainstorm-companion-design.md`](../specs/2026-05-30-m2-brainstorm-companion-design.md)

---

## Verification Approach (read first)

This plan modifies a **skill's prose**, not code. There are no unit tests to write — fabricating `pytest`-style tests for instructional Markdown would be dishonest and verify nothing real. The genuine verification gates are:

1. **`markdownlint-cli2`** via pre-commit — objective, runs automatically on commit (it blocked an earlier commit over a bare code fence, so it is load-bearing here).
2. **Structural `rg` checks** — confirm the new section exists, the checklist renumbers cleanly to 10 sequential items, and every digraph node referenced by an edge is declared.
3. **Manual read-through** — confirm the inserted prose reads coherently and the delegation/reclaim-control framing is unambiguous.

`graphviz` (`dot`) is **not installed** in this environment, so the digraph is verified structurally (balanced node/edge references via `rg`), not by rendering.

**Note on pre-commit + unrelated changes:** The working tree has unrelated unstaged changes (`package.json`, `scripts/bump-version.sh`). pre-commit stashes unstaged files, lints only what is staged, then restores — so **stage only `skills/brainstorming/SKILL.md`** in each commit below.

## File Structure

- **Modify:** `skills/brainstorming/SKILL.md` — the only file touched. Four edits across two tasks:
  - Task 1 (content): new `## M2 Brain-Jam Companion` section appended at end-of-file; new cross-reference bullet in the "Exploring approaches" subsection.
  - Task 2 (navigation): new conditional checklist step (item 3, renumber rest to 10); new decision + offer nodes wired into the process-flow digraph.

Task 1 lands the destination section **first** so the references added in Task 2 ("See the M2 Brain-Jam Companion section") resolve. Each task leaves the skill internally coherent and is committed separately.

---

### Task 1: Add the M2 Brain-Jam Companion content

**Files:**

- Modify: `skills/brainstorming/SKILL.md` (append new section at end of file; add one bullet in the "Exploring approaches" subsection)

- [ ] **Step 1: Append the new `## M2 Brain-Jam Companion` section at the end of the file**

The file currently ends with these two lines (the close of the Visual Companion section):

```text
If they agree to the companion, read the detailed guide before proceeding:
`skills/brainstorming/visual-companion.md`
```

Use Edit with `old_string` = the final line `` `skills/brainstorming/visual-companion.md` `` and `new_string` = that same line followed by a blank line and the section below. Append exactly this content (it includes a `bash` fenced block — keep the language tag, that is what satisfies markdownlint):

`````markdown
## M2 Brain-Jam Companion

A second-model brainstorming partner: the `m2-brainstorm` plugin's `brain-jam` skill runs a multi-round dialogue with MiniMax (a skeptical pragmatist plus a technical enthusiast) and often surfaces angles a single model misses. Available as an optional tool when the plugin is installed — not a mode. Accepting the offer means it's *available* for hard decisions; it does NOT route every decision through MiniMax.

**Detecting availability:** Before offering, check whether the `m2-brainstorm` CLI is installed:

```bash
[ -x "$HOME/.config/m2-brainstorm/bin/m2-brainstorm" ]
```

If the binary is absent or not executable, say nothing and proceed with normal brainstorming. The offer never appears when the plugin isn't installed.

**Offering the companion:** When the binary is detected AND the brainstorm is substantive enough that cross-cutting trade-offs are plausible, offer it once — the same topic-conditional spirit as the Visual Companion. Skip the offer for trivially-simple brainstorms where no real alternatives will arise; the binary being installed is necessary but not sufficient.

> "I can bring in MiniMax (M2) as a second brainstorming partner through the m2-brainstorm plugin. When we hit a genuinely cross-cutting trade-off, it role-plays a skeptical pragmatist and a technical enthusiast across a few rounds and often surfaces angles I'd miss alone. It's token-intensive and needs a MiniMax API key. Want it available for this session? I'll only reach for it on hard, cross-cutting calls — not every question."

**This offer MUST be its own message.** Do not combine it with clarifying questions, context summaries, or any other content. When both companions apply, make the Visual Companion offer first, then this one — each its own standalone message — before clarifying questions begin. If the user declines, proceed with normal brainstorming.

**When to reach for it:** Only at the "Propose 2-3 approaches" step, once alternatives are stable and their pros/cons cross-cut (the same condition that gates the `snowball:structured-argumentation` sub-skill). Not for from-scratch ideation — that's what the rest of this skill is for.

**How to run it — delegate, then reclaim control:** Invoke `m2-brainstorm:brain-jam` via the Skill tool, framed as *a second perspective on these specific, already-stable alternatives*. That framing satisfies brain-jam's valid-use criteria and sidesteps its "NOT for from-scratch exploration" guard. When brain-jam reaches its hand-off step ("draft a design doc, hand back to `snowball:brainstorming`, or keep digging?"), always hand the synthesized angles back to brainstorming and continue presenting approaches. Brainstorming stays the driver; brain-jam is a sub-routine that returns angles. If the jam fails (missing API key, CLI error), note it and continue text-only — it never blocks design progress.

**Relationship to structured-argumentation:** Complementary, can chain. Argdown externalizes the structure of *your own* reasoning; brain-jam injects a *second model's* reasoning. A natural combination: jam to surface angles, then argdown to structure the resulting option/trade-off graph.
`````

- [ ] **Step 2: Add the cross-reference bullet in the "Exploring approaches" subsection**

Find this existing bullet (it is the `OPTIONAL SUB-SKILL` line under **Exploring approaches:**):

```text
- **OPTIONAL SUB-SKILL:** Once the alternatives are stable and their pros/cons cross-cut (the same consideration applies to multiple options, no single option clearly wins), use `snowball:structured-argumentation` to externalize the option/trade-off graph as a sibling `.argdown` file next to the spec. The graph surfaces the structure of the reasoning you've already done in prose — it does not replace prose deliberation. Skip for simple either/or choices.
```

Use Edit to append a sibling bullet immediately after it. `old_string` = the bullet above; `new_string` = that bullet followed by a newline and:

```text
- **OPTIONAL SUB-SKILL (second-model perspective):** At the same decision point, if the M2 brain-jam companion was offered and accepted this session, you may delegate to `m2-brainstorm:brain-jam` for a second-model perspective on the stable alternatives. See the M2 Brain-Jam Companion section below. Complementary to structured-argumentation: argdown structures your own reasoning, the jam brings MiniMax's.
```

- [ ] **Step 3: Verify markdownlint passes and both insertions are present**

Run:

```bash
pre-commit run markdownlint-cli2 --files skills/brainstorming/SKILL.md
rg -n '^## M2 Brain-Jam Companion$' skills/brainstorming/SKILL.md
rg -n 'OPTIONAL SUB-SKILL \(second-model perspective\)' skills/brainstorming/SKILL.md
```

Expected:

- markdownlint: `Passed`
- The section header matches on exactly one line.
- The new bullet matches on exactly one line.

If markdownlint reports `MD040/fenced-code-language`, a code fence is missing its language tag — confirm the `bash` tag survived the paste.

- [ ] **Step 4: Commit**

```bash
git add skills/brainstorming/SKILL.md
git commit -m "Add M2 brain-jam companion section to brainstorming skill"
```

---

### Task 2: Wire the offer into the checklist and process-flow digraph

**Files:**

- Modify: `skills/brainstorming/SKILL.md` (the `## Checklist` numbered list and the `digraph brainstorming` block)

- [ ] **Step 1: Insert the new checklist step and renumber to 10 items**

Replace the entire numbered checklist block. `old_string`:

```text
1. **Explore project context** — check files, docs, recent commits
2. **Offer visual companion** (if topic will involve visual questions) — this is its own message, not combined with a clarifying question. See the Visual Companion section below.
3. **Ask clarifying questions** — one at a time, understand purpose/constraints/success criteria
4. **Propose 2-3 approaches** — with trade-offs and your recommendation
5. **Present design** — in sections scaled to their complexity, get user approval after each section
6. **Write design doc** — save to `docs/snowball/specs/YYYY-MM-DD-<topic>-design.md` and commit
7. **Spec self-review** — quick inline check for placeholders, contradictions, ambiguity, scope (see below)
8. **User reviews written spec** — ask user to review the spec file before proceeding
9. **Transition to implementation** — invoke writing-plans skill to create implementation plan
```

`new_string`:

```text
1. **Explore project context** — check files, docs, recent commits
2. **Offer visual companion** (if topic will involve visual questions) — this is its own message, not combined with a clarifying question. See the Visual Companion section below.
3. **Offer M2 brain-jam companion** (if the `m2-brainstorm` CLI is installed and the topic may involve cross-cutting trade-offs) — its own message, like the visual companion offer. See the M2 Brain-Jam Companion section below.
4. **Ask clarifying questions** — one at a time, understand purpose/constraints/success criteria
5. **Propose 2-3 approaches** — with trade-offs and your recommendation
6. **Present design** — in sections scaled to their complexity, get user approval after each section
7. **Write design doc** — save to `docs/snowball/specs/YYYY-MM-DD-<topic>-design.md` and commit
8. **Spec self-review** — quick inline check for placeholders, contradictions, ambiguity, scope (see below)
9. **User reviews written spec** — ask user to review the spec file before proceeding
10. **Transition to implementation** — invoke writing-plans skill to create implementation plan
```

- [ ] **Step 2: Declare the two new digraph nodes**

In the `digraph brainstorming { ... }` block, find this node-declaration line:

```text
    "Offer Visual Companion\n(own message, no other content)" [shape=box];
```

Use Edit to add two declarations after it. `old_string` = the line above; `new_string`:

```text
    "Offer Visual Companion\n(own message, no other content)" [shape=box];
    "Offer M2 brain-jam?" [shape=diamond];
    "Offer M2 brain-jam\n(own message)" [shape=box];
```

- [ ] **Step 3: Reroute the digraph edges through the new decision node**

Find this edge block (the first five edges of the graph):

```text
    "Explore project context" -> "Visual questions ahead?";
    "Visual questions ahead?" -> "Offer Visual Companion\n(own message, no other content)" [label="yes"];
    "Visual questions ahead?" -> "Ask clarifying questions" [label="no"];
    "Offer Visual Companion\n(own message, no other content)" -> "Ask clarifying questions";
    "Ask clarifying questions" -> "Propose 2-3 approaches";
```

Replace it (`old_string` = the block above) with (`new_string`):

```text
    "Explore project context" -> "Visual questions ahead?";
    "Visual questions ahead?" -> "Offer Visual Companion\n(own message, no other content)" [label="yes"];
    "Visual questions ahead?" -> "Offer M2 brain-jam?" [label="no"];
    "Offer Visual Companion\n(own message, no other content)" -> "Offer M2 brain-jam?";
    "Offer M2 brain-jam?" -> "Offer M2 brain-jam\n(own message)" [label="yes"];
    "Offer M2 brain-jam?" -> "Ask clarifying questions" [label="no"];
    "Offer M2 brain-jam\n(own message)" -> "Ask clarifying questions";
    "Ask clarifying questions" -> "Propose 2-3 approaches";
```

- [ ] **Step 4: Verify numbering, digraph balance, and markdownlint**

Run:

```bash
pre-commit run markdownlint-cli2 --files skills/brainstorming/SKILL.md
rg -n '^[0-9]+\. \*\*' skills/brainstorming/SKILL.md | head -10
rg -n 'Offer M2 brain-jam' skills/brainstorming/SKILL.md
```

Expected:

- markdownlint: `Passed`.
- The checklist lines read `1.`…`10.` in order, with item `3.` being **Offer M2 brain-jam companion** and item `10.` being **Transition to implementation**.
- `Offer M2 brain-jam` matches **five** lines: two node declarations and three edges (`"Offer M2 brain-jam?"` appears as a decision diamond; `"Offer M2 brain-jam\n(own message)"` as a box). Confirm by eye that every node named in an edge is one of the two declared nodes — i.e., no edge references an undeclared node.

- [ ] **Step 5: Commit**

```bash
git add skills/brainstorming/SKILL.md
git commit -m "Wire M2 brain-jam offer into brainstorming checklist and flow"
```

---

## Self-Review (completed by plan author)

**Spec coverage** — every spec element maps to a task:

- Session-level offer mirroring Visual Companion → Task 1 Step 1 (section: "Offering the companion", own-message rule, sequencing).
- CLI-binary detection, silent skip when absent → Task 1 Step 1 ("Detecting availability").
- Topic-conditional offer gate → Task 1 Step 1 ("Offering the companion") + Task 2 Step 1 (checklist parenthetical).
- Per-decision use gate (stable + cross-cutting) → Task 1 Step 1 ("When to reach for it") + Task 1 Step 2 (cross-reference bullet).
- Delegate to `m2-brainstorm:brain-jam`, reclaim control, sidestep from-scratch guard → Task 1 Step 1 ("How to run it").
- Failure handling (text-only fallback) → Task 1 Step 1 ("How to run it").
- Relationship to structured-argumentation → Task 1 Step 1 (final paragraph) + Task 1 Step 2 (bullet).
- Checklist step → Task 2 Step 1. Process-flow digraph node → Task 2 Steps 2–3.
- Scope: one file only → File Structure; both commits touch only `skills/brainstorming/SKILL.md`.

**Placeholder scan:** No TBD/TODO/"add appropriate…" placeholders. Every edit shows exact `old_string`/`new_string` content.

**Type/name consistency:** Node names are identical across declarations and edges — `"Offer M2 brain-jam?"` (diamond) and `"Offer M2 brain-jam\n(own message)"` (box). The checklist item label "Offer M2 brain-jam companion" and the section header "M2 Brain-Jam Companion" are used consistently in every cross-reference. The detection path `$HOME/.config/m2-brainstorm/bin/m2-brainstorm` matches the spec and the `m2-brainstorm:brain-jam` skill's documented binary location.
