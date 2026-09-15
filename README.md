# Strategic Plan Portal

One place a client comes back to for the whole engagement: the scope, the plan,
the evidence, and the workplan they actually run on. It replaces the board PDF,
the spreadsheet, and — for clients who don't already live in one — the project
management tool.

**Prototype:** https://claude.ai/artifact/5W2nLqzFLDxhEUUsMzkZyZ

This folder lifts out into its own repo and Netlify site (see *Splitting it
out*). Nothing here imports from the Impact Suite, and `netlify.toml`'s
build-ignore rule does not watch this path, so changes here never rebuild a
client site.

## The five sections

| § | Section | What it replaces |
|---|---|---|
| 1 | Scope & timeline | The SOW nobody reopens after signing |
| 2 | The plan | The board PDF |
| 3 | Findings | The 60-page response appendix |
| 4 | Workplan | The spreadsheet, and ClickUp/Asana for clients without one |
| 5 | Dashboard | The status slide somebody rebuilds every quarter |

Navigation is two layers. The rail (or the tab strip on a phone) picks the
section; the bar under the masthead picks the scope **within** it — the whole
plan or one strategic priority — and every count, chart and export below obeys
it. In §1 and §3 that second layer carries sub-views and the SWOT filter
instead.

## Taxonomy

```
Strategic priority   P1   "Life Groups that multiply"      — carries the KPIs
  Initiative         1.1  "Define what a Life Group is for"
    Task             T-102  "Draft the one-page charter"
      Subtask        T-102.1  "Purpose statement"
```

A **subtask is a task with a parent** — one table, one status vocabulary, one
set of permissions, rather than a second entity that needs all three again.
Nesting stops at one level on purpose: a subtask of a subtask is a project plan
pretending to be a checklist.

KPIs hang off the **priority**, not the initiative, matching how these get built
in Asana today (a KPIs section at the top of each priority project).

## The thing that makes it not five documents in a trench coat

Every task names the initiative it serves; every initiative names the findings
that produced it, with live source counts; every finding lists the initiatives
it drives. So a task opens onto "this exists because 49 of 105 people said so."

The counts in §2 are read from the §3 dataset at render time, not typed in.
Change the findings and the plan's citations change with them.

## Accounts and roles

Three roles, per portal rather than global — a consultant runs many
engagements, and a board member of one client is not a board member of the next:

| Role | Reads | Writes |
|---|---|---|
| `owner` | everything | the plan document and the workplan |
| `staff` | everything | the workplan |
| `board` | everything | nothing |

Sign-in is **email plus a one-time code**. No magic link — for exactly the
reasons in `docs/AUTH-SETUP-SUPABASE.md`: a one-time URL in an email looks like
phishing, gets quarantined, and the scanner that releases it *spends the token
first*. Use the code-only email template from that doc.

`gw_tenant` in a user's `app_metadata` scopes which portals exist for them at
all; `portal_members.role` decides what they may do inside one. Both are
enforced in RLS, so a stolen anon key reaches nothing. `gw_tenant: "*"` is Good
Work's own staff and reaches every client, as in the Impact Suite.

## Storage

One interface, three backings, picked at boot:

| Mode | When | What it gives you |
|---|---|---|
| `supabase` | `SUPABASE_URL` + `SUPABASE_ANON_KEY` are set | real accounts, RLS, realtime across viewers, an audit trail |
| `artifact` | running as a published Artifact | shared with everyone holding the link, no accounts |
| `local` | neither | this browser only |

The masthead always says which one is live. **A published Artifact cannot reach
Supabase** — its CSP blocks fetch/XHR/WebSocket to every external host — which
is why the prototype link runs on the middle row and shows a *Preview as*
switch instead of a sign-in. On Netlify that restriction does not exist.

`supabase-js` is only fetched when a project is configured, so the prototype
never pays for the bundle.

## Export

In §2, §4 and §5, **Export** writes whatever the scope picker has selected —
one strategic priority or the whole plan:

- **Board packet (PDF)** — the print stylesheet, chrome stripped, one page per
  priority. This is the PDF that used to be built by hand, from the same source
  as the portal, so the two cannot drift.
- **Workplan (CSV)** — tasks *and* subtasks with owners, dates and status.
  Opens in Excel; imports to Asana or ClickUp.
- **Everything (JSON)** — priorities, KPIs, initiatives, tasks, subtasks, and
  the findings each one cites.

## Layout

```
index.html              the product — no client names, ever
data/plan.js            window.PORTAL   — one client's engagement, plan, workplan
data/findings.js        window.FINDINGS — themes, counts, deduplicated quote pool
data/config.js          generated at deploy time; empty in the repo
scripts/build-portal.mjs  Netlify build — writes public/
scripts/gen-findings.mjs  findings.js from a SWOT Explorer export
scripts/xform-plan.mjs    the one-time pillars/objectives → priorities/initiatives migration
supabase/schema.sql       tables, RLS, audit trigger, realtime
supabase/test-schema.sh   runs the schema on a throwaway Postgres and exercises RLS
```

Current data: Resonate Church's real discovery findings — 43 themes across 105
sources. **The plan and workplan content is illustrative**, written against
those findings to show the shape. Owner names are placeholders.

## Running it locally

```
npx http-server strategic-plan-portal -p 8080 -c-1
```

It needs a server rather than `file://` only because of the data scripts. There
is no build step for local work.

To check the database layer without a Supabase project:

```
supabase/test-schema.sh     # needs postgresql-16; runs as the postgres user
```

It stubs `auth.users` and `auth.uid()`, applies `schema.sql` twice (it is
idempotent), then signs in as four different people and asserts who can read and
write what.

## Deploying

Per Netlify site:

| Variable | Value |
|---|---|
| `PORTAL_SLUG` | the `portals.slug` row this site serves, e.g. `resonate` |
| `SUPABASE_URL` | `https://<ref>.supabase.co` — public by design |
| `SUPABASE_ANON_KEY` | the anon/publishable key — public by design |

Build command `node scripts/build-portal.mjs`, publish directory `public`.
Never put the service-role key in this site's environment; the browser never
needs it and the build does not read it.

Then, once per project: run `supabase/schema.sql`, insert the `portals` row and
the owner's `portal_members` row (the seed block at the bottom of the schema
shows both), and tag each user's `app_metadata` with `gw_role` and `gw_tenant`.

## Still to build

1. **A plan editor.** A plan is still a JS file. The consultant needs to write
   priorities, initiatives, KPIs and tasks in the browser. This is the last
   thing standing between this and something sellable.
2. **Task assignment to real users.** `tasks.owner_user_id` exists in the schema
   and nothing populates it yet — owners are free text.
3. **Due-date reminders.** The Impact Suite already does this in
   `netlify/functions/grant-tasks.mjs`; port it.
4. **Findings ingest.** `gen-findings.mjs` reads one hand-made explorer export.
5. **The audit trail has no UI.** `task_events` records every field change with
   who and when; nothing shows it yet.

Deferred on purpose: ClickUp/Asana push (CSV import covers the common case;
revisit after one real engagement runs on the native workplan), Gantt and
dependency visualisation, time tracking.

## Splitting it out

```
git subtree split -P strategic-plan-portal -b spp-standalone
```

Then point a new repo at that branch. The reason it is standalone rather than a
module: strategic planning clients (churches, boards, foundations) are not
necessarily youth-serving nonprofits, and the two products should price and
evolve separately.
