// Ritmo Â· prototipo PWA de control de gastos.
import {
  state, save, subscribe, uid, allCategories, visibleCategories, categoryById, costCenterById,
  mostUsedCategories, addExpense, updateExpense, removeExpense, restoreExpense, confirmed, pending,
  findDuplicate, resetAll, rateFor, paymentMethods, methodByName,
} from './store.js';
import { CURRENCIES, METHOD_TYPES, PERIODS, WEEKDAYS, DASHBOARD_WIDGETS, PREDEFINED_CATEGORIES } from './data.js';
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
import {
  hasApiKey, extractWithAI, extractDemo, AiError, PROVIDERS, providerById, currentProvider, currentModel, modelLabel, testConnection,
} from './ai.js';
import { openImageEditor } from './imageeditor.js';

const app = document.getElementById('app');
const view = {
  tab: 'home',
  trendMode: 'month',
  filters: { period: 'month', category: null, cc: null, method: null, q: '' },
  reviewBase: 0,
  expanded: null,
  openPlans: new Set(),
};
const animated = new Set();

const STATUS_TEXT = { ok: 'âœ“ En ritmo', warn: 'â–² Cerca del lÃ­mite', over: 'â— Sobre presupuesto' };
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
    <p class="ob-sub">Tus gastos, al dÃ­a en minutos. Sube capturas del banco y mira si vas al ritmo de tu presupuesto.</p>
    <p class="ob-q">Â¿En quÃ© moneda piensas?</p>
    <div class="chip-row center" id="ob-cur">${['MXN', 'ARS', 'VES', 'USD'].map((c) => `<button class="chip ${c === currency ? 'on' : ''}" data-cur="${c}">${c}</button>`).join('')}</div>
    <div class="ob-actions">
      <button class="btn primary big" id="ob-sample">Empezar con datos de ejemplo</button>
      <button class="btn ghost big" id="ob-blank">Empezar en blanco</button>
    </div>
    <p class="ob-foot">Prototipo Â· tus datos se guardan solo en este dispositivo.</p>
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
  let html = topbar(`Hola${name} ðŸ‘‹`, {
    overline: monthName(today),
    action: `<button class="icon-btn" data-action="settings" aria-label="Ajustes">${icon('gear')}</button>`,
  });
  if (pend > 0) html += `<button class="notice accent" data-action="tab" data-tab="review"><span>ðŸ“¥</span><span><b>${pend} ${pend === 1 ? 'movimiento' : 'movimientos'}</b> por revisar</span>${icon('chevron')}</button>`;
  if (state.expenses.length && (last === null || last >= 4)) {
    html += `<button class="notice" data-action="batch"><span>â°</span><span>${last === null ? 'AÃºn no te pones al dÃ­a con tu banco' : `Hace ${last} dÃ­as que no te pones al dÃ­a`}</span>${icon('chevron')}</button>`;
  }
  for (const w of state.dashboard) {
    if (!w.on) continue;
    if (w.id === 'pace') html += paceCarousel();
    if (w.id === 'categories') html += widget('Por categorÃ­a', categoryBars(), monthName(today));
    if (w.id === 'trend') html += widget('EvoluciÃ³n', trendBars(view.trendMode));
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
  { value: '90', label: 'Ãšltimos 90 dÃ­as' },
  { value: 'all', label: 'Todo' },
];

