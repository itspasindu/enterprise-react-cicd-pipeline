/**
 * Tiny TTL cache to reduce GitHub secondary rate-limit pressure.
 */
export function createTtlCache(defaultTtlMs = 30_000) {
  const store = new Map()

  return {
    get(key) {
      const entry = store.get(key)
      if (!entry) return undefined
      if (Date.now() > entry.expiresAt) {
        store.delete(key)
        return undefined
      }
      return entry.value
    },
    set(key, value, ttlMs = defaultTtlMs) {
      store.set(key, { value, expiresAt: Date.now() + ttlMs })
      return value
    },
    clear() {
      store.clear()
    },
  }
}
