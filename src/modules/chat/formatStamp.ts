/** Literal mm/dd/yyyy hh:mm: `toLocaleString` won't give that shape across locales. */
export function formatStamp(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  )
}
