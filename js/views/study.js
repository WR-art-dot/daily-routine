import { h, icon } from '../ui/el.js';
import { addRow } from '../ui/inline.js';
import { emptyState } from '../ui/empty.js';
import { toastUndo } from '../ui/toast.js';
import { openDrawer } from '../ui/drawer.js';
import { confirmDialog } from '../ui/modal.js';
import { all, put, del } from '../core/db.js';
import { track } from '../core/save.js';
import { getSettings } from '../core/settings.js';
import { REF_STATUS, EVENT_KINDS, OUTPUT_KINDS, labelOf } from '../core/schema.js';
import { refFilter, eventsOnDay, upcomingEvents } from '../core/library.js';
import { todayStr, addDays, shortDate, weekdayCN, monthDay, relativeText, diffDays } from '../core/dates.js';

let token = 0;
let rootEl = null;
let ctxRef = null;
let refs = [];
let events = [];
let outputs = [];

let statusFilter = 'all';
let tagFilter = '';
let query = '';
let sortBy = 'year';
let selectedRefId = null;
let editingOutputId = null;

function refresh() {
  if (!rootEl || !ctxRef) return;
  const root = rootEl;
  const ctx = ctxRef;
  root.innerHTML = '';
  render(root, ctx);
}

function allTags() {
  const registry = getSettings().refTags || [];
  const used = new Set(refs.flatMap((r) => r.tags || []));
  return [...new Set([...registry, ...used])];
}

async function cycleStatus(ref) {
  const ids = REF_STATUS.map((s) => s.id);
  const next = ids[(ids.indexOf(ref.status) + 1) % ids.length];
  const patch = { ...ref, status: next };
  if (next === 'reading' && !ref.progress) patch.progress = 1;
  if (next === 'done') patch.progress = 100;
  if (next === 'todo') patch.progress = 0;
  Object.assign(ref, patch);
  await track(put('refs', patch));
  refresh();
}

function openEvent(event) {
  const titleInput = h('input', { class: 'input', value: event.title || '', placeholder: '标题' });
  const kindSelect = h(
    'select',
    { class: 'select' },
    EVENT_KINDS.map((k) => h('option', { value: k.id, text: k.name, selected: event.kind === k.id }))
  );
  const dtInput = h('input', { class: 'input', type: 'datetime-local', value: event.datetime || '' });
  const noteArea = h('textarea', {
    class: 'textarea',
    rows: 4,
    placeholder: '要交的东西 / 上次讨论的遗留问题',
    value: event.note || ''
  });

  const drawer = openDrawer({
    title: '日程详情',
    body: h('div', { class: 'stack' }, titleInput, h('div', { class: 'row' }, kindSelect, dtInput), noteArea),
    foot: h(
      'div',
      { class: 'row', style: { width: '100%' } },
      h('button', {
        class: 'btn danger',
        text: '删除',
        onclick: async () => {
          const ok = await confirmDialog({ title: '删除这个日程？', confirmText: '删除', danger: true });
          if (!ok) return;
          drawer.close();
          await track(del('events', event.id));
          refresh();
        }
      }),
      h('button', {
        class: 'btn primary',
        text: '保存',
        style: { marginLeft: 'auto' },
        onclick: async () => {
          await track(
            put('events', {
              ...event,
              title: titleInput.value.trim() || '未命名日程',
              kind: kindSelect.value,
              datetime: dtInput.value,
              note: noteArea.value
            })
          );
          drawer.close();
          refresh();
        }
      })
    )
  });
}

function strip() {
  const today = todayStr();
  const wrap = h('div', { class: 'strip' });
  for (let i = 0; i < 14; i += 1) {
    const date = addDays(today, i);
    const dayEvents = eventsOnDay(events, date);
    const cell = h('div', { class: `strip-day${date === today ? ' today' : ''}` });
    cell.append(
      h('div', { class: 'strip-date', text: `${shortDate(date)} ${weekdayCN(date).slice(1)}` })
    );
    if (!dayEvents.length) cell.append(h('div', { class: 'strip-date', text: '—' }));
    for (const ev of dayEvents) {
      cell.append(
        h('div', {
          class: `strip-ev ${ev.kind || 'meeting'}`,
          text: ev.title,
          title: ev.title,
          onclick: () => openEvent(ev)
        })
      );
    }
    wrap.append(cell);
  }
  return wrap;
}

