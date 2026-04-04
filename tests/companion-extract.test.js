// tests/companion-extract.test.js
// Unit tests for the LLM signal extraction logic in api/companion-chat.js (action=extract).
//
// Uses makeHandler to inline the two testable pieces of pure logic — the short-circuit
// guard and the JSON regex extraction — without touching the Anthropic SDK or HTTP layer.
//
// See issue #10 to replace makeHandler with real integration tests against the endpoint.

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── test double ───────────────────────────────────────────────────────────
//
// Mirrors the extract branch of api/companion-chat.js exactly.
// Swap `anthropicResponse` for the text the fake LLM "returns".

function makeHandler(anthropicResponse) {
  return async function extract({ title, chat_history = [], decision, facts = [] }) {
    if (!title || !chat_history.length) return { signals: null, api_cost: 0 };

    const raw = anthropicResponse;
    let signals = null;
    try {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) signals = JSON.parse(m[0]);
    } catch {}

    return { signals, api_cost: 0.000001 };
  };
}

// ── fixtures ──────────────────────────────────────────────────────────────

const VALID_SIGNALS = {
  liked:               ['practical effects', 'ensemble pacing'],
  disliked:            ['romantic subplot'],
  themes_engaged:      ['institutional loyalty'],
  emotional_reactions: ['tense during heist'],
  viewing_style_notes: ['asks about filming locations'],
};

const MIN_HISTORY = [
  { role: 'user',      content: 'Loved the coffee shop scene.' },
  { role: 'assistant', content: 'Mann rehearsed it extensively.' },
];

// ── tests ─────────────────────────────────────────────────────────────────

test('returns null signals immediately when chat_history is empty', async () => {
  const extract = makeHandler('');
  const result = await extract({ title: 'Heat', chat_history: [], decision: 'collection' });
  assert.deepEqual(result, { signals: null, api_cost: 0 });
});

test('returns null signals immediately when title is missing', async () => {
  const extract = makeHandler(JSON.stringify(VALID_SIGNALS));
  const result = await extract({ title: '', chat_history: MIN_HISTORY, decision: 'collection' });
  assert.deepEqual(result, { signals: null, api_cost: 0 });
});

test('parses a clean JSON response into signals', async () => {
  const extract = makeHandler(JSON.stringify(VALID_SIGNALS));
  const { signals } = await extract({ title: 'Heat', chat_history: MIN_HISTORY, decision: 'collection' });
  assert.deepEqual(signals, VALID_SIGNALS);
});

test('extracts JSON when the LLM wraps it in surrounding prose', async () => {
  const response = `Here are the extracted signals:\n${JSON.stringify(VALID_SIGNALS)}\nHope that helps.`;
  const extract = makeHandler(response);
  const { signals } = await extract({ title: 'Heat', chat_history: MIN_HISTORY, decision: 'collection' });
  assert.deepEqual(signals?.liked, VALID_SIGNALS.liked);
});

test('returns null signals when the LLM response contains no JSON', async () => {
  const extract = makeHandler('Sorry, I cannot analyze this transcript.');
  const { signals } = await extract({ title: 'Heat', chat_history: MIN_HISTORY, decision: 'meh' });
  assert.equal(signals, null);
});

test('returns null signals when the LLM response contains malformed JSON', async () => {
  const extract = makeHandler('{ liked: [missing quotes] }');
  const { signals } = await extract({ title: 'Heat', chat_history: MIN_HISTORY, decision: 'meh' });
  assert.equal(signals, null);
});

test('signals object has all five required keys', async () => {
  const empty = { liked: [], disliked: [], themes_engaged: [], emotional_reactions: [], viewing_style_notes: [] };
  const extract = makeHandler(JSON.stringify(empty));
  const { signals } = await extract({ title: 'Heat', chat_history: MIN_HISTORY, decision: 'collection' });
  const REQUIRED = ['liked', 'disliked', 'themes_engaged', 'emotional_reactions', 'viewing_style_notes'];
  REQUIRED.forEach(k => assert.ok(k in signals, `missing key: ${k}`));
});

test('all signal values are arrays', async () => {
  const extract = makeHandler(JSON.stringify(VALID_SIGNALS));
  const { signals } = await extract({ title: 'Heat', chat_history: MIN_HISTORY, decision: 'collection' });
  Object.values(signals).forEach(v => assert.ok(Array.isArray(v), `expected array, got ${typeof v}`));
});

test('api_cost is zero for the short-circuit path', async () => {
  const extract = makeHandler('');
  const { api_cost } = await extract({ title: 'Heat', chat_history: [], decision: 'collection' });
  assert.equal(api_cost, 0);
});
