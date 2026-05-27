// Reads UserPromptSubmit payload from stdin; if it matches APPROVAL_PHRASES,
// writes a MADR with capture_mechanism=user-prompt-pattern, unless a recent
// ask-user-question MADR already captured the same operator approval.

const fs = require("fs");
const path = require("path");
const os = require("os");
const { matchesApproval } = require("./approval-phrases.cjs");
const { writeMadr } = require("./write-madr.cjs");
const { detectGitRoot } = require("./git-root.cjs");

const ERROR_LOG = path.join(os.homedir(), ".snowball", "decision-logging-errors.log");
const DEDUP_WINDOW_MS = 60 * 1000;

function logError(msg) {
  try {
    fs.mkdirSync(path.dirname(ERROR_LOG), { recursive: true });
    fs.appendFileSync(ERROR_LOG, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}

function isRecentAskUserQuestion(gitRoot) {
  const dir = path.join(gitRoot, "docs", "snowball", "decisions");
  if (!fs.existsSync(dir)) return false;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
  if (!files.length) return false;

  // Find file with maximum mtimeMs (most recently modified)
  let latestPath = null;
  let latestMtime = -1;
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.mtimeMs > latestMtime) {
      latestMtime = stat.mtimeMs;
      latestPath = fullPath;
    }
  }

  if (!latestPath) return false;
  if (Date.now() - latestMtime > DEDUP_WINDOW_MS) return false;
  const content = fs.readFileSync(latestPath, "utf8");
  return /capture_mechanism:\s*ask-user-question/.test(content);
}

let raw = "";
process.stdin.on("data", (chunk) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (err) {
    logError(`user-prompt-bridge: bad JSON: ${err.message}`);
    process.exit(0);
  }

  const prompt = payload.prompt || "";
  const sessionId = payload.session_id || "unknown";

  if (!matchesApproval(prompt)) process.exit(0);

  const gitRoot = detectGitRoot();
  if (!gitRoot) process.exit(0);

  if (isRecentAskUserQuestion(gitRoot)) process.exit(0);

  const isoDate = new Date().toISOString();
  const input = {
    title: "Free-text operator approval",
    status: "accepted",
    date: isoDate,
    deciders: [process.env.USER || "unknown"],
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
    logError(`user-prompt-bridge: writeMadr failed: ${err.message}`);
  }

  process.exit(0);
});
