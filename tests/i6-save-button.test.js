import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { setupDom, teardown } from './helpers/dom.js';

const dom = setupDom();

const { autosave, flushAll, onSaveState, pendingCount } = await import('../js/core/save.js');
const { clearStore, STORE_NAMES, put } = await import('../js/core/db.js');
const { initSettings } = await import('../js/core/settings.js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test.afterEach(() => teardown());

async function resetAll() {
  for (const store of STORE_NAMES) await clearStore(store);
  await initSettings();
  localStorage.clear();
}

test('问题6 · 顶栏有保存按钮，外壳为其绑定行为', async () => {
  const html = await readFile(join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.includes('id="btn-save"'), 'index.html 应有 #btn-save');

  const appSrc = await readFile(join(ROOT, 'js/app.js'), 'utf8');
  assert.ok(appSrc.includes("getElementById('btn-save')"), 'app.js 应给保存按钮绑事件');
  assert.ok(/mod && e\.key\.toLowerCase\(\) === 's'/.test(appSrc), '应支持 Ctrl+S');
});

test('问题6 · flushAll 能把还挂在防抖里的写入立刻落库', async () => {
  await resetAll();
  const save = autosave(() => put('plan', { id: 't1', date: '2026-10-30', title: '立即写入', done: false, order: '09:00' }));

  save(); // 触发防抖，不等待 400ms
  assert.equal(pendingCount(), 0, '防抖期内还没开始写');
  const rows = await (await import('../js/core/db.js')).all('plan');
  assert.equal(rows.length, 0, '防抖期内库里还没有');

  await flushAll();
  const after = await (await import('../js/core/db.js')).all('plan');
  assert.equal(after.length, 1, 'flushAll 后立刻落库');
  assert.equal(after[0].title, '立即写入');
});

test('问题6 · flushAll 覆盖所有 autosave 实例，不只是最后一个', async () => {
  await resetAll();
  const s1 = autosave(() => put('plan', { id: 'a', date: '2026-10-30', title: 'A', done: false, order: '1' }));
  const s2 = autosave(() => put('memos', { id: 'b', text: 'B' }));
  const s3 = autosave(() => put('wishes', { id: 'c', title: 'C', kind: 'game', status: 'want' }));

  s1();
  s2();
  s3();
  await flushAll();

  const [plan, memos, wishes] = await Promise.all([
    (await import('../js/core/db.js')).all('plan'),
    (await import('../js/core/db.js')).all('memos'),
    (await import('../js/core/db.js')).all('wishes')
  ]);
  assert.equal(plan.length, 1);
  assert.equal(memos.length, 1);
  assert.equal(wishes.length, 1);
});

test('问题6 · 没有挂起写入时 flushAll 是安全的空操作', async () => {
  await resetAll();
  await flushAll();
  assert.equal(pendingCount(), 0);
});

test('问题6 · flush 后保存状态点回到已保存', async () => {
  await resetAll();
  const states = [];
  const off = onSaveState((s) => states.push(s));
  const save = autosave(() => put('memos', { id: 'm1', text: '待保存' }));
  save();
  await flushAll();
  off();
  assert.ok(states.includes('saved'), `状态序列里应有 saved：${states.join(',')}`);
  const memos = await (await import('../js/core/db.js')).all('memos');
  assert.equal(memos.length, 1);
});

test('问题6 · 直接写入（put）不受 flushAll 影响，也不报错', async () => {
  await resetAll();
  await put('memos', { id: 'direct', text: '直接写' });
  await flushAll();
  const memos = await (await import('../js/core/db.js')).all('memos');
  assert.equal(memos.length, 1);
});
