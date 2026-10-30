import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { setupDom, teardown, click, key, wait } from './helpers/dom.js';

const dom = setupDom();

const { put, all, clearStore, STORE_NAMES } = await import('../js/core/db.js');
const { todayStr, addDays } = await import('../js/core/dates.js');
const { initSettings, saveSettings } = await import('../js/core/settings.js');
const { session } = await import('../js/core/session.js');
const homeView = (await import('../js/views/home.js')).default;

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = (name) => readFileSync(join(projectRoot, 'css', name), 'utf8');
const pages = css('pages.css');
const tokens = css('tokens.css');

async function resetAll() {
  for (const store of STORE_NAMES) await clearStore(store);
}

async function mount(query = {}) {
  const root = document.getElementById('view');
  root.innerHTML = '';
  const meta = [];
  const nav = [];
  await homeView.render(root, { params: {}, query, setMeta: (m) => meta.push(m), navigate: (p) => nav.push(p) });
  return { root, meta, nav };
}

function hasHex(name) {
  return new RegExp(`${name}\\s*:\\s*#`, 'i').test(tokens);
}

function themeVarHex(themeMarker, name) {
  const start = tokens.indexOf(themeMarker);
  assert.ok(start >= 0, `缺少主题块 ${themeMarker}`);
  const open = tokens.indexOf('{', start);
  let depth = 1, end = open;
  while (depth > 0 && end < tokens.length - 1) {
    end++;
    if (tokens[end] === '{') depth++;
    if (tokens[end] === '}') depth--;
  }
  const block = tokens.slice(open + 1, end);
  const m = block.match(new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]{6})`));
  assert.ok(m, `主题 ${themeMarker} 缺少 ${name}`);
  return m[1];
}

function saturation(hex) {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return 0;
  const d = max - min;
  return (l > 0.5 ? d / (2 - max - min) : d / (max + min)) * 100;
}

test.before(async () => {
  session.dayChanged = false;
});

test('晨雾草丘 · 首屏 hero 与三个模块入口结构完整', async () => {
  await resetAll();
  await initSettings();
  await saveSettings({ homeCards: ['study', 'fitness', 'food'], hiddenCards: [] });

  const { root } = await mount();

  const hero = root.querySelector('.mm-hero');
  assert.ok(hero, '首页应有全宽 hero 区');
  const scene = hero.querySelector('svg.mm-landscape');
  assert.ok(scene, 'hero 应内嵌自然场景 SVG');
  assert.ok(scene.querySelector('.mm-sky'), '场景应有天空层');
  assert.ok(scene.querySelector('.mm-lake'), '场景应有湖面层');
  assert.ok(scene.querySelectorAll('.mm-hill-far, .mm-hill-mid, .mm-hill-front-left').length >= 3, '场景应有草丘层');
  assert.ok(scene.querySelectorAll('.mm-flower').length >= 3, '场景应有野花');
  assert.equal(scene.getAttribute('aria-hidden'), 'true', '装饰性场景不应暴露给读屏');

  const title = root.querySelector('.mm-hero-title');
  assert.ok(title, 'hero 应有大标题');
  const [sans, serif] = [title.querySelector('span'), title.querySelector('em')];
  assert.equal(sans.textContent, '今天，吃得', '标题应以无衬线正文起头');
  assert.equal(serif.textContent, '清爽', '关键词应使用斜体衬线点缀');
  assert.ok(root.textContent.includes('练得'), '标题应保留第二句');

  const modules = [...root.querySelectorAll('.mm-module-card')].map((c) => c.dataset.card);
  assert.deepEqual(modules, ['study', 'fitness', 'food'], '应有学习/运动/饮食三张入口卡');
  for (const id of modules) {
    const card = root.querySelector(`.mm-module-card[data-card="${id}"]`);
    assert.ok(card.getAttribute('aria-label'), `${id} 入口应有可读名称`);
    assert.equal(card.getAttribute('tabindex'), '0', `${id} 入口应可聚焦`);
  }
});

test('晨雾草丘 · 三个入口点击后跳到各自模块', async () => {
  await resetAll();
  await initSettings();
  await saveSettings({ homeCards: ['study', 'fitness', 'food'], hiddenCards: [] });

  const { root, nav } = await mount();
  click(root.querySelector('.mm-module-card[data-card="study"]'));
  click(root.querySelector('.mm-module-card[data-card="fitness"]'));
  click(root.querySelector('.mm-module-card[data-card="food"]'));
  assert.deepEqual(nav, ['/study', '/fitness', '/food'], '三张卡应各自跳到对应模块');
});

test('晨雾草丘 · 快速记录入口写入对应模块', async () => {
  await resetAll();
  await initSettings();
  await saveSettings({ homeCards: ['study', 'fitness', 'food'], hiddenCards: [] });

  const { root, nav } = await mount();
  const actions = [...root.querySelectorAll('.mm-module-action')].map((b) => b.textContent);
  assert.deepEqual(actions, ['去学习', '记训练', '记一餐'], '每张卡都应有自己的快速记录动作');

  click(root.querySelectorAll('.mm-module-action')[2]);
  assert.deepEqual(nav, ['/food?add=1'], '饮食卡动作应带上记餐参数');

  const planInput = root.querySelector('[data-card="plan"] .add-row input');
  assert.ok(planInput, '今日概览应保留行内新增');
});

test('晨雾草丘 · 进度环按真实数据取值并可键盘完成计划', async () => {
  await resetAll();
  await initSettings();
  await saveSettings({ homeCards: ['study', 'fitness', 'food'], hiddenCards: [] });

  const today = todayStr();
  await put('plan', { id: 'a', title: '晨间阅读', date: today, done: false, order: 0, module: 'study' });
  await put('plan', { id: 'b', title: '拉伸', date: today, done: true, order: 1, module: 'fitness' });
  await put('refs', { id: 'r', title: '生态批评导论', status: 'reading', progress: 60 });
  await put('workouts', { id: 'w', date: today, title: '下肢' });
  await put('meals', { id: 'm', date: today, slot: 'lunch', items: [{ name: '燕麦', kcal: 300, protein: 12 }] });

  const { root } = await mount();
  const heroRing = root.querySelector('.mm-hero-ring .mm-ring-value');
  assert.equal(heroRing.getAttribute('stroke-dashoffset'), '50', '完成 1/2 时进度环应走一半');

  const studyRing = root.querySelector('[data-card="study"] .mm-ring-value');
  assert.equal(studyRing.getAttribute('stroke-dashoffset'), '40', '学习环应反映文献进度 60%');
  assert.ok(root.querySelector('[data-card="study"]').textContent.includes('生态批评导论'), '学习卡应显示在读文献');
  assert.ok(root.querySelector('[data-card="fitness"]').textContent.includes('下肢'), '运动卡应显示今日训练');
  assert.ok(root.querySelector('[data-card="food"]').textContent.includes('300 kcal'), '饮食卡应显示当日热量');

  const check = root.querySelector('.mm-plan-row .check');
  assert.ok(check, '概览应有可勾选的计划');
  key(check, ' ');
  await wait(120);
  const rows = await all('plan');
  assert.equal(rows.find((r) => r.id === 'a').done, true, '空格键应完成计划并写库');
});

test('晨雾草丘 · 备忘仍然可以新增与删除', async () => {
  await resetAll();
  await initSettings();
  await saveSettings({ homeCards: ['study', 'fitness', 'food'], hiddenCards: [] });

  const first = await mount();
  const input = first.root.querySelector('[data-card="memos"] .add-row input');
  assert.ok(input, '备忘卡应有行内新增');
  input.value = '喝一杯温水';
  key(input, 'Enter');
  await wait(120);
  assert.equal((await all('memos')).length, 1, '备忘应写入数据库');

  const second = await mount();
  const remove = second.root.querySelector('[data-card="memos"] .icon-btn');
  assert.ok(remove, '每条备忘应有删除按钮');
  assert.ok(remove.getAttribute('aria-label').includes('喝一杯温水'), '删除按钮应有可读名称');
  click(remove);
  await wait(120);
  assert.equal((await all('memos')).length, 0, '备忘应被删除');
});

test('晨雾草丘 · 跨天提示仍然可达今日计划页', async () => {
  await resetAll();
  await initSettings();
  const today = todayStr();
  await put('plan', { id: 'y', title: '昨天留下的', date: addDays(today, -1), done: false, order: 0 });

  session.dayChanged = true;
  const { root, nav } = await mount();
  const notice = root.querySelector('.mm-notice');
  assert.ok(notice, '跨天提示应使用晨雾风格容器');
  assert.ok(notice.textContent.includes('昨天还有 1 条没做完'));
  const jump = [...notice.querySelectorAll('button')].find((b) => b.textContent.includes('去今日计划'));
  click(jump);
  assert.deepEqual(nav, ['/today'], '提示应能跳到今日计划');
  session.dayChanged = false;
});

test('晨雾草丘 · 配色锚定：低饱和功能色与深色模式同步', () => {
  for (const marker of [':root, [data-theme="light"]', '[data-theme="dark"]']) {
    for (const [name, hex] of [
      ['--mm-sky', themeVarHex(marker, '--mm-sky')],
      ['--mm-sage', themeVarHex(marker, '--mm-sage')],
      ['--mm-cream', themeVarHex(marker, '--mm-cream')],
      ['--mm-ink', themeVarHex(marker, '--mm-ink')]
    ]) {
      assert.ok(hasHex(name), `tokens 缺少 ${name}`);
      assert.ok(saturation(hex) <= 42, `${marker} 的 ${name}（${hex}）饱和度过高：${saturation(hex).toFixed(1)}%`);
    }
    for (const name of ['--mm-food', '--mm-fitness', '--mm-study']) {
      const hex = themeVarHex(marker, name);
      assert.ok(saturation(hex) <= 40, `${marker} 的 ${name}（${hex}）饱和度超过 40%：${saturation(hex).toFixed(1)}%`);
    }
  }
});

test('晨雾草丘 · 卡片毛玻璃、圆角与留白达标', () => {
  const glass = pages.slice(pages.indexOf('.mm-module-card{'), pages.indexOf('.mm-module-top'));
  assert.ok(/backdrop-filter\s*:\s*blur\(16px\)/.test(glass), '模块卡应使用 16px 毛玻璃');
  assert.ok(/border-radius\s*:\s*var\(--r-5\)/.test(glass), '模块卡应使用 20-24px 圆角');
  assert.ok(/border\s*:\s*1px solid var\(--mm-glass-border\)/.test(glass), '模块卡应有半透明白边框');

  const heroGlass = pages.slice(pages.indexOf('.mm-hero-glass{'), pages.indexOf('.mm-glass-label'));
  assert.ok(/backdrop-filter\s*:\s*blur\(16px\)/.test(heroGlass), 'hero 面板应使用毛玻璃');

  const heroBlock = pages.slice(pages.indexOf('.mm-hero{'), pages.indexOf('.mm-landscape'));
  assert.ok(/min-height\s*:\s*520px/.test(heroBlock), 'hero 应为全宽沉浸式高度');
  assert.ok(/var\(--r-6\)/.test(heroBlock), 'hero 底部应有大圆角');

  const section = pages.slice(pages.indexOf('.mm-section{'), pages.indexOf('.mm-section-heading'));
  assert.ok(/margin-bottom\s*:\s*var\(--sp-6\)/.test(section), '区块间距应达到 32px 以上');

  const grid = pages.slice(pages.indexOf('.mm-module-grid{'), pages.indexOf('.mm-module-card{'));
  assert.ok(/gap\s*:\s*var\(--sp-5\)/.test(grid), '模块网格间距应慷慨');
});

test('晨雾草丘 · 动效时长在 300-500ms 且尊重减弱动效', () => {
  const animations = pages.match(/animation\s*:[^;]*mm-rise[^;]*;/g) || [];
  assert.ok(animations.length >= 3, '入场动效应作用于 hero 与模块卡');
  for (const line of animations) {
    const ms = line.match(/\.(\d+)s/);
    assert.ok(ms, `动效应写明时长：${line}`);
    const value = Number(`.${ms[1]}`) * 1000;
    assert.ok(value >= 300 && value <= 500, `入场动效应在 300-500ms，实际 ${value}ms`);
  }
  assert.ok(/@keyframes mm-rise/.test(pages), '应有上浮入场关键帧');
  assert.ok(/translateY\(16px\)/.test(pages), '入场应带轻微上浮');
  assert.ok(/mm-drift-a 20s/.test(pages) && /mm-drift-b 20s/.test(pages), '云雾应有 20s 循环漂移');
  assert.ok(/prefers-reduced-motion/.test(pages), '应尊重系统减弱动效设置');
});

test('晨雾草丘 · 排版：正文 16px 以上、行高 1.6、标题使用斜体衬线', () => {
  const lead = pages.slice(pages.indexOf('.mm-hero-lead{'), pages.indexOf('.mm-hero-actions'));
  assert.ok(/font-size\s*:\s*var\(--fs-5\)/.test(lead), 'hero 正文应达到 16px');
  assert.ok(/line-height\s*:\s*1\.6/.test(lead), '正文行高应为 1.6');

  const description = pages.slice(pages.indexOf('.mm-module-description{'), pages.indexOf('.mm-module-action'));
  assert.ok(/font-size\s*:\s*var\(--fs-4\)/.test(description), '卡片正文不应低于 16px 基准');
  assert.ok(/line-height\s*:\s*1\.6/.test(description), '卡片正文行高应为 1.6');

  const em = pages.slice(pages.indexOf('.mm-hero-title em{'), pages.indexOf('.mm-hero-lead'));
  assert.ok(/font-family\s*:\s*var\(--font-serif\)/.test(em), '关键词应使用衬线字体');
  assert.ok(/font-style\s*:\s*italic/.test(em), '关键词应为斜体');

  const base = css('base.css');
  assert.ok(/--font-serif/.test(base), '应定义衬线字体变量');
  assert.ok(/--font-sans/.test(base), '应定义无衬线字体变量');
  assert.ok(/line-height\s*:\s*1\.6/.test(base), '全局正文行高应为 1.6');
});

test.after(() => teardown(dom));