function refRow(ref, selected) {
  const statusCell = h('span', {
    class: 'tag',
    role: 'button',
    tabindex: '0',
    text: labelOf(REF_STATUS, ref.status),
    onclick: async (e) => {
      e.stopPropagation();
      await cycleStatus(ref);
    }
  });
  return h(
    'tr',
    {
      class: selected ? 'sel' : '',
      onclick: () => {
        selectedRefId = ref.id;
        refresh();
      }
    },
    h('td', {}, h('div', { style: { fontWeight: '500' }, text: ref.title })),
    h('td', { class: 'num', text: ref.year ? String(ref.year) : '—' }),
    h('td', {}, statusCell),
    h('td', { class: 'num', text: `${ref.progress || 0}%` })
  );
}

function detailPanel() {
  const ref = refs.find((r) => r.id === selectedRefId);
  if (!ref) {
    return h(
      'div',
      { class: 'card' },
      h('div', { class: 'hint', text: '选一篇文献看详情和笔记。' })
    );
  }

  const progress = h('input', {
    type: 'range',
    min: '0',
    max: '100',
    step: '5',
    value: String(ref.progress || 0),
    style: { width: '100%' }
  });
  const progressLabel = h('span', { class: 'hint num', text: `${ref.progress || 0}%` });
  progress.addEventListener('input', () => {
    progressLabel.textContent = `${progress.value}%`;
  });
  progress.addEventListener('change', async () => {
    const value = Number(progress.value);
    const patch = { ...ref, progress: value };
    if (value >= 100) patch.status = 'done';
    else if (value > 0 && ref.status !== 'reading') patch.status = 'reading';
    await track(put('refs', patch));
    refresh();
  });

  const tags = allTags();
  const tagChips = tags.map((tag) =>
    h('button', {
      class: `chip${(ref.tags || []).includes(tag) ? ' on' : ''}`,
      type: 'button',
      text: tag,
      onclick: async () => {
        const current = new Set(ref.tags || []);
        if (current.has(tag)) current.delete(tag);
        else current.add(tag);
        await track(put('refs', { ...ref, tags: [...current] }));
        refresh();
      }
    })
  );

  const note = h('textarea', {
    class: 'textarea',
    rows: 8,
    placeholder: '笔记',
    value: ref.note || ''
  });
  note.addEventListener('blur', async () => {
    if ((ref.note || '') === note.value) return;
    await track(put('refs', { ...ref, note: note.value }));
  });

  const statusChips = REF_STATUS.map((s) =>
    h('button', {
      class: `chip${ref.status === s.id ? ' on' : ''}`,
      type: 'button',
      text: s.name,
      onclick: async () => {
        const patch = { ...ref, status: s.id };
        if (s.id === 'done') patch.progress = 100;
        if (s.id === 'todo') patch.progress = 0;
        if (s.id === 'reading' && !ref.progress) patch.progress = 1;
        await track(put('refs', patch));
        refresh();
      }
    })
  );

  return h(
    'div',
    { class: 'card' },
    h('div', { class: 'stack' },
      h('div', { style: { fontSize: '15px', fontWeight: '500' }, text: ref.title }),
      h('div', { class: 'hint', text: `${ref.author || '佚名'} · ${ref.year || '—'}` }),
      h('div', { class: 'flex-wrap' }, ...statusChips),
      h('div', { class: 'row' }, h('span', { class: 'hint', text: '进度' }), progress, progressLabel),
      tags.length ? h('div', { class: 'flex-wrap' }, ...tagChips) : h('div', { class: 'hint', text: '去设置里加标签，就能给文献分类。' }),
      note,
      h(
        'div',
        { class: 'row' },
        h('span', { class: 'grow' }),
        h('button', {
          class: 'btn danger sm',
          text: '删除这篇',
          onclick: async () => {
            const ok = await confirmDialog({
              title: '删除这篇文献？',
              message: '笔记会一起删掉。',
              confirmText: '删除',
              danger: true
            });
            if (!ok) return;
            await track(del('refs', ref.id));
            selectedRefId = null;
            refresh();
          }
        })
      )
    )
  );
}

