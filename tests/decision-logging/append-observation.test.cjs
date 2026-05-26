const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { validate, appendObservation } = require('../../skills/decision-logging/scripts/append-observation.cjs');
const { makeTempRepo, cleanupTempRepo } = require('./test-helpers.cjs');

const valid = {
  schema_version: '1.0',
  timestamp: '2026-05-25T14:30:45-07:00',
  session_id: 'abc-123',
  type: 'observation',
  confidence: 'medium',
  source: 'subagent',
  content: 'The cache key uses timestamp.',
  rationale: 'Saw cache.ts investigation pivot.',
  related_files: ['src/cache.ts'],
  related_decision: null,
  tags: ['systematic-debugging', 'caching'],
};

test('validate accepts a canonical observation', () => {
  const { valid: v, errors } = validate(valid);
  assert.strictEqual(v, true, JSON.stringify(errors));
});

test('validate rejects missing required fields', () => {
  const { valid: v, errors } = validate({ ...valid, content: undefined });
  assert.strictEqual(v, false);
  assert.ok(errors.some((e) => e.includes('content')));
});

test('validate rejects out-of-enum values', () => {
  const { valid: v1 } = validate({ ...valid, type: 'bogus' });
  assert.strictEqual(v1, false);
  const { valid: v2 } = validate({ ...valid, confidence: 'extreme' });
  assert.strictEqual(v2, false);
  const { valid: v3 } = validate({ ...valid, source: 'human' });
  assert.strictEqual(v3, false);
});

test('validate requires tags[0] to be in the source-skill enum', () => {
  const { valid: v1 } = validate({ ...valid, tags: ['not-a-skill'] });
  assert.strictEqual(v1, false);
  const { valid: v2 } = validate({ ...valid, tags: ['brainstorming', 'extra'] });
  assert.strictEqual(v2, true);
});

test('appendObservation appends a single line to observations.jsonl', () => {
  const repo = makeTempRepo();
  try {
    appendObservation(valid, { gitRoot: repo });
    appendObservation({ ...valid, content: 'second' }, { gitRoot: repo });
    const file = path.join(repo, 'docs', 'snowball', 'decisions', 'observations.jsonl');
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
    assert.strictEqual(lines.length, 2);
    assert.strictEqual(JSON.parse(lines[0]).content, 'The cache key uses timestamp.');
    assert.strictEqual(JSON.parse(lines[1]).content, 'second');
  } finally {
    cleanupTempRepo(repo);
  }
});

test('appendObservation throws on invalid input', () => {
  const repo = makeTempRepo();
  try {
    assert.throws(
      () => appendObservation({ ...valid, type: 'nope' }, { gitRoot: repo }),
      /validation/,
    );
  } finally {
    cleanupTempRepo(repo);
  }
});
