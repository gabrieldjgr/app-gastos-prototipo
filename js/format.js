// Formato de montos y fechas en español latinoamericano (es-MX, es-AR, es-VE).
import { CURRENCIES } from './data.js';

let base = 'MXN';
export function setBaseCurrency(code) { base = code; }
export function baseCurrency() { return base; }

export function currencyInfo(code) {
  return CURRENCIES.find((c) => c.code === code) || CURRENCIES[0];
}

function locale() { return currencyInfo(base).locale; }

const FOREIGN_PREFIX = { MXN: 'MX$ ', ARS: 'AR$ ', VES: 'Bs. ', USD: 'US$ ', EUR: '€ ' };
const BASE_PREFIX = { MXN: '$', ARS: '$ ', VES: 'Bs. ', USD: 'US$ ', EUR: '€ ' };

export function currencyPrefix(code = base) {
  return code === base ? BASE_PREFIX[code] : (FOREIGN_PREFIX[code] || `${code} `);
}

export function formatNumber(value, decimals = 0) {
  return value.toLocaleString(locale(), { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// money(1240.5) → "$1,240.50" · {hero:true} sin decimales · {sign:true} antepone "+"
export function money(amount, code = base, { hero = false, sign = false } = {}) {
  const value = Number(amount) || 0;
  const abs = Math.abs(value);
  const hasDecimals = Math.round(abs * 100) % 100 !== 0;
  const d = hero ? 0 : hasDecimals ? 2 : 0;
  const s = value < 0 ? '−' : sign && value > 0 ? '+' : '';
  return `${s}${currencyPrefix(code)}${formatNumber(hero ? Math.round(abs) : abs, d)}`;
}

// Abreviado para ejes y etiquetas: $12.4k · $125k · $1.2M
export function moneyShort(amount, code = base, { symbol = true } = {}) {
  const abs = Math.abs(Number(amount) || 0);
  let n;
  if (abs < 1000) n = formatNumber(Math.round(abs));
  else if (abs < 1e6) {
    const v = abs / 1e3;
    n = (v >= 100 ? formatNumber(Math.round(v)) : v.toLocaleString(locale(), { maximumFractionDigits: 1 })) + 'k';
  } else {
    const v = abs / 1e6;
    n = (v >= 100 ? formatNumber(Math.round(v)) : v.toLocaleString(locale(), { maximumFractionDigits: 1 })) + 'M';
  }
  const pre = symbol ? currencyPrefix(code).trimEnd() : '';
  const sep = symbol && currencyPrefix(code).endsWith(' ') && !currencyPrefix(code).startsWith('$') ? ' ' : '';
  return `${amount < 0 ? '−' : ''}${pre}${sep}${n}`;
}

// Interpreta un número escrito por la persona ("1.240,50", "1,240.50", "1240")
export function parseAmount(text) {
  if (typeof text === 'number') return text;
  let t = String(text || '').replace(/[^\d.,-]/g, '');
  const lastComma = t.lastIndexOf(',');
  const lastDot = t.lastIndexOf('.');
  if (lastComma > lastDot) t = t.replace(/\./g, '').replace(',', '.');
  else t = t.replace(/,/g, '');
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

export function parseISO(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayISO() { return toISO(new Date()); }

export function addDays(date, n) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
}

export function dateShort(dateOrIso) {
  const d = typeof dateOrIso === 'string' ? parseISO(dateOrIso) : dateOrIso;
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === new Date().getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

export function monthName(date, long = true) {
  return (long ? MONTHS_LONG : MONTHS)[date.getMonth()];
}

export function dayHeader(iso) {
  const d = parseISO(iso);
  const today = parseISO(todayISO());
  const diff = Math.round((today - d) / 86400000);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Ayer';
  const base = `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === today.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

// Rango con fin exclusivo: "1–30 nov", "28 oct – 3 nov"
export function dateRange(start, endExclusive) {
  const end = addDays(endExclusive, -1);
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${start.getDate()}–${end.getDate()} ${MONTHS[end.getMonth()]}`;
  }
  return `${dateShort(start)} – ${dateShort(end)}`;
}

export function daysAgo(iso) {
  return Math.round((parseISO(todayISO()) - parseISO(iso)) / 86400000);
}

export function esc(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
