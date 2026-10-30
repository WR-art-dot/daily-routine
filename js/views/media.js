import { h, icon } from '../ui/el.js';
import { addRow, inlineTextArea } from '../ui/inline.js';
import { toastUndo } from '../ui/toast.js';
import { openDrawer } from '../ui/drawer.js';
import { confirmDialog } from '../ui/modal.js';
import { all, put, del } from '../core/db.js';
import { track } from '../core/save.js';
import { MEDIA_STATUS, PLATFORMS, labelOf } from '../core/schema.js';
import { mediaSort } from '../core/library.js';
import { shortDate, todayStr, timeText } from '../core/dates.js';

let token = 0;
let rootEl = null;
let ctxRef = null;
let items = [];
let platformFilter = 'all';

function refresh() {
  if (!rootEl || !ctxRef) return;
  const root = rootEl;
  const ctx = ctxRef;
  root.innerHTML = '';
  render(root, ctx);
}

function wordCount(body) {
  return (body || '').replace(/\s/g, '').length;
}

function publishStatsCard(pubItems) {
  const sorted = [...pubItems]
    .sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
  const shown = sorted.slice(0, 6);
  const rest = sorted.length - shown.length;

  const totalViews = sorted.reduce((s, i) => s + (i.stats?.views || 0), 0);
  const totalLikes = sorted.reduce((s, i) => s + (i.stats?.likes || 0), 0);
  const rate = totalViews ? `${((totalLikes / totalViews) * 100).toFixed(1)}%` : '—';
  const maxViews = Math.max(1, ...sorted.map((i) => i.stats?.views || 0));
  const maxLikes = Math.max(1, ...sorted.map((i) => i.stats?.likes || 0));

  const summary = h('div', { class: 'pub-summary' });
  [
    ['总阅读', totalViews.toLocaleString('zh-CN')],
    ['总互动', totalLikes.toLocaleString('zh-CN')],
    ['平均互动率', rate]
  ].forEach(([k, v]) => {
    summary.append(h('div', { class: 'pub-num' }, h('span', { class: 'pub-num-label', text: k }), h('span', { class: 'pub-num-value num', text: v })));
  });

  const rows = h('div', { class: 'pub-rows' });
  shown.forEach((item) => {
    const views = item.stats?.views || 0;
    const likes = item.stats?.likes || 0;
    rows.append(
      h(
        'div',
        { class: 'pub-row' },
        h(
          'div',
          { class: 'pub-row-head' },
          h('span', { class: 'pub-row-title', text: item.title || '未命名' }),
          h('span', { class: 'pub-row-date hint', text: item.publishedAt ? shortDate(item.publishedAt) : '—' })
        ),
        h(
          'div',
          { class: 'pub-bars' },
          h(
            'div',
            { class: 'pub-bar' },
            h('span', { class: 'pub-bar-label', text: '阅读' }),
            h('div', { class: 'bar' }, h('i', { style: { width: `${(views / maxViews) * 100}%`, background: 'var(--m-media)' } })),
            h('span', { class: 'pub-bar-val num', text: views.toLocaleString('zh-CN') })
          ),
          h(
            'div',
            { class: 'pub-bar' },
            h('span', { class: 'pub-bar-label', text: '互动' }),
            h('div', { class: 'bar' }, h('i', { style: { width: `${(likes / maxLikes) * 100}%`, background: 'var(--accent)' } })),
            h('span', { class: 'pub-bar-val num', text: likes.toLocaleString('zh-CN') })
          )
        )
      )
    );
  });
  if (rest > 0) rows.append(h('div', { class: 'hint', style: { padding: '2px 2px 0' }, text: `还有 ${rest} 篇未显示，按发布时间只列最近 6 篇。` }));

  const card = h(
    'section',
    { class: 'card pub-stats', 'data-card': 'pub-stats' },
    h('div', { class: 'card-head' }, h('span', { class: 'card-title', text: '发布数据' }), h('span', { class: 'count', text: `${sorted.length} 篇` })),
    summary,
    rows
  );
  return card;
}

function readingMinutes(n) {
  return Math.max(1, Math.round(n / 400));
}

async function setStatus(item, status) {
  if (item.status === status) return;
  const from = item.status;
  const history = [...(item.statusHistory || []), { from, to: status, at: Date.now() }];
  const patch = { ...item, status, statusHistory: history };
  if (status === 'published' && !patch.publishedAt) patch.publishedAt = todayStr();
  Object.assign(item, patch);
  await track(put('media', patch));
}