function renderExpenses() {
  const f = view.filters;
  const chip = (key, label, value, active) => `<button class="chip filter ${active ? 'on' : ''}" data-action="filter" data-key="${key}">${esc(value || label)}${active && key !== 'period' ? `<span class="chip-x" data-action="filter-clear" data-key="${key}">${icon('x')}</span>` : ''}</button>`;
  const periodLabel = PERIOD_FILTERS.find((p) => p.value === f.period).label;
  return `${topbar('Gastos')}
    <div class="search-bar"><label class="search">${icon('search')}<input id="search" type="search" placeholder="Buscar comercio o descripciÃ³n" value="${esc(f.q)}" autocomplete="off"></label>
      <div class="chip-row scroll">
        ${chip('period', 'PerÃ­odo', periodLabel, true)}
        ${chip('category', 'CategorÃ­a', f.category ? categoryById(f.category).name : '', !!f.category)}
        ${chip('cc', 'Centro', f.cc ? costCenterById(f.cc).name : '', !!f.cc)}
        ${chip('method', 'Medio', f.method || '', !!f.method)}
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
      ? emptyState('ðŸ”', 'Nada por aquÃ­', 'No hay gastos con estos filtros.')
      : emptyState('ðŸ§¾', 'AÃºn no hay gastos', 'Sube una captura de tu banco o agrega tu primer gasto.', '<button class="btn primary" data-action="add-menu">Agregar gasto</button>');
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
  html += `<p class="list-foot">${list.length} ${list.length === 1 ? 'gasto' : 'gastos'} Â· <b class="num">${money(total)}</b></p>`;
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
      <span class="row-main"><span class="row-title">${esc(e.merchant || e.description || 'Gasto')}</span><span class="row-sub">${esc(c.name)} Â· ${esc(cc?.name || '')}</span></span>
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
  if (key === 'period') value = await pick({ title: 'PerÃ­odo', options: PERIOD_FILTERS, selected: f.period });
  if (key === 'category') value = await pick({ title: 'CategorÃ­a', options: visibleCategories().map((c) => ({ value: c.id, label: c.name, emoji: c.emoji, color: c.color })), selected: f.category });
  if (key === 'cc') value = await pick({ title: 'Centro de costo', options: state.costCenters.map((c) => ({ value: c.id, label: c.name, emoji: c.emoji })), selected: f.cc });
  if (key === 'method') value = await pick({ title: 'Medio de pago', options: state.paymentMethods.map(methodOption), selected: f.method });
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
    return `${topbar('Revisar')}${emptyState('âœ…', 'Â¡EstÃ¡s al dÃ­a!', 'Cuando subas capturas o archivos del banco, los movimientos aparecerÃ¡n aquÃ­ para que los confirmes en segundos.', '<button class="btn primary" data-action="batch">Ponerme al dÃ­a</button>')}`;
  }
  view.reviewBase = Math.max(view.reviewBase, pend.length);
  const progress = 1 - pend.length / view.reviewBase;
  let html = `${topbar(`${pend.length} por revisar`)}
    <div class="review-top">
      <div class="thin-progress"><span style="--w:${(progress * 100).toFixed(1)}%"></span></div>
      ${unknownCards(pend).map(unknownCardNotice).join('')}
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

// Tarjetas o cuentas que aparecen en los movimientos pero no estÃ¡n registradas.
function unknownCards(pend) {
  const ignored = state.settings.ignoredCards || [];
  const map = new Map();
  for (const e of pend) {
    const d = e.ai?.last4;
    if (!d || ignored.includes(d) || state.paymentMethods.some((m) => m.last4 === d)) continue;
    map.set(d, (map.get(d) || 0) + 1);
  }
  return [...map.entries()].map(([last4, count]) => ({ last4, count }));
}

function unknownCardNotice({ last4, count }) {
  return `<div class="card proactive-card"><span class="proactive-emoji">ðŸ’³</span>
    <div class="proactive-main"><b>No reconocÃ­ la tarjeta â€¢â€¢${last4}</b>
      <small>Aparece en ${count} ${count === 1 ? 'movimiento' : 'movimientos'}. Si la agregas, se los asigno y la prÃ³xima vez la reconozco sola.</small>
      <div class="btn-row"><button class="btn primary sm" data-action="add-card" data-id="${last4}">Agregar tarjeta</button><button class="btn ghost sm" data-action="ignore-card" data-id="${last4}">No es mÃ­a</button></div></div></div>`;
}

async function addUnknownCard(last4) {
  const created = await openMethodEditor(null, { last4, type: 'credito' });
  if (!created) return;
  let n = 0;
  for (const e of state.expenses) if (e.status === 'pending' && e.ai?.last4 === last4) { e.paymentMethod = created.name; n++; }
  save();
  toast(`â€œ${created.name}â€ asignada a ${n} ${n === 1 ? 'movimiento' : 'movimientos'}`);
}

function ignoreUnknownCard(last4) {
  state.settings.ignoredCards = [...(state.settings.ignoredCards || []), last4];
  save();
  toast(`No volverÃ© a preguntar por â€¢â€¢${last4}`, { undo: () => { state.settings.ignoredCards = state.settings.ignoredCards.filter((x) => x !== last4); save(); } });
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
        <span class="row-main"><span class="row-title">${esc(e.merchant || e.description)}</span><span class="row-sub">${dateShort(e.date)} Â· ${esc(c.name)}</span></span>
        <span class="row-amt"><span class="num">${money(e.amount, e.currency)}</span></span>
      </div>
      ${dup ? `<div class="dup"><span class="tag warn">Posible duplicado</span>
          <p class="dup-text">Ya tienes <b>${esc(dup.merchant)}</b> Â· ${dateShort(dup.date)} Â· ${money(dup.amount, dup.currency)}</p>
          <div class="btn-row"><button class="btn ghost sm" data-action="dup-same" data-id="${e.id}">Es el mismo</button><button class="btn ghost sm" data-action="dup-two" data-id="${e.id}">Son dos</button></div></div>` : ''}
      ${e.ai?.pregunta ? `<div class="ai-q"><p class="bubble">${esc(e.ai.pregunta)}</p>
          <div class="chip-row">${(e.ai.opciones?.length ? e.ai.opciones : [e.categoryId]).map((id) => { const oc = categoryById(id); return `<button class="chip answer" data-action="answer" data-id="${e.id}" data-cat="${id}">${oc.emoji} ${esc(oc.name)}</button>`; }).join('')}
          <button class="chip answer" data-action="edit-pending" data-id="${e.id}">Otraâ€¦</button></div></div>` : ''}
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
        <span class="row-main"><span class="row-title">${esc(e.merchant || e.description)}</span><span class="row-sub">${esc(c.name)} Â· ${dateShort(e.date)}</span></span>
        <span class="row-amt"><span class="num">${money(e.amount, e.currency)}</span></span>
        <button class="mini-btn" data-action="confirm" data-id="${e.id}" aria-label="Confirmar">${icon('check')}</button>
      </div>
      ${open ? `<div class="inline-edit">
        <label>CategorÃ­a<select data-field="categoryId" data-id="${e.id}">${visibleCategories().map((x) => `<option value="${x.id}" ${x.id === e.categoryId ? 'selected' : ''}>${x.emoji} ${esc(x.name)}</option>`).join('')}</select></label>
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
      <span class="avatar" style="--cat:var(--c11)">${e.ai.tipo === 'ingreso' ? 'ðŸ’°' : e.ai.tipo === 'pago_tarjeta' ? 'ðŸ’³' : 'ðŸ”'}</span>
      <span class="row-main"><span class="row-title">${esc(e.merchant || e.description)}</span><span class="row-sub"><span class="tag">${TIPO_TEXT[e.ai.tipo] || 'Otro'}</span> ${dateShort(e.date)}</span></span>
      <span class="row-amt"><span class="num">${money(e.amount, e.currency)}</span></span>
      <button class="btn ghost sm" data-action="is-expense" data-id="${e.id}">SÃ­ es gasto</button>
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
    toast('Â¡Al dÃ­a! ðŸŽ‰');
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
  if (b.period === 'monthly') return `Mensual Â· reinicia el ${b.resetDay || 1}`;
  if (b.period === 'weekly') return `Semanal Â· reinicia el ${WEEKDAYS[(b.resetDay || 1) % 7].toLowerCase()}`;
  if (b.period === 'biweekly') return 'Quincenal';
  if (b.period === 'yearly') return 'Anual';
  const { start, end } = budgetWindow(b);
  return `Sin periodicidad Â· ${dateRange(start, end)}`;
}

function budgetCard(b) {
  const s = budgetStats(b, state.expenses);
  const cc = costCenterById(b.costCenterId);
  const cat = b.categoryId ? categoryById(b.categoryId) : null;
  return `<button class="card budget-card" data-action="open-budget" data-id="${b.id}">
    <div class="bc-top"><span class="avatar sm" style="--cat:var(--c${cat ? cat.color : 6})">${cat ? cat.emoji : cc.emoji || 'ðŸŽ¯'}</span>
      <span class="row-main"><span class="row-title">${esc(b.name)}</span><span class="chip mini">${esc(periodText(b))}</span></span>
      <span class="status-pill ${s.status}">${STATUS_TEXT[s.status]}</span></div>
    ${progressWithNotch(s)}
    <div class="bc-foot"><span><b class="num">${money(s.spent, undefined, { hero: true })}</b> de ${money(s.amount, undefined, { hero: true })}</span><span class="muted">${s.daysLeft > 0 ? `Quedan ${s.daysLeft} ${s.daysLeft === 1 ? 'dÃ­a' : 'dÃ­as'}` : 'Cerrado'}</span></div>
  </button>`;
}

// Tarjeta agrupada de un plan: total del centro de costo + filas por categorÃ­a.
function planCard(groupId) {
  const list = state.budgets.filter((b) => b.groupId === groupId);
  const total = list.find((b) => !b.categoryId);
  if (!total) return list.map(budgetCard).join('');
  const s = budgetStats(total, state.expenses);
  const rows = list.filter((b) => b.categoryId).map((b) => ({ b, s: budgetStats(b, state.expenses) }))
    .sort((x, y) => y.s.spent / y.s.amount - x.s.spent / x.s.amount);
  const sum = rows.reduce((a, r) => a + r.s.amount, 0);
  const unassigned = Math.round((s.amount - sum) * 100) / 100;
  const spentUnassigned = Math.max(0, s.spent - rows.reduce((a, r) => a + r.s.spent, 0));
  const open = view.openPlans.has(groupId);
  const shown = open ? rows : rows.slice(0, 4);
  const row = ({ b, s: st }) => {
    const cat = categoryById(b.categoryId);
    const pct = Math.min(100, (st.spent / Math.max(st.amount, 1)) * 100);
    const left = st.amount - st.spent;
    return `<button class="plan-row" data-action="open-budget" data-id="${b.id}"><span class="avatar xs" style="--cat:var(--c${cat.color})">${cat.emoji}</span>
      <span class="plan-row-main"><span class="plan-row-top"><span>${esc(cat.name)}</span><span class="num ${left < 0 ? 'over-text' : 'muted'}">${left < 0 ? `${money(-left)} de mÃ¡s` : `quedan ${money(left)}`}</span></span>
      <span class="cat-bar"><i class="${st.status}" style="width:${pct.toFixed(1)}%"></i></span></span></button>`;
  };
  return `<div class="card plan-card">
    <button class="plan-head" data-action="open-budget" data-id="${total.id}">
      <div class="bc-top"><span class="avatar sm" style="--cat:var(--c6)">${costCenterById(total.costCenterId).emoji || 'ðŸŽ¯'}</span>
        <span class="row-main"><span class="row-title">Plan Â· ${esc(total.name)}</span><span class="chip mini">${esc(periodText(total))}</span></span>
        <span class="status-pill ${s.status}">${STATUS_TEXT[s.status]}</span></div>
      ${progressWithNotch(s)}
      <div class="bc-foot"><span><b class="num">${money(s.spent, undefined, { hero: true })}</b> de ${money(s.amount, undefined, { hero: true })}</span><span class="muted">${s.daysLeft > 0 ? `Quedan ${s.daysLeft} ${s.daysLeft === 1 ? 'dÃ­a' : 'dÃ­as'}` : 'Cerrado'}</span></div>
    </button>
    <div class="plan-rows">${shown.map(row).join('')}
      ${unassigned > 0 ? `<div class="plan-row static"><span class="avatar xs" style="--cat:var(--c11)">ðŸ«™</span><span class="plan-row-main"><span class="plan-row-top"><span>Sin asignar</span><span class="num muted">${money(spentUnassigned)} de ${money(unassigned)}</span></span>
        <span class="cat-bar"><i class="${spentUnassigned > unassigned ? 'over' : 'ok'}" style="width:${Math.min(100, (spentUnassigned / unassigned) * 100).toFixed(1)}%"></i></span></span></div>` : ''}
    </div>
    ${rows.length > 4 ? `<button class="link-btn plan-more" data-action="toggle-plan" data-id="${groupId}">${open ? 'Ver menos' : `Ver ${rows.length - 4} mÃ¡s`}</button>` : ''}
  </div>`;
}

function renderBudgets() {
  let html = topbar('Presupuestos', { action: `<button class="btn primary sm" data-action="new-budget">${icon('plus')} Nuevo</button>` });
  if (!state.budgets.length) {
    return html + emptyState('ðŸŽ¯', 'Sin presupuestos todavÃ­a', 'Arma un plan por centro de costo: pones cuÃ¡nto quieres gastar en cada categorÃ­a y la app te dice si vas al ritmo.', '<button class="btn primary" data-action="new-plan">Crear un plan</button>');
  }
  for (const cc of state.costCenters) {
    const list = state.budgets.filter((b) => b.costCenterId === cc.id);
    if (!list.length) continue;
    html += `<h2 class="section-title">${cc.emoji || ''} ${esc(cc.name)}</h2>`;
    const groups = [...new Set(list.filter((b) => b.groupId).map((b) => b.groupId))];
    html += groups.map(planCard).join('');
    html += list.filter((b) => !b.groupId).sort((a, b) => (a.categoryId ? 1 : 0) - (b.categoryId ? 1 : 0)).map(budgetCard).join('');
  }
  return html;
}

function openNewBudget() {
  const sheet = openSheet({
    title: 'Nuevo presupuesto',
    body: `<div class="add-options">
      <button class="add-opt main" data-opt="plan"><span class="add-emoji">ðŸ—‚ï¸</span><span><b>Plan por centro de costo</b><small>Todas tus categorÃ­as en una lista: pones el monto de cada una y listo</small></span>${icon('chevron')}</button>
      <button class="add-opt" data-opt="single"><span class="add-emoji">ðŸŽ¯</span><span><b>Presupuesto suelto</b><small>Un solo monto para un centro o una categorÃ­a</small></span>${icon('chevron')}</button>
    </div>`,
  });
  sheet.body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-opt]');
    if (!b) return;
    sheet.close();
    setTimeout(() => (b.dataset.opt === 'plan' ? openPlanEditor() : openBudgetEditor()), 120);
  });
}

// Promedio mensual de gasto por categorÃ­a en un centro de costo (3 meses completos anteriores).
function historyAverages(costCenterId) {
  const now = new Date();
  const from = toISO(new Date(now.getFullYear(), now.getMonth() - 3, 1));
  const to = toISO(new Date(now.getFullYear(), now.getMonth(), 1));
  const sums = {};
  let any = false;
  for (const e of state.expenses) {
    if (e.status !== 'confirmed' || e.costCenterId !== costCenterId || e.date < from || e.date >= to) continue;
    sums[e.categoryId] = (sums[e.categoryId] || 0) + e.amountBase;
    any = true;
  }
  return any ? Object.fromEntries(Object.entries(sums).map(([k, v]) => [k, v / 3])) : null;
}

const PERIOD_FACTOR = { monthly: 1, biweekly: 15.2 / 30.4, weekly: 7 / 30.4, yearly: 12 };

function roundNice(v) {
  const step = v >= 2000 ? 100 : v >= 200 ? 50 : 10;
  return Math.max(step, Math.round(v / step) * step);
}

// Editor de plan: un centro de costo, un perÃ­odo y un monto por categorÃ­a.
function openPlanEditor({ groupId = null, costCenterId = null } = {}) {
  const existing = groupId ? state.budgets.filter((b) => b.groupId === groupId) : [];
  const totalB = existing.find((b) => !b.categoryId);
  const p = {
    groupId: groupId || uid('plan'),
    costCenterId: totalB?.costCenterId || costCenterId || (state.costCenters.find((c) => !state.budgets.some((b) => b.groupId && b.costCenterId === c.id)) || state.costCenters[0]).id,
    period: totalB?.period || 'monthly',
    resetDay: totalB?.resetDay || 1,
    startDate: totalB?.startDate || todayISO(),
    endDate: totalB?.endDate || toISO(addDays(new Date(), 13)),
    amounts: Object.fromEntries(existing.filter((b) => b.categoryId).map((b) => [b.categoryId, String(b.amount)])),
    cushion: false,
    total: '',
    adopted: [],
  };
  if (totalB) {
    const sum = existing.filter((b) => b.categoryId).reduce((a, b) => a + b.amount, 0);
    if (totalB.amount > sum + 0.005) { p.cushion = true; p.total = String(totalB.amount); }
  }
  const isEdit = Boolean(groupId);
  let flash = new Set();
  let lastAmounts = null;

  // Si ya hay un plan para ese centro, se edita ese. Si hay presupuestos sueltos del mismo centro y perÃ­odo, se incorporan.
  const adoptLoose = () => {
    p.adopted = state.budgets.filter((b) => !b.groupId && b.costCenterId === p.costCenterId && b.period === p.period);
    for (const b of p.adopted) if (b.categoryId && !p.amounts[b.categoryId]) p.amounts[b.categoryId] = String(b.amount);
    const ref = p.adopted[0];
    if (ref) Object.assign(p, { resetDay: ref.resetDay || p.resetDay, startDate: ref.startDate || p.startDate, endDate: ref.endDate || p.endDate });
    const looseTotal = p.adopted.find((b) => !b.categoryId);
    if (looseTotal) { p.cushion = true; p.total = String(looseTotal.amount); }
  };
  const otherPlan = (ccId) => state.budgets.find((b) => b.groupId && b.groupId !== p.groupId && b.costCenterId === ccId && !b.categoryId);

  const sheet = openSheet({ title: isEdit ? 'Editar plan' : 'Nuevo plan', full: true, body: '', className: 'plan-sheet' });

  const sumAmounts = () => Object.values(p.amounts).reduce((a, v) => a + (parseAmount(v) || 0), 0);
  const totalHTML = () => {
    const sum = sumAmounts();
    const tot = p.cushion ? parseAmount(p.total) || 0 : sum;
    const err = p.cushion && tot < sum;
    return `<div class="plan-total-main"><span class="overline">Total del plan</span><b class="num">${money(tot, undefined, { hero: true })}</b></div>
      ${p.cushion ? `<div class="plan-cushion"><span>Total con colchÃ³n</span><div class="amount-input sm"><span>${esc(currencyPrefix())}</span><input class="input num" data-total inputmode="decimal" value="${esc(p.total)}" placeholder="${Math.round(sum)}"></div></div>
        ${err ? `<p class="field-error">El total no puede ser menor que la suma (${money(sum)})</p>` : tot > sum ? `<p class="muted small">Sin asignar: <b>${money(tot - sum)}</b></p>` : ''}` : ''}`;
  };
  const updateTotals = () => {
    const box = sheet.body.querySelector('.plan-total');
    if (box) {
      const focused = document.activeElement?.matches('[data-total]');
      if (!focused) box.innerHTML = totalHTML();
      else {
        const sum = sumAmounts(); const tot = parseAmount(p.total) || 0;
        box.querySelector('.plan-total-main b').textContent = money(tot, undefined, { hero: true });
        box.querySelector('.field-error, .muted.small')?.remove();
        box.insertAdjacentHTML('beforeend', tot < sum ? `<p class="field-error">El total no puede ser menor que la suma (${money(sum)})</p>` : tot > sum ? `<p class="muted small">Sin asignar: <b>${money(tot - sum)}</b></p>` : '');
      }
    }
    const n = Object.values(p.amounts).filter((v) => parseAmount(v) > 0).length;
    const btn = sheet.body.querySelector('[data-plan="save"]');
    if (btn) { btn.disabled = !n; btn.textContent = n ? `${isEdit ? 'Guardar plan' : 'Crear plan'} Â· ${n} ${n === 1 ? 'categorÃ­a' : 'categorÃ­as'}` : 'Pon al menos un monto'; }
  };

  const draw = () => {
    const cc = costCenterById(p.costCenterId);
    const avgs = historyAverages(p.costCenterId);
    const factor = PERIOD_FACTOR[p.period];
    const cats = visibleCategories();
    sheet.setBody(`
      <div class="field"><span>Centro de costo</span><div class="chip-row scroll">${state.costCenters.map((c) => `<button type="button" class="chip ${c.id === p.costCenterId ? 'on' : ''}" data-cc="${c.id}">${esc(c.emoji || '')} ${esc(c.name)}</button>`).join('')}</div></div>
      <div class="field"><span>PerÃ­odo</span><div class="seg wrap">${[['weekly', 'Semanal'], ['biweekly', 'Quincenal'], ['monthly', 'Mensual'], ['yearly', 'Anual'], ['none', 'Fechas']].map(([v, l]) => `<button type="button" class="${p.period === v ? 'on' : ''}" data-period="${v}">${l}</button>`).join('')}</div></div>
      ${p.period === 'monthly' ? `<div class="field"><span>DÃ­a de reinicio</span><div class="stepper"><button type="button" data-step="-1" aria-label="Menos">âˆ’</button><b>${p.resetDay}</b><button type="button" data-step="1" aria-label="MÃ¡s">+</button><small>de cada mes</small></div></div>` : ''}
      ${p.period === 'weekly' ? `<div class="field"><span>Reinicia el</span><div class="seg wrap">${WEEKDAYS.map((d, i) => `<button type="button" class="${(p.resetDay % 7) === i ? 'on' : ''}" data-weekday="${i}">${d.slice(0, 3)}</button>`).join('')}</div></div>` : ''}
      ${p.period === 'biweekly' || p.period === 'yearly' ? `<label class="field"><span>Empieza el</span><input class="input" type="date" data-date="startDate" value="${p.startDate}"></label>` : ''}
      ${p.period === 'none' ? `<div class="two"><label class="field"><span>Desde</span><input class="input" type="date" data-date="startDate" value="${p.startDate}"></label><label class="field"><span>Hasta</span><input class="input" type="date" data-date="endDate" value="${p.endDate}"></label></div>` : ''}
      ${p.adopted.length && !isEdit ? `<p class="tip-card">ðŸ§© <span>IncluÃ­ tus ${p.adopted.length} presupuestos sueltos de ${esc(cc.name)}. Al guardar quedan dentro de este plan.</span></p>` : ''}
      <div class="plan-total">${totalHTML()}</div>
      <div class="chip-row scroll plan-quick">
        <button type="button" class="chip" data-plan="suggest" ${avgs && factor ? '' : 'disabled'} title="${avgs ? '' : 'AÃºn no hay historial suficiente'}">âœ¨ Sugerir segÃºn mi historial</button>
        <button type="button" class="chip ${p.cushion ? 'on' : ''}" data-plan="cushion">ðŸ«™ ColchÃ³n sin asignar</button>
        <button type="button" class="chip" data-plan="clear">Limpiar</button>
      </div>
      ${!avgs ? '<p class="muted small">Sin historial de los Ãºltimos 3 meses en este centro: escribe los montos a mano.</p>' : ''}
      <div class="card list-card plan-list">${cats.map((c, i) => {
        const avg = avgs?.[c.id] && factor ? roundNice(avgs[c.id] * factor) : 0;
        return `<label class="plan-line ${flash.has(c.id) ? 'flash' : ''}"><span class="avatar sm" style="--cat:var(--c${c.color})">${c.emoji}</span>
          <span class="grow">${esc(c.name)}${avg ? `<button type="button" class="avg-btn" data-fill="${c.id}" data-v="${avg}">Prom.: ${money(avg)}</button>` : ''}</span>
          <span class="amount-input sm"><span>${esc(currencyPrefix())}</span><input class="input num" data-cat-amt="${c.id}" data-i="${i}" inputmode="decimal" enterkeyhint="${i === cats.length - 1 ? 'done' : 'next'}" value="${esc(p.amounts[c.id] || '')}" placeholder="â€”"></span></label>`;
      }).join('')}</div>
      <button class="btn primary full big plan-save" data-plan="save"></button>
      ${isEdit ? '<button class="btn danger-ghost full" data-plan="delete">Eliminar plan</button>' : ''}`);
    flash = new Set();
    updateTotals();
  };

  sheet.el.addEventListener('input', (e) => {
    const id = e.target.dataset.catAmt;
    if (id) { p.amounts[id] = e.target.value.replace(/[^\d.,]/g, ''); updateTotals(); return; }
    if (e.target.matches('[data-total]')) { p.total = e.target.value.replace(/[^\d.,]/g, ''); updateTotals(); }
  });
  sheet.el.addEventListener('change', (e) => {
    const d = e.target.dataset.date;
    if (d) p[d] = e.target.value;
    if (e.target.matches('[data-total]')) updateTotals();
  });
  sheet.el.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target.matches('[data-cat-amt]')) return;
    e.preventDefault();
    const next = sheet.body.querySelector(`[data-i="${Number(e.target.dataset.i) + 1}"]`);
    if (next) { next.focus(); next.scrollIntoView({ block: 'center', behavior: 'smooth' }); } else e.target.blur();
  });
  sheet.el.addEventListener('click', async (e) => {
    const cc = e.target.closest('[data-cc]');
    if (cc) {
      const other = otherPlan(cc.dataset.cc);
      if (other && !isEdit) { sheet.close(); toast('Ese centro ya tiene un plan: Ã¡brelo para editarlo'); setTimeout(() => openPlanEditor({ groupId: other.groupId }), 150); return; }
      p.costCenterId = cc.dataset.cc;
      if (!isEdit) { p.amounts = {}; adoptLoose(); }
      draw(); return;
    }
    const per = e.target.closest('[data-period]');
    if (per) {
      p.period = per.dataset.period;
      if (p.period === 'weekly') p.resetDay = 1;
      if (p.period === 'monthly') p.resetDay = Math.min(28, Number(p.resetDay) || 1);
      if (!isEdit) adoptLoose();
      draw(); return;
    }
    const wd = e.target.closest('[data-weekday]');
    if (wd) { p.resetDay = Number(wd.dataset.weekday); draw(); return; }
    const st = e.target.closest('[data-step]');
    if (st) { p.resetDay = Math.min(28, Math.max(1, Number(p.resetDay) + Number(st.dataset.step))); draw(); return; }
    const fill = e.target.closest('[data-fill]');
    if (fill) {
      e.preventDefault();
      p.amounts[fill.dataset.fill] = fill.dataset.v;
      const input = sheet.body.querySelector(`[data-cat-amt="${fill.dataset.fill}"]`);
      input.value = fill.dataset.v;
      input.closest('.plan-line').classList.remove('flash'); void input.offsetWidth; input.closest('.plan-line').classList.add('flash');
      updateTotals(); return;
    }
    const act = e.target.closest('[data-plan]')?.dataset.plan;
    if (act === 'suggest') {
      const avgs = historyAverages(p.costCenterId);
      const factor = PERIOD_FACTOR[p.period];
      if (!avgs || !factor) return;
      lastAmounts = { ...p.amounts };
      let n = 0;
      for (const c of visibleCategories()) {
        if (parseAmount(p.amounts[c.id]) > 0 || !avgs[c.id]) continue;
        p.amounts[c.id] = String(roundNice(avgs[c.id] * factor));
        flash.add(c.id); n++;
      }
      // Con colchÃ³n, el total sube si la suma lo supera.
      if (p.cushion && (parseAmount(p.total) || 0) < sumAmounts()) p.total = String(Math.round(sumAmounts()));
      draw();
      toast(n ? `SugerÃ­ ${n} ${n === 1 ? 'monto' : 'montos'} segÃºn tus Ãºltimos 3 meses` : 'No habÃ­a categorÃ­as vacÃ­as con historial', n ? { undo: () => { p.amounts = lastAmounts; draw(); } } : {});
    }
    if (act === 'cushion') { p.cushion = !p.cushion; if (p.cushion && !p.total) p.total = String(Math.round(sumAmounts())); draw(); }
    if (act === 'clear') { lastAmounts = { ...p.amounts }; p.amounts = {}; draw(); toast('Montos borrados', { undo: () => { p.amounts = lastAmounts; draw(); } }); }
    if (act === 'delete') {
      if (!(await confirmDialog({ title: 'Eliminar plan', text: 'Se eliminarÃ¡ el plan y los presupuestos de todas sus categorÃ­as. Tus gastos no se borran.', confirmText: 'Eliminar', danger: true }))) return;
      state.budgets = state.budgets.filter((b) => b.groupId !== p.groupId);
      save(); sheet.close(); toast('Plan eliminado');
    }
    if (act === 'save') savePlan();
  });

  const savePlan = async () => {
    const entries = Object.entries(p.amounts).map(([id, v]) => [id, parseAmount(v)]).filter(([, v]) => v > 0);
    if (!entries.length) { toast('Pon el monto de al menos una categorÃ­a'); return; }
    if (p.period === 'none' && p.endDate < p.startDate) { toast('La fecha final debe ser posterior a la inicial'); return; }
    const sum = entries.reduce((a, [, v]) => a + v, 0);
    const total = p.cushion ? parseAmount(p.total) : sum;
    if (total < sum - 0.005) { toast('El total no puede ser menor que la suma de las categorÃ­as'); return; }
    const removed = existing.filter((b) => b.categoryId && !entries.some(([id]) => id === b.categoryId));
    if (removed.length && !(await confirmDialog({
      title: 'Quitar presupuestos',
      text: `Se quitarÃ¡ el presupuesto de ${removed.map((b) => `â€œ${esc(categoryById(b.categoryId).name)}â€`).join(', ')}. Tus gastos no cambian.`,
      confirmText: 'Quitar y guardar',
    }))) return;
    const cc = costCenterById(p.costCenterId);
    const common = { costCenterId: p.costCenterId, period: p.period, resetDay: Number(p.resetDay) || 1, startDate: p.startDate, endDate: p.endDate, groupId: p.groupId };
    const keepId = (catId) => existing.find((b) => (b.categoryId || null) === catId)?.id || p.adopted.find((b) => (b.categoryId || null) === catId)?.id || uid('p');
    const next = [
      { id: keepId(null), name: cc.name, categoryId: null, amount: Math.round(total * 100) / 100, ...common },
      ...entries.map(([catId, amount]) => ({ id: keepId(catId), name: categoryById(catId).name, categoryId: catId, amount, ...common })),
    ];
    const drop = new Set([...existing, ...p.adopted].map((b) => b.id));
    state.budgets = [...state.budgets.filter((b) => !drop.has(b.id)), ...next];
    next.forEach((b) => animated.delete(b.id));
    save();
    sheet.close();
    toast(isEdit ? 'Plan actualizado' : `Plan creado Â· ${entries.length} ${entries.length === 1 ? 'categorÃ­a' : 'categorÃ­as'}`);
  };

  if (!isEdit) {
    const other = otherPlan(p.costCenterId);
    if (other) { sheet.close(); setTimeout(() => openPlanEditor({ groupId: other.groupId }), 0); return; }
    adoptLoose();
  }
  draw();
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
    body: `<p class="muted center">${esc(periodText(b))} Â· ${dateRange(s.start, s.end)}</p>
      ${paceCard(b, { large: true })}
      <h2 class="section-title">Gastos del perÃ­odo <span class="count">${list.length}</span></h2>
      <div class="card list-card">${list.length ? list.map((e) => {
        const c = categoryById(e.categoryId);
        return `<div class="row"><div class="swipe-content static" data-action="edit-expense" data-id="${e.id}"><span class="avatar" style="--cat:var(--c${c.color})">${c.emoji}</span>
          <span class="row-main"><span class="row-title">${esc(e.merchant)}</span><span class="row-sub">${dateShort(e.date)} Â· ${esc(c.name)}</span></span>
          <span class="row-amt"><span class="num">${money(e.amountBase)}</span></span></div></div>`;
      }).join('') : '<p class="widget-empty">Sin gastos en este perÃ­odo</p>'}</div>`,
    onMount: (sheet) => {
      const card = sheet.el.querySelector('.pace-card');
      prepareDraw(card);
      attachPaceTouch(card.querySelector('.pace-wrap'), s);
      setTimeout(() => { card.classList.add('play'); countUp(card.querySelector('.hero'), heroMoney); }, 250);
      sheet.el.querySelector('[data-edit-budget]').addEventListener('click', () => { sheet.close(); if (b.groupId) openPlanEditor({ groupId: b.groupId }); else openBudgetEditor(b); });
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
      <div class="field"><span>CategorÃ­a <small>(opcional)</small></span><button type="button" class="select-btn" data-pick="cat">${b.categoryId ? `${categoryById(b.categoryId).emoji} ${esc(categoryById(b.categoryId).name)}` : 'Todas las categorÃ­as'} ${icon('chevron')}</button></div>
      <div class="field"><span>PerÃ­odo</span><div class="seg wrap">${[['weekly', 'Semanal'], ['biweekly', 'Quincenal'], ['monthly', 'Mensual'], ['yearly', 'Anual'], ['none', 'Fechas']].map(([v, l]) => `<button type="button" class="${b.period === v ? 'on' : ''}" data-period="${v}">${l}</button>`).join('')}</div></div>
      ${b.period === 'monthly' ? `<div class="field"><span>DÃ­a de reinicio</span><div class="stepper"><button type="button" data-step="-1" aria-label="Menos">âˆ’</button><b>${b.resetDay}</b><button type="button" data-step="1" aria-label="MÃ¡s">+</button><small>de cada mes</small></div></div>` : ''}
      ${b.period === 'weekly' ? `<div class="field"><span>Reinicia el</span><div class="seg wrap">${WEEKDAYS.map((d, i) => `<button type="button" class="${(b.resetDay % 7) === i ? 'on' : ''}" data-weekday="${i}">${d.slice(0, 3)}</button>`).join('')}</div></div>` : ''}
      ${b.period === 'biweekly' || b.period === 'yearly' ? `<label class="field"><span>Empieza el</span><input class="input" type="date" name="startDate" value="${b.startDate || todayISO()}"></label>` : ''}
      ${b.period === 'none' ? `<div class="two"><label class="field"><span>Desde</span><input class="input" type="date" name="startDate" value="${b.startDate}"></label><label class="field"><span>Hasta</span><input class="input" type="date" name="endDate" value="${b.endDate}"></label></div>` : ''}
      ${prevStats ? `<div class="preview"><span class="overline">Vista previa Â· ${dateRange(prevStats.start, prevStats.end)}</span>${paceSVG(prevStats, { ghost: true })}</div>` : ''}
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
      const v = await pick({ title: 'CategorÃ­a', options: [{ value: '__all', label: 'Todas las categorÃ­as', emoji: 'ðŸŽ¯' }, ...visibleCategories().map((c) => ({ value: c.id, label: c.name, emoji: c.emoji, color: c.color }))], selected: b.categoryId || '__all' });
      if (v === undefined) return;
      b.categoryId = v === '__all' ? null : v;
      if (!b.name && b.categoryId) b.name = categoryById(b.categoryId).name;
      draw();
    });
    form.querySelector('[data-delete]')?.addEventListener('click', async () => {
      if (!(await confirmDialog({ title: 'Eliminar presupuesto', text: `Se eliminarÃ¡ â€œ${esc(b.name)}â€. Tus gastos no se borran.`, confirmText: 'Eliminar', danger: true }))) return;
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
    title: 'Â¿CÃ³mo quieres agregar?',
    body: `<div class="add-options">
      <button class="add-opt main" data-opt="batch"><span class="add-emoji">ðŸ“¥</span><span><b>Ponerme al dÃ­a</b><small>Sube capturas del banco, CSV, Excel o PDF</small></span>${icon('chevron')}</button>
      <button class="add-opt" data-opt="receipt"><span class="add-emoji">ðŸ§¾</span><span><b>Escanear recibo</b><small>Una foto del ticket y listo</small></span>${icon('chevron')}</button>
      <button class="add-opt" data-opt="manual"><span class="add-emoji">âœï¸</span><span><b>Agregar a mano</b><small>Monto, categorÃ­a y guardar</small></span>${icon('chevron')}</button>
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

// Formulario de gasto: nuevo, ediciÃ³n o prellenado por la IA.
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
      ${foreign ? `<div class="rate-line">â‰ˆ <b>${money(parseAmount(f.amount) * f.rate)}</b> Â· tasa <input class="rate-input" inputmode="decimal" value="${f.rate}" aria-label="Tasa de cambio"></div>` : ''}
      <input class="input desc ${unsure.merchant ? 'unsure' : ''}" placeholder="Â¿En quÃ© fue? (ej. Walmart)" value="${esc(f.merchant)}" data-f="merchant">
      <div class="chip-row scroll cats ${unsure.categoryId ? 'unsure' : ''}">
        ${cats.map((c) => `<button class="chip cat ${f.categoryId === c.id ? 'on' : ''}" data-cat="${c.id}">${c.emoji} ${esc(c.name)}</button>`).join('')}
        <button class="chip cat" data-act="more-cats">MÃ¡sâ€¦</button>
      </div>
      <div class="meta-row">
        <label class="meta ${unsure.date ? 'unsure' : ''}"><span>Fecha</span><input type="date" value="${f.date}" data-f="date"></label>
        <button class="meta" data-act="cc"><span>Centro</span><b>${esc(costCenterById(f.costCenterId).name)}</b></button>
        <button class="meta" data-act="method"><span>Medio</span><b>${esc(f.paymentMethod || 'Opcional')}</b></button>
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
    if (!f.categoryId) { toast('Elige una categorÃ­a'); return; }
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
      toast(`Guardado Â· ${money(amount, f.currency)}`);
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
      const v = await pick({ title: 'Moneda', options: CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} Â· ${c.name}` })), selected: f.currency });
      if (v) { f.currency = v; f.rate = rateFor(v); draw(); }
    }
    if (act === 'more-cats') {
      const v = await pick({ title: 'CategorÃ­a', options: visibleCategories().map((c) => ({ value: c.id, label: c.name, emoji: c.emoji, color: c.color })), selected: f.categoryId });
      if (v) { f.categoryId = v; delete unsure.categoryId; draw(); }
    }
    if (act === 'cc') {
      const v = await pick({ title: 'Centro de costo', options: state.costCenters.map((c) => ({ value: c.id, label: c.name, emoji: c.emoji })), selected: f.costCenterId });
      if (v) { f.costCenterId = v; draw(); }
    }
    if (act === 'method') {
      const v = await pickMethod({ title: 'Medio de pago', selected: f.paymentMethod });
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
  // Teclado fÃ­sico en escritorio.
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

// Aviso de modo demo o del proveedor activo.
function aiBand() {
  const p = currentProvider();
  if (!hasApiKey()) return `<p class="demo-band">Modo demo: resultados de ejemplo. Agrega tu clave de ${esc(p.name)} en <button class="link-btn inline" data-action="settings">Ajustes</button> para lectura real.</p>`;
  return `<p class="ai-band">${icon('key')} Lee con <b>${esc(modelLabel(p.id, currentModel()))}</b> Â· ${esc(p.company)}</p>`;
}

const readFiles = (files, mode, step, opts) => (hasApiKey() ? extractWithAI : extractDemo)(files, mode, step, opts);

// Recibo: una foto â†’ (recortar/tapar) â†’ formulario prellenado.
function openReceipt() {
  let entry = null;
  const sheet = openSheet({ title: 'Escanear recibo', body: '' });
  const drawPick = () => sheet.setBody(`${aiBand()}
      <div class="dropzone" id="rz">
        <div class="dz-inner"><span class="dz-emoji">ðŸ§¾</span><b>Toma una foto del ticket</b><small>o elige una imagen o PDF</small>
          <div class="btn-row"><label class="btn primary">${icon('camera')} CÃ¡mara<input type="file" accept="image/*" capture="environment" hidden></label>
          <label class="btn ghost">${icon('upload')} Archivo<input type="file" accept="image/*,application/pdf" hidden></label></div></div>
      </div>`);
  const drawPreview = () => sheet.setBody(`${aiBand()}
      <div class="receipt-preview">${entry.url ? `<img src="${entry.url}" alt="Recibo">` : '<span class="dz-emoji">ðŸ“„</span>'}${entry.edits ? '<span class="edited-badge">Editada</span>' : ''}</div>
      <p class="hint center">${entry.url ? 'Â¿Hay datos que no quieres enviar? Recorta o tapa antes de leer.' : 'Los PDF no se pueden editar aquÃ­. Toma una captura si quieres tapar datos.'}</p>
      <div class="btn-row two-btn">${entry.url ? `<button class="btn ghost" data-r="edit">${icon('pencil')} Editar</button>` : '<button class="btn ghost" data-r="other">Elegir otro</button>'}
        <button class="btn primary" data-r="read">${entry.edits ? 'Leer recibo' : 'Usar asÃ­'}</button></div>`);
  sheet.body.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    entry = { original: file, file, edits: null, url: file.type.startsWith('image/') ? URL.createObjectURL(file) : '' };
    drawPreview();
  });
  sheet.body.addEventListener('click', async (e) => {
    const r = e.target.closest('[data-r]')?.dataset.r;
    if (r === 'other') { entry = null; drawPick(); }
    if (r === 'edit') {
      const res = await openImageEditor(entry.original, { edits: entry.edits });
      if (res) { entry.file = res.file; entry.edits = res.edits; entry.url = URL.createObjectURL(res.file); drawPreview(); }
    }
    if (r === 'read') read();
  });
  const read = async () => {
    const zone = sheet.body.querySelector('.receipt-preview');
    sheet.body.querySelector('.btn-row').remove();
    sheet.body.querySelector('.hint')?.remove();
    zone.insertAdjacentHTML('afterend', '<p class="shimmer center">Leyendo tu reciboâ€¦</p>');
    try {
      const result = await readFiles([entry.file], 'receipt');
      const mov = (result.movimientos || [])[0];
      if (!mov) throw new AiError(result.nota || 'No encontrÃ© un total en la imagen.');
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
      console.error(err);
      sheet.body.querySelector('.shimmer')?.remove();
      zone.insertAdjacentHTML('afterend', `<p class="error-box">ðŸ˜• ${esc(err instanceof AiError ? err.message : 'OcurriÃ³ un error inesperado.')}</p>
        <div class="btn-row two-btn"><button class="btn ghost" data-r="other">Elegir otro</button><button class="btn primary" data-r="read">Intentar de nuevo</button></div>`);
    }
  };
  drawPick();
}

// Ponerme al dÃ­a: varios archivos â†’ (recortar/tapar) â†’ bandeja de revisiÃ³n.
function openBatch() {
  const files = []; // { original, file, edits, url }
  let account = '';
  const sheet = openSheet({ title: 'Ponerme al dÃ­a', full: true, body: '' });
  const isImg = (f) => f.original.type.startsWith('image/');
  const kind = (f) => (isImg(f) ? 'IMG' : f.original.name.toLowerCase().endsWith('.pdf') ? 'PDF' : /\.xlsx?$/i.test(f.original.name) ? 'XLS' : 'CSV');
  const draw = () => {
    const anyImg = files.some(isImg);
    sheet.setBody(`${aiBand()}
      <p class="lead">Sube capturas de tus movimientos o el archivo que exporta tu banco. La IA separa cada movimiento y tÃº solo confirmas.</p>
      <label class="dropzone ${files.length ? '' : 'big'}" id="bz">
        <input type="file" multiple accept="image/*,.pdf,.csv,.txt,.xls,.xlsx" hidden>
        <div class="dz-inner"><span class="dz-emoji">ðŸ“¥</span><b>${files.length ? 'Agregar mÃ¡s archivos' : 'Toca para elegir archivos'}</b><small>Capturas, CSV, Excel o PDF Â· varios a la vez</small></div>
      </label>
      ${anyImg && !state.settings.cropTipSeen ? `<div class="tip-card">ðŸ”’ <span><b>Â¿Hay datos sensibles?</b> Toca <b>Editar</b> para recortar o tapar antes de enviar. La imagen original no sale de tu telÃ©fono.</span><button class="icon-btn sm" data-act="tip-x" aria-label="Cerrar aviso">${icon('x')}</button></div>` : ''}
      ${files.length ? `<div class="thumbs">${files.map((f, i) => `<div class="thumb ${f.edits ? 'edited' : ''}">${isImg(f) ? `<img src="${f.url}" alt="">` : `<span class="dz-emoji">${kind(f) === 'PDF' ? 'ðŸ“„' : 'ðŸ“Š'}</span>`}
        <span class="tag">${f.edits ? 'âœ“ Editada' : kind(f)}</span><button class="thumb-x" data-rm="${i}" aria-label="Quitar">${icon('x')}</button>
        ${isImg(f) ? `<button class="thumb-edit" data-edit-img="${i}">${icon('pencil')} Editar</button>` : ''}</div>`).join('')}</div>` : ''}
      <div class="field"><span>Â¿De quÃ© medio de pago son? <small>(opcional)</small></span><button type="button" class="select-btn" data-act="account">${esc(account || 'La IA lo deduce')} ${icon('chevron')}</button></div>
      <div id="bprogress"></div>
      <button class="btn primary full big" data-act="read" ${files.length ? '' : 'disabled'}>${files.length ? `Leer ${files.length} ${files.length === 1 ? 'archivo' : 'archivos'}` : 'Elige al menos un archivo'}</button>`);
    sheet.body.querySelector('input[type=file]').addEventListener('change', (e) => {
      for (const f of e.target.files) files.push({ original: f, file: f, edits: null, url: f.type.startsWith('image/') ? URL.createObjectURL(f) : '' });
      draw();
    });
  };

  // Edita la imagen i y, con "Siguiente", continÃºa con las demÃ¡s imÃ¡genes.
  const editFrom = async (start) => {
    const imgs = files.filter(isImg);
    for (let k = imgs.indexOf(files[start]); k >= 0 && k < imgs.length; k++) {
      const f = imgs[k];
      const res = await openImageEditor(f.original, { edits: f.edits, index: k, total: imgs.length });
      if (!res) break;
      f.file = res.file; f.edits = res.edits; f.url = URL.createObjectURL(res.file);
      draw();
    }
  };

  sheet.el.addEventListener('click', async (e) => {
    const rm = e.target.closest('[data-rm]');
    if (rm) { e.preventDefault(); files.splice(Number(rm.dataset.rm), 1); draw(); return; }
    const ed = e.target.closest('[data-edit-img]');
    if (ed) { e.preventDefault(); editFrom(Number(ed.dataset.editImg)); return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'tip-x') { state.settings.cropTipSeen = true; save(); draw(); }
    if (act === 'account') {
      const v = await pickMethod({ title: 'Â¿De quÃ© medio de pago son?', selected: account });
      if (v !== undefined) { account = v; draw(); }
    }
    if (act === 'read') runBatch();
  });

  const runBatch = async () => {
    const btn = sheet.body.querySelector('[data-act="read"]');
    btn.disabled = true;
    btn.textContent = 'Leyendoâ€¦';
    const prog = sheet.body.querySelector('#bprogress');
    const steps = [];
    const step = (t) => { steps.push(t); prog.innerHTML = `<ul class="steps">${steps.map((s, i) => `<li class="${i === steps.length - 1 ? 'live' : 'done'}">${esc(s)}</li>`).join('')}</ul><div class="skeletons">${'<div class="skel"></div>'.repeat(4)}</div>`; };
    try {
      const result = await readFiles(files.map((f) => f.file), 'batch', step, { account });
      const movs = result.movimientos || [];
      step(`EncontrÃ© ${movs.length} ${movs.length === 1 ? 'movimiento' : 'movimientos'}`);
      const created = [];
      for (const m of movs) {
        const candidate = { amount: m.monto, date: m.fecha, currency: m.moneda };
        const dup = m.tipo === 'gasto' ? findDuplicate(candidate, created.map((c) => c.id)) : null;
        const byDigits = m.ultimos_digitos ? state.paymentMethods.find((x) => x.last4 === m.ultimos_digitos && !x.archived) : null;
        const method = methodByName(m.metodo_pago) ? m.metodo_pago : byDigits ? byDigits.name : account;
        const e = addExpenseSilently({
          date: m.fecha, merchant: m.comercio, description: m.descripcion, amount: m.monto, currency: m.moneda,
          categoryId: m.categoria, paymentMethod: method, status: 'pending', source: 'batch',
          ai: { tipo: m.tipo, confianza: m.confianza, pregunta: m.pregunta, opciones: m.opciones, dupOf: dup?.id, last4: m.ultimos_digitos || '' },
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
      prog.innerHTML = `<p class="error-box">ðŸ˜• ${esc(err instanceof AiError ? err.message : 'OcurriÃ³ un error inesperado al leer los archivos.')}</p>`;
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

// ---------------------------------------------------------------- Medios de pago

const methodType = (id) => METHOD_TYPES.find((t) => t.id === id) || METHOD_TYPES[2];

function methodSub(m) {
  return [methodType(m.type).short, m.last4 ? `â€¢â€¢${m.last4}` : '', m.owner].filter(Boolean).join(' Â· ');
}

function methodOption(m) {
  return { value: m.name, label: m.name, emoji: methodType(m.type).emoji, color: 6, hint: methodSub(m) };
}

// Selector de medio de pago con opciÃ³n de crear uno nuevo al vuelo. Devuelve el nombre o '' (sin especificar).
async function pickMethod({ title, selected }) {
  const v = await pick({
    title,
    options: [
      { value: '', label: 'Sin especificar' },
      ...paymentMethods().map(methodOption),
      { value: '__new', label: 'Nuevo medio de pago', emoji: 'ï¼‹', color: 6 },
    ],
    selected,
  });
  if (v !== '__new') return v;
  const created = await openMethodEditor();
  return created ? created.name : undefined;
}

function openPaymentMethods(onDone) {
  const sheet = openSheet({ title: 'Medios de pago', full: true, body: '', onClose: onDone });
  let showArchived = false;
  const draw = () => {
    const active = paymentMethods();
    const archived = paymentMethods({ archived: true });
    sheet.setBody(`<p class="lead">Tus tarjetas, cuentas y billeteras. La IA los usa para saber con quÃ© pagaste cada movimiento.</p>
      <div class="card list-card">${active.length ? active.map((m, i) => `<div class="set-row method-row">
          <span class="order-btns"><button class="icon-btn sm" data-move="${m.id}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Subir">${icon('up')}</button><button class="icon-btn sm" data-move="${m.id}" data-d="1" ${i === active.length - 1 ? 'disabled' : ''} aria-label="Bajar">${icon('down')}</button></span>
          <button class="method-main" data-edit="${m.id}"><span class="avatar sm" style="--cat:var(--c6)">${methodType(m.type).emoji}</span>
          <span class="grow">${esc(m.name)}<small>${esc(methodSub(m))}</small></span>${icon('chevron')}</button></div>`).join('')
        : '<p class="widget-empty">AÃºn no tienes medios de pago</p>'}</div>
      <button class="btn primary full" data-act="new">${icon('plus')} Agregar medio de pago</button>
      ${archived.length ? `<button class="link-btn" data-act="toggle-arch">${showArchived ? 'Ocultar' : 'Ver'} archivados (${archived.length})</button>
        ${showArchived ? `<div class="card list-card">${archived.map((m) => `<div class="set-row"><span class="avatar sm muted-av">${methodType(m.type).emoji}</span><span class="grow">${esc(m.name)}<small>${esc(methodSub(m))}</small></span>
          <button class="btn ghost sm" data-restore="${m.id}">Restaurar</button></div>`).join('')}</div>` : ''}` : ''}`);
  };
  sheet.el.addEventListener('click', async (e) => {
    const mv = e.target.closest('[data-move]');
    if (mv) {
      const list = state.paymentMethods;
      const active = paymentMethods();
      const i = active.findIndex((m) => m.id === mv.dataset.move);
      const other = active[i + Number(mv.dataset.d)];
      if (!other) return;
      const a = list.indexOf(active[i]); const b = list.indexOf(other);
      [list[a], list[b]] = [list[b], list[a]];
      save(); draw(); return;
    }
    const ed = e.target.closest('[data-edit]');
    if (ed) { await openMethodEditor(state.paymentMethods.find((m) => m.id === ed.dataset.edit)); draw(); return; }
    const rs = e.target.closest('[data-restore]');
    if (rs) { const m = state.paymentMethods.find((x) => x.id === rs.dataset.restore); if (m) { delete m.archived; save(); toast(`â€œ${m.name}â€ restaurado`); draw(); } return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'new') { await openMethodEditor(); draw(); }
    if (act === 'toggle-arch') { showArchived = !showArchived; draw(); }
  });
  draw();
}

// Crea o edita un medio de pago. Devuelve el medio guardado o null.
function openMethodEditor(existing, prefill = {}) {
  return new Promise((resolve) => {
    const m = existing ? { ...existing } : { id: uid('pm'), name: '', type: 'credito', last4: '', owner: '', ...prefill };
    let saved = null;
    const sheet = openSheet({ title: existing ? 'Editar medio de pago' : 'Nuevo medio de pago', className: 'tall', body: '', onClose: () => resolve(saved) });
    const used = existing ? state.expenses.filter((e) => e.paymentMethod === existing.name).length : 0;
    const draw = () => {
      const digits = ['credito', 'debito', 'cuenta'].includes(m.type);
      sheet.setBody(`<form class="form" id="mform" autocomplete="off">
        <label class="field"><span>Nombre</span><input class="input" name="name" value="${esc(m.name)}" maxlength="28" placeholder="Ej. TDC BBVA" required><small class="field-error" hidden></small></label>
        <div class="field"><span>Tipo</span><div class="chip-row wrap">${METHOD_TYPES.map((t) => `<button type="button" class="chip ${m.type === t.id ? 'on' : ''}" data-type="${t.id}">${t.emoji} ${t.name}</button>`).join('')}</div></div>
        ${digits ? `<label class="field"><span>Ãšltimos 4 dÃ­gitos <small>(opcional)</small></span><input class="input num" name="last4" value="${esc(m.last4)}" inputmode="numeric" maxlength="4" placeholder="1234"><small class="hint">Ayuda a la IA a reconocer tus estados de cuenta. Nunca escribas el nÃºmero completo.</small></label>` : ''}
        <label class="field"><span>Titular <small>(opcional)</small></span><input class="input" name="owner" value="${esc(m.owner)}" maxlength="24" placeholder="Ej. Betzabeth"><small class="hint">Ãštil si tu pareja tiene una tarjeta del mismo banco.</small></label>
        <button class="btn primary full big" type="submit">Guardar</button>
        ${existing ? `<button class="btn danger-ghost full" type="button" data-archive>${used ? 'Archivar' : 'Eliminar'}</button>
          ${used ? `<p class="hint center">Tiene ${used} ${used === 1 ? 'gasto' : 'gastos'}: al archivarlo deja de aparecer en las listas, pero esos gastos lo conservan.</p>` : ''}` : ''}
      </form>`);
    };
    sheet.el.addEventListener('input', (e) => {
      if (!e.target.name) return;
      m[e.target.name] = e.target.name === 'last4' ? e.target.value.replace(/\D/g, '') : e.target.value;
      if (e.target.name === 'last4') e.target.value = m.last4;
    });
    sheet.el.addEventListener('click', async (e) => {
      const t = e.target.closest('[data-type]');
      if (t) { m.type = t.dataset.type; if (!['credito', 'debito', 'cuenta'].includes(m.type)) m.last4 = ''; draw(); return; }
      if (e.target.closest('[data-archive]')) {
        if (used) {
          state.paymentMethods.find((x) => x.id === m.id).archived = true;
          toast(`â€œ${existing.name}â€ archivado`);
        } else {
          if (!(await confirmDialog({ title: 'Eliminar medio de pago', text: `Se eliminarÃ¡ â€œ${esc(existing.name)}â€.`, confirmText: 'Eliminar', danger: true }))) return;
          state.paymentMethods = state.paymentMethods.filter((x) => x.id !== m.id);
        }
        save();
        sheet.close();
      }
    });
    sheet.el.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = m.name.trim();
      const err = sheet.body.querySelector('.field-error');
      const clash = state.paymentMethods.find((x) => x.id !== m.id && x.name.toLowerCase() === name.toLowerCase());
      if (!name || clash) { err.hidden = false; err.textContent = clash ? 'Ya tienes un medio con ese nombre' : 'Ponle un nombre'; return; }
      const clean = { ...m, name, last4: (m.last4 || '').slice(0, 4), owner: m.owner.trim() };
      const i = state.paymentMethods.findIndex((x) => x.id === m.id);
      if (i >= 0) {
        const old = state.paymentMethods[i].name;
        state.paymentMethods[i] = clean;
        // Renombrar actualiza los gastos que lo usan.
        if (old !== name) state.expenses.forEach((x) => { if (x.paymentMethod === old) x.paymentMethod = name; });
      } else state.paymentMethods.push(clean);
      save();
      saved = clean;
      toast(existing ? 'Medio de pago actualizado' : `â€œ${name}â€ agregado`);
      sheet.close();
    });
    draw();
  });
}

// ---------------------------------------------------------------- Ajustes

function openSettings() {
  const sheet = openSheet({ title: 'Ajustes', full: true, body: '' });
  let showKey = false;
  const conn = {}; // resultado de "Probar conexiÃ³n" por proveedor
  const pill = (id) => {
    if (!hasApiKey(id)) return '<span class="status-pill warn">Modo demo</span>';
    if (conn[id] === 'testing') return '<span class="status-pill">Probandoâ€¦</span>';
    if (conn[id] === true) return '<span class="status-pill ok">Conectada âœ“</span>';
    if (typeof conn[id] === 'string') return `<span class="status-pill over">${esc(conn[id])}</span>`;
    return '<span class="status-pill">Sin probar</span>';
  };
  const draw = () => {
    const s = state.settings;
    const p = currentProvider();
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
          <span class="overline">Proveedor</span>
          <div class="provider-seg">${PROVIDERS.map((x) => `<button class="${x.id === p.id ? 'on' : ''}" data-provider="${x.id}"><b>${esc(x.name)}${hasApiKey(x.id) ? '<i class="pdot"></i>' : ''}</b><small>${esc(x.company)} Â· ${x.id === 'google' ? 'plan gratis' : 'de pago'}</small></button>`).join('')}</div>
        </div>
        <div class="set-row column">
          <div class="set-line"><span>${icon('key')} Clave de ${esc(p.company)}</span>${pill(p.id)}</div>
          <div class="key-input"><input class="input" data-key-input type="${showKey ? 'text' : 'password'}" value="${esc(s.keys[p.id] || '')}" placeholder="${esc(p.keyHint)}" autocomplete="off" spellcheck="false">
            <button class="btn ghost sm" data-act="toggle-key">${showKey ? 'Ocultar' : 'Ver'}</button></div>
          <div class="key-actions"><button class="btn ghost sm" data-act="test" ${hasApiKey(p.id) ? '' : 'disabled'}>Probar conexiÃ³n</button><span class="muted small">ObtÃ©n tu clave en <b>${esc(p.keyUrl)}</b></span></div>
        </div>
        <button class="set-row" data-act="model"><span>Modelo</span><b>${esc(modelLabel(p.id, currentModel()))}</b>${icon('chevron')}</button>
      </div>
      <p class="privacy-note ${p.id === 'google' ? 'warn' : ''}">${p.id === 'google' ? 'âš ï¸ ' : ''}${esc(p.privacy)}</p>
      <p class="hint">Tus claves se guardan solo en este dispositivo y las imÃ¡genes van directo al proveedor que elijas. No uses este prototipo en un equipo compartido.</p>
      <h3 class="group-title">Pagos</h3>
      <div class="card list-card">
        <button class="set-row" data-act="methods"><span>Medios de pago</span><b>${paymentMethods().length}</b>${icon('chevron')}</button>
      </div>      <h3 class="group-title">OrganizaciÃ³n</h3>
      <div class="card list-card">
        <button class="set-row" data-act="categories"><span>CategorÃ­as</span><b>${visibleCategories().length} visibles</b>${icon('chevron')}</button>
        <button class="set-row" data-act="costcenters"><span>Centros de costo</span><b>${state.costCenters.length}</b>${icon('chevron')}</button>
        <button class="set-row" data-act="customize"><span>Orden del inicio</span>${icon('chevron')}</button>
      </div>
      <h3 class="group-title">Datos</h3>
      <div class="card list-card">
        <button class="set-row" data-act="sample"><span>Cargar datos de ejemplo</span>${icon('chevron')}</button>
        <button class="set-row danger" data-act="wipe"><span>Borrar todo</span>${icon('chevron')}</button>
      </div>
      <p class="about">${logoSVG(36)}<span><b>Ritmo</b> Â· prototipo v0.3.0<br><small>Tus datos viven en este dispositivo.</small></span></p>`);
  };
  sheet.el.addEventListener('input', (e) => {
    if (e.target.matches('[data-name]')) { state.settings.name = e.target.value.slice(0, 30); save(); }
    if (e.target.matches('[data-key-input]')) {
      const id = state.settings.provider;
      state.settings.keys = { ...state.settings.keys, [id]: e.target.value.trim() };
      delete conn[id];
      save();
      sheet.body.querySelector('.set-line .status-pill').outerHTML = pill(id);
      sheet.body.querySelector('[data-act="test"]').disabled = !hasApiKey(id);
    }
  });
  sheet.el.addEventListener('click', async (e) => {
    const theme = e.target.closest('[data-theme-set]');
    if (theme) { state.settings.theme = theme.dataset.themeSet; save(); applyTheme(); draw(); return; }
    const prov = e.target.closest('[data-provider]');
    if (prov) { state.settings.provider = prov.dataset.provider; showKey = false; save(); draw(); return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'toggle-key') { showKey = !showKey; draw(); }
    if (act === 'currency') {
      const v = await pick({ title: 'Moneda principal', options: CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} Â· ${c.name}` })), selected: state.settings.currency });
      if (v && v !== state.settings.currency) {
        state.settings.currency = v;
        save();
        toast('Moneda cambiada. Los montos ya registrados no se convierten.');
        draw();
      }
    }
    if (act === 'model') {
      const p = currentProvider();
      const v = await pick({ title: `Modelo de ${p.name}`, options: p.models.map((m, i) => ({ value: m.id, label: m.name, hint: i === 0 ? `Recomendado Â· ${m.note}` : m.note })), selected: currentModel() });
      if (v) { state.settings.models = { ...state.settings.models, [p.id]: v }; save(); draw(); }
    }
    if (act === 'test') {
      const id = state.settings.provider;
      conn[id] = 'testing'; draw();
      try { await testConnection(id); conn[id] = true; } catch (err) { conn[id] = err instanceof AiError ? err.message : 'Error'; }
      draw();
    }
    if (act === 'methods') openPaymentMethods(draw);
    if (act === 'categories') openCategories(draw);
    if (act === 'costcenters') openCostCenters(draw);
    if (act === 'customize') openCustomize();
    if (act === 'sample') {
      if (!(await confirmDialog({ title: 'Cargar datos de ejemplo', text: 'Se reemplazarÃ¡n tus gastos, presupuestos, medios de pago y centros de costo actuales por datos de ejemplo.', confirmText: 'Cargar ejemplo' }))) return;
      loadSampleData();
      animated.clear();
      sheet.close();
      switchTab('home');
      toast('Datos de ejemplo cargados');
    }
    if (act === 'wipe') {
      if (!(await confirmDialog({ title: 'Borrar todo', text: 'Se borrarÃ¡n todos tus gastos, presupuestos, categorÃ­as propias y ajustes de este dispositivo. No se puede deshacer.', confirmText: 'Borrar todo', danger: true, requireText: 'BORRAR' }))) return;
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
  const sheet = openSheet({ title: 'CategorÃ­as', full: true, body: '', onClose: onDone });
  const draw = () => {
    sheet.setBody(`<p class="lead">Elige quÃ© categorÃ­as predefinidas ves. Puedes crear las tuyas, pero las predefinidas no se editan.</p>
      <h3 class="group-title">Predefinidas</h3>
      <div class="card list-card">${PREDEFINED_CATEGORIES.map((c) => `<label class="set-row"><span class="avatar sm" style="--cat:var(--c${c.color})">${c.emoji}</span><span class="grow">${esc(c.name)}</span>
        <input type="checkbox" class="switch" data-vis="${c.id}" ${state.visibleCategories.includes(c.id) ? 'checked' : ''}></label>`).join('')}</div>
      <h3 class="group-title">Tus categorÃ­as</h3>
      <div class="card list-card">${state.customCategories.length ? state.customCategories.map((c) => `<div class="set-row"><span class="avatar sm" style="--cat:var(--c${c.color})">${esc(c.emoji)}</span><span class="grow">${esc(c.name)}</span>
        <button class="icon-btn" data-del="${c.id}" aria-label="Eliminar">${icon('trash')}</button></div>`).join('') : '<p class="widget-empty">AÃºn no creas categorÃ­as propias</p>'}</div>
      <form class="card new-form" id="newcat">
        <h3>+ Nueva categorÃ­a</h3>
        <div class="two"><input class="input emoji-input" name="emoji" maxlength="4" placeholder="ðŸ™‚" aria-label="Emoji"><input class="input" name="name" placeholder="Nombre" maxlength="24" required></div>
        <div class="swatches">${SWATCHES.map((i) => `<button type="button" class="swatch ${i === color ? 'on' : ''}" data-color="${i}" style="background:var(--c${i})" aria-label="Color ${i + 1}"></button>`).join('')}</div>
        <button class="btn primary full" type="submit">Crear categorÃ­a</button>
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
      if (!(await confirmDialog({ title: 'Eliminar categorÃ­a', text: used ? 'Los gastos de esta categorÃ­a pasarÃ¡n a â€œOtrosâ€.' : 'Se eliminarÃ¡ esta categorÃ­a.', confirmText: 'Eliminar', danger: true }))) return;
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
    state.customCategories.push({ id: uid('cat'), name, emoji: String(data.get('emoji')).trim() || 'ðŸ·ï¸', color });
    save();
    toast(`CategorÃ­a â€œ${name}â€ creada`);
    draw();
  });
  draw();
}

function openCostCenters(onDone) {
  const sheet = openSheet({ title: 'Centros de costo', full: true, body: '', onClose: onDone });
  const draw = () => {
    sheet.setBody(`<p class="lead">Agrupa gastos por propÃ³sito: el dÃ­a a dÃ­a, un viaje, una remodelaciÃ³n. Cada centro se desglosa por categorÃ­as.</p>
      <div class="card list-card">${state.costCenters.map((c, i) => `<div class="set-row"><span class="avatar sm" style="--cat:var(--c6)">${esc(c.emoji || 'ðŸ“')}</span><span class="grow">${esc(c.name)}${i === 0 ? '<small>Principal</small>' : ''}</span>
        ${i > 0 ? `<button class="icon-btn" data-del="${c.id}" aria-label="Eliminar">${icon('trash')}</button>` : ''}</div>`).join('')}</div>
      <form class="card new-form" id="newcc">
        <h3>+ Nuevo centro de costo</h3>
        <div class="two"><input class="input emoji-input" name="emoji" maxlength="4" placeholder="ðŸï¸" aria-label="Emoji"><input class="input" name="name" placeholder="Ej. Viaje a CancÃºn" maxlength="30" required></div>
        <button class="btn primary full" type="submit">Crear centro de costo</button>
      </form>`);
  };
  sheet.el.addEventListener('click', async (e) => {
    const del = e.target.closest('[data-del]');
    if (!del) return;
    const cc = costCenterById(del.dataset.del);
    if (!(await confirmDialog({ title: 'Eliminar centro de costo', text: `Los gastos de â€œ${esc(cc.name)}â€ pasarÃ¡n a â€œ${esc(state.costCenters[0].name)}â€ y se eliminarÃ¡n sus presupuestos.`, confirmText: 'Eliminar', danger: true }))) return;
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
    state.costCenters.push({ id: uid('cc'), name, emoji: String(data.get('emoji')).trim() || 'ðŸ“' });
    save();
    toast(`â€œ${name}â€ creado`);
    draw();
  });
  draw();
}

function openCustomize() {
  const sheet = openSheet({ title: 'Personalizar inicio', full: true, body: '' });
  const draw = () => {
    sheet.setBody(`<p class="lead">Activa los grÃ¡ficos que quieres ver y ordÃ©nalos a tu gusto.</p>
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
    'new-budget': openNewBudget,
    'new-plan': () => openPlanEditor(),
    'toggle-plan': () => { if (view.openPlans.has(id)) view.openPlans.delete(id); else view.openPlans.add(id); rerender(); },
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
    'add-card': () => addUnknownCard(id),
    'ignore-card': () => ignoreUnknownCard(id),
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
