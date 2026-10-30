import { h } from '../ui/el.js';
import { addRow } from '../ui/inline.js';
import { toastUndo } from '../ui/toast.js';
import { all, put, del } from '../core/db.js';
import { track } from '../core/save.js';
import { getSettings, saveSettings } from '../core/settings.js';
import { session } from '../core/session.js';
import { MODULES, MEDIA_STATUS, WISH_STATUS, labelOf } from '../core/schema.js';
import {
  todayStr,
  monthDay,
  weekdayCN,
  weekNumber,
  daysLeftInMonth,
  shortDate,
  relativeText
} from '../core/dates.js';
import { sortTasks, taskStats } from '../core/library.js';
import { loadSummary } from '../core/summary.js';

let token = 0;
let rootEl = null;
let ctxRef = null;

function refresh() {
  if (!rootEl || !ctxRef) return;
  const root = rootEl;
  const ctx = ctxRef;
  root.innerHTML = '';
  render(root, ctx);
}

function moduleCard(moduleId, { lines, foot, footAction }) {
  const meta = MODULES.find((m) => m.id === moduleId);
  const card = h('div', {
    class: 'card home-card',
    'data-card': moduleId,
    draggable: 'true',
    role: 'button',
    tabindex: '0'
  });
  card.append(
    h(
      'div',
      { class: 'hc-head' },
      h('span', { class: 'dot-m', style: { background: meta.color } }),
      h('span', { class: 'hc-name', text: meta.name })
    )
  );
  lines.forEach((line, i) => {
    card.append(h('div', { class: i === 0 ? 'hc-line' : 'hc-sub', text: line || ' ' }));
  });
  if (foot) {
    card.append(
      h('div', {
        class: 'hc-foot',
        role: 'button',
        tabindex: '0',
        text: foot,
        onclick: (e) => {
          e.stopPropagation();
          footAction();
        }
      })
    );
  }

  card.addEventListener('click', () => ctxRef.navigate(meta.route || `/${moduleId}`));
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') ctxRef.navigate(`/${moduleId}`);
  });

  card.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', moduleId);
    e.dataTransfer.effectAllowed = 'move';
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', () => card.classList.remove('dragging'));
  card.addEventListener('dragover', (e) => e.preventDefault());
  card.addEventListener('drop', async (e) => {
    e.preventDefault();
    const from = e.dataTransfer.getData('text/plain');
    if (!from || from === moduleId) return;
    const settings = getSettings();
    const order = settings.homeCards.filter((id) => id !== from);
    const at = order.indexOf(moduleId);
    order.splice(at < 0 ? order.length : at, 0, from);
    await saveSettings({ homeCards: order });
    refresh();
  });

  return card;
}

