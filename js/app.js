// Ritmo · prototipo PWA de control de gastos.
import {
  state, save, subscribe, uid, allCategories, visibleCategories, categoryById, costCenterById,
  mostUsedCategories, addExpense, updateExpense, removeExpense, restoreExpense, confirmed, pending,
  findDuplicate, resetAll, rateFor,
} from './store.js';
import { CURRENCIES, PAYMENT_METHODS, PERIODS, WEEKDAYS, DASHBOARD_WIDGETS, PREDEFINED_CATEGORIES } from './data.js';
import {
  money, moneyShort, dateShort, dayHeader, todayISO, toISO, parseISO, addDays, daysAgo, monthName,
  esc, parseAmount, currencyPrefix, formatNumber, dateRange,
} from './format.js';
import { budgetStats, budgetWindow } from './budget.js';
import {
  paceCard, ghostPace, prepareDraw, attachPaceTouch, categoryBars, trendBars, costCenterRows,
  topMerchants, progressWithNotch, heroMoney, paceSVG,
} from './charts.js';
import {
  icon, openSheet, closeTopSheet, pick, confirmDialog, toast, confetti, swipeable, collapse, countUp, vibrate,
} from './ui.js';
import { loadSampleData } from './sample.js';
import { hasApiKey, extractWithClaude, extractDemo, MODELS, AiError } from './ai.js';

const app = document.getElementById('app');
const view = {
  tab: 'home',
  trendMode: 'month',
  filters: { period: 'month', category: null, cc: null, method: null, q: '' },
  reviewBase: 0,
  expanded: null,
};
const animated = new Set();

const STATUS_TEXT = { ok: '✓ En ritmo', warn: '▲ Cerca del límite', over: '● Sobre presupuesto' };
const TIPO_TEXT = { ingreso: 'Ingreso', transferencia: 'Transferencia', pago_tarjeta: 'Pago de tarjeta' };

// ---------------------------------------------------------------- Arranque

function applyTheme() {
  document.documentElement.dataset.theme = state.settings.theme || 'auto';
  const dark = state.settings.theme === 'dark' || (state.settings.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#111014' : '#F6F3EC');
}

function boot() {
  applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  if (!state.onboarded) renderOnboarding();
  else renderShell();
  subscribe(() => { if (state.onboarded && document.getElementById('screen')) rerender(); });
  document.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey);
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

// ---------------------------------------------------------------- Primer uso

function renderOnboarding() {
  let currency = state.settings.currency;
  app.innerHTML = `<main class="onboarding">
    <div class="ob-logo">${logoSVG()}</div>
    <h1 class="ob-title">Ritmo</h1>
    <p class="ob-sub">Tus gastos, al día en minutos. Sube capturas del banco y mira si vas al ritmo de tu presupuesto.</p>
    <p class="ob-q">¿En qué moneda piensas?</p>
    <div class="chip-row center" id="ob-cur">${['MXN', 'ARS', 'VES', 'USD'].map((c) => `<button class="chip ${c === currency ? 'on' : ''}" data-cur="${c}">${c}</button>`).join('')}</div>
    <div class="ob-actions">
      <button class="btn primary big" id="ob-sample">Empezar con datos de ejemplo</button>
      <button class="btn ghost big" id="ob-blank">Empezar en blanco</button>
    </div>
    <p class="ob-foot">Prototipo · tus datos se guardan solo en este dispositivo.</p>
  </main>`;
  app.querySelector('#ob-cur').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cur]');
    if (!b) return;
    currency = b.dataset.cur;
    app.querySelectorAll('#ob-cur .chip').forEach((c) => c.classList.toggle('on', c === b));
  });
  app.querySelector('#ob-sample').addEventListener('click', () => {
    state.settings.currency = currency;
    save();
    loadSampleData();
    renderShell();
  });
  app.querySelector('#ob-blank').addEventListener('click', () => {
    state.settings.currency = currency;
    state.onboarded = true;
    save();
    renderShell();
  });
}

