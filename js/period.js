// Período elegido en Inicio (un mes o una semana) y utilidades para filtrar y comparar.
// Un período es { mode: 'month' | 'week', start: 'AAAA-MM-DD' }.
import { toISO, parseISO, addDays, monthName, dateRange, dateShort } from './format.js';
import { budgetWindow, budgetStats } from './budget.js';

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function periodOf(mode, ref = new Date()) {
  const d = startOfDay(ref);
  if (mode === 'week') return { mode, start: toISO(addDays(d, -((d.getDay() + 6) % 7))) };
  return { mode: 'month', start: toISO(new Date(d.getFullYear(), d.getMonth(), 1)) };
}

// Rango del período: start incluido, end excluido (como Date y como ISO).
export function periodRange(p) {
  const start = parseISO(p.start);
  const end = p.mode === 'week' ? addDays(start, 7) : new Date(start.getFullYear(), start.getMonth() + 1, 1);
  return { start, end, startISO: p.start, endISO: toISO(end) };
}

export function shiftPeriod(p, d) {
  const s = parseISO(p.start);
  return p.mode === 'week'
    ? { mode: 'week', start: toISO(addDays(s, 7 * d)) }
    : { mode: 'month', start: toISO(new Date(s.getFullYear(), s.getMonth() + d, 1)) };
}

export const isCurrent = (p) => p.start === periodOf(p.mode).start;
export const samePeriod = (a, b) => a.mode === b.mode && a.start === b.start;

// "noviembre", "octubre 2025" o "3–9 nov".
export function periodLabel(p) {
  const s = parseISO(p.start);
  if (p.mode === 'month') return `${monthName(s)}${s.getFullYear() !== new Date().getFullYear() ? ` ${s.getFullYear()}` : ''}`;
  const r = periodRange(p);
  return dateRange(r.start, r.end);
}

// Etiqueta corta para el eje de la Evolución: "oct" o "3 nov".
export function periodShort(p) {
  const s = parseISO(p.start);
  return p.mode === 'month' ? monthName(s, false) : dateShort(s);
}

// Al cambiar de meses a semanas (o al revés) se queda en la misma zona del calendario.
export function switchMode(p, mode) {
  if (p.mode === mode) return p;
  const r = periodRange(p);
  if (mode === 'week') {
    // La última semana del mes elegido (o la actual, si el mes es el actual).
    const last = addDays(r.end, -1);
    const today = startOfDay(new Date());
    return periodOf('week', last > today ? today : last);
  }
  return periodOf('month', r.start);
}

// Período anterior para comparar. Si p es el actual (incompleto), solo hasta el mismo día:
// "vs. oct al día 13" en meses, o los mismos días de la semana pasada.
export function compareRange(p) {
  const prev = shiftPeriod(p, -1);
  const pr = periodRange(prev);
  if (!isCurrent(p)) return { ...pr, prev, partial: false };
  const today = startOfDay(new Date());
  const days = Math.round((today - periodRange(p).start) / 86400000) + 1;
  const cut = addDays(pr.start, days);
  const end = cut < pr.end ? cut : pr.end;
  return { start: pr.start, end, startISO: pr.startISO, endISO: toISO(end), prev, partial: true, day: today.getDate(), days };
}

export const sumIn = (expenses, startISO, endISO, pred = () => true) =>
  expenses.reduce((s, e) => (e.date >= startISO && e.date < endISO && pred(e) ? s + e.amountBase : s), 0);

// Estado de un presupuesto para el período elegido: el período del presupuesto que contiene
// el último día elegido. Si ese período ya terminó, se muestra "cerrado" (completo, sin proyección).
export function budgetStatsFor(budget, expenses, p) {
  if (!p || isCurrent(p)) return { stats: budgetStats(budget, expenses), closed: false };
  const r = periodRange(p);
  const today = startOfDay(new Date());
  const ref = addDays(r.end, -1) > today ? today : addDays(r.end, -1);
  const win = budgetWindow(budget, ref);
  // Presupuesto por fechas que no coincide con el período elegido.
  if (budget.period === 'none' && (win.end <= r.start || win.start >= r.end)) return null;
  if (win.end > today) return { stats: budgetStats(budget, expenses), closed: false };
  const stats = budgetStats(budget, expenses, addDays(win.end, -1));
  // Sin gastos en ese período: probablemente el presupuesto aún no existía.
  if (!stats.count) return null;
  return { stats, closed: true };
}

// Fecha del primer gasto confirmado (para no navegar a períodos vacíos sin fin).
export function firstExpenseDate(expenses) {
  let min = null;
  for (const e of expenses) if (e.status === 'confirmed' && (!min || e.date < min)) min = e.date;
  return min;
}

// ---------------------------------------------------------------- Cortes de tarjeta

// Día d del mes m (si el mes es más corto, el último día). m puede salirse de 0–11.
function dayIn(y, m, d) {
  const last = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(d, last));
}

// Corte (estado de cuenta) de una tarjeta de crédito con día de corte.
// offset 0 = el corte en curso (cierra hoy o después); -1 = el último cerrado (el que se paga); -2, -3… anteriores.
// El día de corte pertenece al corte que cierra ese día.
export function statementRange(method, offset = 0, ref = new Date()) {
  const cut = Number(method.cutDay);
  if (!cut) return null;
  const today = startOfDay(ref);
  const k = dayIn(today.getFullYear(), today.getMonth(), cut) < today ? 1 : 0;
  const closeOf = (i) => dayIn(today.getFullYear(), today.getMonth() + k + i, cut);
  const close = closeOf(offset);
  const start = addDays(closeOf(offset - 1), 1);
  const end = addDays(close, 1);
  let due = null;
  const pay = Number(method.payDay);
  if (pay) {
    due = dayIn(close.getFullYear(), close.getMonth(), pay);
    if (due <= close) due = dayIn(close.getFullYear(), close.getMonth() + 1, pay);
  }
  return { start, end, startISO: toISO(start), endISO: toISO(end), close, due, open: offset >= 0, offset, label: dateRange(start, end) };
}
