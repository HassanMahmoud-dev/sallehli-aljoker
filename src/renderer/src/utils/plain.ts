import { toRaw } from 'vue'

/**
 * Returns a plain, JSON-safe deep copy of a (possibly reactive) value so it can be
 * sent through Electron IPC. Vue reactive proxies cannot be cloned by IPC.
 */
export function plain<T>(value: T): T {
  const raw = toRaw(value)
  if (raw === undefined || raw === null || typeof raw !== 'object') return raw
  return JSON.parse(JSON.stringify(raw)) as T
}
