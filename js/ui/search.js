import { h, icon } from './el.js';
import { all } from '../core/db.js';
import { navigate } from '../core/router.js';
import { labelOf, MEDIA_STATUS, REF_STATUS, WISH_STATUS } from '../core/schema.js';

let host = null;
let activeIndex = 0;
let results = [];

const GROUPS = [
  { key: 'plan', name: '今日计划' },
  { key: 'media', name: '自媒体' },
  { key: 'dev', name: '开发工作' },
  { key: 'study', name: '学习工作' },
  { key: 'play', name: '娱乐' }
];

export function closeSearch() {
  if (!host) return;
  host.remove();
  host = null;
  results = [];
  activeIndex = 0;
}

export function isSearchOpen() {
  return !!host;
}

function matches(text, q) {
  return String(text || '').toLowerCase().includes(q);
}

async function collect(q) {
  const [plan, media, bugs, devTasks, refs, wishes] = await Promise.all([
    all('plan'),
    all('media'),
    all('bugs'),
    all('devTasks'),
    all('refs'),
    all('wishes')
  ]);

  const out = [];
  for (const t of plan) {
    if (!matches(t.title, q)) continue;
    out.push({
      group: 'plan',
      title: t.title,
      meta: `${t.date}${t.done ? ' · 已完成' : ''}`,
      go: () => navigate(`/today?d=${t.date}`)
    });
  }
  for (const m of media) {
    if (!matches(m.title, q)) continue;
    out.push({
      group: 'media',
      title: m.title,
      meta: `${m.platform || '未设平台'} · ${labelOf(MEDIA_STATUS, m.status)}`,
      go: () => navigate('/media')
    });
  }
  for (const b of bugs) {
    if (!matches(b.title, q)) continue;
    out.push({
      group: 'dev',
      title: b.title,
      meta: `Bug · ${b.status === 'open' ? '待修' : '已修'}`,
      go: () => navigate(`/dev/${b.projectId}/bug`)
    });
  }
  for (const t of devTasks) {
    if (!matches(t.title, q)) continue;
    out.push({
      group: 'dev',
      title: t.title,
      meta: `任务 · ${t.done ? '已完成' : '未完成'}`,
      go: () => navigate(`/dev/${t.projectId}/task`)
    });
  }
  for (const r of refs) {
    if (!matches(r.title, q) && !matches(r.author, q)) continue;
    out.push({
      group: 'study',
      title: r.title,
      meta: `${r.author || '佚名'} · ${labelOf(REF_STATUS, r.status)}`,
      go: () => navigate('/study')
    });
  }
  for (const w of wishes) {
    if (!matches(w.title, q)) continue;
    out.push({
      group: 'play',
      title: w.title,
      meta: labelOf(WISH_STATUS, w.status),
      go: () => navigate('/play')
    });
  }

  const capped = [];
  for (const group of GROUPS) {
    capped.push(...out.filter((r) => r.group === group.key).slice(0, 5));
  }
  return capped;
}

export function openSearch() {
  if (host) {
    closeSearch();
    return;
  }

  const panel = h('div', { class: 'search-panel', role: 'dialog', 'aria-label': '全局搜索' });
  const input = h('input', { class: 'search-input', placeholder: '搜任务、选题、bug、文献、心愿' });
  const list = h('div', { class: 'search-results' });
  const overlay = h('div', { class: 'overlay show' });

  const renderResults = () => {
    list.innerHTML = '';
    if (!results.length) {
      list.append(h('div', { class: 'search-empty', text: input.value.trim() ? '没有匹配的条目' : '输入两个字开始搜' }));
      return;
    }
    let lastGroup = '';
    results.forEach((item, index) => {
      if (item.group !== lastGroup) {
        lastGroup = item.group;
        list.append(h('div', { class: 'search-group', text: GROUPS.find((g) => g.key === item.group).name }));
      }
      list.append(
        h(
          'div',
          {
            class: `search-item${index === activeIndex ? ' on' : ''}`,
            role: 'button',
            onclick: () => {
              closeSearch();
              item.go();
            }
          },
          icon(GROUPS.find((g) => g.key === item.group).key === 'dev' ? 'dev' : 'search'),
          h('span', { class: 'grow', text: item.title }),
          h('span', { class: 'hint', text: item.meta })
        )
      );
    });
  };

  let timer = null;
  input.addEventListener('input', () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = input.value.trim().toLowerCase();
      if (!q) {
        results = [];
        activeIndex = 0;
        renderResults();
        return;
      }
      results = await collect(q);
      activeIndex = 0;
      renderResults();
    }, 80);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeSearch();
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = Math.min(results.length - 1, activeIndex + 1);
      renderResults();
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(0, activeIndex - 1);
      renderResults();
    }
    if (e.key === 'Enter' && results[activeIndex]) {
      const item = results[activeIndex];
      closeSearch();
      item.go();
    }
  });

  overlay.addEventListener('click', closeSearch);

  panel.append(input, list);
  document.getElementById('overlay-host').append(overlay, panel);
  host = panel;

  renderResults();
  input.focus();
}
