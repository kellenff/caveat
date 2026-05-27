// Reads a PostToolUse payload from stdin and emits one writeMadr() call
// per question-answer pair. Errors are caught and logged; the bridge always
// exits 0 so the hook doesn't disrupt the session.

const fs = require("fs");
const path = require("path");
const os = require("os");
const { writeMadr } = require("./write-madr.cjs");

const ERROR_LOG = path.join(os.homedir(), ".snowball", "decision-logging-errors.log");

function logError(msg) {
  try {
    fs.mkdirSync(path.dirname(ERROR_LOG), { recursive: true });
    fs.appendFileSync(ERROR_LOG, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {
    // last-resort: nothing
  }
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
    logError(`ask-user-question-bridge: bad JSON payload: ${err.message}`);
    process.exit(0);
  }

  const questions = (payload.tool_input && payload.tool_input.questions) || [];
  const answers = (payload.tool_response && payload.tool_response.answers) || {};
  const sessionId = payload.session_id || "unknown";
  const sourceEventId = payload.tool_use_id || "unknown";

  const isoDate = new Date().toISOString();

  for (const q of questions) {
    const answer = answers[q.question];
    if (!answer) continue;

    const chosen = (q.options || []).find((o) => o.label === answer) || {
      label: answer,
      description: "",
    };

    const input = {
      title: String(q.question).replace(/\?+$/, ""),
      status: "accepted",
      date: isoDate,
      deciders: [process.env.USER || "unknown"],
      snowball: {
        schema_version: "1.0",
        source: "operator",
        confidence: "high",
        capture_mechanism: "ask-user-question",
        session_id: sessionId,
        source_event_id: sourceEventId,
        supersedes: null,
        tags: ["ambient"],
      },
      body: {
        context: q.header ? `Question category: ${q.header}.` : "",
        considered_options: (q.options || []).map((o) => ({
          name: o.label,
          description: o.description || "",
        })),
        decision_outcome: `Chose **${chosen.label}**. ${chosen.description}`,
      },
    };

    try {
      writeMadr(input);
    } catch (err) {
      logError(`ask-user-question-bridge: writeMadr failed: ${err.message}`);
    }
  }

  process.exit(0);
});
