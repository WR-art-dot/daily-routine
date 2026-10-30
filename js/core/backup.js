import { all, putMany, clearStore, getOne, put, STORE_NAMES } from './db.js';
import { STORES } from './schema.js';
import { todayStr } from './dates.js';

export const APP_ID = 'lifeapp';
export const SCHEMA_VERSION = 1;

export function buildPayload(data) {
  return {
    app: APP_ID,
    schema: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data
  };
}

export function validatePayload(payload, storeNames = STORE_NAMES) {
  const fail = (reason) => ({ ok: false, reason });
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return fail('文件内容不是有效的 JSON 对象');
  }
  if (payload.app !== APP_ID) return fail('不是本应用导出的文件（缺少 app 标识）');
  if (payload.schema !== SCHEMA_VERSION) {
    return fail(`数据版本不匹配：文件为 ${payload.schema ?? '空'}，当前为 ${SCHEMA_VERSION}`);
  }
  if (payload.exportedAt && Number.isNaN(Date.parse(payload.exportedAt))) {
    return fail('exportedAt 不是合法时间');
  }
  if (!payload.data || typeof payload.data !== 'object' || Array.isArray(payload.data)) {
    return fail('缺少 data 字段');
  }
  const unknown = Object.keys(payload.data).filter((k) => !storeNames.includes(k));
  if (unknown.length) return fail(`包含未知数据表：${unknown.join('、')}`);
  for (const [store, rows] of Object.entries(payload.data)) {
    if (!Array.isArray(rows)) return fail(`数据表 ${store} 不是数组`);
    const keyPath = STORES[store].keyPath;
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        return fail(`数据表 ${store} 里有非对象记录`);
      }
      if (!row[keyPath]) return fail(`数据表 ${store} 有一条记录缺少 ${keyPath}`);
    }
  }
  return { ok: true };
}

export function mergeRecords(existing, incoming, keyPath = 'id') {
  const map = new Map();
  for (const row of existing) map.set(row[keyPath], row);
  let added = 0;
  let updated = 0;
  let skipped = 0;
  for (const row of incoming) {
    const prev = map.get(row[keyPath]);
    if (!prev) {
      map.set(row[keyPath], row);
      added += 1;
      continue;
    }
    const prevAt = prev.updatedAt || 0;
    const nextAt = row.updatedAt || 0;
    if (nextAt > prevAt) {
      map.set(row[keyPath], row);
      updated += 1;
    } else {
      skipped += 1;
    }
  }
  return { rows: [...map.values()], added, updated, skipped };
}

export async function exportAll() {
  const data = {};
  for (const store of STORE_NAMES) {
    data[store] = await all(store);
  }
  await put('settings', { key: 'lastExportAt', at: Date.now() });
  return buildPayload(data);
}

export function exportFileName(date = new Date()) {
  return `lifeapp-${todayStr(date)}.json`;
}

export function downloadPayload(payload, filename = exportFileName()) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return filename;
}

export async function importAll(payload, mode = 'merge') {
  const check = validatePayload(payload);
  if (!check.ok) throw new Error(check.reason);

  const stats = { mode, stores: {}, added: 0, updated: 0, skipped: 0 };

  if (mode === 'replace') {
    for (const store of STORE_NAMES) {
      const rows = payload.data[store] || [];
      await clearStore(store);
      if (rows.length) await putMany(store, rows);
      stats.stores[store] = { written: rows.length };
      stats.added += rows.length;
    }
    return stats;
  }

  for (const store of STORE_NAMES) {
    const incoming = payload.data[store] || [];
    if (!incoming.length) continue;
    const keyPath = STORES[store].keyPath;
    const existing = await all(store);
    const merged = mergeRecords(existing, incoming, keyPath);
    await putMany(store, merged.rows);
    stats.stores[store] = { added: merged.added, updated: merged.updated, skipped: merged.skipped };
    stats.added += merged.added;
    stats.updated += merged.updated;
    stats.skipped += merged.skipped;
  }
  return stats;
}

export async function readLastExportAt() {
  const rec = await getOne('settings', 'lastExportAt');
  return rec?.at || 0;
}
