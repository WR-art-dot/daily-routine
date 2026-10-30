import { h } from './el.js';
import { addDays, pad2, parseDate, todayStr } from '../core/dates.js';

const WD = ['日', '一', '二', '三', '四', '五', '六'];

/**
 * 月历网格。
 * month: 'YYYY-MM'
 * marks: Map<dateStr, { tone, chips: [{ text, title }], title }>
 *   tone  —— 该日的主题色（CSS 颜色值，一般是模块色变量）
 *   chips —— 当天的小标签（部位名、热量等），最多展示两三个
 *   title —— 悬停时的完整说明
 */
export function monthCalendar({ month, marks = new Map(), weekStartDay = 1, onPrev, onNext, onToday, onPick }) {
  const [y, m] = month.split('-').map(Number);
  const first = `${y}-${pad2(m)}-01`;
  const daysInMonth = new Date(y, m, 0).getDate();
  const lead = (parseDate(first).getDay() - weekStartDay + 7) % 7;
  const total = lead + daysInMonth;
  const rows = Math.ceil(total / 7);
  const today = todayStr();
  const currentMonth = today.slice(0, 7);

  const head = h(
    'div',
    { class: 'cal-head' },
    h(
      'div',
      { class: 'flex' },
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': '上一月', text: '‹', onclick: onPrev }),
      h('span', { class: 'cal-label', text: `${y} 年 ${m} 月` }),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': '下一月', text: '›', onclick: onNext })
    ),
    h('span', { class: 'grow' }),
    month !== currentMonth && onToday
      ? h('button', { class: 'chip', type: 'button', text: '回到本月', onclick: onToday })
      : null
  );

  const wdRow = Array.from({ length: 7 }, (_, i) => WD[(weekStartDay + i) % 7]);
  const grid = h('div', { class: 'cal-grid' }, wdRow.map((wd) => h('span', { class: 'cal-wd', text: wd })));

  for (let i = 0; i < rows * 7; i++) {
    const date = addDays(first, i - lead);
    const inMonth = i >= lead && i < total;
    const mark = inMonth ? marks.get(date) : null;

    const chips = mark
      ? h(
          'div',
          { class: 'cal-chips' },
          mark.chips.map((c) =>
            h('span', {
              class: 'cal-chip',
              text: c.text,
              title: c.title || '',
              style: c.tone
                ? { background: `color-mix(in srgb, ${c.tone} 13%, transparent)`, color: c.tone }
                : null
            })
          )
        )
      : null;

    const cell = h(
      'div',
      {
        class: `cal-cell${inMonth ? '' : ' cal-out'}${date === today ? ' cal-today' : ''}`,
        title: mark?.title || '',
        role: onPick && inMonth ? 'button' : null,
        tabindex: onPick && inMonth ? '0' : null,
        onclick: onPick && inMonth ? () => onPick(date) : null
      },
      h('span', { class: 'cal-day num', text: String(Number(date.slice(8, 10))) }),
      chips
    );
    if (mark?.tone) cell.style.background = `color-mix(in srgb, ${mark.tone} 7%, transparent)`;
    grid.append(cell);
  }

  return h('div', { class: 'cal' }, head, grid);
}
