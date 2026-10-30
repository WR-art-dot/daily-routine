import { h, icon } from '../ui/el.js';
import { inlineInput, addRow } from '../ui/inline.js';
import { emptyState } from '../ui/empty.js';
import { toast, toastUndo } from '../ui/toast.js';
import { all, put, del, putMany } from '../core/db.js';
import { track } from '../core/save.js';
import { getSettings } from '../core/settings.js';
import { MODULES, moduleMeta } from '../core/schema.js';
import { todayStr, addDays, monthDay, weekdayCN, normalizeTime } from '../core/dates.js';
import { sortTasks, taskStats, leftovers as leftoversOf, normalizeOrders, minutesText } from '../core/library.js';
import { getPullable, getRefIndex, refKey } from '../core/pull.js';

let state = { date: '', filter: 'all', moduleFilter: 'all', limit: 200 };
let token = 0;
let rootEl = null;
let ctxRef = null;
let tasks = [];
let refIndex = new Map();
let pullable = [];

function refresh() {
  if (!rootEl || !ctxRef) return;
  const root = rootEl;
  const ctx = ctxRef;
  root.innerHTML = '';
  render(root, ctx);
}

function tasksForDate() {
  return tasks.filter((t) => t.date === state.date);
}

function visibleTasks() {
  let list = tasksForDate();
  if (state.filter === 'open') list = list.filter((t) => !t.done);
  if (state.moduleFilter !== 'all') list = list.filter((t) => (t.module || 'today') === state.moduleFilter);
  const ordered = sortTasks(list);
  const open = ordered.filter((t) => !t.done);
  const done = ordered.filter((t) => t.done);
  return [...open, ...done];
}

async function commit(task, patch) {
  Object.assign(task, patch);
  await track(put('plan', { ...task }));
}

function refBadge(task) {
  if (!task.refId) return null;
  const ref = refIndex.get(refKey(task.module, task.refId));
  if (!ref) return h('span', { class: 'tag', style: { color: 'var(--danger)' }, text: '来源已删除' });
  if (ref.done) return h('span', { class: 'tag', text: '来源已完成' });
  return null;
}

