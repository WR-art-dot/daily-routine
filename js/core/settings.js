import { getOne, put } from './db.js';

const KEY = 'app';

export const DEFAULTS = {
  theme: 'auto',
  weekStart: 1,
  dayCapacity: 360,
  targets: { kcal: 2100, protein: 120, carb: 280, fat: 70, weeklyWorkouts: 4 },
  homeCards: ['media', 'dev', 'study', 'fitness', 'food', 'play'],
  hiddenCards: [],
  lastVisitDate: '',
  lastExportAt: 0
};

let cache = null;
const subs = new Set();

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

export async function initSettings() {
  const rec = await getOne('settings', KEY);
  cache = { ...clone(DEFAULTS), ...(rec || {}) };
  cache.targets = { ...DEFAULTS.targets, ...(rec?.targets || {}) };
  cache.homeCards = Array.isArray(cache.homeCards) && cache.homeCards.length ? cache.homeCards : [...DEFAULTS.homeCards];
  cache.hiddenCards = Array.isArray(cache.hiddenCards) ? cache.hiddenCards : [];
  return cache;
}

export function getSettings() {
  return cache || clone(DEFAULTS);
}

export async function saveSettings(patch) {
  cache = { ...getSettings(), ...patch };
  if (patch.targets) cache.targets = { ...getSettings().targets, ...patch.targets };
  await put('settings', { key: KEY, ...cache });
  subs.forEach((fn) => fn(cache));
  return cache;
}

export function onSettings(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

export function resolveTheme(theme = getSettings().theme) {
  if (theme === 'dark' || theme === 'light') return theme;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme() {
  const mode = resolveTheme();
  document.documentElement.dataset.theme = mode;
  document.documentElement.style.colorScheme = mode;
  return mode;
}

export function watchSystemTheme() {
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const handler = () => {
    if (getSettings().theme === 'auto') applyTheme();
  };
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}
