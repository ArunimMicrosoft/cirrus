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
const DB_VERSION = 3;
const STORE = "snapshots";
const BASELINE_STORE = "baselines";
const QUOTA_STORE = "quotas";

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
      if (!db.objectStoreNames.contains(BASELINE_STORE)) {
        const store = db.createObjectStore(BASELINE_STORE, { keyPath: "key" });
        store.createIndex("subscriptionId", "subscriptionId", { unique: false });
      }
      if (!db.objectStoreNames.contains(QUOTA_STORE)) {
        const store = db.createObjectStore(QUOTA_STORE, { keyPath: "key" });
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

function tx(mode: IDBTransactionMode, storeName: string = STORE) {
  return openDb().then((db) => {
    const t = db.transaction(storeName, mode);
    return {
      store: t.objectStore(storeName),
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

/* ------------------------------------------------------------------
 * Baselines — daily per-subscription rollup used by the anomaly detector.
 *
 * We keep one entry per (subscription, date) so we can build a rolling
 * window over N days without unbounded growth. Old entries are pruned
 * automatically when new ones are written.
 * ------------------------------------------------------------------*/

export interface BaselineMetrics {
  vmCount: number;
  diskCount: number;
  orphanDisks: number;
  orphanPips: number;
  publicIpCount: number;
  nsgCount: number;
  riskyNsgRules: number;
  storageCount: number;
  publicStorage: number;
  appServiceCount: number;
  appServicesNoHttps: number;
  sqlServerCount: number;
  resourceGroupCount: number;
  untaggedResourceGroups: number;
}

export interface StoredBaseline {
  key: string;
  subscriptionId: string;
  /** Local calendar date (YYYY-MM-DD). One baseline per day. */
  date: string;
  timestamp: string;
  metrics: BaselineMetrics;
}

const BASELINE_RETENTION_DAYS = 60;

function baselineKey(subscriptionId: string, date: string): string {
  return `${subscriptionId}::${date}`;
}

/**
 * Write today's baseline for the given subscription. Idempotent — writing
 * again on the same calendar day just updates the same row. Also prunes
 * baselines older than BASELINE_RETENTION_DAYS.
 */
export async function putBaseline(
  subscriptionId: string,
  metrics: BaselineMetrics,
): Promise<void> {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const { store, done } = await tx("readwrite", BASELINE_STORE);
  const record: StoredBaseline = {
    key: baselineKey(subscriptionId, date),
    subscriptionId,
    date,
    timestamp: now.toISOString(),
    metrics,
  };
  store.put(record);

  // Prune old entries.
  const cutoff = new Date(now.getTime() - BASELINE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const idx = store.index("subscriptionId");
  const req = idx.openCursor(IDBKeyRange.only(subscriptionId));
  req.onsuccess = () => {
    const cursor = req.result;
    if (!cursor) return;
    const rec = cursor.value as StoredBaseline;
    if (rec.date < cutoffStr) cursor.delete();
    cursor.continue();
  };
  await done;
}

/** Load every stored baseline for a subscription, newest first. */
export async function listBaselines(
  subscriptionId: string,
): Promise<StoredBaseline[]> {
  const { store, done } = await tx("readonly", BASELINE_STORE);
  return new Promise<StoredBaseline[]>((resolve, reject) => {
    const idx = store.index("subscriptionId");
    const req = idx.getAll(subscriptionId);
    req.onsuccess = () => {
      const rows = (req.result as StoredBaseline[]).sort((a, b) =>
        a.date < b.date ? 1 : -1,
      );
      done.then(() => resolve(rows)).catch(reject);
    };
    req.onerror = () => reject(req.error);
  });
}

/* ------------------------------------------------------------------
 * Quota usage history — one row per (subscription, date). Feeds the
 * Theil-Sen exhaustion forecast on the Quota Forecast page. Same
 * per-day-idempotent + auto-prune pattern as baselines.
 * ------------------------------------------------------------------*/

export interface QuotaSample {
  /** ARM usage name, e.g. "cores" or "PublicIPAddresses". */
  name: string;
  /** Friendly label. */
  label: string;
  region: string;
  current: number;
  limit: number;
}

export interface StoredQuotaDay {
  key: string;
  subscriptionId: string;
  date: string; // YYYY-MM-DD
  timestamp: string;
  samples: QuotaSample[];
}

const QUOTA_RETENTION_DAYS = 90;

/** Write today's quota snapshot for a subscription (idempotent per day). */
export async function putQuotaSnapshot(
  subscriptionId: string,
  samples: QuotaSample[],
): Promise<void> {
  if (samples.length === 0) return;
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const { store, done } = await tx("readwrite", QUOTA_STORE);
  const record: StoredQuotaDay = {
    key: `${subscriptionId}::${date}`,
    subscriptionId,
    date,
    timestamp: now.toISOString(),
    samples,
  };
  store.put(record);

  const cutoff = new Date(now.getTime() - QUOTA_RETENTION_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const idx = store.index("subscriptionId");
  const req = idx.openCursor(IDBKeyRange.only(subscriptionId));
  req.onsuccess = () => {
    const cursor = req.result;
    if (!cursor) return;
    const rec = cursor.value as StoredQuotaDay;
    if (rec.date < cutoff) cursor.delete();
    cursor.continue();
  };
  await done;
}

/** Load every stored quota day for a subscription, oldest first (for series). */
export async function listQuotaSnapshots(
  subscriptionId: string,
): Promise<StoredQuotaDay[]> {
  const { store, done } = await tx("readonly", QUOTA_STORE);
  return new Promise<StoredQuotaDay[]>((resolve, reject) => {
    const idx = store.index("subscriptionId");
    const req = idx.getAll(subscriptionId);
    req.onsuccess = () => {
      const rows = (req.result as StoredQuotaDay[]).sort((a, b) =>
        a.date < b.date ? -1 : 1,
      );
      done.then(() => resolve(rows)).catch(reject);
    };
    req.onerror = () => reject(req.error);
  });
}
