import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { isConfigured, slugFromLocation, routeFromLocation, currentSession, signOut } from './lib/supabase.js';
import {
  loadPortal, loadTasks, saveTask, saveTasks, deleteTasks, savePlan, savePortalSettings, watchTasks, listPortals,
  loadEngagement, saveEngagement, watchPortal,
} from './lib/store.js';
import { makeLabels, visibleSections, lower, ALL_SECTIONS } from './lib/labels.js';
import { createEngagementSync } from './lib/engagementSync.js';
import { tidy as tidyEngagement, validate as validateEngagement, describePath } from './lib/engagement.js';

/* The sub-tab's id and the word that goes in the URL. Only Scope differs:
   'agreement' is what the code has always called it, and /paact/scope/cadence
   is what a person would expect to see in an address bar. */
const SUB_SLUG = { timeline: 'timeline', agreement: 'cadence', team: 'team' };
const SUB_ID = { timeline: 'timeline', cadence: 'agreement', team: 'team' };
import { DEMO_SLUG, loadFilePortal, fileBackedSlug } from './lib/demo.js';
import { counts, indexPlan, findingDrives, fmt, pct, today } from './lib/format.js';
import SignIn from './components/SignIn.jsx';
import Masthead from './components/Masthead.jsx';
import { wipeToTheme, resolvedTheme, originOf } from './components/ThemeToggle.jsx';
import Scope, { currentPhaseOf } from './sections/Scope.jsx';
import Plan from './sections/Plan.jsx';
import Findings from './sections/Findings.jsx';
import Workplan from './sections/Workplan.jsx';
import Dashboard from './sections/Dashboard.jsx';
import PlanEditor from './sections/PlanEditor.jsx';
import ScopeEditor from './sections/ScopeEditor.jsx';
import Settings from './components/Settings.jsx';
import Team from './components/Team.jsx';
import DeleteDialog from './components/DeleteDialog.jsx';
import * as E from './lib/planEdit.js';
import { StatusBar } from './components/ui.jsx';
import TaskDrawer from './components/TaskDrawer.jsx';
import ExportMenu from './components/ExportMenu.jsx';
import './styles/app.css';

const CATNAME = { S: 'Strengths', W: 'Weaknesses', O: 'Opportunities', T: 'Threats' };

/* "PAACT (Promise All Atlanta Children Thrive)'s" twice in one sentence reads
   like a mail merge. The parenthetical is for the masthead, once. */
export function shortName(name) {
  return String(name || '').replace(/\s*\([^)]*\)\s*$/, '').trim() || String(name || '');
}

/* The section to open on arrival, or null to stay on `current` (the default,
   or wherever the URL put us). An explicit link wins when the section it names
   is shown here. Otherwise the default stands if it is shown and is this
   client's own — a portal with an adopted plan opens on the plan — and if it
   is not, the first section that IS: /paact shows only section 01, and on a
   portal whose other sections are borrowed, opening on someone else's plan is
   the one thing it must not do. /demo, all borrowed, keeps its default. */
function landingSection(portal, current) {
  const visible = visibleSections(portal, makeLabels(portal)).map((x) => x.id);
  if (visible.includes(routeFromLocation().section)) return null;
  const sample = portal.sampleSections || [];
  const own = visible.filter((id) => !sample.includes(id));
  if (own.includes(current)) return null;
  if (own.length) return own[0];
  return visible.includes(current) ? null : (visible[0] || null);
}

/* A failed save, in words for whoever pressed the button. */
function saveProblem(e) {
  if (e && ['refused', 'gone', 'busy'].includes(e.code)) return e.message;
  const m = String((e && e.message) || '');
  if (/fetch|network|load failed/i.test(m)) return 'The connection dropped, so that change was not saved. Try again.';
  return `That change was not saved${m ? ` (${m})` : ''}.`;
}

const EDIT_WORD = { timeline: 'Edit timeline', agreement: 'Edit scope', team: 'Edit team' };

