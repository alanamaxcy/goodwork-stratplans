/* The engagement document — section 01's content — and every way it changes.

   Pure functions only: a document in, a NEW document out, no React, no
   network. Section 01 is edited by several people on one consulting team, and
   the dangerous part of that is not the typing, it is two of them saving at
   once. Everything that decides what survives a collision lives here, where it
   is tested without a browser (test/engagement.mjs).

   ONE SHAPE. The file a client starts from (clients/<slug>/plan.js), the row
   in the database and the screen all carry the same object:

     { firm: { name, lead, analyst? }, convener, location, planHorizon,
       engagementStart, engagementEnd,
       phases: [{ id, number, name, start, end, status, purpose, note,
                  deliverables: [{ id, name, done }] }],
       scope: { scopeSummary, inScope[], outOfScope[], outcomes[], questions[],
                documents[], cadence: [{ id, rhythm, what, owner, next }],
                keyDates: [{ id, date, what }],
                consultingTeam: [{ id, name, org, role, owns }],
                clientTeam: [{ id, name, org, role, owns }],
                governance: [{ id, body, members, meets }] } }

   `status` is 'not_started' | 'in_progress' | 'done', or null where a portal
   never said — the timeline then reads the phase's state off its dates.
   `done` on a deliverable is true, false, or null for "not tracked", which the
   timeline will not count as "to do".

   EVERY ROW CARRIES AN ID. Not for display: for the merge. When two people
   save at once, "Gina ticked the third deliverable of Discovery" and "Alan
   renamed the fifth one" are only both keepable if the rows can be told apart
   by something other than their position, which the other person's edit may
   just have changed. Ids the file does not carry are derived from position
   (p2, p2-d3, c1, k4) so the document a client starts from is the same every
   time it is generated; rows added in the app get a random one. */

export const STATUSES = ['not_started', 'in_progress', 'done'];
export const STATUS_WORD = { not_started: 'Not started', in_progress: 'In progress', done: 'Done' };

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (v == null ? '' : String(v));
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/* Every spelling a portal has used, onto the three the app stores. */
const STATUS_IN = {
  not_started: 'not_started', 'not started': 'not_started', notstarted: 'not_started', next: 'not_started',
  planned: 'not_started', upcoming: 'not_started', todo: 'not_started', '': 'not_started',
  in_progress: 'in_progress', 'in progress': 'in_progress', inprogress: 'in_progress', active: 'in_progress',
  doing: 'in_progress', current: 'in_progress', underway: 'in_progress', started: 'in_progress',
  done: 'done', complete: 'done', completed: 'done', closed: 'done', finished: 'done',
};

function statusOf(raw) {
  if (raw == null) return null;
  const s = STATUS_IN[String(raw).trim().toLowerCase()];
  return s === undefined ? 'not_started' : s;
}

/* Keys a row carries that this file does not know about, so a field added to
   the database later is carried through an edit rather than silently dropped
   by the next save. `drop` lists the legacy aliases that were converted. */
function rest(o, known, drop = []) {
  const out = {};
  Object.keys(o).forEach((k) => {
    if (!known.includes(k) && !drop.includes(k)) out[k] = o[k];
  });
  return out;
}

/* Ids unique within one list. A collision is broken, never trusted: two rows
   with one id would merge into one. */
function uniqueIds(rows, fallback) {
  const seen = new Set();
  return rows.map((r, i) => {
    let id = str(r.id).trim() || fallback(i);
    if (seen.has(id)) {
      let n = 2;
      while (seen.has(`${id}-${n}`)) n += 1;
      id = `${id}-${n}`;
    }
    seen.add(id);
    return { ...r, id };
  });
}

const list = (v) => (Array.isArray(v) ? v.filter((x) => x != null) : []);
const text = (x) => (isObj(x) ? str(x.text ?? x.name ?? x.title ?? '') : str(x));

function member(m) {
  const o = isObj(m) ? m : { name: str(m) };
  return {
    id: o.id,
    name: str(o.name),
    org: str(o.org),
    role: str(o.role),
    owns: str(o.owns),
    ...rest(o, ['id', 'name', 'org', 'role', 'owns'], ['side']),
  };
}

