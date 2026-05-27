import { test, expect } from "bun:test";
import * as fs from "node:fs";
import { setupWorkerEnv, runWorker, cleanupWorkerEnv } from "./worker-test-helpers";

const validObservation = JSON.stringify({
  schema_version: "1.0",
  timestamp: "2026-05-26T12:00:00Z",
  session_id: "fixture",
  type: "observation",
  confidence: "high",
  source: "subagent",
  content: "Fixture observation.",
  rationale: "Test seam.",
  related_files: [],
  related_decision: null,
  tags: ["ambient"],
});

test("worker honors SNOWBALL_CLAUDE_BIN env var", () => {
  const env = setupWorkerEnv({
    transcriptLines: ['{"turn": 1}'],
    fakeClaudeOutput: validObservation + "\n",
  });
  try {
    const result = runWorker(env);
    expect(result.status).toBe(0);
    expect(fs.existsSync(env.claudeMarker)).toBe(true);
  } finally {
    cleanupWorkerEnv(env);
  }
});

test("first run creates cursor file at total line count", () => {
  const env = setupWorkerEnv({
    transcriptLines: ['{"turn": 1}', '{"turn": 2}', '{"turn": 3}'],
    fakeClaudeOutput: validObservation + "\n",
  });
  try {
    const result = runWorker(env);
    expect(result.status).toBe(0);
    expect(fs.existsSync(env.cursorPath)).toBe(true);
    expect(fs.readFileSync(env.cursorPath, "utf-8").trim()).toBe("3");
  } finally {
    cleanupWorkerEnv(env);
  }
});

test("worker exits early when cursor equals total lines", () => {
  const env = setupWorkerEnv({
    transcriptLines: ['{"turn": 1}', '{"turn": 2}'],
    fakeClaudeOutput: validObservation + "\n",
    initialCursor: 2,
  });
  try {
    const result = runWorker(env);
    expect(result.status).toBe(0);
    expect(fs.existsSync(env.claudeMarker)).toBe(false);
    expect(fs.existsSync(env.observationsPath)).toBe(false);
    expect(fs.readFileSync(env.cursorPath, "utf-8").trim()).toBe("2");
  } finally {
    cleanupWorkerEnv(env);
  }
});

test("worker pipes only post-cursor transcript lines to claude", () => {
  const env = setupWorkerEnv({
    transcriptLines: [
      '{"line": "L1"}',
      '{"line": "L2"}',
      '{"line": "L3"}',
      '{"line": "L4"}',
      '{"line": "L5"}',
    ],
    fakeClaudeOutput: validObservation + "\n",
    initialCursor: 2,
  });
  try {
    const result = runWorker(env);
    expect(result.status).toBe(0);
    const piped = fs.readFileSync(env.claudeStdinSink, "utf-8");
    expect(piped).not.toContain("L1");
    expect(piped).not.toContain("L2");
    expect(piped).toContain("L3");
    expect(piped).toContain("L4");
    expect(piped).toContain("L5");
    expect(fs.readFileSync(env.cursorPath, "utf-8").trim()).toBe("5");
  } finally {
    cleanupWorkerEnv(env);
  }
});
