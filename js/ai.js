// Lectura de capturas, recibos y archivos con Claude (o resultados de ejemplo en modo demo).
import { state, allCategories, visibleCategories } from './store.js';
import { CURRENCIES, PAYMENT_METHODS } from './data.js';
import { todayISO, toISO, addDays } from './format.js';

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.3.0/+esm';
const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';

export const MODELS = [
  { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', note: 'Recomendado: la mejor lectura' },
  { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', note: 'Más rápido y económico' },
  { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5', note: 'El más económico' },
];

export function hasApiKey() {
  return Boolean(state.settings.apiKey && state.settings.apiKey.trim());
}

function schema() {
  const categoryIds = allCategories().map((c) => c.id);
  return {
    type: 'object',
    additionalProperties: false,
    required: ['movimientos', 'nota'],
    properties: {
      movimientos: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['fecha', 'comercio', 'descripcion', 'monto', 'moneda', 'tipo', 'categoria', 'metodo_pago', 'confianza', 'pregunta', 'opciones'],
          properties: {
            fecha: { type: 'string', description: 'Fecha en formato AAAA-MM-DD' },
            comercio: { type: 'string', description: 'Nombre legible del comercio o concepto' },
            descripcion: { type: 'string', description: 'Texto original del movimiento' },
            monto: { type: 'number', description: 'Monto positivo' },
            moneda: { type: 'string', enum: CURRENCIES.map((c) => c.code) },
            tipo: { type: 'string', enum: ['gasto', 'ingreso', 'transferencia', 'pago_tarjeta'] },
            categoria: { type: 'string', enum: categoryIds },
            metodo_pago: { type: 'string', enum: [...PAYMENT_METHODS, ''] },
            confianza: { type: 'string', enum: ['alta', 'baja'] },
            pregunta: { type: 'string', description: 'Pregunta corta para la persona si la confianza es baja; vacía si no' },
            opciones: { type: 'array', items: { type: 'string', enum: categoryIds }, description: '2 o 3 categorías posibles si hay duda' },
          },
        },
      },
      nota: { type: 'string', description: 'Comentario breve si algo no se pudo leer; vacío si todo bien' },
    },
  };
}

function systemPrompt(mode) {
  const cats = visibleCategories().map((c) => `- ${c.id}: ${c.name}`).join('\n');
  return `Eres el asistente de captura de una app de control de gastos para México, Argentina y Venezuela.
Hoy es ${todayISO()}. La moneda principal de la persona es ${state.settings.currency}.

Tu trabajo: leer ${mode === 'receipt' ? 'un recibo o ticket de compra y devolver un solo movimiento con el total pagado' : 'capturas de movimientos bancarios, estados de cuenta o archivos exportados, y devolver cada movimiento por separado'}.

Reglas:
- monto siempre positivo. Si un movimiento es un abono, depósito o ingreso, usa tipo "ingreso".
- tipo "transferencia" para envíos entre cuentas propias o ahorro; "pago_tarjeta" para pagos a la tarjeta de crédito (no son gasto: el gasto ya se registró al comprar).
- Ignora líneas de saldo, totales del estado de cuenta y encabezados.
- Si falta el año en la fecha, usa el más reciente que no sea futuro.
- moneda: la que se vea en el documento; si no se ve, ${state.settings.currency}.
- comercio: un nombre limpio y legible (por ejemplo "WAL MART SUC 2231" → "Walmart").
- categoria: elige de esta lista según el comercio o concepto:
${cats}
- Si dudas de la categoría o de si es gasto, pon confianza "baja", escribe en pregunta algo corto y concreto en español con tuteo (por ejemplo: ¿“MERPAGO*JUAN” es comida o un pago a una persona?) y propone 2 o 3 categorías en opciones. Si no dudas, confianza "alta", pregunta vacía y opciones vacías.
- metodo_pago: solo si se deduce del documento; si no, vacío.`;
}

async function fileToBlocks(file) {
  const name = file.name.toLowerCase();
  if (file.type.startsWith('image/')) {
    const data = await imageToJpegBase64(file);
    return [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } }];
  }
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) {
    const data = await fileToBase64(file);
    return [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }];
  }
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const text = await spreadsheetToCsv(file);
    return [{ type: 'text', text: `Archivo ${file.name} (hoja de cálculo convertida a CSV):\n${text}` }];
  }
  const text = await file.text();
  return [{ type: 'text', text: `Archivo ${file.name}:\n${text}` }];
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Reduce la imagen a 1600 px de lado mayor para ahorrar costo sin perder legibilidad.
async function imageToJpegBase64(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('No se pudo cargar el lector de hojas de cálculo'));
    document.head.appendChild(s);
  });
}

async function spreadsheetToCsv(file) {
  if (!window.XLSX) await loadScript(XLSX_URL);
  const wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array' });
  return wb.SheetNames.map((n) => window.XLSX.utils.sheet_to_csv(wb.Sheets[n])).join('\n');
}

export class AiError extends Error {}

