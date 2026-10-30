import { h, icon } from '../ui/el.js';
import { toastUndo } from '../ui/toast.js';
import { openDrawer } from '../ui/drawer.js';
import { sparkline } from '../ui/chart.js';
import { all, put, del } from '../core/db.js';
import { track } from '../core/save.js';
import { getSettings } from '../core/settings.js';
import { MEAL_SLOTS, labelOf } from '../core/schema.js';
import { mealTotals, scaleFood, weightByDate, weightSeries, weightTrend } from '../core/library.js';
import { todayStr, addDays, monthDay, weekdayCN, shortDate, relativeText } from '../core/dates.js';

let token = 0;
let rootEl = null;
let ctxRef = null;
let meals = [];
let foods = [];
let weights = [];
let date = '';
let pickerSlot = null;
let pickerQuery = '';

function refresh() {
  if (!rootEl || !ctxRef) return;
  const root = rootEl;
  const ctx = ctxRef;
  root.innerHTML = '';
  render(root, ctx);
}

function itemsOf(slot) {
  return meals.filter((m) => m.date === date && m.slot === slot).flatMap((m) => (m.items || []).map((it) => ({ ...it, mealId: m.id })));
}

async function ensureMeal(slot) {
  const existing = meals.find((m) => m.date === date && m.slot === slot);
  if (existing) return existing;
  const rec = await track(put('meals', { date, slot, items: [] }));
  meals.push(rec);
  return rec;
}

async function addFoodToSlot(slot, food) {
  const meal = await ensureMeal(slot);
  const item = scaleFood(food, food.defaultPortion || 100);
  meal.items = [...(meal.items || []), item];
  await track(put('meals', { ...meal, items: meal.items }));
  pickerQuery = '';
  pickerSlot = null;
  refresh();
}

function newFoodDrawer(name, onDone) {
  const numeric = (ph) => h('input', { class: 'input', type: 'number', placeholder: ph });
  const kcal = numeric('每 100g kcal');
  const protein = numeric('蛋白 g');
  const carb = numeric('碳水 g');
  const fat = numeric('脂肪 g');
  const portion = numeric('一次份量 g');
  portion.value = '100';
  const nameInput = h('input', { class: 'input', value: name || '', placeholder: '食物名' });

  const drawer = openDrawer({
    title: '新建食物',
    body: h(
      'div',
      { class: 'stack' },
      nameInput,
      h('div', { class: 'row' }, kcal, protein),
      h('div', { class: 'row' }, carb, fat),
      h('div', { class: 'row' }, portion),
      h('div', { class: 'hint', text: '填每 100 克的营养，之后记一餐只要选它。' })
    ),
    foot: h(
      'div',
      { class: 'row', style: { width: '100%' } },
      h('button', { class: 'btn ghost', text: '取消', onclick: () => drawer.close() }),
      h('button', {
        class: 'btn primary',
        text: '保存并加入',
        style: { marginLeft: 'auto' },
        onclick: async () => {
          const rec = await track(
            put('foods', {
              name: nameInput.value.trim() || '未命名食物',
              per100: {
                kcal: Number(kcal.value) || 0,
                protein: Number(protein.value) || 0,
                carb: Number(carb.value) || 0,
                fat: Number(fat.value) || 0
              },
              defaultPortion: Number(portion.value) || 100
            })
          );
          foods.push(rec);
          drawer.close();
          onDone(rec);
        }
      })
    )
  });
}

function pickerFor(slot) {
  const wrap = h('div', { class: 'picker' });
  const input = h('input', { class: 'input', placeholder: '搜食物，或直接输入新食物名', value: pickerQuery });
  input.style.marginBottom = '4px';
  const list = h('div', { class: 'stack' });

  const renderList = () => {
    list.innerHTML = '';
    const q = pickerQuery.trim().toLowerCase();
    const matches = foods.filter((f) => !q || f.name.toLowerCase().includes(q)).slice(0, 12);
    if (!matches.length && q) {
      list.append(
        h(
          'div',
          { class: 'row' },
          h('span', { class: 'grow hint', text: '库里没有' }),
          h('button', {
            class: 'chip',
            type: 'button',
            text: `＋ 新建「${pickerQuery.trim()}」`,
            onclick: () => newFoodDrawer(pickerQuery.trim(), (food) => addFoodToSlot(slot, food))
          })
        )
      );
      return;
    }
    if (!matches.length) {
      list.append(h('div', { class: 'hint', text: '食物库是空的，先建一个常吃的。' }));
      return;
    }
    for (const food of matches) {
      list.append(
        h(
          'div',
          { class: 'row', onclick: () => addFoodToSlot(slot, food) },
          h('span', { class: 'grow', text: food.name }),
          h('span', { class: 'hint', text: `${food.per100?.kcal ?? 0}/100g` })
        )
      );
    }
  };

  input.addEventListener('input', () => {
    pickerQuery = input.value;
    renderList();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      pickerSlot = null;
      pickerQuery = '';
      refresh();
    }
  });

  renderList();
  wrap.append(input, list);
  setTimeout(() => input.focus(), 0);
  return wrap;
}

