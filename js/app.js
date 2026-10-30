import { RAIL, SETTINGS_ROUTE, start, navigate } from './core/router.js';
import { initSettings, applyTheme, watchSystemTheme } from './core/settings.js';
import { initSession, currentToday } from './core/session.js';
import { initSaveDot, pendingCount } from './core/save.js';
import { h, icon, isTyping } from './ui/el.js';
import { closeDrawer, isDrawerOpen } from './ui/drawer.js';
import { isModalOpen } from './ui/modal.js';
import { toast } from './ui/toast.js';
import { undoLast } from './core/undo.js';

const viewEl = () => document.getElementById('view');

let currentView = null;
let currentPath = null;
const scrollMemo = new Map();

function buildRail() {
  const rail = document.getElementById('rail');
  rail.innerHTML = '';
  const make = (route) => {
    const btn = h(
      'button',
      {
        class: 'rail-item',
        type: 'button',
        'data-route': route.name,
        'aria-label': route.title,
        onclick: () => navigate(route.path)
      },
      icon(route.icon),
      h('span', { class: 'rail-tip', text: route.title })
    );
    rail.append(btn);
    return btn;
  };
  RAIL.forEach(make);
  rail.append(h('div', { class: 'rail-spacer' }));
  make(SETTINGS_ROUTE);
}

function setRailActive(name) {
  document.querySelectorAll('.rail-item').forEach((el) => {
    if (el.dataset.route === name) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });
}

function setMeta(text) {
  document.getElementById('page-meta').textContent = text || '';
}

async function handleRoute(route) {
  if (currentPath) scrollMemo.set(currentPath, viewEl().scrollTop);
  if (currentView && typeof currentView.destroy === 'function') {
    try {
      currentView.destroy();
    } catch (err) {
      console.error('[destroy]', err);
    }
  }
  currentView = null;
  closeDrawer();

  document.getElementById('page-title').textContent = route.route.title;
  setMeta('');
  setRailActive(route.name);

  const host = viewEl();
  host.innerHTML = '';

  let mod;
  try {
    mod = await route.route.load();
  } catch (err) {
    console.error('[route]', err);
    host.append(
      h('div', { class: 'page' }, h('div', { class: 'card' }, '页面加载失败，看看控制台。'))
    );
    return;
  }

  currentView = mod.default;
  const ctx = {
    params: route.params,
    query: route.query,
    route,
    navigate,
    setMeta
  };

  try {
    await currentView.render(host, ctx);
  } catch (err) {
    console.error('[render]', err);
    host.append(h('div', { class: 'page' }, h('div', { class: 'card' }, '渲染出错，看看控制台。')));
  }

  host.scrollTop = scrollMemo.get(route.path) || 0;
  currentPath = route.path;
}

function focusNew() {
  const target =
    document.querySelector('#view .add-row input') ||
    document.querySelector('#view [data-new]') ||
    document.querySelector('#view input');
  if (target) target.focus();
}

function bindKeys() {
  window.addEventListener('keydown', async (e) => {
    const mod = e.metaKey || e.ctrlKey;

    if (mod && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      const search = await import('./ui/search.js');
      search.openSearch();
      return;
    }

    if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      if (isTyping(e.target)) return;
      const label = undoLast();
      if (label) toast(`已撤销：${label}`);
      return;
    }

    if (isTyping(e.target) || isModalOpen() || isDrawerOpen()) return;
    if (mod || e.altKey) return;

    if (/^[1-9]$/.test(e.key)) {
      const idx = Number(e.key) - 1;
      const route = idx < RAIL.length ? RAIL[idx] : SETTINGS_ROUTE;
      if (route) {
        e.preventDefault();
        navigate(route.path);
      }
      return;
    }

    if (e.key.toLowerCase() === 'n') {
      e.preventDefault();
      focusNew();
    }
  });
}

function bindSaveGuard() {
  window.addEventListener('beforeunload', (e) => {
    if (pendingCount() > 0) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

function checkRollover() {
  const bootDay = currentToday();
  setInterval(() => {
    if (currentToday() !== bootDay) location.reload();
  }, 60000);
}

async function boot() {
  if (location.protocol === 'file:') return;

  await initSettings();
  applyTheme();
  watchSystemTheme();
  await initSession();

  initSaveDot(document.getElementById('save-dot'));
  buildRail();
  bindKeys();
  bindSaveGuard();
  checkRollover();

  start(handleRoute);

  const searchBtn = document.getElementById('btn-search');
  searchBtn.addEventListener('click', async () => {
    const mod = await import('./ui/search.js');
    mod.openSearch();
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}
