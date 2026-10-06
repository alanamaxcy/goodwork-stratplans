/* One screen's copy of the engagement document, kept in step with the
   database while other people on the team edit the same document.

   No React and no Supabase in here: `load` and `save` are handed in, which is
   what lets test/engagement.mjs run two editors against one fake database and
   prove nothing anyone saves is lost.

   THE RULE IT ENFORCES. A save names the version it was built on (the row's
   updated_at) and the database applies it only if the row is still on that
   version. When somebody else got there first the save matches nothing, and
   this file re-reads the row and puts the change back on top of THEIR version
   before trying again. Nobody's save ever silently replaces another's.

   Two kinds of change go through it:

     apply(op)        a tick or a status, straight from the timeline. Queued,
                      shown at once, saved in order, replayed after a collision.
     saveDraft(...)   the editor's whole document. Merged three ways against
                      whatever the database holds by then (lib/engagement.js),
                      and handed back with the collisions named when two people
                      changed the same thing, so a person decides, not a race. */

import { applyOp, merge, same, tidy, toCanonical } from './engagement.js';

const errorOf = (code, message) => Object.assign(new Error(message), { code });

/* Phase numbers are derived from the dates (tidy() renumbers), so they are not
   anyone's edit. Two people who each move a phase both renumber the list, and
   comparing the numbers would report a collision neither of them made. */
const unnumbered = (e) => ({ ...e, phases: (e.phases || []).map((p) => ({ ...p, number: 0 })) });

export function createEngagementSync({ load, save, onView = () => {}, onError = () => {}, onSaved = () => {}, maxTries = 5 }) {
  let server = null; // { engagement, updated_at } — the last copy the database confirmed
  let queue = []; // edits shown on screen and not yet confirmed
  let running = false;
  let current = Promise.resolve();
  let staleDuringFlight = false;

  const view = () => (server ? queue.reduce(applyOp, server.engagement) : null);
  const emit = () => { if (server) onView(view(), server); };

  /* A save that matched no row is either somebody else saving first, or a save
     this account may not make — the database answers "0 rows" for both, on
     purpose. Re-reading tells them apart: if the row moved on, it was a
     collision; if it did not, it was a refusal. */
  async function settle(sentAt) {
    const fresh = await load();
    if (!fresh) throw errorOf('gone', 'This portal is no longer available to your account.');
    if (fresh.updated_at === sentAt) {
      throw errorOf('refused', 'Your account cannot change this portal. Ask whoever manages access.');
    }
    return { engagement: toCanonical(fresh.engagement), updated_at: fresh.updated_at };
  }

  async function run() {
    /* Yield once before touching anything, so `running` and `current` are
       both set before this can finish — a flush of nothing but no-ops would
       otherwise complete synchronously and leave the flag stuck. */
    await null;
    try {
      while (queue.length) {
        const batch = queue.slice();
        for (let tries = 0; ; tries += 1) {
          const next = batch.reduce(applyOp, server.engagement);
          /* Every edit in the batch was a no-op on this copy — the deliverable
             it ticked has since been deleted, say. Nothing to save. */
          if (next === server.engagement || same(next, server.engagement)) break;
          const r = await save(next, server.updated_at);
          if (r && r.ok) {
            server = { engagement: next, updated_at: r.updated_at };
            onSaved(server);
            break;
          }
          if (tries + 1 >= maxTries) {
            throw errorOf('busy', 'Several people are saving at the same moment. Try again in a few seconds.');
          }
          server = await settle(server.updated_at);
        }
        queue = queue.slice(batch.length);
        emit();
      }
    } catch (e) {
      /* What could not be saved comes off the screen. Showing a tick the
         database does not hold is how a team ends up arguing about whether
         something was done. */
      queue = [];
      emit();
      onError(e);
    } finally {
      running = false;
    }
    if (staleDuringFlight) {
      staleDuringFlight = false;
      await refresh();
    }
  }

  function kick() {
    if (running) return current;
    running = true;
    current = run();
    return current;
  }

  /* Wait for every queued edit to land (or fail). */
  const idle = () => (running ? current : Promise.resolve());

  /* A freshly loaded portal. Anything queued against a previous one is gone. */
  function reset(next) {
    server = next ? { engagement: toCanonical(next.engagement), updated_at: next.updated_at } : null;
    queue = [];
    emit();
  }

  /* The database moved on without us — realtime, or the tab regaining focus.
     Queued edits stay on top of the newer copy, exactly as after a collision. */
  async function refresh() {
    if (!server) return;
    if (running) { staleDuringFlight = true; return; }
    let fresh;
    try { fresh = await load(); } catch { return; } // offline: keep what is on screen
    if (!fresh || fresh.updated_at === server.updated_at) return;
    server = { engagement: toCanonical(fresh.engagement), updated_at: fresh.updated_at };
    emit();
  }

  function apply(op) {
    if (!server) return Promise.resolve();
    queue.push(op);
    emit();
    return kick();
  }

  /* base: the document as the editor opened it. mine: the editor's draft.
     prefer: null to stop and report collisions, or 'mine' / 'theirs' once a
     person has chosen. Resolves to { ok: true, value } when saved, or to
     { ok: false, conflicts, theirs, merged } when two people changed the same
     thing and nobody has said which to keep. */
  async function saveDraft(base, mine, { prefer = null } = {}) {
    await idle();
    if (!server) throw errorOf('gone', 'This portal is no longer available to your account.');
    const b = unnumbered(tidy(base));
    const m = tidy(mine);
    let fresh = server;
    for (let tries = 0; tries < maxTries; tries += 1) {
      const theirs = tidy(fresh.engagement);
      const result = merge(b, unnumbered(m), unnumbered(theirs), prefer || 'theirs');
      const value = tidy(result.value);
      if (result.conflicts.length && !prefer) {
        return { ok: false, conflicts: result.conflicts, mine: m, theirs, merged: value };
      }
      if (same(value, theirs)) return { ok: true, value: theirs, unchanged: true };
      const r = await save(value, fresh.updated_at);
      if (r && r.ok) {
        server = { engagement: value, updated_at: r.updated_at };
        queue = [];
        emit();
        onSaved(server);
        return { ok: true, value };
      }
      fresh = await settle(fresh.updated_at);
      server = fresh;
      emit();
    }
    throw errorOf('busy', 'Several people are saving at the same moment. Try again in a few seconds.');
  }

  return {
    reset,
    refresh,
    apply,
    saveDraft,
    idle,
    view,
    server: () => server,
    pending: () => queue.length,
  };
}
