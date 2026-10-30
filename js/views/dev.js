import { h, icon } from '../ui/el.js';
import { addRow, inlineInput } from '../ui/inline.js';
import { emptyState } from '../ui/empty.js';
import { toastUndo } from '../ui/toast.js';
import { confirmDialog } from '../ui/modal.js';
import { all, put, del } from '../core/db.js';
import { track } from '../core/save.js';
import { PROJECT_STATUS, TASK_GROUPS, BUG_SEVERITY, labelOf } from '../core/schema.js';
import { devTasksGrouped, openBugCount } from '../core/library.js';
import { todayStr, shortDate, monthDay } from '../core/dates.js';

const OPEN_BUG_KEY = 'lifeapp.dev.openBugs';

let token = 0;
let rootEl = null;
let ctxRef = null;
let projects = [];
let selectedId = null;
let tab = 'task';
let tasks = [];
let bugs = [];
let releases = [];
let logs = [];

function refresh() {
  if (!rootEl || !ctxRef) return;
  const root = rootEl;
  const ctx = ctxRef;
  root.innerHTML = '';
  render(root, ctx, true);
}

function readOpenBugs() {
  try {
    return new Set(JSON.parse(localStorage.getItem(OPEN_BUG_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function writeOpenBugs(set) {
  localStorage.setItem(OPEN_BUG_KEY, JSON.stringify([...set]));
}

function go(projectId, nextTab = tab) {
  ctxRef.navigate(`/dev/${projectId}/${nextTab}`);
}

function headerCard(project) {
  const statusSelect = h(
    'select',
    {
      class: 'select',
      style: { width: '110px' },
      onchange: async (e) => {
        await track(put('projects', { ...project, status: e.target.value }));
        refresh();
      }
    },
    PROJECT_STATUS.map((s) => h('option', { value: s.id, text: s.name, selected: project.status === s.id }))
  );

  const nameInput = inlineInput({
    value: project.name,
    placeholder: '项目名',
    onCommit: async (value) => {
      if (!value.trim()) return;
      await track(put('projects', { ...project, name: value.trim() }));
      refresh();
    }
  });
  nameInput.style.fontSize = '16px';
  nameInput.style.fontWeight = '500';

  const repoInput = h('input', {
    class: 'input',
    value: project.repo || '',
    placeholder: '仓库路径或链接',
    onchange: async (e) => {
      await track(put('projects', { ...project, repo: e.target.value.trim() }));
    }
  });

  const stackInput = h('input', {
    class: 'input',
    value: (project.stack || []).join(', '),
    placeholder: '技术栈，逗号分隔',
    onchange: async (e) => {
      const stack = e.target.value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      await track(put('projects', { ...project, stack }));
      refresh();
    }
  });

  const counts = {
    task: tasks.filter((t) => t.projectId === project.id).length,
    bug: bugs.filter((b) => b.projectId === project.id).length,
    version: releases.filter((r) => r.projectId === project.id).length,
    log: logs.filter((l) => l.projectId === project.id).length
  };

  const tabs = [
    ['task', `任务 ${counts.task}`],
    ['bug', `Bug ${counts.bug}`],
    ['version', `版本 ${counts.version}`],
    ['log', '日志']
  ].map(([id, label]) =>
    h('button', {
      class: `tab${tab === id ? ' on' : ''}`,
      type: 'button',
      text: label,
      onclick: () => go(project.id, id)
    })
  );

  return h(
    'div',
    { class: 'card' },
    h('div', { class: 'row' }, nameInput, statusSelect, h('span', { class: 'grow' }), h('div', { class: 'tabs' }, ...tabs)),
    h(
      'div',
      { class: 'row', style: { marginTop: '6px' } },
      h('span', { class: 'hint', text: '仓库' }),
      repoInput,
      h('span', { class: 'hint', text: '栈' }),
      stackInput
    ),
    project.note ? h('div', { class: 'hint', style: { marginTop: '6px' }, text: project.note }) : null
  );
}

function tasksCard(project) {
  const card = h('div', { class: 'card' });
  const mine = tasks.filter((t) => t.projectId === project.id);

  if (!mine.length) {
    card.append(h('div', { class: 'hint', text: '这个项目还没有任务，按功能 / 修复 / 优化分开记。' }));
  }

  for (const group of devTasksGrouped(mine, TASK_GROUPS)) {
    card.append(
      h(
        'div',
        { class: 'card-head', style: { marginTop: '10px' } },
        h('span', { class: 'card-title', text: group.group.name }),
        h('span', { class: 'hint', text: String(group.items.length) })
      )
    );
    for (const task of group.items) {
      const check = h('span', {
        class: `check${task.done ? ' on' : ''}`,
        role: 'checkbox',
        tabindex: '0',
        'aria-checked': String(!!task.done),
        onclick: async () => {
          await track(put('devTasks', { ...task, done: !task.done }));
          refresh();
        }
      });
      card.append(
        h(
          'div',
          { class: 'row sep' },
          check,
          h('span', { class: task.done ? 'grow done-text' : 'grow', text: task.title }),
          h(
            'div',
            { class: 'row-actions' },
            h(
              'button',
              {
                class: 'icon-btn',
                type: 'button',
                'aria-label': '删除任务',
                onclick: async () => {
                  await track(del('devTasks', task.id));
                  refresh();
                  toastUndo('任务已删除', async () => {
                    await track(put('devTasks', task));
                    refresh();
                  });
                }
              },
              icon('close')
            )
          )
        )
      );
    }
    card.append(
      addRow({
        placeholder: `＋ 加一条${group.group.name}`,
        onAdd: async (value) => {
          await track(
            put('devTasks', {
              projectId: project.id,
              group: group.group.id,
              title: value,
              done: false,
              order: mine.length
            })
          );
          refresh();
        }
      })
    );
  }

  return card;
}

function bugsCard(project) {
  const card = h('div', { class: 'card' });
  const mine = bugs
    .filter((b) => b.projectId === project.id)
    .sort((a, b) => (a.status === b.status ? 0 : a.status === 'open' ? -1 : 1));
  const openSet = readOpenBugs();

  if (!mine.length) card.append(h('div', { class: 'hint', text: '还没有 bug。' }));

  for (const bug of mine) {
    const isOpen = bug.status === 'open';
    const expanded = openSet.has(bug.id);

    const row = h(
      'div',
      { class: 'bug-row row', style: { borderBottom: '1px solid var(--line-2)', borderRadius: '0' } },
      h('span', { class: `sev sev-${bug.severity || 'minor'}`, text: labelOf(BUG_SEVERITY, bug.severity) }),
      h('span', { class: isOpen ? 'grow' : 'grow done-text', text: bug.title }),
      h('button', {
        class: 'chip',
        type: 'button',
        text: isOpen ? '待修' : '已修',
        onclick: async () => {
          await track(put('bugs', { ...bug, status: isOpen ? 'fixed' : 'open' }));
          refresh();
        }
      }),
      h('button', {
        class: 'icon-btn',
        type: 'button',
        'aria-label': expanded ? '收起' : '展开',
        text: expanded ? '▴' : '▾',
        onclick: () => {
          if (expanded) openSet.delete(bug.id);
          else openSet.add(bug.id);
          writeOpenBugs(openSet);
          refresh();
        }
      })
    );

    card.append(row);

    if (expanded) {
      const repro = h('textarea', {
        class: 'textarea',
        rows: 3,
        placeholder: '复现步骤',
        value: bug.repro || ''
      });
      repro.addEventListener('blur', async () => {
        if (repro.value === (bug.repro || '')) return;
        await track(put('bugs', { ...bug, repro: repro.value }));
      });
      const note = h('textarea', {
        class: 'textarea',
        rows: 2,
        placeholder: '修复思路 / 备注',
        value: bug.note || ''
      });
      note.addEventListener('blur', async () => {
        if (note.value === (bug.note || '')) return;
        await track(put('bugs', { ...bug, note: note.value }));
      });
      card.append(
        h(
          'div',
          { class: 'bug-detail' },
          repro,
          note,
          h(
            'div',
            { class: 'row' },
            h('span', { class: 'hint', text: '严重度' }),
            h(
              'select',
              {
                class: 'select',
                style: { width: '100px' },
                onchange: async (e) => {
                  await track(put('bugs', { ...bug, severity: e.target.value }));
                  refresh();
                }
              },
              BUG_SEVERITY.map((s) => h('option', { value: s.id, text: s.name, selected: bug.severity === s.id }))
            ),
            h('span', { class: 'grow' }),
            h('button', {
              class: 'btn danger sm',
              text: '删除这条 bug',
              onclick: async () => {
                await track(del('bugs', bug.id));
                refresh();
                toastUndo('Bug 已删除', async () => {
                  await track(put('bugs', bug));
                  refresh();
                });
              }
            })
          )
        )
      );
    }
  }

  const adder = addRow({
    placeholder: '＋ 记一个 bug，回车提交',
    onAdd: async (value) => {
      await track(
        put('bugs', {
          projectId: project.id,
          title: value,
          severity: 'major',
          status: 'open',
          repro: '',
          note: ''
        })
      );
      refresh();
    }
  });
  card.append(adder);
  return card;
}

function versionsCard(project) {
  const card = h('div', { class: 'card' });
  const mine = releases
    .filter((r) => r.projectId === project.id)
    .sort((a, b) => ((a.dueDate || '') < (b.dueDate || '') ? -1 : 1));

  if (!mine.length) card.append(h('div', { class: 'hint', text: '还没有版本节点。' }));

  for (const rel of mine) {
    const linked = tasks.filter((t) => t.projectId === project.id && (rel.taskIds || []).includes(t.id)).length;
    card.append(
      h(
        'div',
        { class: 'release-item' },
        h('span', { class: 'dot-m', style: { background: 'var(--accent)', marginTop: '6px' } }),
        h(
          'div',
          { class: 'stack', style: { flex: '1' } },
          h(
            'div',
            { class: 'row' },
            inlineInput({
              value: rel.version,
              placeholder: '版本号',
              onCommit: async (value) => {
                await track(put('releases', { ...rel, version: value }));
                refresh();
              }
            }),
            h('input', {
              class: 'input',
              type: 'date',
              value: rel.dueDate || '',
              style: { width: '140px' },
              onchange: async (e) => {
                await track(put('releases', { ...rel, dueDate: e.target.value }));
                refresh();
              }
            }),
            h('span', { class: 'hint', text: `${linked} 个任务` })
          )
        ),
        h(
          'button',
          {
            class: 'icon-btn',
            type: 'button',
            'aria-label': '删除版本',
            onclick: async () => {
              await track(del('releases', rel.id));
              refresh();
            }
          },
          icon('close')
        )
      )
    );
  }

  card.append(
    addRow({
      placeholder: '＋ 新版本，例如 v0.3',
      onAdd: async (value) => {
        await track(put('releases', { projectId: project.id, version: value, dueDate: '', taskIds: [] }));
        refresh();
      }
    })
  );
  return card;
}

function logsCard(project) {
  const card = h('div', { class: 'card' });
  const mine = logs
    .filter((l) => l.projectId === project.id)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const today = todayStr();
  const todayLog = mine.find((l) => l.date === today);

  const area = h('textarea', {
    class: 'textarea',
    rows: 3,
    placeholder: '今天在这个项目动了什么',
    value: todayLog?.text || ''
  });
  area.addEventListener('blur', async () => {
    const text = area.value.trim();
    if (!text) return;
    if (todayLog) {
      if (text === todayLog.text) return;
      await track(put('devLogs', { ...todayLog, text }));
      const hit = logs.find((l) => l.id === todayLog.id);
      if (hit) hit.text = text;
    } else {
      const rec = await track(put('devLogs', { projectId: project.id, date: today, text }));
      logs.push(rec);
    }
  });

  card.append(
    h('div', { class: 'hint', text: `今天 · ${monthDay(today)}` }),
    area,
    h('div', { class: 'sep-line' })
  );

  const others = mine.filter((l) => l.date !== today);
  if (!others.length) card.append(h('div', { class: 'hint', text: '还没有更早的日志。' }));
  for (const log of others.slice(0, 20)) {
    card.append(
      h(
        'div',
        { class: 'row sep' },
        h('span', { class: 'hint', style: { width: '64px', flex: 'none' }, text: shortDate(log.date) }),
        h('span', { class: 'grow', text: log.text })
      )
    );
  }
  return card;
}

function newProjectAdder(ctx) {
  return addRow({
    placeholder: '＋ 输入项目名，回车创建',
    onAdd: async (value) => {
      const rec = await track(put('projects', { name: value, status: 'active', stack: [], repo: '', note: '' }));
      selectedId = rec.id;
      ctx.navigate(`/dev/${rec.id}/task`);
    }
  });
}

async function render(root, ctx, isRefresh = false) {
  const t = ++token;
  rootEl = root;
  ctxRef = ctx;

  projects = (await all('projects')).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  tasks = await all('devTasks');
  bugs = await all('bugs');
  releases = await all('releases');
  logs = await all('devLogs');
  if (t !== token) return;

  const wantId = isRefresh ? selectedId : ctx.params?.projectId || selectedId;
  const project = projects.find((p) => p.id === wantId) || projects[0] || null;
  selectedId = project?.id || null;
  tab = ctx.params?.tab || (isRefresh ? tab : 'task');
  if (!['task', 'bug', 'version', 'log'].includes(tab)) tab = 'task';

  const projectList = h('div', { class: 'card proj-list' });
  projectList.append(h('div', { class: 'card-head' }, h('span', { class: 'card-title', text: '项目' })));
  for (const p of projects) {
    const open = openBugCount(bugs, p.id);
    projectList.append(
      h(
        'div',
        {
          class: `proj-item${p.id === selectedId ? ' on' : ''}`,
          role: 'button',
          tabindex: '0',
          onclick: () => go(p.id)
        },
        h('span', {
          class: 'dot-m',
          style: { background: PROJECT_STATUS.find((s) => s.id === p.status)?.color || 'var(--ink-3)' }
        }),
        h('span', { class: 'proj-name', text: p.name }),
        open ? h('span', { class: 'badge', text: String(open) }) : null
      )
    );
  }
  projectList.append(newProjectAdder(ctx));

  if (!project) {
    const starter = h(
      'div',
      { class: 'card', style: { maxWidth: '460px' } },
      h('div', { class: 'card-head' }, h('span', { class: 'card-title', text: '新建第一个项目' })),
      h('div', { class: 'hint', style: { marginBottom: '6px' }, text: '建好项目后，里面按 功能 / 修复 / 优化 三组记工作项，还能记 bug、版本和日志。' }),
      newProjectAdder(ctx)
    );
    root.append(
      h(
        'div',
        { class: 'page' },
        emptyState({
          title: '还没有项目',
          text: '在下面输入项目名，回车创建。'
        }),
        starter
      )
    );
    ctx.setMeta('0 个项目');
    return;
  }

  const content =
    tab === 'task'
      ? tasksCard(project)
      : tab === 'bug'
        ? bugsCard(project)
        : tab === 'version'
          ? versionsCard(project)
          : logsCard(project);

  ctx.setMeta(`${projects.length} 个项目 · ${labelOf(PROJECT_STATUS, project.status)}`);

  root.append(
    h(
      'div',
      { class: 'page' },
      h(
        'div',
        { class: 'dev-grid' },
        projectList,
        h('div', { class: 'stack' }, headerCard(project), content)
      )
    )
  );
}

export default {
  async render(root, ctx) {
    await render(root, ctx, false);
  },
  destroy() {
    token += 1;
    rootEl = null;
    ctxRef = null;
  }
};
