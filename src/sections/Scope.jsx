import React, { useCallback, useMemo, useState } from 'react';
import { SectionHead, Panel, Dot } from '../components/ui.jsx';
import { fmt, MON } from '../lib/format.js';
import { ownerLoad } from './Workplan.jsx';

/* ---------------------------------------------------------------------------
   SCOPE & TIMELINE

   THE SHAPE OF THE TAB. A compact lane strip on one shared month axis, then a
   stack of phase cards, one open at a time, the current phase open on arrival.

   The strip carries the two facts a card stack throws away — how long a phase
   is relative to the others, and what overlaps what — as geometry, so the back
   row of a room does not have to hold two date ranges in their head. It stays
   honest by refusing the impossible comparison: a phase that is more than
   three times longer than everything else AND runs off the end of the
   engagement is taken OFF the axis and stated as a labelled rule at the right
   edge instead. With PAACT's twelve-month implementation tail removed, the
   remaining ratio is about 3.5:1 on one linear scale, which needs no scale
   break, no legend and no honesty caption. Every number is still printed in
   words on the cards underneath, so nothing depends on reading a chart.

   TWO DATA SHAPES, ONE COMPONENT. The older portals carry phases keyed `n`,
   status 'done' | 'active', `blurb`, deliverables as plain strings, cadence
   rows keyed {label, detail, next}, one flat scope.team. PAACT carries the
   brief's shape: `number`, 'in_progress' | 'not_started', `purpose`,
   deliverables as {name, done}, cadence rows keyed {rhythm, what, owner},
   consultingTeam / clientTeam / governance, plus keyDates. Everything is
   normalised once at the top; nothing below reads a raw field. Rendering a
   deliverable OBJECT as a React child — the one hard crash in the delta — is
   impossible here, and a null entry in eng.phases is survived rather than
   thrown on.

   DATES ARE CALENDAR DATES. Every YYYY-MM-DD string is parsed to LOCAL
   midnight, never UTC midnight, because `now` arrives as the same kind of
   string and a UTC parse reads as the previous day for an Atlanta client.
   Formatting goes through lib/format.js, which does string arithmetic and
   never builds a Date at all — so this file and that one cannot disagree.
   Nothing here calls Date.now(): `now` is a prop, so a pinned portal clock
   keeps working and the whole tab is a pure function of its data.

   COUNTS ARE NEVER INVENTED. "2 of 7 done" is printed only where the portal
   carries a per-deliverable flag for every item in that phase. Where it
   carries some, the partial is stated as a partial. Where it carries none, no
   count appears anywhere and the bar falls back to elapsed time with that
   meaning written beside it.
   --------------------------------------------------------------------------- */

const DAY = 86400000;

/* A date-only ISO string -> LOCAL midnight epoch ms, NaN-safe. */
function ms(d) {
  const p = String(d || '').slice(0, 10).split('-');
  if (p.length < 3) return NaN;
  const y = +p[0];
  const m = +p[1];
  const day = +p[2];
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(day)) return NaN;
  const t = new Date(y, m - 1, day).getTime();
  return Number.isNaN(t) ? NaN : t;
}

/* Whole days between two local midnights. Rounded, because a span crossing a
   daylight-saving boundary is 23 or 25 hours long and an unrounded division
   turns 30 days into 29.96. */
const daysBetween = (a, b) => Math.round((ms(b) - ms(a)) / DAY);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* A date range with the repeated part said once: "1 – 30 Sep 26",
   "2 Nov – 18 Dec 26", "15 Feb 27 – 15 Feb 28". Saves about nine characters a
   row, which is the difference between one line and two at 390px. */
function rangeParts(a, b) {
  if (!a || !b) return [fmt(a || b), ''];
  const A = String(a).split('-');
  const B = String(b).split('-');
  if (A.length < 3 || B.length < 3) return [fmt(a), fmt(b)];
  const day = (p) => +p[2];
  const mon = (p) => MON[+p[1] - 1];
  const yr = (p) => p[0].slice(2);
  if (A[0] === B[0] && A[1] === B[1]) return [`${day(A)}`, `${day(B)} ${mon(B)} ${yr(B)}`];
  if (A[0] === B[0]) return [`${day(A)} ${mon(A)}`, `${day(B)} ${mon(B)} ${yr(B)}`];
  return [fmt(a), fmt(b)];
}
const range = (a, b) => { const [l, r] = rangeParts(a, b); return r ? `${l} – ${r}` : l; };

/* How long something LASTS, in the unit a person would say out loud. Phase
   lengths stay in weeks a long way out, because a fourteen-week discovery
   phase is planned in weeks. Years exist as a unit: the plan horizon is three
   to five years and the phase dates are meant to be edited, so "39 months" has
   to be reachable as "3.3 years" rather than left as a number nobody reads. */
function lengthWords(days) {
  const n = Math.round(days);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 14) return `${n} day${n === 1 ? '' : 's'}`;
  if (n < 120) {
    const w = Math.round(n / 7);
    return `${w} week${w === 1 ? '' : 's'}`;
  }
  const y = n / 365.25;
  if (y >= 1.75) {
    const r = Math.round(y * 10) / 10;
    return `${Number.isInteger(r) ? r : r.toFixed(1)} years`;
  }
  const mo = Math.max(1, Math.round(n / 30.44));
  return `${mo} month${mo === 1 ? '' : 's'}`;
}

/* How far AWAY something is. A gap turns to months sooner than a length does:
   four months ahead is said in months, not in seventeen weeks. */
function gapWords(days) {
  const n = Math.abs(Math.round(days));
  if (!Number.isFinite(n)) return '';
  if (n < 14) return `${n} day${n === 1 ? '' : 's'}`;
  if (n < 70) {
    const w = Math.round(n / 7);
    return `${w} week${w === 1 ? '' : 's'}`;
  }
  const y = n / 365.25;
  if (y >= 1.75) {
    const r = Math.round(y * 10) / 10;
    return `${Number.isInteger(r) ? r : r.toFixed(1)} years`;
  }
  const mo = Math.max(1, Math.round(n / 30.44));
  return `${mo} month${mo === 1 ? '' : 's'}`;
}

/* An exact span, in days, for the one figure a facilitator will be holding in
   another form. See the overlap comment in normalise(): rounding 47 days to
   whole weeks prints "7 weeks" against a workplan that says six, and being
   five days out on a number someone else is reading aloud is worse than being
   precise and slightly longer. */
function daysWord(days) {
  const n = Math.round(days);
  if (!Number.isFinite(n) || n <= 0) return '';
  return `${n} day${n === 1 ? '' : 's'}`;
}

/* "today" / "tomorrow" / "in 5 weeks" / "3 weeks ago". The single strongest
   fact this page can carry on the day of a kickoff is that the kickoff is
   tomorrow, and it has to be said in those words, not as a date to subtract. */
function whenLabel(iso, nowMs) {
  if (!Number.isFinite(nowMs)) return '';
  const t = ms(iso);
  if (!Number.isFinite(t)) return '';
  const d = Math.round((t - nowMs) / DAY);
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d === -1) return 'yesterday';
  return d < 0 ? `${gapWords(d)} ago` : `in ${gapWords(d)}`;
}

