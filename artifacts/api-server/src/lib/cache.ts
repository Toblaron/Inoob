/**
 * Simple in-memory TTL cache with automatic expiry cleanup.
 * Generic — create one instance per data type with the desired TTL.
 */

interface CacheEntry<T> {
  data: T;
  expiry: number;
}

export class TTLCache<T> {
  private readonly store = new Map<string, CacheEntry<T>>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly ttlMs: number,
    /** How often to sweep for expired entries (defaults to 5 min) */
    cleanupIntervalMs = 5 * 60 * 1000
  ) {
    // Periodic cleanup to prevent unbounded memory growth
    this.cleanupTimer = setInterval(() => this.cleanup(), cleanupIntervalMs);
    // Don't keep the process alive just for this timer
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  get(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
      this.store.delete(key);
      return null;
    }
    return entry.data;
  }

  set(key: string, data: T): void {
    this.store.set(key, { data, expiry: Date.now() + this.ttlMs });
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiry) this.store.delete(key);
    }
  }

  destroy(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.store.clear();
  }
}

/**
 * Create a cache key by hashing an object's JSON representation.
 * Fast, non-cryptographic — suitable for cache keys only.
 */
export function cacheKey(obj: Record<string, unknown>): string {
  const str = JSON.stringify(obj, Object.keys(obj).sort());
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash = hash >>> 0; // Convert to unsigned 32-bit
  }
  return hash.toString(36);
}

/**
 * Extract a stable video ID from a YouTube URL for use as a cache key.
 */
export function extractVideoId(url: string): string | null {
  const match = url.match(/(?:v=|youtu\.be\/|\/embed\/|\/shorts\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}
