/** Minimal promise wrapper over IndexedDB (one database, a few key-value stores). */
const STORES = ['pieces', 'pdfs', 'playlists'] as const;
export type Store = (typeof STORES)[number];

let dbName = 'metronome';
let dbp: Promise<IDBDatabase> | undefined;

/** Each account gets its own database, so people sharing a browser never see each other's library. */
export function useDatabase(name: string) {
  if (name === dbName) return;
  void dbp?.then((d) => d.close());
  dbName = name;
  dbp = undefined;
}

const db = () =>
  (dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open(dbName, 1);
    r.onupgradeneeded = () => STORES.forEach((s) => r.result.createObjectStore(s));
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));

async function run<T>(store: Store, mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const s = (await db()).transaction(store, mode).objectStore(store);
  return new Promise((res, rej) => {
    const r = f(s);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export const get = <T>(store: Store, key: string) => run<T | undefined>(store, 'readonly', (s) => s.get(key));
export const put = (store: Store, key: string, value: unknown) => run(store, 'readwrite', (s) => s.put(value, key));
export const del = (store: Store, key: string) => run(store, 'readwrite', (s) => s.delete(key));
export const all = <T>(store: Store) => run<T[]>(store, 'readonly', (s) => s.getAll());