function logoSVG(size = 72) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 72 72" aria-hidden="true"><rect width="72" height="72" rx="20" fill="#5B3DF5"/>
    <path d="M14 56 L58 18" stroke="#fff" stroke-opacity=".45" stroke-width="3" stroke-dasharray="4 5" stroke-linecap="round"/>
    <path d="M14 56 L24 56 L24 46 L36 46 L36 38 L46 38 L46 30" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="46" cy="30" r="5" fill="#fff"/></svg>`;
}

// ---------------------------------------------------------------- Estructura

function renderShell() {
  app.innerHTML = `<main id="screen" class="screen"></main>
    <nav class="tabbar" aria-label="Secciones">
      ${tabBtn('home', 'Inicio', 'home')}
      ${tabBtn('expenses', 'Gastos', 'list')}
      <button class="fab" data-action="add-menu" aria-label="Agregar gasto">${icon('plus')}</button>
      ${tabBtn('review', 'Revisar', 'inbox')}
      ${tabBtn('budgets', 'Presupuestos', 'target')}
    </nav>`;
  const screen = document.getElementById('screen');
  screen.addEventListener('scroll', () => screen.classList.toggle('scrolled', screen.scrollTop > 36), { passive: true });
  rerender();
}

function tabBtn(id, label, ico) {
  return `<button class="tab" data-action="tab" data-tab="${id}" aria-label="${label}">${icon(ico)}<span>${label}</span>${id === 'review' ? '<b class="badge" id="badge"></b>' : ''}</button>`;
}

function rerender() {
  const screen = document.getElementById('screen');
  if (!screen) return;
  const keep = screen.scrollTop;
  const renderers = { home: renderHome, expenses: renderExpenses, review: renderReview, budgets: renderBudgets };
  screen.innerHTML = renderers[view.tab]();
  screen.dataset.tab = view.tab;
  screen.scrollTop = keep;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === view.tab));
  const count = pending().length;
  const badge = document.getElementById('badge');
  if (badge) { badge.textContent = count > 99 ? '99+' : count; badge.hidden = count === 0; }
  afterRender(screen);
}

function afterRender(screen) {
  if (view.tab === 'home') setupCarousel(screen);
  if (view.tab === 'expenses') {
    const input = screen.querySelector('#search');
    input?.addEventListener('input', () => { view.filters.q = input.value; renderExpenseList(); });
    renderExpenseList();
  }
  if (view.tab === 'review') setupReviewSwipes(screen);
}

function switchTab(tab) {
  if (view.tab === tab) {
    document.getElementById('screen')?.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  view.tab = tab;
  const screen = document.getElementById('screen');
  screen.scrollTop = 0;
  screen.classList.remove('scrolled');
  rerender();
}

function topbar(title, { overline = '', action = '' } = {}) {
  return `<div class="mini-bar"><span>${esc(title)}</span></div>
    <header class="topbar"><div>${overline ? `<p class="overline">${esc(overline)}</p>` : ''}<h1>${title}</h1></div>${action}</header>`;
}

function emptyState(emoji, title, text, button = '') {
  return `<div class="empty"><div class="empty-emoji">${emoji}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>${button}</div>`;
}

// ---------------------------------------------------------------- Inicio

function sortedBudgets() {
  const main = state.costCenters[0]?.id;
  const rank = { over: 0, warn: 1, ok: 2 };
  const withStats = state.budgets.map((b) => ({ b, s: budgetStats(b, state.expenses) }));
  const totals = withStats.filter(({ b }) => !b.categoryId).sort((a, b) => (a.b.costCenterId === main ? -1 : 0) - (b.b.costCenterId === main ? -1 : 0));
  const cats = withStats.filter(({ b }) => b.categoryId).sort((a, b) => rank[a.s.status] - rank[b.s.status] || b.s.projectedDelta - a.s.projectedDelta);
  return [...totals, ...cats].map(({ b }) => b);
}

function renderHome() {
  const today = new Date();
  const pend = pending().length;
  const last = state.lastBatchAt ? daysAgo(state.lastBatchAt) : null;
  const name = state.settings.name ? `, ${esc(state.settings.name)}` : '';
  let html = topbar(`Hola${name} 👋`, {
    overline: monthName(today),
    action: `<button class="icon-btn" data-action="settings" aria-label="Ajustes">${icon('gear')}</button>`,
  });
  if (pend > 0) html += `<button class="notice accent" data-action="tab" data-tab="review"><span>📥</span><span><b>${pend} ${pend === 1 ? 'movimiento' : 'movimientos'}</b> por revisar</span>${icon('chevron')}</button>`;
  if (state.expenses.length && (last === null || last >= 4)) {
    html += `<button class="notice" data-action="batch"><span>⏰</span><span>${last === null ? 'Aún no te pones al día con tu banco' : `Hace ${last} días que no te pones al día`}</span>${icon('chevron')}</button>`;
  }
  for (const w of state.dashboard) {
    if (!w.on) continue;
    if (w.id === 'pace') html += paceCarousel();
    if (w.id === 'categories') html += widget('Por categoría', categoryBars(), monthName(today));
    if (w.id === 'trend') html += widget('Evolución', trendBars(view.trendMode));
    if (w.id === 'costcenters') html += widget('Centros de costo', costCenterRows());
    if (w.id === 'merchants') html += widget('Top comercios', topMerchants());
  }
  html += `<button class="link-btn" data-action="customize">Personalizar inicio</button>`;
  return html;
}

function widget(title, body, sub = '') {
  return `<section class="card widget"><header class="widget-head"><h2>${title}</h2>${sub ? `<span class="muted">${esc(sub)}</span>` : ''}</header>${body}</section>`;
}

function paceCarousel() {
  const budgets = sortedBudgets();
  if (!budgets.length) return ghostPace();
  return `<section class="carousel-wrap" aria-label="Ritmo de presupuestos">
    <div class="carousel" id="carousel">${budgets.map((b) => paceCard(b)).join('')}</div>
    ${budgets.length > 1 ? `<div class="dots">${budgets.slice(0, 7).map((b, i) => `<button class="cdot ${i === 0 ? 'on' : ''}" data-action="car-go" data-i="${i}" aria-label="Presupuesto ${i + 1}"></button>`).join('')}</div>
    <button class="car-arrow prev" data-action="car-step" data-d="-1" aria-label="Anterior">${icon('back')}</button>
    <button class="car-arrow next" data-action="car-step" data-d="1" aria-label="Siguiente">${icon('chevron')}</button>` : ''}
  </section>`;
}

function setupCarousel(screen) {
  const car = screen.querySelector('#carousel');
  if (!car) return;
  const cards = [...car.querySelectorAll('.pace-card')];
  cards.forEach((card) => {
    const budget = state.budgets.find((b) => b.id === card.dataset.budget);
    attachPaceTouch(card.querySelector('.pace-wrap'), budgetStats(budget, state.expenses));
    if (animated.has(card.dataset.budget)) card.classList.add('play', 'static');
    else prepareDraw(card);
    card.addEventListener('click', (e) => { if (!e.target.closest('svg')) openBudgetDetail(card.dataset.budget); });
  });
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting || en.intersectionRatio < 0.6) continue;
      const card = en.target;
      const i = cards.indexOf(card);
      screen.querySelectorAll('.cdot').forEach((d, j) => d.classList.toggle('on', j === Math.min(i, 6)));
      if (!animated.has(card.dataset.budget)) {
        animated.add(card.dataset.budget);
        card.classList.add('play');
        if (reduce) card.classList.add('static');
        const hero = card.querySelector('.hero');
        if (hero && !reduce) countUp(hero, heroMoney);
      }
    }
  }, { root: null, threshold: [0.6] });
  cards.forEach((c) => io.observe(c));
}

function carouselGo(i) {
  const car = document.getElementById('carousel');
  const card = car?.children[i];
  if (card) car.scrollTo({ left: card.offsetLeft - car.offsetLeft, behavior: 'smooth' });
}

function carouselStep(d) {
  const car = document.getElementById('carousel');
  if (!car) return;
  const i = Math.round(car.scrollLeft / car.clientWidth);
  carouselGo(Math.max(0, Math.min(car.children.length - 1, i + d)));
}

// ---------------------------------------------------------------- Gastos

const PERIOD_FILTERS = [
  { value: 'month', label: 'Este mes' },
  { value: 'last', label: 'Mes pasado' },
  { value: '90', label: 'Últimos 90 días' },
  { value: 'all', label: 'Todo' },
];

function renderExpenses() {
  const f = view.filters;
  const chip = (key, label, value, active) => `<button class="chip filter ${active ? 'on' : ''}" data-action="filter" data-key="${key}">${esc(value || label)}${active && key !== 'period' ? `<span class="chip-x" data-action="filter-clear" data-key="${key}">${icon('x')}</span>` : ''}</button>`;
  const periodLabel = PERIOD_FILTERS.find((p) => p.value === f.period).label;
  return `${topbar('Gastos')}
    <div class="search-bar"><label class="search">${icon('search')}<input id="search" type="search" placeholder="Buscar comercio o descripción" value="${esc(f.q)}" autocomplete="off"></label>
      <div class="chip-row scroll">
        ${chip('period', 'Período', periodLabel, true)}
        ${chip('category', 'Categoría', f.category ? categoryById(f.category).name : '', !!f.category)}
        ${chip('cc', 'Centro', f.cc ? costCenterById(f.cc).name : '', !!f.cc)}
        ${chip('method', 'Método', f.method || '', !!f.method)}
      </div>
    </div>
    <div id="exp-list"></div>`;
}

function filteredExpenses() {
  const f = view.filters;
  const now = new Date();
  let from = '0000';
  let to = '9999';
  if (f.period === 'month') { from = toISO(new Date(now.getFullYear(), now.getMonth(), 1)); to = toISO(new Date(now.getFullYear(), now.getMonth() + 1, 1)); }
  if (f.period === 'last') { from = toISO(new Date(now.getFullYear(), now.getMonth() - 1, 1)); to = toISO(new Date(now.getFullYear(), now.getMonth(), 1)); }
  if (f.period === '90') from = toISO(addDays(now, -90));
  const q = f.q.trim().toLowerCase();
  return confirmed()
    .filter((e) => e.date >= from && e.date < to)
    .filter((e) => !f.category || e.categoryId === f.category)
    .filter((e) => !f.cc || e.costCenterId === f.cc)
    .filter((e) => !f.method || e.paymentMethod === f.method)
    .filter((e) => !q || `${e.merchant} ${e.description}`.toLowerCase().includes(q))
    .sort((a, b) => (b.date.localeCompare(a.date)) || (b.createdAt - a.createdAt));
}

function renderExpenseList() {
  const host = document.getElementById('exp-list');
  if (!host) return;
  const list = filteredExpenses();
  if (!list.length) {
    host.innerHTML = state.expenses.length
      ? emptyState('🔍', 'Nada por aquí', 'No hay gastos con estos filtros.')
      : emptyState('🧾', 'Aún no hay gastos', 'Sube una captura de tu banco o agrega tu primer gasto.', '<button class="btn primary" data-action="add-menu">Agregar gasto</button>');
    return;
  }
  const groups = new Map();
  for (const e of list) {
    if (!groups.has(e.date)) groups.set(e.date, []);
    groups.get(e.date).push(e);
  }
  let html = '';
  for (const [date, items] of groups) {
    const total = items.reduce((s, e) => s + e.amountBase, 0);
    html += `<section class="day-group"><h3 class="day-head"><span>${dayHeader(date)}</span><span class="num">${money(total)}</span></h3>
      ${items.map(expenseRow).join('')}</section>`;
  }
  const total = list.reduce((s, e) => s + e.amountBase, 0);
  html += `<p class="list-foot">${list.length} ${list.length === 1 ? 'gasto' : 'gastos'} · <b class="num">${money(total)}</b></p>`;
  host.innerHTML = html;
  host.querySelectorAll('.row.swipe').forEach((row) => {
    swipeable(row, { onLeft: () => deleteExpense(row.dataset.id, row) });
  });
}

function expenseRow(e) {
  const c = categoryById(e.categoryId);
  const cc = costCenterById(e.costCenterId);
  const foreign = e.currency !== state.settings.currency;
  return `<div class="row swipe" data-id="${e.id}">
    <div class="swipe-bg left">${icon('trash')}<span>Eliminar</span></div>
    <div class="swipe-content" data-action="edit-expense" data-id="${e.id}">
      <span class="avatar" style="--cat:var(--c${c.color})">${c.emoji}</span>
      <span class="row-main"><span class="row-title">${esc(e.merchant || e.description || 'Gasto')}</span><span class="row-sub">${esc(c.name)} · ${esc(cc?.name || '')}</span></span>
      <span class="row-amt"><span class="num">${money(e.amountBase)}</span>${foreign ? `<small>${money(e.amount, e.currency)}</small>` : ''}</span>
    </div>
  </div>`;
}

async function deleteExpense(id, rowEl) {
  if (rowEl) await collapse(rowEl);
  const r = removeExpense(id);
  if (r) toast('Gasto eliminado', { undo: () => restoreExpense(r) });
}

async function chooseFilter(key) {
  const f = view.filters;
  let value;
  if (key === 'period') value = await pick({ title: 'Período', options: PERIOD_FILTERS, selected: f.period });
  if (key === 'category') value = await pick({ title: 'Categoría', options: visibleCategories().map((c) => ({ value: c.id, label: c.name, emoji: c.emoji, color: c.color })), selected: f.category });
  if (key === 'cc') value = await pick({ title: 'Centro de costo', options: state.costCenters.map((c) => ({ value: c.id, label: c.name, emoji: c.emoji })), selected: f.cc });
  if (key === 'method') value = await pick({ title: 'Método de pago', options: PAYMENT_METHODS.map((m) => ({ value: m, label: m })), selected: f.method });
  if (value === undefined) return;
  f[key] = value;
  rerender();
}

// ---------------------------------------------------------------- Revisar

function reviewGroups() {
  const pend = pending().sort((a, b) => b.date.localeCompare(a.date));
  const notExpense = pend.filter((e) => e.ai?.tipo && e.ai.tipo !== 'gasto');
  const rest = pend.filter((e) => !notExpense.includes(e));
  const needs = rest.filter((e) => e.ai?.confianza === 'baja' || e.ai?.dupOf);
  const ready = rest.filter((e) => !needs.includes(e));
  return { pend, needs, ready, notExpense };
}

function renderReview() {
  const { pend, needs, ready, notExpense } = reviewGroups();
  if (!pend.length) {
    view.reviewBase = 0;
    return `${topbar('Revisar')}${emptyState('✅', '¡Estás al día!', 'Cuando subas capturas o archivos del banco, los movimientos aparecerán aquí para que los confirmes en segundos.', '<button class="btn primary" data-action="batch">Ponerme al día</button>')}`;
  }
  view.reviewBase = Math.max(view.reviewBase, pend.length);
  const progress = 1 - pend.length / view.reviewBase;
  let html = `${topbar(`${pend.length} por revisar`)}
    <div class="review-top">
      <div class="thin-progress"><span style="--w:${(progress * 100).toFixed(1)}%"></span></div>
      ${ready.length ? `<button class="btn primary full" data-action="confirm-safe">${icon('check')} Confirmar los ${ready.length} seguros</button>` : ''}
    </div>`;
  if (needs.length) {
    html += `<h2 class="section-title">Necesitan tu ojo <span class="count">${needs.length}</span></h2>`;
    html += needs.map(needsCard).join('');
  }
  if (ready.length) {
    html += `<h2 class="section-title">Listos <span class="count">${ready.length}</span></h2>`;
    html += `<div class="card list-card">${ready.map(readyRow).join('')}</div>`;
  }
  if (notExpense.length) {
    html += `<details class="not-expense" ${needs.length + ready.length === 0 ? 'open' : ''}><summary><span>No son gasto <span class="count">${notExpense.length}</span></span><span class="muted">Transferencias, pagos e ingresos</span></summary>
      <div class="card list-card">${notExpense.map(notExpenseRow).join('')}</div>
      <button class="btn ghost full" data-action="discard-nonexpense">Descartar estos ${notExpense.length}</button></details>`;
  }
  return html;
}

function sourceLabel(e) {
  return { batch: 'del banco', receipt: 'recibo', file: 'archivo', manual: 'manual' }[e.source] || '';
}

function needsCard(e) {
  const c = categoryById(e.categoryId);
  const dup = e.ai?.dupOf ? state.expenses.find((x) => x.id === e.ai.dupOf) : null;
  return `<article class="rcard swipe" data-id="${e.id}">
    <div class="swipe-bg right">${icon('check')}</div><div class="swipe-bg left">${icon('x')}</div>
    <div class="swipe-content">
      <div class="r-top">
        <span class="avatar" style="--cat:var(--c${c.color})">${c.emoji}</span>
        <span class="row-main"><span class="row-title">${esc(e.merchant || e.description)}</span><span class="row-sub">${dateShort(e.date)} · ${esc(c.name)}</span></span>
        <span class="row-amt"><span class="num">${money(e.amount, e.currency)}</span></span>
      </div>
      ${dup ? `<div class="dup"><span class="tag warn">Posible duplicado</span>
          <p class="dup-text">Ya tienes <b>${esc(dup.merchant)}</b> · ${dateShort(dup.date)} · ${money(dup.amount, dup.currency)}</p>
          <div class="btn-row"><button class="btn ghost sm" data-action="dup-same" data-id="${e.id}">Es el mismo</button><button class="btn ghost sm" data-action="dup-two" data-id="${e.id}">Son dos</button></div></div>` : ''}
      ${e.ai?.pregunta ? `<div class="ai-q"><p class="bubble">${esc(e.ai.pregunta)}</p>
          <div class="chip-row">${(e.ai.opciones?.length ? e.ai.opciones : [e.categoryId]).map((id) => { const oc = categoryById(id); return `<button class="chip answer" data-action="answer" data-id="${e.id}" data-cat="${id}">${oc.emoji} ${esc(oc.name)}</button>`; }).join('')}
          <button class="chip answer" data-action="edit-pending" data-id="${e.id}">Otra…</button></div></div>` : ''}
      <div class="r-actions">
        <button class="round-btn" data-action="discard" data-id="${e.id}" aria-label="Descartar">${icon('x')}</button>
        <button class="round-btn ok" data-action="confirm" data-id="${e.id}" aria-label="Confirmar">${icon('check')}</button>
      </div>
    </div>
  </article>`;
}

function readyRow(e) {
  const c = categoryById(e.categoryId);
  const open = view.expanded === e.id;
  return `<div class="row swipe ready ${open ? 'open' : ''}" data-id="${e.id}">
    <div class="swipe-bg right">${icon('check')}</div><div class="swipe-bg left">${icon('x')}</div>
    <div class="swipe-content">
      <div class="r-line" data-action="expand" data-id="${e.id}">
        <span class="avatar" style="--cat:var(--c${c.color})">${c.emoji}</span>
        <span class="row-main"><span class="row-title">${esc(e.merchant || e.description)}</span><span class="row-sub">${esc(c.name)} · ${dateShort(e.date)}</span></span>
        <span class="row-amt"><span class="num">${money(e.amount, e.currency)}</span></span>
        <button class="mini-btn" data-action="confirm" data-id="${e.id}" aria-label="Confirmar">${icon('check')}</button>
      </div>
      ${open ? `<div class="inline-edit">
        <label>Categoría<select data-field="categoryId" data-id="${e.id}">${visibleCategories().map((x) => `<option value="${x.id}" ${x.id === e.categoryId ? 'selected' : ''}>${x.emoji} ${esc(x.name)}</option>`).join('')}</select></label>
        <label>Centro<select data-field="costCenterId" data-id="${e.id}">${state.costCenters.map((x) => `<option value="${x.id}" ${x.id === e.costCenterId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
        <label>Fecha<input type="date" data-field="date" data-id="${e.id}" value="${e.date}"></label>
        <button class="btn ghost sm" data-action="discard" data-id="${e.id}">Descartar</button>
      </div>` : ''}
    </div>
  </div>`;
}

function notExpenseRow(e) {
  return `<div class="row" data-id="${e.id}">
    <div class="swipe-content static">
      <span class="avatar" style="--cat:var(--c11)">${e.ai.tipo === 'ingreso' ? '💰' : e.ai.tipo === 'pago_tarjeta' ? '💳' : '🔁'}</span>
      <span class="row-main"><span class="row-title">${esc(e.merchant || e.description)}</span><span class="row-sub"><span class="tag">${TIPO_TEXT[e.ai.tipo] || 'Otro'}</span> ${dateShort(e.date)}</span></span>
      <span class="row-amt"><span class="num">${money(e.amount, e.currency)}</span></span>
      <button class="btn ghost sm" data-action="is-expense" data-id="${e.id}">Sí es gasto</button>
    </div>
  </div>`;
}

function setupReviewSwipes(screen) {
  screen.querySelectorAll('.swipe').forEach((el) => {
    swipeable(el, { onRight: () => confirmPending(el.dataset.id, el, true), onLeft: () => discardPending(el.dataset.id, el, true) });
  });
  screen.querySelectorAll('.inline-edit [data-field]').forEach((input) => {
    input.addEventListener('change', () => updateExpense(input.dataset.id, { [input.dataset.field]: input.value }));
  });
}

function rowFor(id) {
  return document.querySelector(`#screen [data-id="${id}"].swipe, #screen .row[data-id="${id}"]`);
}

async function confirmPending(id, el = rowFor(id), swiped = false) {
  const had = pending().length;
  if (el && !swiped) { el.dataset.dir = 'right'; el.querySelector('.swipe-content').style.transform = `translateX(${el.offsetWidth}px)`; await wait(170); }
  if (el) await collapse(el);
  const e = state.expenses.find((x) => x.id === id);
  if (!e) return;
  vibrate(10);
  updateExpense(id, { status: 'confirmed', ai: undefined });
  afterReviewAction(had);
}

async function discardPending(id, el = rowFor(id), swiped = false) {
  const had = pending().length;
  if (el && !swiped) { el.dataset.dir = 'left'; el.querySelector('.swipe-content').style.transform = `translateX(-${el.offsetWidth}px)`; await wait(170); }
  if (el) await collapse(el);
  const r = removeExpense(id);
  if (r) toast('Descartado', { undo: () => restoreExpense(r) });
  afterReviewAction(had);
}

function afterReviewAction(had) {
  if (had > 0 && pending().length === 0) {
    confetti();
    vibrate([10, 40, 10]);
    toast('¡Al día! 🎉');
  }
}

function confirmSafe() {
  const { ready } = reviewGroups();
  const had = pending().length;
  for (const e of ready) { e.status = 'confirmed'; delete e.ai; }
  save();
  vibrate(10);
  if (pending().length > 0) toast(`${ready.length} gastos confirmados`);
  afterReviewAction(had);
}

function discardNonExpense() {
  const { notExpense } = reviewGroups();
  const had = pending().length;
  const removed = notExpense.map((e) => e.id);
  const backup = state.expenses.filter((e) => removed.includes(e.id));
  state.expenses = state.expenses.filter((e) => !removed.includes(e.id));
  save();
  toast(`${removed.length} descartados`, { undo: () => { state.expenses.push(...backup); save(); } });
  afterReviewAction(had);
}

// ---------------------------------------------------------------- Presupuestos

function periodText(b) {
  if (b.period === 'monthly') return `Mensual · reinicia el ${b.resetDay || 1}`;
  if (b.period === 'weekly') return `Semanal · reinicia el ${WEEKDAYS[(b.resetDay || 1) % 7].toLowerCase()}`;
  if (b.period === 'biweekly') return 'Quincenal';
  if (b.period === 'yearly') return 'Anual';
  const { start, end } = budgetWindow(b);
  return `Sin periodicidad · ${dateRange(start, end)}`;
}

function renderBudgets() {
  let html = topbar('Presupuestos', { action: `<button class="btn primary sm" data-action="new-budget">${icon('plus')} Nuevo</button>` });
  if (!state.budgets.length) {
    return html + emptyState('🎯', 'Sin presupuestos todavía', 'Define cuánto quieres gastar por centro de costo o por categoría y la app te dirá si vas al ritmo.', '<button class="btn primary" data-action="new-budget">Crear presupuesto</button>');
  }
  for (const cc of state.costCenters) {
    const list = state.budgets.filter((b) => b.costCenterId === cc.id).sort((a, b) => (a.categoryId ? 1 : 0) - (b.categoryId ? 1 : 0));
    if (!list.length) continue;
    html += `<h2 class="section-title">${cc.emoji || ''} ${esc(cc.name)}</h2>`;
    html += list.map((b) => {
      const s = budgetStats(b, state.expenses);
      const cat = b.categoryId ? categoryById(b.categoryId) : null;
      return `<button class="card budget-card" data-action="open-budget" data-id="${b.id}">
        <div class="bc-top"><span class="avatar sm" style="--cat:var(--c${cat ? cat.color : 6})">${cat ? cat.emoji : cc.emoji || '🎯'}</span>
          <span class="row-main"><span class="row-title">${esc(b.name)}</span><span class="chip mini">${esc(periodText(b))}</span></span>
          <span class="status-pill ${s.status}">${STATUS_TEXT[s.status]}</span></div>
        ${progressWithNotch(s)}
        <div class="bc-foot"><span><b class="num">${money(s.spent, undefined, { hero: true })}</b> de ${money(s.amount, undefined, { hero: true })}</span><span class="muted">${s.daysLeft > 0 ? `Quedan ${s.daysLeft} ${s.daysLeft === 1 ? 'día' : 'días'}` : 'Cerrado'}</span></div>
      </button>`;
    }).join('');
  }
  return html;
}

function openBudgetDetail(id) {
  const b = state.budgets.find((x) => x.id === id);
  if (!b) return;
  const s = budgetStats(b, state.expenses);
  const list = s.expenses.slice().sort((a, c) => c.date.localeCompare(a.date));
  openSheet({
    title: b.name,
    full: true,
    headerAction: `<button class="icon-btn" data-edit-budget aria-label="Editar">${icon('pencil')}</button>`,
    body: `<p class="muted center">${esc(periodText(b))} · ${dateRange(s.start, s.end)}</p>
      ${paceCard(b, { large: true })}
      <h2 class="section-title">Gastos del período <span class="count">${list.length}</span></h2>
      <div class="card list-card">${list.length ? list.map((e) => {
        const c = categoryById(e.categoryId);
        return `<div class="row"><div class="swipe-content static" data-action="edit-expense" data-id="${e.id}"><span class="avatar" style="--cat:var(--c${c.color})">${c.emoji}</span>
          <span class="row-main"><span class="row-title">${esc(e.merchant)}</span><span class="row-sub">${dateShort(e.date)} · ${esc(c.name)}</span></span>
          <span class="row-amt"><span class="num">${money(e.amountBase)}</span></span></div></div>`;
      }).join('') : '<p class="widget-empty">Sin gastos en este período</p>'}</div>`,
    onMount: (sheet) => {
      const card = sheet.el.querySelector('.pace-card');
      prepareDraw(card);
      attachPaceTouch(card.querySelector('.pace-wrap'), s);
      setTimeout(() => { card.classList.add('play'); countUp(card.querySelector('.hero'), heroMoney); }, 250);
      sheet.el.querySelector('[data-edit-budget]').addEventListener('click', () => { sheet.close(); openBudgetEditor(b); });
    },
  });
}

function openBudgetEditor(existing) {
  const b = existing ? { ...existing } : {
    id: uid('p'), name: '', amount: '', costCenterId: state.costCenters[0].id, categoryId: null, period: 'monthly', resetDay: 1, startDate: todayISO(), endDate: toISO(addDays(new Date(), 13)),
  };
  const sheet = openSheet({ title: existing ? 'Editar presupuesto' : 'Nuevo presupuesto', full: true, body: '' });
  const draw = () => {
    const prevStats = b.amount ? budgetStats({ ...b, amount: parseAmount(b.amount) }, []) : null;
    sheet.setBody(`<form class="form" id="bform" autocomplete="off">
      <label class="field"><span>Nombre</span><input class="input" name="name" value="${esc(b.name)}" placeholder="Ej. Supermercado del mes" required></label>
      <label class="field"><span>Monto</span><div class="amount-input"><span>${esc(currencyPrefix())}</span><input class="input" name="amount" inputmode="decimal" value="${esc(String(b.amount))}" placeholder="0" required></div></label>
      <div class="field"><span>Centro de costo</span><button type="button" class="select-btn" data-pick="cc">${esc(costCenterById(b.costCenterId).emoji || '')} ${esc(costCenterById(b.costCenterId).name)} ${icon('chevron')}</button></div>
      <div class="field"><span>Categoría <small>(opcional)</small></span><button type="button" class="select-btn" data-pick="cat">${b.categoryId ? `${categoryById(b.categoryId).emoji} ${esc(categoryById(b.categoryId).name)}` : 'Todas las categorías'} ${icon('chevron')}</button></div>
      <div class="field"><span>Período</span><div class="seg wrap">${[['weekly', 'Semanal'], ['biweekly', 'Quincenal'], ['monthly', 'Mensual'], ['yearly', 'Anual'], ['none', 'Fechas']].map(([v, l]) => `<button type="button" class="${b.period === v ? 'on' : ''}" data-period="${v}">${l}</button>`).join('')}</div></div>
      ${b.period === 'monthly' ? `<div class="field"><span>Día de reinicio</span><div class="stepper"><button type="button" data-step="-1" aria-label="Menos">−</button><b>${b.resetDay}</b><button type="button" data-step="1" aria-label="Más">+</button><small>de cada mes</small></div></div>` : ''}
      ${b.period === 'weekly' ? `<div class="field"><span>Reinicia el</span><div class="seg wrap">${WEEKDAYS.map((d, i) => `<button type="button" class="${(b.resetDay % 7) === i ? 'on' : ''}" data-weekday="${i}">${d.slice(0, 3)}</button>`).join('')}</div></div>` : ''}
      ${b.period === 'biweekly' || b.period === 'yearly' ? `<label class="field"><span>Empieza el</span><input class="input" type="date" name="startDate" value="${b.startDate || todayISO()}"></label>` : ''}
      ${b.period === 'none' ? `<div class="two"><label class="field"><span>Desde</span><input class="input" type="date" name="startDate" value="${b.startDate}"></label><label class="field"><span>Hasta</span><input class="input" type="date" name="endDate" value="${b.endDate}"></label></div>` : ''}
      ${prevStats ? `<div class="preview"><span class="overline">Vista previa · ${dateRange(prevStats.start, prevStats.end)}</span>${paceSVG(prevStats, { ghost: true })}</div>` : ''}
      <button class="btn primary full big" type="submit">${existing ? 'Guardar cambios' : 'Crear presupuesto'}</button>
      ${existing ? '<button class="btn danger-ghost full" type="button" data-delete>Eliminar presupuesto</button>' : ''}
    </form>`);
    const form = sheet.body.querySelector('#bform');
    form.addEventListener('input', (e) => { if (e.target.name) b[e.target.name] = e.target.value; });
    form.addEventListener('change', (e) => { if (e.target.type === 'date' || e.target.name === 'amount') draw(); });
    form.querySelectorAll('[data-period]').forEach((x) => x.addEventListener('click', () => {
      b.period = x.dataset.period;
      if (b.period === 'weekly') b.resetDay = 1;
      if (b.period === 'monthly') b.resetDay = Math.min(28, Number(b.resetDay) || 1);
      draw();
    }));
    form.querySelectorAll('[data-weekday]').forEach((x) => x.addEventListener('click', () => { b.resetDay = Number(x.dataset.weekday); draw(); }));
    form.querySelectorAll('[data-step]').forEach((x) => x.addEventListener('click', () => { b.resetDay = Math.min(28, Math.max(1, Number(b.resetDay) + Number(x.dataset.step))); draw(); }));
    form.querySelector('[data-pick="cc"]').addEventListener('click', async () => {
      const v = await pick({ title: 'Centro de costo', options: state.costCenters.map((c) => ({ value: c.id, label: c.name, emoji: c.emoji })), selected: b.costCenterId });
      if (v) { b.costCenterId = v; draw(); }
    });
    form.querySelector('[data-pick="cat"]').addEventListener('click', async () => {
      const v = await pick({ title: 'Categoría', options: [{ value: '__all', label: 'Todas las categorías', emoji: '🎯' }, ...visibleCategories().map((c) => ({ value: c.id, label: c.name, emoji: c.emoji, color: c.color }))], selected: b.categoryId || '__all' });
      if (v === undefined) return;
      b.categoryId = v === '__all' ? null : v;
      if (!b.name && b.categoryId) b.name = categoryById(b.categoryId).name;
      draw();
    });
    form.querySelector('[data-delete]')?.addEventListener('click', async () => {
      if (!(await confirmDialog({ title: 'Eliminar presupuesto', text: `Se eliminará “${esc(b.name)}”. Tus gastos no se borran.`, confirmText: 'Eliminar', danger: true }))) return;
      state.budgets = state.budgets.filter((x) => x.id !== b.id);
      save();
      sheet.close();
      toast('Presupuesto eliminado');
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const amount = parseAmount(b.amount);
      if (!b.name.trim() || amount <= 0) { toast('Ponle un nombre y un monto mayor a cero'); return; }
      if (b.period === 'none' && b.endDate < b.startDate) { toast('La fecha final debe ser posterior a la inicial'); return; }
      const clean = { ...b, name: b.name.trim(), amount, resetDay: Number(b.resetDay) || 1 };
      const i = state.budgets.findIndex((x) => x.id === b.id);
      if (i >= 0) state.budgets[i] = clean; else state.budgets.push(clean);
      animated.delete(b.id);
      save();
      sheet.close();
      toast(existing ? 'Presupuesto actualizado' : 'Presupuesto creado');
    });
  };
  draw();
}

// ---------------------------------------------------------------- Agregar

function openAddMenu() {
  const sheet = openSheet({
    title: '¿Cómo quieres agregar?',
    body: `<div class="add-options">
      <button class="add-opt main" data-opt="batch"><span class="add-emoji">📥</span><span><b>Ponerme al día</b><small>Sube capturas del banco, CSV, Excel o PDF</small></span>${icon('chevron')}</button>
      <button class="add-opt" data-opt="receipt"><span class="add-emoji">🧾</span><span><b>Escanear recibo</b><small>Una foto del ticket y listo</small></span>${icon('chevron')}</button>
      <button class="add-opt" data-opt="manual"><span class="add-emoji">✍️</span><span><b>Agregar a mano</b><small>Monto, categoría y guardar</small></span>${icon('chevron')}</button>
    </div>`,
  });
  sheet.body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-opt]');
    if (!b) return;
    sheet.close();
    setTimeout(() => ({ batch: openBatch, receipt: openReceipt, manual: () => openExpenseForm() })[b.dataset.opt](), 120);
  });
}

