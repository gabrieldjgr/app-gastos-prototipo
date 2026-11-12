// Estado de la app guardado en el propio dispositivo (localStorage).
import { PREDEFINED_CATEGORIES, DEFAULT_VISIBLE, DASHBOARD_WIDGETS } from './data.js';
import { setBaseCurrency } from './format.js';

const KEY = 'ritmo.v1';
const listeners = new Set();

function defaultState() {
  return {
    version: 1,
    onboarded: false,
    settings: { currency: 'MXN', theme: 'auto', apiKey: '', model: 'claude-opus-5-5', name: '', rates: {} },
    visibleCategories: [...DEFAULT_VISIBLE],
    customCategories: [],
    costCenters: [{ id: 'cc-diario', name: 'Día a día', emoji: '🗓️' }],
    budgets: [],
    expenses: [],
    dashboard: DASHBOARD_WIDGETS.map((w) => ({ id: w.id, on: true })),
    lastBatchAt: null,
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const base = defaultState();
    return { ...base, ...parsed, settings: { ...base.settings, ...(parsed.settings || {}) } };
  } catch {
    return defaultState();
  }
}

export const state = load();
setBaseCurrency(state.settings.currency);

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('No se pudo guardar', err);
  }
  setBaseCurrency(state.settings.currency);
  listeners.forEach((fn) => fn());
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function replaceState(next) {
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, next);
  save();
}

export function resetAll() {
  replaceState(defaultState());
}

export function uid(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

// Categorías
export function allCategories() {
  return [...PREDEFINED_CATEGORIES.map((c) => ({ ...c, predefined: true })), ...state.customCategories];
}

export function visibleCategories() {
  return allCategories().filter((c) => !c.predefined || state.visibleCategories.includes(c.id));
}

export function categoryById(id) {
  return allCategories().find((c) => c.id === id) || { id: 'otros', name: 'Otros', emoji: '📦', color: 11 };
}

export function costCenterById(id) {
  return state.costCenters.find((c) => c.id === id) || state.costCenters[0];
}

export function mostUsedCategories(limit = 6) {
  const counts = {};
  for (const e of state.expenses) counts[e.categoryId] = (counts[e.categoryId] || 0) + 1;
  return visibleCategories()
    .slice()
    .sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0))
    .slice(0, limit);
}

// Gastos
export function rateFor(currency) {
  if (currency === state.settings.currency) return 1;
  return Number(state.settings.rates[currency]) || 1;
}

export function normalizeExpense(e) {
  const rate = e.currency === state.settings.currency ? 1 : Number(e.rate) || rateFor(e.currency);
  return { ...e, rate, amountBase: Math.round(Number(e.amount) * rate * 100) / 100 };
}

export function addExpense(data) {
  const e = normalizeExpense({
    id: uid('g'),
    status: 'confirmed',
    source: 'manual',
    currency: state.settings.currency,
    costCenterId: state.costCenters[0]?.id,
    paymentMethod: '',
    createdAt: Date.now(),
    ...data,
  });
  if (e.currency !== state.settings.currency && e.rate) state.settings.rates[e.currency] = e.rate;
  state.expenses.push(e);
  save();
  return e;
}

export function updateExpense(id, patch) {
  const i = state.expenses.findIndex((e) => e.id === id);
  if (i < 0) return;
  state.expenses[i] = normalizeExpense({ ...state.expenses[i], ...patch });
  save();
}

export function removeExpense(id) {
  const i = state.expenses.findIndex((e) => e.id === id);
  if (i < 0) return null;
  const [removed] = state.expenses.splice(i, 1);
  save();
  return { removed, index: i };
}

export function restoreExpense({ removed, index }) {
  state.expenses.splice(index, 0, removed);
  save();
}

export function confirmed() {
  return state.expenses.filter((e) => e.status === 'confirmed');
}

export function pending() {
  return state.expenses.filter((e) => e.status === 'pending');
}

// Posible duplicado: mismo monto (±0.5) a 2 días o menos de distancia.
export function findDuplicate(candidate, excludeIds = []) {
  const t = new Date(candidate.date).getTime();
  return state.expenses.find((e) => !excludeIds.includes(e.id)
    && Math.abs(e.amount - candidate.amount) <= 0.5
    && e.currency === candidate.currency
    && Math.abs(new Date(e.date).getTime() - t) <= 2 * 86400000);
}
