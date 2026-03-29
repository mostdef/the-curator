// auth.js — client-side auth module for The Collection
// Bootstraps Supabase client from /api/config, then exposes auth helpers.

let supabaseClient = null;

// initAuth() — call once on page load, before any auth methods are used.
// Returns the Supabase client.
async function initAuth() {
  if (supabaseClient) return supabaseClient;

  const cfg = await fetch('/api/config').then(r => r.json());
  supabaseClient = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);

  supabaseClient.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      window.location.href = '/login.html';
    }
  });

  return supabaseClient;
}

async function getSession() {
  await initAuth();
  const { data } = await supabaseClient.auth.getSession();
  return data.session || null;
}

async function getUser() {
  const session = await getSession();
  return session ? session.user : null;
}

async function getAuthToken() {
  const session = await getSession();
  return session ? session.access_token : null;
}

async function signInWithMagicLink(email) {
  await initAuth();
  const { error } = await supabaseClient.auth.signInWithOtp({ email });
  if (error) throw error;
}

async function signOut() {
  await initAuth();
  await supabaseClient.auth.signOut();
  window.location.href = '/login.html';
}

async function requireAuth() {
  const session = await getSession();
  if (!session) {
    window.location.href = '/login.html';
    return false;
  }
  return true;
}

window.initAuth         = initAuth;
window.getSession       = getSession;
window.getUser          = getUser;
window.getAuthToken     = getAuthToken;
window.signInWithMagicLink = signInWithMagicLink;
window.signOut          = signOut;
window.requireAuth      = requireAuth;