function openMediaDrawer(id) {
  const item = items.find((it) => it.id === id);
  if (!item) return;

  const bodyArea = h('textarea', {
    class: 'textarea',
    rows: 14,
    placeholder: '正文，支持 Markdown',
    value: item.body || ''
  });
  bodyArea.style.minHeight = '220px';

  const counter = h('div', { class: 'hint' });

  const updateCounter = () => {
    const n = wordCount(bodyArea.value);
    counter.textContent = `${n} 字 · 约 ${readingMinutes(n)} 分钟读完`;
  };
  updateCounter();

  let bodyTimer = null;
  bodyArea.addEventListener('input', () => {
    updateCounter();
    if (bodyTimer) clearTimeout(bodyTimer);
    bodyTimer = setTimeout(async () => {
      item.body = bodyArea.value;
      await track(put('media', { ...item, body: bodyArea.value }));
    }, 400);
  });

  const titleInput = h('input', { class: 'input', value: item.title, placeholder: '选题标题' });
  titleInput.addEventListener('change', async () => {
    item.title = titleInput.value.trim() || item.title;
    await track(put('media', { ...item, title: item.title }));
  });

  const platformSelect = h(
    'select',
    {
      class: 'select',
      onchange: async (e) => {
        item.platform = e.target.value;
        await track(put('media', { ...item, platform: item.platform }));
      }
    },
    PLATFORMS.map((p) => h('option', { value: p, text: p, selected: item.platform === p }))
  );

  const dateInput = h('input', {
    class: 'input',
    type: 'date',
    value: item.plannedDate || '',
    onchange: async (e) => {
      item.plannedDate = e.target.value;
      await track(put('media', { ...item, plannedDate: item.plannedDate }));
      refresh();
    }
  });

  const statusSelect = h(
    'select',
    {
      class: 'select',
      onchange: async (e) => {
        await setStatus(item, e.target.value);
        refresh();
        drawer.close();
        openMediaDrawer(item.id);
      }
    },
    MEDIA_STATUS.map((s) => h('option', { value: s.id, text: s.name, selected: item.status === s.id }))
  );

  const publishedBox = h('div', { class: 'stack' });
  if (item.status === 'published') {
    const urlInput = h('input', {
      class: 'input',
      value: item.url || '',
      placeholder: '发布链接',
      onchange: async (e) => {
        item.url = e.target.value;
        await track(put('media', { ...item, url: item.url }));
      }
    });
    const viewsInput = h('input', {
      class: 'input',
      type: 'number',
      value: item.stats?.views ?? '',
      placeholder: '阅读',
      style: { width: '90px' },
      onchange: async (e) => {
        item.stats = { ...(item.stats || {}), views: Number(e.target.value) || 0 };
        await track(put('media', { ...item, stats: item.stats }));
      }
    });
    const likesInput = h('input', {
      class: 'input',
      type: 'number',
      value: item.stats?.likes ?? '',
      placeholder: '互动',
      style: { width: '90px' },
      onchange: async (e) => {
        item.stats = { ...(item.stats || {}), likes: Number(e.target.value) || 0 };
        await track(put('media', { ...item, stats: item.stats }));
      }
    });
    const publishedAtInput = h('input', {
      class: 'input',
      type: 'date',
      value: (item.publishedAt || '').slice(0, 10),
      onchange: async (e) => {
        item.publishedAt = e.target.value;
        await track(put('media', { ...item, publishedAt: item.publishedAt }));
      }
    });
    const retroArea = h('textarea', {
      class: 'textarea',
      rows: 3,
      placeholder: '回头看：这条为什么起量 / 没起量',
      value: item.retro || ''
    });
    retroArea.addEventListener('blur', async () => {
      if (retroArea.value === (item.retro || '')) return;
      item.retro = retroArea.value;
      await track(put('media', { ...item, retro: item.retro }));
    });

    publishedBox.append(
      h('div', { class: 'hint', text: '发布记录' }),
      urlInput,
      h('div', { class: 'row' }, publishedAtInput, viewsInput, likesInput),
      retroArea
    );
  }

  const history = (item.statusHistory || [])
    .slice(-6)
    .map((rec) =>
      h('div', { class: 'hint', text: `${timeText(rec.at)} ${labelOf(MEDIA_STATUS, rec.from)} → ${labelOf(MEDIA_STATUS, rec.to)}` })
    );

  const body = h(
    'div',
    { class: 'stack' },
    titleInput,
    h('div', { class: 'row' }, platformSelect, dateInput),
    h('div', { class: 'row' }, h('span', { class: 'hint', text: '状态' }), statusSelect),
    h('div', { class: 'hint', text: '正文' }),
    bodyArea,
    counter,
    item.status === 'published' ? publishedBox : null,
    history.length ? h('div', { class: 'stack' }, h('div', { class: 'hint', text: '状态变更' }), ...history) : null
  );

  const drawer = openDrawer({
    title: '选题详情',
    body,
    foot: h('div', { class: 'row', style: { width: '100%' } },
      h('button', {
        class: 'btn danger',
        text: '删除',
        onclick: async () => {
          const ok = await confirmDialog({
            title: '删除这条选题？',
            message: `「${item.title}」的正文和发布记录会一起删掉。`,
            confirmText: '删除',
            danger: true
          });
          if (!ok) return;
          drawer.close();
          await track(del('media', item.id));
          items = items.filter((x) => x.id !== item.id);
          refresh();
          toastUndo('选题已删除', async () => {
            await track(put('media', item));
            refresh();
          });
        }
      }),
      h('button', {
        class: 'btn primary',
        text: '完成',
        style: { marginLeft: 'auto' },
        onclick: () => {
          drawer.close();
          refresh();
        }
      })
    )
  });

  bodyArea.focus();
}

