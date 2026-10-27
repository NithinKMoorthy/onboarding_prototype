import { useSyncExternalStore } from 'react';

/* Persisted prototype data lives in `S` (localStorage); cross-page UI state lives in `ui` (memory only).
   Both are mutable; every change goes through commit()/setUi(), which bump a version so React re-renders. */

const KEY = 'atx-onboarding-proto-v1';

export const defaults = () => ({
  service: null,
  homeBannerX: false, cmBannerX: false,
  sources: [], analyses: [], schedules: [], remediations: [],
  fstate: {}, ftrans: {}, infra: {}, seq: 1,
});

function load() {
  try { return Object.assign(defaults(), JSON.parse(localStorage.getItem(KEY)) || {}); } catch { return defaults(); }
}

let S = load();
let version = 0;
const listeners = new Set();

export const ui = { flash: null, pending: null, toast: null, modal: null, drawer: false, ask: true, msgs: [] };

export const db = () => S;
export const getVersion = () => version;
export function emit() { version++; listeners.forEach(l => l()); }
const subscribe = l => { listeners.add(l); return () => listeners.delete(l); };

export function useStore() {
  useSyncExternalStore(subscribe, getVersion);
  return S;
}

export function commit(fn) {
  const result = fn(S);
  localStorage.setItem(KEY, JSON.stringify(S));
  emit();
  return result;
}

export function replaceState(next) {
  S = next;
  localStorage.setItem(KEY, JSON.stringify(S));
  emit();
}

export function resetAll() {
  localStorage.removeItem(KEY);
  S = defaults();
  Object.assign(ui, { modal: null, msgs: [], flash: null, pending: null });
  emit();
}

export function setUi(patch) {
  Object.assign(ui, typeof patch === 'function' ? patch(ui) : patch);
  emit();
}

// Only call inside commit().
export const nid = prefix => `${prefix}-${String(S.seq++).padStart(4, '0')}`;

let toastTimer;
export function toast(text) {
  setUi({ toast: text });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => setUi({ toast: null }), 2200);
}

export const openModal = (kind, props = {}) => setUi({ modal: { kind, ...props } });
export const closeModal = () => setUi({ modal: null });
