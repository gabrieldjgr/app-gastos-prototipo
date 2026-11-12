// Datos de ejemplo para probar la app sin cargar nada.
import { state, save, uid, normalizeExpense } from './store.js';
import { toISO, addDays } from './format.js';

const SCALE = { MXN: 1, USD: 0.06, EUR: 0.05, ARS: 60, VES: 3 };

const MERCHANTS = {
  supermercado: [['Walmart', 1100], ['Soriana', 850], ['Chedraui', 700], ['La Comer', 950], ['OXXO', 140]],
  restaurantes: [['Starbucks', 120], ['Tacos El Güero', 230], ['Rappi', 310], ['Uber Eats', 280], ['Sushi Roll', 520]],
  transporte: [['Uber', 140], ['DiDi', 110], ['Metro', 30]],
  combustible: [['Pemex', 780], ['Shell', 820]],
  servicios: [['CFE', 640], ['Totalplay', 589], ['Agua municipal', 210]],
  salud: [['Farmacias del Ahorro', 260], ['Similares', 180]],
  entretenimiento: [['Cinépolis', 340], ['Steam', 290], ['Boliche Strike', 420]],
  compras: [['Liverpool', 1200], ['Mercado Libre', 650], ['Amazon', 540]],
  suscripciones: [['Netflix', 249], ['Spotify', 129]],
};

