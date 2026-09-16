import React, { useState } from 'react';
import { DEFAULT_LABELS, ALL_SECTIONS } from '../lib/labels.js';

const SECTION_NAMES = {
  scope: 'Scope & timeline', plan: 'The plan', findings: 'Findings',
  workplan: 'Workplan', dashboard: 'Dashboard',
};

/* What the consultant configures per client. The taxonomy is the interesting
   part: a church says "pillars", a foundation says "goal areas". Leaving a
   field blank falls back to the default rather than storing a copy of it, so a
   later change to the default reaches every portal that never overrode it. */
export default function Settings({ portal, labels, onSave, onClose }) {
  const [client, setClient] = useState({
    client_name: portal.client_name || '',
    place: portal.place || '',
    engagement_name: portal.engagement_name || '',
    adopted: portal.adopted || '',
  });
  const [lab, setLab] = useState(portal.labels || {});
  const [sections, setSections] = useState(
    Array.isArray(portal.sections) && portal.sections.length ? portal.sections : ALL_SECTIONS,
  );
  const [accent, setAccent] = useState(portal.brand?.accent || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const toggleSection = (id) =>
    setSections((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...ALL_SECTIONS.filter((a) => s.includes(a) || a === id)]));

  const moveSection = (id, d) =>
    setSections((s) => {
      const i = s.indexOf(id);
      const j = i + d;
      if (i < 0 || j < 0 || j >= s.length) return s;
      const next = s.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  async function save() {
    setBusy(true); setErr('');
    try {
      /* Only store an override that differs from the default. */
      const labels_ = Object.fromEntries(
        Object.entries(lab).filter(([k, v]) => v && v.trim() && v.trim() !== DEFAULT_LABELS[k]),
      );
      await onSave({
        ...client,
        adopted: client.adopted || null,
        labels: labels_,
        sections,
        brand: { ...(portal.brand || {}), accent: accent || null },
      });
      onClose();
    } catch (e) {
      setErr(e.message || 'Could not save.');
      setBusy(false);
    }
  }

  const LabelField = ({ k }) => (
    <div className="efield">
      <label className="eyebrow">{DEFAULT_LABELS[k]}</label>
      <input
        value={lab[k] || ''}
        placeholder={DEFAULT_LABELS[k]}
        onChange={(e) => setLab((s) => ({ ...s, [k]: e.target.value }))}
      />
    </div>
  );

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal wide" role="dialog" aria-label="Portal settings">
        <span className="eyebrow">Settings</span>
        <h3 style={{ marginTop: 3 }}>{portal.client_name}</h3>

        <h4 className="eyebrow setgroup">Who this is for</h4>
        <div className="egrid">
          <div className="efield">
            <label className="eyebrow" htmlFor="sClient">Client</label>
            <input id="sClient" value={client.client_name}
                   onChange={(e) => setClient((c) => ({ ...c, client_name: e.target.value }))} />
          </div>
          <div className="efield">
            <label className="eyebrow" htmlFor="sPlace">Place</label>
            <input id="sPlace" value={client.place}
                   onChange={(e) => setClient((c) => ({ ...c, place: e.target.value }))} />
          </div>
          <div className="efield">
            <label className="eyebrow" htmlFor="sEng">Engagement</label>
            <input id="sEng" value={client.engagement_name}
                   onChange={(e) => setClient((c) => ({ ...c, engagement_name: e.target.value }))} />
          </div>
          <div className="efield">
            <label className="eyebrow" htmlFor="sAdopted">Adopted</label>
            <input id="sAdopted" type="date" value={client.adopted || ''}
                   onChange={(e) => setClient((c) => ({ ...c, adopted: e.target.value }))} />
          </div>
        </div>

        <h4 className="eyebrow setgroup">What this client calls things</h4>
        <p className="sethint">
          Leave blank to use the default. A church says “pillars”, a foundation says “goal areas”.
        </p>
        <div className="egrid">
          {['priority', 'priorities', 'priorityShort', 'initiative', 'initiatives', 'task', 'tasks', 'subtask', 'subtasks', 'kpis'].map((k) => (
            <LabelField key={k} k={k} />
          ))}
        </div>

        <h4 className="eyebrow setgroup">Sections</h4>
        <p className="sethint">A client with no discovery study can turn Findings off entirely.</p>
        <div className="setsections">
          {ALL_SECTIONS.map((id) => {
            const on = sections.includes(id);
            const pos = sections.indexOf(id);
            return (
              <div className={`setrow${on ? '' : ' off'}`} key={id}>
                <label>
                  <input type="checkbox" checked={on} onChange={() => toggleSection(id)} />
                  <span>{SECTION_NAMES[id]}</span>
                </label>
                {on ? (
                  <span className="rowtools">
                    <button className="tool" disabled={pos <= 0} onClick={() => moveSection(id, -1)} aria-label="Move up">↑</button>
                    <button className="tool" disabled={pos >= sections.length - 1} onClick={() => moveSection(id, 1)} aria-label="Move down">↓</button>
                  </span>
                ) : null}
              </div>
            );
          })}
          {!sections.length ? <p className="errnote">A portal needs at least one section.</p> : null}
        </div>

        <h4 className="eyebrow setgroup">Accent</h4>
        <p className="sethint">
          One colour, and their logo. Not full theming — the portal should look like your deliverable
          across every client, not reskin into each one.
        </p>
        <div className="accentrow">
          <input type="color" value={accent || '#4f3d9e'} onChange={(e) => setAccent(e.target.value)} aria-label="Accent colour" />
          <input className="mono" value={accent} placeholder="default" onChange={(e) => setAccent(e.target.value)} />
          {accent ? <button className="ghost" onClick={() => setAccent('')}>Reset</button> : null}
        </div>

        {err ? <p className="errnote">{err}</p> : null}
        <div style={{ marginTop: 18, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="ghost" onClick={onClose}>Cancel</button>
          <button className="solid" onClick={save} disabled={busy || !sections.length}>
            {busy ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </div>
    </>
  );
}
