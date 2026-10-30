import { addDays, diffDays, weekStart, todayStr, shortDate } from './dates.js';

export function sortTasks(tasks) {
  return [...tasks].sort((a, b) => {
    const at = a.time || '99:99';
    const bt = b.time || '99:99';
    if (at !== bt) return at < bt ? -1 : 1;
    return (a.order ?? 0) - (b.order ?? 0);
  });
}

export function taskStats(tasks) {
  const total = tasks.length;
  const done = tasks.filter((t) => t.done).length;
  const minutes = tasks.reduce((sum, t) => sum + (Number(t.estimateMin) || 0), 0);
  return { total, done, minutes, ratio: total ? done / total : 0 };
}

export function splitDone(tasks) {
  const sorted = sortTasks(tasks);
  return {
    open: sorted.filter((t) => !t.done),
    done: sorted.filter((t) => t.done)
  };
}

export function leftovers(tasks, today) {
  const yesterday = addDays(today, -1);
  return sortTasks(tasks.filter((t) => t.date === yesterday && !t.done));
}

export function normalizeOrders(tasks) {
  return sortTasks(tasks).map((t, i) => ({ ...t, order: i }));
}

export function moveItem(list, draggedId, targetId, place = 'before') {
  const copy = [...list];
  const from = copy.findIndex((x) => x.id === draggedId);
  const to = copy.findIndex((x) => x.id === targetId);
  if (from < 0 || to < 0 || from === to) return copy;
  const [item] = copy.splice(from, 1);
  let insertAt = copy.findIndex((x) => x.id === targetId);
  if (place === 'after') insertAt += 1;
  copy.splice(insertAt, 0, item);
  return copy;
}

export function moveToIndex(list, id, index) {
  const copy = [...list];
  const from = copy.findIndex((x) => x.id === id);
  if (from < 0) return copy;
  const [item] = copy.splice(from, 1);
  const at = Math.max(0, Math.min(copy.length, index));
  copy.splice(at, 0, item);
  return copy;
}

