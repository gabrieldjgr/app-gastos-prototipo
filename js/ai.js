// Lectura de capturas, recibos y archivos con IA (Claude, Gemini u OpenAI),
// o resultados de ejemplo en modo demo.
import { state, save, allCategories, visibleCategories, paymentMethods } from './store.js';
import { CURRENCIES } from './data.js';
import { todayISO, toISO, addDays } from './format.js';

const ANTHROPIC_SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.3.0/+esm';
const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';

// Proveedores disponibles. Los modelos se pueden cambiar en Ajustes (incluido uno escrito a mano).
export const PROVIDERS = [
  {
    id: 'anthropic', name: 'Claude', company: 'Anthropic', keyHint: 'sk-ant-…', keyUrl: 'console.anthropic.com',
    privacy: 'Anthropic no usa lo que envías por la API para entrenar sus modelos. Se paga por uso.',
    models: [
      { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', note: 'La mejor lectura' },
      { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', note: 'Rápido y más económico' },
      { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5', note: 'El más económico' },
    ],
  },
  {
    id: 'google', name: 'Gemini', company: 'Google', keyHint: 'AIza…', keyUrl: 'aistudio.google.com',
    privacy: 'Tiene un nivel gratuito, pero en ese nivel Google puede usar lo que envías para mejorar sus productos. Tapa los datos sensibles antes de enviar.',
    models: [
      { id: 'gemini-flash-latest', name: 'Gemini Flash (el más reciente)', note: 'Rápido · con nivel gratuito' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', note: 'Rápido · con nivel gratuito' },
      { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite', note: 'El más económico' },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', note: 'Mejor lectura, más lento' },
    ],
  },
  {
    id: 'openai', name: 'ChatGPT', company: 'OpenAI', keyHint: 'sk-…', keyUrl: 'platform.openai.com',
    privacy: 'OpenAI no usa lo que envías por la API para entrenar por defecto. Se paga por uso.',
    models: [
      { id: 'gpt-5', name: 'GPT-5', note: 'La mejor lectura' },
      { id: 'gpt-5-mini', name: 'GPT-5 mini', note: 'Rápido y económico' },
      { id: 'gpt-5-nano', name: 'GPT-5 nano', note: 'El más económico' },
    ],
  },
];

export function providerById(id) {
  return PROVIDERS.find((p) => p.id === id) || PROVIDERS[0];
}

export function currentProvider() {
  return providerById(state.settings.provider);
}

export function currentModel() {
  const p = currentProvider();
  return (state.settings.models || {})[p.id] || p.models[0].id;
}

// Modelos a mostrar: la lista real que devolvió el proveedor (si ya se consultó) o la lista sugerida.
export function modelsFor(providerId) {
  const cached = (state.settings.modelLists || {})[providerId];
  return cached?.models?.length ? cached.models : providerById(providerId).models;
}

export function modelLabel(providerId, modelId) {
  return modelsFor(providerId).find((m) => m.id === modelId)?.name || providerById(providerId).models.find((m) => m.id === modelId)?.name || modelId;
}

export function hasApiKey(providerId = state.settings.provider) {
  return Boolean(((state.settings.keys || {})[providerId] || '').trim());
}

function apiKey() {
  return (state.settings.keys[state.settings.provider] || '').trim();
}

// ---------------------------------------------------------------- Esquema y prompt

function schema() {
  const categoryIds = allCategories().map((c) => c.id);
  const methods = paymentMethods().map((m) => m.name);
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
          required: ['fecha', 'comercio', 'descripcion', 'monto', 'moneda', 'tipo', 'categoria', 'metodo_pago', 'ultimos_digitos', 'confianza', 'pregunta', 'opciones'],
          properties: {
            fecha: { type: 'string', description: 'Fecha en formato AAAA-MM-DD' },
            comercio: { type: 'string', description: 'Nombre legible del comercio o concepto' },
            descripcion: { type: 'string', description: 'Texto original del movimiento' },
            monto: { type: 'number', description: 'Monto positivo' },
            moneda: { type: 'string', enum: CURRENCIES.map((c) => c.code) },
            tipo: { type: 'string', enum: ['gasto', 'ingreso', 'transferencia', 'pago_tarjeta'] },
            categoria: { type: 'string', enum: categoryIds },
            metodo_pago: { type: 'string', enum: [...methods, 'ninguno'], description: 'Uno de los medios de pago de la persona, o "ninguno" si no se deduce' },
            ultimos_digitos: { type: 'string', description: 'Últimos 4 dígitos de la tarjeta o cuenta si se ven en el documento (solo números); vacío si no se ven' },
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

const TYPE_LABEL = { credito: 'tarjeta de crédito', debito: 'tarjeta de débito', cuenta: 'cuenta bancaria', efectivo: 'efectivo', billetera: 'billetera digital' };

function systemPrompt(mode, account) {
  const cats = visibleCategories().map((c) => `- ${c.id}: ${c.name}`).join('\n');
  const methods = paymentMethods().map((m) => `- "${m.name}": ${TYPE_LABEL[m.type] || m.type}${m.last4 ? `, termina en ${m.last4}` : ''}${m.owner ? `, de ${m.owner}` : ''}`).join('\n');
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
- metodo_pago: estos son los medios de pago de la persona:
${methods || '(no tiene medios configurados)'}
${account ? `La persona indicó que estos archivos son de "${account}": úsalo para todos los movimientos salvo que el documento diga claramente otra cosa.` : 'Elige el que corresponda según el banco, el tipo de tarjeta o los últimos dígitos que se vean. Si no se puede deducir, usa "ninguno".'}
- ultimos_digitos: si el documento muestra los últimos dígitos de la tarjeta o cuenta (por ejemplo ****4532 o terminación 4532), escríbelos aunque no coincidan con ningún medio de la persona. No inventes dígitos.
- Algunas partes de las imágenes pueden estar tapadas con recuadros negros a propósito: ignóralas.`;
}

// ---------------------------------------------------------------- Archivos

// Convierte cada archivo en una pieza neutra: imagen, pdf o texto.
async function preparePart(file) {
  const name = (file.name || '').toLowerCase();
  if (file.type.startsWith('image/')) return { kind: 'image', mime: 'image/jpeg', data: await imageToJpegBase64(file) };
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return { kind: 'pdf', mime: 'application/pdf', data: await fileToBase64(file), name: file.name };
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) return { kind: 'text', text: `Archivo ${file.name} (hoja de cálculo convertida a CSV):\n${await spreadsheetToCsv(file)}` };
  return { kind: 'text', text: `Archivo ${file.name}:\n${await file.text()}` };
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

// El modelo elegido ya no existe o no está disponible para la clave.
class ModelGone extends AiError {}

// Falla temporal del proveedor (servidores saturados o sin respuesta a tiempo). timeout = true si no respondió.
class Busy extends AiError {
  constructor(message, { timeout = false } = {}) { super(message); this.timeout = timeout; }
}

// Tiempo máximo de espera por intento de lectura.
const AI_TIMEOUT_MS = 90000;
// Esperas antes de cada reintento cuando el proveedor está saturado.
const RETRY_WAITS_MS = [3000, 8000];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const busyMessage = (name) => `Los servidores de ${name} están saturados en este momento. No es un problema de tu clave: intenta en unos minutos o elige otro modelo en Ajustes → Modelo.`;
const timeoutMessage = () => `La IA tardó demasiado en responder (más de ${AI_TIMEOUT_MS / 1000} s). Intenta de nuevo; si pasa seguido, sube menos archivos a la vez o elige otro modelo.`;

// Reintenta solo las saturaciones (no los tiempos agotados, que ya costaron 90 s).
async function runWithRetry(run, req, onStep, name) {
  for (let i = 0; ; i++) {
    try {
      return await run(req);
    } catch (err) {
      if (!(err instanceof Busy) || err.timeout || i >= RETRY_WAITS_MS.length) throw err;
      onStep(`${name} está saturado. Reintento ${i + 1} de ${RETRY_WAITS_MS.length} en ${RETRY_WAITS_MS[i] / 1000} s…`);
      await sleep(RETRY_WAITS_MS[i]);
      onStep(`Leyendo con ${name}…`);
    }
  }
}

// ---------------------------------------------------------------- Entrada principal

// Envía los archivos a la IA elegida y devuelve { movimientos, nota }.
export async function extractWithAI(files, mode, onStep = () => {}, { account = '' } = {}) {
  const parts = [];
  for (let i = 0; i < files.length; i++) {
    onStep(`Preparando ${i + 1} de ${files.length}…`);
    parts.push(await preparePart(files[i]));
  }
  const ask = mode === 'receipt' ? 'Lee este recibo.' : `Lee todos los movimientos de ${files.length > 1 ? 'estos archivos' : 'este archivo'}.`;
  const p = currentProvider();
  onStep(`${files.length > 1 ? `Leyendo ${files.length} archivos` : 'Leyendo'} con ${p.name}…`);
  const req = { system: systemPrompt(mode, account), parts, ask, model: currentModel(), key: apiKey() };
  const run = { anthropic: viaAnthropic, google: viaGemini, openai: viaOpenAI }[p.id];
  let text;
  let modelChanged = null;
  try {
    text = await runWithRetry(run, req, onStep, p.name);
  } catch (err) {
    const gone = err instanceof ModelGone;
    // Tras un tiempo agotado no se prueba otro modelo: serían otros 90 s de espera.
    if (!gone && !(err instanceof Busy && !err.timeout)) throw err;
    // Modelo retirado o saturado: se prueba una vez con otro modelo disponible para esta clave.
    onStep(gone ? `El modelo ${req.model} ya no está disponible. Buscando otro…` : `${p.name} sigue sin responder. Probando con otro modelo…`);
    const models = await listModels(p.id).catch(() => []);
    const others = models.filter((m) => m.id !== req.model);
    // Ante saturación se prefiere un modelo que no sea "pro" (tienen límites más bajos).
    const best = gone ? others[0] : (others.find((m) => !/pro/.test(m.id)) || others[0]);
    if (!best) throw err;
    if (gone) {
      // Retirado: el cambio queda guardado. Saturado: solo por esta vez.
      state.settings.models = { ...state.settings.models, [p.id]: best.id };
      save();
    }
    modelChanged = { from: req.model, to: best.name, reason: gone ? 'gone' : 'busy' };
    onStep(`Leyendo con ${best.name}…`);
    try {
      text = await run({ ...req, model: best.id });
    } catch (err2) {
      // Si el respaldo también está saturado, se muestra el mensaje original.
      throw err2 instanceof Busy ? err : err2;
    }
  }
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    throw new AiError('La respuesta de la IA no se pudo interpretar.');
  }
  for (const m of result.movimientos || []) {
    if (m.metodo_pago === 'ninguno') m.metodo_pago = '';
    m.ultimos_digitos = String(m.ultimos_digitos || '').replace(/\D/g, '').slice(-4);
  }
  if (modelChanged) result.modelChanged = modelChanged;
  return result;
}

// ---------------------------------------------------------------- Claude (SDK oficial)

async function viaAnthropic({ system, parts, ask, model, key }) {
  const { default: Anthropic } = await import(ANTHROPIC_SDK_URL);
  // Los reintentos los maneja runWithRetry, para mostrar el avance en pantalla.
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, timeout: AI_TIMEOUT_MS, maxRetries: 0 });
  const content = parts.map((x) => (x.kind === 'image'
    ? { type: 'image', source: { type: 'base64', media_type: x.mime, data: x.data } }
    : x.kind === 'pdf'
      ? { type: 'document', source: { type: 'base64', media_type: x.mime, data: x.data } }
      : { type: 'text', text: x.text }));
  content.push({ type: 'text', text: ask });
  const params = {
    model,
    max_tokens: 16000,
    system,
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
    if (err instanceof Anthropic.AuthenticationError) throw new AiError('La clave de Anthropic no es válida. Revísala en Ajustes.');
    if (err instanceof Anthropic.PermissionDeniedError) throw new AiError('Tu clave no tiene permiso para este modelo.');
    if (err instanceof Anthropic.RateLimitError) throw new AiError('Demasiadas solicitudes seguidas. Espera un momento y vuelve a intentar.');
    if (err instanceof Anthropic.BadRequestError) throw new AiError(`La solicitud no fue aceptada: ${err.message}`);
    if (err instanceof Anthropic.APIConnectionTimeoutError) throw new Busy(timeoutMessage(), { timeout: true });
    if (err instanceof Anthropic.APIConnectionError) throw new AiError('Sin conexión con el servicio de IA.');
    if (err instanceof Anthropic.APIError && err.status >= 500) throw new Busy(busyMessage('Claude'));
    if (err instanceof Anthropic.APIError) throw new AiError(`Error del servicio de IA (${err.status ?? 'sin código'}).`);
    throw err;
  }
  if (message.stop_reason === 'refusal') throw new AiError('La IA no pudo procesar este contenido.');
  if (message.stop_reason === 'max_tokens') throw tooMany();
  return message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
}

// ---------------------------------------------------------------- Gemini (REST)

// Gemini acepta un subconjunto de JSON Schema: sin additionalProperties ni valores vacíos en enum.
function geminiSchema(node) {
  if (Array.isArray(node)) return node.map(geminiSchema);
  if (!node || typeof node !== 'object') return node;
  const out = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === 'additionalProperties') continue;
    if (k === 'enum') out.enum = v.filter((x) => x !== '');
    else if (k === 'properties') out.properties = Object.fromEntries(Object.entries(v).map(([pk, pv]) => [pk, geminiSchema(pv)]));
    else out[k] = geminiSchema(v);
  }
  return out;
}

async function viaGemini({ system, parts, ask, model, key }) {
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{
      role: 'user',
      parts: [...parts.map((x) => (x.kind === 'text' ? { text: x.text } : { inlineData: { mimeType: x.mime, data: x.data } })), { text: ask }],
    }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: geminiSchema(schema()), maxOutputTokens: 16000 },
  };
  const res = await safeFetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body),
  }, AI_TIMEOUT_MS);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error?.message || '';
    if (res.status === 400 && /api key/i.test(msg)) throw new AiError('La clave de Google no es válida. Revísala en Ajustes.');
    if (res.status === 403) throw new AiError('Tu clave de Google no tiene permiso para este modelo.');
    if (res.status === 404) throw new ModelGone(`El modelo “${model}” no está disponible para tu clave${msg ? ` (${msg})` : ''}. Elige otro en Ajustes → Modelo.`);
    if (res.status === 429) throw new AiError('Llegaste al límite de uso de Gemini (el nivel gratuito tiene un tope por minuto y por día). Espera un poco.');
    if (res.status >= 500) throw new Busy(busyMessage('Gemini'));
    throw new AiError(`Error de Gemini (${res.status})${msg ? `: ${msg}` : ''}`);
  }
  if (data.promptFeedback?.blockReason) throw new AiError('Gemini no pudo procesar este contenido.');
  const cand = data.candidates?.[0];
  if (!cand) throw new AiError('Gemini no devolvió respuesta.');
  if (cand.finishReason === 'MAX_TOKENS') throw tooMany();
  if (cand.finishReason && !['STOP', 'FINISH_REASON_UNSPECIFIED'].includes(cand.finishReason)) throw new AiError('Gemini no pudo procesar este contenido.');
  return (cand.content?.parts || []).map((x) => x.text || '').join('');
}

// ---------------------------------------------------------------- OpenAI (REST)

async function viaOpenAI({ system, parts, ask, model, key }) {
  const content = parts.map((x) => (x.kind === 'image'
    ? { type: 'image_url', image_url: { url: `data:${x.mime};base64,${x.data}` } }
    : x.kind === 'pdf'
      ? { type: 'file', file: { filename: x.name || 'archivo.pdf', file_data: `data:${x.mime};base64,${x.data}` } }
      : { type: 'text', text: x.text }));
  content.push({ type: 'text', text: ask });
  const res = await safeFetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content }],
      response_format: { type: 'json_schema', json_schema: { name: 'movimientos', strict: true, schema: schema() } },
      max_completion_tokens: 16000,
    }),
  }, AI_TIMEOUT_MS);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error?.message || '';
    if (res.status === 401) throw new AiError('La clave de OpenAI no es válida. Revísala en Ajustes.');
    if (res.status === 403) throw new AiError('Tu clave de OpenAI no tiene permiso para este modelo.');
    if (res.status === 404 || data.error?.code === 'model_not_found') throw new ModelGone(`El modelo “${model}” no está disponible para tu clave. Elige otro en Ajustes → Modelo.`);
    if (res.status >= 500) throw new Busy(busyMessage('OpenAI'));
    if (res.status === 429) throw new AiError(data.error?.code === 'insufficient_quota' ? 'Tu cuenta de OpenAI no tiene saldo.' : 'Demasiadas solicitudes seguidas. Espera un momento.');
    throw new AiError(`Error de OpenAI (${res.status})${msg ? `: ${msg}` : ''}`);
  }
  const choice = data.choices?.[0];
  if (!choice) throw new AiError('OpenAI no devolvió respuesta.');
  if (choice.message?.refusal) throw new AiError('La IA no pudo procesar este contenido.');
  if (choice.finish_reason === 'length') throw tooMany();
  return choice.message?.content || '';
}

// ---------------------------------------------------------------- Modelos disponibles

const SKIP_GEMINI = /embedding|tts|image|live|audio|native|computer|robotics|learnlm|gemma|aqa|exp-|veo|imagen|nano-banana/;
const SKIP_OPENAI = /audio|realtime|tts|transcribe|search|image|instruct|codex|chat-latest|-\d{4}-\d{2}-\d{2}|oss|preview/;

function geminiNote(id) {
  if (/lite/.test(id)) return 'El más económico';
  if (/pro/.test(id)) return 'Mejor lectura, más lento';
  return 'Rápido · recomendado';
}

// Pide al proveedor la lista real de modelos que acepta esta clave, ordenada de mejor a peor para leer movimientos.
export async function listModels(providerId) {
  const key = ((state.settings.keys || {})[providerId] || '').trim();
  if (!key) return [];
  let models = [];
  if (providerId === 'google') {
    const res = await safeFetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key } });
    if (!res.ok) throw new AiError(`Error ${res.status}`);
    const data = await res.json();
    models = (data.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => ({ id: m.name.replace(/^models\//, ''), name: m.displayName || m.name }))
      .filter((m) => m.id.startsWith('gemini') && !SKIP_GEMINI.test(m.id))
      .map((m) => {
        const ver = parseFloat((m.id.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || '0');
        const kind = /lite/.test(m.id) ? 200 : /flash/.test(m.id) ? 300 : /pro/.test(m.id) ? 150 : 100;
        const alias = m.id === 'gemini-flash-latest' ? 2000 : /latest/.test(m.id) ? 500 : 0;
        const unstable = /preview|exp/.test(m.id) ? 100 : 0;
        return { ...m, note: geminiNote(m.id), score: alias + kind + ver * 10 - unstable };
      });
  } else if (providerId === 'openai') {
    const res = await safeFetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new AiError(`Error ${res.status}`);
    const data = await res.json();
    models = (data.data || [])
      .filter((m) => /^gpt-\d/.test(m.id) && !SKIP_OPENAI.test(m.id))
      .map((m) => {
        const ver = parseFloat((m.id.match(/^gpt-(\d+(?:\.\d+)?)/) || [])[1] || '0');
        const size = /nano/.test(m.id) ? 0 : /mini/.test(m.id) ? 1 : 2;
        const name = m.id.replace(/^gpt-/, 'GPT-').replace(/-mini/, ' mini').replace(/-nano/, ' nano');
        return { id: m.id, name, note: size === 2 ? 'La mejor lectura' : size === 1 ? 'Rápido y económico' : 'El más económico', score: ver * 10 + size };
      });
  } else {
    const { default: Anthropic } = await import(ANTHROPIC_SDK_URL);
    const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
    const page = await client.models.list({ limit: 50 });
    models = (page.data || []).map((m, i) => ({ id: m.id, name: m.display_name || m.id, note: /haiku/.test(m.id) ? 'El más económico' : /sonnet/.test(m.id) ? 'Rápido y más económico' : 'La mejor lectura', score: 1000 - i + (/opus/.test(m.id) ? 50 : 0) }));
  }
  models.sort((a, b) => b.score - a.score);
  const clean = models.map(({ score, ...m }) => m);
  state.settings.modelLists = { ...state.settings.modelLists, [providerId]: { at: Date.now(), models: clean } };
  save();
  return clean;
}

// Revisa que el modelo elegido siga disponible; si no, elige el mejor. Devuelve { from, to } si cambió.
export async function ensureModel(providerId) {
  const models = await listModels(providerId);
  if (!models.length) return null;
  const current = (state.settings.models || {})[providerId] || providerById(providerId).models[0].id;
  if (models.some((m) => m.id === current)) return null;
  state.settings.models = { ...state.settings.models, [providerId]: models[0].id };
  save();
  return { from: current, to: models[0].name };
}

// ---------------------------------------------------------------- Probar conexión

// Consulta la lista de modelos del proveedor: valida la clave sin costo de uso.
export async function testConnection(providerId) {
  const key = ((state.settings.keys || {})[providerId] || '').trim();
  if (!key) throw new AiError('Primero pega tu clave.');
  if (providerId === 'anthropic') {
    const { default: Anthropic } = await import(ANTHROPIC_SDK_URL);
    const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
    try {
      await client.models.list({ limit: 1 });
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) throw new AiError('Clave inválida');
      if (err instanceof Anthropic.APIConnectionError) throw new AiError('Sin conexión');
      throw new AiError(`Error ${err.status ?? ''}`.trim());
    }
    return true;
  }
  const res = providerId === 'google'
    ? await safeFetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', { headers: { 'x-goog-api-key': key } })
    : await safeFetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` } });
  if (res.ok) return true;
  if ([400, 401, 403].includes(res.status)) throw new AiError('Clave inválida');
  throw new AiError(`Error ${res.status}`);
}

// fetch con tiempo límite opcional: si se agota, lanza Busy (timeout) en vez de quedarse esperando.
async function safeFetch(url, opts, timeoutMs = 0) {
  if (!timeoutMs) {
    try {
      return await fetch(url, opts);
    } catch {
      throw new AiError('Sin conexión con el servicio de IA.');
    }
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    // El cuerpo también se lee dentro del tiempo límite.
    const body = await res.text();
    return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
  } catch {
    if (ctrl.signal.aborted) throw new Busy(timeoutMessage(), { timeout: true });
    throw new AiError('Sin conexión con el servicio de IA.');
  } finally {
    clearTimeout(timer);
  }
}

const tooMany = () => new AiError('Hay demasiados movimientos en una sola carga. Divide los archivos en partes más pequeñas.');

// ---------------------------------------------------------------- Demo

// Modo demo: resultados de ejemplo realistas sin llamar a ninguna API.
export async function extractDemo(files, mode, onStep = () => {}, { account = '' } = {}) {
  for (let i = 0; i < files.length; i++) {
    onStep(`Leyendo ${i + 1} de ${files.length}…`);
    await wait(650);
  }
  const today = new Date();
  const d = (n) => toISO(addDays(today, -n));
  const cur = state.settings.currency;
  const k = { MXN: 1, USD: 0.06, EUR: 0.05, ARS: 60, VES: 3 }[cur] || 1;
  const m = (v) => Math.round(v * k * 100) / 100;
  const methods = paymentMethods();
  const card = account || methods.find((x) => x.type === 'credito')?.name || '';
  const debit = methods.find((x) => x.type === 'debito' || x.type === 'cuenta')?.name || '';
  const known = methods.find((x) => x.name === card)?.last4 || '';
  const base = { moneda: cur, metodo_pago: card, ultimos_digitos: known, pregunta: '', opciones: [], confianza: 'alta', tipo: 'gasto' };
  // Una tarjeta que la persona no tiene registrada, para mostrar el aviso de tarjeta nueva.
  const unknown = { metodo_pago: '', ultimos_digitos: '3391' };
  if (mode === 'receipt') {
    return { nota: '', movimientos: [{ ...base, fecha: d(0), comercio: 'Soriana Híper', descripcion: 'SORIANA HIPER SUC 118 · TOTAL', monto: m(1284.6), categoria: 'supermercado', metodo_pago: debit }] };
  }
  const list = [
    { fecha: d(0), comercio: 'OXXO', descripcion: 'OXXO PALMAS 1182', monto: m(87), categoria: 'supermercado' },
    { fecha: d(1), comercio: 'Cinépolis', descripcion: 'CINEPOLIS ONLINE', monto: m(312), categoria: 'entretenimiento', ...unknown },
    { fecha: d(1), comercio: 'DiDi', descripcion: 'DIDI RIDES MX', monto: m(96.5), categoria: 'transporte' },
    { fecha: d(2), comercio: 'Farmacias del Ahorro', descripcion: 'FARM AHORRO 0921', monto: m(245), categoria: 'salud' },
    { fecha: d(2), comercio: 'MP*TIENDITA', descripcion: 'MERCADOPAGO*TIENDITA', monto: m(158), categoria: 'supermercado', confianza: 'baja', pregunta: '¿“MP*TIENDITA” es una compra de súper o de algo para la casa?', opciones: ['supermercado', 'hogar', 'otros'] },
    { fecha: d(3), comercio: 'Starbucks', descripcion: 'STARBUCKS REFORMA', monto: m(118), categoria: 'restaurantes', ...unknown },
    { fecha: d(3), comercio: 'Amazon', descripcion: 'AMZN MKTP MX', monto: m(649), categoria: 'compras', confianza: 'baja', pregunta: '¿Esta compra en Amazon fue para la casa o personal?', opciones: ['hogar', 'compras', 'regalos'] },
    { fecha: d(3), comercio: 'Liverpool', descripcion: 'LIVERPOOL SANTA FE', monto: m(4890), categoria: 'compras' },
    { fecha: d(4), comercio: 'Depósito nómina', descripcion: 'ABONO NOMINA', monto: m(18500), categoria: 'otros', tipo: 'ingreso', metodo_pago: debit },
    { fecha: d(4), comercio: 'Transferencia a ahorro', descripcion: 'TRASPASO A CTA AHORRO', monto: m(2000), categoria: 'otros', tipo: 'transferencia', metodo_pago: debit },
  ];
  // Repite un gasto existente para mostrar la detección de duplicados.
  const existing = state.expenses.filter((e) => e.status === 'confirmed').slice(-1)[0];
  if (existing) list.push({ fecha: existing.date, comercio: existing.merchant, descripcion: (existing.description || existing.merchant).toUpperCase(), monto: existing.amount, categoria: existing.categoryId, moneda: existing.currency });
  return { nota: '', movimientos: list.map((x) => ({ ...base, ...x })) };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
