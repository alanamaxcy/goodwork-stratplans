import React, { useMemo, useState } from 'react';
import { SectionHead } from '../components/ui.jsx';
import { pct } from '../lib/format.js';
import { lower } from '../lib/labels.js';

export default function Findings({
  findings, labels, scopeId, openTheme, setOpenTheme, goInitiative, drives, CATNAME,
}) {
  const [q, setQ] = useState('');
  const [showAll, setShowAll] = useState(false);
  const themes = findings.themes || [];
  const quotes = findings.quotes || [];
  const meta = findings.meta || {};

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return themes
      .filter((t) => {
        if (scopeId !== 'ALL' && t.cat !== scopeId) return false;
        if (!needle) return true;
        if (t.name.toLowerCase().includes(needle) || (t.summary || '').toLowerCase().includes(needle)) return true;
        return (t.more || []).some((i) => (quotes[i]?.[1] || '').toLowerCase().includes(needle));
      })
      .sort((a, b) => b.n - a.n);
  }, [themes, quotes, q, scopeId]);

  if (openTheme) {
    const t = themes.find((x) => x.id === openTheme);
    if (!t) return null;
    const d = drives[t.id] || [];
    const shown = showAll ? t.more : (t.more || []).slice(0, 6);
    const rank = themes.filter((x) => x.cat === t.cat).length;
    return (
      <>
        <button className="backbtn" onClick={() => { setOpenTheme(null); setShowAll(false); }}>← All themes</button>
        <div className="theme-detail" style={{ color: `var(--${t.cat.toLowerCase()})` }}>
          <span className="eyebrow" style={{ color: `var(--${t.cat.toLowerCase()})` }}>
            {CATNAME[t.cat]} · rank {t.rank} of {rank}
          </span>
          <h3 style={{ color: 'var(--ink)' }}>{t.name}</h3>
          <div className="statline">
            <span className="stat">
              <span className="sv" style={{ color: `var(--${t.cat.toLowerCase()})` }}>{t.n}</span>
              <span className="sl">of {t.max} sources</span>
            </span>
            <span className="stat"><span className="sv" style={{ color: 'var(--ink)' }}>{t.nSurvey}</span><span className="sl">survey</span></span>
            <span className="stat"><span className="sv" style={{ color: 'var(--ink)' }}>{t.nQual}</span><span className="sl">of {t.maxQual} interviews</span></span>
          </div>
          <p style={{ color: 'var(--ink-2)', maxWidth: '66ch', fontSize: 14.5 }}>{t.summary}</p>

          {d.length ? (
            <div className="chips noprint">
              <span className="chips-label">Drives</span>
              {d.map((x, i) => (
                <button className="chip" key={i} onClick={() => x.kind === 'init' && goInitiative(x.id)}>
                  <span className="ck" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                    {x.kind === 'init' ? x.id : '↗'}
                  </span>
                  <span className="cn">{x.title}</span>
                </button>
              ))}
            </div>
          ) : null}

          {(t.pull || []).length ? (
            <>
              <h4 className="eyebrow" style={{ margin: '22px 0 0' }}>In their words</h4>
              <div className="quotes">
                {t.pull.map((quote, i) => <blockquote className="quote" key={i}>“{quote}”</blockquote>)}
              </div>
            </>
          ) : null}

          {(t.more || []).length ? (
            <>
              <h4 className="eyebrow" style={{ margin: '24px 0 2px' }}>
                Survey responses coded to this theme · {t.moreTotal}
              </h4>
              {shown.map((i) => (
                <div className="resp" key={i}>
                  <div className="rp">{quotes[i]?.[0]}</div>
                  <div className="rt">{quotes[i]?.[1]}</div>
                </div>
              ))}
              {t.more.length > 6 ? (
                <button className="morebtn" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? 'Show fewer' : `Show all ${t.more.length} responses`}
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </>
    );
  }

  return (
    <>
      <SectionHead eyebrow={labels.findings} title={`What ${meta.total_sources || themes.length} sources actually said`}>
        {meta.total_survey ? `${meta.total_survey} survey responses and ${meta.qual_breakdown}, coded into ` : 'Coded into '}
        {themes.length} themes. The number on each row is how many separate sources raised it.
      </SectionHead>

      <div className="filterbar">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)}
               placeholder="Search themes and responses…" />
      </div>

      {list.length ? (
        <div className="themelist">
          {list.map((t) => {
            const w = Math.round((t.n / t.max) * 100);
            const d = drives[t.id];
            return (
              <button className="themerow" key={t.id} style={{ color: `var(--${t.cat.toLowerCase()})` }}
                      onClick={() => { setOpenTheme(t.id); setShowAll(false); window.scrollTo(0, 0); }}>
                <span className={`tk k-${t.cat}`}>{t.cat}</span>
                <span style={{ color: 'var(--ink)', minWidth: 0 }}>
                  <span className="tn">{t.name}</span>
                  <span className="tsub">
                    {t.interview ? 'survey + interviews' : 'survey only'}
                    {d ? ` · drives ${d.length} ${d.length > 1 ? lower(labels.initiatives) : lower(labels.initiative)}` : ''}
                  </span>
                </span>
                <span className="bar" style={{ width: `${Math.max(w, 3)}%` }}>
                  <i className="b-survey" style={{ width: `${pct(t.nSurvey, t.n)}%` }} />
                  <i className="b-qual" style={{ width: `${pct(t.nQual, t.n)}%` }} />
                </span>
                <span>
                  <span className="tc num" style={{ color: 'var(--ink)' }}>{t.n}</span>
                  <span className="tcl">sources</span>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="panel"><p style={{ color: 'var(--ink-2)' }}>No themes match “{q}”.</p></div>
      )}
    </>
  );
}
