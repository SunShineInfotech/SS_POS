// Simple localStorage-backed store. Each list page re-reads on mount.
export function loadStore<T>(key: string, initial: T[]): T[] {
  try {
    const raw = localStorage.getItem(`pos:${key}`);
    if (!raw) return initial;
    return JSON.parse(raw) as T[];
  } catch {
    return initial;
  }
}

export function saveStore<T>(key: string, items: T[]) {
  try {
    localStorage.setItem(`pos:${key}`, JSON.stringify(items));
  } catch {
    /* ignore */
  }
}

/** Seeds the store on first use so edit pages can always resolve a record. */
export function initStore<T>(key: string, initial: T[]): T[] {
  try {
    const raw = localStorage.getItem(`pos:${key}`);
    if (raw) return JSON.parse(raw) as T[];
  } catch {
    /* ignore */
  }
  saveStore(key, initial);
  return initial;
}

export function appendStore<T extends { id: number | string }>(key: string, item: T, initial: T[]) {
  const items = loadStore<T>(key, initial);
  const next = [...items, item];
  saveStore(key, next);
  return next;
}

export function updateStore<T extends { id: number | string }>(key: string, id: T["id"], patch: Partial<T>, initial: T[]) {
  const items = loadStore<T>(key, initial);
  const next = items.map((i) => (String(i.id) === String(id) ? { ...i, ...patch } : i));
  saveStore(key, next);
  return next;
}

export function findRecord<T extends { id: number | string }>(key: string, id: string | number): T | undefined {
  return loadStore<T>(key, []).find((r) => String(r.id) === String(id));
}
