import { DB_NAME, DB_VERSION, STORES, STORE_NAMES } from './schema.js';

let dbPromise = null;
let chain = Promise.resolve();

export function uid() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function queue(fn) {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORE_NAMES) {
        const def = STORES[name];
        if (db.objectStoreNames.contains(name)) continue;
        const store = db.createObjectStore(name, { keyPath: def.keyPath });
        for (const [idxName, path] of Object.entries(def.indexes || {})) {
          store.createIndex(idxName, path, { unique: false });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('数据库被其它标签页占用，请关掉其它窗口后重试'));
  });
  return dbPromise;
}

function runTx(storeNames, mode, fn) {
  return queue(
    () =>
      new Promise((resolve, reject) => {
        open().then((db) => {
          let t;
          try {
            t = db.transaction(storeNames, mode);
          } catch (err) {
            reject(err);
            return;
          }
          let out;
          try {
            out = fn(t);
          } catch (err) {
            try {
              t.abort();
            } catch {
              /* 事务可能已结束 */
            }
            reject(err);
            return;
          }
          t.oncomplete = () => resolve(out);
          t.onerror = () => reject(t.error);
          t.onabort = () => reject(t.error || new Error('事务被中止'));
        }, reject);
      })
  );
}

function normalize(store, rec, prev) {
  const now = Date.now();
  const out = { ...rec };
  if (store === 'settings') {
    out.key = out.key || 'app';
    return out;
  }
  if (!out.id) out.id = prev?.id || uid();
  if (!out.createdAt) out.createdAt = prev?.createdAt || now;
  out.updatedAt = now;
  return out;
}

export async function getOne(store, key) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readonly');
    const req = t.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function all(store) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readonly');
    const req = t.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function byIndex(store, index, value, opts = {}) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readonly');
    const req = t.objectStore(store).index(index).getAll(value, opts.limit);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function count(store) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readonly');
    const req = t.objectStore(store).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function countByIndex(store, index, value) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readonly');
    const req = t.objectStore(store).index(index).count(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function put(store, rec) {
  return runTx(store, 'readwrite', (t) => {
    const record = normalize(store, rec);
    t.objectStore(store).put(record);
    return record;
  });
}

export function putMany(store, recs) {
  return runTx(store, 'readwrite', (t) => {
    const os = t.objectStore(store);
    const out = [];
    for (const rec of recs) {
      const record = normalize(store, rec);
      os.put(record);
      out.push(record);
    }
    return out;
  });
}

export function del(store, key) {
  return runTx(store, 'readwrite', (t) => {
    t.objectStore(store).delete(key);
    return true;
  });
}

export function delMany(store, keys) {
  return runTx(store, 'readwrite', (t) => {
    const os = t.objectStore(store);
    for (const k of keys) os.delete(k);
    return true;
  });
}

export function clearStore(store) {
  return runTx(store, 'readwrite', (t) => {
    t.objectStore(store).clear();
    return true;
  });
}

export function clearAll() {
  return runTx(STORE_NAMES, 'readwrite', (t) => {
    for (const name of STORE_NAMES) t.objectStore(name).clear();
    return true;
  });
}

export { STORE_NAMES };
