import { h, icon } from '../ui/el.js';
import { addRow } from '../ui/inline.js';
import { emptyState } from '../ui/empty.js';
import { toast, toastUndo } from '../ui/toast.js';
import { openDrawer } from '../ui/drawer.js';
import { confirmDialog } from '../ui/modal.js';
import { all, put, del } from '../core/db.js';
import { track } from '../core/save.js';
import { WISH_KINDS, WISH_STATUS, labelOf } from '../core/schema.js';
import { pinnedWishes, canPin, pickRandom } from '../core/library.js';
import { todayStr, shortDate } from '../core/dates.js';

const MAX_PIN = 3;

let token = 0;
let rootEl = null;
let ctxRef = null;
let wishes = [];
let kindFilter = 'all';
let flashId = null;
let showArchive = false;
let randomOnLoad = false;

function refresh() {
  if (!rootEl || !ctxRef) return;
  const root = rootEl;
  const ctx = ctxRef;
  root.innerHTML = '';
  render(root, ctx);
}

function nextStatus(status) {
  const ids = WISH_STATUS.map((s) => s.id);
  return ids[(ids.indexOf(status) + 1) % ids.length];
}

function openWish(wish) {
  const titleInput = h('input', { class: 'input', value: wish.title, placeholder: '想做的事' });
  const kindSelect = h(
    'select',
    { class: 'select', style: { width: '100px' } },
    WISH_KINDS.map((k) => h('option', { value: k.id, text: k.name, selected: wish.kind === k.id }))
  );
  const sourceInput = h('input', { class: 'input', value: wish.source || '', placeholder: '谁推荐的' });
  const reasonArea = h('textarea', { class: 'textarea', rows: 3, value: wish.reason || '', placeholder: '想做的理由' });

  const drawer = openDrawer({
    title: '心愿详情',
    body: h('div', { class: 'stack' }, titleInput, h('div', { class: 'row' }, kindSelect, sourceInput), reasonArea),
    foot: h(
      'div',
      { class: 'row', style: { width: '100%' } },
      h('button', {
        class: 'btn danger',
        text: '删除',
        onclick: async () => {
          const ok = await confirmDialog({ title: '删除这条心愿？', confirmText: '删除', danger: true });
          if (!ok) return;
          drawer.close();
          await track(del('wishes', wish.id));
          wishes = wishes.filter((w) => w.id !== wish.id);
          refresh();
          toastUndo('已删除', async () => {
            await track(put('wishes', wish));
            refresh();
          });
        }
      }),
      h('button', {
        class: 'btn primary',
        text: '保存',
        style: { marginLeft: 'auto' },
        onclick: async () => {
          const patch = {
            ...wish,
            title: titleInput.value.trim() || wish.title,
            kind: kindSelect.value,
            source: sourceInput.value.trim(),
            reason: reasonArea.value
          };
          Object.assign(wish, patch);
          await track(put('wishes', patch));
          drawer.close();
          refresh();
        }
      })
    )
  });
}

function wishCard(wish) {
  const pinned = !!wish.weekPinned && wish.status !== 'done';
  const card = h('div', {
    class: `card wish-card${pinned ? ' pinned' : ''}${flashId === wish.id ? ' flash' : ''}`,
    'data-id': wish.id
  });

  card.append(
    h('div', { class: 'row', style: { alignItems: 'flex-start' } },
      h('span', { class: 'wish-title grow', text: wish.title }),
      h('button', {
        class: `wish-pin${pinned ? ' on' : ''}`,
        type: 'button',
        text: pinned ? '本周' : '钉',
        title: pinned ? '取消本周' : '钉到本周',
        onclick: async (e) => {
          e.stopPropagation();
          if (!pinned && !canPin(wishes, MAX_PIN)) {
            toast(`本周最多钉 ${MAX_PIN} 件，先取消一条`);
            return;
          }
          await track(put('wishes', { ...wish, weekPinned: !pinned }));
          refresh();
        }
      })
    ),
    h('div', { class: 'wish-meta', text: `${labelOf(WISH_KINDS, wish.kind)} · ${wish.source || '自己想到'}` }),
    wish.reason ? h('div', { class: 'wish-meta', text: wish.reason }) : null,
    h(
      'div',
      { class: 'row', style: { marginTop: 'auto' } },
      h('button', {
        class: 'chip',
        type: 'button',
        text: labelOf(WISH_STATUS, wish.status),
        onclick: async (e) => {
          e.stopPropagation();
          const next = nextStatus(wish.status);
          const patch = { ...wish, status: next };
          if (next === 'done') {
            patch.completedAt = todayStr();
            patch.weekPinned = false;
          }
          Object.assign(wish, patch);
          await track(put('wishes', patch));
          refresh();
        }
      }),
      h('span', { class: 'grow' }),
      h('button', {
        class: 'icon-btn',
        type: 'button',
        'aria-label': '删除',
        onclick: async (e) => {
          e.stopPropagation();
          await track(del('wishes', wish.id));
          wishes = wishes.filter((w) => w.id !== wish.id);
          refresh();
          toastUndo('已删除', async () => {
            await track(put('wishes', wish));
            refresh();
          });
        }
      }, icon('close'))
    )
  );

  card.addEventListener('click', () => openWish(wish));
  return card;
}

