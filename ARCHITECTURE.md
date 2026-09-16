# Architecture

How one codebase serves five clients, and what is editable where.

## The rule everything follows

> **If a client could reasonably want it different on a Tuesday, it is data.
> If changing it should require a deploy, it is code.
> Nothing client-specific ever lands in the repo.**

That last clause is the one that does the work. The Impact Suite puts client
content in `clients/<id>/` and rebuilds; this product cannot, because the plan
is edited in the browser during a live engagement. Content in files plus in-app
editing means the app writing back to git, which is a dead end. So: **the
database is the only home for client content**, and the repo holds the product.

## One deploy, many portals

```
                    ┌─────────────────────────────┐
  plans.…/resonate  │                             │
  plans.…/agape     │   ONE Netlify site          │
  plans.…/thinkbig  │   ONE Supabase project      │
                    │   ONE repo                  │
                    └─────────────────────────────┘
                                 │
                      portals ──┬── resonate  (row)
                                ├── agape     (row)
                                └── thinkbig  (row)

  adding a client = INSERT INTO portals + invite people
  no deploy, no branch, no rebuild
```

The client is resolved from the URL. That URL is an **address, not a secret** —
there is no shared password and no directory anyone can browse. Access is the
account: email plus a one-time code. Open another client's URL with the wrong
account and Postgres returns zero rows.

Three isolation layers, all enforced server-side:

1. **`gw_tenant`** in the user's `app_metadata` — which client they belong to.
   `*` is Good Work and reaches every portal.
2. **`portal_members.role`** — what they may do inside a portal they can reach.
3. **RLS** on every table — the actual boundary. Not a UI check.

`supabase/test-rls.sh` asserts all of it against a real Postgres, and CI runs it
on every push. The boundary is only as good as the test that guards it.

## What is editable where

### Tier 1 — the consultant edits, in the app (`owner`)

Everything that makes an engagement *this* engagement:

| | Where it lives |
|---|---|
| Client name, place, logo, accent colour | `portals.brand` |
| **What you call things** — "Strategic priority" vs "Pillar" vs "Goal area" | `portals.labels` |
| Which sections appear, and in what order | `portals.sections` |
| Phases, dates, deliverables, in/out of scope, cadence, team | `portals.engagement` |
| Vision, framing, priorities → initiatives, KPIs, evidence links | `portals.plan` |
| Findings: themes, counts, quotes | `portals.findings` |
| Who has access, and at what role | `portal_members` |

`labels` deserves the emphasis. A church says *pillars*; a foundation says *goal
areas*; a school district says *strategic priorities*. Making the nouns data
costs one jsonb column and is most of what makes the portal feel built for them
rather than rented.

### Tier 2 — client staff edit, in the app (`staff`)

The parts that move weekly:

- Task and subtask status, owner, dates, notes
- **KPI current values** — the client updates "now" each quarter; the target is
  the consultant's

### Tier 3 — code (the product, shared by every client)

- The five-section model and the two-layer navigation
- The evidence chain: task → initiative → finding, and the reverse
- **The status vocabulary: `next` / `doing` / `done` / `blocked`.** Fixed on
  purpose. Four statuses for everyone means the dashboard maths, the CSV and the
  cross-client comparisons all work, and you never debug a client who invented
  six. Clients ask for this; the answer is no.
- Dashboard chart types and the validated status palette
- Export formats (PDF, CSV, JSON)
- Auth, roles, RLS
- Typography, spacing, layout

### What is deliberately NOT customisable

**Full client theming.** The logo and one accent colour, nothing more. The
portal should look like a Good Work deliverable — consistent across every
client, recognisably yours. A portal that reskins into each client's brand is a
template they rented; one with a consistent design language is a product you
built. It is also five fewer design systems to keep working in dark mode.

## Why the plan is a document and tasks are rows

`portals.plan` is jsonb. `tasks` is a table. The split is about **who writes and
how often**:

- The plan is read whole, written whole, by one person, a few times per
  engagement. A document.
- Tasks are written constantly by several people at once. Two staff editing
  different tasks must not clobber each other, so each is a row with its own
  RLS, its own realtime event, and its own audit trail.

`tasks.initiative` carries the initiative id (`"2.1"`) from the plan document.
That is a soft reference, not a foreign key — deliberately, so renumbering a
plan in the editor can never orphan or delete somebody's work. The editor is
responsible for keeping them in step.

## Stack

React + Vite. The prototype re-rendered the whole page on every change, which
was fine for reading and already needed a focus hack for one search box; the
plan editor is nested CRUD with live text inputs and would fight it constantly.

**Dependencies are kept deliberately tiny** — `react`, `react-dom`,
`@supabase/supabase-js`, and `vite` as the only build tool. Everything else is
hand-written: no component library, no state manager, no CSS framework, no
charting library. The charts are inline SVG. This is a solo-maintained codebase;
every dependency is a future afternoon.

## Layout

```
src/
  main.jsx                 mount
  App.jsx                  shell: masthead, two-layer nav, section routing
  lib/
    supabase.js            client, auth (email + one-time code)
    store.js               queries, realtime, optimistic writes
    labels.js              per-portal taxonomy, with fallbacks
    format.js              dates, counts, scoping
  sections/                one file per section
  components/              masthead, nav, task row, chart primitives
  styles/tokens.css        the design system — colours, type, spacing
supabase/
  schema.sql               tables, RLS, audit trigger, realtime
  seed.mjs                 loads a portal's content from a JS/JSON bundle
  test-rls.sh              the permission test CI runs
```

## Milestones

1. **Skeleton + auth + one real portal** ← building now.
   Five sections reading from Postgres, real sign-in, Resonate seeded, RLS live
   and tested in CI. Nothing fake.
2. **The plan editor.** Priorities, initiatives, KPIs, tasks, subtasks, reorder.
   The point at which a new client no longer needs an engineer.
3. **Onboarding.** Create a portal, set labels and branding, import findings,
   invite people. Makes clients three through five cheap.
4. **Reminders.** Due-date digests to task owners — port from the Impact Suite's
   `netlify/functions/grant-tasks.mjs`.
