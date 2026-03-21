require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG  = 'https://image.tmdb.org/t/p/';

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { title, year } = req.query;
  if (!title) return res.status(400).end();

  const headers = { Authorization: `Bearer ${process.env.TMDB_TOKEN}` };

  // Search
  const searchRes = await fetch(
    `${TMDB_BASE}/search/movie?query=${encodeURIComponent(title)}&year=${year || ''}&language=en-US`,
    { headers }
  );
  const search = await searchRes.json();
  const tmdbId = search.results?.[0]?.id;
  if (!tmdbId) return res.status(404).json({ error: 'not_found' });

  // Fetch details + credits in parallel
  const [detailsRes, creditsRes] = await Promise.all([
    fetch(`${TMDB_BASE}/movie/${tmdbId}?language=en-US`, { headers }),
    fetch(`${TMDB_BASE}/movie/${tmdbId}/credits`, { headers }),
  ]);
  const details = await detailsRes.json();
  const credits = await creditsRes.json();

  // Top cast (up to 8)
  const cast = (credits.cast || []).slice(0, 8).map(p => ({
    name:       p.name,
    character:  p.character,
    photo:      p.profile_path ? `${TMDB_IMG}w185${p.profile_path}` : null,
  }));

  // Key crew
  const crew = credits.crew || [];
  const pick = (jobs) => crew.find(p => jobs.includes(p.job))?.name || null;
  const keyCrew = [
    { role: 'Cinematography', name: pick(['Director of Photography', 'Cinematography']) },
    { role: 'Original Music', name: pick(['Original Music Composer', 'Music', 'Composer']) },
    { role: 'Screenplay',     name: pick(['Screenplay', 'Story', 'Writer']) },
    { role: 'Editor',         name: pick(['Editor', 'Film Editor']) },
    { role: 'Producer',       name: pick(['Producer']) },
  ].filter(c => c.name);

  res.json({
    overview:    details.overview || null,
    tagline:     details.tagline  || null,
    runtime:     details.runtime  || null,
    genres:      (details.genres || []).map(g => g.name),
    poster:      search.results[0].poster_path ? `${TMDB_IMG}w500${search.results[0].poster_path}` : null,
    cast,
    keyCrew,
  });
};
