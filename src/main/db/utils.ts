export function parseJsonArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((x) => typeof x === 'string')
  if (typeof raw === 'string' && raw.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return parsed.filter((x) => typeof x === 'string')
      }
    } catch {
      return []
    }
  }
  return []
}

export function parseJsonObject(raw: unknown): Record<string, any> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, any>
  }
  if (typeof raw === 'string' && raw.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, any>
      }
    } catch {
      return {}
    }
  }
  return {}
}

export function stringifyExtraData(raw: unknown): string {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return '{}'
  try {
    return JSON.stringify(raw)
  } catch {
    return '{}'
  }
}

export function roundMoney(val: unknown): number {
  const n = Number(val || 0)
  if (!Number.isFinite(n)) return 0
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function getLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getLocalDateTimeString(d: Date = new Date()): string {
  const datePart = getLocalDateString(d)
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  const seconds = String(d.getSeconds()).padStart(2, '0')
  return `${datePart} ${hours}:${minutes}:${seconds}`
}

export function generateNextNumber(
  db: { prepare: (sql: string) => { get: (...args: any[]) => any } },
  tableName: string,
  columnName: string,
  prefix: string,
  padLength = 4
): string {
  const maxRow = db
    .prepare(`SELECT COALESCE(MAX(id), 0) as maxId FROM ${tableName}`)
    .get() as { maxId: number } | undefined
  let nextSeq = (maxRow?.maxId || 0) + 1

  const checkStmt = db.prepare(`SELECT 1 FROM ${tableName} WHERE ${columnName} = ? LIMIT 1`)
  let candidate = `${prefix}${String(nextSeq).padStart(padLength, '0')}`
  while (checkStmt.get(candidate)) {
    nextSeq++
    candidate = `${prefix}${String(nextSeq).padStart(padLength, '0')}`
  }
  return candidate
}


