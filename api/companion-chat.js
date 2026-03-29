require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const Anthropic = require('@anthropic-ai/sdk');

function loadTasteProfile() {
  try {
    const p = require('path').join(__dirname, '..', 'taste-profile.json');
    return JSON.parse(require('fs').readFileSync(p, 'utf8')).prompt_section || null;
  } catch { return null; }
}

const PRICE = {
  'claude-sonnet-4-6': { input: 3.00, output: 15.00 },
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00 },
};

const MAX_HISTORY = 12; // max turns (pairs) to keep

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  let getAuthenticatedUser;
  try { getAuthenticatedUser = require('./_auth'); } catch {}
  if (getAuthenticatedUser) {
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
  }

  const {
    title, year, director, runtime,
    elapsed_pct = 0,
    message: userMessage,
    chat_history = [],
    spoilers_ok = false,
    model = 'sonnet',
  } = req.body;

  if (!title || !userMessage) return res.status(400).json({ error: 'title and message required' });

  const modelId = model === 'haiku'
    ? 'claude-haiku-4-5-20251001'
    : 'claude-sonnet-4-6';

  const tasteProfile = loadTasteProfile();

  const spoilerInstruction = spoilers_ok
    ? 'Spoilers OK — you may discuss the full film including ending and twists.'
    : `Spoilers are OFF. The viewer is ~${Math.round(elapsed_pct)}% through the film. Do not reveal anything that happens after this point.`;

  const systemPrompt = [
    `You are a knowledgeable film companion for "${title}"${year ? ` (${year})` : ''}${director ? `, directed by ${director}` : ''}.`,
    runtime ? `Runtime: ${runtime} minutes. The viewer is currently at approximately ${Math.round(elapsed_pct)}% through the film.` : '',
    `\nYour role: be curious, direct, never condescending. Match the register of a thoughtful cinephile in conversation. Keep responses concise — 2–4 sentences unless the question warrants more depth.`,
    `\n${spoilerInstruction}`,
    tasteProfile ? `\n## VIEWER TASTE PROFILE\n${tasteProfile}` : '',
  ].filter(Boolean).join('\n');

  // Trim history to last MAX_HISTORY turns
  const trimmedHistory = chat_history.slice(-MAX_HISTORY * 2);

  const messages = [
    ...trimmedHistory,
    { role: 'user', content: userMessage },
  ];

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let response;
  try {
    response = await client.messages.create({
      model: modelId,
      max_tokens: 512,
      temperature: 0.8,
      system: systemPrompt,
      messages,
    });
  } catch (e) {
    console.error('Anthropic error:', e?.status, JSON.stringify(e?.error));
    const msg = e?.error?.error?.message || '';
    const isOutOfCredits = e?.status === 400 && msg.includes('credit balance is too low');
    return res.status(isOutOfCredits ? 402 : 500).json({ error: isOutOfCredits ? 'out_of_credits' : 'api_error', detail: msg });
  }

  const reply = response.content.find(b => b.type === 'text')?.text || '';

  const pricing = PRICE[modelId] || PRICE['claude-sonnet-4-6'];
  const inputTokens  = response.usage?.input_tokens  || 0;
  const outputTokens = response.usage?.output_tokens || 0;
  const apiCost = (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;

  res.json({ reply, api_cost: apiCost, input_tokens: inputTokens, output_tokens: outputTokens });
};
