import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';

import { parseRoute, ROUTES, RAIL } from '../js/core/router.js';
import { STORES, STORE_NAMES, MODULES } from '../js/core/schema.js';
import { addDays, diffDays, weekStart, normalizeTime, todayStr, parseDate } from '../js/core/dates.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const exists = (p) => access(join(ROOT, p)).then(() => true, () => false);

test('P0 · 入口文件与静态资源齐全', async () => {
  const html = await readFile(join(ROOT, 'index.html'), 'utf8');
  const refs = [...html.matchAll(/(?:href|src)="([^"#]+)"/g)]
    .map((m) => m[1])
    .filter((p) => !p.startsWith('http') && !p.startsWith('data:'));
  assert.ok(refs.length >= 5, '至少引用样式与入口脚本');
  for (const ref of refs) {
    assert.ok(await exists(ref), `缺少被引用的文件：${ref}`);
  }
});

test('P0 · 应用外壳的关键节点存在', async () => {
  const html = await readFile(join(ROOT, 'index.html'), 'utf8');
  for (const id of ['app', 'rail', 'page-title', 'page-meta', 'save-dot', 'view', 'toast-host', 'overlay-host', 'btn-search']) {
    assert.ok(html.includes(`id="${id}"`), `缺少 #${id}`);
  }
  assert.ok(html.includes('type="module"'), '入口脚本必须是 module');
  assert.ok(html.includes("location.protocol === 'file:'"), '必须检测 file:// 打开');
});

test('P0 · 路由表覆盖九个页面', () => {
  assert.equal(ROUTES.length, 9);
  assert.deepEqual(
    ROUTES.map((r) => r.name),
    ['home', 'today', 'media', 'dev', 'study', 'fitness', 'food', 'play', 'settings']
  );
  assert.equal(RAIL.length, 8, '左侧导航八项，设置单独放底部');
});

test('P0 · 路由解析', () => {
  assert.equal(parseRoute('#/home').name, 'home');
  assert.equal(parseRoute('#/today?d=2026-10-30').query.d, '2026-10-30');
  const dev = parseRoute('#/dev/p1/bug');
  assert.equal(dev.name, 'dev');
  assert.equal(dev.params.projectId, 'p1');
  assert.equal(dev.params.tab, 'bug');
  const devBare = parseRoute('#/dev');
  assert.equal(devBare.name, 'dev');
  assert.equal(devBare.params.tab, null);
  assert.equal(parseRoute('#/nope').name, 'home');
  assert.equal(parseRoute('').name, 'home');
  assert.equal(parseRoute('#/settings').name, 'settings');
});

test('P0 · 数据仓库定义完整', () => {
  assert.equal(STORE_NAMES.length, 18, 'PRD 要求 18 个对象仓库');
  for (const name of STORE_NAMES) {
    const def = STORES[name];
    assert.ok(def, `${name} 缺少定义`);
    assert.ok(def.keyPath, `${name} 缺少 keyPath`);
    assert.ok(def.indexes && typeof def.indexes === 'object', `${name} 缺少 indexes`);
  }
  assert.equal(STORES.settings.keyPath, 'key');
  assert.equal(STORES.plan.indexes.by_date, 'date');
  assert.equal(MODULES.length, 7, '七个内容模块');
});

test('P0 · 九个视图模块结构正确', async () => {
  for (const route of ROUTES) {
    const mod = await import(`../js/views/${route.name}.js`);
    const view = mod.default;
    assert.ok(view, `${route.name} 应有默认导出`);
    assert.equal(typeof view.render, 'function', `${route.name}.render 缺失`);
    assert.equal(typeof view.destroy, 'function', `${route.name}.destroy 缺失`);
  }
});

test('P0 · 源码不出现硬编码颜色', async () => {
  const files = [];
  const walk = async (dir) => {
    for (const entry of await readdir(join(ROOT, dir), { withFileTypes: true })) {
      const rel = join(dir, entry.name);
      if (entry.isDirectory()) await walk(rel);
      else if (extname(entry.name) === '.js') files.push(rel);
    }
  };
  await walk('js');
  assert.ok(files.length >= 10, '应扫描到全部脚本');
  for (const file of files) {
    const src = await readFile(join(ROOT, file), 'utf8');
    const hits = src.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
    assert.deepEqual(hits, [], `${file} 出现硬编码颜色：${hits.join(', ')}`);
  }
});

test('P0 · 日期工具', () => {
  assert.equal(todayStr(new Date(2026, 9, 30)), '2026-10-30');
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(diffDays('2026-10-28', '2026-10-30'), 2);
  assert.equal(weekStart('2026-10-30', 1), '2026-10-26');
  assert.equal(weekStart('2026-10-30', 0), '2026-10-25');
  assert.equal(normalizeTime('9:5'), '09:05');
  assert.equal(normalizeTime('930'), '09:30');
  assert.equal(normalizeTime('abc'), '');
  assert.equal(parseDate('2026-10-30').getDate(), 30);
});