function decimalSep() {
  return (0.5).toLocaleString(CURRENCIES.find((c) => c.code === state.settings.currency)?.locale || 'es-MX').charAt(1);
}

// Formulario de gasto: nuevo, edición o prellenado por la IA.
function openExpenseForm({ expense = null, prefill = null, uncertain = {} } = {}) {
  const base = expense || prefill || {};
  const f = {
    amount: base.amount ? String(base.amount) : '',
    currency: base.currency || state.settings.currency,
    rate: base.rate || rateFor(base.currency || state.settings.currency),
    merchant: base.merchant || base.description || '',
    categoryId: base.categoryId || null,
    date: base.date || todayISO(),
    costCenterId: base.costCenterId || state.costCenters[0].id,
    paymentMethod: base.paymentMethod || '',
  };
  const unsure = { ...uncertain };
  const isEdit = Boolean(expense && expense.status === 'confirmed');
  const isPending = Boolean(expense && expense.status === 'pending');

  const sheet = openSheet({ title: '', className: 'tall expense-sheet', body: '' });

  const amountDisplay = () => {
    if (!f.amount) return '0';
    const [i, d] = f.amount.split('.');
    return formatNumber(Number(i || 0)) + (d !== undefined ? decimalSep() + d : '');
  };

  const draw = () => {
    const foreign = f.currency !== state.settings.currency;
    const cats = mostUsedCategories(6);
    if (f.categoryId && !cats.find((c) => c.id === f.categoryId)) cats.unshift(categoryById(f.categoryId));
    sheet.setBody(`<div class="expense-form">
      <div class="amount-display ${unsure.amount ? 'unsure' : ''}">
        <button class="cur-chip" data-act="currency">${f.currency}</button>
        <span class="amount-big"><span class="hero-sym">${esc(currencyPrefix(f.currency).trim())}</span>${amountDisplay()}</span>
        ${unsure.amount ? '<span class="unsure-q">?</span>' : ''}
      </div>
      ${foreign ? `<div class="rate-line">≈ <b>${money(parseAmount(f.amount) * f.rate)}</b> · tasa <input class="rate-input" inputmode="decimal" value="${f.rate}" aria-label="Tasa de cambio"></div>` : ''}
      <input class="input desc ${unsure.merchant ? 'unsure' : ''}" placeholder="¿En qué fue? (ej. Walmart)" value="${esc(f.merchant)}" data-f="merchant">
      <div class="chip-row scroll cats ${unsure.categoryId ? 'unsure' : ''}">
        ${cats.map((c) => `<button class="chip cat ${f.categoryId === c.id ? 'on' : ''}" data-cat="${c.id}">${c.emoji} ${esc(c.name)}</button>`).join('')}
        <button class="chip cat" data-act="more-cats">Más…</button>
      </div>
      <div class="meta-row">
        <label class="meta ${unsure.date ? 'unsure' : ''}"><span>Fecha</span><input type="date" value="${f.date}" data-f="date"></label>
        <button class="meta" data-act="cc"><span>Centro</span><b>${esc(costCenterById(f.costCenterId).name)}</b></button>
        <button class="meta" data-act="method"><span>Método</span><b>${esc(f.paymentMethod || 'Opcional')}</b></button>
      </div>
      <div class="keypad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'del'].map((k) => `<button class="key" data-key="${k}" aria-label="${k === 'del' ? 'Borrar' : k === ',' ? 'Decimales' : k}">${k === 'del' ? icon('backspace') : k === ',' ? decimalSep() : k}</button>`).join('')}</div>
      <button class="btn primary full big" data-act="save">${isEdit ? 'Guardar cambios' : isPending ? 'Confirmar gasto' : 'Guardar'}</button>
      ${!expense ? '<button class="btn ghost full" data-act="save-more">Guardar y agregar otro</button>' : ''}
      ${isEdit ? '<button class="btn danger-ghost full" data-act="delete">Eliminar gasto</button>' : ''}
    </div>`);
  };

  const press = (k) => {
    delete unsure.amount;
    if (k === 'del') f.amount = f.amount.slice(0, -1);
    else if (k === ',' || k === '.') { if (!f.amount.includes('.')) f.amount = (f.amount || '0') + '.'; }
    else {
      const [, dec] = f.amount.split('.');
      if (dec !== undefined && dec.length >= 2) return;
      if (f.amount.replace('.', '').length >= 10) return;
      f.amount = f.amount === '0' ? k : f.amount + k;
    }
    const el = sheet.body.querySelector('.amount-big');
    if (el) el.innerHTML = `<span class="hero-sym">${esc(currencyPrefix(f.currency).trim())}</span>${amountDisplay()}`;
    sheet.body.querySelector('.amount-display')?.classList.remove('unsure');
    const rate = sheet.body.querySelector('.rate-line b');
    if (rate) rate.textContent = money(parseAmount(f.amount) * f.rate);
  };

  const submit = (more) => {
    const amount = parseAmount(f.amount);
    if (amount <= 0) { toast('Escribe el monto'); return; }
    if (!f.categoryId) { toast('Elige una categoría'); return; }
    const data = {
      amount, currency: f.currency, rate: f.currency === state.settings.currency ? 1 : parseAmount(f.rate) || 1,
      merchant: f.merchant.trim() || categoryById(f.categoryId).name, description: base.description || f.merchant.trim(),
      categoryId: f.categoryId, date: f.date, costCenterId: f.costCenterId, paymentMethod: f.paymentMethod,
    };
    if (data.currency !== state.settings.currency) state.settings.rates[data.currency] = data.rate;
    if (expense) {
      updateExpense(expense.id, { ...data, status: 'confirmed', ai: undefined });
      toast(isPending ? 'Gasto confirmado' : 'Cambios guardados');
    } else {
      addExpense({ ...data, source: prefill?.source || 'manual' });
      toast(`Guardado · ${money(amount, f.currency)}`);
    }
    vibrate(10);
    if (more) {
      f.amount = ''; f.merchant = ''; f.categoryId = null;
      draw();
    } else sheet.close();
  };

  sheet.el.addEventListener('click', async (e) => {
    const key = e.target.closest('[data-key]');
    if (key) { press(key.dataset.key); return; }
    const cat = e.target.closest('[data-cat]');
    if (cat) {
      f.categoryId = cat.dataset.cat; delete unsure.categoryId;
      sheet.body.querySelectorAll('.chip.cat').forEach((c) => c.classList.toggle('on', c === cat));
      sheet.body.querySelector('.cats')?.classList.remove('unsure');
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'currency') {
      const v = await pick({ title: 'Moneda', options: CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} · ${c.name}` })), selected: f.currency });
      if (v) { f.currency = v; f.rate = rateFor(v); draw(); }
    }
    if (act === 'more-cats') {
      const v = await pick({ title: 'Categoría', options: visibleCategories().map((c) => ({ value: c.id, label: c.name, emoji: c.emoji, color: c.color })), selected: f.categoryId });
      if (v) { f.categoryId = v; delete unsure.categoryId; draw(); }
    }
    if (act === 'cc') {
      const v = await pick({ title: 'Centro de costo', options: state.costCenters.map((c) => ({ value: c.id, label: c.name, emoji: c.emoji })), selected: f.costCenterId });
      if (v) { f.costCenterId = v; draw(); }
    }
    if (act === 'method') {
      const v = await pick({ title: 'Método de pago', options: [{ value: '', label: 'Sin especificar' }, ...PAYMENT_METHODS.map((m) => ({ value: m, label: m }))], selected: f.paymentMethod });
      if (v !== undefined) { f.paymentMethod = v; draw(); }
    }
    if (act === 'save') submit(false);
    if (act === 'save-more') submit(true);
    if (act === 'delete') { sheet.close(); deleteExpense(expense.id); }
  });
  sheet.el.addEventListener('input', (e) => {
    const field = e.target.dataset.f;
    if (field) { f[field] = e.target.value; delete unsure[field]; e.target.classList.remove('unsure'); }
    if (e.target.classList.contains('rate-input')) {
      f.rate = parseAmount(e.target.value) || 1;
      const b = sheet.body.querySelector('.rate-line b');
      if (b) b.textContent = money(parseAmount(f.amount) * f.rate);
    }
  });
  // Teclado físico en escritorio.
  sheet.el.addEventListener('keydown', (e) => {
    if (e.target.matches('input')) return;
    if (/^[0-9]$/.test(e.key)) press(e.key);
    else if (e.key === ',' || e.key === '.') press(',');
    else if (e.key === 'Backspace') press('del');
    else if (e.key === 'Enter') submit(false);
  });
  draw();
  sheet.el.tabIndex = -1;
  sheet.el.focus({ preventScroll: true });
}

// Recibo: una foto → formulario prellenado.
function openReceipt() {
  const sheet = openSheet({
    title: 'Escanear recibo',
    body: `${!hasApiKey() ? '<p class="demo-band">Modo demo: resultados de ejemplo. Agrega tu clave en Ajustes para lectura real.</p>' : ''}
      <div class="dropzone" id="rz">
        <div class="dz-inner"><span class="dz-emoji">🧾</span><b>Toma una foto del ticket</b><small>o elige una imagen o PDF</small>
          <div class="btn-row"><label class="btn primary">${icon('camera')} Cámara<input type="file" accept="image/*" capture="environment" hidden></label>
          <label class="btn ghost">${icon('upload')} Archivo<input type="file" accept="image/*,application/pdf" hidden></label></div></div>
      </div>`,
  });
  sheet.body.querySelectorAll('input[type=file]').forEach((input) => input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    const zone = sheet.body.querySelector('#rz');
    const thumb = file.type.startsWith('image/') ? `<img src="${URL.createObjectURL(file)}" alt="Recibo">` : '<span class="dz-emoji">📄</span>';
    zone.innerHTML = `<div class="reading">${thumb}<p class="shimmer">Leyendo tu recibo…</p></div>`;
    try {
      const fn = hasApiKey() ? extractWithClaude : extractDemo;
      const result = await fn([file], 'receipt');
      const mov = (result.movimientos || [])[0];
      if (!mov) throw new AiError(result.nota || 'No encontré un total en la imagen.');
      sheet.close();
      const low = mov.confianza === 'baja';
      openExpenseForm({
        prefill: {
          amount: mov.monto, currency: mov.moneda, merchant: mov.comercio, description: mov.descripcion,
          categoryId: mov.categoria, date: mov.fecha, paymentMethod: mov.metodo_pago, source: 'receipt',
        },
        uncertain: low ? { categoryId: true } : {},
      });
      if (mov.pregunta) toast(mov.pregunta);
    } catch (err) {
      zone.innerHTML = `<div class="dz-inner"><span class="dz-emoji">😕</span><b>No pude leerlo</b><small>${esc(err instanceof AiError ? err.message : 'Ocurrió un error inesperado.')}</small></div>`;
      console.error(err);
    }
  }));
}

// Ponerme al día: varios archivos → bandeja de revisión.
function openBatch() {
  const files = [];
  let account = '';
  const sheet = openSheet({ title: 'Ponerme al día', full: true, body: '' });
  const kind = (f) => (f.type.startsWith('image/') ? 'IMG' : f.name.toLowerCase().endsWith('.pdf') ? 'PDF' : /\.xlsx?$/i.test(f.name) ? 'XLS' : 'CSV');
  const draw = () => {
    sheet.setBody(`${!hasApiKey() ? '<p class="demo-band">Modo demo: resultados de ejemplo. Agrega tu clave de Anthropic en Ajustes para lectura real.</p>' : ''}
      <p class="lead">Sube capturas de tus movimientos o el archivo que exporta tu banco. La IA separa cada movimiento y tú solo confirmas.</p>
      <label class="dropzone big" id="bz">
        <input type="file" multiple accept="image/*,.pdf,.csv,.txt,.xls,.xlsx" hidden>
        <div class="dz-inner"><span class="dz-emoji">📥</span><b>Toca para elegir archivos</b><small>Capturas, CSV, Excel o PDF · varios a la vez</small></div>
      </label>
      ${files.length ? `<div class="thumbs">${files.map((f, i) => `<div class="thumb">${f.type.startsWith('image/') ? `<img src="${f.url}" alt="">` : `<span class="dz-emoji">${kind(f) === 'PDF' ? '📄' : '📊'}</span>`}
        <span class="tag">${kind(f)}</span><button class="thumb-x" data-rm="${i}" aria-label="Quitar">${icon('x')}</button></div>`).join('')}</div>` : ''}
      <div class="field"><span>¿De qué cuenta es? <small>(opcional)</small></span><button type="button" class="select-btn" data-act="account">${esc(account || 'Sin especificar')} ${icon('chevron')}</button></div>
      <div id="bprogress"></div>
      <button class="btn primary full big" data-act="read" ${files.length ? '' : 'disabled'}>${files.length ? `Leer ${files.length} ${files.length === 1 ? 'archivo' : 'archivos'}` : 'Elige al menos un archivo'}</button>`);
    sheet.body.querySelector('input[type=file]').addEventListener('change', (e) => {
      for (const f of e.target.files) { f.url = f.type.startsWith('image/') ? URL.createObjectURL(f) : ''; files.push(f); }
      draw();
    });
  };
  sheet.el.addEventListener('click', async (e) => {
    const rm = e.target.closest('[data-rm]');
    if (rm) { e.preventDefault(); files.splice(Number(rm.dataset.rm), 1); draw(); return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'account') {
      const v = await pick({ title: '¿De qué cuenta es?', options: [{ value: '', label: 'Sin especificar' }, ...PAYMENT_METHODS.map((m) => ({ value: m, label: m }))], selected: account });
      if (v !== undefined) { account = v; draw(); }
    }
    if (act === 'read') runBatch();
  });

  const runBatch = async () => {
    const btn = sheet.body.querySelector('[data-act="read"]');
    btn.disabled = true;
    btn.textContent = 'Leyendo…';
    const prog = sheet.body.querySelector('#bprogress');
    const steps = [];
    const step = (t) => { steps.push(t); prog.innerHTML = `<ul class="steps">${steps.map((s, i) => `<li class="${i === steps.length - 1 ? 'live' : 'done'}">${esc(s)}</li>`).join('')}</ul><div class="skeletons">${'<div class="skel"></div>'.repeat(4)}</div>`; };
    try {
      const fn = hasApiKey() ? extractWithClaude : extractDemo;
      const result = await fn(files, 'batch', step);
      const movs = result.movimientos || [];
      step(`Encontré ${movs.length} ${movs.length === 1 ? 'movimiento' : 'movimientos'}`);
      const created = [];
      for (const m of movs) {
        const candidate = { amount: m.monto, date: m.fecha, currency: m.moneda };
        const dup = m.tipo === 'gasto' ? findDuplicate(candidate, created.map((c) => c.id)) : null;
        const e = addExpenseSilently({
          date: m.fecha, merchant: m.comercio, description: m.descripcion, amount: m.monto, currency: m.moneda,
          categoryId: m.categoria, paymentMethod: m.metodo_pago || account, status: 'pending', source: 'batch',
          ai: { tipo: m.tipo, confianza: m.confianza, pregunta: m.pregunta, opciones: m.opciones, dupOf: dup?.id },
        });
        created.push(e);
      }
      const dups = created.filter((c) => c.ai.dupOf).length;
      if (dups) step(`${dups} ${dups === 1 ? 'parece duplicado' : 'parecen duplicados'}`);
      state.lastBatchAt = todayISO();
      save();
      await wait(700);
      sheet.close();
      view.reviewBase = pending().length;
      switchTab('review');
      if (result.nota) toast(result.nota);
    } catch (err) {
      console.error(err);
      prog.innerHTML = `<p class="error-box">😕 ${esc(err instanceof AiError ? err.message : 'Ocurrió un error inesperado al leer los archivos.')}</p>`;
      btn.disabled = false;
      btn.textContent = 'Intentar de nuevo';
    }
  };
  draw();
}

function addExpenseSilently(data) {
  const e = { id: uid('g'), createdAt: Date.now(), costCenterId: state.costCenters[0].id, ...data };
  const rate = e.currency === state.settings.currency ? 1 : rateFor(e.currency);
  const full = { ...e, rate, amountBase: Math.round(e.amount * rate * 100) / 100 };
  state.expenses.push(full);
  return full;
}

// ---------------------------------------------------------------- Ajustes

function openSettings() {
  const sheet = openSheet({ title: 'Ajustes', full: true, body: '' });
  let showKey = false;
  const draw = () => {
    const s = state.settings;
    const model = MODELS.find((m) => m.id === s.model) || MODELS[0];
    sheet.setBody(`
      <h3 class="group-title">General</h3>
      <div class="card list-card">
        <button class="set-row" data-act="currency"><span>Moneda principal</span><b>${s.currency}</b>${icon('chevron')}</button>
        <div class="set-row"><span>Tema</span><div class="seg small">${[['auto', 'Auto'], ['light', 'Claro'], ['dark', 'Oscuro']].map(([v, l]) => `<button class="${s.theme === v ? 'on' : ''}" data-theme-set="${v}">${l}</button>`).join('')}</div></div>
        <label class="set-row"><span>Tu nombre</span><input class="inline-input" data-name value="${esc(s.name)}" placeholder="Opcional"></label>
      </div>
      <h3 class="group-title">Inteligencia artificial</h3>
      <div class="card list-card">
        <div class="set-row column">
          <div class="set-line"><span>${icon('key')} Clave de API de Anthropic</span><span class="status-pill ${hasApiKey() ? 'ok' : 'warn'}">${hasApiKey() ? 'Conectada ✓' : 'Modo demo'}</span></div>
          <div class="key-input"><input class="input" data-key-input type="${showKey ? 'text' : 'password'}" value="${esc(s.apiKey)}" placeholder="sk-ant-…" autocomplete="off" spellcheck="false">
            <button class="btn ghost sm" data-act="toggle-key">${showKey ? 'Ocultar' : 'Ver'}</button></div>
          <p class="hint">La clave se guarda solo en este dispositivo y se envía directo a Anthropic al leer capturas, recibos o archivos. Cada lectura tiene un costo en tu cuenta de Anthropic. No uses este prototipo en un equipo compartido.</p>
        </div>
        <button class="set-row" data-act="model"><span>Modelo</span><b>${esc(model.name)}</b>${icon('chevron')}</button>
      </div>
      <h3 class="group-title">Organización</h3>
      <div class="card list-card">
        <button class="set-row" data-act="categories"><span>Categorías</span><b>${visibleCategories().length} visibles</b>${icon('chevron')}</button>
        <button class="set-row" data-act="costcenters"><span>Centros de costo</span><b>${state.costCenters.length}</b>${icon('chevron')}</button>
        <button class="set-row" data-act="customize"><span>Orden del inicio</span>${icon('chevron')}</button>
      </div>
      <h3 class="group-title">Datos</h3>
      <div class="card list-card">
        <button class="set-row" data-act="sample"><span>Cargar datos de ejemplo</span>${icon('chevron')}</button>
        <button class="set-row danger" data-act="wipe"><span>Borrar todo</span>${icon('chevron')}</button>
      </div>
      <p class="about">${logoSVG(36)}<span><b>Ritmo</b> · prototipo v0.1.0<br><small>Tus datos viven en este dispositivo.</small></span></p>`);
  };
  sheet.el.addEventListener('input', (e) => {
    if (e.target.matches('[data-name]')) { state.settings.name = e.target.value.slice(0, 30); save(); }
    if (e.target.matches('[data-key-input]')) {
      state.settings.apiKey = e.target.value.trim();
      save();
      const pill = sheet.body.querySelector('.set-line .status-pill');
      pill.className = `status-pill ${hasApiKey() ? 'ok' : 'warn'}`;
      pill.textContent = hasApiKey() ? 'Conectada ✓' : 'Modo demo';
    }
  });
  sheet.el.addEventListener('click', async (e) => {
    const theme = e.target.closest('[data-theme-set]');
    if (theme) { state.settings.theme = theme.dataset.themeSet; save(); applyTheme(); draw(); return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'toggle-key') { showKey = !showKey; draw(); }
    if (act === 'currency') {
      const v = await pick({ title: 'Moneda principal', options: CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} · ${c.name}` })), selected: state.settings.currency });
      if (v && v !== state.settings.currency) {
        state.settings.currency = v;
        save();
        toast('Moneda cambiada. Los montos ya registrados no se convierten.');
        draw();
      }
    }
    if (act === 'model') {
      const v = await pick({ title: 'Modelo de IA', options: MODELS.map((m) => ({ value: m.id, label: m.name, hint: m.note })), selected: state.settings.model });
      if (v) { state.settings.model = v; save(); draw(); }
    }
    if (act === 'categories') openCategories(draw);
    if (act === 'costcenters') openCostCenters(draw);
    if (act === 'customize') openCustomize();
    if (act === 'sample') {
      if (!(await confirmDialog({ title: 'Cargar datos de ejemplo', text: 'Se reemplazarán tus gastos, presupuestos y centros de costo actuales por datos de ejemplo.', confirmText: 'Cargar ejemplo' }))) return;
      loadSampleData();
      animated.clear();
      sheet.close();
      switchTab('home');
      toast('Datos de ejemplo cargados');
    }
    if (act === 'wipe') {
      if (!(await confirmDialog({ title: 'Borrar todo', text: 'Se borrarán todos tus gastos, presupuestos, categorías propias y ajustes de este dispositivo. No se puede deshacer.', confirmText: 'Borrar todo', danger: true, requireText: 'BORRAR' }))) return;
      resetAll();
      animated.clear();
      sheet.close();
      view.tab = 'home';
      renderOnboarding();
    }
  });
  draw();
}

