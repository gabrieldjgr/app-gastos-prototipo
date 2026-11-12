// Gráficos hechos a mano en SVG/HTML: ritmo de presupuesto, barras por categoría, evolución, etc.
import { money, moneyShort, dateShort, addDays, esc, toISO, parseISO, monthName } from './format.js';
import { categoryById, costCenterById, state, confirmed } from './store.js';
import { budgetStats } from './budget.js';

const W = 328;
const H = 190;
const PAD_R = 40;
const PAD_T = 14;
const PAD_B = 24;
const PW = W - PAD_R;
const PH = H - PAD_T - PAD_B;

const STATUS_VAR = { ok: 'var(--ok)', warn: 'var(--warn)', over: 'var(--over)' };
let gradSeq = 0;

function scale(stats) {
  const top = Math.max(stats.amount, stats.canProject ? stats.projected : 0, stats.spent, 1) * 1.08;
  const x = (i) => (i / stats.totalDays) * PW;
  const y = (v) => PAD_T + PH - (v / top) * PH;
  return { x, y, top };
}

export function paceSVG(stats, { ghost = false } = {}) {
  const id = `pg${++gradSeq}`;
  const { x, y } = scale(stats);
  const color = STATUS_VAR[stats.status];
  const bottom = y(0);
  const yA = y(stats.amount);
  const parts = [];

  // Rejilla: 0, 50 % y tope.
  for (const [v, dashed] of [[0, false], [stats.amount / 2, false], [stats.amount, true]]) {
    const yy = y(v).toFixed(1);
    parts.push(`<line x1="0" x2="${PW}" y1="${yy}" y2="${yy}" class="grid" ${dashed ? 'stroke-dasharray="2 4"' : ''}/>`);
    parts.push(`<text x="${W - 2}" y="${(+yy + 4).toFixed(1)}" text-anchor="end" class="axis">${v === 0 ? '0' : moneyShort(v, undefined, { symbol: false })}</text>`);
  }
  parts.push(`<text x="2" y="${(yA - 5).toFixed(1)}" class="axis tope">Tope</text>`);

  // Línea ideal.
  parts.push(`<line x1="0" y1="${bottom}" x2="${PW}" y2="${yA.toFixed(1)}" class="ideal" stroke-dasharray="4 4"/>`);
  const lx = PW * 0.72;
  const ly = bottom - (bottom - yA) * 0.72;
  const angle = (Math.atan2(yA - bottom, PW) * 180) / Math.PI;
  parts.push(`<text x="${lx.toFixed(1)}" y="${(ly + 12).toFixed(1)}" text-anchor="middle" class="axis ideal-label" transform="rotate(${angle.toFixed(1)} ${lx.toFixed(1)} ${(ly + 12).toFixed(1)})">ideal</text>`);

  if (!ghost && stats.elapsed > 0) {
    // Línea real escalonada (el gasto se acumula a saltos).
    let d = `M0,${bottom.toFixed(1)}`;
    let prev = 0;
    for (let i = 0; i < stats.elapsed; i++) {
      const v = stats.cumulative[i];
      if (v !== prev) {
        d += ` L${x(i).toFixed(1)},${y(prev).toFixed(1)} L${x(i).toFixed(1)},${y(v).toFixed(1)}`;
        prev = v;
      }
    }
    const xt = x(stats.elapsed);
    d += ` L${xt.toFixed(1)},${y(prev).toFixed(1)}`;
    const area = `${d} L${xt.toFixed(1)},${bottom.toFixed(1)} Z`;

    parts.push(`<defs>
      <linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" style="stop-color:${color};stop-opacity:.18"/>
        <stop offset="1" style="stop-color:${color};stop-opacity:0"/>
      </linearGradient>
      <clipPath id="${id}c"><path d="M0,${bottom} L${PW},${yA.toFixed(1)} L${PW},0 L0,0 Z"/></clipPath>
    </defs>`);
    parts.push(`<path d="${area}" fill="url(#${id})" class="area"/>`);
    parts.push(`<path d="${area}" class="excess" clip-path="url(#${id}c)"/>`);

    // Hoy.
    if (stats.daysLeft > 0) parts.push(`<line x1="${xt.toFixed(1)}" x2="${xt.toFixed(1)}" y1="${PAD_T}" y2="${bottom}" class="today" stroke-dasharray="2 3"/>`);

    // Proyección.
    if (stats.canProject) {
      const yp = y(stats.projected);
      parts.push(`<line x1="${xt.toFixed(1)}" y1="${y(stats.spent).toFixed(1)}" x2="${PW}" y2="${yp.toFixed(1)}" class="proj" style="stroke:${color}" stroke-dasharray="2 5"/>`);
      parts.push(`<circle cx="${PW}" cy="${yp.toFixed(1)}" r="4" class="proj-end" style="stroke:${color}"/>`);
      const label = moneyShort(stats.projected);
      const lw = label.length * 6.6 + 12;
      const ly = yp < PAD_T + 26 ? yp + 10 : yp - 26;
      parts.push(`<g class="proj-label"><rect x="${(PW - lw - 6).toFixed(1)}" y="${ly.toFixed(1)}" width="${lw.toFixed(1)}" height="18" rx="9" class="pill-${stats.status}"/>
        <text x="${(PW - 6 - lw / 2).toFixed(1)}" y="${(ly + 12.5).toFixed(1)}" text-anchor="middle" class="pill-text-${stats.status}">${esc(label)}</text></g>`);
    }

    parts.push(`<path d="${d}" class="real" style="stroke:${color}"/>`);
    parts.push(`<circle cx="${xt.toFixed(1)}" cy="${y(stats.spent).toFixed(1)}" r="6" class="halo" style="fill:${color}"/>`);
    parts.push(`<circle cx="${xt.toFixed(1)}" cy="${y(stats.spent).toFixed(1)}" r="6" class="dot" style="fill:${color}"/>`);
  }

  // Eje X: inicio, hoy, fin (y uno intermedio si cabe).
  const endLabel = dateShort(addDays(stats.end, -1));
  const labels = [];
  const xt = x(stats.elapsed);
  const showToday = !ghost && stats.elapsed > 0 && stats.daysLeft > 0;
  if (!showToday || xt > 46) labels.push(`<text x="0" y="${H - 6}" class="axis">${dateShort(stats.start)}</text>`);
  if (!showToday || xt < PW - 46) labels.push(`<text x="${PW}" y="${H - 6}" text-anchor="end" class="axis">${endLabel}</text>`);
  if (showToday) labels.push(`<text x="${Math.min(Math.max(xt, 14), PW - 14).toFixed(1)}" y="${H - 6}" text-anchor="middle" class="axis axis-today">Hoy</text>`);
  else if (stats.totalDays >= 14 && !ghost) labels.push(`<text x="${(PW / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" class="axis">${dateShort(addDays(stats.start, Math.floor(stats.totalDays / 2)))}</text>`);
  parts.push(...labels);

  parts.push(`<line class="guide" x1="0" x2="0" y1="${PAD_T}" y2="${bottom}"/>`);
  return `<svg viewBox="0 0 ${W} ${H}" class="pace-svg" role="img" aria-label="Gráfico de ritmo: gastado ${esc(money(stats.spent))} de ${esc(money(stats.amount))}">${parts.join('')}</svg>`;
}

