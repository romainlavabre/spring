// Timeline dates: YYYY, YYYY-MM or YYYY-MM-DD, as day numbers (UTC days since
// the epoch) so they can be compared and laid out on a scale.

const DAY = 86_400_000

/** First day of the period a date designates: 2026-03 → 1 March 2026. */
export function startDay(date: string): number {
  const [y, m = 1, d = 1] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / DAY
}

/** Last day of the period a date designates: 2026-03 → 31 March 2026. */
export function endDay(date: string): number {
  const parts = date.split('-').map(Number)
  if (parts.length === 3) return startDay(date)
  if (parts.length === 2) return Date.UTC(parts[0], parts[1], 1) / DAY - 1
  return Date.UTC(parts[0] + 1, 0, 1) / DAY - 1
}

export function dayToDate(day: number): Date {
  return new Date(day * DAY)
}

export function today(): number {
  return Math.floor(Date.now() / DAY)
}

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026", "Mar 2026" or "12 Mar 2026", after the precision of the date. */
export function formatDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  if (d) return `${d} ${MONTHS[m - 1]} ${y}`
  if (m) return `${MONTHS[m - 1]} ${y}`
  return String(y)
}

/** "Mar – Jun 2026", "12 – 18 Mar 2026"… */
export function formatRange(start: string, end?: string): string {
  if (!end || end === start) return formatDate(start)
  const a = formatDate(start)
  const b = formatDate(end)
  const [ya] = start.split('-')
  const [yb] = end.split('-')
  if (ya === yb && start.length === end.length && start.length > 4) {
    return `${a.replace(` ${ya}`, '')} – ${b}`
  }
  return `${a} – ${b}`
}
