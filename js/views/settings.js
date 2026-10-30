import { h, icon } from '../ui/el.js';
import { toast } from '../ui/toast.js';
import { openDrawer } from '../ui/drawer.js';
import { openModal, confirmDialog, requireTextDialog } from '../ui/modal.js';
import { all, count, clearStore, del, put, STORE_NAMES } from '../core/db.js';
import {
  exportAll,
  importAll,
  validatePayload,
  downloadPayload,
  readLastExportAt
} from '../core/backup.js';
import { getSettings, saveSettings, applyTheme } from '../core/settings.js';
import { MODULES, BODY_PARTS, labelOf } from '../core/schema.js';
import { track } from '../core/save.js';
import { monthDay, timeText } from '../core/dates.js';

const STORE_LABEL = {
  plan: '今日计划',
  memos: '快速备忘',
  media: '自媒体',
  projects: '开发项目',
  devTasks: '开发任务',
  bugs: 'Bug',
  releases: '版本',
  devLogs: '编码日志',
  refs: '文献',
  events: '日程',
  outputs: '输出物',
  exercises: '动作库',
  workouts: '训练记录',
  foods: '食物库',
  meals: '餐食',
  weights: '体重',
  wishes: '心愿',
  settings: '设置'
};

let token = 0;
let currentRoot = null;
let currentCtx = null;

function refresh() {
  if (currentRoot && currentCtx) {
    const root = currentRoot;
    const ctx = currentCtx;
    root.innerHTML = '';
    render(root, ctx);
  }
}

function card(title, ...kids) {
  return h(
    'section',
    { class: 'card' },
    h('div', { class: 'card-head' }, h('span', { class: 'card-title', text: title })),
    ...kids
  );
}

function kv(k, v) {
  return h('div', { class: 'kv' }, h('span', { class: 'k', text: k }), h('span', { class: 'v', text: v }));
}

function numberField(label, value, onCommit, suffix = '') {
  const input = h('input', {
    class: 'input',
    type: 'number',
    value,
    style: { width: '86px' },
    onchange: () => onCommit(Number(input.value))
  });
  return h(
    'div',
    { class: 'kv' },
    h('span', { class: 'k', text: label }),
    input,
    suffix ? h('span', { class: 'hint', text: suffix }) : null
  );
}

async function doExport() {
  const payload = await track(exportAll());
  const name = downloadPayload(payload);
  toast(`已导出 ${name}`);
  refresh();
}

async function doImportFile(file) {
  let payload;
  try {
    payload = JSON.parse(await file.text());
  } catch {
    toast('这个文件不是合法的 JSON');
    return;
  }
  const check = validatePayload(payload);
  if (!check.ok) {
    toast(`导入失败：${check.reason}`, { duration: 7000 });
    return;
  }
  const total = Object.values(payload.data).reduce((n, rows) => n + rows.length, 0);
  const choice = await openModal({
    title: '导入数据',
    message: `文件里有 ${total} 条记录。合并会按 id 去重，整体替换会先清空现有数据。`,
    actions: [
      { label: '取消', value: null, kind: 'ghost' },
      { label: '合并', value: 'merge' },
      { label: '整体替换', value: 'replace', kind: 'danger' }
    ]
  });
  if (!choice) return;

  if (choice === 'replace') {
    const ok = await confirmDialog({
      title: '整体替换会清空现有数据',
      message: '替换前会自动导出一份当前数据的备份到下载目录。',
      confirmText: '继续替换',
      danger: true
    });
    if (!ok) return;
    const backup = await exportAll();
    downloadPayload(backup, `lifeapp-before-import-${new Date().toISOString().slice(0, 10)}.json`);
  }

  try {
    const stats = await track(importAll(payload, choice));
    toast(`导入完成：新增 ${stats.added} 条，更新 ${stats.updated} 条，跳过 ${stats.skipped} 条`, {
      duration: 7000
    });
  } catch (err) {
    toast(`导入失败：${err.message}`, { duration: 7000 });
  }
  refresh();
}

