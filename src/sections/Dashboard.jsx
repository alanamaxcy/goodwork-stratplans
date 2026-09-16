import React, { useState } from 'react';
import { SectionHead, Tile, HBars, StatusLegend } from '../components/ui.jsx';
import { STACK, STATUS_LABEL, STATUS_VAR, MON, MONL, counts, isOverdue, pct } from '../lib/format.js';
import { ownerLoad } from './Workplan.jsx';

function monthBuckets(rows) {
  const by = {};
  rows.forEach((t) => {
    if (!t.due) return;
    const k = t.due.slice(0, 7);
    const m = (by[k] = by[k] || { key: k, total: 0, done: 0, doing: 0, next: 0, blocked: 0 });
    m.total++;
    m[t.status] = (m[t.status] || 0) + 1;
  });
  return Object.keys(by).sort().map((k) => by[k]);
}

/* Tasks due per month, stacked by status, with this month marked.
   Only data the workplan actually holds — there are no completion timestamps,
   so there is no burn-up line that could be drawn honestly. */
function DueChart({ rows, now }) {
  const ms = monthBuckets(rows);
  if (!ms.length) return <p style={{ color: 'var(--ink-2)', fontSize: 13 }}>No dated tasks in scope.</p>;

  const W = 660, H = 196, padL = 32, padB = 40, padT = 10;
  const max = Math.max(...ms.map((m) => m.total));
  const plotH = H - padB - padT;
  const step = (W - padL - 10) / ms.length;
  const bw = Math.min(step - 9, 38);
  const nowKey = now.slice(0, 7);

  const ticks = [...new Set([0, Math.round(max / 2), max])];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img"
         aria-label="Tasks due per month, stacked by status. This month is shaded.">
      {ms.map((m, i) => {
        if (m.key !== nowKey) return null;
        const x = padL + i * step + (step - bw) / 2;
        return <rect key="shade" x={x - 5} y={padT} width={bw + 10} height={plotH}
                     fill="var(--accent)" opacity="0.08" rx="3" />;
      })}
      {ticks.map((v) => {
        const y = padT + plotH - (v / max) * plotH;
        return (
          <g key={v}>
            <line x1={padL} y1={y} x2={W - 6} y2={y} stroke="var(--rule-2)" strokeWidth="1" />
            <text x={padL - 8} y={y + 4} textAnchor="end" fontFamily="ui-monospace,monospace"
                  fontSize="10" fill="var(--ink-3)">{v}</text>
          </g>
        );
      })}
      {ms.map((m, i) => {
        const x = padL + i * step + (step - bw) / 2;
        let y = padT + plotH;
        const seg = [];
        STACK.forEach((k) => {
          if (!m[k]) return;
          let h = (m[k] / max) * plotH - 2;
          if (h < 1.5) h = 1.5;
          y -= h;
          seg.push(
            <rect key={k} x={x} y={y} width={bw} height={h} rx="2" fill={`var(${STATUS_VAR[k]})`}>
              <title>{`${MONL[+m.key.slice(5) - 1]} ${m.key.slice(0, 4)} · ${STATUS_LABEL[k]}: ${m[k]}`}</title>
            </rect>,
          );
          y -= 2;
        });
        return (
          <g key={m.key}>
            {seg}
            <text x={x + bw / 2} y={padT + plotH + 15} textAnchor="middle"
                  fontFamily="ui-monospace,monospace" fontSize="9.5"
                  fill={m.key === nowKey ? 'var(--ink)' : 'var(--ink-3)'}>
              {MON[+m.key.slice(5) - 1]}
            </text>
            {i === 0 || m.key.slice(5) === '01' ? (
              <text x={x + bw / 2} y={padT + plotH + 28} textAnchor="middle"
                    fontFamily="ui-monospace,monospace" fontSize="9" fill="var(--ink-3)">
                {m.key.slice(0, 4)}
              </text>
            ) : null}
          </g>
        );
      })}
      <line x1={padL} y1={padT + plotH} x2={W - 6} y2={padT + plotH} stroke="var(--rule)" strokeWidth="1" />
    </svg>
  );
}

