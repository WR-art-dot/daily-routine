import { h } from './el.js';

let active = null;

export function closeModal(value = null) {
  if (active) active.settle(value);
}

export function isModalOpen() {
  return !!active;
}

export function openModal({ title, message, body, actions = [], dismissable = true } = {}) {
  closeModal(null);

  const host = document.getElementById('overlay-host');
  const overlay = h('div', { class: 'overlay' });
  const box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' });

  const foot = h('div', { class: 'modal-foot' });

  box.append(
    h('h3', { text: title || '' }),
    message ? h('p', { text: message }) : null,
    body || null,
    foot
  );

  for (const action of actions) {
    const cls = ['btn'];
    if (action.kind === 'primary') cls.push('primary');
    if (action.kind === 'danger') cls.push('danger');
    if (action.kind === 'ghost') cls.push('ghost');
    const btn = h('button', {
      class: cls.join(' '),
      type: 'button',
      text: action.label,
      onclick: () => settle(action.value)
    });
    if (action.disabled) btn.disabled = true;
    if (action.ref) action.ref(btn);
    foot.append(btn);
  }

  host.append(overlay, box);

  let done = false;
  function settle(value) {
    if (done) return;
    done = true;
    active = null;
    window.removeEventListener('keydown', onKey, true);
    box.classList.remove('show');
    overlay.classList.remove('show');
    setTimeout(() => {
      overlay.remove();
      box.remove();
    }, 160);
    resolveFn(value);
  }

  let resolveFn;
  const promise = new Promise((res) => {
    resolveFn = res;
  });

  const onKey = (e) => {
    if (e.key === 'Escape' && dismissable) {
      e.stopPropagation();
      settle(null);
    }
  };

  overlay.addEventListener('click', () => {
    if (dismissable) settle(null);
  });
  window.addEventListener('keydown', onKey, true);

  requestAnimationFrame(() => {
    overlay.classList.add('show');
    box.classList.add('show');
    const firstInput = box.querySelector('input, textarea');
    (firstInput || box.querySelector('.btn.primary'))?.focus();
  });

  active = { settle, el: box };
  return promise;
}

export function confirmDialog({
  title,
  message,
  confirmText = '确定',
  cancelText = '取消',
  danger = false
} = {}) {
  return openModal({
    title,
    message,
    actions: [
      { label: cancelText, value: false, kind: 'ghost' },
      { label: confirmText, value: true, kind: danger ? 'danger' : 'primary' }
    ]
  }).then((v) => v === true);
}

export function requireTextDialog({ title, message, expected, confirmText = '确定' } = {}) {
  const input = h('input', { class: 'input', placeholder: `输入「${expected}」以确认` });
  return openModal({
    title,
    message,
    body: h('div', { style: { marginBottom: '16px' } }, input),
    actions: [
      { label: '取消', value: 'no', kind: 'ghost' },
      {
        label: confirmText,
        value: 'yes',
        kind: 'danger',
        ref: (btn) => {
          btn.disabled = true;
          input.addEventListener('input', () => {
            btn.disabled = input.value.trim() !== expected;
          });
        }
      }
    ]
  }).then((v) => v === 'yes');
}
