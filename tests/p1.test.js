import test from 'node:test';
import assert from 'node:assert/strict';

import { setupDom, teardown, click, wait } from './helpers/dom.js';

const dom = setupDom();

const { put, all, clearStore, count, STORE_NAMES, putMany } = await import('../js/core/db.js');
const backup = await import('../js/core/backup.js');
const { SCHEMA_VERSION, validatePayload, mergeRecords, exportAll, importAll, exportFileName } = backup;

async function resetAll() {
  for (const store of STORE_NAMES) await clearStore(store);
}

test('P1 · 校验拒绝各种坏文件', () => {
  const cases = [
    [null, '空对象'],
    [{}, '缺 app'],
    [{ app: 'other', schema: 1, data: {} }, 'app 不符'],
    [{ app: 'lifeapp', schema: 99, data: {} }, '版本不符'],
    [{ app: 'lifeapp', schema: SCHEMA_VERSION }, '缺 data'],
    [{ app: 'lifeapp', schema: SCHEMA_VERSION, data: [] }, 'data 是数组'],
    [{ app: 'lifeapp', schema: SCHEMA_VERSION, data: { nope: [] } }, '未知数据表'],
    [{ app: 'lifeapp', schema: SCHEMA_VERSION, data: { plan: {} } }, '表不是数组'],
    [{ app: 'lifeapp', schema: SCHEMA_VERSION, data: { plan: [{ title: 'x' }] } }, '记录缺 id']
  ];
  for (const [payload, label] of cases) {
    const result = validatePayload(payload);
    assert.equal(result.ok, false, `${label} 应被拒绝`);
    assert.ok(result.reason.length > 0, `${label} 应给出原因`);
  }
});

test('P1 · 校验接受合法文件', () => {
  const payload = backup.buildPayload({ plan: [{ id: 'a', title: 'x' }] });
  const result = validatePayload(payload);
  assert.deepEqual(result, { ok: true });
  assert.equal(validatePayload({ app: 'lifeapp', schema: SCHEMA_VERSION, data: { settings: [{ key: 'app' }] } }).ok, true);
});

test('P1 · 合并以 updatedAt 较新者为准', () => {
  const existing = [
    { id: 'a', title: '旧标题', updatedAt: 100 },
    { id: 'b', title: '只此一份', updatedAt: 50 }
  ];
  const incoming = [
    { id: 'a', title: '新标题', updatedAt: 200 },
    { id: 'c', title: '本地没有', updatedAt: 10 },
    { id: 'b', title: '更旧的覆盖尝试', updatedAt: 20 }
  ];
  const out = mergeRecords(existing, incoming);
  assert.equal(out.rows.length, 3);
  assert.equal(out.added, 1);
  assert.equal(out.updated, 1);
  assert.equal(out.skipped, 1);
  assert.equal(out.rows.find((r) => r.id === 'a').title, '新标题');
  assert.equal(out.rows.find((r) => r.id === 'b').title, '只此一份');
});

test('P1 · 导出文件名带日期', () => {
  assert.match(exportFileName(new Date(2026, 9, 30)), /^lifeapp-2026-10-30\.json$/);
});

test('P1 · 导出与导入来回一趟数据一致', async () => {
  await resetAll();
  await putMany('plan', [
    { id: 'p1', title: '写提纲', date: '2026-10-30', done: false },
    { id: 'p2', title: '读文献', date: '2026-10-30', done: true }
  ]);
  await put('media', { title: '一条选题', status: 'idea' });

  const payload = await exportAll();
  assert.equal(payload.app, 'lifeapp');
  assert.equal(payload.schema, SCHEMA_VERSION);
  assert.equal(payload.data.plan.length, 2);
  assert.equal(validatePayload(payload).ok, true);

  await clearStore('plan');
  assert.equal(await count('plan'), 0);

  const stats = await importAll(payload, 'merge');
  assert.equal(await count('plan'), 2);
  assert.equal(stats.added >= 2, true);
  const rows = await all('plan');
  assert.deepEqual(rows.map((r) => r.id).sort(), ['p1', 'p2']);
});

test('P1 · 整体替换会清掉文件里没有的记录', async () => {
  await resetAll();
  await put('plan', { id: 'keep', title: '来自文件', date: '2026-10-30' });
  const payload = await exportAll();

  await put('plan', { id: 'extra', title: '只在本地', date: '2026-10-30' });
  assert.equal(await count('plan'), 2);

  await importAll(payload, 'replace');
  const rows = await all('plan');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'keep');
});

test('P1 · 坏文件导入整份拒绝且不动现有数据', async () => {
  await resetAll();
  await put('plan', { id: 'safe', title: '别动我', date: '2026-10-30' });
  const bad = { app: 'lifeapp', schema: 999, data: { plan: [] } };
  await assert.rejects(() => importAll(bad, 'merge'), /版本不匹配/);
  const rows = await all('plan');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'safe');
});

test('P1 · 设置页渲染出备份、目标、词库三块', async () => {
  await resetAll();
  await put('plan', { id: 'x1', title: '任务', date: '2026-10-30' });

  const { getSettings, initSettings } = await import('../js/core/settings.js');
  await initSettings();
  assert.ok(getSettings().targets.kcal > 0);

  const view = (await import('../js/views/settings.js')).default;
  const root = document.getElementById('view');
  root.innerHTML = '';
  const meta = [];
  await view.render(root, { params: {}, query: {}, setMeta: (m) => meta.push(m), navigate() {} });
  const text = root.textContent;

  assert.ok(text.includes('备份与恢复'), '缺少备份区');
  assert.ok(text.includes('各模块条目数'), '缺条目数区');
  assert.ok(text.includes('目标'), '缺目标区');
  assert.ok(text.includes('词库'), '缺词库区');
  assert.ok(text.includes('导出'), '缺导出按钮');
  assert.ok(text.includes('选择文件'), '缺导入按钮');
  assert.ok(text.includes('浏览器清理站点数据'), '缺少数据风险提示');
  assert.ok(meta.length > 0, '应写入页面副信息');
  view.destroy();
});

test.after(() => teardown(dom));
