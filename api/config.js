// api/config.js — returns public Supabase credentials to the browser
// Only exposes the anon/publishable key — safe to be public

module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json({
    supabaseUrl:  process.env.SUPABASE_URL || '',
    supabaseKey:  process.env.SUPABASE_ANON_KEY || '',
  });
};
