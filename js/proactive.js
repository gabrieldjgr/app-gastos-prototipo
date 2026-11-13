// Avisos proactivos: la app nota algo y ofrece ayuda en el momento justo, sin insistir.
// Este módulo solo detecta y lleva la memoria anti-molestia; la interfaz vive en app.js.
import { state, save, persist, categoryById } from './store.js';
import { budgetStats, budgetWindow } from './budget.js';
import { todayISO, toISO, parseISO, addDays, daysAgo } from './format.js';

export const NOTICE_TYPES = [
  { id: 'pace', name: 'Alertas de ritmo', desc: 'Cuando un presupuesto va bastante arriba de lo ideal' },
  { id: 'due', name: 'Pago de tarjetas', desc: 'Pocos días antes de la fecha límite de pago' },
  { id: 'period', name: 'Inicio de período', desc: 'Al empezar el período de un plan' },
  { id: 'stale', name: 'Importaciones atrasadas', desc: 'Cuando una cuenta lleva días sin actualizarse' },
  { id: 'recurring', name: 'Cargos recurrentes', desc: 'Detecta suscripciones y pagos que se repiten' },
  { id: 'merchant', name: 'Aprender comercios', desc: 'Propone recordar la categoría de un comercio' },
  { id: 'card', name: 'Tarjetas nuevas', desc: 'Cuando aparece una tarjeta que no tienes registrada' },
  { id: 'unusual', name: 'Gastos inusuales', desc: 'Cargos muy por encima de lo habitual' },
  { id: 'backup', name: 'Recordatorio de respaldo', desc: 'Cada semana, para que te envíes tu archivo de respaldo' },
];

const SNOOZE_DAYS = 30;
const IGNORES_TO_SNOOZE = 2;

// ---------------------------------------------------------------- Memoria anti-molestia

export function typeEnabled(type) {
  return (state.settings.noticeTypes || {})[type] !== false;
}

// ¿Se puede mostrar este aviso? Respeta el tipo apagado, el "No" permanente, lo ya hecho y la pausa de 30 días.
export function allowed(key, type) {
  if (!typeEnabled(type)) return false;
  const n = state.notices[key];
  if (!n) return true;
  if (n.status === 'no' || n.status === 'done') return false;
  if (n.until && n.until > todayISO()) return false;
  return true;
}

// Registra la respuesta de la persona: 'done' (resuelto), 'no' (no volver a preguntar) o 'acted' (tocó algo).
export function resolveNotice(key, status) {
  const n = state.notices[key] || {};
  n.acted = true;
  if (status === 'done' || status === 'no') n.status = status;
  state.notices[key] = n;
  save();
}

export function resetNotices() {
  state.notices = {};
  state.noticeLog = null;
  save();
}

// Un solo aviso de inicio por día. Si el de ayer se ignoró, cuenta; a la segunda, se pausa 30 días.
export function pickHomeNotice(candidates) {
  const today = todayISO();
  const log = state.noticeLog;
  if (log && log.day === today) {
    // Ya hubo aviso hoy: se mantiene el mismo mientras siga vigente y sin respuesta.
    const same = candidates.find((c) => c.key === log.key);
    if (same && allowed(same.key, same.type) && !state.notices[same.key]?.acted) return same;
    // Si la persona respondió, no hay otro aviso hasta mañana.
    if (log.key && state.notices[log.key]?.acted) return null;
    // Si el aviso de hoy dejó de aplicar sin respuesta (cambiaron los datos), se puede elegir otro.
    if (log.key && same) return null;
    const next = candidates.filter((c) => allowed(c.key, c.type)).sort((a, b) => b.priority - a.priority)[0] || null;
    state.noticeLog = { day: today, key: next?.key || null };
    persist();
    return next;
  }
  if (log && log.key && log.day < today) {
    const n = state.notices[log.key] || {};
    if (!n.acted && !n.status) {
      n.ignores = (n.ignores || 0) + 1;
      if (n.ignores >= IGNORES_TO_SNOOZE) { n.until = toISO(addDays(new Date(), SNOOZE_DAYS)); n.ignores = 0; }
      state.notices[log.key] = n;
    } else if (n.acted && !n.status) {
      delete n.acted; // tocó "ver detalle" pero no lo cerró: puede volver otro día
      state.notices[log.key] = n;
    }
  }
  const pick = candidates.filter((c) => allowed(c.key, c.type)).sort((a, b) => b.priority - a.priority)[0] || null;
  state.noticeLog = { day: today, key: pick?.key || null };
  persist();
  return pick;
}

// ---------------------------------------------------------------- Utilidades

