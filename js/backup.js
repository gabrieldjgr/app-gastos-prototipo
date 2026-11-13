// Respaldo de datos: archivo diario en Descargas, envío con el menú de compartir y restauración.
// El archivo nunca incluye las claves de IA.
import { state, persist, restoreState } from './store.js';
import { todayISO } from './format.js';
import { APP_VERSION } from './version.js';

const APP_TAG = 'ritmo-respaldo';

// Metadatos del respaldo (viven en el estado, pero no se copian dentro del archivo).
export function backupMeta() {
  if (!state.backup) state.backup = { auto: true, lastFileDay: null, lastHash: null, lastSent: null };
  return state.backup;
}

// Copia de los datos sin claves, registros internos ni metadatos de respaldo.
function snapshot() {
  const { backup, ...data } = state;
  const settings = { ...data.settings, keys: {} };
  delete settings.aiLog;
  delete settings.modelLists;
  return { ...data, settings };
}

// Huella corta para saber si los datos cambiaron desde el último archivo.
function hash(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function backupFile() {
  const data = snapshot();
  const body = JSON.stringify({ app: APP_TAG, appVersion: APP_VERSION, createdAt: new Date().toISOString(), data });
  const name = `ritmo-respaldo-${todayISO()}.json`;
  // La huella solo mira los datos de la persona: los registros internos (aviso del día, etc.) cambian a diario.
  const { expenses, budgets, paymentMethods, customCategories, visibleCategories, costCenters, merchantRules, recurring } = data;
  const h = hash(JSON.stringify({ expenses, budgets, paymentMethods, customCategories, visibleCategories, costCenters, merchantRules, recurring }));
  return { file: new File([body], name, { type: 'application/json' }), hash: h };
}

function download(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// Descarga el respaldo ahora. Devuelve el nombre del archivo.
export function downloadBackup() {
  const { file, hash: h } = backupFile();
  download(file);
  const meta = backupMeta();
  meta.lastFileDay = todayISO();
  meta.lastHash = h;
  persist();
  return file.name;
}

// Respaldo diario automático: se llama tras un toque de la persona (los navegadores lo exigen para descargar).
// Solo guarda archivo si es un día nuevo y los datos cambiaron desde el último. Devuelve el nombre o null.
export function dailyBackupIfDue() {
  const meta = backupMeta();
  if (meta.auto === false || !state.onboarded || !state.expenses.length) return null;
  if (meta.lastFileDay === todayISO()) return null;
  const { file, hash: h } = backupFile();
  meta.lastFileDay = todayISO();
  if (h === meta.lastHash) { persist(); return null; }
  download(file);
  meta.lastHash = h;
  persist();
  return file.name;
}

// Envía el respaldo con el menú de compartir del teléfono (WhatsApp, Drive, correo…).
// Si el navegador no puede compartir archivos, lo descarga. Devuelve 'shared', 'downloaded' o 'cancelled'.
export async function shareBackup() {
  const { file } = backupFile();
  const meta = backupMeta();
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Respaldo de Ritmo', text: `Respaldo de Ritmo del ${todayISO()}` });
      meta.lastSent = todayISO();
      persist();
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
    }
  }
  download(file);
  meta.lastSent = todayISO();
  persist();
  return 'downloaded';
}

// Lee un archivo de respaldo y devuelve { data, summary } o lanza un error con mensaje claro.
export async function readBackup(file) {
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error('El archivo no es un respaldo de Ritmo (no se pudo leer).');
  }
  const data = parsed?.app === APP_TAG ? parsed.data : null;
  if (!data || !Array.isArray(data.expenses)) throw new Error('El archivo no es un respaldo de Ritmo.');
  return {
    data,
    summary: {
      created: parsed.createdAt ? new Date(parsed.createdAt) : null,
      appVersion: parsed.appVersion || '?',
      expenses: data.expenses.length,
      budgets: (data.budgets || []).length,
      methods: (data.paymentMethods || []).length,
    },
  };
}

// Reemplaza los datos actuales por los del respaldo, conservando las claves de IA y los metadatos de respaldo.
export function applyBackup(data) {
  const keep = { keys: state.settings.keys, backup: state.backup };
  restoreState(data);
  state.settings.keys = keep.keys || {};
  state.backup = keep.backup;
  persist();
}