/* Any engagement this product has ever stored, in the one shape above.
   Idempotent: canonical in, the same canonical out.

   It reads three dialects. The brief a client file is written in (`meta`
   beside the content, `client` at the top), the shape the older portals were
   seeded with (`n`, `blurb`, deliverables as strings, cadence as
   {label, detail, next}, one flat `team`), and its own. Nothing is invented:
   a deliverable that was a bare string has no tracked state and becomes
   `done: null`, not `done: false`. */
export function toCanonical(src) {
  const s = isObj(src) ? src : {};
  const meta = isObj(s.meta) ? s.meta : {};
  const pick = (k) => str(s[k] != null ? s[k] : meta[k]);
  const firm = isObj(s.firm) ? s.firm : {};
  const scope = isObj(s.scope) ? s.scope : {};

  const phases = uniqueIds(
    list(s.phases).filter(isObj).map((p, i) => {
      const number = Number.isFinite(p.number) ? p.number : Number.isFinite(p.n) ? p.n : i + 1;
      /* Derived from the phase NUMBER when the file gives no id, so p2 is
         Discovery in the generated SQL every time it is generated. */
      return { ...p, id: str(p.id).trim() || `p${number}`, number };
    }),
    (i) => `p${i + 1}`,
  ).map((p) => {
    const { id } = p;
    const deliverables = uniqueIds(
      list(p.deliverables).map((d) => {
        const o = isObj(d) ? d : null;
        return {
          id: o ? o.id : undefined,
          name: o ? str(o.name ?? o.title ?? o.text ?? '') : str(d),
          done: o && typeof o.done === 'boolean' ? o.done : null,
          ...(o ? rest(o, ['id', 'name', 'done'], ['title', 'text']) : {}),
        };
      }),
      (j) => `${id}-d${j + 1}`,
    );
    return {
      id,
      number: p.number,
      name: str(p.name),
      start: str(p.start).slice(0, 10),
      end: str(p.end).slice(0, 10),
      status: statusOf(p.status),
      purpose: str(p.purpose ?? p.blurb ?? ''),
      note: str(p.note),
      deliverables,
      ...rest(p, ['id', 'number', 'name', 'start', 'end', 'status', 'purpose', 'note', 'deliverables'], ['n', 'blurb']),
    };
  });

  /* One flat team list, from the older portals, is split by the side it was
     given — or, failing that, by whether the org IS the firm. The canonical
     shape never infers a side again: which list a person is in says it. */
  let consultingTeam = list(scope.consultingTeam).map(member);
  let clientTeam = list(scope.clientTeam).map(member);
  if (!consultingTeam.length && !clientTeam.length && list(scope.team).length) {
    list(scope.team).forEach((m) => {
      const o = isObj(m) ? m : { name: str(m) };
      const ours = o.side ? /consult/i.test(o.side) : (o.org && firm.name && o.org === firm.name);
      (ours ? consultingTeam : clientTeam).push(member(o));
    });
  }

  const out = {
    firm: {
      name: str(firm.name),
      lead: str(firm.lead),
      ...(firm.analyst ? { analyst: str(firm.analyst) } : {}),
      ...rest(firm, ['name', 'lead', 'analyst']),
    },
    convener: pick('convener'),
    location: pick('location'),
    planHorizon: pick('planHorizon'),
    engagementStart: pick('engagementStart').slice(0, 10),
    engagementEnd: pick('engagementEnd').slice(0, 10),
    phases,
    scope: {
      scopeSummary: str(scope.scopeSummary),
      inScope: list(scope.inScope).map(text),
      outOfScope: list(scope.outOfScope).map(text),
      outcomes: list(scope.outcomes).map(text),
      questions: list(scope.questions).map(text),
      documents: list(scope.documents).map(text),
      cadence: uniqueIds(list(scope.cadence).filter(isObj).map((c) => ({
        id: c.id,
        rhythm: str(c.rhythm || c.label),
        what: str(c.what || (c.rhythm ? '' : c.detail) || ''),
        owner: str(c.owner),
        next: str(c.next).slice(0, 10),
        ...rest(c, ['id', 'rhythm', 'what', 'owner', 'next'], ['label', 'detail']),
      })), (i) => `c${i + 1}`),
      keyDates: uniqueIds(list(scope.keyDates).filter(isObj).map((d) => ({
        id: d.id,
        date: str(d.date).slice(0, 10),
        what: str(d.what ?? d.label ?? ''),
        ...rest(d, ['id', 'date', 'what'], ['label']),
      })), (i) => `k${i + 1}`),
      consultingTeam: uniqueIds(consultingTeam, (i) => `ct${i + 1}`),
      clientTeam: uniqueIds(clientTeam, (i) => `cl${i + 1}`),
      governance: uniqueIds(list(scope.governance).filter(isObj).map((g) => ({
        id: g.id,
        body: str(g.body),
        members: str(g.members),
        meets: str(g.meets),
        ...rest(g, ['id', 'body', 'members', 'meets']),
      })), (i) => `g${i + 1}`),
      ...rest(scope, ['scopeSummary', 'inScope', 'outOfScope', 'outcomes', 'questions', 'documents',
        'cadence', 'keyDates', 'consultingTeam', 'clientTeam', 'governance'], ['team']),
    },
    ...rest(s, ['firm', 'convener', 'location', 'planHorizon', 'engagementStart', 'engagementEnd',
      'phases', 'scope'], ['meta', 'client']),
  };
  return out;
}