export function normMerchant(text) {
  return String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z ]+/g, ' ').replace(/\b(suc|sucursal|mx|sa|de|cv|online|www|com)\b/g, ' ')
    .replace(/\s+/g, ' ').trim().split(' ').slice(0, 2).join(' ');
}

const confirmedSince = (days) => {
  const from = toISO(addDays(new Date(), -days));
  return state.expenses.filter((e) => e.status === 'confirmed' && e.date >= from);
};

const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function dayInMonth(year, month, day) {
  const last = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, last));
}

const diffDays = (a, b) => Math.round((parseISO(toISO(a)) - parseISO(toISO(b))) / 86400000);

// ---------------------------------------------------------------- Avisos de inicio

export function homeCandidates() {
  const out = [];
  const today = new Date();

  // 1. Pago de tarjeta: faltan 3 días o menos para la fecha límite.
  for (const m of state.paymentMethods) {
    if (m.archived || m.type !== 'credito' || !m.payDay) continue;
    let due = dayInMonth(today.getFullYear(), today.getMonth(), Number(m.payDay));
    if (diffDays(due, today) < 0) due = dayInMonth(today.getFullYear(), today.getMonth() + 1, Number(m.payDay));
    const left = diffDays(due, today);
    if (left > 3) continue;
    // Gasto del corte: del corte anterior al último corte (o el último mes si no hay día de corte).
    let lastCut = m.cutDay ? dayInMonth(due.getFullYear(), due.getMonth(), Number(m.cutDay)) : addDays(due, -20);
    if (diffDays(lastCut, due) >= 0) lastCut = dayInMonth(lastCut.getFullYear(), lastCut.getMonth() - 1, Number(m.cutDay || lastCut.getDate()));
    const prevCut = dayInMonth(lastCut.getFullYear(), lastCut.getMonth() - 1, lastCut.getDate());
    const from = toISO(addDays(prevCut, 1));
    const to = toISO(lastCut);
    const total = state.expenses.filter((e) => e.status === 'confirmed' && e.paymentMethod === m.name && e.date >= from && e.date <= to).reduce((a, e) => a + e.amountBase, 0);
    out.push({ type: 'due', key: `due:${m.id}:${toISO(due)}`, priority: 100 - left, method: m, due, left, total });
  }

  // 2. Ritmo: pasado el día 7, el gasto va más de 15 % arriba de lo ideal y la proyección supera el presupuesto.
  const pace = [];
  for (const b of state.budgets) {
    const s = budgetStats(b, state.expenses);
    if (s.elapsed < 7 || !s.canProject || s.idealToday <= 0) continue;
    const over = s.spent / s.idealToday - 1;
    if (over < 0.15 || s.projected <= s.amount) continue;
    pace.push({ type: 'pace', key: `pace:${b.id}:${toISO(s.start)}`, priority: 80 + Math.min(9, over * 10), budget: b, stats: s, over });
  }
  pace.sort((a, b) => b.over - a.over);
  if (pace[0]) out.push(pace[0]);

  // 3. Inicio de período de un plan o presupuesto total (primeros 3 días).
  for (const b of state.budgets) {
    if (b.categoryId || b.period === 'none') continue;
    const { start } = budgetWindow(b);
    const since = diffDays(today, start);
    if (since < 0 || since > 2) continue;
    out.push({ type: 'period', key: `period:${b.groupId || b.id}:${toISO(start)}`, priority: 70, budget: b, start });
  }

  // 4. Importación atrasada por medio de pago (más de 10 días sin movimientos del banco).
  for (const m of state.paymentMethods) {
    if (m.archived || !['credito', 'debito', 'cuenta'].includes(m.type)) continue;
    const mine = state.expenses.filter((e) => e.paymentMethod === m.name && e.source === 'batch');
    if (!mine.length) continue;
    const last = mine.reduce((a, e) => (e.date > a ? e.date : a), '0000');
    const ago = daysAgo(last);
    if (ago <= 10) continue;
    out.push({ type: 'stale', key: `stale:${m.id}:${last}`, priority: 55 + Math.min(4, ago / 10), method: m, last, ago });
  }
  if (!out.some((c) => c.type === 'stale') && state.expenses.length) {
    const ago = state.lastBatchAt ? daysAgo(state.lastBatchAt) : null;
    if (ago === null || ago > 10) out.push({ type: 'stale', key: `stale:any:${state.lastBatchAt || 'nunca'}`, priority: 54, ago });
  }

  // 6. Respaldo: 7 días o más sin enviarse el archivo (la clave cambia con cada envío).
  if (state.expenses.length) {
    const sent = state.backup?.lastSent || null;
    const ago = sent ? daysAgo(sent) : null;
    if (ago === null || ago >= 7) out.push({ type: 'backup', key: `backup:${sent || 'nunca'}`, priority: 45, ago });
  }

  // 5. Cargos recurrentes: mismo comercio y monto (±5 %) en al menos 2 de los últimos 3 meses.
  const rec = recurringCandidates();
  if (rec[0]) out.push({ type: 'recurring', key: `recurring:${rec[0].norm}`, priority: 50, ...rec[0] });

  return out;
}

