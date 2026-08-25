// hand-rolled slice of node:assert because @types/node can't be installed here.
// Covers only what check*.ts use. Add a method when a check needs it.
declare module 'node:assert' {
  interface Assert {
    (value: unknown, message?: string): void
    ok(value: unknown, message?: string): void
    strictEqual(actual: unknown, expected: unknown, message?: string): void
    deepStrictEqual(actual: unknown, expected: unknown, message?: string): void
    throws(fn: () => unknown, error?: unknown, message?: string): void
    rejects(fn: (() => Promise<unknown>) | Promise<unknown>, error?: unknown, message?: string): Promise<void>
  }
  const assert: Assert
  export default assert
}

declare module 'node:fs' {
  export function readFileSync(path: string | URL, encoding: string): string
}
