import test from 'node:test';
import assert from 'node:assert/strict';

import { setupDom, teardown, click, wait } from './helpers/dom.js';

const dom = setupDom();

const { put, all, clearStore, STORE_NAMES } = await import('../js/core/db.js');
const { initSettings, saveSettings } = await import('../js/core/settings.js');
const { todayStr, addDays } = await import('../js/core/dates.js');
const lib = await import('../js/core/library.js');
const fitnessView = (await import('../js/views/fitness.js')).default;
const foodView = (await import('../js/views/food.js')).default;
const playView = (await import('../js/views/play.js')).default;

async function resetAll() {
  for (const store of STORE_NAMES) await clearStore(store);
  await initSettings();
  await saveSettings({ targets: { kcal: 2100, protein: 120, carb: 280, fat: 70, weeklyWorkouts: 4 } });
}

async function mount(view, params = {}, query = {}) {
  const root = document.getElementById('view');
  root.innerHTML = '';
  const meta = [];
  const nav = [];
  await view.render(root, { params, query, setMeta: (m) => meta.push(m), navigate: (p) => nav.push(p) });
  return { root, meta, nav };
}

function pressEnter(input) {
  input.dispatchEvent(new input.ownerDocument.defaultView.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
}

function change(input, value) {
  input.value = value;
  input.dispatchEvent(new input.ownerDocument.defaultView.Event('change', { bubbles: true }));
}

/* ---------------- 运动 ---------------- */

test('P5 · 动作曲线只取该动作的记录', () => {
  const workouts = [
    { id: 'w1', date: '2026-10-01', entries: [{ exerciseId: 'bench', weight: 60, reps: 8, sets: 4 }] },
    { id: 'w2', date: '2026-10-08', entries: [{ exerciseId: 'bench', weight: 65, reps: 6, sets: 4 }, { exerciseId: 'squat', weight: 90, reps: 5, sets: 5 }] },
    { id: 'w3', date: '2026-10-15', entries: [{ exerciseId: 'bench', weight: 62, reps: 8, sets: 4 }] }
  ];
  const series = lib.exerciseSeries(workouts, 'bench');
  assert.deepEqual(series.map((p) => p.weight), [60, 65, 62]);
  assert.deepEqual(series.map((p) => p.date), ['2026-10-01', '2026-10-08', '2026-10-15']);
  assert.equal(lib.prOf(workouts, 'bench').weight, 65);
  assert.equal(lib.prOf(workouts, 'squat').weight, 90);
  assert.equal(lib.prOf(workouts, 'nope'), null);
});

test('P5 · 周次数、连续周与热力图', () => {
  const workouts = [
    { id: 'a', date: '2026-10-26' },
    { id: 'b', date: '2026-10-28' },
    { id: 'c', date: '2026-10-19' },
    { id: 'd', date: '2026-10-12' }
  ];
  assert.equal(lib.weekCount(workouts, '2026-10-30', 1), 2);
  assert.equal(lib.streakWeeks(workouts, '2026-10-30', 1), 3);
  assert.equal(lib.streakWeeks([{ id: 'x', date: '2026-10-12' }], '2026-10-30', 1), 0);
  const cells = lib.heatmap(workouts, '2026-10-30', 12);
  assert.equal(cells.length, 84);
  assert.equal(cells.filter((c) => c.count > 0).length, 4);
});

test('P5 · 运动页能新建训练并加入动作', async () => {
  await resetAll();
  await put('exercises', { id: 'ex1', name: '卧推', part: 'chest' });

  const first = await mount(fitnessView);
  assert.ok(first.root.textContent.includes('还没有训练记录'));

  click([...first.root.querySelectorAll('button')].find((b) => b.textContent.includes('新建一次训练')));
  await wait(40);
  const drawer = document.querySelector('.drawer');
  assert.ok(drawer, '应打开新建训练抽屉');
  const inputs = drawer.querySelectorAll('.input');
  change(inputs[0], '2026-10-30');
  inputs[1].value = '上肢推';
  inputs[1].dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  click([...drawer.querySelectorAll('button')].find((b) => b.textContent === '创建'));
  await wait(140);

  const created = await all('workouts');
  assert.equal(created.length, 1);
  assert.equal(created[0].title, '上肢推');

  const second = await mount(fitnessView);
  const adder = second.root.querySelector('.picker') ? second.root.querySelector('input[placeholder^="＋ 加动作"]') : second.root.querySelector('input[placeholder^="＋ 加动作"]');
  assert.ok(adder, '训练卡里应有加动作入口');
  adder.dispatchEvent(new dom.window.Event('focus', { bubbles: true }));
  adder.value = '卧推';
  adder.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await wait(30);
  const option = [...second.root.querySelectorAll('.picker .row')].find((r) => r.textContent.includes('卧推'));
  assert.ok(option, '应能搜到动作库里的动作');
  click(option);
  await wait(140);

  const withEntry = (await all('workouts'))[0];
  assert.equal(withEntry.entries.length, 1);
  assert.equal(withEntry.entries[0].exerciseId, 'ex1');
});

test('P5 · 改动重量会写库并用于 PR', async () => {
  await resetAll();
  await put('exercises', { id: 'ex1', name: '卧推', part: 'chest' });
  await put('workouts', {
    id: 'w1',
    date: todayStr(),
    title: '上肢推',
    entries: [{ exerciseId: 'ex1', sets: 4, reps: 8, weight: 60, rpe: 7 }]
  });

  const { root } = await mount(fitnessView);
  const weightInputs = [...root.querySelectorAll('.entry-row .entry-cell input')];
  assert.ok(weightInputs.length >= 4, '应有组数/次数/重量/RPE 四个输入');
  const weightInput = weightInputs[2];
  change(weightInput, '70');
  await wait(120);

  const saved = (await all('workouts'))[0];
  assert.equal(saved.entries[0].weight, 70);
  assert.ok(root.textContent.includes('PR 70'), '页面应显示 PR');
});

/* ---------------- 饮食 ---------------- */

test('P5 · 份量换算与每日合计', () => {
  const food = { id: 'f1', name: '鸡胸', per100: { kcal: 165, protein: 31, carb: 0, fat: 3.6 } };
  const half = lib.scaleFood(food, 50);
  assert.equal(half.kcal, 83);
  assert.equal(half.protein, 15.5);
  assert.equal(half.grams, 50);

  const totals = lib.mealTotals([half, { kcal: 200, protein: 10, carb: 30, fat: 5 }]);
  assert.equal(totals.kcal, 283);
  assert.equal(totals.protein, 25.5);
});

test('P5 · 同一天多次称重只取最后一次', () => {
  const weights = [
    { id: 'w1', date: '2026-10-30', kg: 68.4, at: 100 },
    { id: 'w2', date: '2026-10-30', kg: 68.9, at: 300 },
    { id: 'w3', date: '2026-10-29', kg: 68.6, at: 50 }
  ];
  const byDate = lib.weightByDate(weights);
  assert.equal(byDate.get('2026-10-30').kg, 68.9);
  assert.equal(byDate.get('2026-10-29').kg, 68.6);
  const series = lib.weightSeries(weights, '2026-10-30', 3);
  assert.equal(series.length, 3);
  assert.equal(series.at(-1).kg, 68.9);
  assert.equal(series[0].kg, null);
  assert.equal(lib.weightTrend(weights, '2026-10-30', 7) > 0, true);
});

test('P5 · 饮食页选食物后按份量算出营养', async () => {
  await resetAll();
  await put('foods', { id: 'f1', name: '鸡胸', per100: { kcal: 165, protein: 31, carb: 0, fat: 3.6 }, defaultPortion: 150 });

  const { root } = await mount(foodView);
  const breakfast = root.querySelectorAll('.meal-col')[0];
  click([...breakfast.querySelectorAll('.add-row')][0]);
  await wait(80);

  const picker = root.querySelector('.picker');
  assert.ok(picker, '点添加后应出现食物选择面板');
  const option = [...picker.querySelectorAll('.row')].find((r) => r.textContent.includes('鸡胸'));
  click(option);
  await wait(140);

  const meals = await all('meals');
  assert.equal(meals.length, 1);
  assert.equal(meals[0].items[0].grams, 150);
  assert.equal(meals[0].items[0].kcal, 248);
  assert.ok(root.textContent.includes('248'), '页面应显示这一餐的热量');
});

test('P5 · 体重记在饮食页并显示趋势', async () => {
  await resetAll();
  const { root } = await mount(foodView);
  const weightInput = root.querySelector('input[placeholder="kg"]');
  assert.ok(weightInput, '饮食页应有体重输入');
  change(weightInput, '68.4');
  await wait(120);

  const weights = await all('weights');
  assert.equal(weights.length, 1);
  assert.equal(weights[0].kg, 68.4);
  assert.equal(weights[0].date, todayStr());
  assert.ok(root.textContent.includes('68.4'));
});

/* ---------------- 娱乐 ---------------- */

test('P5 · 心愿最多钉三条', () => {
  const wishes = [
    { id: 'a', status: 'want', weekPinned: true },
    { id: 'b', status: 'want', weekPinned: true },
    { id: 'c', status: 'doing', weekPinned: true },
    { id: 'd', status: 'done', weekPinned: true }
  ];
  assert.equal(lib.pinnedWishes(wishes, 3).length, 3, '已完成的不算在钉住的里面');
  assert.equal(lib.canPin(wishes, 3), false);
  assert.equal(lib.canPin([{ id: 'a', status: 'want', weekPinned: true }], 3), true);
});

test('P5 · 随机只从「想做」里抽', () => {
  const pool = [
    { id: 'a', status: 'want' },
    { id: 'b', status: 'doing' },
    { id: 'c', status: 'done' }
  ];
  const wanted = pool.filter((w) => w.status === 'want');
  for (let i = 0; i < 20; i += 1) {
    assert.equal(lib.pickRandom(wanted, () => i / 20).id, 'a');
  }
  assert.equal(lib.pickRandom([], Math.random), null);
});

test('P5 · 娱乐页状态循环与钉本周', async () => {
  await resetAll();
  await put('wishes', { id: 'w1', title: '极乐迪斯科', kind: 'game', status: 'want', weekPinned: false, source: '阿哲', reason: '想拆叙事' });

  const first = await mount(playView);
  const statusChip = [...first.root.querySelectorAll('.wish-card .chip')].find((c) => c.textContent === '想做');
  assert.ok(statusChip, '卡片上应有状态按钮');
  click(statusChip);
  await wait(120);
  assert.equal((await all('wishes'))[0].status, 'doing');

  const second = await mount(playView);
  const pinBtn = second.root.querySelector('.wish-pin');
  click(pinBtn);
  await wait(120);
  assert.equal((await all('wishes'))[0].weekPinned, true);

  const third = await mount(playView);
  assert.ok(third.root.textContent.includes('本周'), '钉住后卡片应有标记');
});

test('P5 · 标为已完成会记完成日并取消钉住', async () => {
  await resetAll();
  await put('wishes', { id: 'w1', title: '某游戏', kind: 'game', status: 'doing', weekPinned: true });

  const { root } = await mount(playView);
  const chip = [...root.querySelectorAll('.wish-card .chip')].find((c) => c.textContent === '在做');
  click(chip);
  await wait(120);

  const wish = (await all('wishes'))[0];
  assert.equal(wish.status, 'done');
  assert.equal(wish.weekPinned, false);
  assert.equal(wish.completedAt, todayStr());
  assert.ok(root.textContent.includes('已完成 1 条'), '应折叠进已完成');
});

test('P5 · 运动页不出现体重', async () => {
  await resetAll();
  await put('weights', { id: 'w1', date: todayStr(), kg: 68.4, at: 1 });
  await put('workouts', { id: 'wo', date: todayStr(), title: '上肢推', entries: [] });
  const { root } = await mount(fitnessView);
  assert.ok(!root.textContent.includes('体重'), '运动页不应显示体重');
  assert.ok(!root.textContent.includes('68.4'), '运动页不应读取体重数据');
});

test('P5 · 空清单给出引导', async () => {
  await resetAll();
  const { root } = await mount(playView);
  assert.ok(root.textContent.includes('清单还是空的'));
  assert.ok(root.querySelector('.add-row input'), '仍应有新增入口');
});

test.after(() => teardown(dom));
