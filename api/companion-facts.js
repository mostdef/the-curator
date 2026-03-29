require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const Anthropic = require('@anthropic-ai/sdk');

function loadTasteProfile() {
  try {
    const p = require('path').join(__dirname, '..', 'taste-profile.json');
    return JSON.parse(require('fs').readFileSync(p, 'utf8')).prompt_section || null;
  } catch { return null; }
}

const tool = {
  name: 'companion_facts',
  description: 'Generate exactly 5 timed cinematic facts for the film.',
  input_schema: {
    type: 'object',
    properties: {
      facts: {
        type: 'array',
        minItems: 5,
        maxItems: 5,
        items: {
          type: 'object',
          properties: {
            pct:  { type: 'integer', description: 'Viewing position (0–100) when this fact becomes relevant' },
            text: { type: 'string',  description: 'The fact — under 60 words, production insight or formal choice' },
          },
          required: ['pct', 'text'],
        },
      },
    },
    required: ['facts'],
  },
};

const PRICE = {
  'claude-sonnet-4-6': { input: 3.00, output: 15.00 },
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00 },
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  let getAuthenticatedUser;
  try { getAuthenticatedUser = require('./_auth'); } catch {}
  if (getAuthenticatedUser) {
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
  }

  const { title, year, director, runtime, spoilers_ok = false, model = 'sonnet' } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });

  const modelId = model === 'haiku'
    ? 'claude-haiku-4-5-20251001'
    : 'claude-sonnet-4-6';

  const tasteProfile = loadTasteProfile();

  const spoilerNote = spoilers_ok
    ? ''
    : '\n\nIMPORTANT: The viewer has spoilers off. Do not reveal plot twists, endings, or anything that happens after the 50% mark of the film.';

  const prompt = [
    `You are a film scholar companion. Generate 5 timed cinematic facts for "${title}" (${year || ''}${director ? `, dir. ${director}` : ''}).`,
    `Runtime: ${runtime || 'unknown'} minutes.`,
    `\nEach fact should be a genuine production insight, formal choice, behind-the-scenes detail, or thematic observation — not a plot summary. Keep each under 60 words.`,
    `\nSpread the facts across the viewing experience: roughly at 10%, 25%, 45%, 65%, and 85% in. Space them so no two facts land within 15 minutes of each other. Assign pct values accordingly.`,
    tasteProfile ? `\n## TASTE CONTEXT\nThe viewer's taste profile (use to make facts resonate with their sensibility):\n${tasteProfile}` : '',
    spoilerNote,
  ].filter(Boolean).join('\n');

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let message;
  try {
    message = await client.messages.create({
      model: modelId,
      max_tokens: 1024,
      temperature: 0.7,
      tools: [tool],
      tool_choice: { type: 'tool', name: 'companion_facts' },
      messages: [{ role: 'user', content: prompt }],
    });
  } catch (e) {
    console.error('Anthropic error:', e?.status, JSON.stringify(e?.error));
    const msg = e?.error?.error?.message || '';
    const isOutOfCredits = e?.status === 400 && msg.includes('credit balance is too low');
    return res.status(isOutOfCredits ? 402 : 500).json({ error: isOutOfCredits ? 'out_of_credits' : 'api_error', detail: msg });
  }

  const toolBlock = message.content.find(b => b.type === 'tool_use');
  const facts = toolBlock?.input?.facts || [];

  const pricing = PRICE[modelId] || PRICE['claude-sonnet-4-6'];
  const inputTokens  = message.usage?.input_tokens  || 0;
  const outputTokens = message.usage?.output_tokens || 0;
  const apiCost = (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;

  res.json({ facts, api_cost: apiCost, input_tokens: inputTokens, output_tokens: outputTokens });
};
