module.exports = function handler(req, res) {
  res.json({ ok: true, env: { 
    hasUrl: !!process.env.SUPABASE_URL,
    hasKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY 
  }});
};
