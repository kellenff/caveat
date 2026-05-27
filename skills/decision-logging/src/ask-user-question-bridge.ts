import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { writeMadr, type MadrInput } from "./write-madr";

const ERROR_LOG = path.join(os.homedir(), ".snowball", "decision-logging-errors.log");

interface AskUserQuestionPayload {
  session_id?: string;
  tool_use_id?: string;
  tool_input?: {
    questions?: Array<{
      question: string;
      header?: string;
      options?: Array<{ label: string; description?: string }>;
    }>;
  };
  tool_response?: {
    answers?: Record<string, string>;
  };
}

function logError(msg: string): void {
  try {
    fs.mkdirSync(path.dirname(ERROR_LOG), { recursive: true });
    fs.appendFileSync(ERROR_LOG, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {
    // last-resort: nothing
  }
}

let raw = "";
process.stdin.on("data", (chunk: Buffer | string) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  let payload: AskUserQuestionPayload;
  try {
    payload = JSON.parse(raw) as AskUserQuestionPayload;
  } catch (err) {
    logError(`ask-user-question-bridge: bad JSON payload: ${(err as Error).message}`);
    process.exit(0);
    return;
  }

  const questions = payload.tool_input?.questions ?? [];
  const answers = payload.tool_response?.answers ?? {};
  const sessionId = payload.session_id ?? "unknown";
  const sourceEventId = payload.tool_use_id ?? "unknown";

  const isoDate = new Date().toISOString();

  for (const q of questions) {
    const answer = answers[q.question];
    if (!answer) continue;

    const chosen = q.options?.find((o) => o.label === answer) ?? {
      label: answer,
      description: "",
    };

    const input: MadrInput = {
      title: String(q.question).replace(/\?+$/, ""),
      status: "accepted",
      date: isoDate,
      deciders: [process.env.USER ?? "unknown"],
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
        considered_options: (q.options ?? []).map((o) => ({
          name: o.label,
          description: o.description ?? "",
        })),
        decision_outcome: `Chose **${chosen.label}**. ${chosen.description ?? ""}`,
      },
    };

    try {
      writeMadr(input);
    } catch (err) {
      logError(`ask-user-question-bridge: writeMadr failed: ${(err as Error).message}`);
    }
  }

  process.exit(0);
});
