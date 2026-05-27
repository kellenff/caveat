const fs = require("fs");
const path = require("path");
const { detectGitRoot } = require("./git-root.cjs");

const TYPES = ["observation", "implementation-choice", "hypothesis", "constraint"];
const CONFIDENCES = ["high", "medium", "low"];
const SOURCES = ["agent", "subagent"];
const SOURCE_SKILLS = [
  "brainstorming",
  "writing-plans",
  "systematic-debugging",
  "code-review",
  "ambient",
];

function validate(obs) {
  const errors = [];
  const requireString = (field) => {
    if (typeof obs[field] !== "string" || !obs[field])
      errors.push(`${field} required (non-empty string)`);
  };
  requireString("schema_version");
  requireString("timestamp");
  requireString("session_id");
  requireString("content");
  requireString("rationale");

  if (obs.schema_version !== "1.0") errors.push('schema_version must be "1.0"');
  if (!TYPES.includes(obs.type)) errors.push(`type must be one of ${TYPES.join(", ")}`);
  if (!CONFIDENCES.includes(obs.confidence))
    errors.push(`confidence must be one of ${CONFIDENCES.join(", ")}`);
  if (!SOURCES.includes(obs.source)) errors.push(`source must be one of ${SOURCES.join(", ")}`);
  if (!Array.isArray(obs.tags) || obs.tags.length < 1) {
    errors.push("tags must be a non-empty array");
  } else if (!SOURCE_SKILLS.includes(obs.tags[0])) {
    errors.push(`tags[0] must be one of ${SOURCE_SKILLS.join(", ")}`);
  }
  if (!Array.isArray(obs.related_files)) errors.push("related_files must be an array");
  if (obs.related_decision !== null && typeof obs.related_decision !== "string") {
    errors.push("related_decision must be string or null");
  }

  return { valid: errors.length === 0, errors };
}

function appendObservation(obs, opts = {}) {
  const result = validate(obs);
  if (!result.valid) throw new Error(`validation failed: ${result.errors.join("; ")}`);

  const gitRoot = opts.gitRoot || detectGitRoot();
  if (!gitRoot) throw new Error("not in a git repo");

  const dir = path.join(gitRoot, "docs", "snowball", "decisions");
  fs.mkdirSync(dir, { recursive: true });

  const file = path.join(dir, "observations.jsonl");
  fs.appendFileSync(file, JSON.stringify(obs) + "\n");
  return file;
}

if (require.main === module) {
  let raw = "";
  process.stdin.on("data", (chunk) => {
    raw += chunk;
  });
  process.stdin.on("end", () => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const lines = trimmed.includes("\n") ? trimmed.split("\n") : [trimmed];
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