export function recurringCandidates() {
  const now = new Date();
  const months = [0, 1, 2].map((i) => toISO(new Date(now.getFullYear(), now.getMonth() - i, 1)).slice(0, 7));
  const groups = new Map();
  for (const e of confirmedSince(100)) {
    const norm = normMerchant(e.merchant);
    if (!norm || state.recurring[norm]) continue;
    if (!groups.has(norm)) groups.set(norm, []);
    groups.get(norm).push(e);
  }
  const out = [];
  for (const [norm, list] of groups) {
    // Un solo cargo por mes, en al menos 2 de los últimos 3 meses, con montos parecidos (±5 %).
    const inWindow = list.filter((e) => months.includes(e.date.slice(0, 7)));
    const byMonth = new Map();
    for (const e of inWindow) byMonth.set(e.date.slice(0, 7), [...(byMonth.get(e.date.slice(0, 7)) || []), e]);
    if (byMonth.size < 2 || [...byMonth.values()].some((v) => v.length > 1)) continue;
    const amounts = inWindow.map((e) => e.amountBase);
    const med = Math.round(median(amounts) * 100) / 100;
    if (amounts.some((a) => Math.abs(a - med) > med * 0.05)) continue;
    // Y en un día parecido del mes (±5 días), como cobra una suscripción.
    const days = inWindow.map((e) => Number(e.date.slice(8, 10)));
    if (Math.max(...days) - Math.min(...days) > 5) continue;
    for (const [k, v] of byMonth) byMonth.set(k, v[0]);
    const last = [...byMonth.values()].sort((a, b) => b.date.localeCompare(a.date))[0];
    out.push({ norm, name: last.merchant, amount: med, categoryId: last.categoryId, day: Number(last.date.slice(8, 10)), months: byMonth.size });
  }
  return out.sort((a, b) => b.amount - a.amount);
}

export function isRecurring(e) {
  return Boolean(state.recurring[normMerchant(e.merchant)]);
}

// ---------------------------------------------------------------- Avisos de la bandeja

// Comercio que la persona ya puso 2+ veces en la misma categoría hace poco y aún no tiene regla.
export function merchantCandidates() {
  const recent = toISO(addDays(new Date(), -14));
  const stats = new Map();
  for (const e of confirmedSince(90)) {
    const norm = normMerchant(e.merchant);
    if (!norm || state.merchantRules[norm]) continue;
    const k = `${norm}|${e.categoryId}`;
    const s = stats.get(k) || { norm, categoryId: e.categoryId, name: e.merchant, count: 0, last: '' };
    s.count++;
    if (e.date > s.last) { s.last = e.date; s.name = e.merchant; }
    stats.set(k, s);
  }
  return [...stats.values()]
    .filter((s) => s.count >= 2 && s.last >= recent && categoryById(s.categoryId).id !== 'otros')
    .map((s) => ({ type: 'merchant', key: `merchant:${s.norm}:${s.categoryId}`, ...s }))
    .filter((c) => allowed(c.key, c.type))
    .sort((a, b) => b.last.localeCompare(a.last));
}

export function ruleFor(merchant) {
  return state.merchantRules[normMerchant(merchant)] || null;
}

// Gasto pendiente muy por encima de lo habitual en su categoría (3 veces la mediana, con 5+ muestras).
export function unusualInfo(e) {
  if (!typeEnabled('unusual') || e.ai?.unusualOk || (e.ai?.tipo && e.ai.tipo !== 'gasto')) return null;
  const sample = confirmedSince(180).filter((x) => x.categoryId === e.categoryId).map((x) => x.amountBase);
  if (sample.length < 5) return null;
  const med = median(sample);
  if (!med || e.amountBase < med * 3) return null;
  return { median: med, times: Math.round(e.amountBase / med) };
}

// Tasa de cambio guardada hace más de 7 días.
export function staleRate(currency) {
  if (currency === state.settings.currency) return null;
  const d = (state.settings.rateDates || {})[currency];
  if (!state.settings.rates[currency]) return null;
  if (!d) return { date: null };
  return daysAgo(d) > 7 ? { date: d } : null;
}
