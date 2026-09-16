# Strategic Plan Portal

One place a client comes back to for a whole strategic planning engagement: the
scope, the plan, the evidence behind it, the workplan they run on, and a
dashboard. It replaces the board PDF, the spreadsheet, and — for clients who
don't already live in one — the project management tool.

**One deploy serves every client.** Read [ARCHITECTURE.md](ARCHITECTURE.md) for
why, and for the full map of what is editable in the app versus fixed in code.

> This folder is being lifted into its own repo, `alanamaxcy/goodwork-stratplans`.
> See *Moving to its own repo* at the bottom. It does not import from the Impact
> Suite, and nothing here triggers a client-site rebuild.

## Quick start

```bash
npm install
cp .env.example .env          # fill in the two public Supabase values
npm run dev                   # http://localhost:5173/resonate
```

Without a Supabase project configured the app says so plainly rather than
failing; with one, it goes straight to the sign-in screen.

## The five sections

| § | Section | What it replaces |
|---|---|---|
| 1 | Scope & timeline | The SOW nobody reopens after signing |
| 2 | The plan | The board PDF |
| 3 | Findings | The 60-page response appendix |
| 4 | Workplan | The spreadsheet, and ClickUp/Asana for clients without one |
| 5 | Dashboard | The status slide somebody rebuilds every quarter |

Navigation is two layers: the rail picks the section, the bar beneath picks the
scope **within** it — the whole plan or one strategic priority — and every count,
chart and export obeys it.

Every task names the initiative it serves; every initiative names the findings
that produced it, with live source counts; every finding lists the initiatives it
drives. A task opens onto *"this exists because 49 of 105 people said so."*

## Taxonomy

```
Strategic priority   P1   carries the KPIs
  Initiative         1.1
    Task             T-102
      Subtask        T-102.1
```

The **words** are per-client data (`portals.labels`) — a church says *pillars*, a
foundation says *goal areas*. The **shape** is the product.

A subtask is a task with a parent: one table, one status vocabulary, one set of
permissions. Nesting stops at one level on purpose.

## Accounts

Three roles, scoped per portal — a board member of one client is not a board
member of the next:

| Role | Reads | Writes |
|---|---|---|
| `owner` | everything | the plan document and the workplan |
| `staff` | everything | the workplan |
| `board` | everything | nothing |

Sign-in is **email plus a one-time code**, never a magic link — see the note in
`src/lib/supabase.js`, and use the code-only email template from the Impact
Suite's `docs/AUTH-SETUP-SUPABASE.md`.

`gw_tenant` in a user's `app_metadata` decides which portals exist for them;
`portal_members.role` decides what they can do inside one. Both are enforced in
RLS, so a stolen anon key reaches nothing.

## Setting up a new client

1. Run `supabase/schema.sql` once per project (it is idempotent).
2. Create the person's account in Supabase → Authentication → Users, and tag
   `app_metadata`: `{ "gw_role": "staff", "gw_tenant": "<slug>" }`
   (Good Work's own accounts get `"gw_tenant": "*"`.)
3. Seed the portal:
   ```bash
   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
     node supabase/seed.mjs --slug agape --tenant agape --owner you@firm.com
   ```
4. Send them `https://plans.example.org/agape`.

Once the plan editor lands (milestone 2) step 3 becomes a form, and this file
loses its only mention of the service-role key.

## Tests

```bash
node test/smoke.mjs        # builds, then drives the real app in Chromium
supabase/test-rls.sh       # applies the schema to a throwaway Postgres
```

`smoke.mjs` stands up a stub that speaks Supabase's REST and auth surface, then
signs in for real, renders all five sections from that data, expands subtasks,
advances a status and asserts the write reached the server with the right column
shape — plus that a portal this account cannot reach renders nothing.

`test-rls.sh` is the one that matters. It applies the schema twice (proving it is
idempotent), then signs in as Good Work, client staff, a board member and an
outsider, and asserts who can read and write what — including that staff can read
a client's labels but only the owner can change them. **The permission boundary
is the product's only real security control, so CI runs this on every push.**

## Deploying

Netlify, one site for every client:

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` — public by design |
| `VITE_SUPABASE_ANON_KEY` | the anon/publishable key — public by design |

Build `npm run build`, publish `dist`. The SPA redirect in `netlify.toml` is what
lets `/resonate` and `/agape` both reach the app.

**Never** set `SUPABASE_SERVICE_ROLE_KEY` on this site. The build does not read
it and the browser must never see it; it belongs in your shell, for seeding.

## Still to build

1. **The plan editor** — priorities, initiatives, KPIs, tasks, subtasks, reorder.
   The point at which a new client no longer needs an engineer.
2. **Onboarding** — create a portal, set labels and branding, invite people.
3. **Task assignment to real accounts.** `tasks.owner_user_id` exists and nothing
   populates it; owners are free text today.
4. **Due-date reminders.** Port the Impact Suite's `grant-tasks.mjs`.
5. **The audit trail has no UI.** `task_events` records every field change with
   who and when; nothing shows it yet.

## Moving to its own repo

```bash
git subtree split -P strategic-plan-portal -b spp-standalone
git push git@github.com:alanamaxcy/goodwork-stratplans.git spp-standalone:main
```

Nothing here imports from the Impact Suite, so the split is clean.
