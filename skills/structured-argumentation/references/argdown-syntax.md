# Argdown syntax reference

A one-page cheat-sheet for the subset of argdown that the structured-argumentation skill uses. Full grammar: <https://argdown.org>.

## Statements

A reusable claim, addressed by a label in `[brackets]`:

```argdown
[Use SQLite]: An embedded single-file database for session checkpoints.
```

Reuse by label alone — text only needs to be defined once:

```argdown
[Use SQLite]
  + <Atomic writes>
  - <Schema migrations>
```

## Arguments

A reusable argument, addressed by a label in `<angle-brackets>`:

```argdown
<Atomic writes>: WAL gives crash safety for free.
```

Arguments can be expanded into premise-conclusion blocks:

```argdown
<Atomic writes>
  (1) SQLite ships WAL mode.
  (2) WAL provides crash-safe atomic commits.
  -----
  (3) An app using SQLite gets crash-safe writes for free.
```

The `-----` line separates premises from the conclusion. Use 4+ dashes.

## Relations

Four operators connect statements and arguments. The arrow always points *to* the thing being affected:

| Notation | Reads as |
|---|---|
| `[A] + [B]` | A supports B (left-to-right) |
| `[A] - [B]` | A attacks B |
| `[B] <+ [A]` | B is supported by A (right-to-left, useful when B is the conclusion you started with) |
| `[B] <- [A]` | B is attacked by A |

Arguments and statements mix freely:

```argdown
[Use SQLite]
  <+ <Atomic writes>
  <+ <Zero ops>
  <- <Schema migrations needed>
```

## Sections

Use markdown-style headings to group:

```argdown
# Storage backend decision

## Options under consideration
[Use SQLite]: ...
[Use JSONL append-only]: ...

## Recommended
[Recommended]: Use JSONL append-only.
```

## Comments

`// rest of line` or `/* block */`.

## What we deliberately do NOT use

- Tags (`#tag-name`) — argdown supports them; we don't need them for our IR use case.
- Frontmatter (YAML at the top) — keep argdown files about the argument; metadata belongs in the sibling document.
- Section-based map filtering — our argument graphs are small enough that filtering is unnecessary.
- Group/closed-group syntax for nested clusters — flat is fine at this scale.

If a future argument needs these, add them; do not preemptively use them.

## Validation

`node skills/structured-argumentation/scripts/validate-argdown.cjs <path>` parses the file and emits the JSON model on stdout (exit 0) or errors on stderr (exit 1). The bundle inlines `@argdown/core` — no `npm install` required.
