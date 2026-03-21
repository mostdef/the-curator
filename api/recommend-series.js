require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const Anthropic = require('@anthropic-ai/sdk');

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG  = 'https://image.tmdb.org/t/p/';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { series = [], excluded = [], standards = [] } = req.body;

  const seriesList = series.length
    ? series.map(m => `"${m.title}" (${m.year}, ${m.creator})`).join(', ')
    : 'empty — recommend a widely acclaimed TV series';

  const standardsList = standards.length
    ? standards.map(m => `"${m.title}" (${m.year}, ${m.creator})`).join(', ')
    : null;

  const prompt = [
    `You are a TV series recommendation engine. Analyze this curated series collection and recommend exactly one TV series the curator is missing.`,
    standardsList
      ? `REFERENCE SERIES — these are the curator's all-time favourites and define their taste most precisely. Weight these heavily above all else: ${standardsList}`
      : '',
    `Full collection: ${seriesList}`,
    excluded.length ? `Do not suggest any of these (already in list, rejected, or already shown): ${excluded.join(', ')}` : '',
    `Choose a series that fits the collection's taste, creators, themes, or era. Write a reason (1–2 sentences) that directly references specific series or creators already in the collection.`,
  ].filter(Boolean).join('\n');

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let message;
  try {
    message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      tools: [{
        name: 'recommend_series',
        description: 'Recommend a single TV series that fits the collection',
        input_schema: {
          type: 'object',
          properties: {
            title:   { type: 'string',  description: 'Series title' },
            year:    { type: 'integer', description: 'Premiere year' },
            creator: { type: 'string',  description: 'Creator/showrunner full name' },
            reason:  { type: 'string',  description: 'Why this fits the collection (1–2 sentences, references specific series already in the list)' },
          },
          required: ['title', 'year', 'creator', 'reason'],
        },
      }],
      tool_choice: { type: 'tool', name: 'recommend_series' },
      messages: [{ role: 'user', content: prompt }],
    });
  } catch (e) {
    const isOutOfCredits = e?.status === 400 && e?.error?.error?.message?.includes('credit balance is too low');
    return res.status(402).json({ error: isOutOfCredits ? 'out_of_credits' : 'api_error' });
  }

  const rec = message.content[0].input;

  const tmdbHeaders = { Authorization: `Bearer ${process.env.TMDB_TOKEN}` };

  const searchRes = await fetch(
    `${TMDB_BASE}/search/tv?query=${encodeURIComponent(rec.title)}&first_air_date_year=${rec.year}&language=en-US`,
    { headers: tmdbHeaders }
  );
  const search = await searchRes.json();
  const tmdbShow = search.results?.[0];
  const tmdbId = tmdbShow?.id;

  const [detailsRes, imagesRes] = await Promise.all([
    tmdbId ? fetch(`${TMDB_BASE}/tv/${tmdbId}`, { headers: tmdbHeaders }) : null,
    tmdbId ? fetch(`${TMDB_BASE}/tv/${tmdbId}/images?include_image_language=null`, { headers: tmdbHeaders }) : null,
  ]);
  const details = detailsRes ? await detailsRes.json() : {};
  const images  = imagesRes  ? await imagesRes.json()  : {};

  const imdbId = details.external_ids?.imdb_id || null;

  // Fetch OMDB for IMDB + RT ratings
  let imdbRating = null, rtScore = null;
  if (process.env.OMDB_KEY) {
    const omdbQuery = imdbId
      ? `https://www.omdbapi.com/?i=${imdbId}&apikey=${process.env.OMDB_KEY}`
      : `https://www.omdbapi.com/?t=${encodeURIComponent(rec.title)}&y=${rec.year}&type=series&apikey=${process.env.OMDB_KEY}`;
    const omdbRes = await fetch(omdbQuery);
    const omdb = await omdbRes.json();
    if (omdb.Response === 'True') {
      imdbRating = omdb.imdbRating !== 'N/A' ? omdb.imdbRating : null;
      const rt = omdb.Ratings?.find(r => r.Source === 'Rotten Tomatoes');
      rtScore = rt ? rt.Value : null;
    }
  }

  const poster = tmdbShow?.poster_path
    ? `${TMDB_IMG}w500${tmdbShow.poster_path}`
    : null;

  const stills = (images.backdrops || [])
    .filter(b => b.iso_639_1 === null)
    .sort((a, b) => b.vote_average - a.vote_average)
    .slice(0, 5)
    .map(b => b.file_path);

  // Fetch external IDs separately if not in details
  let finalImdbId = imdbId;
  if (!finalImdbId && tmdbId) {
    const extRes = await fetch(`${TMDB_BASE}/tv/${tmdbId}/external_ids`, { headers: tmdbHeaders });
    const ext = await extRes.json();
    finalImdbId = ext.imdb_id || null;
  }

  res.json({ ...rec, poster, stills, imdb_id: finalImdbId, imdb_rating: imdbRating, rt_score: rtScore });
};
