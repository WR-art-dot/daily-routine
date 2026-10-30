import { h, icon } from '../ui/el.js';
import { emptyState } from '../ui/empty.js';
import { toastUndo } from '../ui/toast.js';
import { openDrawer } from '../ui/drawer.js';
import { confirmDialog } from '../ui/modal.js';
import { sparkline, heatmap } from '../ui/chart.js';
import { all, put, del } from '../core/db.js';
import { track } from '../core/save.js';
import { getSettings } from '../core/settings.js';
import { BODY_PARTS, labelOf } from '../core/schema.js';
import { exerciseSeries, prOf, lastEntryOf, weekCount, streakWeeks, heatmap as heatCells } from '../core/library.js';
import { todayStr, shortDate } from '../core/dates.js';

let token = 0;
let rootEl = null;
let ctxRef = null;
let workouts = [];
let exercises = [];
let selectedExerciseId = null;
let libQuery = '';
let libPart = 'all';

function refresh() {
  if (!rootEl || !ctxRef) return;
  const root = rootEl;
  const ctx = ctxRef;
  root.innerHTML = '';
  render(root, ctx);
}

function newWorkoutDrawer() {
  const dateInput = h('input', { class: 'input', type: 'date', value: todayStr() });
  const titleInput = h('input', { class: 'input', placeholder: '今天练什么，例如 上肢推' });
  const durationInput = h('input', { class: 'input', type: 'number', placeholder: '时长（分钟）', value: '' });

  const drawer = openDrawer({
    title: '新建一次训练',
    body: h('div', { class: 'stack' }, dateInput, titleInput, durationInput),
    foot: h(
      'div',
      { class: 'row', style: { width: '100%' } },
      h('button', { class: 'btn ghost', text: '取消', onclick: () => drawer.close() }),
      h('button', {
        class: 'btn primary',
        text: '创建',
        style: { marginLeft: 'auto' },
        onclick: async () => {
          const rec = await track(
            put('workouts', {
              date: dateInput.value || todayStr(),
              title: titleInput.value.trim() || '训练',
              durationMin: Number(durationInput.value) || 0,
              note: '',
              entries: []
            })
          );
          drawer.close();
          workouts.push(rec);
          refresh();
        }
      })
    )
  });
}

function saveWorkout(workout) {
  return track(put('workouts', workout));
}

function exerciseAdder(workout) {
  const input = h('input', { class: 'input', placeholder: '＋ 加动作（搜索动作库）' });
  const picker = h('div', { class: 'picker', hidden: true });

  const renderPicker = () => {
    const q = input.value.trim().toLowerCase();
    const list = exercises
      .filter((ex) => (libPart === 'all' || ex.part === libPart) && (!q || ex.name.toLowerCase().includes(q)))
      .slice(0, 30);
    picker.innerHTML = '';
    if (!list.length) {
      picker.append(
        h('div', { class: 'row' }, h('span', { class: 'grow hint', text: '库里没有，直接新建：' }),
          h('button', {
            class: 'chip',
            type: 'button',
            text: `新建「${input.value.trim() || '未命名'}」`,
            onclick: async () => {
              const rec = await track(
                put('exercises', { name: input.value.trim() || '未命名动作', part: libPart === 'all' ? 'chest' : libPart })
              );
              exercises.push(rec);
              await addEntry(rec);
            }
          })
        )
      );
      return;
    }
    for (const ex of list) {
      picker.append(
        h(
          'div',
          {
            class: 'row',
            onclick: () => addEntry(ex)
          },
          h('span', { class: 'grow', text: ex.name }),
          h('span', { class: 'hint', text: labelOf(BODY_PARTS, ex.part) })
        )
      );
    }
  };

  const addEntry = async (exercise) => {
    const last = lastEntryOf(workouts, exercise.id, workout.date);
    workout.entries = [
      ...(workout.entries || []),
      {
        exerciseId: exercise.id,
        sets: last?.sets || 3,
        reps: last?.reps || 8,
        weight: last?.weight || 0,
        rpe: ''
      }
    ];
    await saveWorkout(workout);
    input.value = '';
    picker.hidden = true;
    refresh();
  };

  input.addEventListener('focus', () => {
    picker.hidden = false;
    renderPicker();
  });
  input.addEventListener('input', () => {
    picker.hidden = false;
    renderPicker();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      picker.hidden = true;
      input.blur();
    }
  });

  return h('div', { class: 'stack' }, input, picker);
}