const SWATCHES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function openCategories(onDone) {
  let color = 0;
  const sheet = openSheet({ title: 'Categorías', full: true, body: '', onClose: onDone });
  const draw = () => {
    sheet.setBody(`<p class="lead">Elige qué categorías predefinidas ves. Puedes crear las tuyas, pero las predefinidas no se editan.</p>
      <h3 class="group-title">Predefinidas</h3>
      <div class="card list-card">${PREDEFINED_CATEGORIES.map((c) => `<label class="set-row"><span class="avatar sm" style="--cat:var(--c${c.color})">${c.emoji}</span><span class="grow">${esc(c.name)}</span>
        <input type="checkbox" class="switch" data-vis="${c.id}" ${state.visibleCategories.includes(c.id) ? 'checked' : ''}></label>`).join('')}</div>
      <h3 class="group-title">Tus categorías</h3>
      <div class="card list-card">${state.customCategories.length ? state.customCategories.map((c) => `<div class="set-row"><span class="avatar sm" style="--cat:var(--c${c.color})">${esc(c.emoji)}</span><span class="grow">${esc(c.name)}</span>
        <button class="icon-btn" data-del="${c.id}" aria-label="Eliminar">${icon('trash')}</button></div>`).join('') : '<p class="widget-empty">Aún no creas categorías propias</p>'}</div>
      <form class="card new-form" id="newcat">
        <h3>+ Nueva categoría</h3>
        <div class="two"><input class="input emoji-input" name="emoji" maxlength="4" placeholder="🙂" aria-label="Emoji"><input class="input" name="name" placeholder="Nombre" maxlength="24" required></div>
        <div class="swatches">${SWATCHES.map((i) => `<button type="button" class="swatch ${i === color ? 'on' : ''}" data-color="${i}" style="background:var(--c${i})" aria-label="Color ${i + 1}"></button>`).join('')}</div>
        <button class="btn primary full" type="submit">Crear categoría</button>
      </form>`);
  };
  sheet.el.addEventListener('change', (e) => {
    const id = e.target.dataset.vis;
    if (!id) return;
    if (e.target.checked) state.visibleCategories.push(id);
    else state.visibleCategories = state.visibleCategories.filter((x) => x !== id);
    save();
  });
  sheet.el.addEventListener('click', async (e) => {
    const sw = e.target.closest('[data-color]');
    if (sw) { color = Number(sw.dataset.color); sheet.body.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('on', s === sw)); return; }
    const del = e.target.closest('[data-del]');
    if (del) {
      const used = state.expenses.some((x) => x.categoryId === del.dataset.del);
      if (!(await confirmDialog({ title: 'Eliminar categoría', text: used ? 'Los gastos de esta categoría pasarán a “Otros”.' : 'Se eliminará esta categoría.', confirmText: 'Eliminar', danger: true }))) return;
      state.expenses.forEach((x) => { if (x.categoryId === del.dataset.del) x.categoryId = 'otros'; });
      state.budgets = state.budgets.filter((b) => b.categoryId !== del.dataset.del);
      state.customCategories = state.customCategories.filter((c) => c.id !== del.dataset.del);
      save();
      draw();
    }
  });
  sheet.el.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    const name = String(data.get('name')).trim();
    if (!name) return;
    state.customCategories.push({ id: uid('cat'), name, emoji: String(data.get('emoji')).trim() || '🏷️', color });
    save();
    toast(`Categoría “${name}” creada`);
    draw();
  });
  draw();
}

