import { h, svg } from './el.js';

export function sparkline(points, { w = 240, h = 56, color = 'var(--accent)' } = {}) {
  const values = points.map((p) => p.value).filter((v) => v !== null && Number.isFinite(v));
  const root = svg('svg', {
    viewBox: `0 0 ${w} ${h}`,
    style: 'width:100%;display:block',
    'aria-hidden': 'true'
  });
  if (!values.length) return root;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = points.length > 1 ? (w - 16) / (points.length - 1) : 0;

  let d = '';
  let started = false;
  let lastPoint = null;
  points.forEach((p, i) => {
    if (p.value === null || !Number.isFinite(p.value)) {
      started = false;
      return;
    }
    const x = 8 + i * step;
    const y = h - 8 - ((p.value - min) / span) * (h - 16);
    d += `${started ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)} `;
    started = true;
    lastPoint = { x, y };
  });

  root.append(
    svg('path', {
      d,
      fill: 'none',
      stroke: color,
      'stroke-width': '1.6',
      'stroke-linejoin': 'round',
      'stroke-linecap': 'round'
    })
  );
  if (lastPoint) {
    root.append(svg('circle', { cx: lastPoint.x, cy: lastPoint.y, r: '2.4', fill: color }));
  }
  return root;
}

export function heatmap(cells) {
  const wrap = h('div', { class: 'heat' });
  const max = Math.max(1, ...cells.map((c) => c.count));
  for (const cell of cells) {
    const level = cell.count === 0 ? 0 : Math.ceil((cell.count / max) * 3);
    const opacity = level === 0 ? 0 : 0.25 + level * 0.25;
    wrap.append(
      h('i', {
        title: `${cell.date}${cell.count ? ` · ${cell.count} 次` : ''}`,
        style: {
          background: level === 0 ? 'var(--surface-3)' : `color-mix(in srgb, var(--accent) ${Math.round(opacity * 100)}%, transparent)`,
          opacity: cell.future ? 0.35 : 1
        }
      })
    );
  }
  return wrap;
}

export function progressBar(ratio, { danger = false } = {}) {
  return h(
    'div',
    { class: 'bar soft' },
    h('i', {
      style: {
        width: `${Math.max(0, Math.min(1, ratio)) * 100}%`,
        background: danger ? 'var(--warn)' : 'var(--accent)'
      }
    })
  );
}
