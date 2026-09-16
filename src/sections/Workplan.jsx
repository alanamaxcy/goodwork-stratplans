import React, { useMemo, useState } from 'react';
import { SectionHead, Tile, StatusBar, Dot } from '../components/ui.jsx';
import { STATUS_ORDER, STATUS_LABEL, STACK, counts, fmt, isOverdue, pct } from '../lib/format.js';

export function ownerLoad(rows, now) {
  const by = {};
  rows.forEach((t) => {
    const name = t.owner || 'Unassigned';
    const o = (by[name] = by[name] || { name, total: 0, done: 0, doing: 0, next: 0, blocked: 0, late: 0, open: 0 });
    o.total++;
    o[t.status] = (o[t.status] || 0) + 1;
    if (isOverdue(t, now)) o.late++;
    if (t.status !== 'done') o.open++;
  });
  return Object.values(by).sort((a, b) => b.late - a.late || b.open - a.open || a.name.localeCompare(b.name));
}

function TaskRow({ t, isSub, subs, expanded, toggle, onOpen, onCycle, canEdit, now }) {
  const late = isOverdue(t, now);
  const doneSubs = subs.filter((s) => s.status === 'done').length;
  return (
    <>
      <div className={`task ${t.status}${late ? ' overdue' : ''}${isSub ? ' sub' : ''}`}>
        {subs.length ? (
          <button className="twist" aria-expanded={expanded} onClick={() => toggle(t.id)}
                  aria-label={`${expanded ? 'Collapse' : 'Expand'} subtasks of ${t.title}`}>
            <span className="tw-ico">▶</span>
          </button>
        ) : <span />}
        <button className="statusbtn" disabled={!canEdit} title={STATUS_LABEL[t.status]}
                aria-label={`${STATUS_LABEL[t.status]}${canEdit ? ' — click to advance' : ''}`}
                onClick={() => onCycle(t)}>
          <Dot status={t.status} small={isSub} late={late} />
        </button>
        <span className="tid">{t.id}</span>
        <button className="tt" onClick={() => onOpen(t.id)}>
          {t.title}
          {subs.length ? <span className="subcount num">{doneSubs}/{subs.length}</span> : null}
        </button>
        <span className="town">{t.owner}</span>
        <span className="tdue num">{fmt(t.due)}</span>
      </div>
      {expanded
        ? subs.map((s) => (
            <TaskRow key={s.id} t={s} isSub subs={[]} expanded={false} toggle={toggle}
                     onOpen={onOpen} onCycle={onCycle} canEdit={canEdit} now={now} />
          ))
        : null}
    </>
  );
}

