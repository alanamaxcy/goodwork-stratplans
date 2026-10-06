# Putting PAACT live

This turns `strategy.goodworkimpact.com/paact` from a read-only page into the
team's working tool: people sign in, and the HTI team can tick deliverables and
edit the timeline, scope and team, with everyone seeing the same thing.

It takes about 20 minutes. Nothing here needs a terminal. You will copy two
files into Supabase, add three settings in Netlify, then add people from inside
the app.

## What changes for people

- **`/paact` asks people to sign in.** They type their email, get a code by
  email, and type the code. There are no passwords.
- **The QR code on the slide still works**, but it now leads to that sign-in
  page. Someone without an account cannot get past it. **Add PAACT's people
  (step 5) before you send the link round again.**
- **`strategy.goodworkimpact.com`** (no `/paact`) becomes a sign-in page that
  takes each person straight to their portal.
- **`/demo` does not change.** It stays public, anonymised, and saves nothing.

## Before you start: three checks

The sign-in system is shared with the Impact Suite (the "Impact Software Login"
project), so an account you add here is an account there too. The first two
checks keep that safe. The third makes sure the sign-in codes reach people.

**1. Every Impact Suite site must say which client it belongs to.** In Netlify,
open each Impact Suite site → *Site configuration* → *Environment variables*.
Any site that has `SUPABASE_URL` must also have `GW_TENANT`. A site with the
first and not the second lets anyone in the sign-in project in — which, from
today, includes the HTI team and the PAACT people you add here. Your Impact
Suite setup guide already says to set both; this is the moment to make sure.

**2. Know who is tagged `*`.** That tag means "Good Work staff" and opens every
client in both products, PAACT included. In Supabase → *SQL Editor* → *New
query*, paste this and press *Run*:

```sql
select email from auth.users
 where raw_app_meta_data ->> 'gw_tenant' = '*'
 order by email;
```

Everyone listed can edit PAACT. It should be you and Good Work staff only.

**3. Codes can be emailed to anyone.** Supabase → *Authentication* → *Emails* →
*SMTP Settings*. If custom SMTP is on, you are set. If it is off, Supabase's
built-in mailer sends only a handful of emails an hour and may only send to
people on your own Supabase team, so nobody at HTI or PAACT would get a code.
Turn it on with the SendGrid settings from the Impact Suite's onboarding guide
(`clients/ONBOARDING.md`, step 5 in that repo). If the Impact Suite's client
staff already sign in with codes, it is on.

## Step 1 — Create the tables (once)

1. On GitHub, open `supabase/schema.sql` in this repo and copy all of it (the
   *Copy raw file* button at the top right of the file).
2. Supabase → the **Impact Software Login** project → *SQL Editor* → *New
   query*. Paste. Press *Run*.
3. If Supabase warns the query is destructive, run it anyway: those are lines
   that replace this portal's own access rules, nothing else.

You should see **Success. No rows returned.**

If instead it says *A different table called "public.tasks" already exists*,
stop. Nothing was changed: another app in that project already uses one of the
portal's table names, and the portal needs its own space before going further.

## Step 2 — Create the PAACT portal

1. Copy all of `supabase/clients/paact.sql` the same way.
2. *SQL Editor* → *New query* → paste → *Run*.

You should see one row:

| portal | phases | person | role | tag |
|---|---|---|---|---|
| paact | 5 | alan@goodworkatlanta.co | owner | * |

This file is safe to run again. It never overwrites anything edited in the
app.

## Step 3 — Switch the site over

Netlify → the **strategy** site → *Site configuration* → *Environment
variables* → *Add a variable*. Add three:

| Name | Value | Where to find it in Supabase |
|---|---|---|
| `VITE_SUPABASE_URL` | the Project URL, `https://….supabase.co` | *Project Settings* → *Data API* (or *API*) |
| `VITE_SUPABASE_ANON_KEY` | the **anon / publishable** key — the public one | *Project Settings* → *API Keys* |
| `SUPABASE_SERVICE_ROLE_KEY` | the **service_role / secret** key | the same page |

- The first two are public by design. The browser needs them to sign people in.
- The third is the all-access key. It is what lets you add people from inside
  the app. Put it **only** here: never in a message, never in a file, and never
  with a name starting `VITE_` (that would publish it in the page). If Netlify
  offers *Contains secret values*, tick it.

Then *Deploys* → *Trigger deploy* → *Deploy site*. Wait for it to finish.

## Step 4 — Sign in and look

Go to `strategy.goodworkimpact.com`, type your email, and type the code that
arrives. You land on PAACT. (If the project ever holds more than one portal,
you get a list and pick it.) You should see the timeline with **Edit
timeline**, **Access** and **Settings** at the top right.

The code email is the one the Impact Suite already sends. Check 3 above is the
only email setup.

## Step 5 — Add the team

Press **Access**. For each person: type their email, choose a role, press
*Add*. Then send them `https://strategy.goodworkimpact.com`.

| Who | Role |
|---|---|
| Dr. Folami Prescott-Adams, Gina Glymph, Rachel Alterman Wallack | **Owner** |
| PAACT's people: Shawnell, Eshe, Dawan, and anyone else who should read it | **Board — read only** |

**Leave the "Good Work staff only" box unticked for all of them.** You see that
box because you are tagged `*`. Ticking it gives someone every client, here and
in the Impact Suite. HTI is a partner firm, not Good Work.

If Access says it cannot manage people, the third setting from step 3 is
missing. Add it and redeploy, or use the fallback:

1. Supabase → *Authentication* → *Users* → *Add user* → *Create new user*.
   Their email, any password (they never use it), tick *Auto Confirm User*.
2. *SQL Editor* → paste `supabase/add-member.sql` → change the email and role
   in the three lines marked *edit me* → *Run*.

## What each role can do

| | Owner | Board |
|---|---|---|
| Read the timeline, scope and team | ✓ | ✓ |
| Tick a deliverable, set a phase's status (on the phase card) | ✓ | |
| Edit timeline, scope or team | ✓ | |
| Add people and change their access | ✓ | |
| Turn on another section (Settings) | ✓ | |

There is a third role, **Staff**, for running a workplan. PAACT has no
workplan section yet, so it does nothing here for now.

## How editing works

- **Ticks and statuses save when you click.** There is nothing else to press.
- **Edit timeline / Edit scope / Edit team** open the editor for all three tabs.
  Nothing is saved until you press **Save**; **Discard** throws the changes
  away.
- **Two people at once is fine.** If they change different things, both
  changes are kept. If they change the same thing, such as the same end date,
  the second person to press Save is shown what clashed and chooses which to
  keep.
- **Phases number themselves by start date.** Move a date and the numbers
  follow.
- **To show another section** (the plan, when it is written), use Settings.

## Good to know

- Once this is live, the database is what the site shows. Editing
  `clients/paact/plan.js` no longer changes the live page.
- To switch back to the old read-only page, remove the two `VITE_` settings and
  redeploy. Nothing in the database is deleted.
- If codes stop arriving after a burst of sign-ins, Supabase is limiting how
  many it sends in an hour. It resets on its own; the number is under
  *Authentication* → *Rate Limits*.
- If the Access list says **tag mismatch** next to someone, they already had an
  account tagged for another client, and they will not see PAACT until that tag
  changes. Changing it also changes what they see in the other product, so it is
  never done automatically.
