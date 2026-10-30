import { h } from './el.js';

export function inlineInput({
  value = '',
  placeholder = '',
  onCommit,
  type = 'text',
  cls = 'input bare',
  width,
  ariaLabel
} = {}) {
  const input = h('input', {
    class: cls,
    type,
    value,
    placeholder,
    'aria-label': ariaLabel || placeholder || '可编辑'
  });
  if (width) input.style.width = width;

  let original = value;

  const commit = () => {
    const next = input.value;
    if (next === original) return;
    original = next;
    onCommit?.(next);
  };

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
      input.blur();
    }
    if (e.key === 'Escape') {
      input.value = original;
      input.blur();
    }
  });

  return input;
}

export function inlineTextArea({ value = '', placeholder = '', onCommit, rows = 2 } = {}) {
  const area = h('textarea', { class: 'textarea', rows, placeholder, value });
  let original = value;
  const commit = () => {
    if (area.value === original) return;
    original = area.value;
    onCommit?.(area.value);
  };
  area.addEventListener('blur', commit);
  area.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      commit();
    }
    if (e.key === 'Escape') {
      area.value = original;
      area.blur();
    }
  });
  return area;
}

export function addRow({ placeholder, onAdd, type = 'text' }) {
  const input = h('input', { class: 'input', type, placeholder });
  const wrap = h('div', { class: 'add-row' }, input);
  const submit = () => {
    const value = input.value.trim();
    if (!value) return;
    input.value = '';
    onAdd(value);
  };
  input.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  });
  wrap.addEventListener('click', (e) => {
    if (e.target !== input) input.focus();
  });
  wrap.focusInput = () => input.focus();
  return wrap;
}
