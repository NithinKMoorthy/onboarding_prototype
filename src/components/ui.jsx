import { useEffect, useRef, useState } from 'react';
import { P } from '../lib/icons';
import { closeModal, toast } from '../lib/store';

export function Icon({ n, s = 16, className }) {
  // Path data is a static constant from lib/icons.
  return <svg className={className} width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: P[n] || '' }} />;
}

export const Spinner = () => <span className="spinner" aria-hidden="true" />;

const STATUS = {
  'Pending': ['pending', 'clock'], 'In progress': ['info', 'spin'], 'Completed': ['ok', 'ok'], 'Stopped': ['warn', 'warn'],
  'Connected': ['ok', 'ok'], 'Not deployed': ['info', 'info'], 'Deploying': ['info', 'spin'], 'Updating': ['info', 'spin'], 'Deployed': ['ok', 'ok'],
  'Open': ['info', 'info'], 'Dismissed': ['pending', 'x'], 'In remediation': ['info', 'spin'], 'Remediated': ['ok', 'ok'], 'Cancelled': ['pending', 'x'], 'Enabled': ['ok', 'ok'],
};
export function Status({ s, cls, icon, children }) {
  const [c, i] = cls ? [cls, icon] : (STATUS[s] || ['pending', 'info']);
  return <span className={`status ${c}`}>{i === 'spin' ? <Spinner /> : <Icon n={i} />}{children ?? s}</span>;
}

export const Sev = ({ s }) => <span className={`sev ${s}`}><span>{s}</span></span>;

export const ErrorText = ({ msg }) => msg ? <div className="err"><Icon n="err" s={14} />{msg}</div> : null;

export function Field({ id, label, optional, desc, hint, error, children, style }) {
  return (
    <div className="field" style={style}>
      {label && <label className="field-label" htmlFor={id}>{label}{optional && <> - <i>optional</i></>}</label>}
      {desc && <div className="desc">{desc}</div>}
      {children}
      <ErrorText msg={error} />
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function TextInput({ invalid, onChange, className = '', ...rest }) {
  return <input className={`input ${invalid ? 'invalid' : ''} ${className}`} onChange={e => onChange(e.target.value)} autoComplete="off" {...rest} />;
}

export function Select({ value, onChange, options, invalid, placeholder, className = 'input', ...rest }) {
  return (
    <select className={`${className} ${invalid ? 'invalid' : ''}`} value={value} onChange={e => onChange(e.target.value)} {...rest}>
      {placeholder != null && <option value="" disabled>{placeholder}</option>}
      {options.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return <option key={v} value={v}>{l}</option>; })}
    </select>
  );
}

export const FilterSelect = props => <Select className="fsel" {...props} />;

export function Choice({ type = 'radio', name, checked, onChange, label, desc, disabled, children }) {
  return (
    <label className={`choice ${disabled ? 'disabled' : ''}`}>
      <input type={type} name={name} checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      <span><span>{label}</span>{desc && <div className="desc">{desc}</div>}{checked && children}</span>
    </label>
  );
}

// Selectable card with a radio, for small sets of mutually exclusive options.
export function Tile({ name, checked, onChange, title, badge, badgeBelow, desc }) {
  return (
    <label className={`prov-tile ${checked ? 'selected' : ''}`}>
      <input type="radio" name={name} checked={checked} onChange={onChange} />
      <span>
        <b>{title}</b>{badge && !badgeBelow && <> <span className="badge green">{badge}</span></>}
        {badge && badgeBelow && <div style={{ margin: '4px 0' }}><span className="badge green">{badge}</span></div>}
        {desc && <div className="small muted">{desc}</div>}
      </span>
    </label>
  );
}

