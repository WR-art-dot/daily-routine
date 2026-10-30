import test from 'node:test';
import assert from 'node:assert/strict';

import { setupDom, teardown, click, wait } from './helpers/dom.js';

const dom = setupDom();

const { put, all, clearStore, STORE_NAMES } = await import('../js/core/db.js');
const { initSettings } = await import('../js/core/settings.js');
const mediaView = (await import('../js/views/media.js')).default;
const devView = (await import('../js/views/dev.js')).default;
const studyView = (await import('../js/views/study.js')).default;

async function resetAll() {
  for (const store of STORE_NAMES) await clearStore(store);
  await initSettings();
  localStorage.clear();
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

function dropOn(target, id) {
  const ev = new dom.window.Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'dataTransfer', {
    value: { getData: () => id, setData() {}, effectAllowed: 'move' }
  });
  target.dispatchEvent(ev);
}

/* ---------------- 自媒体 ---------------- */

test('P4 · 自媒体看板四列与计数', async () => {
  await resetAll();
  await put('media', { id: 'm1', title: '想法一', status: 'idea', platform: '公众号', plannedDate: null });
  await put('media', { id: 'm2', title: '在写的', status: 'drafting', platform: '小红书', plannedDate: '2026-11-02' });
  await put('media', { id: 'm3', title: '已发的', status: 'published', platform: '公众号', publishedAt: '2026-10-20', stats: { views: 1200, likes: 88 } });

  const { root } = await mount(mediaView);
  const cols = root.querySelectorAll('.kcol');
  assert.equal(cols.length, 4);
  assert.deepEqual([...cols].map((c) => c.dataset.status), ['idea', 'outline', 'drafting', 'published']);
  assert.ok(cols[0].textContent.includes('想法一'));
  assert.ok(cols[3].textContent.includes('阅读 1200'), '已发布卡应显示手填数据');
  assert.ok(root.querySelectorAll('.kcol')[3].textContent.includes('10/20'));
});

test('P4 · 自媒体拖拽换列会改状态并留痕', async () => {
  await resetAll();
  await put('media', { id: 'm1', title: '想法一', status: 'idea', platform: '公众号' });
  const { root } = await mount(mediaView);

  const outlineCol = root.querySelector('.kcol[data-status="outline"]');
  dropOn(outlineCol, 'm1');
  await wait(120);

  const item = (await all('media')).find((m) => m.id === 'm1');
  assert.equal(item.status, 'outline');
  assert.equal(item.statusHistory.length, 1);
  assert.equal(item.statusHistory[0].from, 'idea');
  assert.equal(item.statusHistory[0].to, 'outline');
});

test('P4 · 拖进已发布会自动填发布日并打开表单', async () => {
  await resetAll();
  await put('media', { id: 'm1', title: '要发的', status: 'drafting', platform: '公众号' });
  const { root } = await mount(mediaView);

  dropOn(root.querySelector('.kcol[data-status="published"]'), 'm1');
  await wait(160);

  const item = (await all('media')).find((m) => m.id === 'm1');
  assert.equal(item.status, 'published');
  assert.match(item.publishedAt, /^\d{4}-\d{2}-\d{2}$/, '应自动补发布日');
  const drawer = document.querySelector('.drawer');
  assert.ok(drawer, '应打开详情抽屉');
  assert.ok(drawer.textContent.includes('发布记录'), '抽屉里应有发布记录区');
});

test('P4 · 口袋改稿显示字数与阅读时长', async () => {
  await resetAll();
  await put('media', { id: 'm1', title: '稿子', status: 'drafting', platform: '公众号', body: '' });
  const { root } = await mount(mediaView);
  click(root.querySelector('.kcard'));
  await wait(60);

  const drawer = document.querySelector('.drawer');
  assert.ok(drawer, '点卡片应打开抽屉');
  const area = drawer.querySelector('textarea');
  area.value = '一二三四五六七八九十';
  area.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await wait(20);
  assert.ok(drawer.textContent.includes('10 字'), '应实时显示字数');
  assert.ok(drawer.textContent.includes('1 分钟'), '应显示阅读时长');
});

/* ---------------- 开发工作 ---------------- */

test('P4 · 开发页四标签与项目列表', async () => {
  await resetAll();
  await put('projects', { id: 'p1', name: 'api-service', status: 'active', stack: ['Node'], repo: 'D:/code/api' });
  await put('projects', { id: 'p2', name: '个人站点', status: 'paused' });
  await put('devTasks', { id: 't1', projectId: 'p1', group: 'feature', title: '写接口', done: false, order: 0 });
  await put('bugs', { id: 'b1', projectId: 'p1', title: '登录超时', severity: 'blocker', status: 'open' });

  const { root } = await mount(devView, { projectId: 'p1', tab: 'task' });
  assert.equal(root.querySelectorAll('.proj-item').length, 2);
  assert.ok(root.textContent.includes('写接口'));
  assert.equal(root.querySelectorAll('.tab').length, 4);
  assert.ok(root.querySelector('.proj-item .badge'), '有未修 bug 的项目应显示徽标');
});

