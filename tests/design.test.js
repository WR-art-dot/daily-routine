import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = (name) => readFileSync(join(root, 'css', name), 'utf8');
const tokens = css('tokens.css');

function themeVars(block) {
  const vars = {};
  for (const m of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
  return vars;
}

function extractTheme(marker) {
  const start = tokens.indexOf(marker);
  assert.ok(start >= 0, `tokens.css 缺少主题块 ${marker}`);
  const open = tokens.indexOf('{', start);
  let depth = 1, end = open;
  while (depth > 0 && end < tokens.length - 1) {
    end++;
    if (tokens[end] === '{') depth++;
    if (tokens[end] === '}') depth--;
  }
  return tokens.slice(open + 1, end);
}

const light = themeVars(extractTheme(':root, [data-theme="light"]'));
const dark = themeVars(extractTheme('[data-theme="dark"]'));
// 结构性令牌（间距/圆角/字阶/尺寸）在文件顶部的 :root 块里，不分主题
const structural = themeVars(extractTheme(':root{'));

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}

function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

function pick(theme, name) {
  const v = theme[name];
  assert.ok(v && v.startsWith('#'), `变量 ${name} 不存在或不是 hex：${v}`);
  return v;
}

test('设计 · 两套主题定义的变量键完全一致', () => {
  const lk = Object.keys(light).sort();
  const dk = Object.keys(dark).sort();
  assert.deepEqual(dk, lk, `深色缺少或多出：${lk.filter((k) => !dk.includes(k))} / ${dk.filter((k) => !lk.includes(k))}`);
});

test('设计 · 必要令牌齐全（画布/文字/强调/状态/七模块色）', () => {
  const required = [
    '--bg', '--surface', '--surface-2', '--surface-3', '--line', '--line-2', '--line-strong',
    '--ink', '--ink-2', '--ink-3', '--ink-inverse',
    '--accent', '--accent-ink', '--accent-soft', '--accent-line',
    '--ok', '--warn', '--danger',
    '--shadow-1', '--shadow-2', '--card-shadow', '--card-shadow-hover',
    '--m-today', '--m-media', '--m-dev', '--m-study', '--m-fitness', '--m-food', '--m-play'
  ];
  for (const theme of [light, dark]) {
    for (const key of required) assert.ok(theme[key], `缺少令牌 ${key}`);
  }
});

test('设计 · base/components/pages 不允许硬编码 hex 颜色', () => {
  for (const name of ['base.css', 'components.css', 'pages.css']) {
    const text = css(name).replace(/\/\*[\s\S]*?\*\//g, '');
    const hits = text.match(/#[0-9a-fA-F]{3,8}\b/g);
    assert.equal(hits, null, `${name} 里出现硬编码颜色：${hits && hits.join(', ')}`);
  }
});

test('设计 · 结构性令牌（间距/圆角/字阶）齐全', () => {
  const required = [
    '--sp-1', '--sp-2', '--sp-3', '--sp-4', '--sp-5', '--sp-6',
    '--fs-1', '--fs-2', '--fs-3', '--fs-4', '--fs-5', '--fs-6', '--fs-7', '--fs-8',
    '--r-1', '--r-2', '--r-3',
    '--rail-w', '--topbar-h'
  ];
  for (const key of required) assert.ok(structural[key], `缺少结构令牌 ${key}`);
});

test('设计 · base/components/pages 的 font-size 必须走字阶变量', () => {
  for (const name of ['base.css', 'components.css', 'pages.css']) {
    const text = css(name).replace(/\/\*[\s\S]*?\*\//g, '');
    // 允许 em/rem 相对字号（随根字号缩放），禁止游离的 px 字号
    const raw = text.match(/font-size\s*:\s*[\d.]+px/g);
    assert.equal(raw, null, `${name} 里出现字阶外的 px 字号：${raw && raw.join(', ')}`);
  }
});

test('设计 · 正文与次级文字对比度不低于 WCAG AA', () => {
  for (const [label, theme] of [['light', light], ['dark', dark]]) {
    const surface = pick(theme, '--surface');
    assert.ok(contrast(pick(theme, '--ink'), surface) >= 7, `${label} 正文对比度不足`);
    assert.ok(contrast(pick(theme, '--ink-2'), surface) >= 4.5, `${label} 次级文字对比度不足`);
    assert.ok(contrast(pick(theme, '--ink-3'), surface) >= 3, `${label} 弱化文字对比度不足`);
    assert.ok(contrast(pick(theme, '--accent'), surface) >= 3.5, `${label} 强调色对比度不足`);
    assert.ok(contrast(pick(theme, '--accent-ink'), pick(theme, '--accent')) >= 3, `${label} 主按钮文字对比度不足`);
  }
});

test('设计 · 深浅两主题的模块色是可区分的七色', () => {
  for (const theme of [light, dark]) {
    const keys = ['--m-today', '--m-media', '--m-dev', '--m-study', '--m-fitness', '--m-food', '--m-play'];
    const seen = new Set();
    for (const k of keys) {
      const [r, g, b] = hexToRgb(pick(theme, k));
      seen.add(`${Math.round(r / 32)},${Math.round(g / 32)},${Math.round(b / 32)}`);
    }
    assert.equal(seen.size, keys.length, '模块色存在两两过于接近的颜色');
  }
});
