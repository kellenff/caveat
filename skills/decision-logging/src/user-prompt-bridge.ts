import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { matchesApproval } from "./approval-phrases";
import { writeMadr, type MadrInput } from "./write-madr";
import { detectGitRoot } from "./git-root";

const ERROR_LOG = path.join(os.homedir(), ".snowball", "decision-logging-errors.log");
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
  const dir = path.join(gitRoot, "docs", "snowball", "decisions");
  if (!fs.existsSync(dir)) return false;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
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
  const content = fs.readFileSync(latestPath, "utf8");
  return /capture_mechanism:\s*ask-user-question/.test(content);
}

let raw = "";
process.stdin.on("data", (chunk: Buffer | string) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  let payload: UserPromptPayload;
  try {
    payload = JSON.parse(raw) as UserPromptPayload;
  } catch (err) {
    logError(`user-prompt-bridge: bad JSON: ${(err as Error).message}`);
    process.exit(0);
    return;
  }

  const prompt = payload.prompt ?? "";
  const sessionId = payload.session_id ?? "unknown";

  if (!matchesApproval(prompt)) process.exit(0);

  const gitRoot = detectGitRoot();
  if (!gitRoot) process.exit(0);
  else if (isRecentAskUserQuestion(gitRoot)) process.exit(0);

  const isoDate = new Date().toISOString();
  const input: MadrInput = {
    title: "Free-text operator approval",
    status: "accepted",
    date: isoDate,
    deciders: [process.env.USER ?? "unknown"],
    snowball: {
      schema_version: "1.0",
      source: "operator",
      confidence: "high",
      capture_mechanism: "user-prompt-pattern",
      session_id: sessionId,
      source_event_id: `prompt-${Date.now()}`,
      supersedes: null,
      tags: ["ambient"],
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
