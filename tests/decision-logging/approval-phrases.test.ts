import { test, expect } from "bun:test";
import {
  APPROVAL_PHRASES,
  matchesApproval,
} from "../../skills/decision-logging/src/approval-phrases";

test("APPROVAL_PHRASES contains the locked Phase-1 list", () => {
  expect([...APPROVAL_PHRASES]).toEqual([
    "lgtm",
    "looks good",
    "ship it",
    "approved",
    "approve",
    "go ahead",
    "let's do that",
    "yes do that",
    "merge it",
    "do it",
  ]);
});

test("matchesApproval handles exact match case-insensitively", () => {
  expect(matchesApproval("lgtm")).toBe(true);
  expect(matchesApproval("LGTM")).toBe(true);
  expect(matchesApproval("Ship It")).toBe(true);
});

test("matchesApproval handles phrase followed by punctuation or whitespace", () => {
  expect(matchesApproval("lgtm!")).toBe(true);
  expect(matchesApproval("lgtm, ship it")).toBe(true);
  expect(matchesApproval("looks good to me")).toBe(true);
  expect(matchesApproval("approved.")).toBe(true);
});

test("matchesApproval rejects non-approval prompts", () => {
  expect(matchesApproval("thanks")).toBe(false);
  expect(matchesApproval("what about edge case X")).toBe(false);
  expect(matchesApproval("")).toBe(false);
  expect(matchesApproval("   ")).toBe(false);
});

test("matchesApproval rejects bare affirmations (excluded by policy)", () => {
  expect(matchesApproval("yes")).toBe(false);
  expect(matchesApproval("yeah")).toBe(false);
  expect(matchesApproval("ok")).toBe(false);
  expect(matchesApproval("sure")).toBe(false);
  expect(matchesApproval("i agree")).toBe(false);
});

test("matchesApproval rejects substring-only matches inside longer prose", () => {
  expect(matchesApproval("i would not say lgtm here")).toBe(false);
});
