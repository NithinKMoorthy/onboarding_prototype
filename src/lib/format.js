export const fmtDate = t => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
export const fmtTime = t => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
export const fmtDT = t => `${fmtDate(t)}, ${fmtTime(t)}`;
export const elapsed = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}m ${s % 60}s`; };
export const plural = (n, word, pl) => `${n} ${n === 1 ? word : (pl || word + 's')}`;
export const hex = n => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');

export function hash(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; }
  return h >>> 0;
}

// Seeded PRNG so simulated results are stable across reloads.
export function rng(seed) {
  let a = hash(seed);
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

export function focusFirstError() {
  setTimeout(() => {
    const el = document.querySelector('.input.invalid');
    if (el) { el.focus(); el.scrollIntoView({ block: 'center' }); }
  }, 0);
}

export function ago(t) {
  const d = Math.floor((Date.now() - t) / 86400000);
  if (d < 1) return 'today';
  if (d < 14) return d === 1 ? 'yesterday' : `${d} days ago`;
  return `${Math.round(d / 7)} weeks ago`;
}