export function SearchInput({ value, onChange, placeholder, width }) {
  return (
    <div className="input-wrap" style={width ? { flex: `0 1 ${width}` } : undefined}>
      <Icon n="search" />
      <input className="input" type="search" placeholder={placeholder} aria-label={placeholder} value={value} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

export function CopyButton({ text }) {
  return <button className="copy" aria-label="Copy" onClick={() => { navigator.clipboard?.writeText(text).catch(() => {}); toast('Copied'); }}><Icon n="copy" /></button>;
}

export function Alert({ type = 'info', title, actions, onDismiss, children, style }) {
  const icon = { info: 'info', success: 'ok', warning: 'warn', error: 'err' }[type];
  return (
    <div className={`alert ${type}`} style={style}>
      <span className="alert-icon"><Icon n={icon} /></span>
      <div className="alert-body">{title && <b>{title}</b>}{title && children ? <br /> : null}{children}</div>
      {(actions || onDismiss) && <div className="alert-actions">{actions}{onDismiss && <button className="x" onClick={onDismiss} aria-label="Dismiss"><Icon n="x" /></button>}</div>}
    </div>
  );
}

export function Pager({ cur, pages, onChange }) {
  const lo = Math.max(1, Math.min(cur - 3, pages - 7)), hi = Math.min(pages, lo + 7);
  const nums = [];
  for (let p = lo; p <= hi; p++) nums.push(p);
  return (
    <div className="pager">
      <button disabled={cur <= 1} onClick={() => onChange(cur - 1)} aria-label="Previous page"><Icon n="left" /></button>
      {nums.map(p => <button key={p} className={p === cur ? 'cur' : ''} onClick={() => onChange(p)} aria-label={`Page ${p}`}>{p}</button>)}
      <button disabled={cur >= pages} onClick={() => onChange(cur + 1)} aria-label="Next page"><Icon n="right" /></button>
    </div>
  );
}

// Paging state that snaps back to page 1 whenever resetKey (e.g. the active filters) changes.
export function usePager(total, size = 10, resetKey = '') {
  const [page, setPage] = useState(1);
  const [lastKey, setLastKey] = useState(resetKey);
  if (lastKey !== resetKey) { setLastKey(resetKey); setPage(1); }
  const pages = Math.max(1, Math.ceil(total / size));
  const cur = Math.min(page, pages);
  return { slice: arr => arr.slice((cur - 1) * size, cur * size), el: <Pager cur={cur} pages={pages} onChange={setPage} /> };
}

export function useSelection() {
  const [sel, setSel] = useState(() => new Set());
  return {
    has: k => sel.has(k),
    size: sel.size,
    keys: [...sel],
    toggle: k => setSel(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; }),
    setMany: (ks, on) => setSel(s => { const n = new Set(s); ks.forEach(k => on ? n.add(k) : n.delete(k)); return n; }),
    clear: () => setSel(new Set()),
  };
}

export function Menu({ label, items, className = 'btn', disabled, above, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div className="menu-wrap" ref={ref}>
      <button className={className} disabled={disabled} onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={ariaLabel}>{label}</button>
      {open && (
        <div className="menu" role="menu" style={above ? { bottom: 'calc(100% + 4px)', top: 'auto' } : undefined}>
          {items.map((it, i) => it === '-'
            ? <hr key={i} style={{ border: 0, borderTop: '1px solid var(--border-light)', margin: '4px 0' }} />
            : <button key={i} role="menuitem" disabled={it.disabled} onClick={() => { setOpen(false); it.onClick(); }}>{it.label}</button>)}
        </div>
      )}
    </div>
  );
}

export function Modal({ title, onClose = closeModal, footer, wide, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  useEffect(() => { ref.current?.querySelector('input:not([type=radio]):not([type=checkbox]), textarea')?.focus(); }, []);
  return (
    <div className="modal-back" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className="modal" role="dialog" aria-modal="true" aria-label={title} style={wide ? { width: 760 } : undefined}>
        <div className="spread"><h2>{title}</h2><button className="copy" onClick={onClose} aria-label="Close"><Icon n="x" s={18} /></button></div>
        {children}
        <div className="foot">{footer}</div>
      </div>
    </div>
  );
}

export const CancelButton = () => <button className="btn link" onClick={closeModal}>Cancel</button>;

export function Breadcrumbs({ items }) {
  return (
    <nav className="bread" aria-label="Breadcrumb">
      {items.map(([label, href], i) => i < items.length - 1
        ? <span key={i} className="row" style={{ gap: 10 }}><a href={href}>{label}</a><span className="sep"><Icon n="right" s={14} /></span></span>
        : <span key={i} className="cur">{label}</span>)}
    </nav>
  );
}

// Select-like dropdown whose menu always opens below the field (native selects on macOS open centered over it).
export function Dropdown({ value, onChange, options, ariaLabel, variant = '', style, id }) {
  const opts = options.map(o => (Array.isArray(o) ? o : [o, o]));
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const ref = useRef(null);
  const current = opts.find(([v]) => v === value);

  useEffect(() => {
    if (!open) return;
    const onDown = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  useEffect(() => { if (open) ref.current?.querySelector('.dd-menu .hi')?.scrollIntoView({ block: 'nearest' }); }, [open, hi]);

  const show = () => { setHi(Math.max(0, opts.findIndex(([v]) => v === value))); setOpen(true); };
  const pick = v => { onChange(v); setOpen(false); ref.current?.querySelector('.dd-btn')?.focus(); };
  function onKey(e) {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); show(); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(opts.length - 1, h + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(0, h - 1)); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(opts[hi][0]); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
    else if (e.key === 'Tab') setOpen(false);
  }

  return (
    <div className={`dd ${variant}`} ref={ref} style={style}>
      <button type="button" id={id} className="dd-btn" aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : show())} onKeyDown={onKey}>
        <span>{current ? current[1] : ''}</span><Icon n="down" s={14} />
      </button>
      {open && (
        <ul className="dd-menu" role="listbox" aria-label={ariaLabel}>
          {opts.map(([v, l], i) => (
            <li key={v} role="option" aria-selected={v === value} className={`${i === hi ? 'hi' : ''} ${v === value ? 'sel' : ''}`}
              onMouseEnter={() => setHi(i)} onMouseDown={e => { e.preventDefault(); pick(v); }}>
              <span className="dd-check">{v === value ? '✓' : ''}</span>{l}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
