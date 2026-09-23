import React from 'react';
import { Modal } from './ui.jsx';
import { STATUS_LABEL, slugify } from '../lib/format.js';
import { lower } from '../lib/labels.js';

function toCSV(rows) {
  return rows
    .map((r) => r.map((c) => {
      const v = String(c ?? '');
      return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(','))
    .join('\r\n');
}

function save(filename, text, mime) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export default function ExportMenu({
  portal, labels, scopedPriorities, scopeId, tasks, subsOf, themeById, onClose, now,
}) {
  const one = scopeId === 'all' ? null : scopedPriorities[0];
  const label = one ? `${labels.priorityShort} ${one.n} · ${one.title}` : 'the whole plan';
  /* A file outlives the banner. These artifacts leave the room, get forwarded,
     and get opened next month with no screen around them — so on a section the
     portal has declared borrowed, the client's name must not be stamped on the
     filename or inside the payload, and the artifact has to say what it is by
     itself. */
  const isSample = (portal.sampleSections || []).includes('plan');
  const slug = slugify(
    isSample ? `sample-${one ? one.id : 'plan'}` : `${portal.client_name}-${one ? one.id : 'plan'}`,
  );

  const rows = [
    ['id', 'parent', labels.priority.toLowerCase(), labels.initiative.toLowerCase(),
     'initiative_title', labels.task.toLowerCase(), 'owner', 'start', 'due', 'status', 'note'],
  ];
  scopedPriorities.forEach((p) => {
    (p.initiatives || []).forEach((o) => {
      tasks.filter((t) => t.init === o.id).forEach((t) => {
        rows.push([t.id, t.parent || '', `${labels.priorityShort} ${p.n} · ${p.title}`,
                   o.id, o.title, t.title, t.owner, t.start, t.due, STATUS_LABEL[t.status], t.note]);
      });
    });
  });

  const json = () => JSON.stringify({
    ...(isSample
      ? { sample: true,
          note: `Illustrative content from another engagement, shown as an example. Not ${portal.client_name}'s plan.` }
      : { client: { name: portal.client_name, engagement: portal.engagement_name } }),
    exported: now,
    scope: one ? one.title : 'whole plan',
    labels,
    priorities: scopedPriorities.map((p) => ({
      id: p.id, n: p.n, title: p.title, thesis: p.thesis, kpis: p.kpis,
      evidence: (p.evidence || []).map((e) => {
        const t = themeById[e];
        return t ? { id: t.id, category: t.cat, name: t.name, sources: t.n } : { id: e };
      }),
      initiatives: (p.initiatives || []).map((o) => ({
        id: o.id, title: o.title, detail: o.detail, evidence: o.evidence,
        tasks: tasks.filter((t) => t.init === o.id && !t.parent).map((t) => ({
          id: t.id, title: t.title, owner: t.owner, start: t.start, due: t.due,
          status: t.status, note: t.note,
          subtasks: subsOf(t.id).map((s) => ({ id: s.id, title: s.title, status: s.status })),
        })),
      })),
    })),
  }, null, 2);

  return (
    <Modal label="Export" onClose={onClose}>
      <span className="eyebrow">Export</span>
      <h3 style={{ marginTop: 3 }}>Export</h3>
      <p style={{ fontSize: 13.5, color: 'var(--ink-2)', marginTop: 8 }}>
        Scoped to <strong style={{ color: 'var(--ink)', fontWeight: 500 }}>{label}</strong>, from the bar above.
      </p>
      {isSample ? (
        <p className="expsample">
          <strong>Sample content.</strong> This {lower(labels.plan)} belongs to another
          engagement, not {portal.client_name}. Exported files are named and labelled as
          samples so they cannot be mistaken for it later.
        </p>
      ) : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 16 }}>
        <button className="ghost expopt" onClick={() => { onClose(); setTimeout(() => window.print(), 50); }}>
          <strong>Board packet (PDF)</strong><br />
          <span>Opens the print dialog. The plan formatted for print, without navigation.</span>
        </button>
        <button className="ghost expopt" onClick={() => { save(`${slug}-workplan.csv`, toCSV(rows), 'text/csv'); onClose(); }}>
          <strong>{labels.workplan} (CSV)</strong><br />
          <span>{labels.tasks} and {lower(labels.subtasks)} with owners, dates and status. Imports into Asana or ClickUp.</span>
        </button>
        <button className="ghost expopt" onClick={() => { save(`${slug}.json`, json(), 'application/json'); onClose(); }}>
          <strong>Everything (JSON)</strong><br />
          <span>{labels.priorities}, {labels.kpis}, {lower(labels.initiatives)}, {lower(labels.tasks)}, and the findings each one cites.</span>
        </button>
      </div>
      <p className="savenote">Files are named {slug}-*</p>
      <div style={{ marginTop: 14, textAlign: 'right' }}>
        <button className="ghost" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}
