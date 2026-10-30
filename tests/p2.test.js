import test from 'node:test';
import assert from 'node:assert/strict';

import { setupDom, teardown, click, wait } from './helpers/dom.js';

const dom = setupDom();

const { put, all, clearStore, del, STORE_NAMES } = await import('../js/core/db.js');
const { sortTasks, taskStats, leftovers, normalizeOrders, moveItem, minutesText } = await import('../js/core/library.js');
const { getPullable, getRefIndex, refKey } = await import('../js/core/pull.js');
const { todayStr } = await import('../js/core/dates.js');

const todayView = (await import('../js/views/today.js')).default;

async function resetAll() {
  for (const store of STORE_NAMES) await clearStore(store);
}

function mount(view) {
  const root = document.getElementById('view');
  root.innerHTML = '';
  const meta = [];
  const nav = [];
  return view
    .render(root, { params: {}, query: {}, setMeta: (m) => meta.push(m), navigate: (p) => nav.push(p) })
    .then(() => ({ root, meta, nav }));
}

function pressEnter(input) {
  input.dispatchEvent(new input.ownerDocument.defaultView.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
}

test('P2 · 任务排序与统计', () => {
  const tasks = [
    { id: 'a', time: '', order: 0, done: true },
    { id: 'b', time: '09:00', order: 1, done: false },
    { id: 'c', time: '08:30', order: 2, done: false }
  ];
  assert.deepEqual(sortTasks(tasks).map((t) => t.id), ['c', 'b', 'a']);
  const stats = taskStats(tasks);
  assert.equal(stats.total, 3);
  assert.equal(stats.done, 1);
  assert.equal(stats.ratio.toFixed(2), '0.33');
  assert.equal(minutesText(75), '1h15m');
  assert.equal(minutesText(45), '45m');
});

test('P2 · 遗留只取昨天且未完成', () => {
  const tasks = [
    { id: 'x', date: '2026-10-29', done: false },
    { id: 'y', date: '2026-10-29', done: true },
    { id: 'z', date: '2026-10-28', done: false }
  ];
  assert.deepEqual(leftovers(tasks, '2026-10-30').map((t) => t.id), ['x']);
});

test('P2 · 拖拽重排与序号归一', () => {
  const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(moveItem(list, 'c', 'a', 'before').map((x) => x.id), ['c', 'a', 'b']);
  assert.deepEqual(moveItem(list, 'a', 'c', 'after').map((x) => x.id), ['b', 'c', 'a']);
  const ordered = normalizeOrders([
    { id: 'a', time: '10:00', order: 9 },
    { id: 'b', time: '08:00', order: 7 }
  ]);
  assert.deepEqual(ordered.map((x) => x.id), ['b', 'a']);
  assert.deepEqual(ordered.map((x) => x.order), [0, 1]);
});

test('P2 · 从模块拉取只取当天与未完成项', async () => {
  await resetAll();
  await put('media', { id: 'm1', title: '今天该发的稿', plannedDate: '2026-10-30', status: 'drafting' });
  await put('media', { id: 'm2', title: '下周的稿', plannedDate: '2026-11-05', status: 'idea' });
  await put('events', { id: 'e1', title: '组会', kind: 'meeting', datetime: '2026-10-30T14:00' });
  await put('workouts', { id: 'w1', title: '上肢推', date: '2026-10-30', entries: [] });
  await put('devTasks', { id: 't1', projectId: 'p', group: 'feature', title: '写接口', done: false });
  await put('devTasks', { id: 't2', projectId: 'p', group: 'feature', title: '做完了的', done: true });
  await put('bugs', { id: 'b1', projectId: 'p', title: '登录超时', status: 'open', severity: 'blocker' });
  await put('bugs', { id: 'b2', projectId: 'p', title: '已修好的', status: 'fixed', severity: 'minor' });

  const items = await getPullable('2026-10-30', []);
  const ids = items.map((i) => i.refId);
  assert.ok(ids.includes('m1'));
  assert.ok(!ids.includes('m2'));
  assert.ok(ids.includes('e1'));
  assert.ok(ids.includes('w1'));
  assert.ok(ids.includes('t1'));
  assert.ok(!ids.includes('t2'));
  assert.ok(ids.includes('b1'));
  assert.ok(!ids.includes('b2'));

  const withPlan = await getPullable('2026-10-30', [{ module: 'media', refId: 'm1' }]);
  assert.ok(!withPlan.map((i) => i.refId).includes('m1'), '已加入的条目不应重复出现');
});

test('P2 · 引用索引能区分来源是否完成', async () => {
  await resetAll();
  await put('bugs', { id: 'b1', projectId: 'p', title: '登录超时', status: 'fixed' });
  const idx = await getRefIndex();
  assert.equal(idx.get(refKey('dev', 'b1')).done, true);
  assert.equal(idx.get(refKey('dev', 'missing')), undefined);
});

test('P2 · 今日计划页能加任务、勾选、删除', async () => {
  await resetAll();
  const today = todayStr();
  await put('plan', { id: 'pre', title: '原有一件事', date: today, time: '09:00', done: false, order: 0, module: 'today' });

  const { root, meta } = await mount(todayView);
  assert.equal(root.querySelectorAll('.today-row').length, 1, '应渲染已有任务');
  assert.equal(root.querySelector('input[aria-label="任务标题"]').value, '原有一件事');
  assert.ok(meta[0].includes('0/1'), `信息条应显示进度，实际：${meta[0]}`);

  const addInput = root.querySelector('[data-card="plan"] .add-row input');
  assert.ok(addInput, '缺少行内新增入口');
  addInput.value = '新加的一件事';
  pressEnter(addInput);
  await wait(100);

  const rows = await all('plan');
  assert.equal(rows.length, 2);
  const added = rows.find((r) => r.title === '新加的一件事');
  assert.ok(added, '新任务应写库');
  assert.equal(added.date, today);
  const titles = [...root.querySelectorAll('input[aria-label="任务标题"]')].map((i) => i.value);
  assert.ok(titles.includes('新加的一件事'), '新任务应出现在列表');

  click(root.querySelector('.today-row .check'));
  await wait(100);
  const afterToggle = (await all('plan')).find((r) => r.id === 'pre');
  assert.equal(afterToggle.done, true, '勾选应写库');
  assert.equal(root.querySelectorAll('.today-row').length, 2, '勾选后不应消失');

  click(root.querySelector('.today-row .row-actions .icon-btn:last-child'));
  await wait(100);
  const afterDel = await all('plan');
  assert.equal(afterDel.length, 1, '删除后应只剩一条');
  assert.ok(document.getElementById('toast-host').textContent.includes('撤销'), '删除后应给撤销入口');
});

test('P2 · 昨天遗留可以手动拉入今天', async () => {
  await resetAll();
  await put('plan', { id: 'y1', title: '昨天没做完', date: '2026-10-29', done: false, order: 0 });
  await put('plan', { id: 't1', title: '今天的', date: '2026-10-30', done: false, order: 0 });

  const { root } = await mount(todayView);
  assert.ok(root.textContent.includes('昨天没做完'), '遗留区应显示昨天的事');
  const todayList = root.querySelector('.today-list');
  assert.ok(!todayList.textContent.includes('昨天没做完'), '遗留不应自动出现在今天列表');

  const pullBtn = [...root.querySelectorAll('.pull-row button')].find((b) => b.textContent === '拉入');
  assert.ok(pullBtn, '应有拉入按钮');
  click(pullBtn);
  await wait(80);

  const rows = await all('plan');
  const moved = rows.find((r) => r.title === '昨天没做完');
  assert.equal(moved.date, '2026-10-30');
  assert.equal(rows.length, 2, '拉入是移动日期，不是复制');
});

test('P2 · 备忘可以新增并转成任务', async () => {
  await resetAll();
  const { root } = await mount(todayView);
  const memosCard = root.querySelector('[data-card="memos"]');
  assert.ok(memosCard, '应有备忘区');

  const input = memosCard.querySelector('.add-row input');
  assert.ok(input, '备忘区应有新增入口');
  input.value = '问老师框架问题';
  pressEnter(input);
  await wait(100);

  const memos = await all('memos');
  assert.equal(memos.length, 1);

  const convert = [...root.querySelectorAll('[data-card="memos"] button')].find((b) => b.textContent === '转任务');
  assert.ok(convert, '应有转任务按钮');
  click(convert);
  await wait(120);

  const plan = await all('plan');
  assert.equal(plan.length, 1);
  assert.equal(plan[0].title, '问老师框架问题');
  const memo = (await all('memos'))[0];
  assert.equal(memo.archived, true, '转任务后备忘应归档');
});

test.after(() => teardown(dom));
