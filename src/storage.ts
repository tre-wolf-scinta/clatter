/** localStorage with every call guarded: private windows and blocked storage must not break the app. */

export function loadString(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function saveString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage unavailable: the app still works for this session.
  }
}

export function loadJSON<T extends object>(key: string, fallback: T): T {
  const raw = loadString(key)
  if (raw === null) return fallback
  try {
    return { ...fallback, ...(JSON.parse(raw) as Partial<T>) }
  } catch {
    return fallback
  }
}

export function saveJSON(key: string, value: unknown): void {
  saveString(key, JSON.stringify(value))
}
