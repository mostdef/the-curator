require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const Anthropic = require('@anthropic-ai/sdk');

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG  = 'https://image.tmdb.org/t/p/';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { movies = [], excluded = [] } = req.body;

  const movieList = movies.length
    ? movies.map(m => `"${m.title}" (${m.year}, ${m.director})`).join(', ')
    : 'empty — recommend a widely acclaimed film';

  const prompt = [
    `You are a film recommendation engine. Analyze this curated movie collection and recommend exactly one film the curator is missing.`,
    `Collection: ${movieList}`,
    excluded.length ? `Do not suggest any of these (already in list, rejected, or already shown): ${excluded.join(', ')}` : '',
    `Choose a film that fits the collection's taste, directors, themes, or era. Write a reason (1–2 sentences) that directly references specific films or directors already in the collection.`,
  ].filter(Boolean).join('\n');

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let message;
  try {
    message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    tools: [{
      name: 'recommend_movie',
      description: 'Recommend a single movie that fits the collection',
      input_schema: {
        type: 'object',
        properties: {
          title:    { type: 'string',  description: 'Film title' },
          year:     { type: 'integer', description: 'Release year' },
          director: { type: 'string',  description: 'Director full name' },
          reason:   { type: 'string',  description: 'Why this fits the collection (1–2 sentences, references specific films already in the list)' },
        },
        required: ['title', 'year', 'director', 'reason'],
      },
    }],
    tool_choice: { type: 'tool', name: 'recommend_movie' },
    messages: [{ role: 'user', content: prompt }],
  });
  } catch (e) {
    const isOutOfCredits = e?.status === 400 && e?.error?.error?.message?.includes('credit balance is too low');
    return res.status(402).json({ error: isOutOfCredits ? 'out_of_credits' : 'api_error' });
  }

  const rec = message.content[0].input;

  const tmdbHeaders = { Authorization: `Bearer ${process.env.TMDB_TOKEN}` };

  const searchRes = await fetch(
    `${TMDB_BASE}/search/movie?query=${encodeURIComponent(rec.title)}&year=${rec.year}&language=en-US`,
    { headers: tmdbHeaders }
  );
  const search = await searchRes.json();
  const tmdbMovie = search.results?.[0];
  const tmdbId = tmdbMovie?.id;

  const [detailsRes, imagesRes, creditsRes] = await Promise.all([
    tmdbId ? fetch(`${TMDB_BASE}/movie/${tmdbId}`, { headers: tmdbHeaders }) : null,
    tmdbId ? fetch(`${TMDB_BASE}/movie/${tmdbId}/images?include_image_language=null`, { headers: tmdbHeaders }) : null,
    tmdbId ? fetch(`${TMDB_BASE}/movie/${tmdbId}/credits`, { headers: tmdbHeaders }) : null,
  ]);
  const details = detailsRes ? await detailsRes.json() : {};
  const images  = imagesRes  ? await imagesRes.json()  : {};
  const credits = creditsRes ? await creditsRes.json() : {};

  const writers = (credits.crew || [])
    .filter(p => p.job === 'Screenplay' || p.job === 'Story' || p.job === 'Writer')
    .map(p => p.name)
    .slice(0, 2);

  const imdbId = details.imdb_id || null;

  // Fetch OMDB for IMDB + RT ratings
  let imdbRating = null, rtScore = null;
  if (imdbId && process.env.OMDB_KEY) {
    const omdbRes = await fetch(`https://www.omdbapi.com/?i=${imdbId}&apikey=${process.env.OMDB_KEY}`);
    const omdb = await omdbRes.json();
    if (omdb.Response === 'True') {
      imdbRating = omdb.imdbRating !== 'N/A' ? omdb.imdbRating : null;
      const rt = omdb.Ratings?.find(r => r.Source === 'Rotten Tomatoes');
      rtScore = rt ? rt.Value : null;
    }
  }

  const poster = tmdbMovie?.poster_path
    ? `${TMDB_IMG}w500${tmdbMovie.poster_path}`
    : null;

  const stills = (images.backdrops || [])
    .filter(b => b.iso_639_1 === null)
    .sort((a, b) => b.vote_average - a.vote_average)
    .slice(0, 5)
    .map(b => b.file_path);

  res.json({ ...rec, poster, stills, imdb_id: imdbId, imdb_rating: imdbRating, rt_score: rtScore, writers });
};
