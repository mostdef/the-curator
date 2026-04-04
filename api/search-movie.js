require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG  = 'https://image.tmdb.org/t/p/';

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  let getAuthenticatedUser;
  try { getAuthenticatedUser = require('./_auth'); } catch {}
  if (getAuthenticatedUser) {
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
  }

  const headers = { Authorization: `Bearer ${process.env.TMDB_TOKEN}` };

  // ── Upcoming suggestions (for Anticipated empty state) ─────────────────
  if (req.query.type === 'upcoming') {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    try {
      const upRes = await fetch(
        `${TMDB_BASE}/movie/upcoming?language=en-US&page=${page}`,
        { headers }
      );
      const upcoming = await upRes.json();
      const today = new Date().toISOString().slice(0, 10);
      const results = (upcoming.results || [])
        .filter(m => m.release_date && m.release_date > today)
        .slice(0, 5)
        .map(m => ({
          title:        m.title,
          year:         m.release_date ? parseInt(m.release_date) : null,
          poster:       m.poster_path ? `${TMDB_IMG}w200${m.poster_path}` : null,
          tmdb_id:      m.id,
          release_date: m.release_date,
        }));
      return res.json({ results, page, total_pages: upcoming.total_pages || 1 });
    } catch (e) {
      console.error('upcoming error:', e);
      return res.status(500).json({ error: 'api_error' });
    }
  }

  // ── Movie search ────────────────────────────────────────────────────────
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.status(400).end();

  const searchRes = await fetch(
    `${TMDB_BASE}/search/movie?query=${encodeURIComponent(q)}&language=en-US&page=1`,
    { headers }
  );
  const search = await searchRes.json();
  const hits = (search.results || []).slice(0, 8);

  // Fetch OMDB ratings in parallel for top 5 (requires imdb_id from TMDB details)
  const withRatings = await Promise.all(
    hits.map(async (m, i) => {
      const base = {
        title:        m.title,
        year:         m.release_date ? parseInt(m.release_date) : null,
        release_date: m.release_date || null,
        poster:       m.poster_path ? `${TMDB_IMG}w200${m.poster_path}` : null,
        tmdb_id:      m.id,
        tmdb_rating:  m.vote_count > 10 ? parseFloat(m.vote_average.toFixed(1)) : null,
        imdb_rating:  null,
        rt_score:     null,
      };

      // Only fetch OMDB for first 5 to keep latency low
      if (i >= 5 || !process.env.OMDB_KEY) return base;

      try {
        const detRes = await fetch(`${TMDB_BASE}/movie/${m.id}?language=en-US`, { headers });
        const det    = await detRes.json();
        const imdbId = det.imdb_id;
        if (!imdbId) return base;

        const omdbRes = await fetch(`https://www.omdbapi.com/?i=${imdbId}&apikey=${process.env.OMDB_KEY}`);
        const omdb    = await omdbRes.json();
        if (omdb.Response === 'True') {
          const rt = omdb.Ratings?.find(r => r.Source === 'Rotten Tomatoes');
          base.imdb_rating = omdb.imdbRating !== 'N/A' ? omdb.imdbRating : null;
          base.rt_score    = rt ? rt.Value : null;
        }
      } catch {}

      return base;
    })
  );

  res.json(withRatings);
};
