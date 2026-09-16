import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { isConfigured, slugFromLocation, currentSession, signOut } from './lib/supabase.js';
import { loadPortal, loadTasks, saveTask, watchTasks, listPortals } from './lib/store.js';
import { makeLabels, visibleSections } from './lib/labels.js';
import { DEMO_SLUG, DEMO_ROLE, loadDemo } from './lib/demo.js';
import { counts, indexPlan, findingDrives, today } from './lib/format.js';
import SignIn from './components/SignIn.jsx';
import Masthead from './components/Masthead.jsx';
import Scope from './sections/Scope.jsx';
import Plan from './sections/Plan.jsx';
import Findings from './sections/Findings.jsx';
import Workplan from './sections/Workplan.jsx';
import Dashboard from './sections/Dashboard.jsx';
import { StatusBar } from './components/ui.jsx';
import TaskDrawer from './components/TaskDrawer.jsx';
import ExportMenu from './components/ExportMenu.jsx';
import './styles/app.css';

const CATNAME = { S: 'Strengths', W: 'Weaknesses', O: 'Opportunities', T: 'Threats' };

export default function App() {
  const slug = useMemo(() => slugFromLocation(), []);
  /* A deploy with no project configured falls back to the demo rather than an
     error, so a fresh Netlify site shows the product on its first load. */
  const isDemo = slug === DEMO_SLUG || !isConfigured;
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

  /* ---- session ---- */
  useEffect(() => {
    if (isDemo || !isConfigured) { setSession(null); return; }
    currentSession().then(setSession);
  }, [isDemo]);

  /* ---- portal + tasks ---- */
  useEffect(() => {
    if (isDemo) {
      let live = true;
      loadDemo().then(({ portal, tasks, now }) => {
        if (!live) return;
        setPortal(portal);
        setTasks(tasks);
        setDemoNow(now);
        setRole(DEMO_ROLE);
        setReason('ok');
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
  }, [slug, session, isDemo]);

  /* Subscribe once per portal, in an effect, never during render. */
  useEffect(() => {
    if (!portal || isDemo) return;
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
  }, [portal?.id, isDemo]);

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
      if (isDemo) return; // nothing to save to, and the banner says so
      try {
        await saveTask(portal.id, next);
      } catch {
        setSaveErr(true);
      }
    },
    [tasks, portal, isDemo],
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
      if (modal) setModal(null);
      else if (openTask) setOpenTask(null);
      else if (openTheme) setOpenTheme(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal, openTask, openTheme]);

  /* ---- gates ---- */
  if (session === undefined || reason === 'loading') return <Splash>Loading…</Splash>;

  if (!isDemo && !isConfigured) {
    return (
      <Splash title="No project configured">
        This deploy has no <code>VITE_SUPABASE_URL</code>. Set it and{' '}
        <code>VITE_SUPABASE_ANON_KEY</code> on the Netlify site, then redeploy.
      </Splash>
    );
  }
  if (!isDemo && !session) return <SignIn slug={slug} onSignedIn={setSession} />;
  if (isDemo && !portal) return <Splash>Loading the demo…</Splash>;
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

  const Body = { scope: Scope, plan: Plan, findings: Findings, workplan: Workplan, dashboard: Dashboard }[section];
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
        isDemo={isDemo}
        onSignOut={() => signOut().then(() => setSession(null))}
      />
      {isDemo ? (
        <div className="demobar">
          <strong>Demo</strong>
          {/* A phone cannot spend four lines of a sticky header on this. */}
          <span className="demobar-long">
            Sample content for a real strategic planning engagement. Everything works —
            open a task, tick a subtask, change the scope. Nothing is saved, and no
            client data is here.
          </span>
          <span className="demobar-short">Sample content. Nothing is saved.</span>
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
      />
      </div>

      <div className="layout">
        <aside className="rail">
          <nav className="railnav" aria-label="Sections">
            {sections.map((s) => (
              <button key={s.id} aria-current={section === s.id} onClick={() => { setSection(s.id); setOpenTask(null); window.scrollTo(0, 0); }}>
                <span className="rn-n">{s.n}</span>
                <span className="rn-t">{s.title}</span>
                <span className="rn-c">{s.id === 'workplan' ? `${overall.done}/${overall.total}` : ''}</span>
              </button>
            ))}
          </nav>
          <RailCards portal={portal} overall={overall} labels={labels} now={now} />
        </aside>
        <main className="main">
          <div className="wrap"><Body {...shared} /></div>
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
    </>
  );
}

function SubNav({ section, sub, setSub, plan, labels, findings, topTasks, priorityOf, setOpenTheme, onExport, CATNAME }) {
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
        {['plan', 'workplan', 'dashboard'].includes(section) ? (
          <>
            <span className="sn-spacer" />
            <button className="ghost" onClick={onExport}>Export ▾</button>
          </>
        ) : null}
      </div>
    </nav>
  );
}

function RailCards({ portal, overall, labels, now }) {
  const eng = portal.engagement || {};
  const active = (eng.phases || []).find((p) => p.status === 'active') || (eng.phases || []).slice(-1)[0];
  return (
    <>
      <div className="railcard">
        <h4 className="eyebrow">Engagement</h4>
        <dl className="deflist">
          {eng.firm?.name ? (<><dt>Firm</dt><dd>{eng.firm.name}</dd></>) : null}
          {eng.firm?.lead ? (<><dt>Lead</dt><dd>{eng.firm.lead}</dd></>) : null}
          {active ? (<><dt>Phase</dt><dd>{active.n} · {active.name}</dd></>) : null}
          <dt>Today</dt><dd className="num">{now}</dd>
        </dl>
      </div>
      <div className="railcard">
        <h4 className="eyebrow">Year one</h4>
        <div className="pb-row">
          <span className="num" style={{ fontFamily: 'var(--mono)', fontSize: 19 }}>
            {overall.total ? Math.round((overall.done / overall.total) * 100) : 0}%
          </span>
          <span className="eyebrow">{overall.done} of {overall.total} done</span>
        </div>
        <StatusBar c={overall} total={overall.total} />
        {overall.late ? (
          <div style={{ marginTop: 9, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--stop)' }}>
            {overall.late} past due
          </div>
        ) : null}
      </div>
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
