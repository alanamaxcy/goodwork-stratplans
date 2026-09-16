import React, { useState } from 'react';
import { sendCode, verifyCode, currentSession } from '../lib/supabase.js';

/* Email plus a one-time code. Never a magic link — see lib/supabase.js. */
export default function SignIn({ slug, onSignedIn }) {
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function send(e) {
    e.preventDefault();
    if (!/.+@.+\..+/.test(email)) return setErr('That does not look like an email address.');
    setBusy(true); setErr('');
    try { await sendCode(email.trim()); setStep('code'); }
    catch (x) { setErr(x.message || 'Could not send the code.'); }
    finally { setBusy(false); }
  }

  async function verify(e) {
    e.preventDefault();
    if (!code.trim()) return setErr('Type the code from the email.');
    setBusy(true); setErr('');
    try {
      await verifyCode(email.trim(), code.trim());
      onSignedIn(await currentSession());
    } catch (x) {
      setErr(x.message || 'That code did not work. Codes expire after about an hour.');
    } finally { setBusy(false); }
  }

  return (
    <div className="splash">
      <form className="splash-card" onSubmit={step === 'email' ? send : verify}>
        <span className="eyebrow">Strategic Plan Portal{slug ? ` · ${slug}` : ''}</span>
        <h1>Sign in</h1>
        {step === 'email' ? (
          <>
            <p>We email you a one-time code. No password, and nothing to click in the message.</p>
            <div className="field">
              <label className="eyebrow" htmlFor="email">Email</label>
              <input id="email" type="email" autoComplete="email" value={email}
                     onChange={(e) => setEmail(e.target.value)} placeholder="you@organization.org" autoFocus />
            </div>
            <button className="solid" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send code'}</button>
          </>
        ) : (
          <>
            <p>We sent a code to <strong>{email}</strong>.</p>
            <div className="field">
              <label className="eyebrow" htmlFor="code">Code</label>
              <input id="code" className="code" inputMode="numeric" autoComplete="one-time-code"
                     value={code} onChange={(e) => setCode(e.target.value)} placeholder="······" autoFocus />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="ghost" type="button" onClick={() => { setStep('email'); setErr(''); }}>Back</button>
              <button className="solid" type="submit" disabled={busy}>{busy ? 'Checking…' : 'Sign in'}</button>
            </div>
          </>
        )}
        {err ? <p className="errnote">{err}</p> : null}
      </form>
    </div>
  );
}
