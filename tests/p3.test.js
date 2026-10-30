import test from 'node:test';
import assert from 'node:assert/strict';

import { setupDom, teardown, click, wait } from './helpers/dom.js';

const dom = setupDom();

const { put, all, clearStore, STORE_NAMES } = await import('../js/core/db.js');
const { todayStr, addDays } = await import('../js/core/dates.js');
const lib = await import('../js/core/library.js');
const { initSettings, saveSettings } = await import('../js/core/settings.js');
const { session } = await import('../js/core/session.js');
const homeView = (await import('../js/views/home.js')).default;
const todayView = (await import('../js/views/today.js')).default;

async function resetAll() {
  for (const store of STORE_NAMES) await clearStore(store);
}

async function mount(view, query = {}) {
  const root = document.getElementById('view');
  root.innerHTML = '';
  const meta = [];
  const nav = [];
  await view.render(root, { params: {}, query, setMeta: (m) => meta.push(m), navigate: (p) => nav.push(p) });
  return { root, meta, nav };
}

test('P3 · 六个摘要各自的取值规则', () => {
  const today = '2026-10-30';
  const media = [
    { id: 'a', title: '已发', status: 'published', plannedDate: '2026-10-20', updatedAt: 1 },
    { id: 'b', title: '晚点发', status: 'idea', plannedDate: '2026-11-05', updatedAt: 2 },
    { id: 'c', title: '该发了', status: 'drafting', plannedDate: '2026-10-29', updatedAt: 3 }
  ];
  const m = lib.summaryMedia(media, today);
  assert.equal(m.title, '该发了');
  assert.equal(m.overdue, true);
  assert.equal(m.published, 1);
  assert.equal(lib.summaryMedia([], today).empty, true);

  const dev = lib.summaryDev(
    [
      { id: 'p1', name: '旧项目', status: 'paused', updatedAt: 5 },
      { id: 'p2', name: '在做的', status: 'active', updatedAt: 9 }
    ],
    [
      { id: 'b1', projectId: 'p2', status: 'open' },
      { id: 'b2', projectId: 'p2', status: 'fixed' }
    ],
    [{ id: 't1', projectId: 'p2', done: false }],
    [{ id: 'l1', projectId: 'p2', date: today }],
    today
  );
  assert.equal(dev.project.id, 'p2');
  assert.equal(dev.openBugs, 1);
  assert.equal(dev.hasLog, true);

  const study = lib.summaryStudy(
    [
      { id: 'r1', title: '在读的', status: 'reading', updatedAt: 3 },
      { id: 'r2', title: '待读的', status: 'todo' }
    ],
    [{ id: 'e1', title: '组会', datetime: '2026-11-02T14:00' }],
    today
  );
  assert.equal(study.reading.title, '在读的');
  assert.equal(study.todo, 1);
  assert.equal(study.eventIn, 3);

  const fit = lib.summaryFitness(
    [{ id: 'w1', date: '2026-10-28', title: '下肢' }],
    today,
    4,
    1
  );
  assert.equal(fit.todayWorkout, null);
  assert.equal(fit.week, 1);

  const food = lib.summaryFood(
    [{ id: 'm1', date: today, items: [{ kcal: 400, protein: 20 }, { kcal: 200, protein: 10 }] }],
    [{ id: 'w', date: today, kg: 68.4, at: 1 }],
    { kcal: 2100, protein: 120 },
    today
  );
  assert.equal(food.meals, 1);
  assert.equal(food.kcal, 600);
  assert.equal(food.protein, 30);
  assert.equal(food.weight, 68.4);

  const wish = lib.summaryWish([
    { id: 'x1', title: '钉住的', status: 'want', weekPinned: true },
    { id: 'x2', title: '没钉的', status: 'want' }
  ]);
  assert.equal(wish.pinned, 1);
  assert.equal(wish.first.title, '钉住的');
  assert.equal(wish.active, 2);
});

