import React from 'react';
import { EvidenceChips, Dot } from './ui.jsx';
import { STATUS_ORDER, STATUS_LABEL } from '../lib/format.js';

export default function TaskDrawer({
  task, labels, byInit, priorityOf, themeById, subsOf, canEdit, onSave, goTheme, onClose, tasks,
}) {
  if (!task) return null;
  const o = byInit[task.init] || {};
  const p = priorityOf[task.init] || {};
  const subs = subsOf(task.id);
  const ro = !canEdit;
  const dep = task.dep ? tasks.find((t) => t.id === task.dep) : null;

  const cycle = (t) =>
    onSave(t.id, { status: STATUS_ORDER[(STATUS_ORDER.indexOf(t.status) + 1) % STATUS_ORDER.length] });

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={`Task ${task.id}`}>
        <div className="drawer-head">
          <div>
            <span className="eyebrow">
              {task.id} · {labels.priorityShort} {p.n} · {labels.initiative} {o.id}
            </span>
            <h3>{task.title}</h3>
          </div>
          <button className="ghost" onClick={onClose}>Close</button>
        </div>

        <div className="callout" style={{ margin: '16px 0 0' }}>
          <span aria-hidden="true">↳</span>
          <span>
            Serves <strong style={{ fontWeight: 500, color: 'var(--ink)' }}>{o.title}</strong>, which came
            from {(o.evidence || []).length} findings.
          </span>
        </div>
        <EvidenceChips ids={o.evidence} label="Traces to" themes={themeById} onOpen={goTheme} />

        <div className="field">
          <label className="eyebrow" htmlFor="fStatus">Status</label>
          <select id="fStatus" value={task.status} disabled={ro}
                  onChange={(e) => onSave(task.id, { status: e.target.value })}>
            {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="eyebrow" htmlFor="fOwner">Owner</label>
          <input id="fOwner" value={task.owner} disabled={ro}
                 onChange={(e) => onSave(task.id, { owner: e.target.value })} />
        </div>
        <div className="field">
          <label className="eyebrow" htmlFor="fDue">Due</label>
          <input id="fDue" type="date" value={task.due || ''} disabled={ro}
                 onChange={(e) => onSave(task.id, { due: e.target.value })} />
        </div>
        <div className="field">
          <label className="eyebrow" htmlFor="fNote">Notes</label>
          <textarea id="fNote" value={task.note} disabled={ro}
                    placeholder="What happened, what is next, what is in the way…"
                    onChange={(e) => onSave(task.id, { note: e.target.value })} />
        </div>

        {subs.length ? (
          <div className="sublist">
            <h4 className="eyebrow" style={{ marginBottom: 8 }}>
              {labels.subtasks} · {subs.filter((s) => s.status === 'done').length} of {subs.length}
            </h4>
            {subs.map((s) => (
              <div className={`subrow ${s.status}`} key={s.id}>
                <button className="statusbtn" disabled={ro} title={STATUS_LABEL[s.status]}
                        aria-label={`${s.title} — ${STATUS_LABEL[s.status]}`} onClick={() => cycle(s)}>
                  <Dot status={s.status} small />
                </button>
                <span>{s.title}</span>
              </div>
            ))}
          </div>
        ) : null}

        {dep ? <p className="savenote">Waits on {dep.id} · {dep.title}</p> : null}
        <p className="savenote">{ro ? 'Read-only in this view.' : 'Saves for everyone on this portal.'}</p>
      </aside>
    </>
  );
}