// Prepara la animación de dibujo de la línea real.
export function prepareDraw(root) {
  root.querySelectorAll('.real').forEach((p) => {
    const len = p.getTotalLength();
    p.style.strokeDasharray = `${len}`;
    p.style.strokeDashoffset = `${len}`;
  });
}

// Mantener y arrastrar sobre el gráfico muestra el detalle del día.
export function attachPaceTouch(wrap, stats) {
  const svg = wrap.querySelector('svg');
  const tip = wrap.querySelector('.pace-tip');
  const guide = svg.querySelector('.guide');
  if (!svg || !tip) return;
  let timer = null;
  let active = false;
  let startX = 0;
  let startY = 0;

  const show = (clientX) => {
    const rect = svg.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * W;
    const i = Math.min(stats.totalDays - 1, Math.max(0, Math.floor((px / PW) * stats.totalDays)));
    const date = addDays(stats.start, i);
    const ideal = stats.amount * ((i + 1) / stats.totalDays);
    const real = i < stats.elapsed ? stats.cumulative[i] : null;
    const gx = ((i + 1) / stats.totalDays) * PW;
    guide.setAttribute('x1', gx);
    guide.setAttribute('x2', gx);
    guide.classList.add('on');
    tip.innerHTML = `<b>${dateShort(date)}</b> · ${real === null ? 'sin datos aún' : money(real, undefined, { hero: true })} · ideal ${money(ideal, undefined, { hero: true })}`;
    const left = (gx / W) * rect.width;
    tip.style.left = `${Math.min(Math.max(left, 90), rect.width - 90)}px`;
    tip.classList.add('on');
  };
  const hide = () => {
    clearTimeout(timer);
    active = false;
    tip.classList.remove('on');
    guide.classList.remove('on');
  };

  svg.addEventListener('pointerdown', (e) => {
    startX = e.clientX;
    startY = e.clientY;
    if (e.pointerType === 'mouse') return;
    timer = setTimeout(() => { active = true; show(startX); navigator.vibrate?.(5); }, 150);
  });
  svg.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') { show(e.clientX); return; }
    if (!active && (Math.abs(e.clientX - startX) > 6 || Math.abs(e.clientY - startY) > 6)) clearTimeout(timer);
    if (active) show(e.clientX);
  });
  svg.addEventListener('touchmove', (e) => { if (active) e.preventDefault(); }, { passive: false });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => svg.addEventListener(ev, hide));
}

