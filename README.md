# Strategic Plan Portal

One place a client comes back to for the whole engagement: the scope, the plan,
the evidence, and the workplan they actually run on. It replaces the board PDF,
the spreadsheet, and — for clients who don't already live in one — the project
management tool.

**Prototype:** https://claude.ai/artifact/5W2nLqzFLDxhEUUsMzkZyZ

This folder is a working prototype, not the product. It lives here to be under
version control and to be easy to show; it is written to be lifted out into its
own repo and Netlify site (see *Splitting it out*). Nothing here is wired into
the Impact Suite, and `netlify.toml`'s build-ignore rule does not watch this
path, so changes here never rebuild a client site.

## The four sections

| § | Section | What it replaces |
|---|---|---|
| 1 | Scope & timeline | The SOW nobody reopens after signing |
| 2 | The plan | The board PDF |
| 3 | Findings | The 60-page response appendix |
| 4 | Workplan | The spreadsheet, and ClickUp/Asana for clients without one |

## The thing that makes it not just four documents in a trench coat

Every workplan task names the objective it serves; every objective names the
findings that produced it, with live source counts. So a task opens onto
"this exists because 49 of 105 people said so." Clicking a chip anywhere jumps
to that finding; a finding lists the objectives it drives. That chain is the
reason this beats a PDF plus a spreadsheet plus a ClickUp board — none of those
three can point at the other two.

The counts in §2 are read from the §3 dataset at render time, not typed in. If
the findings change, the plan's citations change with them.

## Content model

Three files, and only one of them is product:

- `index.html` — the product. Contains no client names or content.
- `data/plan.js` — `window.PORTAL`: client, phases, scope, plan (pillars →
  objectives → measures), and the seed workplan. One per client.
- `data/findings.js` — `window.FINDINGS`: themes with source counts and a
  deduplicated quote pool. Generated, not hand-edited.

`gen-findings.mjs` builds `data/findings.js` from a SWOT Explorer export. The
explorer repeated every survey quote inside each theme that cited it; this
stores each quote once and has themes reference it by index (680 KB → 322 KB).

Current data: Resonate Church's real discovery findings — 43 themes across 105
sources. **The plan and workplan content is illustrative**, written against
those findings to show the shape. Owner names are placeholders.

## Roles

`Board view` / `Staff view` in the header. Board view is read-only: scope, plan
and findings, with the workplan visible as progress but not editable. Staff view
can advance a status, reassign, change dates, and leave notes.

In the prototype this is a manual switch, so one person can demo both. In
production it is the signed-in user's role — see *What production needs*.

`Print board packet` in §2 prints the plan alone, chrome and interactive chips
stripped. That is the board PDF, generated from the same source as the portal,
so the two can never drift.

## Running it locally

```
npx http-server strategic-plan-portal -p 8080 -c-1
```

Open `http://localhost:8080`. It needs a server, not `file://`, only because of
the two data scripts. There is no build step.

## What production needs

The prototype persists the workplan to the Artifact runtime's `db` capability
when it is available, and falls back to `localStorage` otherwise. Everything
else is decided but not built:

1. **Auth and roles.** Supabase, same as the Impact Suite (`docs/AUTH-SETUP-SUPABASE.md`).
   Three roles: `owner` (the consultant), `staff` (edit the workplan), `board`
   (read-only). The view switcher becomes a role claim.
2. **Storage.** Netlify Blobs, keyed `C:<client>:plan`, `C:<client>:findings`,
   `C:<client>:tasks:<id>`. One blob per task, not one per workplan — two people
   editing different tasks must not clobber each other. Follow the Impact
   Suite's rule: schema changes self-heal on read, never a migration script.
3. **Multi-client build.** Same pattern as the Impact Suite: `src/` is the
   product, `clients/<id>/` is who a deploy is for, one Netlify site per client
   with `CLIENT_ID` set. Port `scripts/check-product-clean.mjs` — it is what
   keeps client names out of the shared artifact.
4. **An editor.** Right now a plan is a JS file. The consultant needs to write
   pillars, objectives, measures and tasks in the browser.
5. **Notifications.** Due-date reminders to task owners. The Impact Suite
   already does this in `netlify/functions/grant-tasks.mjs`.
6. **Public sharing.** The prototype declares the `db` capability, which makes
   an artifact organization-internal — fine for a demo, wrong for a client
   board. On its own Netlify site this constraint does not exist.

Deferred on purpose: ClickUp/Asana push (`Native, with push` was the runner-up
choice — worth revisiting once the native workplan has been used on one real
engagement), Gantt/dependency visualization, time tracking.

## Splitting it out

Nothing here imports from the Impact Suite, and the only build input is
`gen-findings.mjs`. To move it:

```
git subtree split -P strategic-plan-portal -b spp-standalone
```

Then point a new repo at that branch. The reason it is standalone rather than a
module: strategic planning clients (churches, boards, foundations) are not
necessarily youth-serving nonprofits, and the two products should price and
evolve separately.
