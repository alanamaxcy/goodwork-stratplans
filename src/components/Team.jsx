import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

const ROLE_HELP = {
  owner: 'Edits the plan and the workplan. Manages who has access.',
  staff: 'Runs the workplan — status, owners, dates, notes. Cannot change the plan.',
  board: 'Reads everything. Writes nothing.',
};

/* Who can reach this portal. Talks to netlify/functions/team.mjs, because
   creating an account needs the admin key and that stays on the server. */
export default function Team({ portal, onClose }) {
  const [members, setMembers] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('board');
  const [ownFirm, setOwnFirm] = useState(false);
  const [note, setNote] = useState('');

  const call = useCallback(
    async (action, extra = {}) => {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      const res = await fetch('/.netlify/functions/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ portalSlug: portal.slug, action, ...extra }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || `Request failed (${res.status})`);
      return out;
    },
    [portal.slug],
  );

  const refresh = useCallback(async () => {
    setErr('');
    try {
      const out = await call('list');
      setMembers(out.members);
    } catch (e) {
      setMembers([]);
      setErr(e.message);
    }
  }, [call]);

  useEffect(() => { refresh(); }, [refresh]);

  async function run(fn) {
    setBusy(true); setErr(''); setNote('');
    try { await fn(); await refresh(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  const invite = () =>
    run(async () => {
      const out = await call('invite', { email: email.trim(), role, ownFirm });
      setNote(
        out.created
          ? `Account created for ${out.email}. Send them ${window.location.origin}/${portal.slug} — they sign in with a code.`
          : `${out.email} already had an account and can now reach this portal.`,
      );
      setEmail('');
    });

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal wide" role="dialog" aria-label="Who has access">
        <span className="eyebrow">Access · {portal.slug}</span>
        <h3 style={{ marginTop: 3 }}>Who can open this portal</h3>
        <p className="sethint">
          Sign-in is an emailed code — no passwords, nothing to click in the message. Adding someone
          here creates their account and tags it; they just go to the link and ask for a code.
        </p>

        <h4 className="eyebrow setgroup">Add someone</h4>
        <div className="teamadd">
          <input
            value={email} placeholder="them@organisation.org" type="email" autoComplete="off"
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && email.trim() && !busy && invite()}
          />
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="board">Board — read only</option>
            <option value="staff">Staff — runs the workplan</option>
            <option value="owner">Owner — edits the plan</option>
          </select>
          <button className="solid" disabled={busy || !email.trim()} onClick={invite}>
            {busy ? 'Working…' : 'Add'}
          </button>
        </div>
        <p className="sethint" style={{ marginTop: 6 }}>{ROLE_HELP[role]}</p>
        <label className="teamcheck">
          <input type="checkbox" checked={ownFirm} onChange={(e) => setOwnFirm(e.target.checked)} />
          <span>
            They work for your firm — tag them <code>*</code> so they can reach every client, not just this one.
          </span>
        </label>

        <h4 className="eyebrow setgroup">Current access</h4>
        {members === null ? (
          <p className="sethint">Loading…</p>
        ) : !members.length ? (
          <p className="sethint">Nobody yet.</p>
        ) : (
          <div className="teamlist">
            {members.map((m) => (
              <div className="teamrow" key={m.email}>
                <span className="teamwho">
                  {m.email}
                  {!m.tenantOk ? (
                    <span className="teamwarn" title={`Their gw_tenant is "${m.tenant || 'unset'}" but this portal is "${portal.tenant || ''}"`}>
                      tag mismatch — they will see nothing
                    </span>
                  ) : null}
                  <span className="teamseen">
                    {m.lastSignIn ? `last in ${new Date(m.lastSignIn).toISOString().slice(0, 10)}` : 'never signed in'}
                  </span>
                </span>
                <select
                  value={m.role} disabled={busy}
                  onChange={(e) => run(() => call('setRole', { email: m.email, role: e.target.value }))}
                >
                  <option value="board">Board</option>
                  <option value="staff">Staff</option>
                  <option value="owner">Owner</option>
                </select>
                <button className="tool danger" disabled={busy} aria-label={`Remove ${m.email}`}
                        onClick={() => run(() => call('remove', { email: m.email }))}>✕</button>
              </div>
            ))}
          </div>
        )}

        {note ? <p className="teamnote">{note}</p> : null}
        {err ? <p className="errnote">{err}</p> : null}

        <div style={{ marginTop: 18, textAlign: 'right' }}>
          <button className="ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </>
  );
}
