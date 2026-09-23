import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { isConfigured, slugFromLocation, currentSession, signOut } from './lib/supabase.js';
import { loadPortal, loadTasks, saveTask, saveTasks, deleteTasks, savePlan, savePortalSettings, watchTasks, listPortals } from './lib/store.js';
import { makeLabels, visibleSections, lower } from './lib/labels.js';
import { DEMO_SLUG, loadFilePortal, fileBackedSlug } from './lib/demo.js';
import { counts, indexPlan, findingDrives, fmt, pct, today } from './lib/format.js';
import SignIn from './components/SignIn.jsx';
import Masthead from './components/Masthead.jsx';
import Scope, { currentPhaseOf } from './sections/Scope.jsx';
import Plan from './sections/Plan.jsx';
import Findings from './sections/Findings.jsx';
import Workplan from './sections/Workplan.jsx';
import Dashboard from './sections/Dashboard.jsx';
import PlanEditor from './sections/PlanEditor.jsx';
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

export default function App() {
  const slug = useMemo(() => slugFromLocation(), []);
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

  const [section, setSection] = useState('plan');
  const [sub, setSub] = useState({ scope: 'timeline', plan: 'all', findings: 'ALL', workplan: 'all', dashboard: 'all' });
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
        /* Land on the first section that is this client's OWN content. On
           /paact that is Scope & timeline: the other four are another
           engagement's sample, and opening a kickoff on someone else's plan
           is the one thing this portal must not do. */
        const sample = portal.sampleSections || [];
        const own = (portal.sections || []).find((id) => !sample.includes(id));
        if (own) setSection(own);
      });
      return () => { live = false; };
    }
    if (session === undefined) return;
    let live = true;
    (async () => {
      const r = await loadPortal(slug);
      if (!live) return;
      setPortal(r.portal);
      setRole(r.role);
      setReason(r.reason);
      if (r.portal) {
        const t = await loadTasks(r.portal.id);
        if (live) setTasks(t);
      }
      if (session) setPortals(await listPortals());
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
  const plan = portal?.plan || {};
  const findings = portal?.findings || { themes: [], quotes: [], meta: {} };
  const { byInit, priorityOf } = useMemo(() => indexPlan(plan), [plan]);
  const drives = useMemo(() => findingDrives(plan), [plan]);
  const themeById = useMemo(() => {
    const m = {};
    (findings.themes || []).forEach((t) => { m[t.id] = t; });
    return m;
  }, [findings]);

  const canEdit = role === 'owner' || role === 'staff';
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
    if (!editing) return;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [editing]);

  /* ---- gates ---- */
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
    return (
      <Splash title={slug ? 'Nothing here for this account' : 'Pick a portal'}>
        {portals.length ? (
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
        ) : (
          <>
            This account cannot reach a portal at <code>/{slug}</code>. If you were sent this link,
            ask for access; if you signed in with the wrong address, sign out and try the other one.
            <div style={{ marginTop: 14 }}>
              <button className="ghost" onClick={() => signOut().then(() => setSession(null))}>Sign out</button>
            </div>
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
  };

  /* Sample marking, for the bar below the masthead. `sampleSections` is data on
     the portal, so a portal with nothing borrowed shows none of this. */
  const sampleSections = Array.isArray(portal.sampleSections) ? portal.sampleSections : [];
  const sampleHere = sampleSections.includes(section);
  const sampleTabs = sections.filter((s) => sampleSections.includes(s.id)).map((s) => s.title);
  /* Read aloud, "PAACT (Promise All Atlanta Children Thrive)'s" twice in one
     sentence is a mail merge. The parenthetical earns its place in the masthead,
     once, and nowhere else. */
  const shortClient = shortName(portal.client_name);
  /* "The plan, Findings, Workplan, Dashboard" is a list that trails off; a
     reader hears a missing item. */
  const sampleList = sampleTabs.length > 1
    ? `${sampleTabs.slice(0, -1).join(', ')} and ${sampleTabs[sampleTabs.length - 1]}`
    : sampleTabs[0] || '';
  /* The rail is on screen on EVERY tab, including the one section that is this
     client's own. A figure in it drawn from the borrowed workplan is therefore
     attributed to this client with nothing beside it to say otherwise: the
     banner and the Scope sentence both enumerate SECTIONS, and the rail is not
     one of them. On the all-sample /demo the banner covers the whole page, so
     this only applies to a MIXED portal. */
  const sampleWorkplan = sampleSections.includes('workplan') && !isDemo;

  const Body = { scope: Scope, plan: Plan, findings: Findings, workplan: Workplan, dashboard: Dashboard }[section];
  /* While editing, §2 becomes the same layout with fields in it. */
  const showEditor = editing && section === 'plan';
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
        onSignOut={() => signOut().then(() => setSession(null))}
      />
      {isDemo ? (
        <div className="demobar">
          <strong>Demo</strong>
          {/* A phone cannot spend four lines of a sticky header on this. */}
          <span className="demobar-long">
            Sample content for a real strategic planning engagement. Everything works —
            open a task, tick a subtask, edit the plan itself. Nothing is saved, and no
            client data is here.
          </span>
          <span className="demobar-short">Sample content. Nothing is saved.</span>
        </div>
      ) : null}
      {isFile && !isDemo ? (
        /* A file-backed portal that carries REAL client content in some
           sections and another engagement's sample in the others. Which is
           which has to be visible on every section, not only on the one that
           happens to explain it — a strategic plan showing priorities this
           client never agreed to is worse than no plan at all. */
        <div className={`demobar${sampleHere ? ' is-sample' : ''}`}>
          <strong>{sampleHere ? 'Sample' : 'Working draft'}</strong>
          <span className="demobar-long">
            {sampleHere
              ? `${labels[section] || section} is illustrative content from another engagement, shown so you can see the shape of what this one produces. It is not ${shortClient}'s.`
              : `${shortClient}'s own content. ${sampleTabs.length ? `${sampleList} still show a sample from another engagement.` : ''}`}
            {' '}Everything works — nothing is saved.
          </span>
          <span className="demobar-short">
            {sampleHere ? 'Another engagement’s sample.' : 'Nothing is saved.'}
          </span>
        </div>
      ) : null}

      <nav className="tabstrip" aria-label="Sections">
        {sections.map((s) => (
          <button key={s.id} aria-current={section === s.id} onClick={() => { setSection(s.id); setOpenTask(null); window.scrollTo(0, 0); }}>
            {s.title}
          </button>
        ))}
      </nav>

      <SubNav
        section={section} sub={sub} setSub={setSub} plan={plan} labels={labels}
        findings={findings} topTasks={topTasks} priorityOf={priorityOf}
        setOpenTheme={setOpenTheme} onExport={() => setModal('export')} CATNAME={CATNAME}
        isOwner={isOwner} editing={editing} onEdit={startEdit}
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
      </div>

      <div className="layout">
        <aside className="rail">
          <nav className="railnav" aria-label="Sections">
            {sections.map((s) => (
              <button key={s.id} aria-current={section === s.id} onClick={() => { setSection(s.id); setOpenTask(null); window.scrollTo(0, 0); }}>
                <span className="rn-n">{s.n}</span>
                <span className="rn-t">{s.title}</span>
                <span className="rn-c">{s.id === 'workplan' && !sampleWorkplan ? `${overall.done}/${overall.total}` : ''}</span>
              </button>
            ))}
          </nav>
          <RailCards portal={portal} overall={overall} labels={labels} now={now} sampleWorkplan={sampleWorkplan} />
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
      {showTeam ? <Team portal={portal} onClose={() => setShowTeam(false)} /> : null}
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

function SubNav({ section, sub, setSub, plan, labels, findings, topTasks, priorityOf, setOpenTheme, onExport, CATNAME, isOwner, editing, onEdit, onSettings, onTeam, isFile }) {
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
    items = (<><B v="timeline">Timeline</B><B v="agreement">Scope &amp; cadence</B><B v="team">Who is on it</B></>);
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
            <button className="ghost" onClick={onEdit}>Edit plan</button>
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

function RailCards({ portal, overall, labels, now, sampleWorkplan }) {
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
      {sampleWorkplan && del ? (
        /* The workplan on this portal is another engagement's sample, so its
           completion is not this client's to report. The phase we are in is,
           and it is counted from their own dated deliverables. */
        <div className="railcard">
          <h4 className="eyebrow">Phase {phase.n} · {phase.name}</h4>
          <div className="pb-row">
            <span className="num railpct">{pct(del.done, del.total)}%</span>
            <span className="eyebrow">{del.done} of {del.total} delivered</span>
          </div>
          <StatusBar c={{ done: del.done, next: del.total - del.done }} total={del.total} />
        </div>
      ) : (
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
