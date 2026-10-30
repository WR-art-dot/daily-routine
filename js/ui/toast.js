import { h, clear } from './el.js';
import { pushUndo } from '../core/undo.js';

const host = () => document.getElementById('toast-host');

export function toast(message, opts = {}) {
  const { actionLabel, onAction, duration = 5000 } = opts;
  const node = h(
    'div',
    { class: 'toast', role: 'status' },
    h('span', { text: message }),
    actionLabel
      ? h('button', {
          type: 'button',
          text: actionLabel,
          onclick: () => {
            dismiss();
            onAction?.();
          }
        })
      : null
  );

  let timer = null;
  const dismiss = () => {
    if (timer) clearTimeout(timer);
    node.remove();
  };

  host()?.append(node);
  if (duration > 0) timer = setTimeout(dismiss, duration);
  return { dismiss };
}

export function toastUndo(message, onUndo) {
  pushUndo(message, onUndo);
  return toast(message, {
    actionLabel: '撤销',
    onAction: onUndo,
    duration: 5000
  });
}

export function clearToasts() {
  const el = host();
  if (el) clear(el);
}
