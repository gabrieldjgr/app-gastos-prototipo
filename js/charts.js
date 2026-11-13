// Gráficos hechos a mano en SVG/HTML: ritmo de presupuesto, barras por categoría, evolución, etc.
import { money, moneyShort, dateShort, addDays, esc, toISO, parseISO, monthName, dateRange } from './format.js';
import { categoryById, costCenterById, state, confirmed } from './store.js';
import { budgetStats } from './budget.js';
import { periodOf, periodRange, shiftPeriod, isCurrent, samePeriod, periodLabel, periodShort, sumIn, budgetStatsFor } from './period.js';

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
export function paceCard(budget, { large = false, stats: given = null, closed = false } = {}) {
  const stats = given || budgetStats(budget, state.expenses);
  const cat = budget.categoryId ? categoryById(budget.categoryId) : null;
  const cc = costCenterById(budget.costCenterId);
  const emoji = cat ? cat.emoji : cc?.emoji || '🎯';
  const over = stats.remaining < 0;
  const closedPct = stats.amount > 0 ? Math.round(Math.abs(stats.spent / stats.amount - 1) * 100) : 0;
  const statusText = closed
    ? (over ? `● Se pasó ${money(-stats.remaining, undefined, { hero: true })}` : `✓ Cerró ${closedPct} % abajo`)
    : { ok: '✓ En ritmo', warn: '▲ Cerca del límite', over: '● Sobre presupuesto' }[stats.status];
  const foot = closed
    ? `<div><span class="overline">Gastado</span><span class="num">${money(stats.spent, undefined, { hero: true })}</span></div>
      <div><span class="overline">Presupuesto</span><span class="num">${money(stats.amount, undefined, { hero: true })}</span></div>
      <div><span class="overline">Diferencia</span><span class="num ${over ? 'txt-over' : 'txt-ok'}">${money(stats.spent - stats.amount, undefined, { hero: true, sign: true })}</span></div>`
    : `<div><span class="overline">${over ? 'Excedido' : 'Disponible'}</span><span class="num ${over ? 'txt-over' : ''}">${money(Math.abs(stats.remaining), undefined, { hero: true })}</span></div>
      <div><span class="overline">Por día restante</span><span class="num">${stats.daysLeft > 0 ? money(stats.perDayLeft, undefined, { hero: true }) : '—'}</span></div>
      <div><span class="overline">Días restantes</span><span class="num">${stats.daysLeft}</span></div>`;
  return `<article class="card pace-card ${large ? 'large' : ''} ${closed ? 'closed' : ''}" data-budget="${budget.id}" data-status="${stats.status}">
    <header class="pace-head">
      <div class="pace-title"><span class="avatar sm" style="--cat:var(--c${cat ? cat.color : 6})">${emoji}</span><span>${esc(budget.name)}${closed ? `<small class="pace-win">${esc(dateRange(stats.start, stats.end))}</small>` : ''}</span></div>
      <span class="status-pill ${stats.status}">${statusText}</span>
    </header>
    <div class="hero-row">
      <span class="hero" data-count="${stats.spent}">${heroMoney(stats.spent)}</span>
      <span class="hero-of">de ${money(stats.amount, undefined, { hero: true })}</span>
    </div>
    <p class="pace-msg ${stats.status}">${paceMessageHTML(stats)}</p>
    <div class="pace-wrap">${paceSVG(stats)}<div class="pace-tip" aria-hidden="true"></div></div>
    <footer class="pace-foot">${foot}</footer>
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
// Todos reciben ctx = { p, r, cmp }: período elegido, su rango y el rango con el que se compara.

const DELTA_MIN = 0.15; // solo se marca el cambio de una categoría si es de 15 % o más

function cmpName(cmp) {
  if (cmp.prev.mode === 'week') return cmp.partial ? 'la semana pasada a esta altura' : 'la semana anterior';
  const m = monthName(cmp.start, false);
  return cmp.partial ? `${m} al día ${cmp.day}` : m;
}

// "▲ 12 % vs oct al día 13": más gasto en color de alerta, menos gasto en verde.
export function deltaChip(total, prev, cmp) {
  if (!(prev > 0)) return '';
  const pct = Math.round((total / prev - 1) * 100);
  if (Math.abs(pct) < 1) return `<span class="delta same">= igual que ${esc(cmpName(cmp))}</span>`;
  return `<span class="delta ${pct > 0 ? 'up' : 'down'}" title="Antes: ${esc(money(prev, undefined, { hero: true }))}">${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)} % vs ${esc(cmpName(cmp))}</span>`;
}

export function categoryBars(ctx) {
  const { r, cmp, p } = ctx;
  const totals = {};
  const before = {};
  for (const e of confirmed()) {
    if (e.date >= r.startISO && e.date < r.endISO) totals[e.categoryId] = (totals[e.categoryId] || 0) + e.amountBase;
    if (e.date >= cmp.startISO && e.date < cmp.endISO) before[e.categoryId] = (before[e.categoryId] || 0) + e.amountBase;
  }
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  if (!sorted.length) return emptyWidget(`Sin gastos en ${periodLabel(p)}`);
  const top = sorted.slice(0, 6).map(([id, v]) => [id, v, true]);
  const rest = sorted.slice(6).reduce((s, [, v]) => s + v, 0);
  if (rest > 0) {
    // "Otros" agrupa varias categorías: su comparación no tendría sentido.
    const otros = top.find(([k]) => k === 'otros');
    if (otros) { otros[1] += rest; otros[2] = false; } else top.push(['otros', rest, false]);
  }
  const max = top[0][1];
  const total = sorted.reduce((s, [, v]) => s + v, 0);
  const prevTotal = Object.values(before).reduce((s, v) => s + v, 0);
  return `<div class="bars">${top.map(([id, v, comparable]) => {
    const c = categoryById(id);
    const prev = before[id] || 0;
    const diff = v - prev;
    const showDelta = comparable && prev > 0 && Math.abs(diff) / prev >= DELTA_MIN;
    return `<div class="bar-row" data-action="filter-category" data-id="${id}">
      <span class="avatar sm" style="--cat:var(--c${c.color})">${c.emoji}</span>
      <div class="bar-main"><div class="bar-label"><span>${esc(c.name)}</span><span class="num">${showDelta ? `<small class="delta-mini ${diff > 0 ? 'up' : 'down'}">${diff > 0 ? '▲' : '▼'} ${moneyShort(Math.abs(diff))}</small> ` : ''}${money(v, undefined, { hero: true })}</span></div>
      <div class="bar-track"><div class="bar-fill" style="--w:${((v / max) * 100).toFixed(1)}%;background:var(--c${c.color})"></div></div></div>
    </div>`;
  }).join('')}</div><p class="widget-foot">Total · <b class="num">${money(total, undefined, { hero: true })}</b> ${deltaChip(total, prevTotal, cmp)}</p>`;
}

// Número de períodos entre a y b (b posterior a a).
function stepsBetween(a, b) {
  const sa = parseISO(a.start);
  const sb = parseISO(b.start);
  if (a.mode === 'month') return (sb.getFullYear() - sa.getFullYear()) * 12 + sb.getMonth() - sa.getMonth();
  return Math.round((sb - sa) / (7 * 86400000));
}

export function trendBars(ctx) {
  const { p } = ctx;
  const cur = periodOf(p.mode);
  // Seis barras que terminan en el período actual, salvo que el elegido quede fuera: entonces se corre la ventana.
  const back = stepsBetween(p, cur);
  const last = back > 5 ? shiftPeriod(p, 2) : cur;
  const exp = confirmed();
  const buckets = [];
  for (let i = 5; i >= 0; i--) {
    const q = shiftPeriod(last, -i);
    const r = periodRange(q);
    buckets.push({ q, total: sumIn(exp, r.startISO, r.endISO), current: isCurrent(q), selected: samePeriod(q, p) });
  }
  const max = Math.max(...buckets.map((b) => b.total), 1);
  // El promedio solo usa períodos completos: el actual aún no termina.
  const done = buckets.filter((b) => !b.current && b.total > 0);
  const avg = done.length ? done.reduce((s, b) => s + b.total, 0) / done.length : 0;
  const unit = p.mode === 'month' ? 'mes' : 'semana';
  return `<div class="seg small" role="tablist">
      <button class="${p.mode === 'month' ? 'on' : ''}" data-action="period-mode" data-mode="month">Meses</button>
      <button class="${p.mode === 'week' ? 'on' : ''}" data-action="period-mode" data-mode="week">Semanas</button>
    </div>
    <div class="trend">
      ${avg > 0 ? `<div class="trend-avg" style="bottom:${(38 + (avg / max) * 106).toFixed(1)}px"><span>prom. ${moneyShort(avg)}</span></div>` : ''}
      ${buckets.map((b) => `<button class="trend-col ${b.current ? 'current' : ''} ${b.selected ? 'selected' : ''}" data-action="period-set" data-start="${b.q.start}" aria-pressed="${b.selected}" aria-label="${esc(periodLabel(b.q))}: ${esc(money(b.total, undefined, { hero: true }))}">
        <span class="trend-val">${b.selected ? moneyShort(b.total) : ''}</span>
        <span class="trend-bar" style="height:${Math.max(3, (b.total / max) * 106).toFixed(1)}px"></span>
        <span class="trend-label">${periodShort(b.q)}</span>
        <span class="trend-today">${b.current && !b.selected ? 'hoy' : ''}</span>
      </button>`).join('')}
    </div>
    <p class="widget-foot">Toca una barra para ver ese ${unit}${buckets.some((b) => b.current) ? ' · el actual aún no termina' : ''}</p>`;
}

export function costCenterRows(ctx) {
  const { r, p } = ctx;
  const exp = confirmed();
  const rows = state.costCenters.map((cc) => {
    const budget = state.budgets.find((b) => b.costCenterId === cc.id && !b.categoryId);
    const res = budget ? budgetStatsFor(budget, state.expenses, p) : null;
    if (res) {
      const s = res.stats;
      const sameAsPeriod = toISO(s.start) === r.startISO && toISO(s.end) === r.endISO;
      return { cc, value: s.spent, max: s.amount, note: `de ${money(s.amount, undefined, { hero: true })}`, win: sameAsPeriod ? '' : dateRange(s.start, s.end), status: s.status };
    }
    const v = sumIn(exp, r.startISO, r.endISO, (e) => e.costCenterId === cc.id);
    return { cc, value: v, max: null, note: '', win: '', status: null };
  });
  // En un período pasado se ocultan los centros sin gastos (por ejemplo, un viaje que aún no ocurría).
  const shown = isCurrent(p) ? rows : rows.filter((x) => x.value > 0);
  if (!shown.length) return emptyWidget(`Sin gastos en ${periodLabel(p)}`);
  const maxNoBudget = Math.max(...shown.map((x) => x.value), 1);
  return `<div class="cc-rows">${shown.map((x) => `<div class="cc-row" data-action="filter-cc" data-id="${x.cc.id}">
      <span class="avatar sm" style="--cat:var(--c6)">${x.cc.emoji || '📁'}</span>
      <div class="bar-main"><div class="bar-label"><span>${esc(x.cc.name)}${x.win ? ` <small>· ${esc(x.win)}</small>` : ''}</span><span class="num">${money(x.value, undefined, { hero: true })}${x.note ? ` <small>${x.note}</small>` : ''}</span></div>
      <div class="bar-track thin"><div class="bar-fill" style="--w:${Math.min(100, (x.value / (x.max || maxNoBudget)) * 100).toFixed(1)}%;background:${x.status ? STATUS_VAR[x.status] : 'var(--accent)'}"></div></div></div>
    </div>`).join('')}</div>`;
}

export function topMerchants(ctx) {
  const { r, p } = ctx;
  const groups = {};
  for (const e of confirmed()) {
    if (e.date < r.startISO || e.date >= r.endISO) continue;
    const key = e.merchant || e.description || 'Sin nombre';
    groups[key] = groups[key] || { name: key, total: 0, count: 0, cat: e.categoryId };
    groups[key].total += e.amountBase;
    groups[key].count += 1;
  }
  const list = Object.values(groups).sort((a, b) => b.total - a.total).slice(0, 5);
  if (!list.length) return emptyWidget(`Sin compras en ${periodLabel(p)}`);
  return `<ol class="merchants">${list.map((m, i) => {
    const c = categoryById(m.cat);
    return `<li data-action="filter-merchant" data-name="${esc(m.name)}"><span class="rank">${i + 1}</span><span class="avatar sm" style="--cat:var(--c${c.color})">${c.emoji}</span>
      <span class="m-name">${esc(m.name)}<small>${m.count} ${m.count === 1 ? 'compra' : 'compras'}</small></span>
      <span class="num">${money(m.total, undefined, { hero: true })}</span></li>`;
  }).join('')}</ol>`;
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
