const test = require('node:test');
const assert = require('node:assert');
const yaml = require('js-yaml');
const { assembleMadr, slugify } = require('../../skills/decision-logging/scripts/write-madr.cjs');

const sampleInput = {
  title: 'Choose two-tier storage for decision logs',
  status: 'accepted',
  date: '2026-05-25T14:30:00-07:00',
  deciders: ['kellen'],
  snowball: {
    schema_version: '1.0',
    source: 'operator',
    confidence: 'high',
    capture_mechanism: 'ask-user-question',
    session_id: 'abc-123',
    source_event_id: 'tooluse-42',
    supersedes: null,
    tags: ['brainstorming', 'architecture'],
  },
  body: {
    context: 'We need a place to store decisions.',
    considered_options: [
      { name: 'Two-tier', description: 'MADR + observations.jsonl' },
      { name: 'Uniform MADR', description: 'every event a file' },
    ],
    decision_outcome: 'Chose Two-tier. Format matches ceremony level.',
    consequences: ['Two formats to parse'],
    links: ['Spec: docs/snowball/specs/2026-05-25-decision-logging-design.md'],
  },
};

test('assembleMadr produces parseable frontmatter', () => {
  const md = assembleMadr(sampleInput);
  const fmMatch = md.match(/^---\n([\s\S]+?)\n---\n/);
  assert.ok(fmMatch, 'expected frontmatter delimiters');
  const fm = yaml.load(fmMatch[1]);
  assert.strictEqual(fm.title, sampleInput.title);
  assert.strictEqual(fm.snowball.schema_version, '1.0');
  assert.deepStrictEqual(fm.snowball.tags, ['brainstorming', 'architecture']);
});

test('assembleMadr renders body sections in canonical order', () => {
  const md = assembleMadr(sampleInput);
  const ctxIdx = md.indexOf('## Context and Problem Statement');
  const optIdx = md.indexOf('## Considered Options');
  const outIdx = md.indexOf('## Decision Outcome');
  const consIdx = md.indexOf('## Consequences');
  const linkIdx = md.indexOf('## Links');
  assert.ok(ctxIdx < optIdx && optIdx < outIdx && outIdx < consIdx && consIdx < linkIdx,
    'body sections must appear in MADR-canonical order');
});

test('assembleMadr omits empty optional sections', () => {
  const minimal = {
    ...sampleInput,
    body: { context: 'ctx', decision_outcome: 'chose X' },
  };
  const md = assembleMadr(minimal);
  assert.ok(md.includes('## Context and Problem Statement'));
  assert.ok(md.includes('## Decision Outcome'));
  assert.ok(!md.includes('## Considered Options'));
  assert.ok(!md.includes('## Consequences'));
  assert.ok(!md.includes('## Links'));
});

test('slugify lowercases and replaces non-alphanumerics with hyphens', () => {
  assert.strictEqual(slugify('Choose Two-tier Storage'), 'choose-two-tier-storage');
  assert.strictEqual(slugify("Don't! Refactor"), 'don-t-refactor');
});

test('slugify truncates to a reasonable max length', () => {
  const long = 'a'.repeat(200);
  const s = slugify(long);
  assert.ok(s.length <= 60, `slug too long: ${s.length} chars`);
});

test('slugify handles non-string input by returning a fallback', () => {
  assert.strictEqual(slugify(null), 'untitled');
  assert.strictEqual(slugify(''), 'untitled');
});

const fs = require('node:fs');
const path = require('node:path');
const { writeMadr } = require('../../skills/decision-logging/scripts/write-madr.cjs');
const { makeTempRepo, cleanupTempRepo, readDecisionsDir } = require('./test-helpers.cjs');

test('writeMadr writes to <repo>/docs/snowball/decisions/<timestamp>-<slug>.md', () => {
  const repo = makeTempRepo();
  try {
    const filePath = writeMadr(sampleInput, { gitRoot: repo });
    assert.ok(filePath.startsWith(path.join(repo, 'docs', 'snowball', 'decisions') + path.sep));
    assert.ok(fs.existsSync(filePath));
    const files = readDecisionsDir(repo);
    assert.strictEqual(files.length, 1);
    assert.match(files[0], /^2026-05-25T1430-choose-two-tier-storage-for-decision-logs\.md$/);
  } finally {
    cleanupTempRepo(repo);
  }
});

test('writeMadr creates the decisions directory if absent', () => {
  const repo = makeTempRepo();
  try {
    writeMadr(sampleInput, { gitRoot: repo });
    assert.ok(fs.existsSync(path.join(repo, 'docs', 'snowball', 'decisions')));
  } finally {
    cleanupTempRepo(repo);
  }
});

test('writeMadr appends a suffix when minute collision occurs', () => {
  const repo = makeTempRepo();
  try {
    writeMadr(sampleInput, { gitRoot: repo });
    const p2 = writeMadr({ ...sampleInput }, { gitRoot: repo });
    assert.ok(fs.existsSync(p2));
    const files = readDecisionsDir(repo);
    assert.strictEqual(files.length, 2);
  } finally {
    cleanupTempRepo(repo);
  }
});
