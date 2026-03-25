// api/_supabase.js — shared Supabase admin client
// Uses the service role key, which bypasses RLS — only use server-side.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = supabase;