export function mediaSort(items) {
  return [...items].sort((a, b) => {
    const ad = a.plannedDate || '';
    const bd = b.plannedDate || '';
    if (ad && bd && ad !== bd) return ad < bd ? -1 : 1;
    if (ad && !bd) return -1;
    if (!ad && bd) return 1;
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
}

export function nextOf(list, id) {
  const ids = list.map((x) => x.id);
  const i = ids.indexOf(id);
  if (i < 0) return list[0]?.id;
  return list[(i + 1) % list.length].id;
}

export function groupBy(list, keyFn) {
  const map = new Map();
  for (const item of list) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

export function devTasksGrouped(tasks, groups) {
  return groups.map((g) => ({
    group: g,
    items: [...tasks].filter((t) => t.group === g.id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  }));
}

export function openBugCount(bugs, projectId) {
  return bugs.filter((b) => b.status === 'open' && (!projectId || b.projectId === projectId)).length;
}

export function refFilter(refs, { status = 'all', tag = '', q = '', sort = 'year' } = {}) {
  const needle = q.trim().toLowerCase();
  let out = refs.filter((r) => {
    if (status !== 'all' && r.status !== status) return false;
    if (tag && !(r.tags || []).includes(tag)) return false;
    if (needle) {
      const hay = `${r.title || ''} ${r.author || ''}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
  out = out.sort((a, b) => {
    if (sort === 'year') return (b.year || 0) - (a.year || 0);
    if (sort === 'title') return String(a.title).localeCompare(String(b.title), 'zh');
    if (sort === 'progress') return (b.progress || 0) - (a.progress || 0);
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
  return out;
}

export function eventsOnDay(events, date) {
  return events
    .filter((e) => (e.datetime || '').slice(0, 10) === date)
    .sort((a, b) => (a.datetime < b.datetime ? -1 : 1));
}

export function upcomingEvents(events, today, days = 14) {
  const end = addDays(today, days);
  return events
    .filter((e) => {
      const d = (e.datetime || '').slice(0, 10);
      return d >= today && d <= end;
    })
    .sort((a, b) => (a.datetime < b.datetime ? -1 : 1));
}

export function exerciseSeries(workouts, exerciseId) {
  const points = [];
  for (const w of workouts) {
    for (const entry of w.entries || []) {
      if (entry.exerciseId !== exerciseId) continue;
      const weight = Number(entry.weight);
      if (!Number.isFinite(weight) || weight <= 0) continue;
      points.push({ date: w.date, weight, sets: entry.sets, reps: entry.reps });
    }
  }
  return points.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function prOf(workouts, exerciseId) {
  const series = exerciseSeries(workouts, exerciseId);
  if (!series.length) return null;
  let best = series[0];
  for (const p of series) if (p.weight > best.weight) best = p;
  return { weight: best.weight, date: best.date };
}

export function lastEntryOf(workouts, exerciseId, beforeDate = null) {
  const series = exerciseSeries(workouts, exerciseId).filter((p) => !beforeDate || p.date < beforeDate);
  return series.length ? series[series.length - 1] : null;
}

export function weekCount(workouts, date, firstDay = 1) {
  const start = weekStart(date, firstDay);
  const end = addDays(start, 6);
  return workouts.filter((w) => w.date >= start && w.date <= end).length;
}

export function streakWeeks(workouts, date, firstDay = 1) {
  let cursor = weekStart(date, firstDay);
  if (weekCount(workouts, cursor, firstDay) === 0) cursor = addDays(cursor, -7);
  let streak = 0;
  while (weekCount(workouts, cursor, firstDay) > 0) {
    streak += 1;
    cursor = addDays(cursor, -7);
    if (streak > 520) break;
  }
  return streak;
}

export function heatmap(workouts, today, weeks = 12) {
  const thisWeek = weekStart(today, 1);
  const cells = [];
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const start = addDays(thisWeek, -7 * i);
    for (let d = 0; d < 7; d += 1) {
      const date = addDays(start, d);
      const count = workouts.filter((w) => w.date === date).length;
      cells.push({ date, count, future: diffDays(today, date) < 0 });
    }
  }
  return cells;
}

export function mealTotals(items = []) {
  return items.reduce(
    (acc, it) => ({
      kcal: acc.kcal + (Number(it.kcal) || 0),
      protein: acc.protein + (Number(it.protein) || 0),
      carb: acc.carb + (Number(it.carb) || 0),
      fat: acc.fat + (Number(it.fat) || 0)
    }),
    { kcal: 0, protein: 0, carb: 0, fat: 0 }
  );
}

export function scaleFood(food, grams) {
  const g = Number(grams) || 0;
  const base = food.per100 || {};
  const ratio = g / 100;
  return {
    foodId: food.id,
    name: food.name,
    grams: g,
    kcal: Math.round((Number(base.kcal) || 0) * ratio),
    protein: Math.round((Number(base.protein) || 0) * ratio * 10) / 10,
    carb: Math.round((Number(base.carb) || 0) * ratio * 10) / 10,
    fat: Math.round((Number(base.fat) || 0) * ratio * 10) / 10
  };
}

export function weightByDate(weights) {
  const map = new Map();
  for (const w of weights) {
    const prev = map.get(w.date);
    if (!prev || (w.at || 0) >= (prev.at || 0)) map.set(w.date, w);
  }
  return map;
}

export function weightSeries(weights, today, days = 7) {
  const byDate = weightByDate(weights);
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = addDays(today, -i);
    const rec = byDate.get(date);
    out.push({ date, kg: rec ? Number(rec.kg) : null });
  }
  return out;
}

export function weightTrend(weights, today, days = 7) {
  const series = weightSeries(weights, today, days).filter((p) => p.kg !== null);
  if (series.length < 2) return 0;
  return Math.round((series[series.length - 1].kg - series[0].kg) * 10) / 10;
}

export function pinnedWishes(wishes, max = 3) {
  return wishes.filter((w) => w.weekPinned && w.status !== 'done').slice(0, max);
}

export function canPin(wishes, max = 3) {
  return pinnedWishes(wishes, max).length < max;
}

export function pickRandom(list, rng = Math.random) {
  if (!list.length) return null;
  return list[Math.floor(rng() * list.length) % list.length];
}

export function minutesText(min) {
  const n = Number(min) || 0;
  if (n < 60) return `${n}m`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m ? `${h}h${m}m` : `${h}h`;
}

/* ---------- 首页六卡摘要 ---------- */

export function summaryMedia(items, today = todayStr()) {
  if (!items.length) return { empty: true };
  const active = mediaSort(items.filter((m) => m.status !== 'published'));
  const next = active[0] || mediaSort(items)[0];
  return {
    empty: false,
    title: next.title,
    status: next.status,
    plannedDate: next.plannedDate || '',
    overdue: !!(next.plannedDate && next.plannedDate < today),
    total: items.length,
    published: items.filter((m) => m.status === 'published').length
  };
}

export function summaryDev(projects, bugs, tasks, logs, today = todayStr()) {
  const active = projects
    .filter((p) => p.status === 'active')
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const project = active[0] || null;
  const hasLog = project ? logs.some((l) => l.projectId === project.id && l.date === today) : false;
  return {
    empty: !project,
    project,
    openBugs: project ? openBugCount(bugs, project.id) : 0,
    openTasks: project ? tasks.filter((t) => t.projectId === project.id && !t.done).length : 0,
    hasLog
  };
}

export function summaryStudy(refs, events, today = todayStr()) {
  const reading = refs.filter((r) => r.status === 'reading').sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
  const nextEvent = upcomingEvents(events, today, 30)[0];
  return {
    empty: !refs.length && !events.length,
    reading: reading || null,
    todo: refs.filter((r) => r.status === 'todo').length,
    nextEvent: nextEvent || null,
    eventIn: nextEvent ? diffDays(today, (nextEvent.datetime || '').slice(0, 10)) : null
  };
}

export function summaryFitness(workouts, date = todayStr(), target = 4, firstDay = 1) {
  const todayWorkout = workouts.find((w) => w.date === date) || null;
  return {
    empty: !workouts.length,
    todayWorkout,
    week: weekCount(workouts, date, firstDay),
    target,
    streak: streakWeeks(workouts, date, firstDay)
  };
}

export function summaryFood(meals, weights, targets, date = todayStr()) {
  const todayMeals = meals.filter((m) => m.date === date);
  const all = todayMeals.flatMap((m) => m.items || []);
  const totals = mealTotals(all);
  const byDate = weightByDate(weights);
  const w = byDate.get(date) || null;
  return {
    empty: !todayMeals.length && !weights.length,
    meals: todayMeals.filter((m) => (m.items || []).length).length,
    kcal: totals.kcal,
    protein: totals.protein,
    kcalTarget: targets?.kcal || 0,
    proteinTarget: targets?.protein || 0,
    weight: w ? Number(w.kg) : null
  };
}

export function summaryWish(wishes, max = 3) {
  const pinned = pinnedWishes(wishes, max);
  const active = wishes.filter((w) => w.status === 'want' || w.status === 'doing');
  return {
    empty: !active.length,
    pinned: pinned.length,
    first: pinned[0] || active[0] || null,
    active: active.length
  };
}

export function shortDay(date) {
  return shortDate(date);
}
