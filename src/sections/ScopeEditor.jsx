import React, { useId } from 'react';
import { SectionHead, Panel } from '../components/ui.jsx';
import * as E from '../lib/engagement.js';

/* Section 01, as fields. Same idea as the plan editor: edit in the layout you
   read, hold everything as a draft, and write nothing until Save — a
   half-typed phase name has no business reaching the client.

   One draft covers all three tabs. The sub-nav still works while editing, so
   Timeline, Scope & cadence and Team are three views of one document and one
   Save. Ticks and statuses do not need this screen at all: they are changed
   straight on the timeline. */

function Field({ label, value, onChange, type = 'text', area, placeholder }) {
  const id = useId();
  const Tag = area ? 'textarea' : 'input';
  return (
    <div className="efield">
      <label className="eyebrow" htmlFor={id}>{label}</label>
      <Tag
        id={id}
        type={area ? undefined : type}
        value={value || ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function StatusField({ value, onChange }) {
  const id = useId();
  return (
    <div className="efield">
      <label className="eyebrow" htmlFor={id}>Status</label>
      <select id={id} value={value == null ? '' : value} onChange={(e) => onChange(e.target.value || null)}>
        {value == null ? <option value="">Not set — follows the dates</option> : null}
        {E.STATUSES.map((v) => <option key={v} value={v}>{E.STATUS_WORD[v]}</option>)}
      </select>
    </div>
  );
}

function RowTools({ i, n, label, onMove, onDelete }) {
  return (
    <span className="rowtools">
      <button type="button" className="tool" disabled={i === 0} onClick={() => onMove(i, -1)}
              aria-label={`Move ${label} up`} title="Move up">↑</button>
      <button type="button" className="tool" disabled={i === n - 1} onClick={() => onMove(i, 1)}
              aria-label={`Move ${label} down`} title="Move down">↓</button>
      <button type="button" className="tool danger" onClick={() => onDelete(i)}
              aria-label={`Delete ${label}`} title="Delete">✕</button>
    </span>
  );
}

/* A list of sentences: in scope, out of scope, outcomes, questions. */
function TextList({ title, hint, items, onChange, area, addLabel, noun }) {
  const list = items || [];
  return (
    <div className="esub">
      <h4 className="eyebrow">{title}</h4>
      {hint ? <p className="sethint">{hint}</p> : null}
      {list.map((x, i) => (
        <div className="erow e-text" key={i}>
          {area ? (
            <textarea value={x} rows={2} aria-label={`${noun} ${i + 1}`}
                      onChange={(e) => onChange(E.setIn(list, [i], e.target.value))} />
          ) : (
            <input type="text" value={x} aria-label={`${noun} ${i + 1}`}
                   onChange={(e) => onChange(E.setIn(list, [i], e.target.value))} />
          )}
          <RowTools i={i} n={list.length} label={`${noun} ${i + 1}`}
                    onMove={(j, d) => onChange(E.moveAt(list, j, d))}
                    onDelete={(j) => onChange(E.removeAt(list, j))} />
        </div>
      ))}
      <button type="button" className="ghost" onClick={() => onChange([...list, ''])}>+ {addLabel}</button>
    </div>
  );
}

/* A list of rows with fields: cadence, key dates, people, governance. Every
   new row gets its own id at once — see lib/engagement.js for why rows are
   matched by id rather than by position. */
function RowList({ title, hint, rows, onChange, cols, prefix, blank, addLabel, noun }) {
  const list = rows || [];
  const grid = cols.map((c) => c.size || '1fr').join(' ');
  return (
    <div className="esub">
      <h4 className="eyebrow">{title}</h4>
      {hint ? <p className="sethint">{hint}</p> : null}
      {list.length ? (
        <div className="erow e-head" style={{ '--cols': grid }} aria-hidden="true">
          {cols.map((c) => <span key={c.key} className="eyebrow">{c.label}</span>)}
          <span />
        </div>
      ) : null}
      {list.map((r, i) => {
        const label = `${noun} ${i + 1}${r[cols[0].key] ? ` (${r[cols[0].key]})` : ''}`;
        return (
          <div className="erow" key={r.id || i} style={{ '--cols': grid }}>
            {cols.map((c) => (
              <input
                key={c.key}
                className={c.wide ? 'wide' : undefined}
                type={c.type || 'text'}
                value={r[c.key] || ''}
                placeholder={c.label}
                aria-label={`${c.label}, ${label}`}
                onChange={(e) => onChange(E.setIn(list, [i, c.key], e.target.value))}
              />
            ))}
            <RowTools i={i} n={list.length} label={label}
                      onMove={(j, d) => onChange(E.moveAt(list, j, d))}
                      onDelete={(j) => onChange(E.removeAt(list, j))} />
          </div>
        );
      })}
      <button type="button" className="ghost" onClick={() => onChange([...list, { id: E.newId(prefix, list), ...blank }])}>
        + {addLabel}
      </button>
    </div>
  );
}

function PhaseEditor({ p, i, draft, set }) {
  const at = (k) => ['phases', i, k];
  const dels = p.deliverables || [];
  const setDels = (v) => set(at('deliverables'), v);
  const label = `Phase ${p.number}${p.name ? `, ${p.name}` : ''}`;
  return (
    <section className="ephase" aria-label={label}>
      <div className="ehead">
        <span className="pri-n">Phase {p.number}</span>
        <span className="rowtools">
          <button
            type="button"
            className="tool danger"
            aria-label={`Delete ${label}`}
            title="Delete this phase"
            onClick={() => {
              const n = dels.length;
              /* The one delete here that takes a lot with it. Discard would
                 still bring it back, but only if the person notices first. */
              if (n && !window.confirm(`Delete ${label} and its ${n} deliverable${n === 1 ? '' : 's'}?`)) return;
              set(['phases'], E.removeAt(draft.phases, i));
            }}
          >✕</button>
        </span>
      </div>
      <div className="egrid e3">
        <Field label="Name" value={p.name} onChange={(v) => set(at('name'), v)} placeholder="Discovery" />
        <Field label="Starts" type="date" value={p.start} onChange={(v) => set(at('start'), v)} />
        <Field label="Ends" type="date" value={p.end} onChange={(v) => set(at('end'), v)} />
      </div>
      <StatusField value={p.status} onChange={(v) => set(at('status'), v)} />
      <Field label="Purpose" area value={p.purpose} onChange={(v) => set(at('purpose'), v)}
             placeholder="What this phase is for, in a sentence." />
      <Field label="Note" area value={p.note} onChange={(v) => set(at('note'), v)}
             placeholder="Anything the team should know. Optional." />

      <div className="esub">
        <h4 className="eyebrow">Deliverables</h4>
        {dels.map((d, j) => (
          <div className="erow e-del" key={d.id || j}>
            <input type="checkbox" checked={d.done === true} aria-label={`Done: ${d.name || `deliverable ${j + 1}`}`}
                   onChange={(e) => setDels(E.setIn(dels, [j, 'done'], e.target.checked))} />
            <input type="text" value={d.name} placeholder="What gets delivered" aria-label={`Deliverable ${j + 1}`}
                   onChange={(e) => setDels(E.setIn(dels, [j, 'name'], e.target.value))} />
            <RowTools i={j} n={dels.length} label={`deliverable ${j + 1}`}
                      onMove={(k, d2) => setDels(E.moveAt(dels, k, d2))}
                      onDelete={(k) => setDels(E.removeAt(dels, k))} />
          </div>
        ))}
        <button type="button" className="ghost"
                onClick={() => setDels([...dels, { id: E.newId('d', dels), name: '', done: false }])}>
          + Add deliverable
        </button>
      </div>
    </section>
  );
}

export default function ScopeEditor({ view, draft, setDraft, labels, problems, conflict, onKeepMine, onUseTheirs, saving }) {
  const set = (path, v) => setDraft(E.setIn(draft, path, v));
  const scope = draft.scope || {};
  const eyebrow = `Editing · ${labels.scope}`;

  const notices = (
    <>
      {conflict ? (
        <div className="eflag is-conflict" role="alert">
          <strong>
            While you were editing, someone else saved a different change to
            {conflict.paths.length === 1 ? ' this:' : ' these:'}
          </strong>
          <ul>{conflict.paths.map((x) => <li key={x}>{x}</li>)}</ul>
          <p>Everything else you changed is kept either way.</p>
          <div className="eflag-actions">
            <button type="button" className="solid" disabled={saving} onClick={onKeepMine}>Keep mine and save</button>
            <button type="button" className="ghost" disabled={saving} onClick={onUseTheirs}>Use theirs, keep editing</button>
          </div>
        </div>
      ) : null}
      {problems && problems.length ? (
        <div className="eflag" role="alert">
          <strong>Nothing was saved. Fix {problems.length === 1 ? 'this' : 'these'} first:</strong>
          <ul>{problems.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
      ) : null}
    </>
  );

  if (view === 'agreement') {
    return (
      <>
        <SectionHead eyebrow={eyebrow} title="Scope and cadence">
          Changes are held until you press Save. Blank rows are dropped when you save.
        </SectionHead>
        {notices}
        <Panel>
          <Field label="Scope, in a sentence or two" area value={scope.scopeSummary}
                 onChange={(v) => set(['scope', 'scopeSummary'], v)} />
          <TextList title="In scope" items={scope.inScope} noun="In scope item" addLabel="Add an item"
                    onChange={(v) => set(['scope', 'inScope'], v)} />
          <TextList title="Out of scope" items={scope.outOfScope} noun="Out of scope item" addLabel="Add an item"
                    onChange={(v) => set(['scope', 'outOfScope'], v)} />
          <TextList title="Expected outcomes" area items={scope.outcomes} noun="Outcome" addLabel="Add an outcome"
                    onChange={(v) => set(['scope', 'outcomes'], v)} />
          <TextList title="Questions this process answers" area items={scope.questions} noun="Question"
                    addLabel="Add a question" onChange={(v) => set(['scope', 'questions'], v)} />
          <TextList title="Documents under review" items={scope.documents} noun="Document" addLabel="Add a document"
                    onChange={(v) => set(['scope', 'documents'], v)} />
          <RowList
            title="Cadence" noun="Cadence row" prefix="c" addLabel="Add a cadence row"
            hint="How often, what happens, and who owns it. A next date is optional."
            rows={scope.cadence} onChange={(v) => set(['scope', 'cadence'], v)}
            blank={{ rhythm: '', what: '', owner: '', next: '' }}
            cols={[
              { key: 'rhythm', label: 'How often', size: '120px' },
              { key: 'what', label: 'What', size: 'minmax(0, 2fr)', wide: true },
              { key: 'owner', label: 'Owner', size: 'minmax(0, 1fr)' },
              { key: 'next', label: 'Next date', type: 'date', size: '150px' },
            ]}
          />
          <RowList
            title="Key dates" noun="Key date" prefix="k" addLabel="Add a key date"
            hint="The dates the engagement hangs on. They appear on the timeline and in date order here once saved."
            rows={scope.keyDates} onChange={(v) => set(['scope', 'keyDates'], v)}
            blank={{ date: '', what: '' }}
            cols={[
              { key: 'date', label: 'Date', type: 'date', size: '150px' },
              { key: 'what', label: 'What', size: 'minmax(0, 1fr)', wide: true },
            ]}
          />
        </Panel>
      </>
    );
  }

  if (view === 'team') {
    return (
      <>
        <SectionHead eyebrow={eyebrow} title="Team">
          Changes are held until you press Save. This is the page the client reads — who is on the
          work and what each person owns. It does not change who can sign in; that is Access.
        </SectionHead>
        {notices}
        <Panel>
          <div className="egrid">
            <Field label="Firm" value={draft.firm?.name} onChange={(v) => set(['firm', 'name'], v)} />
            <Field label="Engagement lead" value={draft.firm?.lead} onChange={(v) => set(['firm', 'lead'], v)} />
            <Field label="Convened by" value={draft.convener} onChange={(v) => set(['convener'], v)} />
            <Field label="Location" value={draft.location} onChange={(v) => set(['location'], v)} />
          </div>
          <RowList
            title={draft.firm?.name ? `${draft.firm.name} team` : 'Consulting team'} noun="Team member" prefix="ct"
            addLabel="Add a person" rows={scope.consultingTeam} onChange={(v) => set(['scope', 'consultingTeam'], v)}
            blank={{ name: '', org: '', role: '', owns: '' }}
            cols={[
              { key: 'name', label: 'Name', size: 'minmax(0, 1fr)' },
              { key: 'role', label: 'Role', size: 'minmax(0, 1fr)' },
              { key: 'owns', label: 'Owns', size: 'minmax(0, 2fr)', wide: true },
            ]}
          />
          <RowList
            title="Client team" noun="Client team member" prefix="cl" addLabel="Add a person"
            rows={scope.clientTeam} onChange={(v) => set(['scope', 'clientTeam'], v)}
            blank={{ name: '', org: '', role: '', owns: '' }}
            cols={[
              { key: 'name', label: 'Name', size: 'minmax(0, 1fr)' },
              { key: 'org', label: 'Organisation', size: 'minmax(0, 1fr)' },
              { key: 'role', label: 'Role', size: 'minmax(0, 1fr)' },
              { key: 'owns', label: 'Owns', size: 'minmax(0, 2fr)', wide: true },
            ]}
          />
          <RowList
            title="Governance" noun="Governance group" prefix="g" addLabel="Add a group"
            hint="The groups the work goes through, and how often they meet."
            rows={scope.governance} onChange={(v) => set(['scope', 'governance'], v)}
            blank={{ body: '', members: '', meets: '' }}
            cols={[
              { key: 'body', label: 'Group', size: 'minmax(0, 1fr)' },
              { key: 'members', label: 'Members', size: 'minmax(0, 1fr)', wide: true },
              { key: 'meets', label: 'Meets', size: 'minmax(0, 1fr)' },
            ]}
          />
        </Panel>
      </>
    );
  }

  return (
    <>
      <SectionHead eyebrow={eyebrow} title="Timeline">
        Changes are held until you press Save. Phases are numbered by their start dates, so moving a
        date can renumber them. Ticking a deliverable or setting a status does not need this screen —
        both can be done straight on the timeline.
      </SectionHead>
      {notices}
      <Panel>
        <div className="egrid e3">
          <Field label="Engagement starts" type="date" value={draft.engagementStart}
                 onChange={(v) => set(['engagementStart'], v)} />
          <Field label="Engagement ends" type="date" value={draft.engagementEnd}
                 onChange={(v) => set(['engagementEnd'], v)} />
          <Field label="Plan horizon" value={draft.planHorizon} placeholder="3–5 years"
                 onChange={(v) => set(['planHorizon'], v)} />
        </div>
      </Panel>
      {(draft.phases || []).map((p, i) => (
        <PhaseEditor key={p.id || i} p={p} i={i} draft={draft} set={set} />
      ))}
      <div style={{ marginTop: 22 }}>
        <button type="button" className="solid" onClick={() => set(['phases'], [...(draft.phases || []), E.blankPhase(draft)])}>
          + Add a phase
        </button>
      </div>
    </>
  );
}
