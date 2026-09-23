import { createClient } from '@supabase/supabase-js';

/* Both values are public by design — the browser needs them to sign in — and
   are compiled into the bundle by Vite. The service-role key is never here. */
const url = import.meta.env.VITE_SUPABASE_URL || '';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isConfigured = Boolean(url && anonKey);

export const supabase = isConfigured
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  : null;

/* Sign-in is email plus a ONE-TIME CODE, never a magic link.
   docs/AUTH-SETUP-SUPABASE.md in the Impact Suite has the full reasoning: a
   one-time URL in an email looks like phishing, gets quarantined, and the mail
   scanner that releases it opens the link to inspect it — which spends the
   token. A code cannot be spent by a scanner, does not care which browser types
   it, and needs no redirect allowlist. Use the code-only email template. */
export async function sendCode(email) {
  if (!supabase) throw new Error('No Supabase project is configured for this deploy.');
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false }, // accounts are provisioned, not self-served
  });
  if (error) throw error;
}

export async function verifyCode(email, token) {
  if (!supabase) throw new Error('No Supabase project is configured for this deploy.');
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
  return data.session;
}

export async function signOut() {
  if (supabase) await supabase.auth.signOut();
}

export async function currentSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session || null;
}

/* The portal slug is the first path segment: /resonate, /agape.
   It is an address, not a secret — RLS decides what the account can actually
   reach, so a wrong guess returns an empty portal rather than someone's data. */
export function slugFromLocation(loc = window.location) {
  const seg = loc.pathname.split('/').filter(Boolean)[0];
  return seg ? seg.toLowerCase() : '';
}

/* The SECTION is the second path segment, and the sub-tab the third:
   /paact/scope/team. Two reasons it lives in the URL rather than in state
   alone. A portal opened from a link used to land on whatever section the app
   happened to start on, which on a portal whose own content is section one
   meant opening the client's kickoff on somebody else's plan. And a section
   nobody can link to cannot be sent to a board ahead of a meeting, which is
   most of what this portal is for. */
export function routeFromLocation(loc = window.location) {
  const parts = loc.pathname.split('/').filter(Boolean);
  return { section: (parts[1] || '').toLowerCase(), sub: (parts[2] || '').toLowerCase() };
}
