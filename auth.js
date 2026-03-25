// auth.js — client-side auth module for The Collection
// Assumes supabase-js is loaded via a script tag before this file
// and window.__SUPABASE_URL__ / window.__SUPABASE_ANON_KEY__ are set

(function () {
  const supabaseClient = window.supabase.createClient(
    window.__SUPABASE_URL__,
    window.__SUPABASE_ANON_KEY__
  );

  // Redirect to login on sign-out
  supabaseClient.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      window.location.href = '/login.html';
    }
  });

  // Returns the current session or null
  async function getSession() {
    const { data } = await supabaseClient.auth.getSession();
    return data.session || null;
  }

  // Returns the current user object { id, email } or null
  async function getUser() {
    const session = await getSession();
    return session ? session.user : null;
  }

  // Returns the JWT access token string for API calls, or null
  async function getAuthToken() {
    const session = await getSession();
    return session ? session.access_token : null;
  }

  // Sends a magic link to the given email address
  async function signInWithMagicLink(email) {
    const { error } = await supabaseClient.auth.signInWithOtp({ email });
    if (error) throw error;
  }

  // Signs the user out and redirects to login.html
  async function signOut() {
    await supabaseClient.auth.signOut();
    window.location.href = '/login.html';
  }

  // Checks if the user is authenticated. Redirects to login.html if not.
  // Returns true if authenticated, false otherwise.
  async function requireAuth() {
    const session = await getSession();
    if (!session) {
      window.location.href = '/login.html';
      return false;
    }
    return true;
  }

  // Expose on window
  window.getSession = getSession;
  window.getUser = getUser;
  window.getAuthToken = getAuthToken;
  window.signInWithMagicLink = signInWithMagicLink;
  window.signOut = signOut;
  window.requireAuth = requireAuth;
})();
