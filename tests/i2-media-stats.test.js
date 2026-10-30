import test from 'node:test';
import assert from 'node:assert/strict';

import { setupDom, teardown } from './helpers/dom.js';

const dom = setupDom();

const { put, all, clearStore, STORE_NAMES } = await import('../js/core/db.js');
const { initSettings } = await import('../js/core/settings.js');
const mediaView = (await import('../js/views/media.js')).default;

test.afterEach(() => teardown());

async function resetAll() {
  for (const store of STORE_NAMES) await clearStore(store);
  await initSettings();
  localStorage.clear();
}

async function mount() {
  const root = document.getElementById('view');
  root.innerHTML = '';
  await mediaView.render(root, { params: {}, query: {}, setMeta: () => {}, navigate: () => {} });
  return root;
}

test('问题2 · 有已发布内容时出现发布数据卡且汇总正确', async () => {
  await resetAll();
  await put('media', { id: 'a', title: '甲篇', status: 'published', platform: '公众号', publishedAt: '2026-10-12', stats: { views: 12000, likes: 600 } });
  await put('media', { id: 'b', title: '乙篇', status: 'published', platform: 'B站', publishedAt: '2026-10-20', stats: { views: 8000, likes: 900 } });
  await put('media', { id: 'c', title: '草稿', status: 'drafting', platform: '公众号' });

  const root = await mount();
  const card = root.querySelector('[data-card="pub-stats"]');
  assert.ok(card, '应渲染发布数据卡');
  assert.ok(card.textContent.includes('2 篇'));
  assert.ok(card.textContent.includes('20,000'), '总阅读 = 12000 + 8000');
  assert.ok(card.textContent.includes('1,500'), '总互动 = 600 + 900');
  assert.ok(card.textContent.includes('7.5%'), '互动率 = 1500 / 20000');
  assert.ok(card.textContent.includes('乙篇'), '应按发布时间倒序，最近在前');
  assert.equal(card.textContent.indexOf('乙篇') < card.textContent.indexOf('甲篇'), true, '乙篇（10-20）排在甲篇（10-12）前面');

  const bars = card.querySelectorAll('.pub-bar .bar > i');
  assert.equal(bars.length, 4, '两篇 × 阅读与互动两条横条');
  // 横条按发布时间倒序：乙篇(阅读8000·互动900)在前，甲篇(阅读12000·互动600)在后
  assert.equal(bars[1].style.width, '100%', '最大互动值应占满横条');
  assert.equal(bars[2].style.width, '100%', '最大阅读值应占满横条');
  assert.notEqual(bars[0].style.width, '100%', '非最大值的横条不满格');
  assert.notEqual(bars[3].style.width, '100%', '非最大值的横条不满格');
});

test('问题2 · 没有已发布内容时不渲染统计卡', async () => {
  await resetAll();
  await put('media', { id: 'd', title: '纯想法', status: 'idea', platform: '公众号' });
  const root = await mount();
  assert.equal(root.querySelector('[data-card="pub-stats"]'), null);
  assert.ok(root.querySelector('.kanban'), '看板仍正常渲染');
});

test('问题2 · 平台筛选后统计只算该平台', async () => {
  await resetAll();
  await put('media', { id: 'a', title: '公众号篇', status: 'published', platform: '公众号', publishedAt: '2026-10-12', stats: { views: 1000, likes: 50 } });
  await put('media', { id: 'b', title: 'B站篇', status: 'published', platform: 'B站', publishedAt: '2026-10-15', stats: { views: 3000, likes: 300 } });

  const root = await mount();
  const gzhChip = [...root.querySelectorAll('.page-bar .chip')].find((c) => c.textContent === '公众号');
  gzhChip.click();
  await new Promise((r) => setTimeout(r, 120));

  const card = root.querySelector('[data-card="pub-stats"]');
  assert.ok(card);
  assert.ok(card.textContent.includes('1 篇'));
  assert.ok(card.textContent.includes('1,000'), '只统计公众号的阅读');
  assert.ok(!card.textContent.includes('3,000'), 'B站数据不出现');
});

test('问题2 · 超过六篇只列最近六篇并给出提示', async () => {
  await resetAll();
  for (let i = 1; i <= 8; i++) {
    await put('media', { id: `p${i}`, title: `第${i}篇`, status: 'published', platform: '公众号', publishedAt: `2026-10-${String(10 + i).padStart(2, '0')}`, stats: { views: i * 100, likes: i } });
  }
  const root = await mount();
  const card = root.querySelector('[data-card="pub-stats"]');
  assert.ok(card);
  assert.equal(card.querySelectorAll('.pub-row').length, 6);
  assert.ok(card.textContent.includes('还有 2 篇未显示'));
  assert.ok(card.textContent.includes('第8篇'), '最新一篇在最前');
});

test('问题2 · 已发布但统计为空时以零值占位', async () => {
  await resetAll();
  await put('media', { id: 'z', title: '刚发的', status: 'published', platform: '公众号', publishedAt: '2026-10-25', stats: { views: 0, likes: 0 } });
  const root = await mount();
  const card = root.querySelector('[data-card="pub-stats"]');
  assert.ok(card, '发布后即使没填数据也应有卡');
  assert.ok(card.textContent.includes('平均互动率'));
  assert.ok(card.textContent.includes('—'), '互动率无除数时显示 —');
  const db = (await all('media')).find((m) => m.id === 'z');
  assert.equal(db.stats.views, 0);
});