function mealColumn(slot) {
  const items = itemsOf(slot.id);
  const totals = mealTotals(items);
  const col = h('div', { class: 'meal-col' });

  col.append(
    h(
      'div',
      { class: 'meal-head' },
      h('span', { class: 'meal-name', text: slot.name }),
      h('span', { class: 'meal-kcal num', text: items.length ? String(totals.kcal) : '—' })
    )
  );

  if (!items.length) {
    col.append(h('div', { class: 'hint', style: { padding: '4px 2px 8px' }, text: '还没记' }));
  }

  for (const item of items) {
    const gramsInput = h('input', {
      class: 'input',
      type: 'number',
      value: item.grams ?? '',
      style: { width: '54px', padding: '0 4px', height: '22px', border: '0', background: 'transparent' }
    });
    gramsInput.addEventListener('change', async () => {
      const grams = Number(gramsInput.value) || 0;
      const food = foods.find((f) => f.id === item.foodId);
      const next = food
        ? scaleFood(food, grams)
        : {
            ...item,
            grams,
            kcal: Math.round((item.grams ? item.kcal / item.grams : 0) * grams),
            protein: Math.round((item.grams ? item.protein / item.grams : 0) * grams * 10) / 10,
            carb: Math.round((item.grams ? item.carb / item.grams : 0) * grams * 10) / 10,
            fat: Math.round((item.grams ? item.fat / item.grams : 0) * grams * 10) / 10
          };
      const meal = meals.find((m) => m.id === item.mealId);
      if (!meal) return;
      meal.items = meal.items.map((it) => (it.foodId === item.foodId && it.name === item.name ? { ...next } : it));
      await track(put('meals', { ...meal, items: meal.items }));
      refresh();
    });

    col.append(
      h(
        'div',
        { class: 'food-item' },
        h('span', { class: 'n', text: item.name }),
        h('span', { class: 'v' }, gramsInput),
        h('span', { class: 'v', text: `g · ${item.kcal}` }),
        h(
          'button',
          {
            class: 'icon-btn',
            type: 'button',
            'aria-label': '删除',
            style: { width: '18px', height: '18px' },
            onclick: async () => {
              const meal = meals.find((m) => m.id === item.mealId);
              if (!meal) return;
              const snapshot = meal.items;
              meal.items = meal.items.filter((it) => !(it.foodId === item.foodId && it.name === item.name));
              await track(put('meals', { ...meal, items: meal.items }));
              refresh();
              toastUndo('已删除', async () => {
                await track(put('meals', { ...meal, items: snapshot }));
                refresh();
              });
            }
          },
          h('span', { text: '×', style: { fontSize: '13px' } })
        )
      )
    );
  }

  if (pickerSlot === slot.id) {
    col.append(pickerFor(slot.id));
  } else {
    col.append(
      h('div', {
        class: 'add-row',
        style: { padding: '4px 2px', fontSize: '12px' },
        text: '＋ 添加',
        onclick: () => {
          pickerSlot = slot.id;
          pickerQuery = '';
          refresh();
        }
      })
    );
  }

  return col;
}