function workoutCard(workout) {
  const card = h('div', { class: 'card wo-card' });

  const dateInput = h('input', {
    class: 'input',
    type: 'date',
    value: workout.date,
    style: { width: '140px' },
    onchange: async (e) => {
      workout.date = e.target.value;
      await saveWorkout(workout);
      refresh();
    }
  });

  const titleInput = h('input', { class: 'input', value: workout.title || '', placeholder: '训练名称' });
  titleInput.style.border = '0';
  titleInput.style.background = 'transparent';
  titleInput.style.fontWeight = '500';
  titleInput.addEventListener('change', async () => {
    workout.title = titleInput.value.trim();
    await saveWorkout(workout);
  });

  const durationInput = h('input', {
    class: 'input',
    type: 'number',
    value: workout.durationMin || '',
    placeholder: '分钟',
    style: { width: '70px' }
  });
  durationInput.addEventListener('change', async () => {
    workout.durationMin = Number(durationInput.value) || 0;
    await saveWorkout(workout);
  });

  card.append(
    h(
      'div',
      { class: 'row' },
      dateInput,
      titleInput,
      h('span', { class: 'grow' }),
      durationInput,
      h('button', {
        class: 'icon-btn',
        type: 'button',
        'aria-label': '删除这次训练',
        onclick: async () => {
          const ok = await confirmDialog({
            title: '删除这次训练？',
            message: `「${shortDate(workout.date)} ${workout.title || ''}」的记录会一起删掉。`,
            confirmText: '删除',
            danger: true
          });
          if (!ok) return;
          await track(del('workouts', workout.id));
          workouts = workouts.filter((w) => w.id !== workout.id);
          refresh();
          toastUndo('训练记录已删除', async () => {
            await track(put('workouts', workout));
            refresh();
          });
        }
      }, icon('close'))
    )
  );

  const header = h(
    'div',
    { class: 'entry-row', style: { borderBottom: '1px solid var(--line-2)', paddingBottom: '4px' } },
    h('span', { class: 'hint', text: '动作' }),
    h('span', { class: 'hint', text: '组' }),
    h('span', { class: 'hint', text: '次' }),
    h('span', { class: 'hint', text: 'kg' }),
    h('span', { class: 'hint', text: 'RPE' }),
    h('span', {})
  );
  card.append(header);

  if (!(workout.entries || []).length) {
    card.append(h('div', { class: 'hint', style: { padding: '4px 0' }, text: '还没有动作。' }));
  }

  (workout.entries || []).forEach((entry, index) => {
    const exercise = exercises.find((ex) => ex.id === entry.exerciseId);
    const pr = prOf(workouts, entry.exerciseId);
    const last = lastEntryOf(workouts, entry.exerciseId, workout.date);

    const num = (key, width) => {
      const input = h('input', {
        class: 'input',
        type: 'number',
        value: entry[key] ?? '',
        style: { width: width || '100%' }
      });
      input.addEventListener('change', async () => {
        entry[key] = Number(input.value) || 0;
        await saveWorkout(workout);
        if (key === 'weight') refresh();
      });
      return input;
    };

    const row = h(
      'div',
      { class: 'entry-row' },
      h('span', { class: 'grow', text: exercise ? exercise.name : '已删除的动作' }),
      h('span', { class: 'entry-cell' }, num('sets', '52px')),
      h('span', { class: 'entry-cell' }, num('reps', '52px')),
      h('span', { class: 'entry-cell' }, num('weight', '58px')),
      h('span', { class: 'entry-cell' }, num('rpe', '52px')),
      h(
        'button',
        {
          class: 'icon-btn',
          type: 'button',
          'aria-label': '移除动作',
          onclick: async () => {
            workout.entries.splice(index, 1);
            await saveWorkout(workout);
            refresh();
          }
        },
        icon('close')
      )
    );

    const hint = h('div', {
      class: 'hint',
      style: { padding: '0 0 4px 0' },
      text: `${last ? `上次 ${last.weight}kg×${last.reps}` : '第一次做'}${pr ? ` · PR ${pr.weight}kg` : ''}`
    });

    card.append(row, hint);
  });

  card.append(exerciseAdder(workout));
  return card;
}

