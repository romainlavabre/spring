// Tables with typed columns: Markdown, numbers, dates, colored badges, code
// and checkmarks. A click on a column title sorts the rows.
import clsx from 'clsx'
import { ArrowDown, ArrowUp, Check, Minus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { DATE_PATTERN, type TableBlock } from '@core/blocks/schema'
import { formatDate } from '@core/blocks/dates'
import { Markdown } from '../Markdown'

type Column = TableBlock['columns'][number]

const TRUE_VALUES = new Set(['yes', 'y', 'true', 'x', '1', 'oui', 'ok', '✓', '✔'])

export function isChecked(value: string): boolean {
  return TRUE_VALUES.has(value.trim().toLowerCase())
}

function numberOf(value: string): number {
  const n = Number(value.replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}

function compare(column: Column, a: string, b: string): number {
  if (column.type === 'number') {
    const x = numberOf(a)
    const y = numberOf(b)
    if (Number.isNaN(x) || Number.isNaN(y)) return Number.isNaN(x) ? (Number.isNaN(y) ? 0 : 1) : -1
    return x - y
  }
  if (column.type === 'check') return Number(isChecked(a)) - Number(isChecked(b))
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

/** A stable color for a badge without one: the same value always gets the same color. */
const AUTO_COLORS = ['blue', 'violet', 'teal', 'amber', 'pink', 'green', 'orange']
function autoColor(value: string): string {
  let hash = 0
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return AUTO_COLORS[Math.abs(hash) % AUTO_COLORS.length]
}

export function Cell({ column, value }: { column: Column; value: string | undefined }) {
  const text = value ?? ''
  if (!text.trim() && column.type !== 'check') return <span className="doc-cell-empty">—</span>
  switch (column.type) {
    case 'md':
      return <Markdown inline>{text}</Markdown>
    case 'number': {
      const n = numberOf(text)
      return <span className="doc-cell-number">{Number.isNaN(n) ? text : n.toLocaleString('en-US', { maximumFractionDigits: 6 }).replace(/,/g, ' ')}</span>
    }
    case 'date':
      return <span className="doc-cell-date">{DATE_PATTERN.test(text.trim()) ? formatDate(text.trim()) : text}</span>
    case 'badge':
      return (
        <span className="doc-badge" data-color={column.colors?.[text] ?? autoColor(text)}>
          {text}
        </span>
      )
    case 'code':
      return <code className="doc-cell-code">{text}</code>
    case 'check':
      return isChecked(text) ? (
        <Check className="doc-cell-check size-4" aria-label="Yes" />
      ) : (
        <Minus className="doc-cell-uncheck size-4" aria-label="No" />
      )
    default:
      return <>{text}</>
  }
}

export function TableView({ block }: { block: TableBlock }) {
  const [sort, setSort] = useState<{ column: string; desc: boolean } | null>(null)
  const rows = useMemo(() => {
    if (!sort) return block.rows
    const column = block.columns.find((c) => c.id === sort.column)
    if (!column) return block.rows
    const sorted = [...block.rows].sort((a, b) => compare(column, a[column.id] ?? '', b[column.id] ?? ''))
    return sort.desc ? sorted.reverse() : sorted
  }, [block.rows, block.columns, sort])

  const toggleSort = (column: string): void =>
    setSort((current) => (current?.column !== column ? { column, desc: false } : current.desc ? null : { column, desc: true }))

  return (
    <figure className="doc-table-figure">
      <div className="doc-table-wrap">
        <table className={clsx('doc-table', block.striped && 'is-striped', block.compact && 'is-compact')}>
          <thead>
            {block.headerGroups && (
              <tr className="doc-table-groups">
                {block.headerGroups.map((group, i) => (
                  <th key={i} colSpan={group.span}>
                    {group.title}
                  </th>
                ))}
              </tr>
            )}
            <tr>
              {block.columns.map((column) => (
                <th
                  key={column.id}
                  style={{ width: column.width, textAlign: column.align ?? (column.type === 'number' ? 'right' : column.type === 'check' ? 'center' : 'left') }}
                  aria-sort={sort?.column === column.id ? (sort.desc ? 'descending' : 'ascending') : undefined}
                >
                  <button type="button" className="doc-th-button" onClick={() => toggleSort(column.id)}>
                    {column.title}
                    {sort?.column === column.id && (sort.desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={block.columns.length} className="doc-table-empty">
                  No rows
                </td>
              </tr>
            ) : (
              rows.map((row, r) => (
                <tr key={r}>
                  {block.columns.map((column) => (
                    <td
                      key={column.id}
                      style={{ textAlign: column.align ?? (column.type === 'number' ? 'right' : column.type === 'check' ? 'center' : 'left') }}
                    >
                      <Cell column={column} value={row[column.id]} />
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {block.caption && <figcaption>{block.caption}</figcaption>}
    </figure>
  )
}
