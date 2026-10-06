// Edits a table as a grid: column titles and types on top, one input per cell.
// Rows can be pasted from a spreadsheet (tab separated) or a CSV.
import { ArrowLeft, ArrowRight, ClipboardPaste, Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { TABLE_COLUMN_TYPES, type TableBlock } from '@core/blocks/schema'
import { slugify } from '@core/slug'
import { Button, cn, fieldClass } from '../../components/ui'
import { ColorField, Label, ListEditor, Row, SelectField, SmallButton, TextField, Toggle } from './fields'

type Column = TableBlock['columns'][number]

function columnId(title: string, taken: string[]): string {
  const base = slugify(title).replace(/-/g, '_').slice(0, 30) || 'col'
  let id = base
  for (let n = 2; taken.includes(id); n++) id = `${base}_${n}`
  return id
}

/** Splits pasted text into rows of cells: tabs from a spreadsheet, else commas or semicolons. */
export function parseDelimited(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter((line) => line.trim())
  if (lines.length === 0) return []
  const separator = lines[0].includes('\t') ? '\t' : lines[0].split(';').length > lines[0].split(',').length ? ';' : ','
  return lines.map((line) => {
    if (separator === '\t') return line.split('\t').map((cell) => cell.trim())
    const cells: string[] = []
    let cell = ''
    let quoted = false
    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"' && quoted && line[i + 1] === '"') {
        cell += '"'
        i++
      } else if (char === '"') quoted = !quoted
      else if (char === separator && !quoted) {
        cells.push(cell.trim())
        cell = ''
      } else cell += char
    }
    cells.push(cell.trim())
    return cells
  })
}

/** A table from pasted rows, the first one being the titles. */
export function tableFromRows(block: TableBlock, rows: string[][]): TableBlock {
  const [header, ...body] = rows
  const columns: Column[] = []
  for (const title of header) columns.push({ id: columnId(title, columns.map((c) => c.id)), title, type: 'text' })
  // Columns made of numbers only are numbers.
  for (const [i, column] of columns.entries()) {
    const values = body.map((row) => row[i] ?? '').filter(Boolean)
    if (values.length && values.every((v) => /^-?[\d\s.,]+$/.test(v))) column.type = 'number'
  }
  return {
    ...block,
    columns,
    headerGroups: undefined,
    rows: body.map((row) => Object.fromEntries(columns.map((column, i) => [column.id, row[i] ?? ''])))
  }
}

