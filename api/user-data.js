const getAuthenticatedUser = require('./_auth');
const supabaseAdmin        = require('./_supabase');

const FIELDS = ['movies', 'watchlist', 'maybe', 'meh', 'banned', 'standards', 'total_cost'];

const DEFAULTS = {
  movies:     [],
  watchlist:  [],
  maybe:      [],
  meh:        [],
  banned:     [],
  standards:  [],
  total_cost: 0,
};

module.exports = async function handler(req, res) {
  // --- GET: return user's collection data ---
  if (req.method === 'GET') {
    let user;
    try {
      user = await getAuthenticatedUser(req);
    } catch (e) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { data, error } = await supabaseAdmin
      .from('user_data')
      .select('movies, watchlist, maybe, meh, banned, standards, total_cost')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      console.error('[user-data GET]', error);
      return res.status(500).json({ error: 'Server error' });
    }

    return res.json(data || DEFAULTS);
  }

  // --- PUT: save/update user's collection data ---
  if (req.method === 'PUT') {
    let user;
    try {
      user = await getAuthenticatedUser(req);
    } catch (e) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const body = req.body || {};

    // Build upsert row from allowed fields only
    const row = { user_id: user.id, updated_at: new Date().toISOString() };
    FIELDS.forEach(function (field) {
      if (field in body) row[field] = body[field];
    });

    const { error } = await supabaseAdmin
      .from('user_data')
      .upsert(row, { onConflict: 'user_id' });

    if (error) {
      console.error('[user-data PUT]', error);
      return res.status(500).json({ error: 'Server error' });
    }

    return res.json({ ok: true });
  }

  res.status(405).end();
};
