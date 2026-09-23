/* PAACT engagement: timeline, scope, cadence and team.
   Source: the PAACT Workspace Build Brief. Every client name, date,
   deliverable and note in this file is the engagement's own, carried across
   verbatim. Nothing here was invented to fill a field; where the brief is
   silent, the field is absent.

   WHAT THIS FILE IS NOT. It carries no plan, no findings and no workplan,
   because PAACT has none yet — the strategic planning kickoff is 23 Sep 2026,
   and the priorities, findings and tasks are the OUTPUT of the engagement
   described below. Sections 2-5 of the /paact portal (The plan, Findings,
   Workplan, Dashboard) are served from data/demo-plan.js and
   data/demo-findings.js: ILLUSTRATIVE SAMPLE CONTENT, anonymised from another
   client, shown so the PAACT team can see the shape of what is coming. Those
   four sections are not PAACT's plan, and the portal marks them as sample —
   see `sampleSections` in src/lib/demo.js.

   SHAPE. This is the brief's shape, not the components' shape. src/lib/demo.js
   adapts it in one place (phase ids, the app's status vocabulary, the display
   aliases the older panels read). Keeping the brief's own names here means this
   object can go into the Supabase `engagement` jsonb unchanged, with no second
   translation to keep in step. */
export const PORTAL = {
 "client": {
  "name": "PAACT (Promise All Atlanta Children Thrive)",
  "place": "GEEARS · Atlanta, GA",
  /* The brief's planTitle is "PAACT Strategic Plan 2027–2031"; the PAACT is
     dropped here because `name` above carries it and the two render adjacent in
     the masthead — "PAACT (Promise All Atlanta Children Thrive)" above "PAACT
     Strategic Plan 2027–2031 · GEEARS · Atlanta, GA" stutters the client's own
     name at them. What is left is the brief's header line verbatim:
     PAACT · Strategic Plan 2027–2031 · GEEARS · Atlanta, GA. */
  "engagement": "Strategic Plan 2027–2031"
  /* No `adopted` key, deliberately: nothing has been adopted. Plan.jsx prints
     "Adopted {date}." whenever that field is set, so a value here would have
     the portal tell a kickoff room that PAACT adopted a plan it has not
     written yet. */
 },
 "firm": {
  "name": "HTI Catalysts",
  "lead": "Dr. Folami Prescott-Adams",
  "analyst": "Alan Maxcy"
 },
 "meta": {
  "convener": "GEEARS",
  "location": "Atlanta, GA",
  "planHorizon": "3–5 years",
  "engagementStart": "2026-09-01",
  "engagementEnd": "2027-02-15"
  /* The brief also carries "currentPhase": 2. Deliberately not carried here.
     The phase dates and statuses below already say where the engagement is,
     and they say Phase 1 — as does the brief's own prose: "the current-phase
     pointer should sit on Phase 1 until Sept 30, then Phase 2". Storing the
     number as well would be a third source of truth for a fact two others
     already derive, and the three would disagree on 30 Sep. */
 },
 /* NO `today` KEY, deliberately. This portal reads the REAL date: it is
    contract deliverable #4 and PAACT runs their plan in it through Feb 2028, so
    a pinned clock would be a wrong sentence on every day but one — on kickoff
    day a pin on 22 Sep 2026 tells the room the kickoff is "tomorrow" while they
    are sitting in it. The brief's "Today's date for the app: 2026-09-22" said
    what date to assume while building, not to freeze the clock. src/lib/demo.js
    returns now: null for this portal and App.jsx falls back to today().
    /demo keeps its pin; its content is dated sample content. */
 /* Five phases, and they OVERLAP by design. Discovery (15 Sep – 18 Dec) and
    Synthesis (2 Nov – 16 Jan) run concurrently for about six weeks, and the
    phases differ in length by more than a factor of ten — Foundation is four
    weeks, Adoption & implementation is twelve months. Render each phase by its
    own date range; do not force them into a sequence. */
 "phases": [
  {
   "number": 1,
   "name": "Foundation",
   "start": "2026-09-01",
   "end": "2026-09-30",
   "status": "in_progress",
   "purpose": "Build the relationship, agree the approach, and get the team reading before anyone is interviewed.",
   "deliverables": [
    { "name": "Internal HTI kickoff (Sept 9)", "done": true },
    { "name": "Weekly check-in with Shawnell established", "done": false },
    { "name": "Strategic planning kickoff session with PAACT team (Sept 23, in person)", "done": false },
    { "name": "Document library assembled and shared", "done": false },
    { "name": "Listening session #1 at GEEARS Fall Luncheon (Sept 17)", "done": true },
    { "name": "Interview and focus group protocols drafted", "done": false },
    { "name": "Purpose assigned to each convening and SPT meeting", "done": false }
   ],
   "note": "First PAACT-facing session is Sept 23 at 3400 Peachtree Rd. Everything before that is internal prep."
  },
  {
   "number": 2,
   "name": "Discovery",
   "start": "2026-09-15",
   "end": "2026-12-18",
   "status": "not_started",
   "purpose": "Listen widely enough that no one can say the plan came from one room.",
   "deliverables": [
    { "name": "Stakeholder interviews (up to 20)", "done": false },
    { "name": "Focus groups: Advisory Board, providers, parents and ambassadors, civic leaders", "done": false },
    { "name": "Listening sessions at existing gatherings (4)", "done": false },
    { "name": "SWOT/SOAR webform launched and closed (target 60+ responses)", "done": false },
    { "name": "Partner convening #1: landscape and collective SWOT", "done": false },
    { "name": "Partner convening #2: role, vision, and impact", "done": false },
    { "name": "Partner convening #3: naming what matters (priorities)", "done": false },
    { "name": "Knowledge-sharing workshops with PAACT staff (up to 3)", "done": false },
    { "name": "Peer collective impact calls: Cobb, Detroit, Memphis, Colorado", "done": false },
    { "name": "Quantitative data pull from Danielle's dashboard and Readiness Radar", "done": false }
   ],
   "note": "No stakeholder-facing work Dec 18 – Jan 3."
  },
  {
   "number": 3,
   "name": "Synthesis",
   "start": "2026-11-02",
   "end": "2027-01-16",
   "status": "not_started",
   "purpose": "Turn everything we heard into something partners can recognize themselves in.",
   "deliverables": [
    { "name": "Ecosystem scan brief", "done": false },
    { "name": "Analysis tracker: every input tagged by question cluster", "done": false },
    { "name": "Impact Report integrated (arrives Nov 2026)", "done": false },
    { "name": "Strategic Planning Team meetings (6 hours across 3 sessions)", "done": false },
    { "name": "Findings summary (draft)", "done": false },
    { "name": "Draft vision, mission, and long-term impact goals", "done": false },
    { "name": "Draft priorities with objectives", "done": false },
    { "name": "Findings presentation deck", "done": false }
   ],
   "note": "Rachel reviews for inclusivity before findings go out: all voices represented, not just the loudest."
  },
  {
   "number": 4,
   "name": "Plan design",
   "start": "2027-01-19",
   "end": "2027-02-13",
   "status": "not_started",
   "purpose": "Test the synthesis in public, then write the plan.",
   "deliverables": [
    { "name": "Presentation of findings to all stakeholder groups (convening #4)", "done": false },
    { "name": "Draft strategic plan to PAACT core team for review", "done": false },
    { "name": "Consolidated feedback received", "done": false },
    { "name": "Recommendations: governance, partner engagement, sustainability, measurement", "done": false },
    { "name": "Implementation roadmap with owners, timelines, milestones", "done": false },
    { "name": "Two-page visual summary", "done": false },
    { "name": "Full plan, digital and print-ready", "done": false },
    { "name": "Social media and presentation asset set", "done": false }
   ],
   "note": "Draft review cycle is the gap in the current HTI Catalysts workplan. Findings and draft need to move earlier or the final presentation moves to March."
  },
  {
   "number": 5,
   "name": "Adoption & implementation",
   "start": "2027-02-15",
   "end": "2028-02-15",
   "status": "not_started",
   "purpose": "Hand PAACT a plan it can run, not a document it can file.",
   "deliverables": [
    { "name": "Final plan presentation and celebration (co-facilitated with PAACT)", "done": false },
    { "name": "Project management workspace live with owners and milestones", "done": false },
    { "name": "Workspace training for PAACT staff (90 min)", "done": false },
    { "name": "Close-out report", "done": false },
    { "name": "90-day check: workspace in active use", "done": false },
    { "name": "Year one progress review", "done": false }
   ],
   "note": "The HTI Catalysts engagement closes Feb 15, 2027. Year one of the plan runs to Feb 2028. This workspace is deliverable #4 of the contract."
  }
 ],
 "scope": {
  "scopeSummary": "Design and facilitate a participatory strategic planning process resulting in a 3–5 year plan for the PAACT collaborative, with implementation roadmap and live project management workspace.",
  "inScope": [
   "Up to 4 partner convenings (2–3 hrs each)",
   "Up to 4 kickoff-phase workshops with PAACT staff",
   "Up to 20 stakeholder interviews",
   "4 focus groups (60–90 min)",
   "4 listening sessions at existing gatherings",
   "6 hours of Strategic Planning Team meetings",
   "Document and data review, SWOT and SOAR analysis",
   "Findings presentation",
   "Final plan in four formats plus workspace and training",
   "Close-out report"
  ],
  "outOfScope": [
   "Implementation support after Feb 15, 2027 (unless contracted separately)",
   "Primary data collection beyond the engagement counts above",
   "Evaluation of PAACT programs (Danielle Wallace holds that role)"
  ],
  /* Straight from the scope-of-work document, "Expected Outcomes". The SOW
     lists the governance recommendation twice; carried once. */
  "outcomes": [
   "A shared understanding of Atlanta's early childhood landscape and systems",
   "A collective SWOT analysis informed by partner and community voice",
   "Recommendations for governance, partnership engagement, and backbone infrastructure",
   "A strategic plan document outlining priority strategies, objectives, and measurable outcomes for the next 3\u20135 years",
   "An implementation roadmap with timelines, roles, and resource considerations",
   "A clear and inspiring vision, mission, and long-term impact goals for PAACT"
  ],
  /* The SOW's ten "Key Strategic Questions". These are what the process is
     for, and the only place the engagement states its own purpose in PAACT's
     words rather than in deliverables. */
  "questions": [
   "What is PAACT's unique role and value within Atlanta's early childhood ecosystem?",
   "What outcomes should we hold ourselves collectively accountable for over the next 3\u20135 years?",
   "How should PAACT measure collective impact and progress toward shared goals?",
   "How can PAACT strengthen alignment and collaboration across partners where alliance members have shared ownership?",
   "What is the long-term vision for PAACT's role within GEEARS and the Atlanta early childhood landscape?",
   "How do we meaningfully include providers and families with lived experience in governance and strategy?",
   "What policy and systems priorities should PAACT champion locally?",
   "How do we deepen partnerships with the City of Atlanta and philanthropic partners?",
   "What backbone infrastructure and capacity does PAACT need to sustain and grow its work?",
   "How does PAACT remain responsive to community needs and emerging opportunities?"
  ],
  /* The SOW names these by title. The app said only "document library
     assembled and shared", which is a task, not a list anyone could check. */
  "documents": [
   "PAACT Final Report",
   "GEEARS Strategic Plan (Section 3)",
   "PAACT Overview slide deck",
   "Ambassador Research Report",
   "Evaluation of the Repair and Renovation Program",
   "Impact Report (ready November 2026)",
   "List of centers that received renovation funds \u2014 Danielle Wallace",
   "Spreadsheet of Ambassadors \u2014 Dawan"
  ],
  /* A recurrence, an activity and an accountable person. No dates: the brief
     gives none, and a "next occurrence" would have to be invented. */
  "cadence": [
   { "rhythm": "Weekly", "what": "30-min check-in with Shawnell", "owner": "Dr. Prescott-Adams" },
   { "rhythm": "Weekly", "what": "Internal HTI Catalysts team sync", "owner": "Dr. Prescott-Adams" },
   { "rhythm": "Biweekly", "what": "Written update to PAACT: done, next, need", "owner": "Alan" },
   { "rhythm": "Monthly", "what": "GEEARS leadership touchpoint", "owner": "Dr. Prescott-Adams" },
   { "rhythm": "Quarterly", "what": "Advisory Board meeting (align focus group and listening session)", "owner": "PAACT" }
  ],
  /* The only dated points in the engagement, and the spine the overlapping
     phase bars hang off. Past-vs-future is derived against the clock above,
     not stored. */
  "keyDates": [
   { "date": "2026-09-17", "what": "GEEARS Fall Luncheon (listening session #1)" },
   { "date": "2026-09-23", "what": "Strategic planning kickoff with PAACT team, in person" },
   { "date": "2026-10-05", "what": "SWOT/SOAR webform launch (target)" },
   { "date": "2026-11-13", "what": "SWOT/SOAR webform close (target)" },
   { "date": "2026-11-30", "what": "Impact Report expected" },
   { "date": "2026-12-18", "what": "Stakeholder engagement closes" },
   { "date": "2027-01-16", "what": "Findings synthesis complete" },
   { "date": "2027-02-15", "what": "RFP project end date" }
  ],
  /* Three groups, three shapes. Consultant-vs-client is explicit here rather
     than inferred from the org string: Alan is a SUBCONTRACTOR to HTI
     Catalysts, carried under his own org name, so any string match against the
     firm would file him on the client side. */
  "consultingTeam": [
   { "name": "Dr. Folami Prescott-Adams", "org": "HTI Catalysts", "role": "Engagement lead, facilitator", "owns": "Client relationship, all convenings and interviews, final presentation" },
   { "name": "Gina Glymph", "org": "HTI Catalysts", "role": "Co-facilitator", "owns": "Convenings, interviews, focus groups, listening sessions" },
   { "name": "Rachel Alterman Wallack", "org": "HTI Catalysts", "role": "Advisor", "owns": "ToP facilitation design, inclusivity review of instruments and findings" },
   { "name": "Alan Maxcy", "org": "Good Work Atlanta · subcontracted to HTI Catalysts", "role": "Analyst and writer", "owns": "Document review, SWOT/SOAR, synthesis, findings, plan document, four formats, workspace, close-out report" }
  ],
  "clientTeam": [
   { "name": "Shawnell", "org": "PAACT", "role": "Director, primary contact", "owns": "Weekly check-in, interview introductions, approvals" },
   { "name": "Eshe", "org": "PAACT", "role": "Staff, Advisory Board member", "owns": "Advisory Board coordination" },
   { "name": "Dawan", "org": "PAACT", "role": "Staff", "owns": "Ambassador and family recruitment, ambassador spreadsheet" },
   { "name": "Kristin Bernhard", "org": "GEEARS", "role": "Executive leadership", "owns": "GEEARS alignment, board access" },
   { "name": "Danielle Wallace", "org": "Evaluator (contract)", "role": "Data partner", "owns": "Provider dashboard, renovation center list" }
  ],
  "governance": [
   { "body": "Strategic Planning Team", "members": "Subset of PAACT staff and members (roster TBD Sept 23)", "meets": "3 sessions, 2 hrs each, Nov–Jan" },
   { "body": "PAACT Advisory Board", "members": "20 members", "meets": "Quarterly" },
   { "body": "GEEARS Board", "members": "Full board", "meets": "15-min group interview at a scheduled meeting" }
  ]
 }
};