function taskBlock(task, listEl) {
  const row = h('div', {
    class: 'today-row',
    draggable: 'true',
    'data-id': task.id
  });

  const timeInput = h('input', {
    class: 'input',
    value: task.time || '',
    placeholder: '--:--',
    'aria-label': '时间'
  });
  timeInput.style.width = '46px';
  timeInput.addEventListener('blur', () => {
    const next = normalizeTime(timeInput.value);
    timeInput.value = next;
    if (next !== (task.time || '')) commit(task, { time: next }).then(refresh);
  });
  timeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) timeInput.blur();
  });

  const check = h('span', {
    class: `check${task.done ? ' on' : ''}`,
    role: 'checkbox',
    tabindex: '0',
    'aria-checked': String(!!task.done),
    onclick: async () => {
      const next = !task.done;
      await commit(task, { done: next });
      check.classList.toggle('on', next);
      check.setAttribute('aria-checked', String(next));
      titleInput.classList.toggle('done-text', next);
      updateMeta();
    }
  });

  const titleInput = inlineInput({
    value: task.title,
    placeholder: '任务标题',
    onCommit: (value) => {
      if (!value.trim()) {
        titleInput.value = task.title;
        return;
      }
      commit(task, { title: value.trim() });
    }
  });
  titleInput.classList.add('grow');
  if (task.done) titleInput.classList.add('done-text');

  const dot = h('span', {
    class: 'dot-m',
    style: { background: moduleMeta(task.module || 'today').color },
    title: moduleMeta(task.module || 'today').name
  });

  const estInput = h('input', {
    class: 'input',
    type: 'number',
    value: task.estimateMin ?? '',
    placeholder: '—',
    'aria-label': '预计分钟'
  });
  estInput.style.width = '42px';
  estInput.classList.add('est-cell');
  estInput.style.border = '0';
  estInput.style.background = 'transparent';
  estInput.addEventListener('blur', () => {
    const n = Number(estInput.value) || 0;
    if (n !== (task.estimateMin || 0)) commit(task, { estimateMin: n }).then(() => updateMeta());
  });

  const noteBtn = h(
    'button',
    {
      class: 'icon-btn',
      type: 'button',
      title: '备注',
      onclick: () => {
        noteWrap.hidden = !noteWrap.hidden;
        if (!noteWrap.hidden) noteArea.focus();
      }
    },
    h('span', { text: '·', style: { fontSize: '18px', lineHeight: '1' } })
  );

  const delBtn = h(
    'button',
    { class: 'icon-btn', type: 'button', title: '删除', onclick: () => removeTask(task) },
    icon('close')
  );

  const noteArea = h('textarea', {
    class: 'textarea',
    rows: 2,
    placeholder: '备注',
    value: task.note || ''
  });
  noteArea.addEventListener('blur', () => {
    if ((task.note || '') !== noteArea.value) commit(task, { note: noteArea.value });
  });

  const noteWrap = h('div', { class: 'note-box', hidden: !task.note }, noteArea);

  row.append(
    h('span', { class: 'time-cell' }, timeInput),
    check,
    titleInput,
    refBadge(task) || '',
    dot,
    h('span', { class: 'est-cell' }, estInput),
    h('div', { class: 'row-actions' }, noteBtn, delBtn)
  );

  row.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', task.id);
    e.dataTransfer.effectAllowed = 'move';
    row.classList.add('dragging');
  });
  row.addEventListener('dragend', () => row.classList.remove('dragging'));
  row.addEventListener('dragover', (e) => {
    e.preventDefault();
    const rect = row.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    row.classList.toggle('drop-before', before);
    row.dataset.dropBefore = before ? '1' : '0';
  });
  row.addEventListener('dragleave', () => row.classList.remove('drop-before'));
  row.addEventListener('drop', async (e) => {
    e.preventDefault();
    row.classList.remove('drop-before');
    const draggedId = e.dataTransfer.getData('text/plain');
    if (!draggedId || draggedId === task.id) return;
    const ordered = visibleTasks();
    const fromIdx = ordered.findIndex((t) => t.id === draggedId);
    if (fromIdx < 0) return;
    const [moved] = ordered.splice(fromIdx, 1);
    let toIdx = ordered.findIndex((t) => t.id === task.id);
    if (row.dataset.dropBefore !== '1') toIdx += 1;
    ordered.splice(toIdx, 0, moved);
    const normalized = normalizeOrders(ordered);
    tasks = tasks.map((t) => normalized.find((n) => n.id === t.id) || t);
    await track(putMany('plan', normalized));
    refresh();
  });

  return h('div', { class: 'task-block' }, row, noteWrap);
}

async function removeTask(task) {
  await track(del('plan', task.id));
  tasks = tasks.filter((t) => t.id !== task.id);
  refresh();
  toastUndo('已删除', async () => {
    await track(put('plan', task));
    refresh();
  });
}

function updateMeta() {
  if (!ctxRef) return;
  const stats = taskStats(tasksForDate());
  ctxRef.setMeta(
    `${stats.done}/${stats.total} 完成 · 已排 ${minutesText(stats.minutes)} · ${monthDay(state.date)} ${weekdayCN(state.date)}`
  );
}

function buildList() {
  const listEl = h('div', { class: 'today-list' });
  const all = visibleTasks();
  const items = all.slice(0, state.limit);

  if (!items.length) {
    listEl.append(
      emptyState({
        title: '这一天还没有安排',
        text: '在下面输入一件事，回车就存。',
        center: false
      })
    );
  }

  for (const task of items) listEl.append(taskBlock(task, listEl));

  const adder = addRow({
    placeholder: '＋ 添加任务（时间可空），回车继续加下一行',
    onAdd: async (value) => {
      const base = tasksForDate();
      const next = {
        title: value,
        date: state.date,
        time: '',
        module: 'today',
        refId: null,
        estimateMin: 0,
        priority: 2,
        done: false,
        note: '',
        order: base.length
      };
      const rec = await track(put('plan', next));
      tasks.push(rec);
      refresh();
    }
  });
  if (all.length > items.length) {
    listEl.append(
      h('div', { class: 'row' },
        h('span', { class: 'grow hint', text: `已显示 ${items.length} / ${all.length} 条` }),
        h('button', {
          class: 'btn sm',
          text: '显示更多',
          onclick: () => {
            state.limit += 200;
            refresh();
          }
        })
      )
    );
  }

  listEl.append(adder);

  return { listEl, adder };
}

