import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

const ROLE_HELP = {
  owner: 'Edits everything — timeline, scope, plan, workplan — and manages who has access.',
  staff: 'Runs the workplan — status, owners, dates, notes. Cannot change the timeline or the plan.',
  board: 'Reads everything. Writes nothing.',
};

/* Who can reach this portal. Talks to netlify/functions/team.mjs, because
   creating an account needs the admin key and that stays on the server. */
/* `canTagFirm`: the person using this screen is your own firm's staff (tagged
   "*"). Only they are offered the box that makes someone else "*", and the
   server refuses it from anyone else anyway. */
export default function Team({ portal, onClose, canTagFirm = false }) {
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
      /* Anything but a JSON answer means the function is not there to answer
         — a deploy without netlify/functions, or a local dev server — and
         reading `.members` off a page of HTML used to take the whole app down. */
      const out = await res.json().catch(() => null);
      if (!res.ok || !out) {
        throw new Error((out && out.error) || `The access service did not answer (${res.status}). Use supabase/add-member.sql instead.`);
      }
      return out;
    },
    [portal.slug],
  );

  const refresh = useCallback(async () => {
    setErr('');
    try {
      const out = await call('list');
      setMembers(Array.isArray(out.members) ? out.members : []);
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
      const out = await call('invite', { email: email.trim(), role, ownFirm: canTagFirm && ownFirm });
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
            <option value="owner">Owner — edits and manages access</option>
          </select>
          <button className="solid" disabled={busy || !email.trim()} onClick={invite}>
            {busy ? 'Working…' : 'Add'}
          </button>
        </div>
        <p className="sethint" style={{ marginTop: 6 }}>{ROLE_HELP[role]}</p>
        {canTagFirm ? (
          <label className="teamcheck">
            <input type="checkbox" checked={ownFirm} onChange={(e) => setOwnFirm(e.target.checked)} />
            <span>
              Good Work staff only. Gives access to every client — here and in the Impact Suite, which
              shares this sign-in. Leave it unticked for clients and partner firms.
            </span>
          </label>
        ) : null}

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