/* Both status vocabularies, plus the app's own "not started by omission". */
const STATE = {
  done: 'done', complete: 'done', completed: 'done', closed: 'done', finished: 'done',
  active: 'doing', in_progress: 'doing', 'in progress': 'doing', inprogress: 'doing',
  doing: 'doing', current: 'doing', underway: 'doing', started: 'doing',
  not_started: 'next', 'not started': 'next', notstarted: 'next', next: 'next',
  planned: 'next', upcoming: 'next', todo: 'next', '': 'next',
};
/* 'overran' is derived, never stored: a phase whose window has closed with
   work outstanding. It exists so that no card can read "In progress" beside
   "Ended 30 Sep 26", which is what the product did on 1 October.

   IT IS NOT A FAILURE, AND IT DOES NOT SAY "Overdue". A phase finishing its
   tail a week past a planned window is the normal condition of a seventeen-
   month workspace: Foundation's five open prep items on 1 October are work in
   hand, not a missed deadline, and PAACT would be reading a red alarm about
   their own engagement for months. The pill states the fact it can defend —
   items still open, window closed on a date printed beside it — and the timing
   line next to it supplies the date. Two words, no longer than "Not started",
   so the pill cannot push the phase name onto a second line at 390px. The DOT
   keeps the stop hue: the lane badge, the card edge and this chip are styled
   together as .s-overran in timeline.css, and a blue dot inside a red-ringed
   chip would be a worse signal than a calm word beside a familiar colour. */
const STATE_LABEL = { done: 'Done', doing: 'In progress', next: 'Not started', overran: 'Open items' };

/* done | doing | next | overran, derived once.

   ABSENT means derive from the calendar; EMPTY means the portal answered "not
   started". That distinction is load-bearing: the loader spells the brief's
   'not_started' as '', and treating '' as no answer would put Discovery in
   progress on 22 September — its window opens on the 15th — when the brief
   says plainly that nothing in it has begun. Getting that wrong would have the
   one section carrying real client content open the kickoff by claiming work
   had started that has not. */
function stateOf(p, nowMs) {
  const closed = Number.isFinite(p.b) && Number.isFinite(nowMs) && nowMs > p.b;
  /* Before the window OPENS is its own condition, and a declared status must
     not overrule the calendar there: "In progress" beside "Starts in 4 months"
     is a contradiction on one card, and the date is the fact a reader can
     check. */
  const notYetOpen = Number.isFinite(p.a) && Number.isFinite(nowMs) && nowMs < p.a;
  const allTracked = p.items.length > 0 && p.tracked === p.items.length;

  /* Every box ticked is done, whatever the status field was last set to. */
  if (allTracked && p.doneN === p.items.length) return 'done';

  const declared = p.rawStatus == null ? null : (STATE[p.rawStatus] || 'next');
  if (declared === 'done') return 'done';

  let s = declared;
  if (s == null) {
    if (!Number.isFinite(p.a) || !Number.isFinite(nowMs)) s = 'next';
    else s = nowMs < p.a ? 'next' : 'doing';
  }
  /* A ticked box in a phase labelled not-started means it has started. */
  if (s === 'next' && p.doneN > 0) s = 'doing';
  /* Declared in progress before its own start date, with nothing ticked to
     support it: the calendar wins and the card reads "Not started · Starts in
     4 months". Where a box IS ticked the work has genuinely begun early, so the
     status stands and timingFor says "Under way early" rather than "Starts". */
  if (s === 'doing' && notYetOpen && p.doneN === 0) s = 'next';

  if (closed) {
    /* Items still open only where something is genuinely outstanding: tracked
       deliverables left unticked, or a phase still declared live or unstarted
       after its end date. A past window with nothing to contradict it simply
       finished. */
    if (p.tracked > 0 && p.doneN < p.items.length) return 'overran';
    if (declared === 'doing' || declared === 'next') return 'overran';
    return 'done';
  }
  return s;
}

/* Every phase, in one shape, with everything derivable derived once. */
function normalise(raw, nowMs) {
  const seen = Object.create(null);
  const list = (Array.isArray(raw) ? raw : []).map((entry, i) => {
    /* A null or non-object entry must not take out the section. The brief asks
       for the phase dates to be editable, so a hole in this array is a
       question of when, not if. */
    const p = entry && typeof entry === 'object' ? entry : {};
    const number = Number.isFinite(p.number) ? p.number : Number.isFinite(p.n) ? p.n : i + 1;
    /* Ids are also React keys and the open-panel key, so a collision between
       two phases that share a number has to be broken rather than warned
       about. */
    let id = typeof p.id === 'string' && p.id ? p.id : `p${number}`;
    if (seen[id]) id = `${id}-${i}`;
    seen[id] = true;

    /* Deliverables are plain strings in the older portals and {name, done} in
       the brief. `done` stays TRI-STATE — true, false, or null for "this
       portal does not say" — because "we do not know" must never be announced
       as "to do". */
    const items = (Array.isArray(p.deliverables) ? p.deliverables : []).map((d, j) => {
      const o = d && typeof d === 'object' ? d : null;
      return {
        key: `${id}-d${j}`,
        name: o ? String(o.name ?? o.title ?? o.text ?? '') : String(d ?? ''),
        done: o && typeof o.done === 'boolean' ? o.done : null,
      };
    });
    const tracked = items.filter((d) => d.done !== null).length;
    const doneN = items.filter((d) => d.done === true).length;

    const a = ms(p.start);
    const b = ms(p.end);
    const dated = Number.isFinite(a) && Number.isFinite(b) && b >= a;

    const out = {
      id,
      number,
      /* Alias, because the rail prints "Phase {n}" from the raw shape and now
         reads this one through currentPhaseOf(). Same value, both spellings. */
      n: number,
      name: String(p.name || `Phase ${number}`),
      start: p.start || '',
      end: p.end || '',
      a,
      b,
      dated,
      days: dated ? daysBetween(p.start, p.end) + 1 : 0,
      length: dated ? lengthWords(daysBetween(p.start, p.end) + 1) : '',
      purpose: String(p.purpose || p.blurb || ''),
      note: String(p.note || ''),
      rawStatus: p.status == null ? null : String(p.status).trim().toLowerCase(),
      items,
      tracked,
      doneN,
      overlaps: [],
    };
    out.state = stateOf(out, nowMs);
    /* The checkbox is driven per item, with the PHASE status as the fallback
       only where the portal says nothing per item — which is what lets a
       completed phase of plain strings show its boxes ticked without claiming
       anything about a phase that has not started. */
    out.items.forEach((d) => { d.mark = d.done === null ? (out.state === 'done' ? true : null) : d.done; });
    return out;
  });

  /* Date order, so the strip, the cards and the prev/next nav all agree, and
     so "the next phase to start" is the first match rather than a search. */
  list.sort((x, y) => {
    if (x.dated && y.dated && x.a !== y.a) return x.a - y.a;
    if (x.dated !== y.dated) return x.dated ? -1 : 1;
    return x.number - y.number;
  });

  /* Overlap is computed from the dates rather than trusted from a field, so no
     card can claim a concurrency the dates do not support. Strictly greater
     than zero: phases that merely touch at an endpoint do not overlap, and
     Plan design ending 13 Feb must not read as concurrent with Adoption
     starting 15 Feb. */
  list.forEach((p) => {
    if (!p.dated) return;
    p.overlaps = list
      .filter((q) => q !== p && q.dated && Math.max(p.a, q.a) < Math.min(p.b, q.b))
      .map((q) => {
        const from = p.a >= q.a ? p.start : q.start;
        const to = p.b <= q.b ? p.end : q.end;
        /* ONE convention: `days` is the INCLUSIVE count of calendar dates on
           which both windows are open — the same convention as a phase's own
           length — and it is both what sorts and what prints. The product
           carried two: 46 exclusive days drove the sort while lengthWords(47)
           printed "7 weeks".
           AND IT PRINTS DAYS, NOT WEEKS. Discovery and Synthesis overlap for
           47 days; the HTI workplan and the brief both say six weeks, and any
           rounding to whole weeks prints seven. A day count cannot contradict
           the facilitator reading from the workplan in the same room. */
        const days = daysBetween(from, to) + 1;
        return { id: q.id, name: q.name, from, to, days, length: daysWord(days) };
      });
  });

  return list;
}

