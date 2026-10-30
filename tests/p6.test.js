import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { setupDom, teardown, click, wait } from './helpers/dom.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dom = setupDom();

const { put, putMany, all, clearStore, STORE_NAMES } = await import('../js/core/db.js');
const { initSettings } = await import('../js/core/settings.js');
const { todayStr } = await import('../js/core/dates.js');
const { undoLast } = await import('../js/core/undo.js');
const { openSearch, closeSearch } = await import('../js/ui/search.js');

const views = {
  home: (await import('../js/views/home.js')).default,
  today: (await import('../js/views/today.js')).default,
  media: (await import('../js/views/media.js')).default,
  dev: (await import('../js/views/dev.js')).default,
  study: (await import('../js/views/study.js')).default,
  fitness: (await import('../js/views/fitness.js')).default,
  food: (await import('../js/views/food.js')).default,
  play: (await import('../js/views/play.js')).default,
  settings: (await import('../js/views/settings.js')).default
};

async function resetAll() {
  for (const store of STORE_NAMES) await clearStore(store);
  await initSettings();
  localStorage.clear();
  closeSearch();
}

async function mount(name, params = {}, query = {}) {
  const root = document.getElementById('view');
  root.innerHTML = '';
  const nav = [];
  const meta = [];
  await views[name].render(root, {
    params,
    query,
    setMeta: (m) => meta.push(m),
    navigate: (p) => nav.push(p)
  });
  return { root, nav, meta };
}

test('P6 · 来源被修好后任务显示提示但不自动勾选', async () => {
  await resetAll();
  const today = todayStr();
  await put('projects', { id: 'p1', name: 'api-service', status: 'active' });
  await put('bugs', { id: 'b1', projectId: 'p1', title: '登录超时', status: 'open', severity: 'major' });
  await put('plan', {
    id: 't1',
    title: '登录超时',
    date: today,
    module: 'dev',
    refId: 'b1',
    done: false,
    order: 0
  });

  const before = await mount('today');
  assert.ok(!before.root.textContent.includes('来源已完成'), '未修好时不该有标记');

  await put('bugs', { id: 'b1', projectId: 'p1', title: '登录超时', status: 'fixed', severity: 'major' });
  const after = await mount('today');
  assert.ok(after.root.textContent.includes('来源已完成'), '来源修好后应给提示');
  const check = after.root.querySelector('.today-row .check');
  assert.ok(!check.classList.contains('on'), '不应自动勾选');
  assert.equal((await all('plan'))[0].done, false, '库里也不该被改动');
});

test('P6 · 来源被删除后任务保留标题并标记', async () => {
  await resetAll();
  const today = todayStr();
  await put('bugs', { id: 'b1', projectId: 'p1', title: '登录超时', status: 'open' });
  await put('plan', { id: 't1', title: '登录超时', date: today, module: 'dev', refId: 'b1', done: false, order: 0 });

  await clearStore('bugs');
  const { root } = await mount('today');
  assert.ok(root.textContent.includes('来源已删除'), '应标记来源已删除');
  const title = root.querySelector('input[aria-label="任务标题"]');
  assert.equal(title.value, '登录超时', '标题快照应保留');
});