function libraryDrawer(kind) {
  const titles = { tag: '学习标签', exercise: '动作库', food: '食物库' };
  const drawer = openDrawer({
    title: titles[kind],
    body: h('div', { class: 'stack' })
  });

  const renderList = async () => {
    const body = drawer.body;
    body.innerHTML = '';
    if (kind === 'tag') {
      const tags = getSettings().refTags || [];
      const input = h('input', { class: 'input', placeholder: '新标签，回车添加' });
      const add = async () => {
        const name = input.value.trim();
        if (!name) return;
        await saveSettings({ refTags: [...new Set([...tags, name])] });
        renderList();
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.isComposing) add();
      });
      body.append(h('div', { class: 'row' }, input, h('button', { class: 'btn', text: '添加', onclick: add })));
      if (!tags.length) body.append(h('div', { class: 'hint', text: '还没有标签。' }));
      tags.forEach((tagName) => {
        body.append(
          h(
            'div',
            { class: 'row sep' },
            h('span', { class: 'grow', text: tagName }),
            h(
              'button',
              {
                class: 'icon-btn',
                type: 'button',
                onclick: async () => {
                  await saveSettings({ refTags: tags.filter((x) => x !== tagName) });
                  renderList();
                }
              },
              icon('close')
            )
          )
        );
      });
      return;
    }

    const store = kind === 'exercise' ? 'exercises' : 'foods';
    const rows = await all(store);
    body.append(h('div', { class: 'hint', text: `共 ${rows.length} 条` }));

    if (kind === 'exercise') {
      const name = h('input', { class: 'input', placeholder: '动作名' });
      const part = h(
        'select',
        { class: 'select', style: { width: '90px' } },
        BODY_PARTS.map((p) => h('option', { value: p.id, text: p.name }))
      );
      const add = async () => {
        if (!name.value.trim()) return;
        await put('exercises', { name: name.value.trim(), part: part.value });
        renderList();
      };
      name.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.isComposing) add();
      });
      body.append(
        h('div', { class: 'row' }, name, part, h('button', { class: 'btn', text: '添加', onclick: add }))
      );
    } else {
      const name = h('input', { class: 'input', placeholder: '食物名' });
      const numeric = (ph) =>
        h('input', { class: 'input', type: 'number', placeholder: ph, style: { width: '72px' } });
      const kcal = numeric('kcal');
      const protein = numeric('蛋白');
      const carb = numeric('碳水');
      const fat = numeric('脂肪');
      const portion = numeric('份量g');
      const add = async () => {
        if (!name.value.trim()) return;
        await put('foods', {
          name: name.value.trim(),
          per100: {
            kcal: Number(kcal.value) || 0,
            protein: Number(protein.value) || 0,
            carb: Number(carb.value) || 0,
            fat: Number(fat.value) || 0
          },
          defaultPortion: Number(portion.value) || 100
        });
        renderList();
      };
      body.append(
        h('div', { class: 'hint', text: '新建食物（每 100g 营养）' }),
        h('div', { class: 'row' }, name),
        h('div', { class: 'row' }, kcal, protein, carb, fat),
        h('div', { class: 'row' }, portion, h('button', { class: 'btn', text: '添加', onclick: add }))
      );
    }

    for (const row of rows) {
      const label =
        kind === 'exercise'
          ? `${row.name} · ${labelOf(BODY_PARTS, row.part)}`
          : `${row.name} · ${row.per100?.kcal ?? 0} kcal/100g`;
      body.append(
        h(
          'div',
          { class: 'row sep' },
          h('span', { class: 'grow', text: label }),
          h(
            'button',
            {
              class: 'icon-btn',
              type: 'button',
              onclick: async () => {
                await del(store, row.id);
                renderList();
              }
            },
            icon('close')
          )
        )
      );
    }
  };

  renderList();

  drawer.foot.append(
    h('button', { class: 'btn ghost', text: '关闭', onclick: () => drawer.close() }),
    h('button', {
      class: 'btn primary',
      text: '完成',
      style: { marginLeft: 'auto' },
      onclick: () => {
        drawer.close();
        refresh();
      }
    })
  );
}

