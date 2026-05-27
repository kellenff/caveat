import { test, expect } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  validate,
  appendObservation,
  type Observation,
} from "../../skills/decision-logging/src/append-observation";
import { makeTempRepo, cleanupTempRepo } from "./test-helpers";

const valid: Observation = {
  schema_version: "1.0",
  timestamp: "2026-05-25T14:30:45-07:00",
  session_id: "abc-123",
  type: "observation",
  confidence: "medium",
  source: "subagent",
  content: "The cache key uses timestamp.",
  rationale: "Saw cache.ts investigation pivot.",
  related_files: ["src/cache.ts"],
  related_decision: null,
  tags: ["systematic-debugging", "caching"],
};

test("validate accepts a canonical observation", () => {
  const result = validate(valid);
  expect(result.valid).toBe(true);
});

test("validate rejects missing required fields", () => {
  const result = validate({ ...valid, content: undefined });
  expect(result.valid).toBe(false);
  expect(result.errors.some((e) => e.includes("content"))).toBe(true);
});

test("validate rejects out-of-enum values", () => {
  expect(validate({ ...valid, type: "bogus" }).valid).toBe(false);
  expect(validate({ ...valid, confidence: "extreme" }).valid).toBe(false);
  expect(validate({ ...valid, source: "human" }).valid).toBe(false);
});

test("validate requires tags[0] to be in the source-skill enum", () => {
  expect(validate({ ...valid, tags: ["not-a-skill"] }).valid).toBe(false);
  expect(validate({ ...valid, tags: ["brainstorming", "extra"] }).valid).toBe(true);
});

test("appendObservation appends a single line to observations.jsonl", () => {
  const repo = makeTempRepo();
  try {
    appendObservation(valid, { gitRoot: repo });
    appendObservation({ ...valid, content: "second" }, { gitRoot: repo });
    const file = path.join(repo, "docs", "snowball", "decisions", "observations.jsonl");
    const lines = fs.readFileSync(file, "utf8").trim().split("\n");
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0]).content).toBe("The cache key uses timestamp.");
    expect(JSON.parse(lines[1]).content).toBe("second");
  } finally {
    cleanupTempRepo(repo);
  }
});

test("appendObservation throws on invalid input", () => {
  const repo = makeTempRepo();
  try {
    expect(() =>
      appendObservation({ ...valid, type: "nope" } as unknown as Observation, { gitRoot: repo }),
    ).toThrow(/validation/);
  } finally {
    cleanupTempRepo(repo);
  }
});

test("validate accepts schema_version 1.1 with argdown_ref", () => {
  const v11: Observation = {
    ...valid,
    schema_version: "1.1",
    argdown_ref: { path: "../specs/2026-05-27-design.argdown", node_label: "Recommended" },
  };
  expect(validate(v11).valid).toBe(true);
});

test("validate accepts schema_version 1.1 without argdown_ref (additive)", () => {
  expect(validate({ ...valid, schema_version: "1.1" }).valid).toBe(true);
});

test("validate rejects argdown_ref on schema_version 1.0", () => {
  const bad: Observation = {
    ...valid,
    argdown_ref: { path: "x.argdown", node_label: "x" },
  };
  const result = validate(bad);
  expect(result.valid).toBe(false);
  expect(result.errors.some((e) => e.includes("argdown_ref requires schema_version 1.1"))).toBe(
    true,
  );
});

test("validate rejects malformed argdown_ref", () => {
  const bad: Observation = {
    ...valid,
    schema_version: "1.1",
    argdown_ref: { path: "", node_label: "x" },
  };
  const result = validate(bad);
  expect(result.valid).toBe(false);
  expect(result.errors.some((e) => e.includes("argdown_ref.path"))).toBe(true);
});

test("validate rejects unknown schema_version", () => {
  const bad = { ...valid, schema_version: "2.0" } as unknown as Observation;
  expect(validate(bad).valid).toBe(false);
});
