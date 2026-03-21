require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const Anthropic = require('@anthropic-ai/sdk');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { standards = [] } = req.body;
  if (standards.length === 0) return res.status(400).json({ error: 'no_standards' });

  const filmList = standards.map(m => `"${m.title}" (${m.year}, ${m.director})`).join(', ');

  const prompt = `You are a film critic and cultural analyst. Analyze these reference films that define a movie lover's deepest taste: ${filmList}

Create 4 distinct cinema persona profiles for this curator. Each should illuminate a genuinely different dimension of their taste — for example: one through visual style, one through themes, one through emotional register, one through cultural geography. Make them feel like four real, different people who could all plausibly love these same films.

Be specific, evocative, and direct — avoid generic film-buff clichés.

For each persona return:
- type: A creative title (e.g. "The Auteur Devotee") — 2–5 words
- tagline: One punchy sentence capturing their film philosophy
- description: 2–3 sentences on what draws them to cinema and what they seek
- roomConcept: A vivid phrase describing their ideal watching room — specific objects, textures, lighting, era (e.g. "a dimly lit 1970s New York study with film reels, jazz records, rain on the window"). This will be rendered as a clay 3D miniature room.`;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1800,
      tools: [{
        name: 'cinema_personas',
        description: 'Define 4 distinct cinema personas for this film lover',
        input_schema: {
          type: 'object',
          properties: {
            personas: {
              type: 'array',
              minItems: 4,
              maxItems: 4,
              items: {
                type: 'object',
                properties: {
                  type:        { type: 'string', description: 'Persona title, 2–5 words' },
                  tagline:     { type: 'string', description: 'One punchy sentence' },
                  description: { type: 'string', description: '2–3 sentences about their taste' },
                  roomConcept: { type: 'string', description: 'Vivid atmospheric room description' },
                },
                required: ['type', 'tagline', 'description', 'roomConcept'],
              },
            },
          },
          required: ['personas'],
        },
      }],
      tool_choice: { type: 'tool', name: 'cinema_personas' },
      messages: [{ role: 'user', content: prompt }],
    });

    const { personas } = message.content[0].input;

    const withPrompts = personas.map(p => ({
      ...p,
      imagePrompt: `isometric clay 3D miniature room, ${p.roomConcept}, soft warm studio lighting, cute clay render style, smooth matte clay material, Pixar-like aesthetic, tiny detailed props, no people, no text, cinematic mood, ultra detailed`,
    }));

    res.json({ personas: withPrompts });
  } catch (e) {
    const isOutOfCredits = e?.status === 400 && e?.error?.error?.message?.includes('credit balance is too low');
    return res.status(402).json({ error: isOutOfCredits ? 'out_of_credits' : 'api_error' });
  }
};
