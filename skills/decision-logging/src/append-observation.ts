import * as fs from "node:fs";
import * as path from "node:path";
import { detectGitRoot } from "./git-root";

export const TYPES = ["observation", "implementation-choice", "hypothesis", "constraint"] as const;
export const CONFIDENCES = ["high", "medium", "low"] as const;
export const SOURCES = ["agent", "subagent"] as const;
export const SOURCE_SKILLS = [
  "brainstorming",
  "writing-plans",
  "systematic-debugging",
  "code-review",
  "ambient",
] as const;

export type ObservationType = (typeof TYPES)[number];
export type ObservationConfidence = (typeof CONFIDENCES)[number];
export type ObservationSource = (typeof SOURCES)[number];
export type ObservationSourceSkill = (typeof SOURCE_SKILLS)[number];

export interface Observation {
  schema_version: "1.0";
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
    if (typeof o[field] !== "string" || !o[field]) {
      errors.push(`${field} required (non-empty string)`);
    }
  };
  requireString("schema_version");
  requireString("timestamp");
  requireString("session_id");
  requireString("content");
  requireString("rationale");

  if (o.schema_version !== "1.0") errors.push('schema_version must be "1.0"');
  if (!TYPES.includes(o.type as ObservationType)) {
    errors.push(`type must be one of ${TYPES.join(", ")}`);
  }
  if (!CONFIDENCES.includes(o.confidence as ObservationConfidence)) {
    errors.push(`confidence must be one of ${CONFIDENCES.join(", ")}`);
  }
  if (!SOURCES.includes(o.source as ObservationSource)) {
    errors.push(`source must be one of ${SOURCES.join(", ")}`);
  }
  if (!Array.isArray(o.tags) || o.tags.length < 1) {
    errors.push("tags must be a non-empty array");
  } else if (!SOURCE_SKILLS.includes(o.tags[0] as ObservationSourceSkill)) {
    errors.push(`tags[0] must be one of ${SOURCE_SKILLS.join(", ")}`);
  }
  if (!Array.isArray(o.related_files)) {
    errors.push("related_files must be an array");
  }
  if (o.related_decision !== null && typeof o.related_decision !== "string") {
    errors.push("related_decision must be string or null");
  }

  return { valid: errors.length === 0, errors };
}

export function appendObservation(obs: Observation, opts: AppendObservationOpts = {}): string {
  const result = validate(obs);
  if (!result.valid) {
    throw new Error(`validation failed: ${result.errors.join("; ")}`);
  }

  const gitRoot = opts.gitRoot ?? detectGitRoot();
  if (!gitRoot) throw new Error("not in a git repo");

  const dir = path.join(gitRoot, "docs", "snowball", "decisions");
  fs.mkdirSync(dir, { recursive: true });

  const file = path.join(dir, "observations.jsonl");
  fs.appendFileSync(file, `${JSON.stringify(obs)}\n`);
  return file;
}

// CLI entry: read JSONL (single object or one per line) from stdin
if (require.main === module) {
  let raw = "";
  process.stdin.on("data", (chunk: Buffer | string) => {
    raw += chunk;
  });
  process.stdin.on("end", () => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const lines = trimmed.includes("\n") ? trimmed.split("\n") : [trimmed];
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        appendObservation(JSON.parse(line) as Observation);
      } catch (err) {
        process.stderr.write(`append-observation skipped line: ${(err as Error).message}\n`);
      }
    }
  });
}