/* Which card opens on arrival and which one wears "You are here". One rule,
   stated once, rather than the two independent copies the product carried.

   A phase declared in progress does NOT win once its end date is behind us:
   on 1 October, Foundation is over and Discovery is the phase the engagement
   is in, which is what the brief says in as many words. A pointer that stuck
   on a finished phase would be wrong for the seventeen months this workspace
   stays live. */
function currentPhase(list, nowMs) {
  return list.find((p) => p.state === 'doing')
    || list.find((p) => p.dated && Number.isFinite(nowMs) && nowMs >= p.a && nowMs <= p.b)
    || list.find((p) => p.dated && Number.isFinite(nowMs) && nowMs < p.a)
    /* Everything is behind us: the phase the engagement ended on, not the
       first one it ever overran. */
    || [...list].reverse().find((p) => p.state === 'overran')
    || list[list.length - 1]
    || null;
}

/* The current phase, resolved from the DATES, for anything outside this file.

   App.jsx's rail used to find it by matching the static status string — the
   first phase whose status is 'active', or the last phase if none is. That
   answer is wrong from 1 October, when Foundation's window has closed and
   Discovery is the phase the engagement is in: the rail would say Phase 1 while
   the Timeline two clicks away says Phase 2, and neither would look wrong on its
   own. One rule, one export.

   `eng` is the portal's engagement object; `now` is a YYYY-MM-DD string (or
   anything ms() can read). Returns the normalised phase — `number`/`n`, `name`,
   `state`, dates, deliverables — or null when the portal has no dated phases. */
export function currentPhaseOf(eng, now) {
  const nowMs = ms(now);
  const list = normalise(eng && eng.phases, nowMs);
  return currentPhase(list, nowMs) || null;
}

/* The one bar on each card and in each lane, and what it is counting. Three
   readings, each labelled in words beside it, because the same half-full bar
   means "4 of 8 delivered" on one portal and "half way through the window" on
   another, and the viewer is owed the difference.

   `byDels` is decided once for the whole portal: if NO phase anywhere carries
   a per-item flag, no count-shaped label is emitted anywhere. That is the
   difference between a bar that means something and "0 of 3 done" invented
   from a list of three untracked strings. */
function meterFor(p, nowMs, byDels) {
  const n = p.items.length;
  if (byDels && n && p.tracked === n) {
    return { kind: 'items', pct: Math.round((p.doneN / n) * 100), text: `${p.doneN} of ${n} done` };
  }
  /* Some flagged, some not. The count is over the whole list and the untracked
     remainder is named, so the bar and the checkboxes above it can never be
     measuring two different quantities without saying so. */
  if (byDels && n && p.tracked > 0) {
    return {
      kind: 'items',
      pct: Math.round((p.doneN / n) * 100),
      text: `${p.doneN} of ${n} done · ${n - p.tracked} not tracked`,
    };
  }
  if (p.state === 'done') {
    return { kind: 'items', pct: 100, text: n ? `All ${n} delivered` : 'Complete' };
  }
  if ((p.state === 'doing' || p.state === 'overran') && p.dated && Number.isFinite(nowMs) && p.b > p.a) {
    const t = clamp(Math.round(((nowMs - p.a) / (p.b - p.a)) * 100), 0, 100);
    return { kind: 'time', pct: t, text: `${t}% of the phase window elapsed` };
  }
  return { kind: 'none', pct: 0, text: p.state === 'overran' ? 'Window closed' : 'Not started' };
}

/* Where today sits relative to a phase's window, worded so it can never
   contradict the status pill beside it. A window can be open while nothing in
   it has begun — that is exactly Discovery's position on 22 September — and
   "Ends in 3 months" six characters from a pill reading "Not started" reads as
   a contradiction in a room, whatever the code intends. */
function timingFor(p, nowMs, nowStr) {
  if (!p.dated || !Number.isFinite(nowMs)) return '';
  if (nowMs < p.a) {
    /* Work ticked off before the window opens: the pill says In progress, so
       "Starts in 4 months" beside it would read as a contradiction. */
    if (p.state === 'doing') return `Under way early · window opens ${fmt(p.start)}`;
    const w = whenLabel(p.start, nowMs);
    return w ? `Starts ${w}` : '';
  }
  if (nowMs > p.b) return p.state === 'overran' ? `Window closed ${fmt(p.end)}` : `Ended ${fmt(p.end)}`;
  if (p.state === 'next') return `Window open · runs to ${fmt(p.end)}`;
  const left = daysBetween(nowStr, p.end);
  if (left <= 0) return 'Ends today';
  return `Ends ${whenLabel(p.end, nowMs)}`;
}

/* ---------- the lane strip ------------------------------------------------ */

const monthStartOf = (t) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); };
const nextMonthOf = (t) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime(); };

/* Month-start gridlines. Every month gets a line; labels thin out by month
   count so a long axis shows quarters instead of twelve collisions. */
function monthTicks(a, b) {
  const first = new Date(a);
  let y = first.getFullYear();
  let m = first.getMonth();
  if (first.getDate() !== 1) { m += 1; if (m > 11) { m = 0; y += 1; } }
  const out = [];
  for (let guard = 0; guard < 400; guard += 1) {
    const t = new Date(y, m, 1).getTime();
    if (t > b) break;
    out.push({ key: `${y}-${m}`, t, y, m });
    m += 1;
    if (m > 11) { m = 0; y += 1; }
  }
  const step = out.length <= 8 ? 1 : out.length <= 14 ? 2 : 3;
  return out.map((tick, i) => ({
    ...tick,
    label: i % step === 0 ? `${MON[tick.m]}${tick.m === 0 || i === 0 ? ` ${String(tick.y).slice(2)}` : ''}` : null,
  }));
}

/* Which phases can share one linear axis, and which are a tail.

   A phase is taken off the axis only when it is BOTH more than three times
   longer than everything else AND the last thing to finish — a trailing tail,
   never a hole in the middle. PAACT's twelve-month implementation year is the
   case this exists for: leave it in and Foundation is a 5% sliver beside it,
   which is the reading that makes a chart need a scale break and a sixty-word
   caption before it is honest. Take it out and the rest are 26 to 95 days on
   one true scale. The tail is not dropped — it is stated as a labelled rule at
   the right-hand edge, and its card underneath carries every number. */
function splitTail(dated) {
  const inc = dated.slice();
  const tail = [];
  while (inc.length > 2) {
    let li = 0;
    for (let i = 1; i < inc.length; i += 1) if (inc[i].days > inc[li].days) li = i;
    const longest = inc[li];
    const rest = inc.filter((_, i) => i !== li);
    const restMax = Math.max(...rest.map((p) => p.days));
    const restEnd = Math.max(...rest.map((p) => p.b));
    if (longest.days > restMax * 3 && longest.b >= restEnd) {
      tail.push(longest);
      inc.splice(li, 1);
    } else break;
  }
  tail.sort((x, y) => x.a - y.a);
  return { inc, tail };
}