export default function Dashboard({
  labels, plan, scopedTop, scopedPriorities, scopeId, tasks, topTasks, priorityOf, inScope, now,
}) {
  const [table, setTable] = useState(false);
  const c = counts(scopedTop, now);

  const priRows = scopedPriorities.map((p) => {
    const ts = topTasks.filter((t) => priorityOf[t.init] === p);
    const pc = counts(ts, now);
    pc.name = `${labels.priorityShort.charAt(0)}${p.n} · ${p.title}`;
    return pc;
  });
  const maxPri = Math.max(1, ...priRows.map((r) => r.total));

  const owners = ownerLoad(scopedTop, now);
  const maxOwn = Math.max(1, ...owners.map((r) => r.total));

  const subs = tasks.filter((t) => t.parent && inScope(t));
  const subDone = subs.filter((t) => t.status === 'done').length;
  const kpis = scopedPriorities.reduce((a, p) => a.concat(p.kpis || []), []);

  const horizon = new Date(now);
  horizon.setMonth(horizon.getMonth() + 3);
  const horizonStr = horizon.toISOString().slice(0, 10);
  const soon = scopedTop.filter((t) => t.status !== 'done' && t.due && t.due >= now && t.due <= horizonStr).length;

  const one = scopeId === 'all' ? null : scopedPriorities[0];

  return (
    <>
      <SectionHead
        eyebrow={labels.dashboard}
        title={one ? `${labels.priorityShort} ${one.n} · ${one.title}` : 'Where the year actually stands'}
      >
        Read this before the quarterly review. Everything here obeys the scope picker above.
      </SectionHead>

      <div className="tiles">
        <Tile value={`${pct(c.done, c.total)}%`} label="Complete" />
        <Tile value={c.late} label="Past due" alert={c.late > 0} />
        <Tile value={soon} label="Due in 3 months" />
        <Tile value={`${subDone}/${subs.length}`} label={`${labels.subtasks} done`} />
      </div>

      <div className="charts" style={{ marginTop: 13 }}>
        <div className="chart wide">
          <h4>{labels.tasks} due per month</h4>
          <p className="csub">Where the year is overloaded. The shaded column is this month.</p>
          <div className="chartbody"><DueChart rows={scopedTop} now={now} /></div>
          <StatusLegend />
        </div>

        <div className="chart">
          <h4>Completion by {labels.priority.toLowerCase()}</h4>
          <p className="csub">Bar length is how many {labels.tasks.toLowerCase()} it carries.</p>
          <div className="chartbody" style={{ marginTop: 9 }}><HBars rows={priRows} max={maxPri} /></div>
          <StatusLegend />
          <button className="ghost" style={{ marginTop: 11 }} onClick={() => setTable((v) => !v)}>
            {table ? 'Hide table' : 'Show as table'}
          </button>
          {table ? (
            <div className="tablewrap">
              <table className="dtable">
                <caption className="sr">Counts by {labels.priority.toLowerCase()}</caption>
                <thead>
                  <tr>
                    <th>{labels.priority}</th>
                    {STACK.map((k) => <th key={k}>{STATUS_LABEL[k]}</th>)}
                    <th>Past due</th>
                  </tr>
                </thead>
                <tbody>
                  {priRows.map((r) => (
                    <tr key={r.name}>
                      <td>{r.name}</td>
                      {STACK.map((k) => <td className="n" key={k}>{r[k]}</td>)}
                      <td className="n">{r.late}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        <div className="chart">
          <h4>Load by owner</h4>
          <p className="csub">Sorted by what is past due, then what is still open.</p>
          <div className="chartbody" style={{ marginTop: 9 }}><HBars rows={owners} max={maxOwn} /></div>
          <StatusLegend />
          <p className="savenote">• marks an owner with something past due.</p>
        </div>

        {kpis.length ? (
          <div className="chart wide">
            <h4>{labels.kpis} · {kpis.length} in scope</h4>
            <p className="csub">
              The plan’s own measures. They move quarterly, not weekly — read here, edited in {labels.plan.toLowerCase()}.
            </p>
            <div className="tablewrap">
              <table className="dtable">
                <thead>
                  <tr><th>Measure</th><th>{labels.initiative}</th><th>Now</th><th>Target</th></tr>
                </thead>
                <tbody>
                  {kpis.map((k, i) => (
                    <tr key={i}>
                      <td>{k.text}</td>
                      <td className="num" style={{ color: 'var(--ink-3)' }}>{k.init}</td>
                      <td className="num">{k.now}</td>
                      <td className="num" style={{ color: 'var(--ink-3)' }}>{k.target}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