// Tarjeta de ritmo completa (cabecera, cifra, mensaje, gráfico y pie).
export function paceCard(budget, { large = false } = {}) {
  const stats = budgetStats(budget, state.expenses);
  const cat = budget.categoryId ? categoryById(budget.categoryId) : null;
  const cc = costCenterById(budget.costCenterId);
  const emoji = cat ? cat.emoji : cc?.emoji || '🎯';
  const statusText = { ok: '✓ En ritmo', warn: '▲ Cerca del límite', over: '● Sobre presupuesto' }[stats.status];
  const over = stats.remaining < 0;
  return `<article class="card pace-card ${large ? 'large' : ''}" data-budget="${budget.id}" data-status="${stats.status}">
    <header class="pace-head">
      <div class="pace-title"><span class="avatar sm" style="--cat:var(--c${cat ? cat.color : 6})">${emoji}</span><span>${esc(budget.name)}</span></div>
      <span class="status-pill ${stats.status}">${statusText}</span>
    </header>
    <div class="hero-row">
      <span class="hero" data-count="${stats.spent}">${heroMoney(stats.spent)}</span>
      <span class="hero-of">de ${money(stats.amount, undefined, { hero: true })}</span>
    </div>
    <p class="pace-msg ${stats.status}">${paceMessageHTML(stats)}</p>
    <div class="pace-wrap">${paceSVG(stats)}<div class="pace-tip" aria-hidden="true"></div></div>
    <footer class="pace-foot">
      <div><span class="overline">${over ? 'Excedido' : 'Disponible'}</span><span class="num ${over ? 'txt-over' : ''}">${money(Math.abs(stats.remaining), undefined, { hero: true })}</span></div>
      <div><span class="overline">Por día restante</span><span class="num">${stats.daysLeft > 0 ? money(stats.perDayLeft, undefined, { hero: true }) : '—'}</span></div>
      <div><span class="overline">Días restantes</span><span class="num">${stats.daysLeft}</span></div>
    </footer>
  </article>`;
}

export function heroMoney(value) {
  const txt = money(value, undefined, { hero: true });
  const m = txt.match(/^([^\d−]*)(.*)$/);
  return `<span class="hero-sym">${esc(m[1])}</span>${esc(m[2])}`;
}

