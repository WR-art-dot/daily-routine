import test from 'node:test';
import assert from 'node:assert/strict';

import { setupDom, teardown, wait } from './helpers/dom.js';

const dom = setupDom();

const { put, all, clearStore, STORE_NAMES } = await import('../js/core/db.js');
const { initSettings } = await import('../js/core/settings.js');
const devView = (await import('../js/views/dev.js')).default;

test.afterEach(() => teardown());

async function resetAll() {
  for (const store of STORE_NAMES) await clearStore(store);
  await initSettings();
  localStorage.clear();
}

async function mount(params = {}) {
  const root = document.getElementById('view');
  root.innerHTML = '';
  const nav = [];
  await devView.render(root, { params, query: {}, setMeta: () => {}, navigate: (p) => nav.push(p) });
  return { root, nav };
}

function pressEnter(input) {
  input.dispatchEvent(new input.ownerDocument.defaultView.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
}

test('问题3 · 零项目时开发页有新建项目的输入入口', async () => {
  await resetAll();
  const { root } = await mount();
  const adder = root.querySelector('.add-row input');
  assert.ok(adder, '空状态下必须能看到新建项目的输入框');
  assert.ok(root.textContent.includes('新建第一个项目'));
});

test('问题3 · 回车创建项目后自动进入任务页', async () => {
  await resetAll();
  const { root, nav } = await mount();
  const adder = root.querySelector('.add-row input');
  adder.value = '论文助手';
  pressEnter(adder);
  await wait(160);

  const projects = await all('projects');
  assert.equal(projects.length, 1);
  assert.equal(projects[0].name, '论文助手');
  assert.equal(projects[0].status, 'active');
  assert.match(nav[0], /^\/dev\/.+\/task$/, '应跳到该项目的任务页');
});

test('问题3 · 有项目后任务页三个分组各有添加入口', async () => {
  await resetAll();
  await put('projects', { id: 'p1', name: '示例项目', status: 'active' });
  const { root } = await mount({ projectId: 'p1', tab: 'task' });

  const adders = [...root.querySelectorAll('.add-row input')];
  assert.equal(adders.length, 4, '三个任务分组 + 项目列表各一个入口');
  assert.ok(adders.some((i) => i.placeholder.includes('加一条功能')), '功能分组有添加入口');
  assert.ok(adders.some((i) => i.placeholder.includes('加一条修复')), '修复分组有添加入口');
  assert.ok(adders.some((i) => i.placeholder.includes('加一条优化')), '优化分组有添加入口');

  const funcAdder = adders.find((i) => i.placeholder.includes('加一条功能'));
  funcAdder.value = '做导入功能';
  pressEnter(funcAdder);
  await wait(160);

  const tasks = await all('devTasks');
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].title, '做导入功能');
  assert.equal(tasks[0].group, 'feature');
  assert.equal(tasks[0].projectId, 'p1');
});

test('问题3 · 空项目下加任务入口按分组写入正确的组', async () => {
  await resetAll();
  await put('projects', { id: 'p1', name: '示例项目', status: 'active' });
  const { root } = await mount({ projectId: 'p1', tab: 'task' });

  const fixAdder = [...root.querySelectorAll('.add-row input')].find((i) => i.placeholder.includes('加一条修复'));
  fixAdder.value = '修登录超时';
  pressEnter(fixAdder);
  await wait(160);

  const tasks = await all('devTasks');
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].group, 'fix');
  assert.equal(tasks[0].done, false);
});
