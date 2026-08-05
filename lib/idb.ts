"use client";

/**
 * Tiny IndexedDB wrapper for browser-local storage of drift snapshots.
 *
 * Drift snapshots are strictly a "just for me on this machine" thing —
 * IndexedDB survives page reloads and browser restarts, isn't shared
 * across origins, and needs no server round trip.
 *
 * We keep the wrapper deliberately small (~80 lines) to avoid pulling in
 * the `idb` npm dependency for such a light use case.
 */

const DB_NAME = "aiu-drift";
const DB_VERSION = 1;
const STORE = "snapshots";

function isBrowser(): boolean {
  return typeof indexedDB !== "undefined" && typeof window !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  if (!isBrowser()) {
    return Promise.reject(new Error("IndexedDB is not available"));
  }
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "key" });
        store.createIndex("subscriptionId", "subscriptionId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function keyFor(subscriptionId: string, name: string): string {
  return `${subscriptionId}::${name}`;
}

export interface StoredSnapshot {
  key: string;
  subscriptionId: string;
  name: string;
  createdAt: string;
  summary: Record<string, number>;
  payload: unknown;
}

function tx(mode: IDBTransactionMode) {
  return openDb().then((db) => {
    const t = db.transaction(STORE, mode);
    return {
      store: t.objectStore(STORE),
      done: new Promise<void>((res, rej) => {
        t.oncomplete = () => res();
        t.onerror = () => rej(t.error);
        t.onabort = () => rej(t.error);
      }),
    };
  });
}

/** Save (or replace) a snapshot for the given subscription. */
export async function putSnapshot(snap: Omit<StoredSnapshot, "key">): Promise<void> {
  const { store, done } = await tx("readwrite");
  const record: StoredSnapshot = { ...snap, key: keyFor(snap.subscriptionId, snap.name) };
  store.put(record);
  await done;
}

/** List snapshots for a given subscription, newest first. */
export async function listSnapshots(
  subscriptionId: string,
): Promise<StoredSnapshot[]> {
  const { store, done } = await tx("readonly");
  return new Promise<StoredSnapshot[]>((resolve, reject) => {
    const idx = store.index("subscriptionId");
    const req = idx.getAll(subscriptionId);
    req.onsuccess = () => {
      const rows = (req.result as StoredSnapshot[]).sort((a, b) =>
        a.createdAt < b.createdAt ? 1 : -1,
      );
      done.then(() => resolve(rows)).catch(reject);
    };
    req.onerror = () => reject(req.error);
  });
}

/** Fetch a single snapshot by name. */
export async function getSnapshot(
  subscriptionId: string,
  name: string,
): Promise<StoredSnapshot | null> {
  const { store, done } = await tx("readonly");
  return new Promise((resolve, reject) => {
    const req = store.get(keyFor(subscriptionId, name));
    req.onsuccess = () => {
      done
        .then(() => resolve((req.result as StoredSnapshot) ?? null))
        .catch(reject);
    };
    req.onerror = () => reject(req.error);
  });
}

/** Delete a snapshot by name. */
export async function deleteSnapshot(
  subscriptionId: string,
  name: string,
): Promise<void> {
  const { store, done } = await tx("readwrite");
  store.delete(keyFor(subscriptionId, name));
  await done;
}
