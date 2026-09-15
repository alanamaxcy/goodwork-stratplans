/* Deploy-time configuration.
   On Netlify, scripts/build-portal.mjs fills these from the site's environment
   (SUPABASE_URL, SUPABASE_ANON_KEY, PORTAL_SLUG) — both Supabase values are
   public by design and are meant to ship in the page.
   Left empty, the portal runs on whatever shared store the host offers, and
   falls back to this browser only. */
window.SPP_CONFIG = {
  supabaseUrl: '',
  supabaseAnonKey: '',
  portalSlug: 'resonate',
};
