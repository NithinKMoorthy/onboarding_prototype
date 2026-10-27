import { ui, emit, useStore } from './store';

export function parseRoute() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, q] = h.split('?');
  return { parts: path.split('/').filter(Boolean), q: new URLSearchParams(q || ''), path };
}

// A flash passed to go() shows on the page being navigated to, then clears on the next navigation.
window.addEventListener('hashchange', () => {
  ui.flash = ui.pending;
  ui.pending = null;
  ui.modal = null;
  emit();
});

export function go(hash, flash = null) {
  ui.pending = flash;
  if (location.hash === hash) { ui.flash = flash; ui.pending = null; emit(); }
  else location.hash = hash;
  window.scrollTo(0, 0);
}

export function useRoute() {
  useStore();
  return parseRoute();
}