function outputsCard() {
  const card = h('div', { class: 'card' });
  card.append(
    h(
      'div',
      { class: 'card-head' },
      h('span', { class: 'card-title', text: '输出物' }),
      h('span', { class: 'hint', text: String(outputs.length) })
    )
  );

  if (!outputs.length) card.append(h('div', { class: 'hint', text: '摘要、提纲、写作片段都放这里。' }));

  for (const out of outputs.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))) {
    card.append(
      h(
        'div',
        { class: 'row sep' },
        h('span', { class: 'tag', text: labelOf(OUTPUT_KINDS, out.kind) }),
        h('span', { class: 'grow', text: out.title }),
        h('span', { class: 'hint', text: shortDate(new Date(out.updatedAt || Date.now()).toISOString().slice(0, 10)) })
      )
    );
  }

  card.append(
    addRow({
      placeholder: '＋ 新输出物，回车创建',
      onAdd: async (value) => {
        const rec = await track(put('outputs', { kind: 'fragment', title: value, body: '' }));
        editingOutputId = rec.id;
        refresh();
      }
    })
  );
  return card;
}

function outputEditor(out) {
  const titleInput = h('input', { class: 'input', value: out.title, placeholder: '标题' });
  const kindSelect = h(
    'select',
    { class: 'select', style: { width: '110px' } },
    OUTPUT_KINDS.map((k) => h('option', { value: k.id, text: k.name, selected: out.kind === k.id }))
  );
  const bodyArea = h('textarea', {
    class: 'textarea',
    rows: 24,
    placeholder: '正文',
    value: out.body || ''
  });
  bodyArea.style.minHeight = '52vh';

  let timer = null;
  bodyArea.addEventListener('input', () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      await track(put('outputs', { ...out, body: bodyArea.value }));
    }, 400);
  });

  const saveAndBack = async () => {
    await track(put('outputs', { ...out, title: titleInput.value.trim() || out.title, kind: kindSelect.value, body: bodyArea.value }));
    editingOutputId = null;
    refresh();
  };

  const page = h(
    'div',
    { class: 'page' },
    h(
      'div',
      { class: 'page-bar' },
      h('button', {
        class: 'btn ghost',
        text: '← 返回',
        onclick: saveAndBack
      }),
      titleInput,
      kindSelect,
      h('span', { class: 'grow' }),
      h('button', {
        class: 'btn danger',
        text: '删除',
        onclick: async () => {
          const ok = await confirmDialog({ title: '删除这份输出物？', confirmText: '删除', danger: true });
          if (!ok) return;
          await track(del('outputs', out.id));
          editingOutputId = null;
          refresh();
        }
      })
    ),
    h('div', { class: 'card' }, bodyArea)
  );

  page.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') saveAndBack();
  });

  setTimeout(() => bodyArea.focus(), 0);
  return page;
}