/* The engagement part of a client file (clients/<slug>/plan.js). The file
   also names the client and may carry a plan and a workplan, none of which
   belong in this document — and toCanonical() keeps keys it does not know, so
   handing it the whole file would copy the plan into the timeline's row. */
export function engagementOfFile(P) {
  const f = isObj(P) ? P : {};
  const pick = {};
  ['firm', 'meta', 'phases', 'scope', 'convener', 'location', 'planHorizon', 'engagementStart', 'engagementEnd']
    .forEach((k) => { if (f[k] !== undefined) pick[k] = f[k]; });
  return toCanonical(pick);
}

/* ---------- the two edits made straight from the timeline --------------- */

function mapPhase(eng, phaseId, fn) {
  let hit = false;
  const phases = (eng.phases || []).map((p) => {
    if (p.id !== phaseId) return p;
    const next = fn(p);
    if (next !== p) hit = true;
    return next;
  });
  /* The SAME object back when nothing matched, so a caller replaying an edit
     onto a document someone else has since changed can tell it was a no-op —
     the phase or the row it named has been deleted. */
  return hit ? { ...eng, phases } : eng;
}

/* Tick or untick one deliverable. The first box ticked in a phase that says it
   has not started also moves that phase to In progress: the timeline already
   reads it that way, and a stored status that disagrees with the screen is how
   the two drift apart. Unticking never moves a status back — that is a
   judgement, and it belongs to a person. */
export function tick(eng, phaseId, itemId, done) {
  return mapPhase(eng, phaseId, (p) => {
    let hit = false;
    const deliverables = (p.deliverables || []).map((d) => {
      if (d.id !== itemId || d.done === !!done) return d;
      hit = true;
      return { ...d, done: !!done };
    });
    if (!hit) return p;
    const status = done && p.status === 'not_started' ? 'in_progress' : p.status;
    return { ...p, deliverables, status };
  });
}

export function setStatus(eng, phaseId, status) {
  const s = status == null ? null : statusOf(status);
  return mapPhase(eng, phaseId, (p) => (p.status === s ? p : { ...p, status: s }));
}

/* An edit as data, so it can be queued, sent, and REPLAYED onto a newer copy
   of the document when somebody else saved first. */
export function applyOp(eng, op) {
  if (!eng || !op) return eng;
  if (op.kind === 'tick') return tick(eng, op.phase, op.item, op.done);
  if (op.kind === 'status') return setStatus(eng, op.phase, op.status);
  return eng;
}

/* ---------- the editor's helpers ----------------------------------------- */

/* Set a value at a path of keys and array indexes, copying only the spine. */
export function setIn(obj, path, value) {
  if (!path.length) return value;
  const [k, ...more] = path;
  const base = Array.isArray(obj) ? obj.slice() : { ...(obj || {}) };
  base[k] = setIn(obj == null ? undefined : obj[k], more, value);
  return base;
}

