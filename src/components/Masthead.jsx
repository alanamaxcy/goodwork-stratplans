import React from 'react';

const ROLE_WORD = { owner: 'Owner', staff: 'Staff', board: 'Board — read only' };

export default function Masthead({ portal, labels, role, session, saveErr, isDemo, onSignOut }) {
  const email = session?.user?.email || '';
  const accent = portal.brand?.accent;
  return (
    <div className="masthead" style={accent ? { '--accent': accent } : undefined}>
      <div className="masthead-in">
        <div className="brand">
          {portal.brand?.logoUrl ? (
            <img className="brand-logo" src={portal.brand.logoUrl} alt="" />
          ) : null}
          <span className="brand-name">{portal.client_name}</span>
          <span className="brand-sub">
            {portal.engagement_name}{portal.place ? ` · ${portal.place}` : ''}
          </span>
        </div>
        <div className="mast-right">
          {isDemo ? (
            <>
              <span className="syncpill">not saved</span>
              <span className="eyebrow">Demo · full access</span>
            </>
          ) : (
            <>
              <span className={`syncpill${saveErr ? '' : ' live'}`}>
                {saveErr ? 'not saved' : 'live'}
              </span>
              <span className="eyebrow">{ROLE_WORD[role] || 'Board'}</span>
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