function weightCard() {
  const card = h('div', { class: 'card' });
  const byDate = weightByDate(weights);
  const today = date;
  const rec = byDate.get(today);
  const series = weightSeries(weights, today, 7);
  const trend = weightTrend(weights, today, 7);

  const input = h('input', {
    class: 'input',
    type: 'number',
    step: '0.1',
    placeholder: 'kg',
    value: rec ? String(rec.kg) : '',
    style: { width: '90px', fontSize: '18px', fontWeight: '500' }
  });
  input.addEventListener('change', async () => {
    const kg = Number(input.value);
    if (!kg) return;
    await track(put('weights', { date: today, kg, at: Date.now() }));
    refresh();
  });

  card.append(
    h('div', { class: 'card-head' },
      h('span', { class: 'card-title', text: '体重' }),
      h('span', { class: 'hint align-end', text: relativeText(today) })
    ),
    h('div', { class: 'row' }, input, h('span', { class: 'hint', text: 'kg' })),
    sparkline(series.map((p) => ({ value: p.kg }))),
    h('div', {
      class: 'hint',
      style: { marginTop: '4px' },
      text: series.filter((p) => p.kg !== null).length
        ? `7 日均 ${(series.filter((p) => p.kg !== null).reduce((n, p) => n + p.kg, 0) / series.filter((p) => p.kg !== null).length).toFixed(1)} · 趋势 ${trend > 0 ? '+' : ''}${trend}`
        : '这周还没有记录'
    })
  );
  return card;
}

async function render(root, ctx) {
  const t = ++token;
  rootEl = root;
  ctxRef = ctx;
  date = ctx.query?.d || date || todayStr();

  meals = await all('meals');
  foods = (await all('foods')).sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  weights = await all('weights');
  if (t !== token) return;

  const dayItems = meals.filter((m) => m.date === date).flatMap((m) => m.items || []);
  const totals = mealTotals(dayItems);
  const settings = getSettings();
  const targets = settings.targets;

  ctx.setMeta(`${monthDay(date)} ${weekdayCN(date)} · ${totals.kcal} / ${targets.kcal} kcal`);

  const bar = h(
    'div',
    { class: 'page-bar' },
    h('button', { class: 'chip', type: 'button', text: '‹ 前一天', onclick: () => ctx.navigate(`/food?d=${addDays(date, -1)}`) }),
    h('span', { class: `chip${date === todayStr() ? ' on' : ''}`, text: date === todayStr() ? '今天' : shortDate(date) }),
    h('button', { class: 'chip', type: 'button', text: '后一天 ›', onclick: () => ctx.navigate(`/food?d=${addDays(date, 1)}`) }),
    h('span', { class: 'grow' }),
    h('span', { class: 'page-sub', text: `${totals.kcal} / ${targets.kcal} kcal` })
  );

  const cols = h('div', { class: 'meal-cols' }, MEAL_SLOTS.map(mealColumn));

  const nutri = h('div', { class: 'card' });
  nutri.append(h('div', { class: 'card-head' }, h('span', { class: 'card-title', text: '营养合计' })));
  const rows = [
    ['蛋白', totals.protein, targets.protein, 'g'],
    ['碳水', totals.carb, targets.carb, 'g'],
    ['脂肪', totals.fat, targets.fat, 'g']
  ];
  for (const [name, value, target, unit] of rows) {
    const ratio = target ? value / target : 0;
    nutri.append(
      h(
        'div',
        { class: 'nutri-row', style: { marginBottom: '6px' } },
        h('span', { class: 'hint', text: name }),
        h('div', { class: 'bar soft' }, h('i', { style: { width: `${Math.min(100, ratio * 100)}%` } })),
        h('span', { class: 'hint num', text: `${Math.round(value)}/${target}${unit}` })
      )
    );
  }

  const right = h('div', { class: 'stack' }, nutri, weightCard());

  root.append(
    h(
      'div',
      { class: 'page' },
      bar,
      dayItems.length
        ? null
        : h(
            'div',
            { class: 'card', style: { marginBottom: '8px' } },
            h(
              'div',
              { class: 'row' },
              h('span', { class: 'grow hint', text: '这一天还没有记录。' }),
              h('button', {
                class: 'btn primary sm',
                text: '记一餐',
                onclick: () => {
                  pickerSlot = 'breakfast';
                  refresh();
                }
              })
            )
          ),
      h('div', { class: 'food-grid' }, cols, right)
    )
  );

}

export default {
  async render(root, ctx) {
    pickerQuery = '';
    pickerSlot = ctx.query?.add === '1' ? 'breakfast' : null;
    date = ctx.query?.d || todayStr();
    await render(root, ctx);
  },
  destroy() {
    token += 1;
    rootEl = null;
    ctxRef = null;
    pickerSlot = null;
  }
};
