// pricing.js — approximate, illustrative only. List pricing verified 2026-07-16.
// $ per 1,000,000 tokens. First matching pattern wins, most specific first.
const PRICING_TABLE = [
  { match: /opus/i, input: 5.00, output: 25.00 },
  { match: /sonnet/i, input: 3.00, output: 15.00 },
  { match: /haiku/i, input: 1.00, output: 5.00 },
];
const FALLBACK_RATE = PRICING_TABLE[1]; // unknown/future model names default to Sonnet-tier rates

// Cache pricing is derived from each model's input rate using Anthropic's documented
// multipliers for the default 5-minute ephemeral cache: ~1.25x for a cache write, ~0.1x for a cache read.
const CACHE_WRITE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.1;

function rateFor(modelId) {
  const hit = PRICING_TABLE.find((p) => p.match.test(modelId || ''));
  return { rate: hit || FALLBACK_RATE, estimated: !hit };
}

function estimateCost(usage, modelId) {
  const { rate } = rateFor(modelId);
  const inputTokens = usage.inputTokens || 0;
  const outputTokens = usage.outputTokens || 0;
  const cacheReadTokens = usage.cacheReadTokens || 0;
  const cacheCreationTokens = usage.cacheCreationTokens || 0;

  const cost =
    inputTokens * rate.input +
    outputTokens * rate.output +
    cacheReadTokens * rate.input * CACHE_READ_MULTIPLIER +
    cacheCreationTokens * rate.input * CACHE_WRITE_MULTIPLIER;

  return cost / 1_000_000;
}

module.exports = { rateFor, estimateCost, PRICING_TABLE };
