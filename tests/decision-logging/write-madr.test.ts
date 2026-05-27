import { test, expect } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import * as yaml from "js-yaml";
import {
  assembleMadr,
  slugify,
  writeMadr,
  type MadrInput,
} from "../../skills/decision-logging/src/write-madr";
import { makeTempRepo, cleanupTempRepo, readDecisionsDir } from "./test-helpers";

const sampleInput: MadrInput = {
  title: "Choose two-tier storage for decision logs",
  status: "accepted",
  date: "2026-05-25T14:30:00-07:00",
  deciders: ["kellen"],
  snowball: {
    schema_version: "1.0",
    source: "operator",
    confidence: "high",
    capture_mechanism: "ask-user-question",
    session_id: "abc-123",
    source_event_id: "tooluse-42",
    supersedes: null,
    tags: ["brainstorming", "architecture"],
  },
  body: {
    context: "We need a place to store decisions.",
    considered_options: [
      { name: "Two-tier", description: "MADR + observations.jsonl" },
      { name: "Uniform MADR", description: "every event a file" },
    ],
    decision_outcome: "Chose Two-tier. Format matches ceremony level.",
    consequences: ["Two formats to parse"],
    links: ["Spec: docs/snowball/specs/2026-05-25-decision-logging-design.md"],
  },
};

test("assembleMadr produces parseable frontmatter", () => {
  const md = assembleMadr(sampleInput);
  const fmMatch = md.match(/^---\n([\s\S]+?)\n---\n/);
  expect(fmMatch).not.toBeNull();
  const fm = yaml.load(fmMatch![1]) as Record<string, unknown>;
  expect(fm.title).toBe(sampleInput.title);
  expect((fm.snowball as Record<string, unknown>).schema_version).toBe("1.0");
  expect((fm.snowball as Record<string, unknown>).tags).toEqual(["brainstorming", "architecture"]);
});

test("assembleMadr renders body sections in canonical order", () => {
  const md = assembleMadr(sampleInput);
  const ctxIdx = md.indexOf("## Context and Problem Statement");
  const optIdx = md.indexOf("## Considered Options");
  const outIdx = md.indexOf("## Decision Outcome");
  const consIdx = md.indexOf("## Consequences");
  const linkIdx = md.indexOf("## Links");
  expect(ctxIdx).toBeLessThan(optIdx);
  expect(optIdx).toBeLessThan(outIdx);
  expect(outIdx).toBeLessThan(consIdx);
  expect(consIdx).toBeLessThan(linkIdx);
});

test("assembleMadr omits empty optional sections", () => {
  const minimal: MadrInput = {
    ...sampleInput,
    body: { context: "ctx", decision_outcome: "chose X" },
  };
  const md = assembleMadr(minimal);
  expect(md).toContain("## Context and Problem Statement");
  expect(md).toContain("## Decision Outcome");
  expect(md).not.toContain("## Considered Options");
  expect(md).not.toContain("## Consequences");
  expect(md).not.toContain("## Links");
});

test("slugify lowercases and replaces non-alphanumerics with hyphens", () => {
  expect(slugify("Choose Two-tier Storage")).toBe("choose-two-tier-storage");
  expect(slugify("Don't! Refactor")).toBe("don-t-refactor");
});

test("slugify truncates to a reasonable max length", () => {
  const long = "a".repeat(200);
  const s = slugify(long);
  expect(s.length).toBeLessThanOrEqual(60);
});

test("slugify handles non-string input by returning a fallback", () => {
  expect(slugify(null)).toBe("untitled");
  expect(slugify("")).toBe("untitled");
});

test("writeMadr writes to <repo>/docs/snowball/decisions/<timestamp>-<slug>.md", () => {
  const repo = makeTempRepo();
  try {
    const filePath = writeMadr(sampleInput, { gitRoot: repo });
    expect(filePath.startsWith(path.join(repo, "docs", "snowball", "decisions") + path.sep)).toBe(
      true,
    );
    expect(fs.existsSync(filePath)).toBe(true);
    const files = readDecisionsDir(repo);
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/^2026-05-25T1430-choose-two-tier-storage-for-decision-logs\.md$/);
  } finally {
    cleanupTempRepo(repo);
  }
});

test("writeMadr creates the decisions directory if absent", () => {
  const repo = makeTempRepo();
  try {
    writeMadr(sampleInput, { gitRoot: repo });
    expect(fs.existsSync(path.join(repo, "docs", "snowball", "decisions"))).toBe(true);
  } finally {
    cleanupTempRepo(repo);
  }
});

test("writeMadr appends a suffix when minute collision occurs", () => {
  const repo = makeTempRepo();
  try {
    writeMadr(sampleInput, { gitRoot: repo });
    const p2 = writeMadr({ ...sampleInput }, { gitRoot: repo });
    expect(fs.existsSync(p2)).toBe(true);
    const files = readDecisionsDir(repo);
    expect(files.length).toBe(2);
  } finally {
    cleanupTempRepo(repo);
  }
});
