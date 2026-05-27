---
name: structured-argumentation
description: "Use when you need to externalize the structure of an argument you have already reasoned through in prose — surfacing premises and conclusion of a dense review claim, the option/trade-off graph of 3+ design alternatives, the hypothesis-elimination tree of a stuck debugging session, or the rationale behind a captured decision. Argdown is an intermediate representation, not a reasoning substrate — do not use this skill to do the reasoning. Not for simple either/or choices or single-cause bugs."
---

# Structured Argumentation

## Overview

Argdown is an intermediate representation (IR) for arguments. You reason in prose; argdown surfaces the *structure* of that reasoning — premises, conclusion, support edges, attack edges — so the structure becomes inspectable, diffable, and consumable by downstream tools or human reviewers.

**Core principle:** argdown shows the argument. The prose workflow makes the argument. Do not invoke this skill to *do* the reasoning.

## When to use (and when not to)

| Signal | Use argdown? |
|---|---|
| 2 alternatives, one clearly wins | No (prose) |
| 3+ alternatives with cross-cutting pros/cons | Yes — externalize once stable |
| Single hypothesis, evidence confirms quickly | No |
| 2+ hypotheses failed, branching evidence in scrollback | Yes — surface the elimination tree |
| Review comment with one claim | No |
| Review comment bundles 3+ joined claims | Yes — decompose into per-premise verification |
| Routine commit / trivial bugfix rationale | No (overkill) |
| Capturing a non-trivial decision for downstream consumers (flannel etc.) | Yes — attach `.argdown` to the MADR |

Invoke this skill **after** your prose reasoning is well underway, not before. If the structure is small enough to hold in your head while writing prose, stay in prose.

## Argdown crash course

Full syntax: see `references/argdown-syntax.md`. Quick form:

```argdown
[Statement-label]: Statement text.       // a reusable claim, addressed by label
<Argument-label>: One-line summary.      // a reusable argument, addressed by label

[A] + [B]    // A supports B (also: <A> +> [B]  for argument-supports-statement)
[A] - [B]    // A attacks B
[B] <+ [A]   // B is supported by A (inbound form, useful at the conclusion)

<Argument-label>
  (1) Premise.
  (2) Premise.
  -----
  (3) Conclusion.
```

## Output conventions

- **As a sibling artifact** to the document the argument supports — for a brainstorming spec at `docs/snowball/specs/2026-05-27-storage-design.md`, save the option-comparison map at `docs/snowball/specs/2026-05-27-storage-design.argdown`.
- **Inline as a fenced code block** when the argument is embedded in a longer document (review responses, MADR body). Use ` ```argdown ` as the fence language.
- **One file per argument graph.** Do not concatenate unrelated arguments.

## Templates

Three canonical shapes live under `templates/`:

- `templates/option-comparison.argdown` — for `brainstorming` exploring 3+ alternatives.
- `templates/hypothesis-elimination.argdown` — for `systematic-debugging` after Phase 3 cycles fail.
- `templates/claim-decomposition.argdown` — for `receiving-code-review` decomposing a dense reviewer claim into independently-verifiable premises.

Copy the template, replace the labels and statements with the structure your prose reasoning produced, and save alongside the document the argument supports.

## Validation

The skill ships a parser-only validator. After writing or editing an `.argdown` file:

```bash
node skills/structured-argumentation/scripts/validate-argdown.cjs <path>
# or pipe from stdin:
cat my-argument.argdown | node skills/structured-argumentation/scripts/validate-argdown.cjs -
```

Exit 0 + JSON model on stdout means the file parses. Exit 1 + errors on stderr means it doesn't. No `npm install` is required — the parser is inlined into the bundled `.cjs`.

## Anti-patterns

- **Reasoning in argdown.** If you're drafting claims to "see what the structure says," stop. Reason in prose; the structure follows.
- **Externalizing trivial arguments.** Two options, one obviously better → prose. One-cause bug, confirmed → prose. Argdown earns its keep when branching exceeds working memory.
- **Substituting argdown for evidence gathering.** A pretty hypothesis tree without a real debugger session is theater. `systematic-debugging` Phase 1 (evidence) is non-negotiable — argdown surfaces what investigation produced, it does not produce findings.
- **Dressing up performative agreement.** When invoked from `receiving-code-review`, every decomposed premise must be independently verified against the codebase. The graph is the verification *task list*, not a substitute for verification.
- **Ritualistic invocation.** If you find yourself reaching for argdown on every PR, every decision, every bug — the skill's negative triggers above exist precisely to stop that. Stay in prose for the simple cases.

## Red flags

| Excuse / thought | Reality |
|---|---|
| "Let me draft this in argdown to think it through." | Argdown is downstream of reasoning. Reason first, externalize after. |
| "This 2-option decision deserves a proper argument graph." | No — it deserves a sentence. |
| "I'll write the hypothesis tree first, then go investigate." | Phase 1 of `systematic-debugging` is investigation. The tree follows the evidence, not the other way around. |
| "The reviewer's comment has 3 claims, but they're all obviously right — I'll just agree." | If the claims are simple, just verify and act. Decompose only when verification needs structure. |
| "I'll attach an argdown file to this trivial MADR for consistency." | Decision-logging schema makes the attachment optional precisely so trivial decisions don't get bloated. |
