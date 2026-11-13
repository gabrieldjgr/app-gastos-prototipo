// Editor de imagen a pantalla completa: recortar y tapar datos sensibles antes de enviar a la IA.
// Todo ocurre en el dispositivo; el resultado es una imagen nueva con los recuadros "quemados".
import { icon } from './ui.js';

const MIN = 40; // tamaño mínimo del recorte en px de imagen
const HANDLE = 22; // radio de toque de las manijas en px de pantalla

// Devuelve una promesa con { file, edits } si se guardó, o null si se canceló.
export function openImageEditor(original, { edits = null, index = 0, total = 1 } = {}) {
  return new Promise(async (resolve) => {
    const bitmap = await createImageBitmap(original);
    const W = bitmap.width;
    const H = bitmap.height;
    let crop = edits?.crop ? { ...edits.crop } : { x: 0, y: 0, w: W, h: H };
    let boxes = edits?.boxes ? edits.boxes.map((b) => ({ ...b })) : [];
    let mode = boxes.length && !edits?.crop ? 'redact' : 'crop';
    let selected = -1;
    const history = [];
    const snapshot = () => history.push(JSON.stringify({ crop, boxes }));

    const layer = document.createElement('div');
    layer.className = 'img-editor';
    layer.innerHTML = `
      <header class="ie-top">
        <button class="ie-text-btn" data-ie="cancel">Cancelar</button>
        <span class="ie-count">${total > 1 ? `${index + 1} de ${total}` : 'Editar imagen'}</span>
        <button class="ie-text-btn strong" data-ie="done">${total > 1 && index < total - 1 ? 'Siguiente' : 'Listo'}</button>
      </header>
      <div class="ie-stage"><canvas></canvas><button class="ie-del" data-ie="del-box" hidden aria-label="Quitar recuadro">${icon('x')}</button></div>
      <p class="ie-hint"></p>
      <footer class="ie-bottom">
        <button class="ie-icon" data-ie="undo" aria-label="Deshacer">↶</button>
        <div class="seg ie-seg"><button data-mode="crop">Recortar</button><button data-mode="redact">Tapar</button></div>
        <button class="ie-icon" data-ie="reset" aria-label="Restablecer">⟲</button>
      </footer>`;
    document.getElementById('app').appendChild(layer);
    requestAnimationFrame(() => layer.classList.add('open'));

    const stage = layer.querySelector('.ie-stage');
    const canvas = layer.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const hint = layer.querySelector('.ie-hint');
    const delBtn = layer.querySelector('.ie-del');
    let view = { s: 1, ox: 0, oy: 0 }; // escala y desplazamiento imagen → pantalla

    const layout = () => {
      const r = stage.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      canvas.style.width = `${r.width}px`;
      canvas.style.height = `${r.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const pad = 18;
      const s = Math.min((r.width - pad * 2) / W, (r.height - pad * 2) / H);
      view = { s, ox: (r.width - W * s) / 2, oy: (r.height - H * s) / 2, cw: r.width, ch: r.height };
      draw();
    };

    const toScreen = (x, y) => [view.ox + x * view.s, view.oy + y * view.s];
    const toImage = (px, py) => [(px - view.ox) / view.s, (py - view.oy) / view.s];
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

    const draw = () => {
      const { s, ox, oy, cw, ch } = view;
      ctx.clearRect(0, 0, cw, ch);
      ctx.drawImage(bitmap, ox, oy, W * s, H * s);
      ctx.fillStyle = '#000';
      boxes.forEach((b) => ctx.fillRect(ox + b.x * s, oy + b.y * s, b.w * s, b.h * s));
      // Atenuar fuera del recorte.
      const [cx, cy] = toScreen(crop.x, crop.y);
      const cwid = crop.w * s;
      const chei = crop.h * s;
      ctx.fillStyle = mode === 'crop' ? 'rgba(10,8,20,.62)' : 'rgba(10,8,20,.8)';
      ctx.beginPath();
      ctx.rect(ox, oy, W * s, H * s);
      ctx.rect(cx, cy, cwid, chei);
      ctx.fill('evenodd');
      if (mode === 'crop') {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(cx, cy, cwid, chei);
        ctx.strokeStyle = 'rgba(255,255,255,.35)';
        ctx.lineWidth = 1;
        for (let i = 1; i < 3; i++) {
          ctx.beginPath(); ctx.moveTo(cx + (cwid * i) / 3, cy); ctx.lineTo(cx + (cwid * i) / 3, cy + chei); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(cx, cy + (chei * i) / 3); ctx.lineTo(cx + cwid, cy + (chei * i) / 3); ctx.stroke();
        }
        // Manijas en L en las esquinas y barras en los lados.
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        const L = Math.min(22, cwid / 3, chei / 3);
        for (const [x, y, dx, dy] of [[cx, cy, 1, 1], [cx + cwid, cy, -1, 1], [cx, cy + chei, 1, -1], [cx + cwid, cy + chei, -1, -1]]) {
          ctx.beginPath(); ctx.moveTo(x + dx * L, y); ctx.lineTo(x, y); ctx.lineTo(x, y + dy * L); ctx.stroke();
        }
        const M = Math.min(14, cwid / 6, chei / 6);
        ctx.beginPath(); ctx.moveTo(cx + cwid / 2 - M, cy); ctx.lineTo(cx + cwid / 2 + M, cy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + cwid / 2 - M, cy + chei); ctx.lineTo(cx + cwid / 2 + M, cy + chei); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, cy + chei / 2 - M); ctx.lineTo(cx, cy + chei / 2 + M); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + cwid, cy + chei / 2 - M); ctx.lineTo(cx + cwid, cy + chei / 2 + M); ctx.stroke();
      } else if (selected >= 0 && boxes[selected]) {
        const b = boxes[selected];
        ctx.strokeStyle = '#9D8CFF';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.strokeRect(ox + b.x * s - 2, oy + b.y * s - 2, b.w * s + 4, b.h * s + 4);
        ctx.setLineDash([]);
      }
      // Botón para quitar el recuadro seleccionado.
      if (mode === 'redact' && selected >= 0 && boxes[selected]) {
        const b = boxes[selected];
        const [bx, by] = toScreen(b.x + b.w, b.y);
        delBtn.hidden = false;
        delBtn.style.left = `${clamp(bx, 16, cw - 16)}px`;
        delBtn.style.top = `${clamp(by, 16, ch - 16)}px`;
      } else delBtn.hidden = true;
      layer.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
      layer.querySelector('[data-ie="undo"]').disabled = !history.length;
      hint.textContent = mode === 'crop'
        ? 'Arrastra las esquinas o los lados para recortar.'
        : boxes.length ? 'Toca un recuadro para moverlo o quitarlo. Arrastra para tapar más.' : 'Arrastra sobre lo que quieras ocultar: números de cuenta, nombres, saldos.';
    };

    // ---------- Gestos ----------
    let drag = null;
    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    const hitCrop = (px, py) => {
      const [x1, y1] = toScreen(crop.x, crop.y);
      const [x2, y2] = toScreen(crop.x + crop.w, crop.y + crop.h);
      const nearL = Math.abs(px - x1) < HANDLE; const nearR = Math.abs(px - x2) < HANDLE;
      const nearT = Math.abs(py - y1) < HANDLE; const nearB = Math.abs(py - y2) < HANDLE;
      const inX = px > x1 - HANDLE && px < x2 + HANDLE; const inY = py > y1 - HANDLE && py < y2 + HANDLE;
      if (!inX || !inY) return null;
      const edges = `${nearT ? 't' : nearB ? 'b' : ''}${nearL ? 'l' : nearR ? 'r' : ''}`;
      if (edges) return edges;
      if (px > x1 && px < x2 && py > y1 && py < y2) return 'move';
      return null;
    };

    canvas.addEventListener('pointerdown', (e) => {
      const [px, py] = pos(e);
      const [ix, iy] = toImage(px, py);
      if (mode === 'crop') {
        const h = hitCrop(px, py);
        if (!h) return;
        snapshot();
        drag = { type: 'crop', h, start: [ix, iy], orig: { ...crop } };
      } else {
        const i = boxes.findIndex((b) => ix >= b.x && ix <= b.x + b.w && iy >= b.y && iy <= b.y + b.h);
        snapshot();
        if (i >= 0) { selected = i; drag = { type: 'move-box', i, start: [ix, iy], orig: { ...boxes[i] } }; }
        else {
          selected = -1;
          const x = clamp(ix, 0, W); const y = clamp(iy, 0, H);
          boxes.push({ x, y, w: 0, h: 0 });
          drag = { type: 'new-box', i: boxes.length - 1, start: [x, y] };
        }
      }
      canvas.setPointerCapture(e.pointerId);
      draw();
    });

    canvas.addEventListener('pointermove', (e) => {
      const [px, py] = pos(e);
      if (!drag) {
        if (mode === 'crop') {
          const h = hitCrop(px, py);
          canvas.style.cursor = !h ? 'default' : h === 'move' ? 'move' : ({ t: 'ns', b: 'ns', l: 'ew', r: 'ew', tl: 'nwse', br: 'nwse', tr: 'nesw', bl: 'nesw' })[h] + '-resize';
        } else canvas.style.cursor = 'crosshair';
        return;
      }
      const [ix, iy] = toImage(px, py);
      const dx = ix - drag.start[0];
      const dy = iy - drag.start[1];
      if (drag.type === 'crop') {
        const o = drag.orig;
        let { x, y, w, h } = o;
        if (drag.h === 'move') {
          x = clamp(o.x + dx, 0, W - o.w); y = clamp(o.y + dy, 0, H - o.h);
        } else {
          if (drag.h.includes('l')) { x = clamp(o.x + dx, 0, o.x + o.w - MIN); w = o.x + o.w - x; }
          if (drag.h.includes('r')) { w = clamp(o.w + dx, MIN, W - o.x); }
          if (drag.h.includes('t')) { y = clamp(o.y + dy, 0, o.y + o.h - MIN); h = o.y + o.h - y; }
          if (drag.h.includes('b')) { h = clamp(o.h + dy, MIN, H - o.y); }
        }
        crop = { x, y, w, h };
      } else if (drag.type === 'move-box') {
        const o = drag.orig;
        boxes[drag.i] = { ...o, x: clamp(o.x + dx, 0, W - o.w), y: clamp(o.y + dy, 0, H - o.h) };
      } else {
        const [sx, sy] = drag.start;
        const ex = clamp(ix, 0, W); const ey = clamp(iy, 0, H);
        boxes[drag.i] = { x: Math.min(sx, ex), y: Math.min(sy, ey), w: Math.abs(ex - sx), h: Math.abs(ey - sy) };
      }
      draw();
    });

    const endDrag = () => {
      if (!drag) return;
      if (drag.type === 'new-box') {
        const b = boxes[drag.i];
        // Un toque sin arrastre no crea recuadro.
        if (b.w * view.s < 8 || b.h * view.s < 8) { boxes.splice(drag.i, 1); history.pop(); } else selected = drag.i;
      }
      if (drag.type === 'move-box') {
        const o = drag.orig; const b = boxes[drag.i];
        if (o.x === b.x && o.y === b.y) history.pop();
      }
      drag = null;
      draw();
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    // ---------- Botones ----------
    const finish = (result) => {
      window.removeEventListener('resize', layout);
      document.removeEventListener('keydown', onKey, true);
      layer.classList.remove('open');
      setTimeout(() => layer.remove(), 250);
      bitmap.close?.();
      resolve(result);
    };

    const render = async () => {
      const full = crop.x === 0 && crop.y === 0 && crop.w === W && crop.h === H;
      if (full && !boxes.length) return { file: original, edits: null };
      const scale = Math.min(1, 2400 / Math.max(crop.w, crop.h));
      const out = document.createElement('canvas');
      out.width = Math.round(crop.w * scale);
      out.height = Math.round(crop.h * scale);
      const c = out.getContext('2d');
      c.scale(scale, scale);
      c.translate(-crop.x, -crop.y);
      c.drawImage(bitmap, 0, 0);
      c.fillStyle = '#000';
      boxes.forEach((b) => c.fillRect(b.x, b.y, b.w, b.h));
      const blob = await new Promise((r) => out.toBlob(r, 'image/jpeg', 0.92));
      const name = (original.name || 'imagen').replace(/\.[^.]+$/, '') + '-editada.jpg';
      return { file: new File([blob], name, { type: 'image/jpeg' }), edits: { crop: full ? null : crop, boxes } };
    };

    layer.addEventListener('click', async (e) => {
      const m = e.target.closest('[data-mode]');
      if (m) { mode = m.dataset.mode; selected = -1; draw(); return; }
      const act = e.target.closest('[data-ie]')?.dataset.ie;
      if (act === 'cancel') finish(null);
      if (act === 'undo' && history.length) {
        ({ crop, boxes } = JSON.parse(history.pop()));
        selected = -1;
        draw();
      }
      if (act === 'reset') {
        snapshot();
        crop = { x: 0, y: 0, w: W, h: H }; boxes = []; selected = -1;
        draw();
      }
      if (act === 'del-box' && selected >= 0) { snapshot(); boxes.splice(selected, 1); selected = -1; draw(); }
      if (act === 'done') {
        e.target.disabled = true;
        finish(await render());
      }
    });

    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); finish(null); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && mode === 'redact' && selected >= 0) { snapshot(); boxes.splice(selected, 1); selected = -1; draw(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && history.length) { ({ crop, boxes } = JSON.parse(history.pop())); draw(); }
    };
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', layout);
    requestAnimationFrame(layout);
  });
}
