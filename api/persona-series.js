require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const Anthropic = require('@anthropic-ai/sdk');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { standards = [] } = req.body;
  if (standards.length === 0) return res.status(400).json({ error: 'no_standards' });

  const seriesList = standards.map(m => `"${m.title}" (${m.year}, ${m.creator})`).join(', ');

  const prompt = `You are a TV critic and cultural analyst. Analyze these reference series that define a viewer's deepest taste: ${seriesList}

Create a vivid TV persona profile. Be specific, evocative, and direct — avoid generic TV-buff clichés.

Return:
- type: A creative title for this viewer (e.g. "The Prestige Drama Devotee", "The Slow-Burn Auteur Fan", "The Anti-Hero Chronicler") — 2–5 words, sharp and memorable
- tagline: One punchy sentence that captures their TV philosophy
- description: 2–3 sentences describing what draws them to television, what they seek, what they feel
- roomConcept: A short vivid phrase describing the physical atmosphere of their ideal watching room — specific objects, textures, lighting, era, mood that would be present given these series (e.g. "a dimly lit loft with a large screen, scattered scripts and pilot notes, late-night city glow through the window")

The roomConcept will be used to generate a clay 3D miniature room render. Make it atmospheric and highly visual.`;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      tools: [{
        name: 'tv_persona',
        description: 'Define a TV persona for this series lover',
        input_schema: {
          type: 'object',
          properties: {
            type:        { type: 'string', description: 'Persona title, 2–5 words' },
            tagline:     { type: 'string', description: 'One punchy sentence' },
            description: { type: 'string', description: '2–3 sentences about their taste' },
            roomConcept: { type: 'string', description: 'Vivid atmospheric description of ideal watching room' },
          },
          required: ['type', 'tagline', 'description', 'roomConcept'],
        },
      }],
      tool_choice: { type: 'tool', name: 'tv_persona' },
      messages: [{ role: 'user', content: prompt }],
    });

    const persona = message.content[0].input;

    const imagePrompt = `isometric clay 3D miniature room, ${persona.roomConcept}, soft warm studio lighting, cute clay render style, smooth matte clay material, Pixar-like aesthetic, tiny detailed props, no people, no text, cinematic mood, pastel accents, ultra detailed`;

    res.json({ ...persona, imagePrompt });
  } catch (e) {
    const isOutOfCredits = e?.status === 400 && e?.error?.error?.message?.includes('credit balance is too low');
    return res.status(402).json({ error: isOutOfCredits ? 'out_of_credits' : 'api_error' });
  }
};
