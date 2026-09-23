import React, { useState } from 'react';
import { SectionHead, Panel } from '../components/ui.jsx';
import * as E from '../lib/planEdit.js';
import { lower } from '../lib/labels.js';

/* Editing happens in the same layout you read, not on a separate screen —
   a separate editor drifts from the thing it edits. */

function Field({ label, value, onChange, area, placeholder, mono }) {
  const Tag = area ? 'textarea' : 'input';
  return (
    <div className="efield">
      <label className="eyebrow">{label}</label>
      <Tag
        className={mono ? 'mono' : undefined}
        value={value || ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function RowTools({ onUp, onDown, onDelete, label }) {
  return (
    <span className="rowtools">
      <button className="tool" onClick={onUp} aria-label={`Move ${label} up`} title="Move up">↑</button>
      <button className="tool" onClick={onDown} aria-label={`Move ${label} down`} title="Move down">↓</button>
      <button className="tool danger" onClick={onDelete} aria-label={`Delete ${label}`} title="Delete">✕</button>
    </span>
  );
}

/* Picking evidence is the point of the product, so it is a real search over the
   findings rather than a free-text field that could name a theme that does not
   exist. */
function EvidencePicker({ findings, selected, onToggle, onClose, CATNAME }) {
  const [q, setQ] = useState('');
  const themes = (findings.themes || [])
    .filter((t) => !q || t.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.n - a.n);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-label="Link findings">
        <span className="eyebrow">Evidence</span>
        <h3 style={{ marginTop: 3 }}>Link findings</h3>
        <p style={{ fontSize: 13.5, color: 'var(--ink-2)', marginTop: 8 }}>
          Counts are the number of separate sources that raised each finding.
        </p>
        <div className="efield" style={{ marginTop: 12 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search findings…" autoFocus />
        </div>
        <div className="pickerlist">
          {themes.map((t) => {
            const on = selected.includes(t.id);
            return (
              <button key={t.id} className={`pickrow${on ? ' on' : ''}`} onClick={() => onToggle(t.id)}>
                <span className={`ck k-${t.cat}`}>{t.cat}</span>
                <span className="pickname">{t.name}</span>
                <span className="num pickn">{t.n}</span>
                <span className="pickmark">{on ? '✓' : ''}</span>
              </button>
            );
          })}
          {!themes.length ? <p style={{ color: 'var(--ink-2)', fontSize: 13 }}>No findings match “{q}”.</p> : null}
        </div>
        <div style={{ marginTop: 14, textAlign: 'right' }}>
          <button className="solid" onClick={onClose}>Done</button>
        </div>
      </div>
    </>
  );
}

function EvidenceRow({ ids, themes, onOpen, onRemove, label }) {
  return (
    <div className="chips">
      <span className="chips-label">{label}</span>
      {(ids || []).map((id) => {
        const t = themes[id];
        return (
          <span className="chip" key={id}>
            <span className={`ck k-${t?.cat || 'S'}`}>{t?.cat || '?'}</span>
            <span className="cn">{t?.name || id}</span>
            <button className="chipx" onClick={() => onRemove(id)} aria-label={`Unlink ${t?.name || id}`}>✕</button>
          </span>
        );
      })}
      <button className="chip addchip" onClick={onOpen}>+ Link a finding</button>
    </div>
  );
}

export default function PlanEditor({
  draft, setDraft, onStructural, tasks, labels, findings, themeById, CATNAME,
  onStructuralDelete,
}) {
  const [picker, setPicker] = useState(null); // {kind, id}

  /* Plain field edits just replace the plan. Anything that RENUMBERS goes
     through onStructural, which also carries the tasks — see App.jsx. */
  const apply = (nextPlan) => setDraft(nextPlan);
  const structural = (result) => onStructural(result);

  return (
    <>
      <SectionHead eyebrow={`Editing · ${labels.plan}`} title="The plan">
        Changes are held until you press Save. Numbering follows the order here, and any{' '}
        {lower(labels.tasks)} attached to something you move or delete are kept in step.
      </SectionHead>

      <Panel>
        <Field label="Vision" area value={draft.vision}
               placeholder="The vision, in a sentence or two."
               onChange={(v) => apply(E.setPlanField(draft, 'vision', v))} />
        <Field label="Framing" area value={draft.framing}
               placeholder="How the plan is structured, for the reader arriving cold."
               onChange={(v) => apply(E.setPlanField(draft, 'framing', v))} />
      </Panel>

      {(draft.priorities || []).map((p) => (
        <section className="priority editing" key={p.id}>
          <div className="ehead">
            <span className="pri-n">{labels.priorityShort} {p.n}</span>
            <RowTools
              label={`${labels.priorityShort} ${p.n}`}
              onUp={() => structural(E.movePriority(draft, p.id, -1))}
              onDown={() => structural(E.movePriority(draft, p.id, 1))}
              onDelete={() => onStructuralDelete({ kind: 'priority', id: p.id, title: p.title })}
            />
          </div>

          <Field label={`${labels.priority} title`} value={p.title}
                 onChange={(v) => apply(E.setPriorityField(draft, p.id, 'title', v))} />
          <Field label="Thesis" area value={p.thesis}
                 placeholder="Why this is a priority — ideally citing what the findings said."
                 onChange={(v) => apply(E.setPriorityField(draft, p.id, 'thesis', v))} />
          <EvidenceRow ids={p.evidence} themes={themeById} label="Drawn from"
                       onOpen={() => setPicker({ kind: 'priority', id: p.id })}
                       onRemove={(tid) => apply(E.toggleEvidence(draft, 'priority', p.id, tid))} />

          <div className="esub">
            <h4 className="eyebrow">{labels.kpis}</h4>
            {(p.kpis || []).map((k, i) => (
              <div className="ekpi" key={i}>
                <input value={k.text} placeholder="What we will measure"
                       onChange={(e) => apply(E.setKpi(draft, p.id, i, 'text', e.target.value))} />
                <input className="mono" value={k.now} placeholder="Now"
                       onChange={(e) => apply(E.setKpi(draft, p.id, i, 'now', e.target.value))} />
                <input className="mono" value={k.target} placeholder="Target"
                       onChange={(e) => apply(E.setKpi(draft, p.id, i, 'target', e.target.value))} />
                <select value={k.init || ''} onChange={(e) => apply(E.setKpi(draft, p.id, i, 'init', e.target.value))}>
                  <option value="">—</option>
                  {(p.initiatives || []).map((o) => <option key={o.id} value={o.id}>{o.id}</option>)}
                </select>
                <button className="tool danger" onClick={() => apply(E.removeKpi(draft, p.id, i))}
                        aria-label="Delete KPI">✕</button>
              </div>
            ))}
            <button className="ghost" onClick={() => apply(E.addKpi(draft, p.id))}>
              + Add {lower(labels.kpi)}
            </button>
          </div>

          <div className="esub">
            <h4 className="eyebrow">{labels.initiatives}</h4>
            {(p.initiatives || []).map((o) => {
              const n = tasks.filter((t) => t.init === o.id && !t.parent).length;
              return (
                <div className="init editing" key={o.id}>
                  <div className="ehead">
                    <span className="init-id">{o.id}</span>
                    <span className="etasks">{n} {n === 1 ? lower(labels.task) : lower(labels.tasks)}</span>
                    <RowTools
                      label={`${labels.initiative} ${o.id}`}
                      onUp={() => structural(E.moveInitiative(draft, o.id, -1))}
                      onDown={() => structural(E.moveInitiative(draft, o.id, 1))}
                      onDelete={() => onStructuralDelete({ kind: 'initiative', id: o.id, title: o.title, taskCount: n })}
                    />
                  </div>
                  <Field label="Title" value={o.title}
                         onChange={(v) => apply(E.setInitiativeField(draft, o.id, 'title', v))} />
                  <Field label="Detail" area value={o.detail}
                         onChange={(v) => apply(E.setInitiativeField(draft, o.id, 'detail', v))} />
                  <EvidenceRow ids={o.evidence} themes={themeById} label="Evidence"
                               onOpen={() => setPicker({ kind: 'initiative', id: o.id })}
                               onRemove={(tid) => apply(E.toggleEvidence(draft, 'initiative', o.id, tid))} />
                </div>
              );
            })}
            <button className="ghost" onClick={() => structural(E.addInitiative(draft, p.id, labels))}>
              + Add {lower(labels.initiative)}
            </button>
          </div>
        </section>
      ))}

      <div style={{ marginTop: 22 }}>
        <button className="solid" onClick={() => structural(E.addPriority(draft, labels))}>
          + Add {lower(labels.priority)}
        </button>
      </div>

      {picker ? (
        <EvidencePicker
          findings={findings}
          CATNAME={CATNAME}
          selected={
            picker.kind === 'priority'
              ? (draft.priorities.find((p) => p.id === picker.id)?.evidence || [])
              : ((draft.priorities.flatMap((p) => p.initiatives || []).find((o) => o.id === picker.id)?.evidence) || [])
          }
          onToggle={(tid) => apply(E.toggleEvidence(draft, picker.kind, picker.id, tid))}
          onClose={() => setPicker(null)}
        />
      ) : null}
    </>
  );
}
