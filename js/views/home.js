import { h, svg, icon } from '../ui/el.js';
import { addRow } from '../ui/inline.js';
import { toastUndo } from '../ui/toast.js';
import { all, put, del } from '../core/db.js';
import { track } from '../core/save.js';
import { getSettings, saveSettings } from '../core/settings.js';
import { session } from '../core/session.js';
import { MODULES } from '../core/schema.js';
import {
  todayStr,
  monthDay,
  weekdayCN,
  weekNumber,
  daysLeftInMonth,
  relativeText
} from '../core/dates.js';
import { sortTasks, taskStats } from '../core/library.js';
import { loadSummary } from '../core/summary.js';

const FEATURED_MODULES = ['food', 'fitness', 'study'];

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

function clampPercent(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function progressRing(value, label, className = '') {
  const pct = clampPercent(value);
  return h(
    'div',
    {
      class: `mm-ring ${className}`.trim(),
      role: 'img',
      'aria-label': `${label} ${pct}%`
    },
    svg(
      'svg',
      { viewBox: '0 0 72 72', 'aria-hidden': 'true' },
      svg('circle', { class: 'mm-ring-track', cx: '36', cy: '36', r: '29', pathLength: '100' }),
      svg('circle', {
        class: 'mm-ring-value',
        cx: '36',
        cy: '36',
        r: '29',
        pathLength: '100',
        'stroke-dasharray': '100',
        'stroke-dashoffset': String(100 - pct)
      })
    ),
    h('span', { class: 'mm-ring-number num', text: `${pct}%` })
  );
}

function landscape() {
  const flower = (x, y, scale, cls = '') =>
    svg(
      'g',
      { class: `mm-flower ${cls}`.trim(), transform: `translate(${x} ${y}) scale(${scale})` },
      svg('path', { class: 'mm-stem', d: 'M0 18 C-2 11 1 6 0 0' }),
      svg('circle', { class: 'mm-petal', cx: '-4', cy: '0', r: '4' }),
      svg('circle', { class: 'mm-petal', cx: '4', cy: '0', r: '4' }),
      svg('circle', { class: 'mm-petal', cx: '0', cy: '-4', r: '4' }),
      svg('circle', { class: 'mm-petal', cx: '0', cy: '4', r: '4' }),
      svg('circle', { class: 'mm-flower-core', cx: '0', cy: '0', r: '2.3' })
    );

  return svg(
    'svg',
    {
      class: 'mm-landscape',
      viewBox: '0 0 1200 560',
      preserveAspectRatio: 'xMidYMid slice',
      'aria-hidden': 'true'
    },
    svg(
      'defs',
      null,
      svg(
        'linearGradient',
        { id: 'mm-sky-gradient', x1: '0', y1: '0', x2: '0', y2: '1' },
        svg('stop', { class: 'mm-stop-sky-top', offset: '0%' }),
        svg('stop', { class: 'mm-stop-sky-bottom', offset: '100%' })
      ),
      svg(
        'linearGradient',
        { id: 'mm-lake-gradient', x1: '0', y1: '0', x2: '0', y2: '1' },
        svg('stop', { class: 'mm-stop-lake-top', offset: '0%' }),
        svg('stop', { class: 'mm-stop-lake-bottom', offset: '100%' })
      ),
      svg(
        'linearGradient',
        { id: 'mm-hill-gradient', x1: '0', y1: '0', x2: '1', y2: '1' },
        svg('stop', { class: 'mm-stop-hill-light', offset: '0%' }),
        svg('stop', { class: 'mm-stop-hill-deep', offset: '100%' })
      )
    ),
    svg('rect', { class: 'mm-sky', x: '0', y: '0', width: '1200', height: '560' }),
    svg(
      'g',
      { class: 'mm-clouds' },
      svg('ellipse', { cx: '184', cy: '114', rx: '116', ry: '32' }),
      svg('ellipse', { cx: '278', cy: '96', rx: '76', ry: '24' }),
      svg('ellipse', { cx: '930', cy: '128', rx: '132', ry: '34' }),
      svg('ellipse', { cx: '1040', cy: '108', rx: '84', ry: '25' })
    ),
    svg('path', {
      class: 'mm-hill-far',
      d: 'M0 308 C150 244 260 252 382 300 C520 354 640 240 770 278 C910 318 1025 240 1200 276 L1200 560 L0 560 Z'
    }),
    svg('path', {
      class: 'mm-hill-mid',
      d: 'M0 354 C134 272 304 270 458 354 C612 438 734 276 914 304 C1038 324 1122 294 1200 272 L1200 560 L0 560 Z'
    }),
    svg('path', {
      class: 'mm-lake',
      d: 'M228 374 C432 326 706 326 982 378 C886 492 322 502 228 374 Z'
    }),
    svg('path', {
      class: 'mm-lake-shine',
      d: 'M348 390 C520 370 690 372 846 398 C714 426 472 428 348 390 Z'
    }),
    svg('path', {
      class: 'mm-hill-front-left',
      d: 'M0 382 C124 328 278 354 428 454 C522 516 582 542 624 560 L0 560 Z'
    }),
    svg('path', {
      class: 'mm-hill-front-right',
      d: 'M1200 358 C1040 320 928 366 824 442 C750 496 690 536 648 560 L1200 560 Z'
    }),
    svg('path', {
      class: 'mm-water-line',
      d: 'M388 407 C510 395 642 397 770 412 M438 431 C548 424 646 426 730 437'
    }),
    flower(92, 416, 1.1, 'rose'),
    flower(148, 448, 0.75),
    flower(228, 398, 0.9, 'blue'),
    flower(1010, 408, 1, 'rose'),
    flower(1090, 436, 0.8, 'blue'),
    flower(1140, 390, 0.68),
    svg('path', {
      class: 'mm-grass-detail',
      d: 'M36 496 l10 -24 M58 500 l-2 -28 M82 498 l14 -22 M1114 500 l-8 -26 M1142 502 l4 -30 M1170 494 l-13 -22'
    })
  );
}

function moduleCard(moduleId, { title, description, metric, metricLabel, progress, foot, footAction }) {
  const meta = MODULES.find((m) => m.id === moduleId);
  const card = h('article', {
    class: `mm-module-card mm-module-${moduleId}`,
    'data-card': moduleId,
    draggable: 'true',
    role: 'link',
    tabindex: '0',
    'aria-label': `打开${meta.name}`
  });

  card.append(
    h(
      'div',
      { class: 'mm-module-top' },
      h('span', { class: 'mm-module-icon', 'aria-hidden': 'true' }, icon(meta.icon)),
      h('span', { class: 'mm-module-name', text: meta.name }),
      progressRing(progress, `${meta.name}进度`, 'mm-module-ring')
    ),
    h('div', { class: 'mm-module-metric num', text: metric }),
    h('div', { class: 'mm-module-metric-label', text: metricLabel }),
    h('div', { class: 'mm-module-title', text: title }),
    h('p', { class: 'mm-module-description', text: description }),
    h(
      'button',
      {
        class: 'mm-pill mm-module-action',
        type: 'button',
        onclick: (e) => {
          e.stopPropagation();
          footAction();
        }
      },
      h('span', { text: foot }),
      icon('arrow', 'ico')
    )
  );

  const open = () => ctxRef.navigate(meta.route || `/${moduleId}`);
  card.addEventListener('click', open);
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
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
    if (!FEATURED_MODULES.includes(from) || from === moduleId) return;
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
  const completion = clampPercent(stats.ratio * 100);
  const studyProgress = clampPercent(summary.study.reading?.progress || 0);
  const foodProgress = summary.food.proteinTarget
    ? clampPercent((summary.food.protein / summary.food.proteinTarget) * 100)
    : 0;
  const fitnessProgress = summary.fitness.target
    ? clampPercent((summary.fitness.week / summary.fitness.target) * 100)
    : 0;

  ctx.setMeta(`${monthDay(today)} ${weekdayCN(today)}`);

  const page = h('div', { class: 'page mm-home' });

  const hero = h(
    'section',
    { class: 'mm-hero', 'aria-labelledby': 'mm-home-title' },
    landscape(),
    h('div', { class: 'mm-haze mm-haze-a', 'aria-hidden': 'true' }),
    h('div', { class: 'mm-haze mm-haze-b', 'aria-hidden': 'true' }),
    h(
      'div',
      { class: 'mm-hero-content' },
      h(
        'div',
        { class: 'mm-hero-copy' },
        h('div', { class: 'mm-eyebrow', text: `${monthDay(today)} · ${weekdayCN(today)} · 第 ${weekNumber(today, settings.weekStart)} 周` }),
        h(
          'h1',
          { id: 'mm-home-title', class: 'mm-hero-title' },
          h('span', { text: '今天，吃得' }),
          h('em', { text: '清爽' }),
          h('span', { text: '，' }),
          h('br'),
          h('span', { text: '练得' }),
          h('em', { text: '扎实' })
        ),
        h('p', {
          class: 'mm-hero-lead',
          text: `把三餐、训练与阅读放进同一片安静的节奏里。距月底还有 ${daysLeftInMonth(today)} 天。`
        }),
        h(
          'div',
          { class: 'mm-hero-actions' },
          h(
            'button',
            { class: 'mm-pill mm-pill-primary', type: 'button', onclick: () => ctx.navigate('/today') },
            h('span', { text: '安排今天' }),
            icon('arrow', 'ico')
          ),
          h('span', { class: 'mm-soft-note', text: todayTasks.length ? `今天有 ${todayTasks.length} 件事` : '今天还没有安排' })
        )
      ),
      h(
        'aside',
        { class: 'mm-hero-glass', 'aria-label': '今日完成概览' },
        h('div', { class: 'mm-glass-label', text: '今日完成' }),
        h(
          'div',
          { class: 'mm-hero-progress' },
          progressRing(completion, '今日计划完成度', 'mm-hero-ring'),
          h(
            'div',
            { class: 'mm-progress-copy' },
            h('strong', { class: 'num', text: `${stats.done} / ${stats.total}` }),
            h('span', { text: stats.total ? '件计划已经完成' : '从一件小事开始' })
          )
        ),
        h(
          'div',
          { class: 'mm-hero-facts' },
          h('div', null, h('strong', { class: 'num', text: String(summary.food.meals) }), h('span', { text: '餐记录' })),
          h('div', null, h('strong', { class: 'num', text: `${summary.fitness.week}/${summary.fitness.target}` }), h('span', { text: '本周训练' })),
          h('div', null, h('strong', { class: 'num', text: `${studyProgress}%` }), h('span', { text: '阅读进度' }))
        )
      )
    )
  );

  page.append(hero);

  if (session.dayChanged && yesterdayUndone > 0) {
    page.append(
      h(
        'div',
        { class: 'notice-bar mm-notice' },
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

  const planBlock = h('div', { class: 'card mm-glass-card mm-plan-card', 'data-card': 'plan' });
  planBlock.append(
    h(
      'div',
      { class: 'card-head' },
      h('span', { class: 'mm-card-kicker', text: '今日计划' }),
      h('span', { class: 'mm-card-count num', text: `${stats.done}/${stats.total}` }),
      h('button', {
        class: 'card-link',
        type: 'button',
        text: '完整计划 →',
        onclick: () => ctx.navigate('/today')
      })
    )
  );

  const planList = h('div', { class: 'home-plan' });
  if (!ordered.length) {
    planList.append(h('div', { class: 'mm-empty-line', text: '今天还没有安排，留一点空间也很好。' }));
  }
  for (const task of ordered.slice(0, 8)) {
    const check = h('span', {
      class: `check${task.done ? ' on' : ''}`,
      role: 'checkbox',
      tabindex: '0',
      'aria-label': `${task.done ? '取消完成' : '完成'}：${task.title}`,
      'aria-checked': String(!!task.done),
      onclick: async (e) => {
        e.stopPropagation();
        await track(put('plan', { ...task, done: !task.done }));
        refresh();
      },
      onkeydown: async (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        await track(put('plan', { ...task, done: !task.done }));
        refresh();
      }
    });
    planList.append(
      h(
        'div',
        { class: 'row mm-plan-row' },
        check,
        h('span', { class: task.done ? 'grow done-text' : 'grow', text: task.title })
      )
    );
  }
  planList.append(
    addRow({
      placeholder: '＋ 加一件今天想做的事',
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
  const memoBlock = h('div', { class: 'card mm-glass-card mm-memo-card', 'data-card': 'memos' });
  memoBlock.append(
    h(
      'div',
      { class: 'card-head' },
      h('span', { class: 'mm-card-kicker', text: '林间备忘' }),
      h('span', { class: 'mm-card-count num', text: `${activeMemos.length} 条` })
    )
  );
  if (!activeMemos.length) {
    memoBlock.append(h('div', { class: 'mm-empty-line', text: '想到什么，先像一颗种子一样放在这里。' }));
  }
  for (const memo of activeMemos.slice(0, 3)) {
    memoBlock.append(
      h(
        'div',
        { class: 'row mm-memo-row' },
        h('span', { class: 'mm-seed', 'aria-hidden': 'true' }),
        h('span', { class: 'grow', text: memo.text }),
        h(
          'button',
          {
            class: 'icon-btn',
            type: 'button',
            'aria-label': `删除备忘：${memo.text}`,
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
        class: 'card-link mm-more-link',
        type: 'button',
        text: `还有 ${activeMemos.length - 3} 条 →`,
        onclick: () => ctx.navigate('/today')
      })
    );
  }
  memoBlock.append(
    addRow({
      placeholder: '＋ 随手记下一句话',
      onAdd: async (text) => {
        await track(put('memos', { text, archived: false }));
        refresh();
      }
    })
  );

  const overview = h(
    'section',
    { class: 'mm-section mm-overview', 'aria-labelledby': 'mm-overview-title' },
    h(
      'div',
      { class: 'mm-section-heading' },
      h('div', null, h('span', { class: 'mm-section-kicker', text: 'TODAY' }), h('h2', { id: 'mm-overview-title', text: '今天的节奏' })),
      h('p', { text: '先完成眼前的一件事，其余留给风慢慢吹散。' })
    ),
    h('div', { class: 'mm-overview-grid' }, planBlock, memoBlock)
  );

  const cards = {
    food: () =>
      moduleCard('food', {
        metric: `${summary.food.meals} 餐`,
        metricLabel: `${summary.food.kcal} kcal · 蛋白 ${summary.food.protein}/${summary.food.proteinTarget} g`,
        title: summary.food.meals ? '今天的饮食已经留下痕迹' : '从第一餐开始照顾自己',
        description: summary.food.weight ? `今日体重 ${summary.food.weight} kg` : '体重尚未记录，也可以先记一杯水。',
        progress: foodProgress,
        foot: '记一餐',
        footAction: () => ctx.navigate('/food?add=1')
      }),
    fitness: () =>
      moduleCard('fitness', {
        metric: `${summary.fitness.week} / ${summary.fitness.target}`,
        metricLabel: '本周训练次数',
        title: summary.fitness.todayWorkout ? `今日：${summary.fitness.todayWorkout.title || '训练'}` : '今天还没有训练记录',
        description: `已经连续 ${summary.fitness.streak} 周，保持自己的节奏。`,
        progress: fitnessProgress,
        foot: '记训练',
        footAction: () => ctx.navigate('/fitness?new=1')
      }),
    study: () =>
      moduleCard('study', {
        metric: summary.study.reading ? `${studyProgress}%` : `${summary.study.todo} 篇`,
        metricLabel: summary.study.reading ? '当前文献阅读进度' : '等待开始的文献',
        title: summary.study.reading ? summary.study.reading.title : '还没有正在阅读的文献',
        description: summary.study.nextEvent
          ? `${relativeText(summary.study.nextEvent.datetime.slice(0, 10), today)} · ${summary.study.nextEvent.title}`
          : `待读 ${summary.study.todo} 篇 · 近期没有日程`,
        progress: studyProgress,
        foot: '去学习',
        footAction: () => ctx.navigate('/study?new=1')
      })
  };

  const visibleOrder = settings.homeCards.filter(
    (id) => FEATURED_MODULES.includes(id) && !(settings.hiddenCards || []).includes(id)
  );
  for (const id of FEATURED_MODULES) {
    if (!settings.homeCards.includes(id) && !(settings.hiddenCards || []).includes(id)) visibleOrder.push(id);
  }

  const grid = h('div', { class: 'home-cards mm-module-grid' });
  visibleOrder.forEach((id) => grid.append(cards[id]()));

  const modules = h(
    'section',
    { class: 'mm-section mm-modules', 'aria-labelledby': 'mm-modules-title' },
    h(
      'div',
      { class: 'mm-section-heading' },
      h('div', null, h('span', { class: 'mm-section-kicker', text: 'DAILY TRAILS' }), h('h2', { id: 'mm-modules-title', text: '三条柔软的日常轨迹' })),
      h('p', { text: '饮食、训练与学习，各自生长，又彼此照应。' })
    ),
    grid
  );

  page.append(overview, modules);
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