test('P4 · Bug 可以切换状态、展开并保留展开状态', async () => {
  await resetAll();
  await put('projects', { id: 'p1', name: 'api-service', status: 'active' });
  await put('bugs', { id: 'b1', projectId: 'p1', title: '登录超时', severity: 'blocker', status: 'open', repro: '15 分钟后刷新' });

  const first = await mount(devView, { projectId: 'p1', tab: 'bug' });
  assert.ok(first.root.textContent.includes('待修'));

  click(first.root.querySelector('.bug-row .chip'));
  await wait(100);
  assert.equal((await all('bugs'))[0].status, 'fixed', '点击应切到已修');

  const second = await mount(devView, { projectId: 'p1', tab: 'bug' });
  click(second.root.querySelector('.bug-row .icon-btn'));
  await wait(80);
  assert.ok(second.root.querySelector('.bug-detail textarea'), '展开后应出现复现步骤');

  const third = await mount(devView, { projectId: 'p1', tab: 'bug' });
  assert.ok(third.root.querySelector('.bug-detail'), '刷新后展开状态应保留');
});

test('P4 · 切项目时保持当前标签页', async () => {
  await resetAll();
  await put('projects', { id: 'p1', name: 'A 项目', status: 'active' });
  await put('projects', { id: 'p2', name: 'B 项目', status: 'active' });

  const { root, nav } = await mount(devView, { projectId: 'p1', tab: 'bug' });
  const items = [...root.querySelectorAll('.proj-item')];
  const target = items.find((el) => el.textContent.includes('B 项目'));
  click(target);
  await wait(20);
  assert.equal(nav.at(-1), '/dev/p2/bug', `应保持 bug 标签，实际 ${nav.at(-1)}`);
});

test('P4 · 任务按三组分开并且能勾选', async () => {
  await resetAll();
  await put('projects', { id: 'p1', name: 'A', status: 'active' });
  await put('devTasks', { id: 't1', projectId: 'p1', group: 'feature', title: '新功能', done: false, order: 0 });
  await put('devTasks', { id: 't2', projectId: 'p1', group: 'fix', title: '修东西', done: false, order: 1 });

  const { root } = await mount(devView, { projectId: 'p1', tab: 'task' });
  const heads = [...root.querySelectorAll('.card-title')].map((n) => n.textContent);
  assert.ok(heads.includes('功能'));
  assert.ok(heads.includes('修复'));

  click(root.querySelector('.row .check'));
  await wait(100);
  const rows = await all('devTasks');
  assert.equal(rows.find((r) => r.id === 't1').done, true);
});

/* ---------------- 学习工作 ---------------- */

test('P4 · 文献状态点击循环并联动进度', async () => {
  await resetAll();
  await put('refs', { id: 'r1', title: '环境想象', author: 'Buell', year: 1995, status: 'todo', progress: 0, tags: [] });

  const first = await mount(studyView);
  assert.ok(first.root.textContent.includes('待读'));
  click(first.root.querySelector('.ref-table .tag'));
  await wait(100);
  let ref = (await all('refs'))[0];
  assert.equal(ref.status, 'reading');
  assert.equal(ref.progress, 1, '切到在读应自动填 1%');

  const second = await mount(studyView);
  click(second.root.querySelector('.ref-table .tag'));
  await wait(100);
  click((await mount(studyView)).root.querySelector('.ref-table .tag'));
  await wait(100);
  ref = (await all('refs'))[0];
  assert.equal(ref.status, 'todo');
});

test('P4 · 进度拖到 100 自动标已读', async () => {
  await resetAll();
  await put('refs', { id: 'r1', title: '环境想象', status: 'reading', progress: 40, tags: [] });

  const { root } = await mount(studyView);
  click(root.querySelector('.ref-table tbody tr'));
  await wait(60);
  const range = root.querySelector('input[type="range"]');
  assert.ok(range, '详情里应有进度条');
  range.value = '100';
  range.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  await wait(120);

  const ref = (await all('refs'))[0];
  assert.equal(ref.progress, 100);
  assert.equal(ref.status, 'done');
});

test('P4 · 标签筛选与题名搜索', async () => {
  await resetAll();
  await put('refs', { id: 'r1', title: 'The Environmental Imagination', author: 'Buell', year: 1995, status: 'todo', tags: ['理论'] });
  await put('refs', { id: 'r2', title: 'Slow Violence', author: 'Nixon', year: 2011, status: 'todo', tags: ['理论'] });
  await put('refs', { id: 'r3', title: '蜜蜂', author: 'Paull', year: 2014, status: 'todo', tags: ['文本'] });

  const { root } = await mount(studyView);
  assert.equal(root.querySelectorAll('.ref-table tbody tr').length, 3);

  const tagChip = [...root.querySelectorAll('.chip')].find((c) => c.textContent === '文本');
  click(tagChip);
  await wait(80);
  assert.equal(root.querySelectorAll('.ref-table tbody tr').length, 1, '按标签筛选应只剩一条');

  const allChip = [...root.querySelectorAll('.chip')].find((c) => c.textContent === '全部标签');
  click(allChip);
  await wait(80);

  const search = root.querySelector('input[placeholder="搜题名或作者"]');
  search.value = 'nixon';
  search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await wait(40);
  assert.equal(root.querySelectorAll('.ref-table tbody tr').length, 1, '搜索应过滤到一条');
});

test('P4 · 输出物可以新建并进入编辑', async () => {
  await resetAll();
  const { root } = await mount(studyView);
  const adder = [...root.querySelectorAll('.add-row input')].find((i) => i.placeholder.includes('输出物'));
  assert.ok(adder, '应有输出物新增入口');
  adder.value = '第三章提纲';
  pressEnter(adder);
  await wait(120);

  const outs = await all('outputs');
  assert.equal(outs.length, 1);
  assert.ok(document.querySelector('#view textarea'), '应进入编辑器');
});

test.after(() => teardown(dom));
