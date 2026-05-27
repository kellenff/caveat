import * as fs from "node:fs";
import * as path from "node:path";
import * as yaml from "js-yaml";
import { detectGitRoot } from "./git-root";

export type DecisionStatus = "proposed" | "accepted" | "rejected" | "deprecated" | "superseded";

export type Source = "operator" | "agent";
export type Confidence = "high" | "medium" | "low";
export type CaptureMechanism =
  | "ask-user-question"
  | "user-prompt-pattern"
  | "stop-hook-subagent"
  | "manual";
export type SourceSkill =
  | "brainstorming"
  | "writing-plans"
  | "systematic-debugging"
  | "code-review"
  | "ambient";

export interface SnowballMeta {
  schema_version: "1.0";
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
  if (typeof s !== "string" || !s.trim()) return "untitled";
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "untitled"
  );
}

export function assembleFrontmatter(input: MadrInput): string {
  const fm = {
    title: input.title,
    status: input.status ?? "accepted",
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
    sections.push("## Context and Problem Statement\n", `${b.context}\n`);
  }
  if (b.considered_options && b.considered_options.length) {
    sections.push("## Considered Options\n");
    for (const opt of b.considered_options) {
      sections.push(`- **${opt.name}** — ${opt.description}`);
    }
    sections.push("");
  }
  if (b.decision_outcome) {
    sections.push("## Decision Outcome\n", `${b.decision_outcome}\n`);
  }
  if (b.consequences && b.consequences.length) {
    sections.push("## Consequences\n");
    for (const c of b.consequences) sections.push(`- ${c}`);
    sections.push("");
  }
  if (b.links && b.links.length) {
    sections.push("## Links\n");
    for (const l of b.links) sections.push(`- ${l}`);
    sections.push("");
  }
  return sections.join("\n");
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
  if (!gitRoot) throw new Error("not in a git repo");

  const dir = path.join(gitRoot, "docs", "snowball", "decisions");
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
  let raw = "";
  process.stdin.on("data", (chunk: Buffer | string) => {
    raw += chunk;
  });
  process.stdin.on("end", () => {
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
