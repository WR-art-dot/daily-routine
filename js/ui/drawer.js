import { h, icon } from './el.js';

let active = null;

export function closeDrawer() {
  if (active) active.close();
}

export function isDrawerOpen() {
  return !!active;
}

export function openDrawer({ title, body, foot, onClose, width } = {}) {
  closeDrawer();

  const host = document.getElementById('overlay-host');
  const overlay = h('div', { class: 'overlay' });
  const drawer = h('aside', { class: 'drawer', role: 'dialog', 'aria-modal': 'true' });
  if (width) drawer.style.width = width;

  const titleEl = h('div', { class: 'drawer-title', text: title || '' });
  const closeBtn = h(
    'button',
    { class: 'icon-btn', type: 'button', 'aria-label': '关闭' },
    icon('close')
  );
  const bodyEl = h('div', { class: 'drawer-body' });
  const footEl = h('div', { class: 'drawer-foot' });

  if (body) bodyEl.append(body);
  if (foot) footEl.append(foot);

  drawer.append(
    h('div', { class: 'drawer-head' }, titleEl, closeBtn),
    bodyEl,
    foot ? footEl : null
  );
  host.append(overlay, drawer);

  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };

  function close() {
    if (!active) return;
    active = null;
    window.removeEventListener('keydown', onKey, true);
    overlay.classList.remove('show');
    drawer.classList.remove('show');
    setTimeout(() => {
      overlay.remove();
      drawer.remove();
    }, 180);
    onClose?.();
  }

  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', close);
  window.addEventListener('keydown', onKey, true);

  requestAnimationFrame(() => {
    overlay.classList.add('show');
    drawer.classList.add('show');
  });

  const handle = {
    el: drawer,
    body: bodyEl,
    foot: footEl,
    title: titleEl,
    close,
    setTitle(t) {
      titleEl.textContent = t;
    }
  };
  active = handle;
  return handle;
}
