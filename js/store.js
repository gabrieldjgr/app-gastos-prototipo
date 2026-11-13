// Estado de la app guardado en el propio dispositivo (localStorage).
import { PREDEFINED_CATEGORIES, DEFAULT_VISIBLE, DASHBOARD_WIDGETS, DEFAULT_METHODS } from './data.js';
import { setBaseCurrency, todayISO } from './format.js';

const KEY = 'ritmo.v1';
const listeners = new Set();

function defaultState() {
  return {
    version: 1,
    onboarded: false,
    settings: { currency: 'MXN', theme: 'auto', provider: 'anthropic', keys: {}, models: {}, name: '', rates: {}, rateDates: {}, noticeTypes: {}, cropTipSeen: false },
    paymentMethods: DEFAULT_METHODS.map((m) => ({ ...m })),
    visibleCategories: [...DEFAULT_VISIBLE],
    customCategories: [],
    costCenters: [{ id: 'cc-diario', name: 'Día a día', emoji: '🗓️' }],
    budgets: [],
    expenses: [],
    dashboard: DASHBOARD_WIDGETS.map((w) => ({ id: w.id, on: true })),
    lastBatchAt: null,
    notices: {}, // memoria de avisos: { clave: { status, until, ignores, acted } }
    noticeLog: null, // aviso de inicio mostrado hoy
    merchantRules: {}, // comercio normalizado → categoría
    recurring: {}, // comercio normalizado → { name, amount, categoryId, day }
    backup: { auto: true, lastFileDay: null, lastHash: null, lastSent: null }, // respaldo diario y último envío
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const base = defaultState();
    return migrate({ ...base, ...parsed, settings: { ...base.settings, ...(parsed.settings || {}) } }, parsed);
  } catch {
    return defaultState();
  }
}

// Adapta datos guardados por versiones anteriores (v0.1).
function migrate(s, raw) {
  const st = s.settings;
  if (st.apiKey) { st.keys = { ...st.keys, anthropic: st.apiKey }; delete st.apiKey; }
  if (st.model) { st.models = { ...st.models, anthropic: st.model }; delete st.model; }
  // v0.3 guardaba las tarjetas ignoradas aparte; ahora viven en la memoria de avisos.
  for (const d of st.ignoredCards || []) s.notices[`card:${d}`] = { status: 'no' };
  delete st.ignoredCards;
  if (!raw.paymentMethods) {
    // Los medios usados en gastos antiguos se convierten en medios configurados.
    const used = new Set(s.expenses.map((e) => e.paymentMethod).filter(Boolean));
    const list = [...DEFAULT_METHODS.map((m) => ({ ...m }))];
    for (const name of used) if (!list.some((m) => m.name === name)) list.push({ id: uid('pm'), name, type: guessType(name), last4: '', owner: '' });
    s.paymentMethods = list;
  }
  return s;
}

function guessType(name) {
  const n = name.toLowerCase();
  if (/cr[eé]dito|tdc/.test(n)) return 'credito';
  if (/d[eé]bito|tdd/.test(n)) return 'debito';
  if (/efectivo/.test(n)) return 'efectivo';
  if (/mercado pago|zelle|pago m[oó]vil|billetera|paypal/.test(n)) return 'billetera';
  return 'cuenta';
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

// Guarda sin volver a pintar la pantalla (para registros internos hechos durante el pintado).
export function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('No se pudo guardar', err);
  }
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

// Carga datos de un respaldo como si vinieran del almacenamiento (con valores por defecto y migraciones).
export function restoreState(parsed) {
  const base = defaultState();
  replaceState(migrate({ ...base, ...parsed, settings: { ...base.settings, ...(parsed.settings || {}) } }, parsed));
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

// Medios de pago activos (sin archivados), en el orden elegido.
export function paymentMethods({ archived = false } = {}) {
  return state.paymentMethods.filter((m) => Boolean(m.archived) === archived);
}

export function methodByName(name) {
  return state.paymentMethods.find((m) => m.name === name);
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

// Guarda la tasa y la fecha en que se actualizó (si cambió).
export function setRate(currency, rate) {
  const r = Number(rate) || 1;
  if (state.settings.rates[currency] !== r || !(state.settings.rateDates || {})[currency]) {
    state.settings.rateDates = { ...state.settings.rateDates, [currency]: todayISO() };
  }
  state.settings.rates[currency] = r;
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
  if (e.currency !== state.settings.currency && e.rate) setRate(e.currency, e.rate);
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
