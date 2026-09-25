const test = require('node:test');
const assert = require('node:assert');
const { rateFor, estimateCost } = require('../pricing');

test('rateFor matches model families case-insensitively', () => {
  assert.strictEqual(rateFor('claude-opus-4').rate.input, 5);
  assert.strictEqual(rateFor('Claude-SONNET-4').rate.input, 3);
  assert.strictEqual(rateFor('claude-haiku-4-5').rate.input, 1);
  assert.strictEqual(rateFor('claude-opus-4').estimated, false);
});

test('rateFor falls back to sonnet rates and flags unknown models as estimated', () => {
  const result = rateFor('some-future-model');
  assert.strictEqual(result.rate.input, 3);
  assert.strictEqual(result.estimated, true);
  assert.strictEqual(rateFor(undefined).estimated, true);
});

test('estimateCost prices input and output per million tokens', () => {
  const cost = estimateCost({ inputTokens: 1_000_000, outputTokens: 1_000_000 }, 'sonnet');
  assert.strictEqual(cost, 18);
});

test('estimateCost applies cache read and write multipliers', () => {
  const cost = estimateCost({ cacheReadTokens: 1_000_000, cacheCreationTokens: 1_000_000 }, 'sonnet');
  assert.ok(Math.abs(cost - (0.3 + 3.75)) < 1e-9);
});

test('estimateCost treats missing usage fields as zero', () => {
  assert.strictEqual(estimateCost({}, 'opus'), 0);
});
