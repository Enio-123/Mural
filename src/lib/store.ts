import { useSyncExternalStore } from 'react';
import { createStore, get, set, del, keys } from 'idb-keyval';

const PREFIX = 'mural:';

export function lsGet<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(PREFIX + key);
    return v == null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

export function lsSet(key: string, value: unknown): void {
  try {
    if (value === undefined) localStorage.removeItem(PREFIX + key);
    else localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* sem armazenamento: segue só na memória */
  }
}

let db: ReturnType<typeof createStore> | null = null;
function store() {
  if (!db) db = createStore('mural', 'dados');
  return db;
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  try {
    return await get<T>(key, store());
  } catch {
    return undefined;
  }
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  try {
    await set(key, value, store());
  } catch {
    /* sem IndexedDB */
  }
}

export async function idbDel(key: string): Promise<void> {
  try {
    await del(key, store());
  } catch {
    /* nada */
  }
}

export async function idbKeys(): Promise<string[]> {
  try {
    return (await keys(store())).map(String);
  } catch {
    return [];
  }
}

/** Estado guardado no aparelho que avisa a tela quando muda. */
export interface Persisted<T> {
  get(): T;
  set(next: T | ((prev: T) => T)): void;
  use(): T;
  subscribe(fn: () => void): () => void;
}

export function persisted<T>(key: string, initial: T): Persisted<T> {
  let value = lsGet<T>(key, initial);
  const subs = new Set<() => void>();
  const api: Persisted<T> = {
    get: () => value,
    set(next) {
      value = typeof next === 'function' ? (next as (p: T) => T)(value) : next;
      lsSet(key, value);
      subs.forEach((f) => f());
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    use() {
      return useSyncExternalStore(api.subscribe, api.get, api.get);
    },
  };
  return api;
}

/** Guarda respostas por um tempo; se a rede falhar, devolve a última que deu certo. */
export async function cached<T>(
  key: string,
  maxAgeMs: number,
  load: () => Promise<T>,
  opts: { force?: boolean } = {},
): Promise<{ data: T; at: number; fromCache: boolean }> {
  const hit = await idbGet<{ at: number; data: T }>('cache:' + key);
  if (hit && !opts.force && Date.now() - hit.at < maxAgeMs) return { data: hit.data, at: hit.at, fromCache: true };
  try {
    const data = await load();
    const at = Date.now();
    void idbSet('cache:' + key, { at, data });
    return { data, at, fromCache: false };
  } catch (e) {
    if (hit) return { data: hit.data, at: hit.at, fromCache: true };
    throw e;
  }
}

export async function peekCache<T>(key: string): Promise<{ at: number; data: T } | undefined> {
  return idbGet<{ at: number; data: T }>('cache:' + key);
}