function buildStrip(phases, nowMs) {
  const dated = phases.filter((p) => p.dated);
  if (dated.length < 2) return null;
  const { inc, tail } = splitTail(dated);
  if (!inc.length) return null;

  let t0 = monthStartOf(Math.min(...inc.map((p) => p.a)));
  let t1 = nextMonthOf(Math.max(...inc.map((p) => p.b)));
  const own = Math.max(DAY, t1 - t0);
  /* The axis stretches to include today, because a portal whose only live phase
     is the tail would otherwise put its own "today" marker off the picture.
     It stretches only so far: doubling the axis to reach a date years past the
     work would shrink every bar to a sliver to mark one line. Past that the
     strip stays at the scale of the work and the caption says where today is. */
  if (Number.isFinite(nowMs)) {
    const w0 = Math.min(t0, monthStartOf(nowMs));
    const w1 = Math.max(t1, nextMonthOf(nowMs));
    if (w1 - w0 <= own * 2) { t0 = w0; t1 = w1; }
  }
  const span = Math.max(DAY, t1 - t0);
  const pctOf = (t) => clamp(((t - t0) / span) * 100, 0, 100);

  return {
    t0,
    t1,
    span,
    pctOf,
    ticks: monthTicks(t0, t1),
    lanes: inc.map((p) => ({
      phase: p,
      x: pctOf(p.a),
      /* End dates are inclusive, so a bar runs to the end of its last day —
         otherwise a one-day phase has zero width and a 30-day phase measures
         29. */
      w: Math.max(1.2, ((Math.min(p.b + DAY, t1) - p.a) / span) * 100),
    })),
    tail,
    nowIn: Number.isFinite(nowMs) && nowMs >= t0 && nowMs <= t1,
    nowPct: Number.isFinite(nowMs) ? pctOf(nowMs) : 0,
  };
}

/* A flag or label centred on 0% or 100% would hang outside the track, so the
   two ends anchor instead of centring. */
const anchorOf = (p) => (p <= 12 ? ' at-start' : p >= 88 ? ' at-end' : '');

/* "HTI Catalysts's engagement" is wrong; an organisation name already ending in
   s takes the bare apostrophe. */
const possessive = (name) => {
  const n = String(name || '').trim();
  return /s$/i.test(n) ? `${n}\u2019` : `${n}\u2019s`;
};

const initials = (s) => String(s || '')
  .split(/[\s·]+/).filter(Boolean).slice(0, 2)
  .map((w) => w[0].toUpperCase()).join('') || '—';

/* Two offset bars: the icon says "overlap" without a word of legend. */
function OverlapIcon() {
  return (
    <svg className="pc-relico" viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" focusable="false">
      <rect x="1.2" y="4" width="10" height="3.2" rx="1.6" fill="currentColor" opacity=".45" />
      <rect x="4.8" y="8.8" width="10" height="3.2" rx="1.6" fill="currentColor" />
    </svg>
  );
}

/* A range is two dates, so it is two <time> elements — a single one carrying
   "15 Sep - 18 Dec 26" in its datetime would be invalid markup, and this page
   is printed as a board packet. */
