require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const Anthropic = require('@anthropic-ai/sdk');

const OL_COVERS = 'https://covers.openlibrary.org/b';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { books = [], excluded = [], standards = [] } = req.body;

  const bookList = books.length
    ? books.map(m => `"${m.title}" (${m.year}, ${m.author})`).join(', ')
    : 'empty — recommend a widely acclaimed book';

  const standardsList = standards.length
    ? standards.map(m => `"${m.title}" (${m.year}, ${m.author})`).join(', ')
    : null;

  const prompt = [
    `You are a book recommendation engine. Analyze this curated reading collection and recommend exactly one book the reader is missing.`,
    standardsList
      ? `REFERENCE BOOKS — these are the reader's all-time favourites and define their taste most precisely. Weight these heavily above all else: ${standardsList}`
      : '',
    `Full collection: ${bookList}`,
    excluded.length ? `Do not suggest any of these (already in list, rejected, or already shown): ${excluded.join(', ')}` : '',
    `Choose a book that fits the collection's taste, authors, themes, or era. Write a reason (1–2 sentences) that directly references specific books or authors already in the collection.`,
  ].filter(Boolean).join('\n');

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let message;
  try {
    message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      tools: [{
        name: 'recommend_book',
        description: 'Recommend a single book that fits the collection',
        input_schema: {
          type: 'object',
          properties: {
            title:  { type: 'string',  description: 'Book title' },
            year:   { type: 'integer', description: 'Publication year' },
            author: { type: 'string',  description: 'Author full name' },
            reason: { type: 'string',  description: 'Why this fits the collection (1–2 sentences, references specific books already in the list)' },
            isbn:   { type: 'string',  description: 'ISBN-13 if known, otherwise empty string' },
          },
          required: ['title', 'year', 'author', 'reason'],
        },
      }],
      tool_choice: { type: 'tool', name: 'recommend_book' },
      messages: [{ role: 'user', content: prompt }],
    });
  } catch (e) {
    const isOutOfCredits = e?.status === 400 && e?.error?.error?.message?.includes('credit balance is too low');
    return res.status(402).json({ error: isOutOfCredits ? 'out_of_credits' : 'api_error' });
  }

  const rec = message.content[0].input;

  // Fetch cover from Open Library
  let cover = null;

  // Try ISBN first if provided
  if (rec.isbn) {
    const cleanIsbn = rec.isbn.replace(/[^0-9X]/g, '');
    if (cleanIsbn.length >= 10) {
      cover = `${OL_COVERS}/isbn/${cleanIsbn}-L.jpg`;
    }
  }

  // Fall back to Open Library search
  if (!cover) {
    try {
      const searchUrl = `https://openlibrary.org/search.json?title=${encodeURIComponent(rec.title)}&author=${encodeURIComponent(rec.author)}&limit=1&fields=cover_i,cover_edition_key,isbn`;
      const searchRes = await fetch(searchUrl);
      const search    = await searchRes.json();
      const doc       = search.docs?.[0];

      if (doc?.cover_i) {
        cover = `${OL_COVERS}/id/${doc.cover_i}-L.jpg`;
      } else if (doc?.cover_edition_key) {
        cover = `${OL_COVERS}/olid/${doc.cover_edition_key}-L.jpg`;
      } else if (doc?.isbn?.[0]) {
        cover = `${OL_COVERS}/isbn/${doc.isbn[0]}-L.jpg`;
      }
    } catch (e) {
      console.error('Open Library search failed:', e);
    }
  }

  res.json({ ...rec, cover });
};