async function buildSide() {
  const side = h('div', { class: 'today-side' });

  const left = leftoversOf(tasks, state.date);
  const leftCard = h(
    'div',
    { class: 'card' },
    h(
      'div',
      { class: 'card-head' },
      h('span', { class: 'card-title', text: '昨天遗留' }),
      h('span', { class: 'hint', text: String(left.length) })
    ),
    left.length
      ? left.map((t) =>
          h(
            'div',
            { class: 'pull-row' },
            h('span', { class: 't', text: t.title }),
            h('button', {
              type: 'button',
              class: 'chip',
              text: '拉入',
              onclick: async () => {
                await track(put('plan', { ...t, date: state.date, done: false, order: tasksForDate().length }));
                refresh();
              }
            }),
            h('button', {
              type: 'button',
              class: 'chip',
              text: '丢掉',
              onclick: () => removeTask(t)
            })
          )
        )
      : h('div', { class: 'hint', text: '昨天没有剩下的事。' }),
    h('div', { class: 'hint', text: '不自动顺延，由你决定要不要搬。' })
  );

  const pullCard = h(
    'div',
    { class: 'card' },
    h(
      'div',
      { class: 'card-head' },
      h('span', { class: 'card-title', text: '从模块拉取' })
    ),
    pullable.length
      ? pullable.slice(0, 12).map((item) =>
          h(
            'div',
            { class: 'pull-row' },
            h('span', {
              class: 'dot-m',
              style: { background: moduleMeta(item.module).color }
            }),
            h('span', { class: 't', text: item.title }),
            h('span', { class: 'hint', text: item.kind }),
            h('button', {
              type: 'button',
              class: 'chip',
              text: '＋',
              onclick: async () => {
                await track(
                  put('plan', {
                    title: item.title,
                    date: state.date,
                    time: '',
                    module: item.module,
                    refId: item.refId,
                    estimateMin: 0,
                    priority: 2,
                    done: false,
                    note: '',
                    order: tasksForDate().length
                  })
                );
                refresh();
              }
            })
          )
        )
      : h('div', { class: 'hint', text: '今天各模块没有待办的东西。' })
  );

  const stats = taskStats(tasksForDate());
  const capacity = getSettings().dayCapacity || 360;
  const ratio = capacity ? Math.min(1, stats.minutes / capacity) : 0;
  const loadCard = h(
    'div',
    { class: 'card' },
    h('div', { class: 'card-head' }, h('span', { class: 'card-title', text: '今日负荷' })),
    h('div', { class: 'hint', text: `已排 ${minutesText(stats.minutes)} / 可用 ${minutesText(capacity)}` }),
    h('div', { class: 'bar soft', style: { marginTop: '8px' } }, h('i', { style: { width: `${ratio * 100}%`, background: stats.minutes > capacity ? 'var(--warn)' : 'var(--accent)' } }))
  );

  side.append(leftCard, pullCard, loadCard);
  return side;
}