// Envía los archivos a Claude y devuelve { movimientos, nota }.
export async function extractWithClaude(files, mode, onStep = () => {}) {
  const { default: Anthropic } = await import(SDK_URL);
  const client = new Anthropic({ apiKey: state.settings.apiKey.trim(), dangerouslyAllowBrowser: true });

  const content = [];
  for (let i = 0; i < files.length; i++) {
    onStep(`Preparando ${i + 1} de ${files.length}…`);
    content.push(...(await fileToBlocks(files[i])));
  }
  content.push({ type: 'text', text: mode === 'receipt' ? 'Lee este recibo.' : `Lee todos los movimientos de ${files.length > 1 ? 'estos archivos' : 'este archivo'}.` });
  onStep(files.length > 1 ? `Leyendo ${files.length} archivos…` : 'Leyendo…');

  const params = {
    model: state.settings.model || 'claude-opus-5-5',
    max_tokens: 16000,
    system: systemPrompt(mode),
    messages: [{ role: 'user', content }],
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: schema() } },
  };

  let message;
  try {
    try {
      // Con respaldo automático del servidor si el modelo rechaza la solicitud.
      message = await client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
    } catch (err) {
      if (err instanceof Anthropic.BadRequestError) message = await client.messages.create(params);
      else throw err;
    }
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new AiError('La clave de API no es válida. Revísala en Ajustes.');
    if (err instanceof Anthropic.PermissionDeniedError) throw new AiError('Tu clave no tiene permiso para este modelo.');
    if (err instanceof Anthropic.RateLimitError) throw new AiError('Demasiadas solicitudes seguidas. Espera un momento y vuelve a intentar.');
    if (err instanceof Anthropic.BadRequestError) throw new AiError(`La solicitud no fue aceptada: ${err.message}`);
    if (err instanceof Anthropic.APIConnectionError) throw new AiError('Sin conexión con el servicio de IA.');
    if (err instanceof Anthropic.APIError) throw new AiError(`Error del servicio de IA (${err.status ?? 'sin código'}).`);
    throw err;
  }

  if (message.stop_reason === 'refusal') throw new AiError('La IA no pudo procesar este contenido.');
  if (message.stop_reason === 'max_tokens') throw new AiError('Hay demasiados movimientos en una sola carga. Divide los archivos en partes más pequeñas.');
  const text = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  try {
    return JSON.parse(text);
  } catch {
    throw new AiError('La respuesta de la IA no se pudo interpretar.');
  }
}

// Modo demo: resultados de ejemplo realistas sin llamar a la API.
export async function extractDemo(files, mode, onStep = () => {}) {
  for (let i = 0; i < files.length; i++) {
    onStep(`Leyendo ${i + 1} de ${files.length}…`);
    await wait(650);
  }
  const today = new Date();
  const d = (n) => toISO(addDays(today, -n));
  const cur = state.settings.currency;
  const k = { MXN: 1, USD: 0.06, EUR: 0.05, ARS: 60, VES: 3 }[cur] || 1;
  const m = (v) => Math.round(v * k * 100) / 100;
  const base = { moneda: cur, metodo_pago: '', pregunta: '', opciones: [], confianza: 'alta', tipo: 'gasto' };
  if (mode === 'receipt') {
    return { nota: '', movimientos: [{ ...base, fecha: d(0), comercio: 'Soriana Híper', descripcion: 'SORIANA HIPER SUC 118 · TOTAL', monto: m(1284.6), categoria: 'supermercado', metodo_pago: 'Débito' }] };
  }
  const list = [
    { fecha: d(0), comercio: 'OXXO', descripcion: 'OXXO PALMAS 1182', monto: m(87), categoria: 'supermercado' },
    { fecha: d(1), comercio: 'Cinépolis', descripcion: 'CINEPOLIS ONLINE', monto: m(312), categoria: 'entretenimiento' },
    { fecha: d(1), comercio: 'DiDi', descripcion: 'DIDI RIDES MX', monto: m(96.5), categoria: 'transporte' },
    { fecha: d(2), comercio: 'Farmacias del Ahorro', descripcion: 'FARM AHORRO 0921', monto: m(245), categoria: 'salud' },
    { fecha: d(2), comercio: 'MP*TIENDITA', descripcion: 'MERCADOPAGO*TIENDITA', monto: m(158), categoria: 'supermercado', confianza: 'baja', pregunta: '¿“MP*TIENDITA” es una compra de súper o de algo para la casa?', opciones: ['supermercado', 'hogar', 'otros'] },
    { fecha: d(3), comercio: 'Starbucks', descripcion: 'STARBUCKS REFORMA', monto: m(118), categoria: 'restaurantes' },
    { fecha: d(3), comercio: 'Amazon', descripcion: 'AMZN MKTP MX', monto: m(649), categoria: 'compras', confianza: 'baja', pregunta: '¿Esta compra en Amazon fue para la casa o personal?', opciones: ['hogar', 'compras', 'regalos'] },
    { fecha: d(4), comercio: 'Depósito nómina', descripcion: 'ABONO NOMINA', monto: m(18500), categoria: 'otros', tipo: 'ingreso' },
    { fecha: d(4), comercio: 'Transferencia a ahorro', descripcion: 'TRASPASO A CTA AHORRO', monto: m(2000), categoria: 'otros', tipo: 'transferencia' },
  ];
  // Repite un gasto existente para mostrar la detección de duplicados.
  const existing = state.expenses.filter((e) => e.status === 'confirmed').slice(-1)[0];
  if (existing) list.push({ fecha: existing.date, comercio: existing.merchant, descripcion: (existing.description || existing.merchant).toUpperCase(), monto: existing.amount, categoria: existing.categoryId, moneda: existing.currency });
  return { nota: '', movimientos: list.map((x) => ({ ...base, ...x })) };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
