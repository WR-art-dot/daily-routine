const stack = [];
const MAX = 20;

export function pushUndo(label, fn) {
  stack.push({ label, fn, at: Date.now() });
  if (stack.length > MAX) stack.shift();
}

export function undoLast() {
  const item = stack.pop();
  if (!item) return null;
  try {
    item.fn();
  } catch (err) {
    console.error('[undo]', err);
  }
  return item.label;
}

export function undoDepth() {
  return stack.length;
}

export function clearUndo() {
  stack.length = 0;
}
