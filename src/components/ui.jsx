import React from 'react';
import { STACK, STATUS_LABEL, STATUS_VAR, pct } from '../lib/format.js';

export function Eyebrow({ children, style }) {
  return <span className="eyebrow" style={style}>{children}</span>;
}

export function SectionHead({ eyebrow, title, children }) {
  return (
    <div className="shead">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2>{title}</h2>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

export function Panel({ children, style, className = '' }) {
  return <div className={`panel ${className}`} style={style}>{children}</div>;
}

export function Dot({ status, small, late }) {
  return <span className={`dot ${small ? 'sm ' : ''}${late ? 'late' : status}`} />;
}

/* One bar, one vocabulary, everywhere in the product: progress first, absence
   last, with a 2px gap between segments so the recessive neutral stays legible. */
export function StatusBar({ c, total, className = 'pb-track' }) {
  return (
    <span className={className}>
      {STACK.map((k) => {
        const w = pct(c[k] || 0, total);
        return w ? <i key={k} style={{ width: `${w}%`, background: `var(${STATUS_VAR[k]})` }} /> : null;
      })}
    </span>
  );
}

export function StatusLegend() {
  return (
    <div className="clegend">
      {STACK.map((k) => (
        <span key={k}>
          <i className="swatch" style={{ background: `var(${STATUS_VAR[k]})` }} />
          {STATUS_LABEL[k]}
        </span>
      ))}
    </div>
  );
}

/* Horizontal stacked bars with a direct label on every row. */
export function HBars({ rows, max }) {
  return (
    <>
      {rows.map((r) => (
        <div className="hrow" key={r.name}>
          <span className="hl" title={r.name}>
            {r.name}
            {r.late ? <span style={{ color: 'var(--stop)' }} title={`${r.late} past due`}> •</span> : null}
          </span>
          <span className="hbar" style={{ width: `${Math.max(pct(r.total, max), 5)}%` }}>
            {STACK.map((k) =>
              r[k] ? (
                <i
                  key={k}
                  style={{ width: `${pct(r[k], r.total)}%`, background: `var(${STATUS_VAR[k]})` }}
                  title={`${STATUS_LABEL[k]}: ${r[k]}`}
                />
              ) : null,
            )}
          </span>
          <span className="hv num">{r.done}/{r.total}</span>
        </div>
      ))}
    </>
  );
}

export function EvidenceChips({ ids, label = 'Evidence', themes, onOpen }) {
  if (!ids || !ids.length) return null;
  return (
    <div className="chips">
      <span className="chips-label">{label}</span>
      {ids.map((id) => {
        const t = themes[id];
        if (!t) return null;
        return (
          <button className="chip" key={id} onClick={() => onOpen(id)}>
            <span className={`ck k-${t.cat}`}>{t.cat}</span>
            <span className="cn">{t.name}</span>
            <span className="cc num">{t.n}</span>
          </button>
        );
      })}
    </div>
  );
}

export function Tile({ value, label, alert }) {
  return (
    <div className={`tile${alert ? ' is-late' : ''}`}>
      <div className="tv num">{value}</div>
      <div className="tl">{label}</div>
    </div>
  );
}

export function Modal({ label, children, onClose }) {
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-label={label}>{children}</div>
    </>
  );
}
