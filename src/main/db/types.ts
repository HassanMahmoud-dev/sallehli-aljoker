export interface StatementLike {
  run: (...params: unknown[]) => { changes: number | bigint; lastInsertRowid: number | bigint }
  get: (...params: unknown[]) => unknown
  all: (...params: unknown[]) => unknown[]
}

export interface DatabaseLike {
  exec: (sql: string) => void
  prepare: (sql: string) => StatementLike
  close: () => void
}