async function render(root, ctx) {
  const t = ++token;
  currentRoot = root;
  currentCtx = ctx;

  const settings = getSettings();
  const counts = [];
  for (const store of STORE_NAMES) counts.push([store, await count(store)]);
  const lastExport = await readLastExportAt();
  if (t !== token) return;

  const total = counts.reduce((n, [, c]) => n + c, 0);
  ctx.setMeta(`共 ${total} 条记录`);

  const fileInput = h('input', {
    type: 'file',
    accept: 'application/json,.json',
    style: { display: 'none' },
    onchange: (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (file) doImportFile(file);
    }
  });

  const dataCard = card(
    '备份与恢复',
    h(
      'div',
      { class: 'row' },
      h('span', { class: 'grow', text: '导出全部数据为 JSON' }),
      h('button', { class: 'btn primary', text: '导出', onclick: doExport })
    ),
    h(
      'div',
      { class: 'row' },
      h('span', { class: 'grow', text: '从文件导入' }),
      h('button', { class: 'btn', text: '选择文件', onclick: () => fileInput.click() }),
      fileInput
    ),
    kv(
      '最近一次导出',
      lastExport ? `${monthDay(new Date(lastExport).toISOString().slice(0, 10))} ${timeText(lastExport)}` : '还没有导出过'
    ),
    h('div', {
      class: 'hint',
      style: { marginTop: '10px' },
      text: '浏览器清理站点数据会把本地库一起清掉。导出是唯一的保险，建议每周一次。'
    })
  );

  const clearSelect = h(
    'select',
    { class: 'select', style: { width: '150px' } },
    STORE_NAMES.map((s) => h('option', { value: s, text: STORE_LABEL[s] || s }))
  );
  const countsCard = card(
    '各模块条目数',
    h('div', { class: 'grid-2' }, counts.map(([store, n]) => kv(STORE_LABEL[store] || store, String(n)))),
    h('div', { class: 'sep-line' }),
    h(
      'div',
      { class: 'row' },
      clearSelect,
      h('button', {
        class: 'btn danger',
        text: '清空该模块',
        onclick: async () => {
          const store = clearSelect.value;
          const ok = await requireTextDialog({
            title: `清空「${STORE_LABEL[store]}」`,
            message: '这会删掉该模块的全部记录，不可恢复，除非之前导出过备份。输入模块名确认。',
            expected: STORE_LABEL[store],
            confirmText: '清空'
          });
          if (!ok) return;
          await track(clearStore(store));
          toast(`已清空「${STORE_LABEL[store]}」`);
          refresh();
        }
      })
    )
  );

  const target = settings.targets;
  const targetCard = card(
    '目标',
    numberField('每日热量', target.kcal, (v) => saveSettings({ targets: { kcal: v } }).then(refresh), 'kcal'),
    numberField('蛋白', target.protein, (v) => saveSettings({ targets: { protein: v } }).then(refresh), 'g'),
    numberField('碳水', target.carb, (v) => saveSettings({ targets: { carb: v } }).then(refresh), 'g'),
    numberField('脂肪', target.fat, (v) => saveSettings({ targets: { fat: v } }).then(refresh), 'g'),
    numberField(
      '每周训练次数',
      target.weeklyWorkouts,
      (v) => saveSettings({ targets: { weeklyWorkouts: v } }).then(refresh),
      '次'
    ),
    numberField('每天可用时长', settings.dayCapacity, (v) => saveSettings({ dayCapacity: v }).then(refresh), '分钟')
  );

  const themeBtns = ['auto', 'light', 'dark'].map((mode) =>
    h('button', {
      class: `chip${settings.theme === mode ? ' on' : ''}`,
      type: 'button',
      text: { auto: '跟随系统', light: '浅色', dark: '深色' }[mode],
      onclick: async () => {
        await saveSettings({ theme: mode });
        applyTheme();
        refresh();
      }
    })
  );

  const weekSelect = h(
    'select',
    {
      class: 'select',
      style: { width: '90px' },
      onchange: async (e) => {
        await saveSettings({ weekStart: Number(e.target.value) });
        refresh();
      }
    },
    h('option', { value: '1', text: '周一', selected: settings.weekStart === 1 }),
    h('option', { value: '0', text: '周日', selected: settings.weekStart === 0 })
  );

  const order = settings.homeCards.filter((id) => MODULES.some((m) => m.id === id));
  MODULES.forEach((m) => {
    if (!order.includes(m.id)) order.push(m.id);
  });
  const hidden = new Set(settings.hiddenCards || []);
  const orderList = h('div', { class: 'stack' });

  const persistOrder = (nextOrder) => saveSettings({ homeCards: nextOrder, hiddenCards: [...hidden] }).then(refresh);

  const rebuildOrder = (list) => {
    orderList.innerHTML = '';
    list.forEach((id, index) => {
      const meta = MODULES.find((m) => m.id === id);
      orderList.append(
        h(
          'div',
          { class: 'row sep' },
          h('input', {
            type: 'checkbox',
            checked: !hidden.has(id),
            onchange: (e) => {
              if (e.target.checked) hidden.delete(id);
              else hidden.add(id);
              persistOrder(list);
            }
          }),
          h('span', { class: 'grow', text: meta.name }),
          h('button', {
            class: 'icon-btn',
            type: 'button',
            text: '↑',
            onclick: () => {
              if (index === 0) return;
              const next = [...list];
              [next[index - 1], next[index]] = [next[index], next[index - 1]];
              persistOrder(next);
            }
          }),
          h('button', {
            class: 'icon-btn',
            type: 'button',
            text: '↓',
            onclick: () => {
              if (index === list.length - 1) return;
              const next = [...list];
              [next[index + 1], next[index]] = [next[index], next[index + 1]];
              persistOrder(next);
            }
          })
        )
      );
    });
  };
  rebuildOrder(order);

  const lookCard = card(
    '外观',
    h('div', { class: 'kv' }, h('span', { class: 'k', text: '主题' }), h('div', { class: 'flex-wrap' }, themeBtns)),
    h('div', { class: 'kv' }, h('span', { class: 'k', text: '一周起始' }), weekSelect),
    h('div', { class: 'hint', style: { margin: '10px 0 4px' }, text: '首页卡片的顺序与显隐' }),
    orderList
  );

  const tags = getSettings().refTags || [];
  const exerciseCount = await count('exercises');
  const foodCount = await count('foods');
  if (t !== token) return;

  const libCard = card(
    '词库',
    h(
      'div',
      { class: 'kv' },
      h('span', { class: 'k', text: `学习标签 · ${tags.length} 个` }),
      h('button', { class: 'btn sm', text: '管理', onclick: () => libraryDrawer('tag') })
    ),
    h(
      'div',
      { class: 'kv' },
      h('span', { class: 'k', text: `动作库 · ${exerciseCount} 个` }),
      h('button', { class: 'btn sm', text: '管理', onclick: () => libraryDrawer('exercise') })
    ),
    h(
      'div',
      { class: 'kv' },
      h('span', { class: 'k', text: `食物库 · ${foodCount} 种` }),
      h('button', { class: 'btn sm', text: '管理', onclick: () => libraryDrawer('food') })
    )
  );

  dataCard.style.gridColumn = '1 / -1';
  countsCard.style.gridColumn = '1 / -1';

  root.append(
    h(
      'div',
      { class: 'page' },
      h(
        'div',
        { class: 'page-bar' },
        h('span', { class: 'page-sub', text: '所有数据只存在这台电脑的浏览器里，没有账号，也不上传。' })
      ),
      h('div', { class: 'set-grid' }, dataCard, countsCard, targetCard, lookCard, libCard)
    )
  );
}

export default {
  async render(root, ctx) {
    await render(root, ctx);
  },
  destroy() {
    token += 1;
    currentRoot = null;
    currentCtx = null;
  }
};