function renderColumn(status, list) {
  const col = h('div', { class: 'kcol', 'data-status': status.id });
  const columnItems = mediaSort(list.filter((it) => it.status === status.id));

  col.append(
    h(
      'div',
      { class: 'kcol-head' },
      h('span', { class: 'kcol-name', text: status.name }),
      h('span', { class: 'kcol-count', text: String(columnItems.length) })
    )
  );

  for (const item of columnItems) {
    const card = h('div', { class: 'kcard', draggable: 'true', 'data-id': item.id });
    card.append(
      h('div', { class: 'kcard-title', text: item.title }),
      h('div', {
        class: 'kcard-meta',
        text: `${item.platform || '未设平台'} · ${item.plannedDate ? shortDate(item.plannedDate) : '未排日期'}`
      })
    );
    if (status.id === 'published') {
      card.append(
        h('div', {
          class: 'kcard-meta',
          text: `${item.publishedAt ? shortDate(item.publishedAt) : '—'} · 阅读 ${item.stats?.views ?? 0} · 互动 ${item.stats?.likes ?? 0}`
        })
      );
    }
    if (item.plannedDate && item.plannedDate < todayStr() && status.id !== 'published') {
      card.append(h('div', { class: 'kcard-meta', style: { color: 'var(--warn)' }, text: '已过期' }));
    }

    card.addEventListener('click', () => openMediaDrawer(item.id));
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', item.id);
      e.dataTransfer.effectAllowed = 'move';
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    col.append(card);
  }

  col.append(
    addRow({
      placeholder: '＋ 一条想法',
      onAdd: async (value) => {
        const rec = await track(
          put('media', {
            title: value,
            platform: '',
            status: status.id,
            plannedDate: null,
            body: '',
            publishedAt: null,
            url: '',
            stats: { views: 0, likes: 0 },
            retro: '',
            statusHistory: []
          })
        );
        items.push(rec);
        refresh();
      }
    })
  );

  col.addEventListener('dragover', (e) => {
    e.preventDefault();
    col.classList.add('over');
  });
  col.addEventListener('dragleave', () => col.classList.remove('over'));
  col.addEventListener('drop', async (e) => {
    e.preventDefault();
    col.classList.remove('over');
    const id = e.dataTransfer.getData('text/plain');
    const item = items.find((it) => it.id === id);
    if (!item) return;
    await setStatus(item, status.id);
    refresh();
    if (status.id === 'published') openMediaDrawer(item.id);
  });

  return col;
}

async function render(root, ctx) {
  const t = ++token;
  rootEl = root;
  ctxRef = ctx;

  items = await all('media');
  if (t !== token) return;

  const platforms = [...new Set(items.map((i) => i.platform).filter(Boolean))];
  const chips = [
    h('button', {
      class: `chip${platformFilter === 'all' ? ' on' : ''}`,
      type: 'button',
      text: '全部平台',
      onclick: () => {
        platformFilter = 'all';
        refresh();
      }
    }),
    ...platforms.map((p) =>
      h('button', {
        class: `chip${platformFilter === p ? ' on' : ''}`,
        type: 'button',
        text: p,
        onclick: () => {
          platformFilter = p;
          refresh();
        }
      })
    )
  ];

  const publishedThisMonth = items.filter(
    (i) => i.status === 'published' && (i.publishedAt || '').slice(0, 7) === todayStr().slice(0, 7)
  ).length;

  ctx.setMeta(`${items.length} 条选题 · 本月发布 ${publishedThisMonth}`);

  const visible = platformFilter === 'all' ? items : items.filter((i) => i.platform === platformFilter);
  const board = h('div', { class: 'kanban' });
  MEDIA_STATUS.forEach((status) => board.append(renderColumn(status, visible)));

  const page = h('div', { class: 'page' }, h('div', { class: 'page-bar' }, ...chips, h('span', { class: 'grow' })));

  if (!items.length) {
    page.append(
      h(
        'div',
        { class: 'card', style: { marginBottom: '12px' } },
        h(
          'div',
          { class: 'row' },
          h('span', { class: 'grow hint', text: '还没有选题，从任意一列的下方记一条。' }),
          h('button', {
            class: 'btn sm primary',
            text: '记一条想法',
            onclick: () => {
              const input = document.querySelector('.kcol .add-row input');
              if (input) input.focus();
            }
          })
        )
      )
    );
  }

  const pubItems = visible.filter((i) => i.status === 'published');
  if (pubItems.length) page.append(publishStatsCard(pubItems));

  page.append(board);
  root.append(page);

  if (ctx.query?.new === '1') {
    const input = root.querySelector('.kcol .add-row input');
    if (input) input.focus();
  }
}

export default {
  async render(root, ctx) {
    platformFilter = 'all';
    await render(root, ctx);
  },
  destroy() {
    token += 1;
    rootEl = null;
    ctxRef = null;
  }
};
