require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });

const TMDB_BASE = 'https://api.themoviedb.org/3';
const BATCH = 20; // parallel requests per batch to respect rate limits

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { films = [] } = req.body;
  if (!films.length) return res.status(400).end();

  const headers = { Authorization: `Bearer ${process.env.TMDB_TOKEN}` };

  async function fetchFilmData(film) {
    try {
      const searchRes = await fetch(
        `${TMDB_BASE}/search/movie?query=${encodeURIComponent(film.title)}&year=${film.year}&language=en-US`,
        { headers }
      );
      const search = await searchRes.json();
      const tmdbId = search.results?.[0]?.id;
      if (!tmdbId) return null;
      const creditsRes = await fetch(`${TMDB_BASE}/movie/${tmdbId}/credits`, { headers });
      const credits = await creditsRes.json();
      return { film, credits };
    } catch { return null; }
  }

  // Batch requests to avoid rate limits
  const filmData = [];
  for (let i = 0; i < films.length; i += BATCH) {
    const batch = await Promise.all(films.slice(i, i + BATCH).map(fetchFilmData));
    filmData.push(...batch);
  }
  const valid = filmData.filter(Boolean);

  // ── Actors ───────────────────────────────────────────────────────────────────
  const actorCount = {};
  const actorNames = {};
  valid.forEach(({ credits }) => {
    (credits.cast || []).slice(0, 12).forEach(p => {
      actorCount[p.id] = (actorCount[p.id] || 0) + 1;
      actorNames[p.id] = p.name;
    });
  });
  const topActors = Object.entries(actorCount)
    .filter(([, c]) => c > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id, count]) => ({ name: actorNames[id], films: count }));

  // ── Cinematographers ──────────────────────────────────────────────────────────
  const dpCount = {};
  const dpNames = {};
  valid.forEach(({ credits }) => {
    const dp = (credits.crew || []).find(p => p.job === 'Director of Photography');
    if (dp) { dpCount[dp.id] = (dpCount[dp.id] || 0) + 1; dpNames[dp.id] = dp.name; }
  });
  const topDP = Object.entries(dpCount)
    .filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1])
    .map(([id, count]) => ({ name: dpNames[id], films: count }))[0] || null;

  // ── Composers ─────────────────────────────────────────────────────────────────
  const compCount = {};
  const compNames = {};
  valid.forEach(({ credits }) => {
    const c = (credits.crew || []).find(p => p.job === 'Original Music Composer');
    if (c) { compCount[c.id] = (compCount[c.id] || 0) + 1; compNames[c.id] = c.name; }
  });
  const topComposer = Object.entries(compCount)
    .filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1])
    .map(([id, count]) => ({ name: compNames[id], films: count }))[0] || null;

  // ── Director repeats ──────────────────────────────────────────────────────────
  const dirCount = {};
  films.forEach(f => { dirCount[f.director] = (dirCount[f.director] || 0) + 1; });
  const topDirector = Object.entries(dirCount)
    .filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, films: count }))[0] || null;

  // ── Year / decade ─────────────────────────────────────────────────────────────
  const years = films.map(f => parseInt(f.year)).filter(Boolean).sort((a, b) => a - b);
  const yearRange = years.length > 1 ? { from: years[0], to: years[years.length - 1] } : null;
  const span = yearRange ? yearRange.to - yearRange.from : 0;
  const decadeCount = {};
  years.forEach(y => { const d = Math.floor(y / 10) * 10; decadeCount[d] = (decadeCount[d] || 0) + 1; });
  const topDecade = Object.entries(decadeCount).sort((a, b) => b[1] - a[1])[0];

  res.json({
    topActors,
    topDP,
    topComposer,
    topDirector,
    yearRange,
    span,
    topDecade: topDecade ? parseInt(topDecade[0]) : null,
    totalFilms: films.length,
  });
};