async function render(root, ctx) {
  const t = ++token;
  rootEl = root;
  ctxRef = ctx;

  refs = await all('refs');
  events = await all('events');
  outputs = await all('outputs');
  if (t !== token) return;

  if (editingOutputId) {
    const out = outputs.find((o) => o.id === editingOutputId);
    if (out) {
      root.append(outputEditor(out));
      ctx.setMeta('输出物编辑中 · Esc 返回');
      return;
    }
    editingOutputId = null;
  }

  const next = upcomingEvents(events, todayStr(), 30)[0];
  ctx.setMeta(
    `待读 ${refs.filter((r) => r.status === 'todo').length} · 在读 ${refs.filter((r) => r.status === 'reading').length}${
      next ? ` · ${relativeText(next.datetime.slice(0, 10))} ${next.title}` : ''
    }`
  );

  const statusChips = [{ id: 'all', name: '全部' }, ...REF_STATUS].map((s) =>
    h('button', {
      class: `chip${statusFilter === s.id ? ' on' : ''}`,
      type: 'button',
      text: s.name,
      onclick: () => {
        statusFilter = s.id;
        refresh();
      }
    })
  );

  const tags = allTags();
  const tagChips = [
    h('button', {
      class: `chip${!tagFilter ? ' on' : ''}`,
      type: 'button',
      text: '全部标签',
      onclick: () => {
        tagFilter = '';
        refresh();
      }
    }),
    ...tags.map((tag) =>
      h('button', {
        class: `chip${tagFilter === tag ? ' on' : ''}`,
        type: 'button',
        text: tag,
        onclick: () => {
          tagFilter = tagFilter === tag ? '' : tag;
          refresh();
        }
      })
    )
  ];

  const search = h('input', { class: 'input', placeholder: '搜题名或作者', value: query });
  search.style.width = '180px';
  search.addEventListener('input', () => {
    query = search.value;
    const listEl = root.querySelector('[data-role="ref-rows"]');
    if (!listEl) return;
    const list = refFilter(refs, { status: statusFilter, tag: tagFilter, q: query, sort: sortBy });
    listEl.innerHTML = '';
    list.forEach((ref) => listEl.append(refRow(ref, ref.id === selectedRefId)));
  });

  const sortSelect = h(
    'select',
    {
      class: 'select',
      style: { width: '96px' },
      onchange: (e) => {
        sortBy = e.target.value;
        refresh();
      }
    },
    [
      ['year', '按年份'],
      ['title', '按题名'],
      ['progress', '按进度']
    ].map(([value, label]) => h('option', { value, text: label, selected: sortBy === value }))
  );

  const list = refFilter(refs, { status: statusFilter, tag: tagFilter, q: query, sort: sortBy });
  const table = h(
    'table',
    { class: 'ref-table' },
    h(
      'thead',
      {},
      h(
        'tr',
        {},
        h('th', { text: '题名' }),
        h('th', { text: '年份', style: { width: '56px' } }),
        h('th', { text: '状态', style: { width: '64px' } }),
        h('th', { text: '进度', style: { width: '56px' } })
      )
    ),
    h('tbody', { 'data-role': 'ref-rows' }, list.map((ref) => refRow(ref, ref.id === selectedRefId)))
  );

  const leftCard = h(
    'div',
    { class: 'card' },
    h('div', { class: 'page-bar', style: { marginBottom: '8px' } }, ...statusChips, h('span', { class: 'grow' }), search, sortSelect),
    tags.length ? h('div', { class: 'flex-wrap', style: { marginBottom: '8px' } }, ...tagChips) : null,
    refs.length ? table : emptyState({ title: '还没有文献', text: '在下面输入题名，回车加一篇。' }),
    addRow({
      placeholder: '＋ 添加文献（先写题名，作者年份再到详情里补）',
      onAdd: async (value) => {
        const rec = await track(
          put('refs', { title: value, author: '', year: null, tags: [], status: 'todo', progress: 0, note: '' })
        );
        selectedRefId = rec.id;
        refresh();
      }
    })
  );

  const rightCol = h('div', { class: 'stack' }, detailPanel(), outputsCard());

  root.append(
    h(
      'div',
      { class: 'page' },
      h(
        'div',
        { class: 'page-bar' },
        h('span', { class: 'page-sub', text: '未来两周' }),
        h('span', { class: 'grow' }),
        h('button', {
          class: 'btn sm',
          text: '＋ 加日程',
          onclick: () => {
            const now = new Date();
            const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T14:00`;
            openEvent({ id: null, title: '', kind: 'meeting', datetime: iso, note: '' });
          }
        })
      ),
      strip(),
      h('div', { class: 'study-grid' }, leftCard, rightCol)
    )
  );

  if (ctx.query?.new === '1') {
    const input = root.querySelector('.add-row input');
    if (input) input.focus();
  }
}

export default {
  async render(root, ctx) {
    statusFilter = 'all';
    tagFilter = '';
    query = '';
    await render(root, ctx);
  },
  destroy() {
    token += 1;
    rootEl = null;
    ctxRef = null;
    editingOutputId = null;
  }
};
