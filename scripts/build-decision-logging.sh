#!/usr/bin/env bash
# Build decision-logging TypeScript sources into bundled .cjs at the existing hook paths.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$SCRIPT_DIR/skills/decision-logging/src"
OUT_DIR="$SCRIPT_DIR/skills/decision-logging/scripts"

if ! command -v bun >/dev/null 2>&1; then
  echo "error: bun is required for building decision-logging" >&2
  echo "install: https://bun.sh" >&2
  exit 1
fi

ENTRIES=(
  write-madr
  append-observation
  ask-user-question-bridge
  user-prompt-bridge
)

for entry in "${ENTRIES[@]}"; do
  tmp="$(mktemp)"
  bun build "$SRC_DIR/$entry.ts" \
    --target=node \
    --format=cjs \
    --outfile="$tmp"
  dest="$OUT_DIR/$entry.cjs"
  if ! diff -q "$tmp" "$dest" >/dev/null 2>&1; then
    mv "$tmp" "$dest"
  else
    rm "$tmp"
  fi
done

echo "built ${#ENTRIES[@]} bundles into $OUT_DIR/"
