const SVG_NS = 'http://www.w3.org/2000/svg';

function applyProps(el, props) {
  if (!props) return;
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    switch (key) {
      case 'class':
      case 'className':
        el.className = value;
        break;
      case 'text':
        el.textContent = value;
        break;
      case 'style':
        if (typeof value === 'string') el.style.cssText = value;
        else Object.assign(el.style, value);
        break;
      case 'dataset':
        Object.assign(el.dataset, value);
        break;
      case 'value':
        el.value = value;
        break;
      case 'checked':
        el.checked = !!value;
        break;
      case 'disabled':
        el.disabled = !!value;
        break;
      case 'html':
        el.innerHTML = value;
        break;
      default:
        if (key.startsWith('on') && typeof value === 'function') {
          el.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (value === true) {
          el.setAttribute(key, '');
        } else {
          el.setAttribute(key, value);
        }
    }
  }
}

function appendKids(el, kids) {
  for (const kid of kids.flat(6)) {
    if (kid === null || kid === undefined || kid === false || kid === true) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
}

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  applyProps(el, props);
  appendKids(el, kids);
  return el;
}

export function svg(tag, props, ...kids) {
  const el = document.createElementNS(SVG_NS, tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined || value === false) continue;
      el.setAttribute(key, value);
    }
  }
  appendKids(el, kids);
  return el;
}

export function icon(name, cls = 'ico') {
  return svg('svg', { class: cls, 'aria-hidden': 'true' }, svg('use', { href: `#i-${name}` }));
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

export function mount(parent, ...kids) {
  clear(parent);
  appendKids(parent, kids);
  return parent;
}

export function frag(...kids) {
  const f = document.createDocumentFragment();
  appendKids(f, kids);
  return f;
}

export function on(target, type, fn, opts) {
  target.addEventListener(type, fn, opts);
  return () => target.removeEventListener(type, fn, opts);
}

export function isTyping(target) {
  if (!target || !(target instanceof Element)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}
