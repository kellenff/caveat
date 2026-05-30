# M2 Brain-Jam Companion in Brainstorming

**Date:** 2026-05-30
**Status:** Draft
**Scope:** `skills/brainstorming/SKILL.md` only
**Depends on (optional, external):** `m2-brainstorm` plugin (`m2-brainstorm:brain-jam` skill + `m2-brainstorm` CLI)

## Problem

The `brainstorming` skill drives idea-to-design exploration entirely from one model's perspective. The separately-installed `m2-brainstorm` plugin offers a complementary capability — its `brain-jam` skill runs a multi-round dialogue with MiniMax (a skeptical pragmatist plus a technical enthusiast) to surface angles a single model misses. Today the two are disconnected: a user mid-brainstorm who would benefit from a second-model perspective has no prompt to reach for it, and `brain-jam` itself only fires on explicit invocation.

The fit is precise. `m2-brainstorm:brain-jam` explicitly excludes from-scratch ideation ("that belongs to `snowball:brainstorming`") and targets "a second perspective on a design or product question" with "real trade-offs and multiple defensible angles." That is exactly the moment in brainstorming when 2-3 alternatives are stable but their pros/cons cross-cut and no option clearly wins.

The constraint: `brainstorming` ships with snowball, but `m2-brainstorm` is an external plugin most snowball users will not have installed. Any integration must degrade silently to today's behavior when it is absent.

## Goals

1. Offer the MiniMax brain-jam as an optional second brainstorming partner, surfaced once per session like the Visual Companion.
2. Make the offer only when the `m2-brainstorm` CLI is actually installed; otherwise behave exactly as today, saying nothing.
3. When used, delegate to the existing `m2-brainstorm:brain-jam` skill rather than reimplementing its logic, and reclaim control so brainstorming remains the driver.
4. Touch one file (`skills/brainstorming/SKILL.md`) and leave all existing behavior unchanged when the plugin is absent.

## Non-Goals

- **Modifying the `m2-brainstorm` plugin.** It is external and out of scope; integration is one-directional, controlled entirely from brainstorming's prose.
- **Extending the pattern to other skills** (e.g., `systematic-debugging`). Brainstorming only for now; other skills can adopt the pattern later if it proves useful.
- **Bundling, installing, or version-pinning `m2-brainstorm`.** No install hints, no marketplace wiring. Detection only.
- **A shared/reusable offer reference file.** A single consumer does not warrant the indirection (YAGNI).
- **New automated tests.** This is a prose change to a skill; see Testing.

## Design

### Behavior overview

The companion is a session-level *tool*, not a mode — mirroring the Visual Companion. Accepting the offer means it is *available*; it does not route every decision through MiniMax. It is reached for only at genuinely cross-cutting decision points.

```text
Session start
  ├─ (existing) Visual questions ahead? → offer Visual Companion (own message)
  ├─ NEW: m2-brainstorm CLI installed AND trade-offs plausible?
  │        ├─no──→ say nothing, proceed as today
  │        └─yes─→ offer M2 brain-jam (own message)
  └─ Ask clarifying questions → Propose 2-3 approaches
                                   └─ alternatives stable + trade-offs cross-cut?
                                        ├─ OPTIONAL: structured-argumentation (your reasoning → argdown)
                                        └─ OPTIONAL: delegate to m2-brainstorm:brain-jam (second-model reasoning)
                                             └─ fold synthesized angles back, reclaim control
```

### Detection (parse at the boundary)

At the point in the flow where the offer would be made, run one check and resolve it to a boolean before any offer logic:

```bash
[ -x "$HOME/.config/m2-brainstorm/bin/m2-brainstorm" ]
```

If the binary is not present or not executable, skip the offer entirely and continue with normal brainstorming. No message, no mention. This matches how the Visual Companion is silent when a session has no visual content.

### The offer (its own message)

Make the offer when the binary is detected **and** the brainstorm is substantive enough that cross-cutting trade-offs are plausible — the same topic-conditional spirit as the Visual Companion ("when you anticipate that upcoming questions will involve visual content"). Skip it for trivially-simple brainstorms where no real alternatives will arise; the binary being installed is necessary but not sufficient.

When making the offer, present it as a standalone message — subject to the same strict rule the Visual Companion offer follows ("its own message; do not combine with clarifying questions, context summaries, or any other content"):

> I can bring in MiniMax (M2) as a second brainstorming partner through the `m2-brainstorm` plugin. When we hit a genuinely cross-cutting trade-off, it role-plays a skeptical pragmatist and a technical enthusiast across a few rounds and often surfaces angles I'd miss alone. It's token-intensive and needs a MiniMax API key. Want it available for this session? I'll only reach for it on hard, cross-cutting calls — not every question.