function openCostCenters(onDone) {
  const sheet = openSheet({ title: 'Centros de costo', full: true, body: '', onClose: onDone });
  const draw = () => {
    sheet.setBody(`<p class="lead">Agrupa gastos por propósito: el día a día, un viaje, una remodelación. Cada centro se desglosa por categorías.</p>
      <div class="card list-card">${state.costCenters.map((c, i) => `<div class="set-row"><span class="avatar sm" style="--cat:var(--c6)">${esc(c.emoji || '📁')}</span><span class="grow">${esc(c.name)}${i === 0 ? '<small>Principal</small>' : ''}</span>
        ${i > 0 ? `<button class="icon-btn" data-del="${c.id}" aria-label="Eliminar">${icon('trash')}</button>` : ''}</div>`).join('')}</div>
      <form class="card new-form" id="newcc">
        <h3>+ Nuevo centro de costo</h3>
        <div class="two"><input class="input emoji-input" name="emoji" maxlength="4" placeholder="🏝️" aria-label="Emoji"><input class="input" name="name" placeholder="Ej. Viaje a Cancún" maxlength="30" required></div>
        <button class="btn primary full" type="submit">Crear centro de costo</button>
      </form>`);
  };
  sheet.el.addEventListener('click', async (e) => {
    const del = e.target.closest('[data-del]');
    if (!del) return;
    const cc = costCenterById(del.dataset.del);
    if (!(await confirmDialog({ title: 'Eliminar centro de costo', text: `Los gastos de “${esc(cc.name)}” pasarán a “${esc(state.costCenters[0].name)}” y se eliminarán sus presupuestos.`, confirmText: 'Eliminar', danger: true }))) return;
    state.expenses.forEach((x) => { if (x.costCenterId === cc.id) x.costCenterId = state.costCenters[0].id; });
    state.budgets = state.budgets.filter((b) => b.costCenterId !== cc.id);
    state.costCenters = state.costCenters.filter((c) => c.id !== cc.id);
    save();
    draw();
  });
  sheet.el.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    const name = String(data.get('name')).trim();
    if (!name) return;
    state.costCenters.push({ id: uid('cc'), name, emoji: String(data.get('emoji')).trim() || '📁' });
    save();
    toast(`“${name}” creado`);
    draw();
  });
  draw();
}