test('P6 · 全局搜索能跨模块找到条目并跳转', async () => {
  await resetAll();
  await put('bugs', { id: 'b1', projectId: 'p1', title: '登录超时', status: 'open' });
  await put('refs', { id: 'r1', title: '登录与记忆', author: '某作者', status: 'todo', tags: [] });
  await mount('home');

  openSearch();
  const input = document.querySelector('.search-panel .search-input');
  assert.ok(input, '应打开搜索面板');
  input.value = '登录';
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await wait(220);

  const text = document.querySelector('.search-panel').textContent;
  assert.ok(text.includes('登录超时'), '应搜到 bug');
  assert.ok(text.includes('登录与记忆'), '应搜到文献');
  assert.ok(text.includes('开发工作') && text.includes('学习工作'), '结果应分组');

  input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await wait(40);
  assert.match(location.hash, /#\/dev\/p1\/bug|#\/study/, `应跳到对应页面，实际 ${location.hash}`);
  assert.equal(document.querySelector('.search-panel'), null, '跳转后应关闭面板');
});

test('P6 · 删除后可以用撤销栈找回', async () => {
  await resetAll();
  const today = todayStr();
  await put('plan', { id: 'p1', title: '会被删掉', date: today, done: false, order: 0 });
  const { root } = await mount('today');

  click(root.querySelector('.today-row .row-actions .icon-btn:last-child'));
  await wait(100);
  assert.equal((await all('plan')).length, 0);

  const label = undoLast();
  await wait(120);
  assert.equal(label, '已删除');
  assert.equal((await all('plan')).length, 1, '撤销应恢复记录');
});

test('P6 · 一千条任务时分段渲染且能继续展开', async () => {
  await resetAll();
  const today = todayStr();
  const rows = Array.from({ length: 1000 }, (_, i) => ({
    id: `p${i}`,
    title: `任务 ${i}`,
    date: today,
    done: false,
    order: i,
    module: 'today'
  }));
  await putMany('plan', rows);

  const { root } = await mount('today');
  assert.equal(root.querySelectorAll('.today-row').length, 200, '首屏只渲染 200 条');
  const more = [...root.querySelectorAll('button')].find((b) => b.textContent === '显示更多');
  assert.ok(more, '应给展开更多入口');
  click(more);
  await wait(160);
  assert.equal(root.querySelectorAll('.today-row').length, 400, '展开后追加 200 条');
});

test('P6 · 九个页面在空库下都能正常渲染并给出引导', async () => {
  await resetAll();
  const expectations = {
    home: '今天还没有安排',
    today: '这一天还没有安排',
    media: '还没有选题',
    dev: '还没有项目',
    study: '还没有文献',
    fitness: '还没有训练记录',
    food: '这一天还没有记录',
    play: '清单还是空的',
    settings: '备份与恢复'
  };
  for (const [name, phrase] of Object.entries(expectations)) {
    const { root, meta } = await mount(name);
    assert.ok(root.textContent.length > 0, `${name} 渲染为空`);
    assert.ok(root.textContent.includes(phrase), `${name} 缺少空状态文案「${phrase}」`);
    assert.equal(typeof meta[0], 'string', `${name} 应写入页面副信息`);
  }
});

test('P6 · 每个模块都有行内新增入口', async () => {
  await resetAll();
  await put('projects', { id: 'p1', name: '项目', status: 'active' });
  await put('workouts', { id: 'w1', date: todayStr(), title: '练', entries: [] });

  const checks = [
    ['today', '.add-row input'],
    ['media', '.kcol .add-row input'],
    ['dev', '.proj-list .add-row input'],
    ['study', '.add-row input'],
    ['fitness', 'input[placeholder^="＋ 加动作"]'],
    ['food', '.add-row'],
    ['play', '.add-row input']
  ];
  for (const [name, selector] of checks) {
    const { root } = await mount(name, name === 'dev' ? { projectId: 'p1' } : {});
    assert.ok(root.querySelector(selector), `${name} 缺少行内新增入口（${selector}）`);
  }
});

test('P6 · 点击标题改字，Esc 撤回原值', async () => {
  await resetAll();
  const today = todayStr();
  await put('plan', { id: 'p1', title: '原标题', date: today, done: false, order: 0 });
  const { root } = await mount('today');

  const title = root.querySelector('input[aria-label="任务标题"]');
  assert.equal(title.value, '原标题');

  title.value = '临时改的';
  title.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await wait(40);
  assert.equal(title.value, '原标题', 'Esc 应撤回原值');
  assert.equal((await all('plan'))[0].title, '原标题');

  title.value = '真改了';
  title.dispatchEvent(new dom.window.Event('blur', { bubbles: false }));
  await wait(120);
  assert.equal((await all('plan'))[0].title, '真改了', '失焦应提交');
});

test('P6 · 深浅两套颜色变量都齐全', async () => {
  const css = await readFile(join(ROOT, 'css', 'tokens.css'), 'utf8');
  const dark = css.split('[data-theme="dark"]')[1] || '';
  for (const token of ['--bg', '--surface', '--ink', '--ink-2', '--accent', '--line', '--danger']) {
    assert.ok(dark.includes(`${token}:`), `深色模式缺少 ${token}`);
  }
  assert.ok(css.includes('--m-today') && css.includes('--m-play'), '缺少模块色');
});

test('P6 · 每个视图都能重复销毁且不抛错', async () => {
  await resetAll();
  for (const [name, view] of Object.entries(views)) {
    const root = document.getElementById('view');
    root.innerHTML = '';
    await view.render(root, { params: {}, query: {}, setMeta() {}, navigate() {} });
    assert.equal(typeof view.destroy, 'function', `${name} 缺少 destroy`);
    view.destroy();
    view.destroy();
  }
  assert.ok(true);
});

test.after(() => teardown(dom));
