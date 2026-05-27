import { test, expect } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const VALIDATOR = path.join(
  REPO_ROOT,
  "skills",
  "structured-argumentation",
  "scripts",
  "validate-argdown.cjs",
);
const TEMPLATES_DIR = path.join(
  REPO_ROOT,
  "skills",
  "structured-argumentation",
  "templates",
);
const WORKED_EXAMPLE = path.join(
  REPO_ROOT,
  "skills",
  "systematic-debugging",
  "hypothesis-graph.argdown",
);

function runValidator(filePath: string): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync("node", [VALIDATOR, filePath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, stdout, stderr: "" };
  } catch (err) {
    const e = err as { status: number; stdout: Buffer | string; stderr: Buffer | string };
    return {
      code: e.status,
      stdout: e.stdout?.toString() ?? "",
      stderr: e.stderr?.toString() ?? "",
    };
  }
}

test("bundled validator exists and is reasonably sized", () => {
  const stat = fs.statSync(VALIDATOR);
  expect(stat.isFile()).toBe(true);
  expect(stat.size).toBeLessThan(550_000);
});

test("validates option-comparison template", () => {
  const result = runValidator(path.join(TEMPLATES_DIR, "option-comparison.argdown"));
  expect(result.code).toBe(0);
  const json = JSON.parse(result.stdout);
  expect(json).toHaveProperty("arguments");
  expect(json).toHaveProperty("statements");
  expect(json).toHaveProperty("relations");
});

test("validates hypothesis-elimination template", () => {
  const result = runValidator(path.join(TEMPLATES_DIR, "hypothesis-elimination.argdown"));
  expect(result.code).toBe(0);
});

test("validates claim-decomposition template", () => {
  const result = runValidator(path.join(TEMPLATES_DIR, "claim-decomposition.argdown"));
  expect(result.code).toBe(0);
});

test("validates the systematic-debugging worked example", () => {
  const result = runValidator(WORKED_EXAMPLE);
  expect(result.code).toBe(0);
  const json = JSON.parse(result.stdout);
  expect(Object.keys(json.arguments).length).toBeGreaterThan(0);
});

test("exits 1 on missing file", () => {
  const result = runValidator(path.join(REPO_ROOT, "does-not-exist.argdown"));
  expect(result.code).not.toBe(0);
});