function openCustomize() {
  const sheet = openSheet({ title: 'Personalizar inicio', full: true, body: '' });
  const draw = () => {
    sheet.setBody(`<p class="lead">Activa los gráficos que quieres ver y ordénalos a tu gusto.</p>
      <div class="card list-card">${state.dashboard.map((w, i) => {
        const meta = DASHBOARD_WIDGETS.find((d) => d.id === w.id);
        return `<div class="set-row"><span class="order-btns"><button class="icon-btn sm" data-move="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Subir">${icon('up')}</button><button class="icon-btn sm" data-move="${i}" data-d="1" ${i === state.dashboard.length - 1 ? 'disabled' : ''} aria-label="Bajar">${icon('down')}</button></span>
          <span class="grow">${esc(meta.name)}<small>${esc(meta.desc)}</small></span><input type="checkbox" class="switch" data-on="${i}" ${w.on ? 'checked' : ''}></div>`;
      }).join('')}</div>`);
  };
  sheet.el.addEventListener('click', (e) => {
    const mv = e.target.closest('[data-move]');
    if (!mv) return;
    const i = Number(mv.dataset.move); const j = i + Number(mv.dataset.d);
    [state.dashboard[i], state.dashboard[j]] = [state.dashboard[j], state.dashboard[i]];
    save();
    draw();
  });
  sheet.el.addEventListener('change', (e) => {
    if (e.target.dataset.on === undefined) return;
    state.dashboard[Number(e.target.dataset.on)].on = e.target.checked;
    save();
  });
  draw();
}

