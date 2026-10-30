import { h } from './el.js';

export function emptyState({ title, text, actionLabel, onAction, center = false, inline = false } = {}) {
  return h(
    'div',
    { class: `empty${center ? ' center' : ''}` },
    title ? h('div', { class: 'empty-title', text: title }) : null,
    text ? h('div', { class: 'hint', text }) : null,
    actionLabel
      ? h('button', {
          class: 'btn',
          type: 'button',
          text: actionLabel,
          onclick: onAction
        })
      : null
  );
}

export function emptyRow(text) {
  return h('div', { class: 'hint', style: { padding: '8px 4px' }, text });
}
