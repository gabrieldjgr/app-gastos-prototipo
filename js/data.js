// Catálogos fijos de la app: categorías predefinidas, monedas, métodos de pago y periodicidades.

export const PREDEFINED_CATEGORIES = [
  { id: 'supermercado', name: 'Supermercado', emoji: '🛒', color: 0 },
  { id: 'restaurantes', name: 'Comida fuera', emoji: '🍽️', color: 1 },
  { id: 'transporte', name: 'Transporte', emoji: '🚌', color: 2 },
  { id: 'combustible', name: 'Combustible', emoji: '⛽', color: 3 },
  { id: 'renta', name: 'Renta', emoji: '🏠', color: 4 },
  { id: 'hipoteca', name: 'Hipoteca', emoji: '🏦', color: 5 },
  { id: 'servicios', name: 'Servicios', emoji: '💡', color: 6 },
  { id: 'salud', name: 'Salud', emoji: '💊', color: 7 },
  { id: 'entretenimiento', name: 'Entretenimiento', emoji: '🎬', color: 8 },
  { id: 'compras', name: 'Compras y ropa', emoji: '🛍️', color: 9 },
  { id: 'educacion', name: 'Educación', emoji: '📚', color: 10 },
  { id: 'mascotas', name: 'Mascotas', emoji: '🐾', color: 11 },
  { id: 'viajes', name: 'Viajes', emoji: '✈️', color: 2 },
  { id: 'suscripciones', name: 'Suscripciones', emoji: '📺', color: 8 },
  { id: 'hogar', name: 'Hogar', emoji: '🛠️', color: 4 },
  { id: 'regalos', name: 'Regalos', emoji: '🎁', color: 1 },
  { id: 'cuidado', name: 'Cuidado personal', emoji: '💇', color: 7 },
  { id: 'otros', name: 'Otros', emoji: '📦', color: 11 },
];

export const DEFAULT_VISIBLE = [
  'supermercado', 'restaurantes', 'transporte', 'combustible', 'renta', 'servicios',
  'salud', 'entretenimiento', 'compras', 'suscripciones', 'otros',
];

export const CURRENCIES = [
  { code: 'MXN', name: 'Peso mexicano', symbol: '$', locale: 'es-MX' },
  { code: 'ARS', name: 'Peso argentino', symbol: '$', locale: 'es-AR' },
  { code: 'VES', name: 'Bolívar', symbol: 'Bs.', locale: 'es-VE' },
  { code: 'USD', name: 'Dólar', symbol: 'US$', locale: 'es-MX' },
  { code: 'EUR', name: 'Euro', symbol: '€', locale: 'es-ES' },
];

export const PAYMENT_METHODS = [
  'Efectivo', 'Débito', 'Crédito', 'Transferencia', 'Mercado Pago', 'Pago móvil', 'Zelle', 'Otro',
];

export const PERIODS = [
  { id: 'monthly', name: 'Mensual' },
  { id: 'biweekly', name: 'Quincenal' },
  { id: 'weekly', name: 'Semanal' },
  { id: 'yearly', name: 'Anual' },
  { id: 'none', name: 'Sin periodicidad' },
];

export const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export const DASHBOARD_WIDGETS = [
  { id: 'pace', name: 'Ritmo de presupuestos', desc: 'Ideal vs. real, desliza entre presupuestos' },
  { id: 'categories', name: 'Gasto por categoría', desc: 'En qué se va el dinero este mes' },
  { id: 'trend', name: 'Evolución', desc: 'Gasto por semana en los últimos 3 meses' },
  { id: 'costcenters', name: 'Centros de costo', desc: 'Total por centro de costo' },
  { id: 'merchants', name: 'Top comercios', desc: 'Dónde gastas más seguido' },
];