// ---------------------------------------------------------------- Eventos globales

function onClick(e) {
  const el = e.target.closest('[data-action]');
  if (!el || !app.contains(el)) return;
  const { action, id } = el.dataset;
  const actions = {
    tab: () => switchTab(el.dataset.tab),
    'add-menu': openAddMenu,
    batch: openBatch,
    settings: openSettings,
    customize: openCustomize,
    'new-budget': () => openBudgetEditor(),
    'open-budget': () => openBudgetDetail(id),
    'edit-expense': () => { const x = state.expenses.find((v) => v.id === id); if (x) openExpenseForm({ expense: x }); },
    'edit-pending': () => { const x = state.expenses.find((v) => v.id === id); if (x) openExpenseForm({ expense: x, uncertain: { categoryId: true } }); },
    'trend-mode': () => { view.trendMode = el.dataset.mode; rerender(); },
    'car-go': () => carouselGo(Number(el.dataset.i)),
    'car-step': () => carouselStep(Number(el.dataset.d)),
    'filter-category': () => { view.filters = { ...view.filters, category: id, period: 'month' }; switchTab('expenses'); },
    filter: () => { if (!e.target.closest('[data-action="filter-clear"]')) chooseFilter(el.dataset.key); },
    'filter-clear': () => { e.stopPropagation(); view.filters[el.dataset.key] = null; rerender(); },
    confirm: () => confirmPending(id),
    discard: () => discardPending(id),
    answer: () => { updateExpense(id, { categoryId: el.dataset.cat }); confirmPending(id); },
    'dup-same': () => discardPending(id),
    'dup-two': () => { const x = state.expenses.find((v) => v.id === id); if (x) updateExpense(id, { ai: { ...x.ai, dupOf: undefined } }); },
    'is-expense': () => { const x = state.expenses.find((v) => v.id === id); if (x) updateExpense(id, { ai: { ...x.ai, tipo: 'gasto' } }); },
    'confirm-safe': confirmSafe,
    'discard-nonexpense': discardNonExpense,
    expand: () => { if (e.target.closest('button')) return; view.expanded = view.expanded === id ? null : id; rerender(); },
  };
  if (action === 'filter-clear') { actions['filter-clear'](); return; }
  actions[action]?.();
}

function onKey(e) {
  if (e.key === 'Escape') { closeTopSheet(); return; }
  if (document.querySelector('.sheet-layer') || e.target.matches('input, textarea, select')) return;
  if (view.tab === 'home' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) carouselStep(e.key === 'ArrowRight' ? 1 : -1);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

boot();
