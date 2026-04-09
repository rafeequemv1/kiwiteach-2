const CACHE_PREFIX = 'kiwiteach:qb-mindmap:v1:';
/** When set, client skips mind-map RPCs (404 / not deployed) and uses table queries. Cleared on Refresh. */
export const MINDMAP_RPC_MISSING_FLAG = 'kiwiteach:qb-mindmap:rpc-missing';

export function mindMapRpcMissingGet(): boolean {
  if (!storageAvailable()) return false;
  try {
    return sessionStorage.getItem(MINDMAP_RPC_MISSING_FLAG) === '1';
  } catch {
    return false;
  }
}

export function mindMapRpcMissingSet(): void {
  if (!storageAvailable()) return;
  try {
    sessionStorage.setItem(MINDMAP_RPC_MISSING_FLAG, '1');
  } catch {
    /* ignore */
  }
}

export function mindMapRpcMissingClear(): void {
  if (!storageAvailable()) return;
  try {
    sessionStorage.removeItem(MINDMAP_RPC_MISSING_FLAG);
  } catch {
    /* ignore */
  }
}
/** Default TTL; refresh button clears regardless. */
const DEFAULT_TTL_MS = 1000 * 60 * 45;

function storageAvailable(): boolean {
  return typeof window !== 'undefined' && typeof sessionStorage !== 'undefined';
}

export function mindMapCacheGet<T>(key: string, ttlMs = DEFAULT_TTL_MS): T | null {
  if (!storageAvailable()) return null;
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v: T; t: number };
    if (Date.now() - parsed.t > ttlMs) {
      sessionStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    return parsed.v;
  } catch {
    return null;
  }
}

export function mindMapCacheSet<T>(key: string, value: T): void {
  if (!storageAvailable()) return;
  try {
    sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ v: value, t: Date.now() }));
  } catch {
    /* quota / private mode */
  }
}

export function mindMapCacheClearAll(): void {
  if (!storageAvailable()) return;
  try {
    mindMapRpcMissingClear();
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(CACHE_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}