// Generador pseudoaleatorio con semilla para que el ejemplo sea estable.
function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export function loadSampleData() {
  const k = SCALE[state.settings.currency] || 1;
  const r = rng(42);
  const today = new Date();
  const expenses = [];
  const push = (date, categoryId, merchant, amount, extra = {}) => {
    expenses.push(normalizeExpense({
      id: uid('g'), date: toISO(date), categoryId, description: merchant, merchant,
      amount: Math.round(amount * k * 100) / 100, currency: state.settings.currency,
      costCenterId: 'cc-diario', paymentMethod: ['Débito', 'Crédito', 'Efectivo', 'Transferencia'][Math.floor(r() * 4)],
      status: 'confirmed', source: ['manual', 'batch', 'receipt'][Math.floor(r() * 3)], createdAt: Date.now(), ...extra,
    }));
  };

  // 6 meses hacia atrás con frecuencias por categoría.
  for (let d = 185; d >= 0; d--) {
    const date = addDays(today, -d);
    const day = date.getDate();
    const isThisMonth = date.getMonth() === today.getMonth();
    if (r() < 0.32) { const [m, a] = pick(MERCHANTS.supermercado, r); push(date, 'supermercado', m, a * (0.7 + r() * 0.6)); }
    // Este mes se come fuera más seguido: así el ejemplo muestra un presupuesto excedido.
    if (r() < (isThisMonth ? 0.55 : 0.35)) { const [m, a] = pick(MERCHANTS.restaurantes, r); push(date, 'restaurantes', m, a * (0.7 + r() * 0.8)); }
    if (r() < 0.4) { const [m, a] = pick(MERCHANTS.transporte, r); push(date, 'transporte', m, a * (0.6 + r() * 0.9)); }
    if (r() < 0.1) { const [m, a] = pick(MERCHANTS.combustible, r); push(date, 'combustible', m, a * (0.8 + r() * 0.4)); }
    if (r() < (isThisMonth ? 0.16 : 0.1)) { const [m, a] = pick(MERCHANTS.entretenimiento, r); push(date, 'entretenimiento', m, a * (0.8 + r() * 0.5)); }
    if (r() < 0.06) { const [m, a] = pick(MERCHANTS.compras, r); push(date, 'compras', m, a * (0.6 + r() * 0.8)); }
    if (r() < 0.05) { const [m, a] = pick(MERCHANTS.salud, r); push(date, 'salud', m, a * (0.6 + r() * 0.8)); }
    if (day === 1) push(date, 'renta', 'Renta departamento', 9500, { paymentMethod: 'Transferencia' });
    if (day === 5) push(date, 'servicios', 'CFE', 640 * (0.8 + r() * 0.4));
    if (day === 8) push(date, 'servicios', 'Totalplay', 589);
    if (day === 12) push(date, 'suscripciones', 'Netflix', 249, { paymentMethod: 'Crédito' });
    if (day === 18) push(date, 'suscripciones', 'Spotify', 129, { paymentMethod: 'Crédito' });
  }

  // Viaje a Cancún: centro de costo sin periodicidad.
  const tripStart = addDays(today, -6);
  const trip = [
    [0, 'viajes', 'Volaris', 6200], [0, 'viajes', 'Hotel Riu', 9800], [1, 'restaurantes', 'La Habichuela', 1450],
    [1, 'transporte', 'Taxi aeropuerto', 650], [2, 'entretenimiento', 'Tour Isla Mujeres', 2400],
    [3, 'restaurantes', 'Mariscos El Fénix', 980], [4, 'compras', 'Souvenirs 5ta Av', 760], [5, 'restaurantes', 'Café Nader', 380],
  ];
  for (const [off, cat, m, a] of trip) {
    push(addDays(tripStart, off), cat, m, a, { costCenterId: 'cc-cancun', paymentMethod: 'Crédito' });
  }

  // Pendientes en la bandeja para mostrar cómo se revisa.
  const pendingBase = { status: 'pending', source: 'batch', costCenterId: 'cc-diario', createdAt: Date.now() };
  const pend = [
    { date: toISO(addDays(today, -1)), merchant: 'Walmart Express', description: 'WALMART EXP 2231', categoryId: 'supermercado', amount: 486.5, ai: { tipo: 'gasto', confianza: 'alta' } },
    { date: toISO(addDays(today, -1)), merchant: 'Pemex', description: 'GASOLINERA PEMEX 0412', categoryId: 'combustible', amount: 750, ai: { tipo: 'gasto', confianza: 'alta' } },
    { date: toISO(addDays(today, -2)), merchant: 'MERPAGO*JUAN', description: 'MERPAGO*JUAN', categoryId: 'restaurantes', amount: 320, ai: { tipo: 'gasto', confianza: 'baja', pregunta: '¿“MERPAGO*JUAN” es comida o un pago a una persona?', opciones: ['restaurantes', 'otros', 'regalos'] } },
    { date: toISO(addDays(today, -2)), merchant: 'Uber', description: 'UBER *TRIP', categoryId: 'transporte', amount: 138, ai: { tipo: 'gasto', confianza: 'alta' } },
    { date: toISO(addDays(today, -3)), merchant: 'Transferencia a cuenta propia', description: 'SPEI A CTA 4410', categoryId: 'otros', amount: 3000, ai: { tipo: 'transferencia', confianza: 'alta' } },
    { date: toISO(addDays(today, -3)), merchant: 'Pago tarjeta de crédito', description: 'PAGO TDC', categoryId: 'otros', amount: 5400, ai: { tipo: 'pago_tarjeta', confianza: 'alta' } },
  ];
  for (const p of pend) {
    expenses.push(normalizeExpense({ id: uid('g'), currency: state.settings.currency, paymentMethod: 'Débito', ...pendingBase, ...p, amount: Math.round(p.amount * k * 100) / 100 }));
  }
  // Un duplicado de un gasto ya registrado.
  const recent = expenses.filter((e) => e.status === 'confirmed' && e.categoryId === 'supermercado').slice(-1)[0];
  if (recent) {
    expenses.push(normalizeExpense({ ...recent, id: uid('g'), ...pendingBase, description: recent.merchant.toUpperCase(), ai: { tipo: 'gasto', confianza: 'alta', dupOf: recent.id } }));
  }

  state.costCenters = [
    { id: 'cc-diario', name: 'Día a día', emoji: '🗓️' },
    { id: 'cc-cancun', name: 'Viaje a Cancún', emoji: '🏝️' },
  ];
  state.visibleCategories = Array.from(new Set([...state.visibleCategories, 'viajes']));
  state.budgets = [
    { id: uid('p'), name: 'Día a día', costCenterId: 'cc-diario', categoryId: null, amount: 26000 * k, period: 'monthly', resetDay: 1 },
    { id: uid('p'), name: 'Supermercado', costCenterId: 'cc-diario', categoryId: 'supermercado', amount: 6000 * k, period: 'monthly', resetDay: 1 },
    { id: uid('p'), name: 'Comida fuera', costCenterId: 'cc-diario', categoryId: 'restaurantes', amount: 2200 * k, period: 'monthly', resetDay: 1 },
    { id: uid('p'), name: 'Transporte', costCenterId: 'cc-diario', categoryId: 'transporte', amount: 2200 * k, period: 'monthly', resetDay: 1 },
    { id: uid('p'), name: 'Entretenimiento', costCenterId: 'cc-diario', categoryId: 'entretenimiento', amount: 1200 * k, period: 'monthly', resetDay: 1 },
    { id: uid('p'), name: 'Viaje a Cancún', costCenterId: 'cc-cancun', categoryId: null, amount: 26000 * k, period: 'none', startDate: toISO(tripStart), endDate: toISO(addDays(tripStart, 9)) },
  ];
  state.expenses = expenses;
  state.lastBatchAt = toISO(addDays(today, -5));
  state.onboarded = true;
  save();
}

function pick(list, r) {
  return list[Math.floor(r() * list.length)];
}
