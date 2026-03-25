require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const Anthropic = require('@anthropic-ai/sdk');

const tasteProfile = (() => {
  try {
    const p = require('path').join(__dirname, '..', 'taste-profile.json');
    return JSON.parse(require('fs').readFileSync(p, 'utf8')).prompt_section || null;
  } catch { return null; }
})();

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG  = 'https://image.tmdb.org/t/p/';

const tool = {
  name: 'recommend_movies',
  description: 'Recommend exactly 5 distinct films that fit the collection. Return them ranked best-to-worst fit.',
  input_schema: {
    type: 'object',
    properties: {
      candidates: {
        type: 'array',
        minItems: 5,
        maxItems: 5,
        items: {
          type: 'object',
          properties: {
            title:    { type: 'string',  description: 'Film title' },
            year:     { type: 'integer', description: 'Release year' },
            director: { type: 'string',  description: 'Director full name' },
            reason:   { type: 'string',  description: 'Why this fits the collection (1–2 sentences, references specific films already in the list)' },
          },
          required: ['title', 'year', 'director', 'reason'],
        },
      },
    },
    required: ['candidates'],
  },
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  let getAuthenticatedUser;
  try { getAuthenticatedUser = require('./_auth'); } catch {}
  if (getAuthenticatedUser) {
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
  }

  const { movies = [], excluded = [], standards = [], banned = [], model = 'sonnet' } = req.body;
  const modelId = model === 'opus' ? 'claude-opus-4-6' : 'claude-sonnet-4-6';

  const movieList = movies.length
    ? movies.map((m, i) => `${i + 1}. "${m.title}" (${m.year}, dir. ${m.director})`).join('\n')
    : 'empty — recommend a widely acclaimed film';

  const standardsList = standards.length
    ? standards.map(m => `"${m.title}" (${m.year}, ${m.director})`).join(', ')
    : null;

  const excludedSet = new Set(excluded.map(t => normalize(t)));

  // Count director appearances to detect over-represented ones
  const directorCounts = {};
  movies.forEach(m => {
    if (m.director) m.director.split(/[,;]/).map(d => d.trim()).forEach(d => {
      directorCounts[d] = (directorCounts[d] || 0) + 1;
    });
  });
  const saturatedDirectors = Object.entries(directorCounts)
    .filter(([, count]) => count >= 3)
    .map(([d]) => d);

  const buildPrompt = (extraInstruction = '') => [
    `You are a film recommendation engine. Analyze this curated movie collection and recommend exactly 5 distinct films the curator is missing. Only recommend feature films — never TV series, miniseries, or documentaries.`,
    standardsList
      ? `\n## REFERENCE FILMS\nThese are the curator's all-time favourites and define their taste most precisely. Weight these heavily above all else:\n${standardsList}`
      : '',
    tasteProfile
      ? `\n## TASTE PROFILE\n${tasteProfile}`
      : '',
    `\n## COLLECTION\nListed in curator's personal order — films appearing earlier carry more weight and reflect current taste more strongly:\n${movieList}`,
    excluded.length
      ? `\n## EXCLUSION LIST\nDo NOT recommend any of these — the curator already knows them:\n${excluded.map(t => `• ${t}`).join('\n')}`
      : '',
    saturatedDirectors.length
      ? `\n## SATURATED DIRECTORS\nAlready heavily represented (3+ films each) — avoid recommending another film by them unless truly exceptional:\n${saturatedDirectors.join(', ')}`
      : '',
    banned.length
      ? `\n## REJECTED FILMS\nThe curator has explicitly rejected these. Do not recommend them, and avoid recommending films with a very similar style, tone, or subject matter:\n${banned.map(m => `• "${m.title}" (${m.year}, ${m.director})`).join('\n')}`
      : '',
    `\n## GUIDELINES\nThink laterally — look beyond the obvious. Consider: cinematographers, composers, screenwriters, or producers who worked on films in the collection; international cinema with similar themes; films from the same era with comparable sensibilities. Write a reason (1–2 sentences) that directly references specific films or directors already in the collection.`,
    extraInstruction ? `\n## ADDITIONAL INSTRUCTION\n${extraInstruction}` : '',
  ].filter(Boolean).join('\n');

  const PRICE = {
    'claude-sonnet-4-6': { input: 3.00, output: 15.00 },   // $ per 1M tokens
    'claude-opus-4-6':   { input: 15.00, output: 75.00 },
  };

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let rec = null;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  // Two rounds maximum; escalate temperature on second round
  for (let round = 0; round < 2 && !rec; round++) {
    const temperature = round === 0 ? 0.8 : 0.95;
    const extraInstruction = round === 1
      ? 'Your previous 5 candidates were all on the exclusion list. Think more creatively — explore completely different genres, eras, or filmmaking traditions.'
      : '';

    let message;
    try {
      message = await client.messages.create({
        model: modelId,
        max_tokens: 1024,
        temperature,
        tools: [tool],
        tool_choice: { type: 'tool', name: 'recommend_movies' },
        messages: [{ role: 'user', content: buildPrompt(extraInstruction) }],
      });
    } catch (e) {
      console.error('Anthropic error:', e?.status, JSON.stringify(e?.error));
      const msg = e?.error?.error?.message || '';
      const isOutOfCredits = e?.status === 400 && msg.includes('credit balance is too low');
      return res.status(isOutOfCredits ? 402 : 500).json({ error: isOutOfCredits ? 'out_of_credits' : 'api_error', detail: msg });
    }

    totalInputTokens  += message.usage?.input_tokens  || 0;
    totalOutputTokens += message.usage?.output_tokens || 0;

    const toolBlock = message.content.find(b => b.type === 'tool_use');
    const candidates = toolBlock?.input?.candidates || [];

    console.log(`Round ${round} candidates:`, candidates.map(c => `"${c.title}" (${c.year})`).join(', '));

    for (const candidate of candidates) {
      const isExcluded = excludedSet.has(normalize(candidate.title));
      const isPlaceholder = !candidate.reason || candidate.reason.toLowerCase().startsWith('placeholder');

      console.log(`  "${candidate.title}" excluded=${isExcluded} placeholder=${isPlaceholder}`);

      if (!isExcluded && !isPlaceholder) {
        rec = candidate;
        break;
      }
    }
  }

  const pricing = PRICE[modelId] || PRICE['claude-sonnet-4-6'];
  const apiCost = (totalInputTokens * pricing.input + totalOutputTokens * pricing.output) / 1_000_000;

  if (!rec) return res.status(422).json({ error: 'invalid_rec' });

  const tmdbHeaders = { Authorization: `Bearer ${process.env.TMDB_TOKEN}` };

  let searchRes = await fetch(
    `${TMDB_BASE}/search/movie?query=${encodeURIComponent(rec.title)}&year=${rec.year}&language=en-US`,
    { headers: tmdbHeaders }
  );
  let search = await searchRes.json();
  if (!search.results?.length) {
    searchRes = await fetch(
      `${TMDB_BASE}/search/movie?query=${encodeURIComponent(rec.title)}&language=en-US`,
      { headers: tmdbHeaders }
    );
    search = await searchRes.json();
  }
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

  const poster = tmdbMovie?.poster_path ? `${TMDB_IMG}w500${tmdbMovie.poster_path}` : null;

  const stills = (images.backdrops || [])
    .filter(b => b.iso_639_1 === null)
    .sort((a, b) => b.vote_average - a.vote_average)
    .slice(0, 5)
    .map(b => b.file_path);

  res.json({ ...rec, poster, stills, imdb_id: imdbId, imdb_rating: imdbRating, rt_score: rtScore, writers, api_cost: apiCost, input_tokens: totalInputTokens, output_tokens: totalOutputTokens });
};

function normalize(title) {
  if (!title) return '';
  return title
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9\s]/g, '')                       // strip punctuation
    .replace(/^\s*the\s+/, '')                          // strip leading "the"
    .trim();
}