export function getIn(obj, path) {
  return path.reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export const insertAt = (arr, i, item) => [...arr.slice(0, i), item, ...arr.slice(i)];
export const removeAt = (arr, i) => arr.filter((_, j) => j !== i);
export function moveAt(arr, i, d) {
  const j = i + d;
  if (i < 0 || j < 0 || i >= arr.length || j >= arr.length) return arr;
  const next = arr.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/* A fresh row id, unique within `taken`. Random rather than positional: a
   positional id handed out on two screens at once is the same id for two
   different rows. */
export function newId(prefix, taken = []) {
  const used = new Set(taken.map((x) => (isObj(x) ? x.id : x)));
  for (;;) {
    const id = `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
    if (!used.has(id)) return id;
  }
}

export function blankPhase(eng) {
  const id = newId('ph', eng.phases || []);
  return { id, number: (eng.phases || []).length + 1, name: '', start: '', end: '', status: 'not_started', purpose: '', note: '', deliverables: [] };
}

/* ---------- tidy and check, before anything is saved --------------------- */

const trimmed = (v) => str(v).trim();

/* What Save writes: blank rows dropped, text trimmed, and phases numbered in
   date order — the order the timeline draws them in. Numbering follows the
   dates rather than a drag handle because a phase whose number disagrees with
   its place on the axis reads as a mistake, and there is no reason to offer a
   way to make one. Undated phases keep their place after the dated ones. */
export function tidy(eng) {
  const e = toCanonical(eng);
  const dated = (p) => ISO.test(p.start);
  const phases = e.phases
    .map((p) => ({
      ...p,
      name: trimmed(p.name),
      purpose: trimmed(p.purpose),
      note: trimmed(p.note),
      deliverables: p.deliverables
        .map((d) => ({ ...d, name: trimmed(d.name) }))
        .filter((d) => d.name),
    }))
    .filter((p) => p.name || p.start || p.end || p.purpose || p.note || p.deliverables.length)
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      if (dated(a.p) && dated(b.p) && a.p.start !== b.p.start) return a.p.start < b.p.start ? -1 : 1;
      if (dated(a.p) !== dated(b.p)) return dated(a.p) ? -1 : 1;
      return a.i - b.i;
    })
    .map(({ p }, i) => ({ ...p, number: i + 1 }));

  const strings = (xs) => xs.map(trimmed).filter(Boolean);
  const rows = (xs, keys) => xs
    .map((r) => {
      const o = { ...r };
      keys.forEach((k) => { o[k] = trimmed(o[k]); });
      return o;
    })
    .filter((r) => keys.some((k) => r[k]));

  return {
    ...e,
    firm: { ...e.firm, name: trimmed(e.firm.name), lead: trimmed(e.firm.lead) },
    convener: trimmed(e.convener),
    location: trimmed(e.location),
    planHorizon: trimmed(e.planHorizon),
    phases,
    scope: {
      ...e.scope,
      scopeSummary: trimmed(e.scope.scopeSummary),
      inScope: strings(e.scope.inScope),
      outOfScope: strings(e.scope.outOfScope),
      outcomes: strings(e.scope.outcomes),
      questions: strings(e.scope.questions),
      documents: strings(e.scope.documents),
      cadence: rows(e.scope.cadence, ['rhythm', 'what', 'owner', 'next']),
      keyDates: rows(e.scope.keyDates, ['date', 'what']),
      consultingTeam: rows(e.scope.consultingTeam, ['name', 'org', 'role', 'owns']),
      clientTeam: rows(e.scope.clientTeam, ['name', 'org', 'role', 'owns']),
      governance: rows(e.scope.governance, ['body', 'members', 'meets']),
    },
  };
}

function realDate(s) {
  if (!ISO.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(y, m - 1, d);
  return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d;
}

/* What would stop a save, in words for the person who has to fix it. Only
   things that would make the timeline wrong: a phase ending before it starts
   draws nothing, and a date that is not a date sorts nowhere. A blank row is
   not a problem — tidy() drops it. */
export function validate(eng) {
  const e = tidy(eng);
  const out = [];
  const dateErr = (label, v) => {
    if (v && !realDate(v)) out.push(`${label} is not a date.`);
  };
  dateErr('The engagement start', e.engagementStart);
  dateErr('The engagement end', e.engagementEnd);
  if (realDate(e.engagementStart) && realDate(e.engagementEnd) && e.engagementEnd < e.engagementStart) {
    out.push('The engagement ends before it starts.');
  }
  e.phases.forEach((p) => {
    const label = `Phase ${p.number}${p.name ? `, ${p.name}` : ''}`;
    if (!p.name) out.push(`${label} needs a name.`);
    dateErr(`${label}: the start`, p.start);
    dateErr(`${label}: the end`, p.end);
    if (realDate(p.start) && realDate(p.end) && p.end < p.start) out.push(`${label} ends before it starts.`);
  });
  e.scope.keyDates.forEach((d) => {
    if (!d.date) out.push(`The key date "${d.what}" has no date.`);
    else dateErr(`The key date "${d.what || d.date}"`, d.date);
  });
  e.scope.cadence.forEach((c) => {
    if (!c.what && !c.rhythm) out.push(`A cadence row (owner ${c.owner || 'blank'}) says neither how often nor what.`);
    dateErr(`The next date for "${c.rhythm || c.what}"`, c.next);
  });
  [['consultingTeam', 'consulting team'], ['clientTeam', 'client team']].forEach(([k, label]) => {
    e.scope[k].forEach((m) => {
      if (!m.name) out.push(`Someone in the ${label} has no name${m.role ? ` (role: ${m.role})` : ''}.`);
    });
  });
  e.scope.governance.forEach((g) => {
    if (!g.body) out.push(`A governance row has no name${g.members ? ` (members: ${g.members})` : ''}.`);
  });
  return out;
}

/* ---------- three-way merge ---------------------------------------------- */

/* Deep equality that ignores key order: two copies of one document that went
   through different code paths must not read as a change. */
export function same(a, b) {
  if (a === b) return true;
  if (Array.isArray(a)) {
    return Array.isArray(b) && a.length === b.length && a.every((x, i) => same(x, b[i]));
  }
  if (isObj(a) && isObj(b)) {
    const ka = Object.keys(a).filter((k) => a[k] !== undefined);
    const kb = Object.keys(b).filter((k) => b[k] !== undefined);
    return ka.length === kb.length && ka.every((k) => same(a[k], b[k]));
  }
  return false;
}

const byId = (arr) => arr.every((x) => isObj(x) && typeof x.id === 'string' && x.id);

function mergeById(base, mine, theirs, prefer, path, conflicts) {
  const B = new Map(base.map((x) => [x.id, x]));
  const M = new Map(mine.map((x) => [x.id, x]));
  const T = new Map(theirs.map((x) => [x.id, x]));
  const ids = (a) => a.map((x) => x.id);
  const kept = new Map();

  new Set([...ids(base), ...ids(mine), ...ids(theirs)]).forEach((id) => {
    const at = [...path, id];
    const b = B.get(id);
    const m = M.get(id);
    const t = T.get(id);
    if (m && t) {
      kept.set(id, merge3(b, m, t, prefer, at, conflicts));
    } else if (b && m && !t) {
      /* They deleted it. If I changed nothing in it, it goes; if I did, the two
         edits genuinely disagree. */
      if (same(m, b)) return;
      conflicts.push(at);
      if (prefer === 'mine') kept.set(id, m);
    } else if (b && !m && t) {
      if (same(t, b)) return;
      conflicts.push(at);
      if (prefer !== 'mine') kept.set(id, t);
    } else if (!b && m) {
      kept.set(id, m);
    } else if (!b && t) {
      kept.set(id, t);
    }
  });

  /* ORDER: whoever rearranged the list leads — mine if my list of ids differs
     from the base, otherwise theirs — and every surviving row the leader's
     list does not hold is slotted in after the row it followed on its own
     side. A reorder is never a conflict: nothing is lost by it. */
  const mineMoved = !same(ids(mine), ids(base));
  const lead = (mineMoved ? ids(mine) : ids(theirs)).filter((id) => kept.has(id));
  const order = lead.slice();
  [mineMoved ? ids(theirs) : ids(mine), ids(base)].forEach((side) => {
    side.forEach((id, i) => {
      if (!kept.has(id) || order.includes(id)) return;
      const prev = side.slice(0, i).reverse().find((x) => order.includes(x));
      order.splice(prev === undefined ? 0 : order.indexOf(prev) + 1, 0, id);
    });
  });
  return order.map((id) => kept.get(id));
}

/* base: the document as this person first saw it. mine: what they want to
   save. theirs: what the database holds now. Anything only one side changed is
   taken from that side; where both changed the SAME thing differently, it is a
   conflict, recorded by path, and `prefer` decides which survives.

   Lists of rows merge row by row (by id), so a tick on one deliverable and a
   rename of another are both kept. Lists of plain strings — in scope, out of
   scope, outcomes, questions, documents — merge whole: a string carries no
   identity to match on, and guessing which of two edited sentences was "the
   same line" would be worse than asking. */
export function merge3(base, mine, theirs, prefer, path, conflicts) {
  if (same(mine, theirs)) return mine;
  if (same(mine, base)) return theirs;
  if (same(theirs, base)) return mine;
  if (isObj(mine) && isObj(theirs)) {
    const b = isObj(base) ? base : {};
    const out = {};
    [...new Set([...Object.keys(b), ...Object.keys(mine), ...Object.keys(theirs)])].forEach((k) => {
      const v = merge3(b[k], mine[k], theirs[k], prefer, [...path, k], conflicts);
      if (v !== undefined) out[k] = v;
    });
    return out;
  }
  if (Array.isArray(mine) && Array.isArray(theirs) && byId(mine) && byId(theirs)
      && (base === undefined || (Array.isArray(base) && byId(base)))) {
    return mergeById(Array.isArray(base) ? base : [], mine, theirs, prefer, path, conflicts);
  }
  conflicts.push(path);
  return prefer === 'mine' ? mine : theirs;
}

export function merge(base, mine, theirs, prefer = 'theirs') {
  const conflicts = [];
  const value = merge3(base, mine, theirs, prefer, [], conflicts);
  return { value, conflicts };
}

/* ---------- saying what collided, in words ------------------------------- */

const FIELD = {
  name: 'name', start: 'start date', end: 'end date', status: 'status', purpose: 'purpose', note: 'note',
  deliverables: 'deliverables', done: 'ticked or not', rhythm: 'frequency', what: 'description',
  owner: 'owner', next: 'next date', date: 'date', org: 'organisation', role: 'role', owns: 'owns',
  body: 'name', members: 'members', meets: 'meets', lead: 'lead',
};
const LIST = {
  inScope: 'In scope', outOfScope: 'Out of scope', outcomes: 'Expected outcomes',
  questions: 'Questions this process answers', documents: 'Documents under review',
  cadence: 'Cadence', keyDates: 'Key dates', consultingTeam: 'Consulting team',
  clientTeam: 'Client team', governance: 'Governance', scopeSummary: 'Scope summary',
};
const TOP = {
  engagementStart: 'Engagement start', engagementEnd: 'Engagement end', planHorizon: 'Plan horizon',
  convener: 'Convener', location: 'Location', firm: 'Firm', phases: 'Phases',
};

/* "Phase 2, Discovery — a deliverable", "Key dates — Impact Report expected".
   Read against whichever copy still has the row, so a row one side deleted is
   still named. */
export function describePath(path, ...docs) {
  const find = (arrPath, id) => {
    for (const d of docs) {
      const arr = getIn(d, arrPath);
      const hit = Array.isArray(arr) ? arr.find((x) => isObj(x) && x.id === id) : null;
      if (hit) return hit;
    }
    return null;
  };
  const [a, b, c, d, e] = path;
  if (a === 'phases') {
    if (b === undefined) return 'Phases';
    const p = find(['phases'], b);
    const label = p ? `Phase ${p.number}${p.name ? `, ${p.name}` : ''}` : 'A phase';
    if (c === undefined) return label;
    if (c === 'deliverables') {
      if (d === undefined) return `${label} — deliverables`;
      /* Every copy of the phase, not just the first: the row may survive only
         on the side that did not delete it. */
      let it = null;
      docs.forEach((doc) => {
        const ph = (doc?.phases || []).find((x) => x && x.id === b);
        it = it || (ph?.deliverables || []).find((x) => x && x.id === d) || null;
      });
      return `${label} — "${it?.name || 'a deliverable'}"${e === 'done' ? ' (ticked)' : ''}`;
    }
    return `${label} — ${FIELD[c] || c}`;
  }
  if (a === 'scope') {
    const name = LIST[b] || b;
    if (c === undefined) return name;
    const row = find(['scope', b], c);
    const what = row ? (row.name || row.what || row.body || row.rhythm || row.date || '') : '';
    return `${name} — ${what || 'a row'}${d ? ` (${FIELD[d] || d})` : ''}`;
  }
  if (a === 'firm') return `Firm — ${FIELD[b] || b || 'details'}`;
  return TOP[a] || String(a || 'The engagement');
}