function RangeTime({ a, b }) {
  const [l, r] = rangeParts(a, b);
  if (!r) return <time dateTime={String(a || b).slice(0, 10)}>{l}</time>;
  return (
    <>
      <time dateTime={String(a).slice(0, 10)}>{l}</time>
      {' – '}
      <time dateTime={String(b).slice(0, 10)}>{r}</time>
    </>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <path d="M4.5 6.25 8 9.75l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* One status chip, one vocabulary. 'overran' borrows the product's late dot,
   which is the only one of the five that carries a stop colour. */
function StatePill({ state }) {
  return (
    <span className="pc-pill">
      {state === 'overran' ? <Dot late small /> : <Dot status={state} small />}
      {STATE_LABEL[state]}
    </span>
  );
}

function Person({ m }) {
  return (
    <li className="pc-person">
      <span className="pc-av" aria-hidden="true">{initials(m.name)}</span>
      <span className="pc-pbody">
        <span className="pc-pline">
          <strong className="pc-pname">{m.name}</strong>
          {m.org ? <span className="pc-porg">{m.org}</span> : null}
        </span>
        {m.role ? <span className="pc-prole">{m.role}</span> : null}
        {m.owns ? (
          <span className="pc-powns">
            <span className="pc-ownsl">Owns</span>
            {m.owns}
          </span>
        ) : null}
      </span>
    </li>
  );
}

export default function Scope({ portal, labels, scopeId, topTasks, now }) {
  const pl = portal || {};
  const eng = pl.engagement || {};
  const scope = eng.scope || {};
  const nowStr = now || '';
  const nowMs = ms(nowStr);

  const phases = useMemo(() => normalise(eng.phases, nowMs), [eng.phases, nowMs]);
  const current = useMemo(() => currentPhase(phases, nowMs), [phases, nowMs]);
  const [open, setOpen] = useState(() => current?.id || '');
  /* State survives a sub-tab change and a portal change; a stale id falls back
     to the current phase, and the empty string is a real "all collapsed". */
  const openId = open === '' ? '' : (phases.some((p) => p.id === open) ? open : (current?.id || ''));
  const view = scopeId; // the sub-nav writes 'timeline' | 'agreement' | 'team' here
  /* The portal's own declaration, not a guess from the slug. */
  const borrowedWorkplan = (pl.sampleSections || []).includes('workplan');
  const workplan = (labels?.workplan || 'Workplan').toLowerCase();

  /* Opening a phase from the strip, or from the nav at the foot of a card,
     scrolls that card into view: without it, collapsing a ten-deliverable
     phase moves everything above the fold and the presenter has to hunt. */
  const jumpTo = useCallback((id) => {
    setOpen(id);
    if (typeof window === 'undefined' || !window.requestAnimationFrame) return;
    window.requestAnimationFrame(() => {
      const el = document.getElementById(`pc-card-${id}`);
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
    });
  }, []);

  /* Which phases are running on a given date. This is where the overlap fact
     reappears on the Scope & cadence tab, so it is not carried only by the
     strip on the other tab. */
  const phasesOn = useCallback((iso) => {
    const t = ms(iso);
    if (!Number.isFinite(t)) return [];
    return phases.filter((p) => p.dated && t >= p.a && t <= p.b);
  }, [phases]);

  /* ------------------------------------------------ Scope & cadence ------ */
  if (view === 'agreement') {
    /* The brief's rhythm/what/owner and the older label/detail/next, read
       through one accessor each. The loader writes BOTH sets onto PAACT's
       cadence rows, so the brief's own keys have to win or the owner shows up
       twice — once in its column and once folded into `detail`. */
    const cadence = (Array.isArray(scope.cadence) ? scope.cadence : []).map((row, i) => {
      const c = row && typeof row === 'object' ? row : {};
      return {
        key: `c${i}`,
        rhythm: String(c.rhythm || c.label || ''),
        what: String(c.what || (c.rhythm ? c.detail : '') || c.detail || ''),
        owner: String(c.owner || ''),
        next: c.next || '',
      };
    });
    const hasOwner = cadence.some((c) => c.owner);
    const hasNext = cadence.some((c) => c.next);
    /* Each cadence ROW is its own grid, so a max-content first column resolves
       per row and the second column starts at five different x positions.
       Sizing the track off the longest rhythm in THIS portal's data makes one
       column for all of them without hard-coding a width that is a gutter for
       one portal and a clip for the next. */
    const rhythmCh = Math.max(6, ...cadence.map((c) => c.rhythm.length));
    const cadSub = hasOwner && hasNext ? 'Frequency, activity, owner and next date.'
      : hasOwner ? 'Frequency, activity and owner.'
        : hasNext ? 'Frequency, activity and next date.'
          : 'Frequency and activity.';

    const dates = (Array.isArray(scope.keyDates) ? scope.keyDates : [])
      .filter((d) => d && d.date)
      .map((d, i) => ({ key: `${d.date}-${i}`, date: String(d.date), what: String(d.what ?? d.label ?? '') }))
      .sort((x, y) => x.date.localeCompare(y.date));
    /* The index of the first date still to come. -1 means every one is behind
       us.

       >= , NOT > : today counts as AHEAD, which is the same comparator
       nextMilestone uses on the Timeline tab. With the two spellings the tabs
       contradicted each other on any day that IS a key date — on 23 Sep 2026 the
       Timeline said "Next: Strategic planning kickoff — today" while this tab
       marked the kickoff Past and moved "Next up" to 5 Oct. Five of the eight
       PAACT key dates are such a day. It also puts the "Today" marker row ABOVE
       a same-day key date rather than below it. */
    const ahead = Number.isFinite(nowMs) ? dates.findIndex((d) => ms(d.date) >= nowMs) : -1;
    const past = ahead === -1 ? dates.length : ahead;

    return (
      <>
        <SectionHead eyebrow={labels.scope} title="Scope and cadence">
          {scope.scopeSummary || 'What the engagement covers, and what it does not.'}
        </SectionHead>
        <div className="grid2">
          <Panel>
            <h4 className="eyebrow" style={{ marginBottom: 11 }}>In scope</h4>
            <ul className="ticklist yes">
              {(scope.inScope || []).map((x, i) => <li key={i}><span className="mk" aria-hidden="true">✓</span><span>{x}</span></li>)}
            </ul>
          </Panel>
          <Panel>
            <h4 className="eyebrow" style={{ marginBottom: 11 }}>Out of scope</h4>
            <ul className="ticklist no">
              {(scope.outOfScope || []).map((x, i) => <li key={i}><span className="mk" aria-hidden="true">—</span><span>{x}</span></li>)}
            </ul>
          </Panel>
        </div>

        {cadence.length ? (
          <Panel style={{ marginTop: 13 }}>
            <div className="pc-phead">
              <h4 className="eyebrow">Cadence</h4>
              <p className="pc-psub">{cadSub}</p>
            </div>
            <ul className="pc-cad" role="list" style={{ '--rhy': `${rhythmCh}ch` }}>
              {cadence.map((c) => (
                <li key={c.key}>
                  <span className="pc-rhy">{c.rhythm}</span>
                  <span className="pc-what">{c.what}</span>
                  {/* One cell, whichever of the two the portal has, so a row
                      never spills onto a second grid line. */}
                  <span className="pc-cmeta">
                    {c.owner ? (
                      <span className="pc-cowner">
                        <span className="pc-av sm" aria-hidden="true">{initials(c.owner)}</span>
                        <span className="sr">Owner: </span>
                        {c.owner}
                      </span>
                    ) : null}
                    {c.next ? (
                      <span className="pc-cnext num">
                        <span className="sr">Next </span>
                        <time dateTime={String(c.next).slice(0, 10)}>{fmt(c.next)}</time>
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}

        {dates.length ? (
          <Panel style={{ marginTop: 13 }}>
            <div className="pc-phead">
              <h4 className="eyebrow">Key dates</h4>
              <p className="pc-psub">
                {Number.isFinite(nowMs)
                  ? `${past} complete, ${dates.length - past} upcoming. Today is ${fmt(nowStr)}.`
                  : `${dates.length} dated commitments.`}
              </p>
            </div>
            <ol className="pc-dates" role="list">
              {dates.map((d, i) => {
                const live = phasesOn(d.date);
                const isPast = ahead === -1 || i < ahead;
                return (
                  <React.Fragment key={d.key}>
                    {i === ahead ? (
                      <li className="pc-dtoday">
                        <span className="pc-dmark" aria-hidden="true" />
                        <span className="pc-ddate num"><time dateTime={nowStr}>{fmt(nowStr)}</time></span>
                        <span className="pc-dwhat">Today</span>
                      </li>
                    ) : null}
                    <li className={isPast ? 'is-past' : ''}>
                      <span className="pc-dmark" aria-hidden="true" />
                      <span className="pc-ddate num"><time dateTime={d.date}>{fmt(d.date)}</time></span>
                      <span className="pc-dwhat">
                        <span className="sr">{isPast ? 'Past: ' : 'Ahead: '}</span>
                        {d.what}
                        {/* The chip answers "what happens next" without making
                            the reader scan eight dates against today. */}
                        {i === ahead ? <span className="pc-nextchip">Next up · {whenLabel(d.date, nowMs)}</span> : null}
                        {live.length ? (
                          <span className="pc-dlive">
                            {live.map((p) => `Phase ${p.number} ${p.name}`).join(' + ')}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  </React.Fragment>
                );
              })}
              {ahead === -1 && Number.isFinite(nowMs) ? (
                <li className="pc-dtoday">
                  <span className="pc-dmark" aria-hidden="true" />
                  <span className="pc-ddate num"><time dateTime={nowStr}>{fmt(nowStr)}</time></span>
                  <span className="pc-dwhat">Today</span>
                </li>
              ) : null}
            </ol>
          </Panel>
        ) : null}
      </>
    );
  }

  /* ------------------------------------------------ Who is on it -------- */
  if (view === 'team') {
    const consultants = Array.isArray(scope.consultingTeam) ? scope.consultingTeam : [];
    const client = Array.isArray(scope.clientTeam) ? scope.clientTeam : [];
    const governance = Array.isArray(scope.governance) ? scope.governance : [];
    /* The older portals carry one flat list and no explicit side. `side` is
       read when the loader set it; the org-string match survives ONLY as the
       last resort for a portal that predates both, because it files anyone on
       the firm's team under a second org name with the client. */
    const flat = (!consultants.length && !client.length ? (scope.team || []) : []).map((m) => ({
      ...m,
      side: m.side || (m.org && eng.firm?.name && m.org === eng.firm.name ? 'Consultant' : 'Client'),
    }));
    const firm = eng.firm?.name || 'Consulting team';

    return (
      <>
        <SectionHead eyebrow={labels.scope} title="Team">
          {/* The convening organisation is a party to the engagement, and this
              is the tab that names the parties. */}
          {eng.convener ? `Convened by ${eng.convener}. ` : ''}
          Named parties and their responsibilities.
        </SectionHead>

        {consultants.length ? (
          <Panel>
            <div className="pc-phead">
              <h4 className="eyebrow">{firm}</h4>
              <p className="pc-psub">{consultants.length} people.</p>
            </div>
            <ul className="pc-people" role="list">{consultants.map((m, i) => <Person key={`c${i}`} m={m} />)}</ul>
          </Panel>
        ) : null}

        {client.length ? (
          <Panel>
            <div className="pc-phead">
              <h4 className="eyebrow">Client</h4>
              <p className="pc-psub">{client.length} people.</p>
            </div>
            <ul className="pc-people" role="list">{client.map((m, i) => <Person key={`k${i}`} m={m} />)}</ul>
          </Panel>
        ) : null}

        {flat.length ? (
          <Panel>
            <h4 className="eyebrow" style={{ marginBottom: 11 }}>Engagement</h4>
            <ul className="pc-people" role="list">
              {flat.map((m, i) => (
                <Person key={`f${i}`} m={{ ...m, role: [m.side, m.role].filter(Boolean).join(' · ') }} />
              ))}
            </ul>
          </Panel>
        ) : null}

        {governance.length ? (
          <Panel>
            <div className="pc-phead">
              <h4 className="eyebrow">Governance</h4>
              <p className="pc-psub">Groups the work goes through, and how often they meet.</p>
            </div>
            <ul className="pc-bodies" role="list">
              {governance.map((g, i) => (
                <li key={`g${i}`}>
                  <span className="pc-bname">{g.body}</span>
                  <span className="pc-bmembers"><span className="sr">Members: </span>{g.members}</span>
                  <span className="pc-bmeets"><span className="sr">Meets: </span>{g.meets}</span>
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}

        {/* Derived from whatever tasks the portal holds — which, when the
            portal declares its workplan to be sample content, are somebody
            else's people. A caption saying so is not enough here: this is the
            TEAM page, and its other three panels are this engagement's real
            names, so a labelled list of nine strangers underneath them still
            reads as part of the team. On the sample church's workplan one of
            them is literally "Elder board". Say the panel is coming instead of
            filling it with names from another engagement. */}
        {borrowedWorkplan ? (
          <Panel>
            <div className="pc-phead">
              <h4 className="eyebrow">Owners in the {workplan}</h4>
              <p className="pc-psub">
                Not yet assigned. The implementation roadmap is a phase&nbsp;4 deliverable.
              </p>
            </div>
          </Panel>
        ) : (
        <Panel>
          <div className="pc-phead">
            <h4 className="eyebrow">Owners in the {workplan}</h4>
          </div>
          <div className="deflist">
            {ownerLoad(topTasks || [], now).map((o) => (
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
        )}
      </>
    );
  }

  /* ------------------------------------------------ Timeline ------------ */

  /* One decision for the whole portal: does ANY phase carry a per-deliverable
     status? If not, every count-shaped label is suppressed and every bar falls
     back to elapsed time with that meaning printed beside it. */
  const byDels = phases.some((p) => p.tracked > 0);
  const totalD = phases.reduce((n, p) => n + p.items.length, 0);
  const doneD = phases.reduce((n, p) => n + p.doneN, 0);
  const strip = buildStrip(phases, nowMs);
  const undated = phases.filter((p) => !p.dated).length;
  /* Every phase the strip carries, bars AND tail, so its group label cannot
     describe a shorter period than the strip draws. */
  const stripAll = strip ? [...strip.lanes.map((l) => l.phase), ...strip.tail] : [];
  const stripStart = stripAll.reduce((acc, p) => (!acc || p.start < acc ? p.start : acc), '');
  const stripEnd = stripAll.reduce((acc, p) => (p.end > acc ? p.end : acc), '');

  const dated = phases.filter((p) => p.dated);
  const firstStart = dated.length ? dated[0].start : '';
  const lastEnd = dated.reduce((acc, p) => (!acc || p.end > acc ? p.end : acc), '');

  /* The widest concurrency, with the two phase names kept in their own fields:
     overwriting the overlap's `from` DATE with a phase NAME works and is a
     trap for whoever edits this next. */
  const widest = dated
    .flatMap((p) => p.overlaps.map((o) => ({ aName: p.name, bName: o.name, days: o.days, length: o.length })))
    .filter((o) => o.aName < o.bName)
    .sort((x, y) => y.days - x.days)[0];

  /* The next dated thing. Curated key dates when the portal has them — they
     are the eight points this engagement actually hangs on — otherwise the
     phase boundaries, so a portal with no key dates still answers the
     question. */
  const keyDates = (Array.isArray(scope.keyDates) ? scope.keyDates : [])
    .filter((d) => d && d.date)
    .map((d, i) => ({ key: `k${i}`, date: String(d.date), what: String(d.what ?? d.label ?? ''), t: ms(String(d.date)) }))
    .filter((d) => Number.isFinite(d.t))
    .sort((x, y) => x.t - y.t);
  /* A portal with no key dates often has a dated cadence — "next quarterly
     review, 20 Nov" is a truer answer to "what happens next" than the end of a
     twelve-month phase. Phase boundaries are the last resort. */
  const cadenceDates = (Array.isArray(scope.cadence) ? scope.cadence : [])
    .filter((c) => c && c.next)
    .map((c, i) => ({ key: `cd${i}`, date: String(c.next).slice(0, 10), what: String(c.label || c.rhythm || 'Next session'), t: ms(String(c.next).slice(0, 10)) }))
    .filter((d) => Number.isFinite(d.t));
  const milestones = keyDates.length
    ? keyDates
    : [...cadenceDates, ...dated.flatMap((p) => [
      { key: `${p.id}-s`, date: p.start, what: `${p.name} begins`, t: p.a },
      { key: `${p.id}-e`, date: p.end, what: `${p.name} ends`, t: p.b },
    ])].sort((x, y) => x.t - y.t);
  const nextMilestone = Number.isFinite(nowMs) ? milestones.find((d) => d.t >= nowMs) || null : null;

  const STATE_CLAUSE = {
    doing: 'is in progress',
    next: 'has not started yet',
    overran: 'is past its end date',
    done: 'is complete',
  };

  /* TWO SPANS, NEVER ONE. The consulting engagement and the plan it produces end
     on different dates, and collapsing them overstated a 23-week contract as
     seventeen months: "5 phases, 1 Sep 26 to 15 Feb 28" took max(phase.end) —
     which is the end of PLAN YEAR ONE, the tail of the implementation phase —
     and presented it as when HTI's work ends. The engagement's own dates come
     from the portal (the brief's engagementStart / engagementEnd, the same
     15 Feb 2027 as the "RFP project end date" key date and Phase 5's note), and
     the phase tail is stated separately as what it is. A portal that carries no
     engagement dates falls back to its phase span, which is all it knows.

     No week or month count on the engagement line: 1 Sep 26 – 15 Feb 27 is 168
     days, which rounds to 24 weeks, and the brief says 23 twice. The dates
     cannot be contradicted; a rounded figure can. Phase lengths, where the two
     conventions agree, are printed on every card below. */
  const engStart = eng.engagementStart || firstStart;
  const engEnd = eng.engagementEnd || lastEnd;

  /* ORDER IS THE WHOLE POINT HERE, and getting it wrong once already made this
     section unreadable. It used to open with the engagement span and then the
     LAST phase — so the first thing a reader met was "Phase 5, Adoption &
     implementation, runs on to 15 Feb 28", and "you are at phase 1" was the
     fourth sentence. People read that as "we are in implementation" on the day
     of the kickoff. The room asks two questions first — where are we, and what
     happens next — so those are sentences one and two, and the 17-month arc,
     which is context rather than news, comes after. */
  const intro = [];
  if (current) intro.push(`Phase ${current.number}, ${current.name}, ${STATE_CLAUSE[current.state]}.`);
  /* The meeting the room is sitting in belongs on the first screen, in the
     words a person would use, not as a date three clicks down a checklist. */
  if (nextMilestone) {
    const w = whenLabel(nextMilestone.date, nowMs);
    intro.push(`Next: ${nextMilestone.what}.${w ? ` ${w.charAt(0).toUpperCase()}${w.slice(1)},` : ''} ${fmt(nextMilestone.date)}.`);
  }
  if (phases.length) {
    const n = `${phases.length} phase${phases.length === 1 ? '' : 's'}`;
    const firmName = eng.firm?.name;
    intro.push(engStart && engEnd
      ? `${n}. ${firmName ? `${possessive(firmName)} engagement` : 'The engagement'} runs ${fmt(engStart)} to ${fmt(engEnd)}.`
      : `${n}.`);
  }
  if (engEnd && lastEnd && lastEnd > engEnd) {
    const tails = dated.filter((p) => p.end === lastEnd);
    const who = tails.length === 1 ? `Phase ${tails[0].number}, ${tails[0].name},` : 'The last phase';
    intro.push(`${who} carries year one of the plan to ${fmt(lastEnd)}${eng.planHorizon ? `. The plan covers ${eng.planHorizon}` : ''}.`);
  }

  /* One sentence, where a reader will see it, about the four sections that are
     not this engagement's. A strategic plan showing priorities a client never
     agreed to is worse than no plan at all, and the reader meets that plan one
     tab away from here. */
  const sample = Array.isArray(pl.sampleSections) ? pl.sampleSections : [];
  const sampleOthers = ['plan', 'findings', 'workplan', 'dashboard']
    .filter((k) => sample.includes(k))
    .map((k) => labels?.[k] || k);
  const sampleLine = !sample.includes('scope') && sampleOthers.length
    ? `${sampleOthers.slice(0, -1).join(', ')}${sampleOthers.length > 1 ? ' and ' : ''}${sampleOthers[sampleOthers.length - 1]} show sample content from another engagement, as an illustration of the format. This section is the only one carrying this engagement's own content; the others are produced through the phases below.`
    : '';

  const cap = [];
  if (widest) cap.push(`${widest.aName} and ${widest.bName} overlap by ${widest.length}.`);
  if (byDels && totalD) cap.push(`${doneD} of ${totalD} deliverables complete across ${phases.length} phases.`);
  if (undated) cap.push(`${undated} phase${undated === 1 ? ' has no dates' : 's have no dates'} yet and ${undated === 1 ? 'is' : 'are'} not on the axis.`);
  if (strip) {
    /* What a filled bar MEANS, taken from the fills actually drawn rather than
       from the portal-wide flag. The demo's four bars are finished phases, and
       describing those as time elapsed is not what anyone is looking at. */
    const kinds = new Set(strip.lanes.map(({ phase }) => meterFor(phase, nowMs, byDels).kind));
    if (kinds.has('time') && kinds.has('items')) {
      cap.push('Bars show deliverables completed where a phase tracks them, and time elapsed where it does not.');
    } else if (kinds.has('time')) {
      cap.push('A filled bar is time elapsed — these phases carry no per-deliverable status.');
    } else if (kinds.has('items')) {
      cap.push(byDels
        ? 'Bars show deliverables completed, not time elapsed.'
        : 'A full bar is a phase that has finished — these phases carry no per-deliverable status.');
    }
    if (!strip.nowIn && Number.isFinite(nowMs)) {
      cap.push(`Today is ${fmt(nowStr)}, outside the period drawn above.`);
    }
  }

  return (
    <>
      <SectionHead eyebrow={labels.scope} title="Timeline">
        {intro.join(' ')}
      </SectionHead>

      {sampleLine ? (
        <p className="pt-sample">
          <span className="pt-samplemk" aria-hidden="true">i</span>
          {sampleLine}
        </p>
      ) : null}

      {strip ? (
        <Panel className="pt-panel">
          {/* Labelled as a group rather than hidden as an image: the lanes are
              real buttons, and every fact the picture carries is also written
              out in the card underneath it. */}
          {/* The label spans the WHOLE strip, tail included. Built from lanes
              alone it stopped at 13 Feb 27 and left Phase 5 out — the one phase
              the strip states as a rule at the right edge rather than a bar —
              so a screen reader was told a period that contradicted both the
              deck two lines above it and the row underneath. */}
          <div className="pt-strip" role="group"
               aria-label={`Phase schedule, ${fmt(stripStart)} to ${fmt(stripEnd)}${strip.tail.length ? `, including ${strip.tail.length === 1 ? `phase ${strip.tail[0].number}` : `${strip.tail.length} phases`} stated at the right-hand edge` : ''}`}>
            {/* Today's flag sits on its own row so it can never collide with a
                month label. */}
            <div className="pt-flagrow">
              <span className="pt-gutter" aria-hidden="true" />
              <div className={`pt-flagslot ${strip.nowPct < 33 ? 'x-left' : strip.nowPct < 67 ? 'x-mid' : 'x-right'}`}>
                {strip.nowIn ? (
                  <span className={`pt-nowflag${anchorOf(strip.nowPct)}`} style={{ '--x': `${strip.nowPct}%` }}>
                    Today · <time dateTime={nowStr}>{fmt(nowStr)}</time>
                  </span>
                ) : null}
              </div>
            </div>

            <div className="pt-axisrow">
              <span className="pt-gutter" aria-hidden="true" />
              <div className="pt-axis" aria-hidden="true">
                {strip.ticks.map((t, i) => (
                  <React.Fragment key={t.key}>
                    <span className="pt-tick" style={{ '--x': `${strip.pctOf(t.t)}%` }} />
                    {t.label ? (
                      /* `alt` is every second LABELLED tick — the ones a phone
                         drops, so seven months do not print as five and a
                         collision. */
                      <span className={`pt-ticklab${anchorOf(strip.pctOf(t.t))}${i % 2 ? ' alt' : ''}`}
                            style={{ '--x': `${strip.pctOf(t.t)}%` }}>
                        {t.label}
                      </span>
                    ) : null}
                  </React.Fragment>
                ))}
              </div>
            </div>

            <ol className="pt-lanes" role="list">
              {strip.lanes.map(({ phase: p, x, w }) => {
                const m = meterFor(p, nowMs, byDels);
                const isCurrent = current?.id === p.id;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      className={`pt-lane s-${p.state}${isCurrent ? ' is-current' : ''}${openId === p.id ? ' is-open' : ''}`}
                      onClick={() => jumpTo(p.id)}
                      aria-expanded={openId === p.id}
                      aria-controls={`pc-body-${p.id}`}
                    >
                      <span className="pt-gutter pt-lanelab">
                        <span className="pt-lanen" aria-hidden="true">{p.number}</span>
                        <span className="pt-lanename">{p.name}</span>
                      </span>
                      {/* Gridlines and the today line are drawn INSIDE each
                          track rather than as one overlay across the stack:
                          at 390px the label stacks above its track, and an
                          overlay drew the month lines through the phase
                          names. */}
                      <span className="pt-track">
                        {strip.ticks.map((t) => (
                          <span className="pt-grid" key={t.key} aria-hidden="true" style={{ '--x': `${strip.pctOf(t.t)}%` }} />
                        ))}
                        <span className={`pt-bar s-${p.state}`} style={{ '--x': `${x}%`, '--w': `${w}%` }}>
                          {m.pct > 0 ? <span className={`pt-fill k-${m.kind}`} style={{ '--f': `${m.pct}%` }} /> : null}
                        </span>
                        {strip.nowIn ? (
                          <span className="pt-nowline" aria-hidden="true" style={{ '--x': `${strip.nowPct}%` }} />
                        ) : null}
                      </span>
                      {/* The bar's position is the only carrier of the dates in
                          the strip, so they are read out here. */}
                      <span className="sr">
                        {`Phase ${p.number}, ${p.name}, ${range(p.start, p.end)}, ${p.length}, ${STATE_LABEL[p.state]}, ${m.text}.`}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>

            {keyDates.length ? (
              <div className="pt-markrow">
                <span className="pt-gutter pt-marklab">
                  Key dates
                  <span className="sr">
                    {` — ${keyDates.length} of them, listed in full under Scope & cadence.`}
                  </span>
                </span>
                <div className="pt-marks" aria-hidden="true">
                  {keyDates.map((d) => {
                    const p = strip.pctOf(d.t);
                    if (d.t < strip.t0 || d.t > strip.t1) return null;
                    /* Same comparator as `ahead` and nextMilestone: a key date
                       falling today is not behind us. */
                    const isPast = Number.isFinite(nowMs) && d.t < nowMs;
                    const isNext = nextMilestone && nextMilestone.key === d.key;
                    return (
                      <span
                        key={d.key}
                        className={`pt-mark${isPast ? ' is-past' : ''}${isNext ? ' is-next' : ''}`}
                        style={{ '--x': `${p}%` }}
                        title={`${fmt(d.date)} — ${d.what}`}
                      />
                    );
                  })}
                </div>
              </div>
            ) : null}

            {/* The tail. Taken off the axis so the bars above it stay
                comparable, and stated in full rather than dropped. */}
            {strip.tail.map((p) => {
              const isCurrent = current?.id === p.id;
              return (
                <button
                  type="button"
                  key={p.id}
                  className={`pt-tail${isCurrent ? ' is-current' : ''}`}
                  onClick={() => jumpTo(p.id)}
                >
                  <span className="pt-gutter pt-taillab" aria-hidden="true">+ Phase {p.number}</span>
                  <span className="pt-tailbody">
                    <span className="pt-tailrule" aria-hidden="true" />
                    <span className="pt-tailtext">
                      <strong>{p.name}</strong>
                      <span className="num">
                        {' '}<RangeTime a={p.start} b={p.end} />
                      </span>
                      {p.length ? ` · ${p.length}` : ''}
                      {' · extends beyond this range'}
                      {isCurrent ? <span className="pc-now">Current phase</span> : null}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <p className="pt-cap">{cap.join(' ')}</p>
        </Panel>
      ) : null}

      {phases.length ? (
        <ol className="phasetrack pc-stack" role="list">
          {phases.map((p, i) => {
            const isOpen = openId === p.id;
            const isCurrent = current?.id === p.id;
            const m = meterFor(p, nowMs, byDels);
            const timing = timingFor(p, nowMs, nowStr);
            const prev = i > 0 ? phases[i - 1] : null;
            const next = i < phases.length - 1 ? phases[i + 1] : null;
            return (
              <li
                key={p.id}
                id={`pc-card-${p.id}`}
                className={`pc-card s-${p.state}${isOpen ? ' is-open' : ''}${isCurrent ? ' is-current' : ''}`}
                aria-current={isCurrent ? 'step' : undefined}
              >
                <button type="button" className="phasebtn pc-head" aria-expanded={isOpen} aria-controls={`pc-body-${p.id}`}
                        onClick={() => setOpen(isOpen ? '' : p.id)}>
                  <span className="pc-num" aria-hidden="true">{p.state === 'done' ? '✓' : p.number}</span>
                  <span className="pc-mid">
                    <span className="pc-top">
                      <span className="pc-name">
                        <span className="sr">{`Phase ${p.number}: `}</span>
                        {p.name}
                      </span>
                      <StatePill state={p.state} />
                      {isCurrent ? <span className="pc-now">Current phase</span> : null}
                    </span>
                    <span className="pc-when">
                      <span className="num">
                        {p.dated ? <RangeTime a={p.start} b={p.end} /> : 'Dates to be confirmed'}
                      </span>
                      {p.length ? <><span className="pc-sep" aria-hidden="true">·</span><span>{p.length}</span></> : null}
                      {timing ? <><span className="pc-sep" aria-hidden="true">·</span><span className="pc-timing">{timing}</span></> : null}
                      {p.overlaps.length && !isOpen ? (
                        <><span className="pc-sep" aria-hidden="true">·</span>
                        <span className="pc-ovmini">{`runs alongside ${p.overlaps.map((o) => o.name).join(' and ')}`}</span></>
                      ) : null}
                    </span>
                    <span className="pc-prog">
                      <span className={`pc-meter k-${m.kind}`} aria-hidden="true">
                        <i style={{ width: `${m.pct}%` }} />
                      </span>
                      <span className="pc-progt num">{m.text}</span>
                    </span>
                  </span>
                  <span className="pc-chev" aria-hidden="true"><Chevron /></span>
                </button>

                <div className="pc-body" id={`pc-body-${p.id}`} hidden={!isOpen}>
                  {p.purpose ? <p className="pc-purpose">{p.purpose}</p> : null}

                  {p.overlaps.length ? (
                    <ul className="pc-rel" role="list">
                      {p.overlaps.map((o) => (
                        <li key={o.id}>
                          <OverlapIcon />
                          <span>
                            Runs alongside <strong>{o.name}</strong>
                            <span className="pc-relwhen num">
                              <RangeTime a={o.from} b={o.to} /> · {o.length}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {p.note ? (
                    <p className="pc-note">
                      <span className="pc-notel">Note</span>
                      {p.note}
                    </p>
                  ) : null}

                  {p.items.length ? (
                    <div className="pc-dels">
                      <h4 className="eyebrow pc-sub">
                        Deliverables
                        {/* The count repeats here only when the bar is counting
                            ITEMS. Where the bar measures elapsed time, "23% of
                            the window" is not a true label for a list of three
                            things. */}
                        <span className="pc-count num">{m.kind === 'items' ? m.text : `${p.items.length} in this phase`}</span>
                      </h4>
                      <ul className={`pc-list${p.items.length > 6 ? ' is-long' : ''}`} role="list">
                        {p.items.map((d) => (
                          <li key={d.key} className={d.mark ? 'is-done' : ''}>
                            <span className="pc-mk" aria-hidden="true">{d.mark ? '✓' : ''}</span>
                            <span>
                              <span className="sr">{d.mark === true ? 'Done: ' : d.mark === false ? 'To do: ' : ''}</span>
                              {d.name}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {/* Comparing two phases used to take two clicks and a scroll
                      to find the second card. */}
                  {prev || next ? (
                    <div className="pc-nav">
                      {prev ? (
                        <button type="button" onClick={() => jumpTo(prev.id)}>
                          <span aria-hidden="true">←</span> Phase {prev.number} · {prev.name}
                        </button>
                      ) : <span />}
                      {next ? (
                        <button type="button" onClick={() => jumpTo(next.id)}>
                          Phase {next.number} · {next.name} <span aria-hidden="true">→</span>
                        </button>
                      ) : <span />}
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <Panel><p style={{ color: 'var(--ink-2)' }}>The phase plan for this engagement has not been added yet.</p></Panel>
      )}
    </>
  );
}
