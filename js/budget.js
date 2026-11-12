// Ventanas de presupuesto, gasto acumulado, ritmo y proyección.
import { parseISO, toISO } from './format.js';

const DAY = 86400000;

function addMonths(date, n, day) {
  const y = date.getFullYear();
  const m = date.getMonth() + n;
  const last = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(day, last));
}

// Período vigente en refDate: { start, end } con end exclusivo.
export function budgetWindow(budget, refDate = new Date()) {
  const ref = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate());
  const resetDay = Number(budget.resetDay) || 1;
  switch (budget.period) {
    case 'monthly': {
      let start = addMonths(ref, 0, resetDay);
      if (start > ref) start = addMonths(ref, -1, resetDay);
      return { start, end: addMonths(start, 1, resetDay) };
    }
    case 'weekly': {
      const diff = (ref.getDay() - (resetDay % 7) + 7) % 7;
      const start = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - diff);
      return { start, end: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7) };
    }
    case 'biweekly': {
      const anchor = budget.startDate ? parseISO(budget.startDate) : ref;
      const n = Math.floor((ref - anchor) / (14 * DAY));
      const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + n * 14);
      return { start, end: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 14) };
    }
    case 'yearly': {
      const anchor = budget.startDate ? parseISO(budget.startDate) : new Date(ref.getFullYear(), 0, 1);
      let start = new Date(ref.getFullYear(), anchor.getMonth(), anchor.getDate());
      if (start > ref) start = new Date(ref.getFullYear() - 1, anchor.getMonth(), anchor.getDate());
      return { start, end: new Date(start.getFullYear() + 1, start.getMonth(), start.getDate()) };
    }
    default: {
      const start = budget.startDate ? parseISO(budget.startDate) : ref;
      const endIncl = budget.endDate ? parseISO(budget.endDate) : new Date(start.getTime() + 30 * DAY);
      return { start, end: new Date(endIncl.getFullYear(), endIncl.getMonth(), endIncl.getDate() + 1) };
    }
  }
}

export function matchesBudget(expense, budget) {
  if (expense.status !== 'confirmed') return false;
  if (budget.costCenterId && expense.costCenterId !== budget.costCenterId) return false;
  if (budget.categoryId && expense.categoryId !== budget.categoryId) return false;
  return true;
}

export function budgetStats(budget, expenses, refDate = new Date()) {
  const { start, end } = budgetWindow(budget, refDate);
  const totalDays = Math.max(1, Math.round((end - start) / DAY));
  const today = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate());
  const startISO = toISO(start);
  const endISO = toISO(end);
  const inWindow = expenses.filter((e) => matchesBudget(e, budget) && e.date >= startISO && e.date < endISO);

  const perDay = new Array(totalDays).fill(0);
  for (const e of inWindow) {
    const idx = Math.round((parseISO(e.date) - start) / DAY);
    if (idx >= 0 && idx < totalDays) perDay[idx] += e.amountBase;
  }

  let elapsed;
  if (today < start) elapsed = 0;
  else if (today >= end) elapsed = totalDays;
  else elapsed = Math.round((today - start) / DAY) + 1;

  const cumulative = [];
  let acc = 0;
  for (let i = 0; i < totalDays; i++) {
    acc += perDay[i];
    cumulative.push(acc);
  }
  const spent = elapsed > 0 ? cumulative[elapsed - 1] : 0;
  const amount = Number(budget.amount) || 0;
  const daysLeft = totalDays - elapsed;

  // Proyección: promedio diario; con más de 10 días, mezcla 50/50 con los últimos 7 días.
  // Los gastos grandes y puntuales (más del 20 % del presupuesto, como la renta) no se
  // extrapolan: ya ocurrieron y no se repetirán cada día.
  const canProject = elapsed >= 3 && inWindow.length >= 2 && daysLeft > 0;
  const oneOff = amount * 0.2;
  const perDayVar = new Array(totalDays).fill(0);
  for (const e of inWindow) {
    if (e.amountBase > oneOff) continue;
    const idx = Math.round((parseISO(e.date) - start) / DAY);
    if (idx >= 0 && idx < totalDays) perDayVar[idx] += e.amountBase;
  }
  const varSpent = perDayVar.slice(0, elapsed).reduce((s, v) => s + v, 0);
  let rate = elapsed > 0 ? varSpent / elapsed : 0;
  if (elapsed > 10) {
    const last7 = perDayVar.slice(elapsed - 7, elapsed).reduce((s, v) => s + v, 0) / 7;
    rate = 0.5 * rate + 0.5 * last7;
  }
  const projected = daysLeft > 0 ? spent + rate * daysLeft : spent;
  const remaining = amount - spent;
  const perDayLeft = daysLeft > 0 ? Math.max(0, remaining) / daysLeft : 0;
  const idealToday = amount * (elapsed / totalDays);
  const reference = canProject ? projected : spent;

  let status = 'ok';
  if (spent > amount) status = 'over';
  else if (canProject && projected > amount * 1.1) status = 'over';
  else if (canProject && projected > amount) status = 'warn';

  return {
    start, end, totalDays, elapsed, cumulative, perDay, spent, amount, idealToday,
    projected, canProject, remaining, daysLeft, perDayLeft, status,
    projectedDelta: amount > 0 ? reference / amount - 1 : 0,
    idealDelta: idealToday > 0 ? spent / idealToday - 1 : 0,
    count: inWindow.length, expenses: inWindow,
  };
}

export const STATUS_LABEL = { ok: '✓ En ritmo', warn: '▲ Cerca del límite', over: '● Sobre presupuesto' };
