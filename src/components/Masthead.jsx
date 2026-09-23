import React from 'react';
import ThemeToggle from './ThemeToggle.jsx';

const ROLE_WORD = { owner: 'Owner', staff: 'Staff', board: 'Board — read only' };

/* `isFile` is "this portal is served from a file, so there is nothing to save
   to and no session behind it". `isDemo` is the narrower "this is the all-sample
   /demo portal". They were one prop, and a real client's portal — file-backed,
   but theirs — took the demo branch and announced itself as a Demo directly
   above a banner explaining that only SOME of its sections are samples. A
   client's own portal must never call itself a demo. */
export default function Masthead({
  portal, labels, role, session, saveErr, isFile, isDemo, sampleHere, showTheme = true, onSignOut,
}) {
  const email = session?.user?.email || '';
  /* WEAR THE NAME OF WHOEVER OWNS WHAT IS ON SCREEN. On a portal whose other
     sections are borrowed, holding this client's name across all five puts
     their masthead over another organisation's vision and priorities — the
     exact thing the sample marking exists to prevent, committed in the largest
     type on the page. So the identity follows the section. */
  const sc = sampleHere ? portal.sampleClient : null;
  const shownName = sc?.name || portal.client_name;
  const shownEngagement = sc?.engagement || portal.engagement_name;
  const shownPlace = sc ? sc.place : portal.place;
  const accent = portal.brand?.accent;
  const roleWord = ROLE_WORD[role] || 'Board';
  /* "Board — read only · full access" would contradict itself, and at 390px it
     wraps the masthead onto a third line. Only a role that can actually change
     something says so. */
  const fileWord = role === 'owner' || role === 'staff' ? `${roleWord} · full access` : roleWord;
  return (
    <div className="masthead" style={accent ? { '--accent': accent } : undefined}>
      <div className="masthead-in">
        <div className="brand">
          {portal.brand?.logoUrl ? (
            <img className="brand-logo" src={portal.brand.logoUrl} alt="" />
          ) : null}
          <span className="brand-name">{shownName}</span>
          <span className="brand-sub">
            {shownEngagement}{shownPlace ? ` · ${shownPlace}` : ''}
          </span>
        </div>
        <div className="mast-right">
          {isFile || isDemo ? (
            <>
              <span className="syncpill">not saved</span>
              {/* The role, then what it can reach. Only /demo says "Demo"; every
                  other file-backed portal states the access the viewer has and
                  lets the pill beside it say that nothing persists. */}
              <span className="eyebrow">{isDemo ? 'Demo · full access' : fileWord}</span>
              {/* The toggle sits immediately after .eyebrow in BOTH branches,
                  so it lands in the same place whichever way the portal is
                  being viewed. The browser test reads its role text from
                  '.mast-right .eyebrow', which a later sibling cannot affect. */}
              {showTheme ? <ThemeToggle /> : null}
            </>
          ) : (
            <>
              <span className={`syncpill${saveErr ? '' : ' live'}`}>
                {saveErr ? 'not saved' : 'live'}
              </span>
              <span className="eyebrow">{roleWord}</span>
              {showTheme ? <ThemeToggle /> : null}
              {/* The identity cluster stays intact at the right edge: avatar,
                  address, sign out. The toggle goes before it, not after. */}
              <span className="whoami">
                <span className="avatar">{email.slice(0, 2).toUpperCase()}</span>
                <span className="whoami-mail">{email}</span>
              </span>
              <button className="ghost" onClick={onSignOut}>Sign out</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
