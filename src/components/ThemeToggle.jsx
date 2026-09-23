import React, { useCallback, useEffect, useState } from 'react';
import '../styles/theme-wipe.css';

/* ---------------------------------------------------------------------------
   THE THEME TOGGLE

   THREE STATES EXIST, TWO ARE SHOWN. tokens.css declares the dark palette
   twice on purpose so that (a) the OS preference wins when <html> carries no
   data-theme, and (b) an explicit data-theme beats the OS. That gives three
   real states: following the OS, explicitly light, explicitly dark. This
   button exposes them as a two-position switch that starts from whatever the
   OS currently resolves to, because the masthead has room for one 30px square
   at 390px and a third "Auto" position needs a word next to it to mean
   anything — a board member reading a third icon would just see noise.

   "Following the OS" is still reachable, and reachable by accident in the
   right way: choosing the theme the OS is already on CLEARS the override
   instead of freezing it (see applyTheme). So a person who flips to dark at
   noon and back to light at 4pm is following the OS again, and their laptop
   going dark at sunset takes the portal with it. The only state we can never
   return to is "explicitly the same as the OS", which is indistinguishable
   from following it until the OS changes.

   Everything about the wipe itself lives in ../styles/theme-wipe.css.
   --------------------------------------------------------------------------- */

/* Must match the restore script inlined in index.html <head>. Changing one
   without the other gives a returning visitor a flash of the wrong theme. */
const STORE_KEY = 'gw.theme';

/* The transition runs 640ms (theme-wipe.css). If `finished` somehow never
   settles, this is the failsafe that stops .theme-wipe from being left on
   <html> forever, which would kill every transition on the page. */
const WIPE_FAILSAFE_MS = 2500;

function mq(query) {
  try {
    return window.matchMedia ? window.matchMedia(query) : null;
  } catch (e) {
    /* matchMedia throws in a few hardened embedded webviews. */
    return null;
  }
}

function osTheme() {
  const m = mq('(prefers-color-scheme: dark)');
  return m && m.matches ? 'dark' : 'light';
}

/* What the page is actually WEARING right now: an explicit choice if there is
   one, otherwise whatever the OS says. */
export function resolvedTheme() {
  const attr = document.documentElement.getAttribute('data-theme');
  return attr === 'dark' || attr === 'light' ? attr : osTheme();
}

/* `persist` separates a PREFERENCE from a FORCED theme.

   A forced theme (the section-driven one — see App.jsx) must always write the
   attribute, even when it matches the OS: dropping the override because the OS
   agrees today would let the OS flipping at sunset silently take the light
   "this is your content" page dark, which is the one thing the signal must
   never do. It also never touches storage, because it is not a choice the
   person made and must not outlive the portal. */
function applyTheme(next, { persist = true } = {}) {
  const root = document.documentElement;
  if (!persist) {
    root.setAttribute('data-theme', next);
    return;
  }
  if (next === osTheme()) {
    /* Back in step with the OS — drop the override rather than pinning a
       value that will go stale the next time the OS flips. */
    root.removeAttribute('data-theme');
    try {
      localStorage.removeItem(STORE_KEY);
    } catch (e) {
      /* Storage throws outright in some privacy modes. The theme still
         applies for this visit; only the memory of it is lost. */
    }
  } else {
    root.setAttribute('data-theme', next);
    try {
      localStorage.setItem(STORE_KEY, next);
    } catch (e) {
      /* as above */
    }
  }
}

/* Where the circle grows from. A keyboard activation reports clientX/clientY
   as 0, so fall back to the centre of the element that was activated — read
   the rect now, while the event is still on the stack. */
export function originOf(ev) {
  const el = ev && (ev.currentTarget || ev.target);
  if (ev && (ev.clientX || ev.clientY)) return { x: ev.clientX, y: ev.clientY };
  if (el && el.getBoundingClientRect) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  return null;
}

/* The wipe, extracted so that BOTH the toggle and the section change can drive
   it. `persist` is false for the section-driven theme: it is a signal about
   what you are looking at, not a preference, and must not outlive the portal. */
