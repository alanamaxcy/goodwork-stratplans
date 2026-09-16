import React, { useState } from 'react';
import { SectionHead, Panel } from '../components/ui.jsx';
import { fmt, isOverdue } from '../lib/format.js';
import { ownerLoad } from './Workplan.jsx';

export default function Scope({ portal, labels, scopeId, topTasks, now }) {
  const eng = portal.engagement || {};
  const phases = eng.phases || [];
  const scope = eng.scope || {};
  const active = phases.find((p) => p.status === 'active') || phases[phases.length - 1];
  const [open, setOpen] = useState(active?.id);
  const view = scopeId; // the sub-nav writes 'timeline' | 'agreement' | 'team' here

  if (view === 'agreement') {
    return (
      <>
        <SectionHead eyebrow={labels.scope} title="What we agreed to do">
          The boundary matters as much as the list — half of these conversations are about what the
          engagement is not.
        </SectionHead>
        <div className="grid2">
          <Panel>
            <h4 className="eyebrow" style={{ marginBottom: 11 }}>In scope</h4>
            <ul className="ticklist yes">
              {(scope.inScope || []).map((x, i) => <li key={i}><span className="mk">✓</span><span>{x}</span></li>)}
            </ul>
          </Panel>
          <Panel>
            <h4 className="eyebrow" style={{ marginBottom: 11 }}>Out of scope</h4>
            <ul className="ticklist no">
              {(scope.outOfScope || []).map((x, i) => <li key={i}><span className="mk">—</span><span>{x}</span></li>)}
            </ul>
          </Panel>
        </div>
        {(scope.cadence || []).length ? (
          <Panel style={{ marginTop: 13 }}>
            <h4 className="eyebrow" style={{ marginBottom: 11 }}>Working cadence</h4>
            <div className="deflist">
              {scope.cadence.map((c, i) => (
                <React.Fragment key={i}>
                  <dt>{fmt(c.next)}</dt>
                  <dd><strong style={{ fontWeight: 500, color: 'var(--ink)' }}>{c.label}</strong><br />{c.detail}</dd>
                </React.Fragment>
              ))}
            </div>
          </Panel>
        ) : null}
      </>
    );
  }

  if (view === 'team') {
    return (
      <>
        <SectionHead eyebrow={labels.scope} title="Who is on it">
          The named parties, plus everyone carrying work in the {labels.workplan.toLowerCase()}.
        </SectionHead>
        <Panel>
          <h4 className="eyebrow" style={{ marginBottom: 11 }}>Engagement</h4>
          <div className="deflist">
            {(scope.team || []).map((m, i) => (
              <React.Fragment key={i}>
                <dt>{m.org === eng.firm?.name ? 'Consultant' : 'Client'}</dt>
                <dd><strong style={{ fontWeight: 500, color: 'var(--ink)' }}>{m.name}</strong> · {m.role}</dd>
              </React.Fragment>
            ))}
          </div>
        </Panel>
        <Panel>
          <h4 className="eyebrow" style={{ marginBottom: 11 }}>Owners in the {labels.workplan.toLowerCase()}</h4>
          <div className="deflist">
            {ownerLoad(topTasks, now).map((o) => (
              <React.Fragment key={o.name}>
                <dt>{o.open} open</dt>
                <dd>
                  <strong style={{ fontWeight: 500, color: 'var(--ink)' }}>{o.name}</strong>
                  {o.late ? <> · <span style={{ color: 'var(--stop)' }}>{o.late} past due</span></> : null}
                </dd>
              </React.Fragment>
            ))}
          </div>
        </Panel>
      </>
    );
  }

  const phase = phases.find((p) => p.id === open) || active;
  return (
    <>
      <SectionHead eyebrow={labels.scope} title="Where the engagement stands">
        {phases.length} phases. {phases.filter((p) => p.status === 'done').length} complete.
      </SectionHead>
      <div className="phasetrack">
        {phases.map((p) => {
          let style;
          if (p.status === 'active') {
            const a = Date.parse(p.start), b = Date.parse(p.end), n = Date.parse(now);
            style = { '--pct': `${Math.max(0, Math.min(100, Math.round(((n - a) / (b - a)) * 100)))}%` };
          }
          return (
            <button key={p.id} className={`phasebtn ${p.status === 'done' ? 'done' : p.status === 'active' ? 'active' : ''}`}
                    style={style} aria-pressed={phase?.id === p.id} onClick={() => setOpen(p.id)}>
              {p.status === 'active' ? <span className="pb-now">You are here</span> : null}
              <span className="pb-bar" />
              <span className="pb-n">Phase {p.n}</span>
              <span className="pb-name">{p.name}</span>
              <span className="pb-date num">{fmt(p.start)} – {fmt(p.end)}</span>
            </button>
          );
        })}
      </div>
      {phase ? (
        <Panel>
          <span className="eyebrow">Phase {phase.n} · {phase.name} · {fmt(phase.start)} – {fmt(phase.end)}</span>
          <p style={{ fontFamily: 'var(--display)', fontSize: 18, lineHeight: 1.45, marginTop: 7, maxWidth: '52ch' }}>
            {phase.blurb}
          </p>
          <div className="grid2" style={{ marginTop: 15 }}>
            <div>
              <h4 className="eyebrow" style={{ marginBottom: 9 }}>Deliverables</h4>
              <ul className={`ticklist ${phase.status === 'done' ? 'yes' : 'no'}`}>
                {(phase.deliverables || []).map((d, i) => (
                  <li key={i}><span className="mk">{phase.status === 'done' ? '✓' : '·'}</span><span>{d}</span></li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="eyebrow" style={{ marginBottom: 9 }}>Note</h4>
              <p style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>{phase.note}</p>
            </div>
          </div>
        </Panel>
      ) : null}
    </>
  );
}