export default function App() {
  /* State, not a constant: the front door at "/" moves a signed-in person
     straight into the one portal their account can open, without a reload. */
  const [slug, setSlug] = useState(() => slugFromLocation());
  /* Which file-backed portal, if any, serves this slug. /demo and /paact both
     do; a deploy with no project configured falls back to /demo for every slug,
     so a fresh Netlify site shows the product instead of an error.
     `isFile` is "this portal comes from a file, so there is nothing to save to"
     — every store bypass keys off it. `isDemo` is the narrower "this is the
     all-sample /demo portal", which only the banner wording needs. */
  const fileSlug = useMemo(() => fileBackedSlug(slug, { unconfigured: !isConfigured }), [slug]);
  const isFile = Boolean(fileSlug);
  const isDemo = fileSlug === DEMO_SLUG;
  const [session, setSession] = useState(undefined); // undefined = still checking
  const [portal, setPortal] = useState(null);
  const [role, setRole] = useState(null);
  const [reason, setReason] = useState('loading');
  const [tasks, setTasks] = useState([]);
  const [portals, setPortals] = useState([]);

  /* THE URL DECIDES, when it says anything. Opening a portal used to land on
     whatever section the app started on, so a link to a client's portal opened
     their kickoff on section two. */
  const [section, setSection] = useState(() => {
    const r = routeFromLocation();
    return ALL_SECTIONS.includes(r.section) ? r.section : 'plan';
  });
  const [sub, setSub] = useState(() => ({
    scope: SUB_ID[routeFromLocation().sub] || 'timeline',
    plan: 'all', findings: 'ALL', workplan: 'all', dashboard: 'all',
  }));
  const [openTask, setOpenTask] = useState(null);
  const [openTheme, setOpenTheme] = useState(null);
  const [modal, setModal] = useState(null);
  const [saveErr, setSaveErr] = useState(false);
  const [demoNow, setDemoNow] = useState(null);
  const topbarRef = useRef(null);
  /* Editing is a draft held locally until Save. The plan is a document — a
     half-typed vision statement has no business reaching the client's board. */
  const [draft, setDraft] = useState(null);
  /* Tasks as the DRAFT sees them: every structural edit renumbers initiatives,
     and these follow immediately. Composing move maps across many edits is
     error-prone; carrying the tasks along is not. At save we diff against the
     saved tasks and write only what moved. */
  const [draftTasks, setDraftTasks] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deletedIds, setDeletedIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showTeam, setShowTeam] = useState(false);
  /* Section 01's editor: the document as it was when editing began (`base`,
     what the three-way merge measures "my changes" against), the draft, and
     what stopped the last Save if anything did. */
  const [engEdit, setEngEdit] = useState(null);
  /* One line at the foot of the screen: "Saved", or what went wrong. */
  const [toast, setToast] = useState(null);
  const syncRef = useRef(null);

  /* ---- session ---- */
  useEffect(() => {
    if (isFile || !isConfigured) { setSession(null); return; }
    currentSession().then(setSession);
  }, [isFile]);

  /* ---- portal + tasks ---- */
  useEffect(() => {
    if (isFile) {
      let live = true;
      loadFilePortal(slug, { unconfigured: !isConfigured }).then(({ portal, tasks, now, role }) => {
        if (!live) return;
        setPortal(portal);
        setTasks(tasks);
        setDemoNow(now);
        setRole(role);
        setReason('ok');
        const land = landingSection(portal, 'plan');
        if (land) setSection(land);
      });
      return () => { live = false; };
    }
    if (session === undefined) return;
    /* Nobody signed in: the sign-in form renders below, and there is nothing
       to ask the database for until somebody is. */
    if (!session) { setPortal(null); setReason('signed-out'); return; }
    let live = true;
    (async () => {
      /* THE FRONT DOOR. At "/" a signed-in person goes straight into the one
         portal their account can open, or chooses between the several it
         can. Nobody should need to be sent a client's address to start. */
      if (!slug) {
        const list = await listPortals();
        if (!live) return;
        if (list.length === 1) {
          try { window.history.replaceState(null, '', `/${list[0].slug}`); } catch (e) { /* sandboxed */ }
          setSlug(list[0].slug);
          return;
        }
        setPortals(list);
        setPortal(null);
        setReason('pick');
        return;
      }
      const r = await loadPortal(slug);
      if (!live) return;
      setPortal(r.portal);
      setRole(r.role);
      setReason(r.reason);
      if (r.portal) {
        const land = landingSection(r.portal, 'plan');
        if (land) setSection(land);
        const t = await loadTasks(r.portal.id);
        if (live) setTasks(t);
      } else {
        const list = await listPortals();
        if (live) setPortals(list);
      }
    })();
    return () => { live = false; };
  }, [slug, session, isFile]);

  /* Subscribe once per portal, in an effect, never during render. */
  useEffect(() => {
    if (!portal || isFile) return;
    return watchTasks(portal.id, (ev) => {
      setTasks((prev) => {
        if (ev.type === 'delete') return prev.filter((t) => t.id !== ev.id);
        const i = prev.findIndex((t) => t.id === ev.task.id);
        if (i < 0) return [...prev, ev.task];
        const next = prev.slice();
        next[i] = ev.task;
        return next;
      });
    });
  }, [portal?.id, isFile]);

  const labels = useMemo(() => makeLabels(portal), [portal]);
  const sections = useMemo(() => visibleSections(portal, labels), [portal, labels]);
  /* A portal created by its client SQL holds an empty plan and findings ({})
     until they are written, and Settings can switch those sections on before
     then. Every section reads them through these defaults rather than each
     guarding on its own. */
  const plan = useMemo(
    () => ({ vision: '', framing: '', priorities: [], track: null, ...(portal?.plan || {}) }),
    [portal?.plan],
  );
  const findings = useMemo(
    () => ({ themes: [], quotes: [], meta: {}, ...(portal?.findings || {}) }),
    [portal?.findings],
  );
  const { byInit, priorityOf } = useMemo(() => indexPlan(plan), [plan]);
  const drives = useMemo(() => findingDrives(plan), [plan]);
  const themeById = useMemo(() => {
    const m = {};
    (findings.themes || []).forEach((t) => { m[t.id] = t; });
    return m;
  }, [findings]);

  const canEdit = role === 'owner' || role === 'staff';
  /* Section 01 is edited in place by a portal's owners — on a database
     portal only. A file has nowhere to save to, and /demo's timeline stays
     what it was: a picture of the format. */
  const canEditEng = !isFile && role === 'owner';
  const engEditing = engEdit !== null;
  const now = demoNow || today();

  const topTasks = useMemo(() => tasks.filter((t) => !t.parent), [tasks]);
  const subsOf = useCallback((id) => tasks.filter((t) => t.parent === id), [tasks]);

  const scopeId = sub[section] || 'all';
  const inScope = useCallback(
    (t) => scopeId === 'all' || priorityOf[t.init]?.id === scopeId,
    [scopeId, priorityOf],
  );
  const scopedTop = useMemo(() => topTasks.filter(inScope), [topTasks, inScope]);
  const scopedPriorities = useMemo(
    () => (scopeId === 'all' ? plan.priorities || [] : (plan.priorities || []).filter((p) => p.id === scopeId)),
    [plan, scopeId],
  );

  const onSave = useCallback(
    async (id, patch) => {
      const cur = tasks.find((t) => t.id === id);
      if (!cur) return;
      const next = { ...cur, ...patch };
      setTasks((prev) => prev.map((t) => (t.id === id ? next : t)));
      setSaveErr(false);
      if (isFile) return; // nothing to save to, and the banner says so
      try {
        await saveTask(portal.id, next);
      } catch {
        setSaveErr(true);
      }
    },
    [tasks, portal, isFile],
  );

  const goTheme = useCallback((id) => {
    setOpenTheme(id);
    setSection('findings');
    setSub((s) => ({ ...s, findings: 'ALL' }));
    setOpenTask(null);
    window.scrollTo(0, 0);
  }, []);

  const goInitiative = useCallback(
    (id) => {
      const p = priorityOf[id];
      setSection('plan');
      setSub((s) => ({ ...s, plan: p ? p.id : 'all' }));
      setOpenTheme(null);
      setOpenTask(null);
      requestAnimationFrame(() => {
        const el = document.getElementById(`init-${id}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        else window.scrollTo(0, 0);
      });
    },
    [priorityOf],
  );

  const goTasks = useCallback(
    (id) => {
      const p = priorityOf[id];
      setSection('workplan');
      setSub((s) => ({ ...s, workplan: p ? p.id : 'all' }));
      setOpenTheme(null);
      setOpenTask(null);
      requestAnimationFrame(() => {
        const el = document.getElementById(`ig-${id}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    },
    [priorityOf],
  );

  const isOwner = role === 'owner';
  const editing = draft !== null;

  const startEdit = useCallback(() => {
    setDraft(JSON.parse(JSON.stringify(plan)));
    setDraftTasks(tasks.map((t) => ({ ...t })));
    setDeletedIds([]);
    setSaveMsg('');
    setSection('plan');
    window.scrollTo(0, 0);
  }, [plan, tasks]);

  const discardEdit = useCallback(() => {
    setDraft(null);
    setDraftTasks(null);
    setDeletedIds([]);
    setPendingDelete(null);
  }, []);

  /* Any edit that renumbers. The move map is applied to the draft tasks in the
     same breath — dropping it is how a reorder leaves work under the wrong
     heading, which is the exact failure this whole path exists to prevent. */
  const applyStructural = useCallback((result) => {
    setDraft(result.plan);
    if (result.moves && Object.keys(result.moves).length) {
      setDraftTasks((prev) =>
        (prev || []).map((t) => (result.moves[t.init] ? { ...t, init: result.moves[t.init] } : t)));
    }
  }, []);

  /* A structural delete resolves its tasks against the ids as they are NOW,
     before any renumbering — see lib/planEdit.js. The resulting task writes and
     deletes ride along with the draft until Save. */
  const confirmDelete = useCallback(
    (disposition) => {
      const t = pendingDelete;
      const current = draftTasks || [];
      const result = t.kind === 'priority'
        ? E.removePriority(draft, current, t.id, disposition)
        : E.removeInitiative(draft, current, t.id, disposition);

      const gone = new Set(result.taskDeletes);
      // A subtask goes wherever its parent goes; the database cascades too.
      current.forEach((x) => { if (x.parent && gone.has(x.parent)) gone.add(x.id); });

      const rewritten = new Map(E.pendingTaskWrites(current, result).map((x) => [x.id, x]));
      setDraft(result.plan);
      setDraftTasks(current.filter((x) => !gone.has(x.id)).map((x) => rewritten.get(x.id) || x));
      setDeletedIds((prev) => [...new Set([...prev, ...gone])]);
      setPendingDelete(null);
    },
    [pendingDelete, draft, draftTasks],
  );

  const savePlanDraft = useCallback(async () => {
    setSaving(true);
    setSaveMsg('');
    try {
      /* One last renumber in case anything is out of step, carrying the draft
         tasks with it — then write only the rows that actually differ. */
      const { plan: finalPlan, moves } = E.renumber(draft);
      const current = (draftTasks || []).map((t) => (moves[t.init] ? { ...t, init: moves[t.init] } : t));

      const before = new Map(tasks.map((t) => [t.id, t]));
      const gone = new Set(deletedIds);
      const writes = current.filter((t) => {
        const was = before.get(t.id);
        return !was || JSON.stringify(was) !== JSON.stringify(t);
      });

      const orphans = E.orphanedTasks(finalPlan, current);
      if (orphans.length) {
        throw new Error(
          `${orphans.length} task${orphans.length === 1 ? '' : 's'} would be left without an ${lower(labels.initiative)}. Nothing was saved.`,
        );
      }

      if (gone.size) await deleteTasks(portal.id, [...gone]);
      if (writes.length) await saveTasks(portal.id, writes);
      await savePlan(portal.id, finalPlan);

      setPortal((p) => ({ ...p, plan: finalPlan }));
      setTasks(current);
      setDraft(null);
      setDraftTasks(null);
      setDeletedIds([]);
      setSaveMsg(
        `Saved${writes.length ? ` · ${writes.length} task${writes.length === 1 ? '' : 's'} followed` : ''}` +
        `${gone.size ? ` · ${gone.size} deleted` : ''}`,
      );
    } catch (e) {
      setSaveMsg(e.message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  }, [draft, draftTasks, tasks, deletedIds, portal, labels]);

  /* The sticky header's height is not knowable in CSS: the masthead wraps at
     narrow widths and the demo banner comes and goes. Measure it, publish it as
     --topbar-h, and let the rail position itself from that. */
  useLayoutEffect(() => {
    const el = topbarRef.current;
    if (!el) return;
    const apply = () =>
      document.documentElement.style.setProperty('--topbar-h', `${Math.round(el.getBoundingClientRect().height)}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  });

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (showTeam) setShowTeam(false);
      else if (pendingDelete) setPendingDelete(null);
      else if (showSettings) setShowSettings(false);
      else if (modal) setModal(null);
      else if (openTask) setOpenTask(null);
      else if (openTheme) setOpenTheme(null);
      // Escape never discards a draft; that needs the explicit Discard button.
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal, openTask, openTheme, pendingDelete, showSettings, showTeam]);

  useEffect(() => {
    if (!editing && !engEditing) return;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [editing, engEditing]);

  /* ---- gates ---- */
  /* THESE THREE MUST STAY ABOVE THE EARLY RETURNS BELOW. They lived beside
     the rest of the sample logic further down, which put them after the
     loading and sign-in returns — so they ran on the full render and not on
     the others, and React counted a different number of hooks between renders
     and blanked the page (error #310). The values they need are derived inside
     the effect for the same reason: deriving them above would mean moving more
     code up here rather than less.

     Where the circle grows from is held in a ref because the swap runs in an
     effect, after the section has changed, by which time the click event is
     long gone. */
  /* KEEP THE ADDRESS BAR HONEST, both ways.

     Writing: every section or sub-tab change pushes /portal/section/sub, so a
     section can be sent to a board ahead of a meeting and the browser's own
     back button works — without it, Back leaves the portal entirely, which on
     a five-section document is the wrong thing on every press but the first.

     Reading: popstate puts the state back where the URL says. replaceState on
     the first render rather than push, so the entry the person arrived on is
     corrected rather than duplicated. */
  useEffect(() => {
    const onPop = () => {
      const r = routeFromLocation();
      if (ALL_SECTIONS.includes(r.section)) setSection(r.section);
      if (SUB_ID[r.sub]) setSub((v) => ({ ...v, scope: SUB_ID[r.sub] }));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [slug]);

  const firstUrlWrite = useRef(true);
  useEffect(() => {
    /* fileSlug, not slug. Visiting the bare site root with no Supabase project
       configured falls back to the demo — correct, a fresh deploy should show
       the product rather than an error — but it did so at "/", a URL that says
       nothing about whose content it is. Someone opening the root saw another
       client's plan under a masthead bearing that client's name and reasonably
       concluded the portal was broken. With a QR code pointing at a slide, a
       whole room would do it at once. The address bar now says /demo, which is
       true, and matches the banner. */
    const base = fileSlug || slug;
    if (!base || reason !== 'ok') return;
    const tail = section === 'scope' ? `/${SUB_SLUG[sub.scope] || 'timeline'}` : '';
    const next = `/${base}/${section}${tail}`;
    if (window.location.pathname === next) return;
    try {
      if (firstUrlWrite.current) window.history.replaceState(null, '', next);
      else window.history.pushState(null, '', next);
    } catch (e) {
      /* A sandboxed or file:// context refuses history writes. The app is
         perfectly usable without the address bar following along. */
    }
    firstUrlWrite.current = false;
  }, [slug, fileSlug, reason, section, sub.scope]);

  const wipeOrigin = useRef(null);
  const pickSection = useCallback((id, ev) => {
    wipeOrigin.current = originOf(ev);
    setSection(id);
    setOpenTask(null);
    window.scrollTo(0, 0);
  }, []);
  useEffect(() => {
    const ss = Array.isArray(portal?.sampleSections) ? portal.sampleSections : [];
    const all = Array.isArray(portal?.sections) ? portal.sections : [];
    /* Mixed only: on /demo everything is borrowed and on a real client portal
       nothing is, and in both of those a theme that never changes says
       nothing. Leave the person's own preference alone there. */
    if (!(isFile && !isDemo && ss.length > 0 && ss.length < all.length)) return;
    const want = ss.includes(section) ? 'dark' : 'light';
    if (resolvedTheme() === want) return;
    wipeToTheme(want, wipeOrigin.current, { persist: false });
    wipeOrigin.current = null;
  }, [portal, section, isFile, isDemo]);

  /* ---- section 01, kept in step with everyone else editing it ----
     One sync per database portal (lib/engagementSync.js): ticks and statuses
     are shown at once and saved behind, and a save that loses a race with a
     colleague is replayed onto their version rather than replacing it. The
     screen learns that somebody else saved from realtime, and — because a
     realtime socket can drop without a word — again whenever the tab is
     looked at. */
  useEffect(() => {
    if (!portal || isFile) { syncRef.current = null; return undefined; }
    const id = portal.id;
    const sync = createEngagementSync({
      load: () => loadEngagement(id),
      save: (doc, seen) => saveEngagement(id, doc, seen),
      onView: (engagement, server) => setPortal((p) => (p && p.id === id
        ? { ...p, engagement, updated_at: server.updated_at } : p)),
      onError: (e) => { setSaveErr(true); setToast({ kind: 'error', text: saveProblem(e) }); },
      onSaved: () => setSaveErr(false),
    });
    sync.reset({ engagement: portal.engagement, updated_at: portal.updated_at });
    syncRef.current = sync;
    const stop = watchPortal(id, () => sync.refresh());
    const look = () => { if (document.visibilityState !== 'hidden') sync.refresh(); };
    document.addEventListener('visibilitychange', look);
    window.addEventListener('focus', look);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', look);
      window.removeEventListener('focus', look);
      if (syncRef.current === sync) syncRef.current = null;
    };
    // The sync is per portal, not per render: portal.engagement changes on
    // every tick, and rebuilding the sync then would drop its queue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portal?.id, isFile]);

  const onEngOp = useCallback((op) => {
    setToast(null);
    if (syncRef.current) syncRef.current.apply(op);
  }, []);

  const startEngEdit = useCallback(() => {
    const cur = syncRef.current ? syncRef.current.view() : null;
    if (!cur) return;
    const doc = tidyEngagement(cur);
    setEngEdit({ base: doc, draft: doc, problems: [], conflict: null });
    setSection('scope');
    setToast(null);
    window.scrollTo(0, 0);
  }, []);

  const [engSaving, setEngSaving] = useState(false);
  const saveEngEdit = useCallback(async (prefer = null) => {
    if (!engEdit || !syncRef.current) return;
    const problems = validateEngagement(engEdit.draft);
    if (problems.length) {
      setEngEdit((x) => ({ ...x, problems, conflict: null }));
      window.scrollTo(0, 0);
      return;
    }
    setEngSaving(true);
    try {
      const r = await syncRef.current.saveDraft(engEdit.base, engEdit.draft, { prefer });
      if (r.ok) {
        setEngEdit(null);
        setToast({ kind: 'ok', text: r.unchanged ? 'Nothing had changed, so nothing was saved.' : 'Saved. Everyone with access now sees this.' });
      } else {
        setEngEdit((x) => ({
          ...x,
          problems: [],
          conflict: {
            paths: [...new Set(r.conflicts.map((path) => describePath(path, r.mine, r.theirs)))],
            theirs: r.theirs,
            merged: r.merged,
          },
        }));
        window.scrollTo(0, 0);
      }
    } catch (e) {
      setEngEdit((x) => (x ? { ...x, problems: [saveProblem(e)], conflict: null } : x));
    } finally {
      setEngSaving(false);
    }
  }, [engEdit]);

  /* "Use theirs": the colleague's version becomes what this person is editing
     from, with every change of theirs that did NOT collide still applied. */
  const takeTheirs = useCallback(() => {
    setEngEdit((x) => (x && x.conflict
      ? { base: x.conflict.theirs, draft: x.conflict.merged, problems: [], conflict: null } : x));
  }, []);

  /* A confirmation fades; an error stays until it is dismissed or replaced. */
  useEffect(() => {
    if (!toast || toast.kind !== 'ok') return undefined;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  /* Settings can hide the section someone is on. Move them to one that shows. */
  useEffect(() => {
    if (!portal || !sections.length) return;
    if (!sections.some((x) => x.id === section)) setSection(sections[0].id);
  }, [portal, sections, section]);

  if (session === undefined || reason === 'loading') return <Splash>Loading…</Splash>;

  if (!isFile && !isConfigured) {
    return (
      <Splash title="No project configured">
        This deploy has no <code>VITE_SUPABASE_URL</code>. Set it and{' '}
        <code>VITE_SUPABASE_ANON_KEY</code> on the Netlify site, then redeploy.
      </Splash>
    );
  }
  if (!isFile && !session) return <SignIn slug={slug} onSignedIn={setSession} />;
  if (isFile && !portal) return <Splash>Loading…</Splash>;
  if (!portal) {
    const who = session?.user?.email || 'this account';
    const out = (
      <div style={{ marginTop: 14 }}>
        <button className="ghost" onClick={() => signOut().then(() => setSession(null))}>Sign out</button>
      </div>
    );
    const list = (
      <ul className="portalpick">
        {portals.map((p) => (
          <li key={p.slug}>
            <a href={`/${p.slug}`}>
              <strong>{p.client_name}</strong>
              <span>{p.engagement_name}</span>
            </a>
          </li>
        ))}
      </ul>
    );
    if (!slug) {
      return (
        <Splash title={portals.length ? 'Choose a portal' : 'No portals yet'}>
          {portals.length ? (
            <>{list}{out}</>
          ) : (
            <>
              You are signed in as <strong>{who}</strong>, but this account has not been given access
              to a portal yet. Whoever invited you can add you from the portal&rsquo;s Access screen.
              If you meant to use a different address, sign out and try that one.
              {out}
            </>
          )}
        </Splash>
      );
    }
    return (
      <Splash title="Nothing here for this account">
        {portals.length ? (
          <>
            <p>You are signed in as <strong>{who}</strong>, which can open:</p>
            {list}
            {out}
          </>
        ) : (
          <>
            This account cannot reach a portal at <code>/{slug}</code>. If you were sent this link,
            ask for access; if you signed in with the wrong address, sign out and try the other one.
            {out}
          </>
        )}
      </Splash>
    );
  }

  const shared = {
    portal, plan, findings, labels, themeById, drives, byInit, priorityOf,
    tasks, topTasks, subsOf, scopedTop, scopedPriorities, scopeId, inScope,
    canEdit, now, onSave, goTheme, goInitiative, goTasks,
    openTheme, setOpenTheme, openTask, setOpenTask, CATNAME,
    canEditEng: canEditEng && !engEditing, onEngOp,
  };

  /* Sample marking, for the bar below the masthead. `sampleSections` is data on
     the portal, so a portal with nothing borrowed shows none of this. */
  const sampleSections = Array.isArray(portal.sampleSections) ? portal.sampleSections : [];
  const sampleHere = sampleSections.includes(section);
  /* Read aloud, "PAACT (Promise All Atlanta Children Thrive)'s" twice in one
     sentence is a mail merge. The parenthetical earns its place in the masthead,
     once, and nowhere else. */
  const shortClient = shortName(portal.client_name);
  const sampleName = portal.sampleClient?.name || 'another engagement';
  /* The rail is on screen on EVERY tab, including the one section that is this
     client's own. A figure in it drawn from the borrowed workplan is therefore
     attributed to this client with nothing beside it to say otherwise: the
     banner and the Scope sentence both enumerate SECTIONS, and the rail is not
     one of them. On the all-sample /demo the banner covers the whole page, so
     this only applies to a MIXED portal. */
  const sampleWorkplan = sampleSections.includes('workplan') && !isDemo;
  /* A MIXED portal: some sections are this client's, some are borrowed. On one
     of those the theme stops being a preference and becomes a signal — their
     own section is light, the borrowed ones are dark — so crossing between
     them is a thing you feel rather than a caption you have to read.

     The manual toggle is hidden here, and that is the deliberate cost: a theme
     that means "whose content is this" cannot also mean "what I find easier to
     read", because the moment someone pins dark the signal reads "borrowed" on
     every page and stops being true. Everywhere else the toggle is untouched. */
  const mixedPortal = isFile && !isDemo && sampleSections.length > 0 && sampleSections.length < sections.length;

  const Body = { scope: Scope, plan: Plan, findings: Findings, workplan: Workplan, dashboard: Dashboard }[section];
  /* While editing, §2 becomes the same layout with fields in it. */
  const showEditor = editing && section === 'plan';
  const showEngEditor = engEditing && section === 'scope';
  const planShown = sections.some((x) => x.id === 'plan');
  const overall = counts(topTasks, now);

  return (
    <>
      <div className="topbar" ref={topbarRef}>
      <Masthead
        portal={portal}
        labels={labels}
        role={role}
        session={session}
        saveErr={saveErr}
        isFile={isFile}
        isDemo={isDemo}
        sampleHere={sampleHere}
        showTheme={!mixedPortal}
        onSignOut={() => signOut().then(() => setSession(null))}
      />
      {isDemo ? (
        <div className="demobar">
          <strong>Demo</strong>
          {/* A phone cannot spend four lines of a sticky header on this. */}
          <span className="demobar-long">
            Sample content for a strategic planning engagement. The tools are live —
            open a task, complete a subtask, edit the plan. Nothing is saved, and no
            client data is present.
          </span>
          <span className="demobar-short">Sample content. Not saved.</span>
        </div>
      ) : null}
      {isFile && !isDemo && sampleHere ? (
        /* ONLY on a borrowed section. The client's own section carries no bar
           at all — a banner on every page is a banner nobody reads, and here
           the bar's PRESENCE is the message: it appears at the same moment the
           masthead changes name and the page goes dark. Three signals, one
           crossing. */
        <div className="demobar is-sample">
          <strong>Demo data</strong>
          <span className="demobar-long">
            {/* No section label in the sentence: the five labels are a mixed
                bag of nouns ("The plan", "Findings", "Workplan") and any
                template that fits one reads as a typo in another — "Findings
                shows their plan". Naming the two organisations is the part
                that matters anyway. */}
            {`This page shows ${sampleName}'s content, not ${shortClient}'s. It is an illustration of the format. Nothing here is saved.`}
          </span>
          <span className="demobar-short">{`Demo data — not ${shortClient}'s.`}</span>
        </div>
      ) : null}

      <nav className="tabstrip" aria-label="Sections">
        {sections.map((s) => (
          <button key={s.id} aria-current={section === s.id} onClick={(e) => pickSection(s.id, e)}>
            {s.title}
          </button>
        ))}
      </nav>

      <SubNav
        section={section} sub={sub} setSub={setSub} plan={plan} labels={labels}
        findings={findings} topTasks={topTasks} priorityOf={priorityOf}
        setOpenTheme={setOpenTheme} onExport={() => setModal('export')} CATNAME={CATNAME}
        isOwner={isOwner} editing={editing || engEditing} onEdit={startEdit}
        canEditPlan={planShown} canEditEng={canEditEng} onEditEng={startEngEdit}
        onSettings={() => setShowSettings(true)} onTeam={() => setShowTeam(true)} isFile={isFile}
      />
      {editing ? (
        <div className="savebar">
          <span className="eyebrow">Editing the plan</span>
          <span className="savehint">
            {deletedIds.length
              ? `${deletedIds.length} row${deletedIds.length === 1 ? '' : 's'} will be deleted on save`
              : 'Nothing is saved until you press Save'}
          </span>
          <span style={{ flex: '1 1 auto' }} />
          {saveMsg ? <span className="savemsg">{saveMsg}</span> : null}
          <button className="ghost" onClick={discardEdit} disabled={saving}>Discard</button>
          <button className="solid" onClick={savePlanDraft} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      ) : null}
      {engEditing ? (
        <div className="savebar">
          <span className="eyebrow">Editing {lower(labels.scope)}</span>
          <span className="savehint">Nothing is saved until you press Save</span>
          <span style={{ flex: '1 1 auto' }} />
          <button className="ghost" onClick={() => setEngEdit(null)} disabled={engSaving}>Discard</button>
          <button className="solid" onClick={() => saveEngEdit(null)} disabled={engSaving}>
            {engSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      ) : null}
      </div>

      <div className="layout">
        <aside className="rail">
          <nav className="railnav" aria-label="Sections">
            {sections.map((s) => (
              <button key={s.id} aria-current={section === s.id} onClick={(e) => pickSection(s.id, e)}>
                <span className="rn-n">{s.n}</span>
                <span className="rn-t">{s.title}</span>
                <span className="rn-c">{s.id === 'workplan' && !sampleWorkplan ? `${overall.done}/${overall.total}` : ''}</span>
              </button>
            ))}
          </nav>
          <RailCards portal={portal} overall={overall} labels={labels} now={now} sampleWorkplan={sampleWorkplan}
                     workplanShown={sections.some((x) => x.id === 'workplan')} />
        </aside>
        <main className="main">
          <div className="wrap">
            {showEditor ? (
              <PlanEditor
                draft={draft} setDraft={setDraft} onStructural={applyStructural}
                tasks={draftTasks || []} labels={labels}
                findings={findings} themeById={themeById} CATNAME={CATNAME}
                onStructuralDelete={setPendingDelete}
              />
            ) : showEngEditor ? (
              <ScopeEditor
                view={sub.scope} labels={labels} draft={engEdit.draft}
                setDraft={(next) => setEngEdit((x) => (x ? { ...x, draft: next } : x))}
                problems={engEdit.problems} conflict={engEdit.conflict} saving={engSaving}
                onKeepMine={() => saveEngEdit('mine')} onUseTheirs={takeTheirs}
              />
            ) : (
              <Body {...shared} />
            )}
          </div>
        </main>
      </div>

      {openTask ? (
        <TaskDrawer
          task={tasks.find((t) => t.id === openTask)}
          {...shared}
          onClose={() => setOpenTask(null)}
        />
      ) : null}
      {modal === 'export' ? (
        <ExportMenu {...shared} section={section} onClose={() => setModal(null)} />
      ) : null}
      {pendingDelete ? (
        <DeleteDialog
          target={pendingDelete} tasks={draftTasks || []} draft={draft} labels={labels}
          onCancel={() => setPendingDelete(null)} onConfirm={confirmDelete}
        />
      ) : null}
      {showTeam ? (
        <Team portal={portal} onClose={() => setShowTeam(false)}
              canTagFirm={session?.user?.app_metadata?.gw_tenant === '*'} />
      ) : null}
      {toast ? (
        <div className={`toast${toast.kind === 'error' ? ' is-error' : ''}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
          <span>{toast.text}</span>
          <button className="ghost" onClick={() => setToast(null)}>{toast.kind === 'error' ? 'Dismiss' : 'OK'}</button>
        </div>
      ) : null}
      {showSettings ? (
        <Settings
          portal={portal} labels={labels}
          onSave={async (fields) => {
            await savePortalSettings(portal.id, fields);
            setPortal((p) => ({ ...p, ...fields }));
          }}
          onClose={() => setShowSettings(false)}
        />
      ) : null}
    </>
  );
}

function SubNav({ section, sub, setSub, plan, labels, findings, topTasks, priorityOf, setOpenTheme, onExport, CATNAME, isOwner, editing, onEdit, canEditPlan, canEditEng, onEditEng, onSettings, onTeam, isFile }) {
  const cur = sub[section];
  const pick = (v) => { setSub((s) => ({ ...s, [section]: v })); setOpenTheme(null); window.scrollTo(0, 0); };
  const B = ({ v, children, count }) => (
    <button data-sub={v} aria-current={cur === v} onClick={() => pick(v)}>
      {children}
      {count != null ? <span className="num subcount">{count}</span> : null}
    </button>
  );

  let items;
  if (section === 'scope') {
    items = (<><B v="timeline">Timeline</B><B v="agreement">Scope &amp; cadence</B><B v="team">Team</B></>);
  } else if (section === 'findings') {
    const by = { ALL: (findings.themes || []).length, S: 0, W: 0, O: 0, T: 0 };
    (findings.themes || []).forEach((t) => { by[t.cat]++; });
    items = (
      <>
        <B v="ALL" count={by.ALL}>All themes</B>
        <span className="sn-sep" />
        {['S', 'W', 'O', 'T'].map((k) => <B key={k} v={k} count={by[k]}>{CATNAME[k]}</B>)}
      </>
    );
  } else {
    const showN = section !== 'plan';
    items = (
      <>
        <B v="all" count={showN ? topTasks.length : null}>Whole plan</B>
        <span className="sn-sep" />
        {(plan.priorities || []).map((p) => (
          <B key={p.id} v={p.id} count={showN ? topTasks.filter((t) => priorityOf[t.init] === p).length : null}>
            {labels.priorityShort} {p.n}
          </B>
        ))}
      </>
    );
  }

  return (
    <nav className="subnav" aria-label="Within this section">
      <div className="subnav-in" id="subnav">
        {items}
        <span className="sn-spacer" />
        {isOwner && !editing ? (
          <>
            {/* The edit that matches what is on screen. On section 01 of a
                database portal that is its own editor, named for the tab;
                "Edit plan" appears only where a plan is shown at all. */}
            {section === 'scope' && canEditEng ? (
              <button className="ghost" onClick={onEditEng}>{EDIT_WORD[sub.scope] || 'Edit'}</button>
            ) : canEditPlan ? (
              <button className="ghost" onClick={onEdit}>Edit plan</button>
            ) : null}
            {/* A file-backed portal has no accounts behind it, so there is
                nobody to manage. */}
            {!isFile ? <button className="ghost" onClick={onTeam}>Access</button> : null}
            <button className="ghost" onClick={onSettings}>Settings</button>
          </>
        ) : null}
        {['plan', 'workplan', 'dashboard'].includes(section) && !editing ? (
          <button className="ghost" onClick={onExport}>Export ▾</button>
        ) : null}
      </div>
    </nav>
  );
}

function RailCards({ portal, overall, labels, now, sampleWorkplan, workplanShown }) {
  const eng = portal.engagement || {};
  /* Where we are, resolved from the DATES by the same exported rule the Timeline
     uses — Scope.jsx's currentPhaseOf(). This used to read the static status
     string, which stops being true the day a phase's window closes: on 1 October
     the Timeline said "Phase 2 · Discovery" while the rail beside it still said
     Phase 1. Two answers to "where are we" in one viewport. */
  const phase = currentPhaseOf(eng, now);
  /* A figure that is THIS client's: how much of the phase we are actually in has
     been delivered. Only when every deliverable in that phase carries a flag —
     a list of untracked strings reported as "0 of 7 done" would be a number the
     client never produced. */
  const del = phase && phase.items && phase.items.length && phase.tracked === phase.items.length
    ? { done: phase.doneN, total: phase.items.length }
    : null;
  return (
    <>
      <div className="railcard">
        <h4 className="eyebrow">Engagement</h4>
        <dl className="deflist">
          {eng.firm?.name ? (<><dt>Firm</dt><dd>{eng.firm.name}</dd></>) : null}
          {eng.firm?.lead ? (<><dt>Lead</dt><dd>{eng.firm.lead}</dd></>) : null}
          {phase ? (<><dt>Phase</dt><dd>{phase.n} · {phase.name}</dd></>) : null}
          {/* fmt, not the raw string: this is the only ISO-8601 date a client
              would ever have seen, two inches from a flag reading "23 Sep 26". */}
          <dt>Today</dt><dd className="num">{fmt(now)}</dd>
        </dl>
      </div>
      {(sampleWorkplan || !workplanShown) && del ? (
        /* No workplan of this client's to count — it is another engagement's
           sample, or it does not exist yet, and "0 of 0 done" is a number
           about nothing. The phase we are in is this client's, counted from
           their own deliverables. */
        <div className="railcard">
          <h4 className="eyebrow">Phase {phase.n} · {phase.name}</h4>
          <div className="pb-row">
            <span className="num railpct">{pct(del.done, del.total)}%</span>
            <span className="eyebrow">{del.done} of {del.total} delivered</span>
          </div>
          <StatusBar c={{ done: del.done, next: del.total - del.done }} total={del.total} />
        </div>
      ) : !workplanShown ? null : (
        <div className="railcard">
          {/* Nothing here is this client's if the workplan is borrowed, and there
              is no phase count to put in its place — so the card says whose
              numbers these are, in the heading, where the numbers are. */}
          <h4 className="eyebrow">{sampleWorkplan ? 'Year one · sample workplan' : 'Year one'}</h4>
          <div className="pb-row">
            <span className="num railpct">{pct(overall.done, overall.total)}%</span>
            <span className="eyebrow">{overall.done} of {overall.total} done</span>
          </div>
          <StatusBar c={overall} total={overall.total} />
          {overall.late ? (
            <div className="num raillate">{overall.late} past due</div>
          ) : null}
        </div>
      )}
    </>
  );
}

function Splash({ title, children }) {
  return (
    <div className="splash">
      <div className="splash-card">
        {title ? <h1>{title}</h1> : null}
        <div>{children}</div>
      </div>
    </div>
  );
}