export default function Workplan({
  labels, plan, scopedTop, scopedPriorities, scopeId, tasks, subsOf, inScope,
  canEdit, now, onSave, setOpenTask,
}) {
  const [filter, setFilter] = useState('all');
  const [group, setGroup] = useState('initiative');
  const [expanded, setExpanded] = useState({});
  const toggle = (id) => setExpanded((e) => ({ ...e, [id]: !e[id] }));

  const c = counts(scopedTop, now);
  const subCount = tasks.filter((t) => t.parent && inScope(t)).length;

  const visible = useMemo(() => {
    if (filter === 'late') return scopedTop.filter((t) => isOverdue(t, now));
    if (filter === 'open') return scopedTop.filter((t) => t.status !== 'done');
    if (filter === 'quarter') {
      const q = new Date(now);
      const end = new Date(q.getFullYear(), q.getMonth() + 3, 0).toISOString().slice(0, 10);
      return scopedTop.filter((t) => t.due && t.due >= now && t.due <= end);
    }
    return scopedTop;
  }, [scopedTop, filter, now]);

  const cycle = (t) => onSave(t.id, { status: STATUS_ORDER[(STATUS_ORDER.indexOf(t.status) + 1) % STATUS_ORDER.length] });
  /* `expanded` is deliberately NOT in here: it is passed per row as a boolean.
     Spreading the whole map after it would overwrite that boolean with a truthy
     object and open every task at once. */
  const rowProps = { toggle, onOpen: setOpenTask, onCycle: cycle, canEdit, now };

  const priority = scopeId === 'all' ? null : (plan.priorities || []).find((p) => p.id === scopeId);

  let groups;
  if (group === 'initiative') {
    groups = scopedPriorities.map((p) => {
      const blocks = (p.initiatives || []).map((o) => {
        const ts = visible.filter((t) => t.init === o.id);
        if (!ts.length) return null;
        const all = scopedTop.filter((t) => t.init === o.id);
        const ic = counts(all, now);
        return (
          <div className="initgroup" key={o.id} id={`ig-${o.id}`}>
            <div className="initgroup-head">
              <span className="ig-id">{o.id}</span>
              <span className="ig-t">{o.title}</span>
              <span className="ig-p">
                <StatusBar c={ic} total={all.length} className="minitrack" />
                <span className="ig-pct num">{ic.done}/{all.length}</span>
              </span>
            </div>
            {ts.map((t) => <TaskRow key={t.id} t={t} subs={subsOf(t.id)} expanded={!!expanded[t.id]} {...rowProps} />)}
          </div>
        );
      }).filter(Boolean);
      if (!blocks.length) return null;
      return (
        <div key={p.id}>
          {scopeId === 'all' ? (
            <div className="prihead">
              <span className="ph-n">{labels.priorityShort} {p.n}</span>
              <h3>{p.title}</h3>
            </div>
          ) : null}
          {blocks}
        </div>
      );
    }).filter(Boolean);
  } else {
    groups = ownerLoad(visible, now).map((o) => (
      <div className="initgroup" key={o.name}>
        <div className="initgroup-head">
          <span className="ig-t">{o.name}</span>
          {o.late ? <span className="ig-id" style={{ color: 'var(--stop)' }}>{o.late} past due</span> : null}
          <span className="ig-p">
            <StatusBar c={o} total={o.total} className="minitrack" />
            <span className="ig-pct num">{o.done}/{o.total}</span>
          </span>
        </div>
        {visible.filter((t) => (t.owner || 'Unassigned') === o.name)
          .map((t) => <TaskRow key={t.id} t={t} subs={subsOf(t.id)} expanded={!!expanded[t.id]} {...rowProps} />)}
      </div>
    ));
  }

  const filters = [
    ['all', `All ${c.total}`],
    ['open', `Open ${c.total - c.done}`],
    ['late', `Past due ${c.late}`],
    ['quarter', 'Next 3 months'],
  ];

  return (
    <>
      <SectionHead
        eyebrow={labels.workplan}
        title={priority ? `${labels.priorityShort} ${priority.n} · ${priority.title}` : labels.workplan}
      >
        {c.total} {labels.tasks.toLowerCase()} and {subCount} {labels.subtasks.toLowerCase()}, each under
        an {labels.initiative.toLowerCase()} in {labels.plan.toLowerCase()}.{' '}
        {canEdit
          ? 'Click a status dot to advance it, or open a task for owner, date, subtasks and notes.'
          : 'This view is read-only. Ask for a staff account to make changes.'}
      </SectionHead>

      <div className="tiles">
        <Tile value={c.done} label="Done" />
        <Tile value={c.doing} label="In progress" />
        <Tile value={c.late} label="Past due" alert={c.late > 0} />
        <Tile value={c.next + c.blocked} label="Not started" />
      </div>

      <div className="progressbig">
        <div className="pb-row">
          <span className="eyebrow">Completion</span>
          <span className="num" style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--ink-2)' }}>
            {pct(c.done, c.total)}% · {c.done} of {c.total}
          </span>
        </div>
        <StatusBar c={c} total={c.total} />
      </div>

      <div className="wpbar">
        {filters.map(([v, label]) => (
          <button key={v} className="ghost" aria-pressed={filter === v} onClick={() => setFilter(v)}>{label}</button>
        ))}
        <span style={{ flex: '1 1 auto' }} />
        <span className="eyebrow">Group by</span>
        <button className="ghost" aria-pressed={group === 'initiative'} onClick={() => setGroup('initiative')}>
          {labels.initiative}
        </button>
        <button className="ghost" aria-pressed={group === 'owner'} onClick={() => setGroup('owner')}>Owner</button>
      </div>

      {groups.length ? groups : (
        <div className="panel"><p style={{ color: 'var(--ink-2)' }}>Nothing matches this filter.</p></div>
      )}

      <div className="legend">
        {STACK.map((k) => <span key={k}><Dot status={k} /> {STATUS_LABEL[k]}</span>)}
        <span><Dot status="next" late /> Past due</span>
      </div>
    </>
  );
}