**Sequencing:** When both companions apply, the Visual Companion offer goes first, then the brain-jam offer — each its own standalone message, before clarifying questions begin.

### When it is used (per-decision gate)

Reach for the jam only when **alternatives are stable and their pros/cons cross-cut — no single option clearly wins.** This is the same condition that already gates the `structured-argumentation` optional sub-skill at the "Propose 2-3 approaches" step, so the two share one trigger and do different jobs.

### How it is used (delegate, then reclaim control)

Invoke `m2-brainstorm:brain-jam` via the Skill tool, framed as *a second perspective on these specific, already-stable alternatives*. That framing satisfies brain-jam's valid-use criteria and sidesteps its "NOT for from-scratch exploration" guard, which would otherwise fire because brainstorming is itself a from-scratch context.

When `brain-jam` reaches its hand-off step ("draft a design doc, hand back to `snowball:brainstorming`, or keep digging?"), the answer when invoked from brainstorming is always **hand the synthesized angles back to brainstorming** and continue presenting approaches. Brainstorming stays the driver; brain-jam is a sub-routine that returns angles.

### Relationship to structured-argumentation

Complementary, can chain. Argdown externalizes the structure of *your own* reasoning; brain-jam injects a *second model's* reasoning. A natural combination: jam to surface angles, then argdown to structure the resulting option/trade-off graph.

### Concrete edits to `skills/brainstorming/SKILL.md`

1. **Checklist** — insert a new conditional step after "Offer visual companion" (renumber the rest):

   > **Offer M2 brain-jam companion** (if the `m2-brainstorm` CLI is installed and the topic may involve cross-cutting trade-offs) — its own message, like the visual companion offer. See the M2 Brain-Jam Companion section below.

2. **Process-flow digraph** — thread one decision node between the Visual Companion path and "Ask clarifying questions":

   ```dot
   "Offer Visual Companion..." -> "Offer M2 brain-jam?";
   "Visual questions ahead?"   -> "Offer M2 brain-jam?" [label="no"];
   "Offer M2 brain-jam?"       -> "Offer M2 brain-jam\n(own message)" [label="yes"];
   "Offer M2 brain-jam?"       -> "Ask clarifying questions" [label="no"];
   "Offer M2 brain-jam\n(own message)" -> "Ask clarifying questions";
   ```

   The `"Offer M2 brain-jam?"` decision encapsulates both conditions (CLI installed **and** trade-offs plausible); the prose defines them.

   The *use* of the tool at the approaches step stays prose-only, consistent with how `structured-argumentation` is represented (it has no digraph node either).

3. **New prose section** `## M2 Brain-Jam Companion`, parallel to `## Visual Companion`, containing: one-line description, detection check, offer text, the per-decision gate, the delegate-and-reclaim-control mechanics, and the relationship to structured-argumentation.

4. **"Exploring approaches" subsection** — add a brief bullet next to the existing `structured-argumentation` "OPTIONAL SUB-SKILL" bullet, cross-referencing the M2 Brain-Jam Companion section as the second-model option available at the same decision point.

## Error Handling

- **Plugin not installed:** silent skip at detection. The common case for snowball users.
- **Jam fails mid-session** (missing API key, CLI error, empty turns): `brain-jam` already documents its exit codes and failure modes. Brainstorming notes the jam did not pan out and continues text-only. The offer and the jam never block design progress.
- **Brain-jam tries to take over** (its from-scratch guard or hand-off step): pre-empted by the framing in "How it is used" — invoke with second-perspective framing and always return control.

## Testing

No new automated tests. This is a prose change to a skill, and referencing an external optionally-installed skill is already established practice in this same file — `elements-of-style:writing-clearly-and-concisely` (referenced "if available") is not in-repo either, and no cross-reference test requires referenced skills to exist locally. The skill-triggering tests are behavioral (prompt → does the skill fire) and are unaffected by an added optional section.

Manual verification before completion:

1. Detection path is correct — confirm `$HOME/.config/m2-brainstorm/bin/m2-brainstorm` is the binary the `m2-brainstorm:brain-jam` skill invokes.
2. The offer fires only when the binary is present, and is suppressed (no mention) when absent.
3. The new section, checklist step, and digraph read coherently and the delegation framing is unambiguous.

## Open Questions

None. All design decisions resolved during brainstorming: session-level offer, CLI-binary detection with silent skip, delegate-to-skill invocation, brainstorming-only scope, full-parallel-to-Visual-Companion footprint.