function doRandom() {
  const pool = wishes.filter((w) => w.status === 'want');
  if (!pool.length) {
    toast('「想做」里还没有东西，先记一条');
    return;
  }
  const picked = pickRandom(pool);
  flashId = picked.id;
  refresh();
  setTimeout(() => {
    const el = document.querySelector(`.wish-card[data-id="${picked.id}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, 30);
  setTimeout(() => {
    flashId = null;
  }, 1200);
}

async function render(root, ctx) {
  const t = ++token;
  rootEl = root;
  ctxRef = ctx;

  wishes = await all('wishes');
  if (t !== token) return;

  const active = wishes.filter((w) => w.status !== 'done');
  const archived = wishes.filter((w) => w.status === 'done');
  const visible = active.filter((w) => kindFilter === 'all' || w.kind === kindFilter);
  const pinned = pinnedWishes(wishes, MAX_PIN);

  ctx.setMeta(`${active.length} 条在做 · 本周钉了 ${pinned.length}`);

  const chips = [
    h('button', {
      class: `chip${kindFilter === 'all' ? ' on' : ''}`,
      type: 'button',
      text: '全部',
      onclick: () => {
        kindFilter = 'all';
        refresh();
      }
    }),
    ...WISH_KINDS.map((k) =>
      h('button', {
        class: `chip${kindFilter === k.id ? ' on' : ''}`,
        type: 'button',
        text: k.name,
        onclick: () => {
          kindFilter = k.id;
          refresh();
        }
      })
    )
  ];

  const bar = h(
    'div',
    { class: 'page-bar' },
    ...chips,
    h('span', { class: 'grow' }),
    h('button', { class: 'btn', text: '随机抽一条', onclick: doRandom }),
    h('button', {
      class: 'btn primary',
      text: '＋ 记一条',
      onclick: () => {
        const input = root.querySelector('.add-row input');
        input?.focus();
      }
    })
  );

  const grid = h('div', { class: 'wish-grid' });
  const ordered = [...pinned, ...visible.filter((w) => !pinned.some((p) => p.id === w.id))];
  ordered.forEach((w) => grid.append(wishCard(w)));

  const page = h('div', { class: 'page' }, bar);
  if (!wishes.length) {
    page.append(
      emptyState({
        title: '清单还是空的',
        text: '游戏、剧、想去的地方、想去的店，想到什么记什么。',
        actionLabel: '记第一条',
        onAction: () => root.querySelector('.add-row input')?.focus()
      })
    );
  } else if (!visible.length) {
    page.append(h('div', { class: 'hint', style: { padding: '12px 0' }, text: '这个类型还没有条目。' }));
  } else {
    page.append(grid);
  }

  page.append(
    h(
      'div',
      { class: 'card', style: { marginTop: '12px' } },
      addRow({
        placeholder: '＋ 记一条心愿，回车提交',
        onAdd: async (value) => {
          await track(
            put('wishes', {
              title: value,
              kind: kindFilter === 'all' ? 'game' : kindFilter,
              source: '',
              reason: '',
              status: 'want',
              weekPinned: false,
              completedAt: null
            })
          );
          refresh();
        }
      })
    )
  );

  if (archived.length) {
    const archiveCard = h('div', { class: 'card wish-archive' });
    archiveCard.append(
      h(
        'div',
        { class: 'card-head' },
        h('span', { class: 'card-title', text: `已完成 ${archived.length} 条` }),
        h('button', {
          class: 'card-link',
          type: 'button',
          text: showArchive ? '收起' : '展开',
          onclick: () => {
            showArchive = !showArchive;
            refresh();
          }
        })
      )
    );
    if (showArchive) {
      for (const w of archived) {
        archiveCard.append(
          h(
            'div',
            { class: 'row sep' },
            h('span', { class: 'grow done-text', text: w.title }),
            h('span', { class: 'hint', text: w.completedAt ? shortDate(w.completedAt) : '' }),
            h('button', {
              class: 'chip',
              type: 'button',
              text: '恢复',
              onclick: async () => {
                await track(put('wishes', { ...w, status: 'doing', completedAt: null }));
                refresh();
              }
            })
          )
        );
      }
    }
    page.append(archiveCard);
  }

  root.append(page);

  if (randomOnLoad) {
    randomOnLoad = false;
    doRandom();
  }
}

export default {
  async render(root, ctx) {
    kindFilter = 'all';
    randomOnLoad = ctx.query?.random === '1';
    await render(root, ctx);
  },
  destroy() {
    token += 1;
    rootEl = null;
    ctxRef = null;
  }
};