function libraryCard() {
  const card = h('div', { class: 'card' });
  card.append(
    h('div', { class: 'card-head' }, h('span', { class: 'card-title', text: '动作库' }), h('span', { class: 'hint', text: String(exercises.length) }))
  );

  const search = h('input', { class: 'input', placeholder: '搜索动作', value: libQuery });
  search.style.marginBottom = '6px';
  search.addEventListener('input', () => {
    libQuery = search.value;
    renderList();
  });

  const partChips = h(
    'div',
    { class: 'flex-wrap', style: { marginBottom: '6px' } },
    h('button', {
      class: `chip${libPart === 'all' ? ' on' : ''}`,
      type: 'button',
      text: '全部',
      onclick: () => {
        libPart = 'all';
        refresh();
      }
    }),
    ...BODY_PARTS.map((p) =>
      h('button', {
        class: `chip${libPart === p.id ? ' on' : ''}`,
        type: 'button',
        text: p.name,
        onclick: () => {
          libPart = p.id;
          refresh();
        }
      })
    )
  );

  const listEl = h('div', { class: 'stack' });
  const renderList = () => {
    listEl.innerHTML = '';
    const q = libQuery.trim().toLowerCase();
    const list = exercises.filter(
      (ex) => (libPart === 'all' || ex.part === libPart) && (!q || ex.name.toLowerCase().includes(q))
    );
    if (!list.length) {
      listEl.append(h('div', { class: 'hint', text: '没有匹配的动作，去设置里加。' }));
      return;
    }
    for (const ex of list) {
      const pr = prOf(workouts, ex.id);
      listEl.append(
        h(
          'div',
          {
            class: 'row',
            style: selectedExerciseId === ex.id ? { background: 'var(--accent-soft)' } : null,
            onclick: () => {
              selectedExerciseId = ex.id;
              refresh();
            }
          },
          h('span', { class: 'grow', text: ex.name }),
          h('span', { class: 'hint', text: pr ? `PR ${pr.weight}kg` : '—' })
        )
      );
    }
  };
  renderList();

  card.append(search, partChips, listEl);
  return card;
}

function curveCard() {
  const card = h('div', { class: 'card' });
  const exercise = exercises.find((ex) => ex.id === selectedExerciseId);
  if (!exercise) {
    card.append(h('div', { class: 'hint', text: '在动作库里选一个动作，看它的重量曲线。' }));
    return card;
  }
  const series = exerciseSeries(workouts, exercise.id);
  const pr = prOf(workouts, exercise.id);

  card.append(
    h('div', { class: 'card-head' },
      h('span', { class: 'card-title', text: exercise.name }),
      h('span', { class: 'hint align-end', text: `${series.length} 次记录` })
    ),
    sparkline(series.map((p) => ({ value: p.weight }))),
    h('div', { class: 'hint', style: { marginTop: '6px' }, text: pr ? `PR ${pr.weight} kg · ${shortDate(pr.date)}` : '还没有记录' })
  );
  return card;
}

async function render(root, ctx) {
  const t = ++token;
  rootEl = root;
  ctxRef = ctx;
  workouts = (await all('workouts')).sort((a, b) => (a.date < b.date ? 1 : -1));
  exercises = (await all('exercises')).sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  if (t !== token) return;
  if (!selectedExerciseId && exercises.length) selectedExerciseId = exercises[0].id;

  const settings = getSettings();
  const today = todayStr();
  const target = settings.targets.weeklyWorkouts || 4;
  const week = weekCount(workouts, today, settings.weekStart);
  const streak = streakWeeks(workouts, today, settings.weekStart);

  ctx.setMeta(`本周 ${week} / ${target} 次 · 连续 ${streak} 周`);

  const left = h('div', { class: 'stack' });
  left.append(
    h(
      'div',
      { class: 'card', style: { display: 'flex', gap: '16px', alignItems: 'center' } },
      h('div', {}, h('div', { class: 'hint', text: '本周训练' }), h('div', { style: { fontSize: '20px', fontWeight: '500' }, text: `${week} / ${target} 次` })),
      h('div', {}, h('div', { class: 'hint', text: '连续' }), h('div', { style: { fontSize: '20px', fontWeight: '500' }, text: `${streak} 周` })),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn primary', text: '＋ 新建一次训练', onclick: newWorkoutDrawer })
    )
  );

  if (!workouts.length) {
    left.append(
      emptyState({
        title: '还没有训练记录',
        text: '先建一次训练，再往里加动作和重量。',
        actionLabel: '新建一次训练',
        onAction: newWorkoutDrawer
      })
    );
  }
  workouts.forEach((w) => left.append(workoutCard(w)));

  const right = h('div', { class: 'stack' });
  right.append(libraryCard(), curveCard());

  const heat = h(
    'div',
    { class: 'card' },
    h('div', { class: 'card-head' }, h('span', { class: 'card-title', text: '近 12 周' })),
    heatmap(heatCells(workouts, today, 12))
  );
  right.append(heat);

  root.append(h('div', { class: 'page' }, h('div', { class: 'fit-grid' }, left, right)));

  if (ctx.query?.new === '1') newWorkoutDrawer();
}

export default {
  async render(root, ctx) {
    await render(root, ctx);
  },
  destroy() {
    token += 1;
    rootEl = null;
    ctxRef = null;
  }
};