export function paceMessageHTML(stats) {
  if (stats.elapsed === 0) return 'Este período aún no empieza.';
  if (stats.daysLeft === 0) {
    const diff = Math.round((stats.spent / stats.amount - 1) * 100);
    return diff <= 0 ? `Cerraste <b>${Math.abs(diff)} % abajo</b> 👏` : `Cerraste <b>${diff} % por encima</b>.`;
  }
  if (stats.spent > stats.amount) return `Ya te pasaste por <b>${money(stats.spent - stats.amount, undefined, { hero: true })}</b>. Ojo con lo que queda.`;
  if (!stats.canProject) return 'Aún es pronto para proyectar.';
  const delta = Math.round(stats.projectedDelta * 100);
  if (delta > 0) return `A este ritmo terminarás <b>${delta} % por encima</b> (${money(stats.projected - stats.amount, undefined, { hero: true, sign: true })})`;
  if (delta <= -15) return `Vas <b>${Math.abs(delta)} % por debajo</b> del ritmo. ¡Bien!`;
  if (delta < -2) return `Vas <b>${Math.abs(delta)} % por debajo</b> del ritmo`;
  return 'Justo en ritmo';
}

export function ghostPace() {
  const fake = { totalDays: 30, elapsed: 0, cumulative: [], spent: 0, amount: 10000, projected: 0, canProject: false, status: 'ok', daysLeft: 30, start: new Date(new Date().getFullYear(), new Date().getMonth(), 1) };
  fake.end = addDays(fake.start, 30);
  return `<article class="card pace-card ghost">
    <div class="pace-wrap">${paceSVG(fake, { ghost: true })}</div>
    <p class="ghost-text">Crea tu primer presupuesto y mira tu ritmo</p>
    <button class="btn primary" data-action="new-budget">Crear presupuesto</button>
  </article>`;
}

// ---------- Widgets del inicio ----------

function monthWindow(ref = new Date()) {
  const start = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 1);
  return { start: toISO(start), end: toISO(end) };
}

export function categoryBars() {
  const { start, end } = monthWindow();
  const totals = {};
  for (const e of confirmed()) if (e.date >= start && e.date < end) totals[e.categoryId] = (totals[e.categoryId] || 0) + e.amountBase;
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  if (!sorted.length) return emptyWidget('Aún no hay gastos este mes');
  const top = sorted.slice(0, 6);
  const rest = sorted.slice(6).reduce((s, [, v]) => s + v, 0);
  if (rest > 0) {
    const otros = top.find(([k]) => k === 'otros');
    if (otros) otros[1] += rest;
    else top.push(['otros', rest]);
  }
  const max = top[0][1];
  const total = sorted.reduce((s, [, v]) => s + v, 0);
  return `<div class="bars">${top.map(([id, v]) => {
    const c = categoryById(id);
    return `<div class="bar-row" data-action="filter-category" data-id="${id}">
      <span class="avatar sm" style="--cat:var(--c${c.color})">${c.emoji}</span>
      <div class="bar-main"><div class="bar-label"><span>${esc(c.name)}</span><span class="num">${money(v, undefined, { hero: true })}</span></div>
      <div class="bar-track"><div class="bar-fill" style="--w:${((v / max) * 100).toFixed(1)}%;background:var(--c${c.color})"></div></div></div>
    </div>`;
  }).join('')}</div><p class="widget-foot">Total del mes · <b class="num">${money(total, undefined, { hero: true })}</b></p>`;
}

export function trendBars(mode = 'month') {
  const buckets = [];
  const now = new Date();
  if (mode === 'month') {
    for (let i = 5; i >= 0; i--) {
      const s = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const e = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      buckets.push({ label: monthName(s, false), start: toISO(s), end: toISO(e) });
    }
  } else {
    const monday = addDays(now, -((now.getDay() + 6) % 7));
    for (let i = 5; i >= 0; i--) {
      const s = addDays(monday, -7 * i);
      buckets.push({ label: dateShort(s), start: toISO(s), end: toISO(addDays(s, 7)) });
    }
  }
  const exp = confirmed();
  for (const b of buckets) b.total = exp.filter((e) => e.date >= b.start && e.date < b.end).reduce((s, e) => s + e.amountBase, 0);
  const max = Math.max(...buckets.map((b) => b.total), 1);
  const prev = buckets.slice(0, -1).filter((b) => b.total > 0);
  const avg = prev.length ? prev.reduce((s, b) => s + b.total, 0) / prev.length : 0;
  return `<div class="seg small" role="tablist">
      <button class="${mode === 'month' ? 'on' : ''}" data-action="trend-mode" data-mode="month">Meses</button>
      <button class="${mode === 'week' ? 'on' : ''}" data-action="trend-mode" data-mode="week">Semanas</button>
    </div>
    <div class="trend">
      ${avg > 0 ? `<div class="trend-avg" style="bottom:${(20 + (avg / max) * 116).toFixed(1)}px"><span>prom. ${moneyShort(avg)}</span></div>` : ''}
      ${buckets.map((b, i) => `<div class="trend-col ${i === buckets.length - 1 ? 'current' : ''}">
        <span class="trend-val">${i === buckets.length - 1 ? moneyShort(b.total) : ''}</span>
        <div class="trend-bar" style="height:${Math.max(3, (b.total / max) * 116).toFixed(1)}px" title="${esc(money(b.total, undefined, { hero: true }))}"></div>
        <span class="trend-label">${b.label}</span>
      </div>`).join('')}
    </div>`;
}

