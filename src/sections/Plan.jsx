import React from 'react';
import { SectionHead, Panel, EvidenceChips } from '../components/ui.jsx';
import { fmtLong } from '../lib/format.js';
import { lower } from '../lib/labels.js';

export default function Plan({
  portal, plan, labels, themeById, scopedPriorities, scopeId,
  topTasks, goTheme, goTasks, findings,
}) {
  const scoped = scopeId !== 'all';
  const one = scopedPriorities[0];
  /* On a portal that has DECLARED this section borrowed, the client's name must
     not head it. A sample church's vision sitting under "PAACT · Strategic Plan
     2027-2031" attributes that plan to PAACT in the largest type on the page,
     and flatly contradicts the banner two inches above it. The banner is not
     enough on its own: the headline is what a reader takes in first. */
  const isSample = (portal.sampleSections || []).includes('plan');

  return (
    <>
      <SectionHead
        eyebrow={labels.plan}
        title={scoped ? `${labels.priorityShort} ${one.n} · ${one.title}`
                      : isSample ? `${labels.plan} · a sample from another engagement`
                      : `${portal.client_name} · ${portal.engagement_name}`}
      >
        {scoped
          ? `One ${lower(labels.priority)}, its ${labels.kpis}, and the ${lower(labels.initiatives)} beneath it.`
          : `${portal.adopted ? `Adopted ${fmtLong(portal.adopted)}. ` : ''}${plan.framing || ''}`}
      </SectionHead>

      {!scoped && plan.vision ? (
        <Panel style={{ borderLeft: '2px solid var(--accent)' }}>
          <h4 className="eyebrow" style={{ marginBottom: 9 }}>Vision</h4>
          <p className="vision">{plan.vision}</p>
        </Panel>
      ) : null}

      {findings?.meta?.total_sources ? (
        <div className="callout noprint" style={{ marginTop: 16 }}>
          <span aria-hidden="true">↗</span>
          <span>
            Every chip opens the finding it came from — counts are live from the{' '}
            {findings.meta.total_sources} sources in {labels.findings}.{' '}
            <strong style={{ fontWeight: 500, color: 'var(--ink)' }}>Export</strong> writes{' '}
            {scoped ? `this ${lower(labels.priority)}` : 'the whole plan'} to PDF, CSV or JSON.
          </span>
        </div>
      ) : null}

      {scopedPriorities.map((p) => (
        <section className="priority" key={p.id}>
          <div className="priority-head">
            <span className="pri-n">{labels.priorityShort} {p.n}</span>
            <div style={{ flex: '1 1 auto', minWidth: 0 }}>
              <h3>{p.title}</h3>
              {p.thesis ? <p className="thesis">{p.thesis}</p> : null}
              <EvidenceChips ids={p.evidence} label="Drawn from" themes={themeById} onOpen={goTheme} />
            </div>
          </div>

          {(p.kpis || []).length ? (
            <div className="kpibox">
              <h4 className="eyebrow" style={{ marginBottom: 7 }}>{labels.kpis} · how we will know</h4>
              {p.kpis.map((k, i) => (
                <div className="kpi" key={i}>
                  <span>{k.text} <span className="init-id">{k.init}</span></span>
                  <span className="k-now num">{k.now}</span>
                  <span className="k-tgt num">→ {k.target}</span>
                </div>
              ))}
            </div>
          ) : null}

          {(p.initiatives || []).map((o) => {
            const ts = topTasks.filter((t) => t.init === o.id);
            const done = ts.filter((t) => t.status === 'done').length;
            return (
              <div className="init" id={`init-${o.id}`} key={o.id}>
                <div className="init-head">
                  <span className="init-id">{o.id}</span>
                  <h4>{o.title}</h4>
                </div>
                {o.detail ? <p className="init-detail">{o.detail}</p> : null}
                <EvidenceChips ids={o.evidence} themes={themeById} onOpen={goTheme} />
                <div className="chips noprint">
                  <span className="chips-label">{labels.workplan}</span>
                  <button className="chip" onClick={() => goTasks(o.id)}>
                    <span className="cn">{done} of {ts.length} {lower(labels.tasks)} done</span>
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      ))}

      {!scoped && plan.track ? (
        <section className="priority">
          <div className="priority-head">
            <span className="pri-n">Track</span>
            <div style={{ flex: '1 1 auto', minWidth: 0 }}>
              <h3>{plan.track.title}</h3>
              <p className="thesis">{plan.track.note}</p>
              <EvidenceChips ids={plan.track.evidence} label="Drawn from" themes={themeById} onOpen={goTheme} />
            </div>
          </div>
          <div className="init">
            {(plan.track.milestones || []).map((m, i) => (
              <div className="track-mile" key={i}>
                <span className={`dot ${m.status}`} />
                <span>{m.label}</span>
                <span className="num mile-date">{m.date}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
