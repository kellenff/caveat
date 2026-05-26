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
