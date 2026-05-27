export const APPROVAL_PHRASES = [
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
] as const;

export function matchesApproval(prompt: unknown): boolean {
  if (typeof prompt !== "string") return false;
  const trimmed = prompt.trim().toLowerCase();
  if (!trimmed) return false;

  for (const phrase of APPROVAL_PHRASES) {
    if (trimmed === phrase) return true;
    if (trimmed.startsWith(phrase)) {
      const next = trimmed[phrase.length];
      if (/[\s.,;:!?]/.test(next)) return true;
    }
  }
  return false;
}
