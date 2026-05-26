const test = require('node:test');
const assert = require('node:assert');
const { APPROVAL_PHRASES, matchesApproval } = require('../../skills/decision-logging/scripts/approval-phrases.cjs');

test('APPROVAL_PHRASES contains the locked Phase-1 list', () => {
  assert.deepStrictEqual(APPROVAL_PHRASES, [
    'lgtm', 'looks good', 'ship it', 'approved', 'approve',
    'go ahead', "let's do that", 'yes do that', 'merge it', 'do it',
  ]);
});

test('matchesApproval handles exact match case-insensitively', () => {
  assert.strictEqual(matchesApproval('lgtm'), true);
  assert.strictEqual(matchesApproval('LGTM'), true);
  assert.strictEqual(matchesApproval('Ship It'), true);
});

test('matchesApproval handles phrase followed by punctuation or whitespace', () => {
  assert.strictEqual(matchesApproval('lgtm!'), true);
  assert.strictEqual(matchesApproval('lgtm, ship it'), true);
  assert.strictEqual(matchesApproval('looks good to me'), true);
  assert.strictEqual(matchesApproval('approved.'), true);
});

test('matchesApproval rejects non-approval prompts', () => {
  assert.strictEqual(matchesApproval('thanks'), false);
  assert.strictEqual(matchesApproval('what about edge case X'), false);
  assert.strictEqual(matchesApproval(''), false);
  assert.strictEqual(matchesApproval('   '), false);
});

test('matchesApproval rejects bare affirmations (excluded by policy)', () => {
  assert.strictEqual(matchesApproval('yes'), false);
  assert.strictEqual(matchesApproval('yeah'), false);
  assert.strictEqual(matchesApproval('ok'), false);
  assert.strictEqual(matchesApproval('sure'), false);
  assert.strictEqual(matchesApproval('i agree'), false);
});

test('matchesApproval rejects substring-only matches inside longer prose', () => {
  assert.strictEqual(matchesApproval('i would not say lgtm here'), false);
});
