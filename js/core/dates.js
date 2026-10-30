const WEEK_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function toDateStr(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function todayStr(base = new Date()) {
  return toDateStr(base);
}

export function parseDate(str) {
  const [y, m, d] = String(str || '').split('-').map(Number);
  if (!y) return new Date();
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(str, n) {
  const d = parseDate(str);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

export function diffDays(from, to) {
  const a = parseDate(from);
  const b = parseDate(to);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function weekdayCN(str) {
  return WEEK_CN[parseDate(str).getDay()];
}

export function monthDay(str) {
  const [, m, d] = String(str).split('-').map(Number);
  return `${m} 月 ${d} 日`;
}

export function shortDate(str) {
  const [, m, d] = String(str).split('-').map(Number);
  return `${pad2(m)}/${pad2(d)}`;
}

export function weekStart(str, firstDay = 1) {
  const d = parseDate(str);
  const shift = (d.getDay() - firstDay + 7) % 7;
  d.setDate(d.getDate() - shift);
  return toDateStr(d);
}

export function weekDays(str, firstDay = 1) {
  const start = weekStart(str, firstDay);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function weekNumber(str, firstDay = 1) {
  const start = parseDate(weekStart(str, firstDay));
  const jan1 = new Date(start.getFullYear(), 0, 1);
  return Math.floor((start - jan1) / 86400000 / 7) + 1;
}

export function daysLeftInMonth(str) {
  const d = parseDate(str);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return last.getDate() - d.getDate();
}

export function relativeText(str, today = todayStr()) {
  const n = diffDays(today, str);
  if (n === 0) return '今天';
  if (n === 1) return '明天';
  if (n === -1) return '昨天';
  if (n > 1) return `${n} 天后`;
  return `${Math.abs(n)} 天前`;
}

export function timeText(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function isWeekend(str) {
  const day = parseDate(str).getDay();
  return day === 0 || day === 6;
}

export function normalizeTime(value) {
  const raw = String(value || '')
    .trim()
    .replace(/[：.]/g, ':');
  if (!raw) return '';
  let hPart;
  let mPart;
  if (raw.includes(':')) {
    const [a, b = ''] = raw.split(':');
    hPart = a;
    mPart = b === '' ? '0' : b;
  } else if (/^\d{1,2}$/.test(raw)) {
    hPart = raw;
    mPart = '0';
  } else if (/^\d{3,4}$/.test(raw)) {
    hPart = raw.slice(0, -2);
    mPart = raw.slice(-2);
  } else {
    return '';
  }
  const h = Number(hPart);
  const min = Number(mPart);
  if (!Number.isInteger(h) || !Number.isInteger(min)) return '';
  if (h < 0 || h > 23 || min < 0 || min > 59) return '';
  return `${pad2(h)}:${pad2(min)}`;
}
