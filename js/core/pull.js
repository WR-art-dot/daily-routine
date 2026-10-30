import { all } from './db.js';

export function refKey(module, refId) {
  return `${module}:${refId}`;
}

export async function getRefIndex() {
  const [media, events, workouts, devTasks, bugs] = await Promise.all([
    all('media'),
    all('events'),
    all('workouts'),
    all('devTasks'),
    all('bugs')
  ]);
  const map = new Map();
  for (const m of media) map.set(refKey('media', m.id), { title: m.title, done: m.status === 'published', kind: '选题' });
  for (const e of events) map.set(refKey('study', e.id), { title: e.title, done: false, kind: '日程' });
  for (const w of workouts) map.set(refKey('fitness', w.id), { title: w.title || '训练', done: false, kind: '训练' });
  for (const t of devTasks) map.set(refKey('dev', t.id), { title: t.title, done: !!t.done, kind: '任务' });
  for (const b of bugs) map.set(refKey('dev', b.id), { title: b.title, done: b.status === 'fixed', kind: 'Bug' });
  return map;
}

export async function getPullable(date, planTasks = []) {
  const [media, events, workouts, devTasks, bugs] = await Promise.all([
    all('media'),
    all('events'),
    all('workouts'),
    all('devTasks'),
    all('bugs')
  ]);
  const taken = new Set(planTasks.map((t) => refKey(t.module, t.refId)));
  const items = [];

  const push = (module, refId, title, kind) => {
    if (taken.has(refKey(module, refId))) return;
    items.push({ module, refId, title, kind });
  };

  for (const m of media) {
    if (m.plannedDate === date && m.status !== 'published') push('media', m.id, m.title, '发稿');
  }
  for (const e of events) {
    if ((e.datetime || '').slice(0, 10) === date) push('study', e.id, e.title, '日程');
  }
  for (const w of workouts) {
    if (w.date === date) push('fitness', w.id, w.title || '训练', '训练');
  }
  for (const t of devTasks) {
    if (!t.done) push('dev', t.id, t.title, '任务');
  }
  for (const b of bugs) {
    if (b.status === 'open') push('dev', b.id, b.title, 'Bug');
  }
  return items;
}
