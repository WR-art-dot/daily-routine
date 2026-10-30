import test from 'node:test';
import assert from 'node:assert/strict';

import { setupDom, teardown } from './helpers/dom.js';

const dom = setupDom();

const { put, all, clearStore, STORE_NAMES } = await import('../js/core/db.js');
const { initSettings } = await import('../js/core/settings.js');
const fitnessView = (await import('../js/views/fitness.js')).default;
const foodView = (await import('../js/views/food.js')).default;

test.afterEach(() => teardown());

async function resetAll() {
  for (const store of STORE_NAMES) await clearStore(store);
  await initSettings();
  localStorage.clear();
}

async function mount(view, params = {}, query = {}) {
  const root = document.getElementById('view');
  root.innerHTML = '';
  const nav = [];
  await view.render(root, { params, query, setMeta: () => {}, navigate: (p) => nav.push(p) });
  return { root, nav };
}

function currentMonth() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
}

function dayInThisMonth(n) {
  const t = new Date();
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  return `${currentMonth()}-${String(Math.min(n, last)).padStart(2, '0')}`;
}

test('问题5 · 运动页出现训练日历，练过的日子有部位标签', async () => {
  await resetAll();
  const d1 = dayInThisMonth(5);
  const d2 = dayInThisMonth(9);
  await put('exercises', { id: 'e1', name: '杠铃卧推', part: 'chest' });
  await put('exercises', { id: 'e2', name: '引体向上', part: 'back' });
  await put('workouts', { id: 'w1', date: d1, title: '推', durationMin: 60, entries: [{ exerciseId: 'e1', sets: 5, reps: 8, weight: 60 }] });
  await put('workouts', { id: 'w2', date: d2, title: '拉', durationMin: 50, entries: [{ exerciseId: 'e2', sets: 5, reps: 6, weight: 0 }] });

  const { root } = await mount(fitnessView);
  const cal = root.querySelector('.cal');
  assert.ok(cal, '应有训练日历');
  assert.ok(cal.textContent.includes(`${new Date().getFullYear()} 年 ${new Date().getMonth() + 1} 月`));

  const cells = [...cal.querySelectorAll('.cal-cell')];
  const c1 = cells.find((c) => c.querySelector('.cal-day')?.textContent === '5' && !c.classList.contains('cal-out'));
  assert.ok(c1, '5 号格子在月内');
  assert.ok(c1.querySelector('.cal-chip'), '练过日有部位 chip');
  assert.ok(c1.textContent.includes('胸'), 'chip 显示部位：胸');
  assert.ok(c1.title.includes('杠铃卧推 5×8 60kg'), '悬停完整说明含动作 组×次 重量');

  const c2 = cells.find((c) => c.querySelector('.cal-day')?.textContent === '9' && !c.classList.contains('cal-out'));
  assert.ok(c2.textContent.includes('背'));
});

test('问题5 · 没练的日子是空格子，今天有描边', async () => {
  await resetAll();
  const { root } = await mount(fitnessView);
  const cal = root.querySelector('.cal');
  const todayCell = cal.querySelector('.cal-cell.cal-today');
  assert.ok(todayCell, '今天格子存在且有标记');
  assert.equal(todayCell.querySelector('.cal-chip'), null, '今天没练就没有 chip');
  assert.ok(cal.querySelectorAll('.cal-wd').length === 7, '表头七个星期');
});

test('问题5 · 日历翻页与回到本月', async () => {
  await resetAll();
  const { root } = await mount(fitnessView);
  const label = () => root.querySelector('.cal-label').textContent;

  root.querySelector('.cal [aria-label="上一月"]').click();
  await new Promise((r) => setTimeout(r, 60));
  assert.notEqual(label(), `${new Date().getFullYear()} 年 ${new Date().getMonth() + 1} 月`, '上一月后标签变化');
  assert.ok(root.querySelector('.cal .chip'), '非本月时出现"回到本月"');

  root.querySelector('.cal .chip').click();
  await new Promise((r) => setTimeout(r, 60));
  assert.ok(label().includes(`${new Date().getMonth() + 1} 月`), '回到本月');

  root.querySelector('.cal [aria-label="下一月"]').click();
  await new Promise((r) => setTimeout(r, 60));
  assert.ok(root.querySelector('.cal .chip'), '翻到下月同样出现回本月');
});

test('问题5 · 点日历空白天新建训练并预填日期', async () => {
  await resetAll();
  const { root } = await mount(fitnessView);
  // 模块会记住上次浏览的月份，先回本月再断言
  const back = root.querySelector('.cal .chip');
  if (back) {
    back.click();
    await new Promise((r) => setTimeout(r, 60));
  }
  const target = dayInThisMonth(3);
  const cells = [...root.querySelectorAll('.cal-cell')];
  const cell = cells.find((c) => !c.classList.contains('cal-out') && c.querySelector('.cal-day')?.textContent === '3');
  cell.click();
  await new Promise((r) => setTimeout(r, 80));

  const dateInput = document.querySelector('.drawer input[type="date"]');
  assert.ok(dateInput, '应打开新建训练抽屉');
  assert.equal(dateInput.value, target, '抽屉日期预填为点的那天');
});

test('问题5 · 饮食页出现饮食日历，记录过的日子显示千卡并悬停明细', async () => {
  await resetAll();
  const d1 = dayInThisMonth(6);
  await put('meals', { id: 'm1', date: d1, slot: 'lunch', items: [{ name: '鸡胸肉饭', kcal: 560 }, { name: '酸奶', kcal: 140 }] });
  await put('meals', { id: 'm2', date: d1, slot: 'breakfast', items: [{ name: '燕麦', kcal: 320 }] });

  const { root } = await mount(foodView);
  const cal = root.querySelector('.cal');
  assert.ok(cal, '应有饮食日历');

  const cells = [...cal.querySelectorAll('.cal-cell')];
  const c1 = cells.find((c) => c.querySelector('.cal-day')?.textContent === '6' && !c.classList.contains('cal-out'));
  assert.ok(c1, '6 号格子在月内');
  assert.ok(c1.textContent.includes('1020'), 'chip 显示当天总千卡 560+140+320');
  assert.ok(c1.title.includes('早：燕麦'), '悬停有每餐明细');
  assert.ok(c1.title.includes('午：鸡胸肉饭、酸奶'), '悬停有每餐明细');

  const empty = cells.find((c) => !c.classList.contains('cal-out') && !c.querySelector('.cal-chip') && c !== cal.querySelector('.cal-today'));
  assert.ok(empty, '没记录的日子是空格子');
});

test('问题5 · 点饮食日历某天跳到那天的记录页', async () => {
  await resetAll();
  const target = dayInThisMonth(8);
  const { root, nav } = await mount(foodView);
  const back = root.querySelector('.cal .chip');
  if (back) {
    back.click();
    await new Promise((r) => setTimeout(r, 60));
  }
  const cells = [...root.querySelectorAll('.cal-cell')];
  const cell = cells.find((c) => !c.classList.contains('cal-out') && c.querySelector('.cal-day')?.textContent === '8');
  assert.ok(cell, '目标格子在月内');
  cell.click();
  await new Promise((r) => setTimeout(r, 80));
  assert.ok(nav.some((p) => p === `/food?d=${target}`), `应跳到 /food?d=${target}，实际：${nav.join(',')}`);
});