export function costCenterRows() {
  const exp = confirmed();
  const rows = state.costCenters.map((cc) => {
    const budget = state.budgets.find((b) => b.costCenterId === cc.id && !b.categoryId);
    if (budget) {
      const s = budgetStats(budget, state.expenses);
      return { cc, value: s.spent, max: s.amount, note: `de ${money(s.amount, undefined, { hero: true })}`, status: s.status };
    }
    const { start, end } = monthWindow();
    const v = exp.filter((e) => e.costCenterId === cc.id && e.date >= start && e.date < end).reduce((s, e) => s + e.amountBase, 0);
    return { cc, value: v, max: null, note: 'este mes', status: null };
  });
  const maxNoBudget = Math.max(...rows.map((r) => r.value), 1);
  return `<div class="cc-rows">${rows.map((r) => `<div class="cc-row">
      <span class="avatar sm" style="--cat:var(--c6)">${r.cc.emoji || '📁'}</span>
      <div class="bar-main"><div class="bar-label"><span>${esc(r.cc.name)}</span><span class="num">${money(r.value, undefined, { hero: true })} <small>${r.note}</small></span></div>
      <div class="bar-track thin"><div class="bar-fill" style="--w:${Math.min(100, (r.value / (r.max || maxNoBudget)) * 100).toFixed(1)}%;background:${r.status ? STATUS_VAR[r.status] : 'var(--accent)'}"></div></div></div>
    </div>`).join('')}</div>`;
}

export function topMerchants() {
  const since = toISO(addDays(new Date(), -30));
  const groups = {};
  for (const e of confirmed()) {
    if (e.date < since) continue;
    const key = e.merchant || e.description || 'Sin nombre';
    groups[key] = groups[key] || { name: key, total: 0, count: 0, cat: e.categoryId };
    groups[key].total += e.amountBase;
    groups[key].count += 1;
  }
  const list = Object.values(groups).sort((a, b) => b.total - a.total).slice(0, 5);
  if (!list.length) return emptyWidget('Sin compras en los últimos 30 días');
  return `<ol class="merchants">${list.map((m, i) => {
    const c = categoryById(m.cat);
    return `<li><span class="rank">${i + 1}</span><span class="avatar sm" style="--cat:var(--c${c.color})">${c.emoji}</span>
      <span class="m-name">${esc(m.name)}<small>${m.count} ${m.count === 1 ? 'compra' : 'compras'}</small></span>
      <span class="num">${money(m.total, undefined, { hero: true })}</span></li>`;
  }).join('')}</ol><p class="widget-foot">Últimos 30 días</p>`;
}

function emptyWidget(text) {
  return `<p class="widget-empty">${text}</p>`;
}

// Barra de progreso con muesca de "dónde deberías ir hoy".
export function progressWithNotch(stats) {
  const fill = Math.min(100, (stats.spent / Math.max(stats.amount, 1)) * 100);
  const notch = Math.min(100, (stats.elapsed / stats.totalDays) * 100);
  return `<div class="progress"><div class="progress-fill ${stats.status}" style="--w:${fill.toFixed(1)}%"></div><span class="notch" style="left:${notch.toFixed(1)}%" title="Dónde deberías ir hoy"></span></div>`;
}

export { parseISO };
