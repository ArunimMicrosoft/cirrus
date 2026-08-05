/**
 * Type-safe accessor for the Cloudflare Workers `caches.default` singleton.
 *
 * `caches.default` is a Cloudflare extension not present in the standard DOM
 * `CacheStorage` interface, so we can't reach it via the built-in `caches`
 * global's type. This helper narrows the runtime value and returns `undefined`
 * on any environment where the extension is not available (dev servers,
 * tests, etc.).
 */

interface WorkersCache {
  match(request: Request | string): Promise<Response | undefined>;
  put(request: Request | string, response: Response): Promise<void>;
  delete(request: Request | string): Promise<boolean>;
}

interface WorkersCacheStorage {
  default: WorkersCache;
}

/** Return the Workers `caches.default` cache, or `undefined` if unavailable. */
export function getDefaultCache(): WorkersCache | undefined {
  if (typeof caches === "undefined") return undefined;
  const anyCaches = caches as unknown as Partial<WorkersCacheStorage>;
  return anyCaches.default;
}

export type { WorkersCache };