async function buildMemos() {
  const memos = (await all('memos')).filter((m) => !m.archived).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const card = h(
    'div',
    { class: 'card', 'data-card': 'memos' },
    h(
      'div',
      { class: 'card-head' },
      h('span', { class: 'card-title', text: '快速备忘' }),
      h('span', { class: 'hint', text: `${memos.length} 条` })
    )
  );

  for (const memo of memos.slice(0, 20)) {
    card.append(
      h(
        'div',
        { class: 'row sep' },
        h('span', { class: 'grow', text: memo.text }),
        h(
          'div',
          { class: 'row-actions' },
          h('button', {
            class: 'chip',
            type: 'button',
            text: '转任务',
            onclick: async () => {
              await track(
                put('plan', {
                  title: memo.text,
                  date: state.date,
                  time: '',
                  module: 'today',
                  refId: null,
                  estimateMin: 0,
                  priority: 2,
                  done: false,
                  note: '',
                  order: tasksForDate().length
                })
              );
              await track(put('memos', { ...memo, archived: true }));
              toast('已加入今日');
              refresh();
            }
          }),
          h(
            'button',
            {
              class: 'icon-btn',
              type: 'button',
              onclick: async () => {
                await track(del('memos', memo.id));
                refresh();
                toastUndo('备忘已删除', async () => {
                  await track(put('memos', memo));
                  refresh();
                });
              }
            },
            icon('close')
          )
        )
      )
    );
  }

  card.append(
    addRow({
      placeholder: '＋ 随手记一句',
      onAdd: async (text) => {
        await track(put('memos', { text, archived: false }));
        refresh();
      }
    })
  );

  return card;
}

async function render(root, ctx) {
  const t = ++token;
  rootEl = root;
  ctxRef = ctx;
  state.date = ctx.query?.d || state.date || todayStr();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(state.date)) state.date = todayStr();

  tasks = await all('plan');
  refIndex = await getRefIndex();
  pullable = await getPullable(state.date, tasksForDate());
  if (t !== token) return;

  const today = todayStr();

  const dateChips = [
    { label: '昨天', date: addDays(today, -1) },
    { label: '今天', date: today },
    { label: '明天', date: addDays(today, 1) }
  ].map((item) =>
    h('button', {
      class: `chip${state.date === item.date ? ' on' : ''}`,
      type: 'button',
      text: item.label,
      onclick: () => ctx.navigate(`/today?d=${item.date}`)
    })
  );

  const moduleSelect = h(
    'select',
    {
      class: 'select',
      style: { width: '108px' },
      onchange: (e) => {
        state.moduleFilter = e.target.value;
        refresh();
      }
    },
    h('option', { value: 'all', text: '全部模块', selected: state.moduleFilter === 'all' }),
    MODULES.map((m) => h('option', { value: m.id, text: m.name, selected: state.moduleFilter === m.id }))
  );

  const bar = h(
    'div',
    { class: 'page-bar' },
    h('button', {
      class: 'icon-btn',
      type: 'button',
      'aria-label': '前一天',
      onclick: () => ctx.navigate(`/today?d=${addDays(state.date, -1)}`)
    }, h('span', { text: '‹' })),
    ...dateChips,
    h('button', {
      class: 'icon-btn',
      type: 'button',
      'aria-label': '后一天',
      onclick: () => ctx.navigate(`/today?d=${addDays(state.date, 1)}`)
    }, h('span', { text: '›' })),
    h('span', { class: 'page-sub', text: `${monthDay(state.date)} ${weekdayCN(state.date)}` }),
    h('span', { class: 'grow' }),
    h('button', {
      class: `chip${state.filter === 'all' ? ' on' : ''}`,
      type: 'button',
      text: '全部',
      onclick: () => {
        state.filter = 'all';
        refresh();
      }
    }),
    h('button', {
      class: `chip${state.filter === 'open' ? ' on' : ''}`,
      type: 'button',
      text: '未完成',
      onclick: () => {
        state.filter = 'open';
        refresh();
      }
    }),
    moduleSelect
  );

  const { listEl } = buildList();
  const listCard = h('div', { class: 'card', 'data-card': 'plan' }, listEl);
  const side = await buildSide();
  if (t !== token) return;
  const memos = await buildMemos();
  if (t !== token) return;

  root.append(
    h(
      'div',
      { class: 'page' },
      bar,
      h('div', { class: 'today-grid' }, listCard, side),
      h('div', { style: { marginTop: '16px' } }, memos)
    )
  );

  updateMeta();
}

export default {
  async render(root, ctx) {
    state = { date: ctx.query?.d || todayStr(), filter: 'all', moduleFilter: 'all', limit: 200 };
    await render(root, ctx);
  },
  destroy() {
    token += 1;
    rootEl = null;
    ctxRef = null;
  }
};
