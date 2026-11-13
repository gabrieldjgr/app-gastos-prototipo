// Piezas de interfaz reutilizables: iconos, hojas (sheets), toasts, selectores, confeti y swipe.
import { esc } from './format.js';

const P = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  inbox: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5.5 5h13l2.5 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  backspace: '<path d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z"/><path d="M12 9l6 6M18 9l-6 6"/>',
  pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/>',
};

export function icon(name, cls = '') {
  return `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}

export const vibrate = (p) => { try { navigator.vibrate?.(p); } catch { /* sin vibración */ } };

// ---------- Sheets ----------
const stack = [];

export function openSheet({ title = '', body = '', full = false, className = '', onMount, onClose, headerAction = '' }) {
  const host = document.getElementById('app');
  const layer = document.createElement('div');
  layer.className = `sheet-layer ${full ? 'full' : ''}`;
  layer.innerHTML = `<div class="backdrop"></div>
    <section class="sheet ${className}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      ${full ? `<header class="sheet-head"><button class="icon-btn" data-close aria-label="Volver">${icon('back')}</button><h2>${esc(title)}</h2><div class="sheet-head-action">${headerAction}</div></header>`
    : `<div class="grabber"></div>${title ? `<h2 class="sheet-title">${esc(title)}</h2>` : ''}`}
      <div class="sheet-body">${body}</div>
    </section>`;
  host.appendChild(layer);
  requestAnimationFrame(() => layer.classList.add('open'));
  const api = {
    el: layer.querySelector('.sheet'),
    body: layer.querySelector('.sheet-body'),
    setBody(html) { api.body.innerHTML = html; },
    close(result) {
      layer.classList.remove('open');
      layer.classList.add('closing');
      const i = stack.indexOf(api);
      if (i >= 0) stack.splice(i, 1);
      setTimeout(() => layer.remove(), 320);
      onClose?.(result);
    },
  };
  layer.querySelector('.backdrop').addEventListener('click', () => api.close());
  layer.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => api.close()));
  stack.push(api);
  onMount?.(api);
  return api;
}

export function closeTopSheet() {
  const top = stack[stack.length - 1];
  if (top) { top.close(); return true; }
  return false;
}

export function closeAllSheets() {
  [...stack].reverse().forEach((s) => s.close());
}

// ---------- Selector de opciones ----------
export function pick({ title, options, selected }) {
  return new Promise((resolve) => {
    let chosen;
    const sheet = openSheet({
      title,
      body: `<ul class="pick-list">${options.map((o, i) => `<li><button class="pick-item ${o.value === selected ? 'on' : ''}" data-i="${i}">
        ${o.emoji ? `<span class="avatar sm" style="--cat:var(--c${o.color ?? 6})">${o.emoji}</span>` : ''}
        <span class="pick-label">${esc(o.label)}${o.hint ? `<small>${esc(o.hint)}</small>` : ''}</span>
        ${o.value === selected ? icon('check', 'accent') : ''}</button></li>`).join('')}</ul>`,
      onClose: () => resolve(chosen),
    });
    sheet.body.addEventListener('click', (e) => {
      const b = e.target.closest('.pick-item');
      if (!b) return;
      chosen = options[Number(b.dataset.i)].value;
      sheet.close();
    });
  });
}

// Selector de varias opciones. Devuelve el arreglo elegido, o undefined si se cerró sin aplicar.
export function multiPick({ title, options, selected = [] }) {
  return new Promise((resolve) => {
    let result;
    const chosen = new Set(selected);
    const sheet = openSheet({ title, body: '', onClose: () => resolve(result) });
    const draw = () => {
      sheet.setBody(`<ul class="pick-list">${options.map((o, i) => `<li><button class="pick-item ${chosen.has(o.value) ? 'on' : ''}" data-i="${i}" aria-pressed="${chosen.has(o.value)}">
        ${o.emoji ? `<span class="avatar sm" style="--cat:var(--c${o.color ?? 6})">${o.emoji}</span>` : ''}
        <span class="pick-label">${esc(o.label)}${o.hint ? `<small>${esc(o.hint)}</small>` : ''}</span>
        <span class="check-box ${chosen.has(o.value) ? 'on' : ''}">${chosen.has(o.value) ? icon('check') : ''}</span></button></li>`).join('')}</ul>
        <div class="btn-row multi-actions"><button class="btn ghost" data-m="clear" ${chosen.size ? '' : 'disabled'}>Quitar filtro</button>
        <button class="btn primary" data-m="apply">${chosen.size ? `Aplicar (${chosen.size})` : 'Ver todos'}</button></div>`);
    };
    sheet.body.addEventListener('click', (e) => {
      const b = e.target.closest('.pick-item');
      if (b) {
        const v = options[Number(b.dataset.i)].value;
        if (chosen.has(v)) chosen.delete(v); else chosen.add(v);
        draw();
        return;
      }
      const m = e.target.closest('[data-m]')?.dataset.m;
      if (m === 'clear') { chosen.clear(); draw(); }
      if (m === 'apply') { result = [...chosen]; sheet.close(); }
    });
    draw();
  });
}

export function confirmDialog({ title, text, confirmText = 'Confirmar', danger = false, requireText = '' }) {
  return new Promise((resolve) => {
    let ok = false;
    const sheet = openSheet({
      title,
      body: `<p class="dialog-text">${text}</p>
        ${requireText ? `<input class="input" id="confirm-input" autocomplete="off" placeholder="Escribe ${esc(requireText)}">` : ''}
        <div class="btn-row"><button class="btn ghost" data-act="no">Cancelar</button>
        <button class="btn ${danger ? 'danger' : 'primary'}" data-act="yes" ${requireText ? 'disabled' : ''}>${esc(confirmText)}</button></div>`,
      onClose: () => resolve(ok),
    });
    const input = sheet.body.querySelector('#confirm-input');
    const yes = sheet.body.querySelector('[data-act="yes"]');
    input?.addEventListener('input', () => { yes.disabled = input.value.trim().toUpperCase() !== requireText; });
    sheet.body.querySelector('[data-act="no"]').addEventListener('click', () => sheet.close());
    yes.addEventListener('click', () => { ok = true; sheet.close(); });
  });
}

// ---------- Toast ----------
let toastTimer;
export function toast(text, { undo } = {}) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    document.getElementById('app').appendChild(el);
  }
  el.innerHTML = `<span>${esc(text)}</span>${undo ? '<button>Deshacer</button>' : ''}`;
  el.classList.add('on');
  if (undo) el.querySelector('button').onclick = () => { undo(); el.classList.remove('on'); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 3500);
}

// ---------- Confeti ----------
export function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const host = document.getElementById('app');
  const layer = document.createElement('div');
  layer.className = 'confetti';
  for (let i = 0; i < 16; i++) {
    const p = document.createElement('i');
    const angle = (Math.PI * 2 * i) / 16 + Math.random() * 0.4;
    const dist = 90 + Math.random() * 90;
    p.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
    p.style.setProperty('--dy', `${Math.sin(angle) * dist - 60}px`);
    p.style.setProperty('--r', `${Math.random() * 540 - 270}deg`);
    p.style.background = `var(--c${i % 11})`;
    layer.appendChild(p);
  }
  host.appendChild(layer);
  setTimeout(() => layer.remove(), 1000);
}

// ---------- Swipe horizontal (confirmar / descartar / eliminar) ----------
export function swipeable(el, { onRight, onLeft }) {
  let x0 = 0; let y0 = 0; let t0 = 0; let dx = 0; let dragging = false; let decided = false;
  const content = el.querySelector('.swipe-content') || el;
  el.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, input, select, textarea, a')) return;
    x0 = e.clientX; y0 = e.clientY; t0 = performance.now(); dx = 0; dragging = true; decided = false;
  });
  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const mx = e.clientX - x0; const my = e.clientY - y0;
    if (!decided) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
      decided = true;
      if (Math.abs(my) > Math.abs(mx)) { dragging = false; return; }
      el.setPointerCapture?.(e.pointerId);
    }
    dx = mx;
    if (dx > 0 && !onRight) dx = 0;
    if (dx < 0 && !onLeft) dx = 0;
    content.style.transition = 'none';
    content.style.transform = `translateX(${dx}px)`;
    el.dataset.dir = dx > 0 ? 'right' : dx < 0 ? 'left' : '';
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    const w = el.offsetWidth;
    const v = Math.abs(dx) / Math.max(1, performance.now() - t0);
    content.style.transition = 'transform .18s cubic-bezier(.32,.72,0,1)';
    if ((Math.abs(dx) > w * 0.35 || (v > 0.5 && Math.abs(dx) > 40)) && dx !== 0) {
      content.style.transform = `translateX(${dx > 0 ? w : -w}px)`;
      setTimeout(() => (dx > 0 ? onRight : onLeft)(), 170);
    } else {
      content.style.transform = '';
      el.dataset.dir = '';
    }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

// Colapsa una fila con animación antes de quitarla.
export function collapse(el) {
  return new Promise((resolve) => {
    el.style.height = `${el.offsetHeight}px`;
    requestAnimationFrame(() => {
      el.classList.add('collapsing');
      el.style.height = '0px';
      setTimeout(resolve, 220);
    });
  });
}

// Conteo ascendente de cifras.
export function countUp(el, format) {
  const target = Number(el.dataset.count) || 0;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const t0 = performance.now();
  const step = (t) => {
    const p = Math.min(1, (t - t0) / 600);
    const eased = 1 - (1 - p) ** 3;
    el.innerHTML = format(target * eased);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