async function render(root, ctx) {
  const t = ++token;
  rootEl = root;
  ctxRef = ctx;

  const today = todayStr();
  const settings = getSettings();
  const [planTasks, memos, summary] = await Promise.all([all('plan'), all('memos'), loadSummary(today)]);
  if (t !== token) return;

  const todayTasks = planTasks.filter((task) => task.date === today);
  const stats = taskStats(todayTasks);
  const ordered = sortTasks(todayTasks);
  const yesterdayUndone = planTasks.filter((task) => task.date !== today && !task.done && task.date < today).length;

  ctx.setMeta(`${monthDay(today)} ${weekdayCN(today)}`);

  const page = h('div', { class: 'page' });

  if (session.dayChanged && yesterdayUndone > 0) {
    page.append(
      h(
        'div',
        { class: 'notice-bar' },
        h('span', { text: `昨天还有 ${yesterdayUndone} 条没做完` }),
        h('button', {
          class: 'card-link',
          type: 'button',
          text: '去今日计划 →',
          onclick: () => ctx.navigate('/today')
        })
      )
    );
  }

  const dateBar = h(
    'div',
    { class: 'card' },
    h('div', { class: 'hc-head', style: { marginBottom: '2px' } },
      h('span', { class: 'card-title', text: `${monthDay(today)} ${weekdayCN(today)}` })
    ),
    h('div', { class: 'hint', text: `第 ${weekNumber(today, settings.weekStart)} 周 · 距月底 ${daysLeftInMonth(today)} 天` })
  );

  const progressCard = h(
    'div',
    { class: 'card' },
    h(
      'div',
      { class: 'flex' },
      h('span', { class: 'hint', text: '今日完成' }),
      h('span', { class: 'hint align-end num', text: `${stats.done} / ${stats.total}` })
    ),
    h(
      'div',
      { class: 'bar soft', style: { marginTop: '8px' } },
      h('i', { style: { width: `${Math.round(stats.ratio * 100)}%` } })
    )
  );

  const planBlock = h('div', { class: 'card' });
  planBlock.append(
    h(
      'div',
      { class: 'card-head' },
      h('span', { class: 'card-title', text: '今日计划' }),
      h('button', {
        class: 'card-link',
        type: 'button',
        text: '打开完整页 →',
        onclick: () => ctx.navigate('/today')
      })
    )
  );

  const planList = h('div', { class: 'home-plan' });
  if (!ordered.length) {
    planList.append(h('div', { class: 'hint', style: { padding: '6px 4px' }, text: '今天还没有安排。' }));
  }
  for (const task of ordered.slice(0, 12)) {
    const check = h('span', {
      class: `check${task.done ? ' on' : ''}`,
      role: 'checkbox',
      tabindex: '0',
      'aria-checked': String(!!task.done),
      onclick: async (e) => {
        e.stopPropagation();
        await track(put('plan', { ...task, done: !task.done }));
        refresh();
      }
    });
    planList.append(
      h(
        'div',
        { class: 'row' },
        check,
        h('span', { class: task.done ? 'grow done-text' : 'grow', text: task.title })
      )
    );
  }
  planList.append(
    addRow({
      placeholder: '＋ 加一件事，回车即存',
      onAdd: async (value) => {
        await track(
          put('plan', {
            title: value,
            date: today,
            time: '',
            module: 'today',
            refId: null,
            estimateMin: 0,
            priority: 2,
            done: false,
            note: '',
            order: todayTasks.length
          })
        );
        refresh();
      }
    })
  );
  planBlock.append(planList);

  const activeMemos = memos.filter((m) => !m.archived).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const memoBlock = h('div', { class: 'card' });
  memoBlock.append(
    h(
      'div',
      { class: 'card-head' },
      h('span', { class: 'card-title', text: '快速备忘' }),
      h('span', { class: 'hint', text: `${activeMemos.length} 条` })
    )
  );
  if (!activeMemos.length) {
    memoBlock.append(h('div', { class: 'hint', style: { padding: '4px 4px 8px' }, text: '想到什么随手记一句。' }));
  }
  for (const memo of activeMemos.slice(0, 3)) {
    memoBlock.append(
      h(
        'div',
        { class: 'row sep' },
        h('span', { class: 'dot-m', style: { background: 'var(--line-strong)' } }),
        h('span', { class: 'grow', text: memo.text }),
        h(
          'button',
          {
            class: 'icon-btn',
            type: 'button',
            'aria-label': '删除备忘',
            onclick: async () => {
              await track(del('memos', memo.id));
              refresh();
              toastUndo('备忘已删除', async () => {
                await track(put('memos', memo));
                refresh();
              });
            }
          },
          h('span', { text: '×' })
        )
      )
    );
  }
  if (activeMemos.length > 3) {
    memoBlock.append(
      h('button', {
        class: 'card-link',
        type: 'button',
        text: `还有 ${activeMemos.length - 3} 条 →`,
        onclick: () => ctx.navigate('/today')
      })
    );
  }
  memoBlock.append(
    addRow({
      placeholder: '＋ 随手记一句',
      onAdd: async (text) => {
        await track(put('memos', { text, archived: false }));
        refresh();
      }
    })
  );

  const cards = {
    media: () =>
      moduleCard('media', {
        lines: summary.media.empty
          ? ['还没有选题', '从一条想法开始']
          : [
              summary.media.title,
              `${labelOf(MEDIA_STATUS, summary.media.status)} · ${
                summary.media.plannedDate ? `计划 ${shortDate(summary.media.plannedDate)} 发` : '未排日期'
              }${summary.media.overdue ? ' · 已过期' : ''}`
            ],
        foot: '＋ 新选题',
        footAction: () => ctx.navigate('/media?new=1')
      }),
    dev: () =>
      moduleCard('dev', {
        lines: summary.dev.empty
          ? ['还没有项目', '建一个项目开始记']
          : [
              summary.dev.project.name,
              `${summary.dev.openBugs} 个未解决 bug · ${summary.dev.openTasks} 个待办`,
              summary.dev.hasLog ? '今天已写日志' : '今天还没写日志'
            ],
        foot: summary.dev.hasLog ? '看日志' : '＋ 写日志',
        footAction: () =>
          ctx.navigate(
            summary.dev.project ? `/dev/${summary.dev.project.id}/log` : '/dev'
          )
      }),
    study: () =>
      moduleCard('study', {
        lines: summary.study.empty
          ? ['还没有文献', '加一篇在读的开始']
          : [
              summary.study.reading ? summary.study.reading.title : '没有在读的文献',
              `待读 ${summary.study.todo} 篇`,
              summary.study.nextEvent
                ? `${relativeText(summary.study.nextEvent.datetime.slice(0, 10), today)} ${summary.study.nextEvent.title}`
                : '近期没有日程'
            ],
        foot: '＋ 加文献',
        footAction: () => ctx.navigate('/study?new=1')
      }),
    fitness: () =>
      moduleCard('fitness', {
        lines: summary.fitness.empty
          ? ['还没有训练记录', '记一次训练开始']
          : [
              summary.fitness.todayWorkout ? `今日：${summary.fitness.todayWorkout.title || '训练'}` : '今天还没练',
              `本周 ${summary.fitness.week} / ${summary.fitness.target} 次`,
              `连续 ${summary.fitness.streak} 周`
            ],
        foot: '＋ 直接记一条',
        footAction: () => ctx.navigate('/fitness?new=1')
      }),
    food: () =>
      moduleCard('food', {
        lines: [
          `已记 ${summary.food.meals} 餐 · ${summary.food.kcal} kcal`,
          `蛋白 ${summary.food.protein} / ${summary.food.proteinTarget} g`,
          summary.food.weight ? `体重 ${summary.food.weight} kg` : '今天还没称'
        ],
        foot: '＋ 记一餐',
        footAction: () => ctx.navigate('/food?add=1')
      }),
    play: () =>
      moduleCard('play', {
        lines: summary.play.empty
          ? ['清单还空着', '随手记下想做的事']
          : [
              `本周挑了 ${summary.play.pinned} 件`,
              summary.play.first ? summary.play.first.title : `想做 ${summary.play.active} 件`,
              summary.play.first ? labelOf(WISH_STATUS, summary.play.first.status) : ''
            ],
        foot: '随机抽一条',
        footAction: () => ctx.navigate('/play?random=1')
      })
  };

  const order = settings.homeCards.filter(
    (id) => cards[id] && !(settings.hiddenCards || []).includes(id)
  );
  const grid = h('div', { class: 'home-cards' });
  order.forEach((id) => grid.append(cards[id]()));

  page.append(
    h('div', { class: 'home-top' }, dateBar, progressCard),
    h('div', { class: 'home-mid' }, planBlock, memoBlock),
    grid
  );

  root.append(page);
}

export default {
  async render(root, ctx) {
    await render(root, ctx);
  },
  destroy() {
    token += 1;
    rootEl = null;
    ctxRef = null;
  }
};
