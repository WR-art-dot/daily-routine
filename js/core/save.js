let pending = 0;
let dot = null;
let resetTimer = null;
const subs = new Set();

const TITLES = {
  idle: '已保存',
  saving: '正在保存',
  saved: '已保存',
  error: '保存失败，点开查看'
};

function emit(state) {
  if (dot) {
    dot.dataset.state = state;
    dot.title = TITLES[state] || '';
  }
  subs.forEach((fn) => fn(state));
}

export function initSaveDot(el) {
  dot = el;
  emit('idle');
}

export function onSaveState(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

export function pendingCount() {
  return pending;
}

export async function track(promise) {
  pending += 1;
  if (resetTimer) {
    clearTimeout(resetTimer);
    resetTimer = null;
  }
  emit('saving');
  try {
    const result = await promise;
    pending -= 1;
    if (pending === 0) {
      emit('saved');
      resetTimer = setTimeout(() => {
        if (pending === 0) emit('idle');
      }, 1000);
    }
    return result;
  } catch (err) {
    pending -= 1;
    emit('error');
    console.error('[save]', err);
    throw err;
  }
}

export function autosave(fn, ms = 400) {
  let timer = null;
  const fire = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    return track(Promise.resolve().then(fn));
  };
  const debounced = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(fire, ms);
  };
  debounced.flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
      return track(Promise.resolve().then(fn));
    }
    return Promise.resolve();
  };
  debounced.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  return debounced;
}