test('P3 · 首页渲染出进度、今日计划与三个模块入口', async () => {
  await resetAll();
  await initSettings();
  await saveSettings({ homeCards: ['media', 'dev', 'study', 'fitness', 'food', 'play'], hiddenCards: [] });
  session.dayChanged = false;

  const today = todayStr();
  await put('plan', { id: 'a', title: '写提纲', date: today, done: false, order: 0, module: 'today' });
  await put('plan', { id: 'b', title: '跑步', date: today, done: true, order: 1, module: 'fitness' });
  await put('media', { id: 'm', title: '一篇稿子', status: 'drafting', plannedDate: addDays(today, 2) });
  await put('projects', { id: 'p', name: 'api-service', status: 'active' });
  await put('bugs', { id: 'bug', projectId: 'p', title: '登录超时', status: 'open' });
  await put('refs', { id: 'r', title: '环境想象', status: 'reading', progress: 40 });
  await put('wishes', { id: 'w', title: '打完第三章', status: 'want', weekPinned: true });

  const { root, meta } = await mount(homeView);
  assert.ok(meta[0].includes('10 月 30 日'), `顶部应显示日期，实际 ${meta[0]}`);
  assert.ok(root.textContent.includes('1 / 2'), '应显示完成进度');

  const ids = [...root.querySelectorAll('.mm-module-card')].map((c) => c.dataset.card);
  assert.deepEqual(ids, ['study', 'fitness', 'food'], '首页应只呈现学习/运动/饮食三个入口');

  assert.ok(root.textContent.includes('环境想象'), '学习入口应显示在读文献');
  assert.ok(root.textContent.includes('40%'), '学习入口应显示阅读进度');
  assert.ok(root.textContent.includes('今天还没有训练记录'), '运动入口应显示当日训练状态');
  assert.ok(root.textContent.includes('餐记录'), '饮食入口应显示餐数');
});

test('P3 · 首页勾选与今日计划双向同步', async () => {
  await resetAll();
  await initSettings();
  const today = todayStr();
  await put('plan', { id: 'a', title: '同步测试', date: today, done: false, order: 0, module: 'today' });

  const first = await mount(homeView);
  const check = first.root.querySelector('.home-plan .check');
  assert.ok(check, '首页计划块应有勾选框');
  click(check);
  await wait(100);

  const rows = await all('plan');
  assert.equal(rows.find((r) => r.id === 'a').done, true, '首页勾选应写库');

  const second = await mount(todayView);
  const todayCheck = second.root.querySelector('.today-row .check');
  assert.ok(todayCheck.classList.contains('on'), '今日计划页应显示为已完成');
});

test('P3 · 首页三入口的顺序与隐藏来自设置', async () => {
  await resetAll();
  await initSettings();
  await saveSettings({ homeCards: ['fitness', 'food', 'media', 'dev', 'study'], hiddenCards: ['study'] });

  const { root } = await mount(homeView);
  const ids = [...root.querySelectorAll('.mm-module-card')].map((c) => c.dataset.card);
  assert.deepEqual(ids, ['fitness', 'food'], '被隐藏的模块不应出现在首页');
});

test('P3 · 跨天且有遗留时给出提示', async () => {
  await resetAll();
  await initSettings();
  const today = todayStr();
  await put('plan', { id: 'y', title: '昨天没做完', date: addDays(today, -1), done: false, order: 0 });

  session.dayChanged = true;
  const { root } = await mount(homeView);
  assert.ok(root.textContent.includes('昨天还有 1 条没做完'), '应给出跨天提示');
  const jump = [...root.querySelectorAll('button')].find((b) => b.textContent.includes('去今日计划'));
  assert.ok(jump, '提示应带跳转');
  click(jump);
  session.dayChanged = false;
});

test('P3 · 设置里缺少三入口时仍补齐', async () => {
  await resetAll();
  await initSettings();
  await saveSettings({ homeCards: ['media', 'dev'], hiddenCards: [] });

  const { root } = await mount(homeView);
  const ids = [...root.querySelectorAll('.mm-module-card')].map((c) => c.dataset.card);
  assert.deepEqual(ids, ['food', 'fitness', 'study'], '设置里没有也要保证三条日常入口存在');
});

test('P3 · 空数据时首页不塌陷', async () => {
  await resetAll();
  await initSettings();
  await saveSettings({ homeCards: ['media', 'dev', 'study', 'fitness', 'food', 'play'], hiddenCards: [] });
  const { root } = await mount(homeView);
  assert.equal(root.querySelectorAll('.mm-module-card').length, 3);
  assert.ok(root.textContent.includes('今天还没有安排'), '空计划应有引导文案');
  assert.ok(root.textContent.includes('从第一餐开始照顾自己'), '饮食入口空态应有引导');
  assert.ok(root.textContent.includes('还没有正在阅读的文献'), '学习入口空态应有引导');
  assert.ok(root.querySelector('.mm-hero-title'), '空数据也要有 hero 区');
});

test.after(() => teardown(dom));