export function TableEditor({ block, onChange }: { block: TableBlock; onChange: (block: TableBlock) => void }) {
  const [pasting, setPasting] = useState(false)
  const [pasted, setPasted] = useState('')

  const setColumn = (index: number, column: Column): void => onChange({ ...block, columns: block.columns.map((c, i) => (i === index ? column : c)) })
  const addColumn = (): void => {
    const id = columnId(`Column ${block.columns.length + 1}`, block.columns.map((c) => c.id))
    onChange({ ...block, columns: [...block.columns, { id, title: `Column ${block.columns.length + 1}`, type: 'text' }], headerGroups: undefined })
  }
  const removeColumn = (index: number): void => {
    const id = block.columns[index].id
    onChange({
      ...block,
      columns: block.columns.filter((_, i) => i !== index),
      rows: block.rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== id))),
      headerGroups: undefined
    })
  }
  const moveColumn = (from: number, to: number): void => {
    const columns = [...block.columns]
    const [column] = columns.splice(from, 1)
    columns.splice(to, 0, column)
    onChange({ ...block, columns })
  }
  const setCell = (row: number, column: string, value: string): void =>
    onChange({ ...block, rows: block.rows.map((r, i) => (i === row ? { ...r, [column]: value } : r)) })
  const addRow = (): void => onChange({ ...block, rows: [...block.rows, Object.fromEntries(block.columns.map((c) => [c.id, '']))] })
  const removeRow = (index: number): void => onChange({ ...block, rows: block.rows.filter((_, i) => i !== index) })

  const badgeValues = (column: Column): string[] => [...new Set(block.rows.map((row) => row[column.id]).filter(Boolean))]

  return (
    <div className="flex flex-col gap-3">
      <Row>
        <TextField label="Caption" value={block.caption ?? ''} onChange={(caption) => onChange({ ...block, caption: caption || undefined })} />
        <Toggle label="Striped" checked={!!block.striped} onChange={(striped) => onChange({ ...block, striped: striped || undefined })} />
        <Toggle label="Compact" checked={!!block.compact} onChange={(compact) => onChange({ ...block, compact: compact || undefined })} />
        <Button size="sm" icon={<ClipboardPaste className="size-3.5" />} onClick={() => setPasting(!pasting)} className="mb-0.5">
          Paste from a spreadsheet
        </Button>
      </Row>

      {pasting && (
        <div className="flex flex-col gap-2 rounded-lg border border-accent/40 bg-accent/5 p-3">
          <p className="text-xs text-muted">Copy cells from a spreadsheet (or paste a CSV), titles on the first line. This replaces the table.</p>
          <textarea
            className={cn(fieldClass, 'h-28 py-1.5 font-mono text-xs')}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder={'Name\tURL\tOwner\nGrafana\thttps://grafana…\tOps'}
            aria-label="Pasted rows"
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setPasting(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={parseDelimited(pasted).length === 0}
              onClick={() => {
                onChange(tableFromRows(block, parseDelimited(pasted)))
                setPasting(false)
                setPasted('')
              }}
            >
              Replace the table
            </Button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-panel-2 align-top">
              {block.columns.map((column, i) => (
                <th key={column.id} className="min-w-44 border-b border-r border-border p-2 text-left font-normal last:border-r-0">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-1">
                      <input
                        className={cn(fieldClass, 'h-7 flex-1 font-semibold')}
                        value={column.title}
                        aria-label={`Title of column ${i + 1}`}
                        onChange={(e) => setColumn(i, { ...column, title: e.target.value })}
                      />
                      <SmallButton label="Move column left" disabled={i === 0} onClick={() => moveColumn(i, i - 1)}>
                        <ArrowLeft className="size-3" />
                      </SmallButton>
                      <SmallButton label="Move column right" disabled={i === block.columns.length - 1} onClick={() => moveColumn(i, i + 1)}>
                        <ArrowRight className="size-3" />
                      </SmallButton>
                      <SmallButton label="Remove column" disabled={block.columns.length === 1} onClick={() => removeColumn(i)} danger>
                        <X className="size-3" />
                      </SmallButton>
                    </div>
                    <div className="flex gap-1">
                      <select
                        className={cn(fieldClass, 'h-7 flex-1 text-xs')}
                        value={column.type}
                        aria-label={`Type of column ${i + 1}`}
                        onChange={(e) => setColumn(i, { ...column, type: e.target.value as Column['type'] })}
                      >
                        {TABLE_COLUMN_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                      <select
                        className={cn(fieldClass, 'h-7 w-20 text-xs')}
                        value={column.align ?? ''}
                        aria-label={`Alignment of column ${i + 1}`}
                        onChange={(e) => setColumn(i, { ...column, align: (e.target.value || undefined) as Column['align'] })}
                      >
                        <option value="">auto</option>
                        <option value="left">left</option>
                        <option value="center">center</option>
                        <option value="right">right</option>
                      </select>
                    </div>
                    {column.type === 'badge' && badgeValues(column).length > 0 && (
                      <details>
                        <summary className="cursor-pointer text-[11px] text-muted">Badge colors</summary>
                        <div className="mt-1 flex flex-col gap-1">
                          {badgeValues(column).map((value) => (
                            <ColorField
                              key={value}
                              label={value}
                              value={column.colors?.[value]}
                              onChange={(color) => {
                                const colors = { ...column.colors }
                                if (color) colors[value] = color
                                else delete colors[value]
                                setColumn(i, { ...column, colors: Object.keys(colors).length ? colors : undefined })
                              }}
                            />
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                </th>
              ))}
              <th className="w-10 border-b border-border p-2">
                <SmallButton label="Add column" onClick={addColumn}>
                  <Plus className="size-3.5" />
                </SmallButton>
              </th>
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, r) => (
              <tr key={r} className="group">
                {block.columns.map((column) => (
                  <td key={column.id} className="border-b border-r border-border p-1 last:border-r-0">
                    <input
                      className="h-7 w-full rounded bg-transparent px-1.5 outline-none focus:bg-bg focus:ring-1 focus:ring-accent"
                      value={row[column.id] ?? ''}
                      aria-label={`Row ${r + 1}, ${column.title}`}
                      onChange={(e) => setCell(r, column.id, e.target.value)}
                      onPaste={(e) => {
                        // Several cells pasted into one cell fill the grid from there.
                        const text = e.clipboardData.getData('text')
                        if (!text.includes('\t') && !text.includes('\n')) return
                        e.preventDefault()
                        const cells = parseDelimited(text)
                        const start = block.columns.indexOf(column)
                        const rows = [...block.rows]
                        cells.forEach((values, i) => {
                          const target = { ...(rows[r + i] ?? Object.fromEntries(block.columns.map((c) => [c.id, '']))) }
                          values.forEach((value, j) => {
                            const col = block.columns[start + j]
                            if (col) target[col.id] = value
                          })
                          rows[r + i] = target
                        })
                        onChange({ ...block, rows })
                      }}
                    />
                  </td>
                ))}
                <td className="border-b border-border p-1 text-center">
                  <SmallButton label={`Remove row ${r + 1}`} onClick={() => removeRow(r)} danger className="opacity-0 group-hover:opacity-100">
                    <Trash2 className="size-3" />
                  </SmallButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" onClick={addRow} className="flex h-8 w-full items-center justify-center gap-1.5 text-xs text-muted transition hover:bg-hover hover:text-accent">
          <Plus className="size-3.5" /> Add a row
        </button>
      </div>

      <details className="text-xs">
        <summary className="cursor-pointer text-muted">Grouped headers {block.headerGroups ? `(${block.headerGroups.length})` : ''}</summary>
        <div className="mt-2 flex flex-col gap-1">
          <Label>A row above the titles; the spans add up to {block.columns.length} columns</Label>
          <ListEditor
            items={block.headerGroups ?? []}
            addLabel="Add a group"
            onChange={(groups) => onChange({ ...block, headerGroups: groups.length ? groups : undefined })}
            create={() => ({ title: 'Group', span: 1 })}
            render={(group, update) => (
              <Row>
                <TextField label="Title" value={group.title} onChange={(title) => update({ ...group, title })} />
                <SelectField
                  label="Columns"
                  value={String(group.span)}
                  options={block.columns.map((_, i) => String(i + 1))}
                  onChange={(span) => update({ ...group, span: Number(span) })}
                  width={90}
                />
              </Row>
            )}
          />
        </div>
      </details>
    </div>
  )
}