export function wipeToTheme(next, origin, { persist = true } = {}) {
  const root = document.documentElement;

  let timer = 0;
  let cleared = false;
  const clear = () => {
    if (cleared) return;
    cleared = true;
    if (timer) clearTimeout(timer);
    root.classList.remove('theme-wipe');
  };

  const reduce = mq('(prefers-reduced-motion: reduce)');
  const supported = typeof document.startViewTransition === 'function';

  /* startViewTransition REJECTS on a hidden tab rather than resolving, so a
     theme flipped from a background tab throws unless document.hidden is
     checked. Firefox and older Safari have no API at all. Reduced motion is a
     request, not a hint. All three take the instant flip — and the instant
     flip is not a degraded outcome here: the theme still lands, so the signal
     it carries still lands. */
  if (!supported || document.hidden || (reduce && reduce.matches)) {
    applyTheme(next, { persist });
    return;
  }

  const W = window.innerWidth;
  const H = window.innerHeight;
  const x = origin ? origin.x : W / 2;
  const y = origin ? origin.y : 0;

  /* The radius has to reach the FARTHEST corner from the origin, or the circle
     stops growing before it has covered the screen and you watch a hard edge
     park mid-page. The +4 hides sub-pixel rounding at the end. */
  const r = Math.hypot(Math.max(x, W - x), Math.max(y, H - y)) + 4;

  root.style.setProperty('--wipe-x', `${x}px`);
  root.style.setProperty('--wipe-y', `${y}px`);
  root.style.setProperty('--wipe-r', `${r}px`);
  root.classList.add('theme-wipe');

  let t;
  try {
    t = document.startViewTransition(() => {
      applyTheme(next, { persist });
    });
  } catch (e) {
    /* Threw before or after running the callback — applyTheme is idempotent,
       so just make sure the theme landed and the class came off. */
    applyTheme(next, { persist });
    clear();
    return;
  }

  timer = setTimeout(clear, WIPE_FAILSAFE_MS);
  /* BOTH paths. A rejected transition that skips this leaves .theme-wipe on
     <html> and every transition on the page permanently dead. */
  t.finished.then(clear, clear);
}

export default function ThemeToggle() {
  /* State drives the ARIA only. The icon is swapped in CSS off data-theme so
     that it changes inside the view transition — see theme-wipe.css. */
  const [dark, setDark] = useState(() => resolvedTheme() === 'dark');

  /* While we are following the OS, the OS can change under us (sunset, or
     someone toggling macOS appearance). Keep aria-pressed honest. */
  useEffect(() => {
    const m = mq('(prefers-color-scheme: dark)');
    if (!m) return undefined;
    const onChange = () => setDark(resolvedTheme() === 'dark');
    if (m.addEventListener) m.addEventListener('change', onChange);
    else if (m.addListener) m.addListener(onChange); // Safari < 14
    return () => {
      if (m.removeEventListener) m.removeEventListener('change', onChange);
      else if (m.removeListener) m.removeListener(onChange);
    };
  }, []);

  const onClick = useCallback((ev) => {
    const next = resolvedTheme() === 'dark' ? 'light' : 'dark';
    /* Synchronously, before anything else: the ARIA state. This only rewrites
       attributes, never pixels, so it is safe to let React land it whenever. */
    setDark(next === 'dark');
    wipeToTheme(next, originOf(ev));
  }, []);

  return (
    <button
      type="button"
      className="themetoggle"
      onClick={onClick}
      /* A stable name plus aria-pressed is the correct shape for a toggle
         button: the name says what the control is, aria-pressed says whether
         it is on. A name that flips wording would also lag a render behind. */
      aria-label="Dark theme"
      aria-pressed={dark}
      title={dark ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {/* Both icons are always in the DOM; theme-wipe.css shows one. */}
      <svg
        className="tt-moon"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M16.2 12.6A6.8 6.8 0 0 1 7.4 3.8a6.8 6.8 0 1 0 8.8 8.8Z" />
      </svg>
      <svg
        className="tt-sun"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="10" cy="10" r="3.6" />
        <path d="M10 1.8v1.8M10 16.4v1.8M3.8 10H2M18 10h-1.8M5.6 5.6 4.4 4.4M15.6 15.6l-1.2-1.2M14.4 5.6l1.2-1.2M4.4 15.6l1.2-1.2" />
      </svg>
    </button>
  );
}
