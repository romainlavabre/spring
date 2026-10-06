// Edits a timeline: its view, its lanes, and its items as a grid (title,
// kind, dates, lane, status), with description, link and dependencies
// under each item.
import clsx from 'clsx'
import { ChevronDown, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { DATE_PATTERN, TIMELINE_KINDS, TIMELINE_STATUSES, type TimelineBlock } from '@core/blocks/schema'
import { slugify } from '@core/slug'
import { SegmentedControl, cn, fieldClass } from '../../components/ui'
import { ColorField, Label, ListEditor, Row, SmallButton, TextField, Toggle } from './fields'
import { MarkdownField } from './BlockEditor'

type Item = TimelineBlock['items'][number]

function uniqueId(base: string, taken: string[]): string {
  const root = slugify(base).slice(0, 30) || 'item'
  let id = root
  for (let n = 2; taken.includes(id); n++) id = `${root}-${n}`
  return id
}

function DateInput({ value, onChange, label, disabled }: { value: string; onChange: (value: string) => void; label: string; disabled?: boolean }) {
  const invalid = !!value && !DATE_PATTERN.test(value)
  return (
    <input
      className={cn(fieldClass, 'h-7 w-[104px] font-mono text-[11.5px]', invalid && 'border-danger text-danger')}
      value={value}
      disabled={disabled}
      placeholder={disabled ? '—' : 'YYYY-MM-DD'}
      aria-label={label}
      aria-invalid={invalid}
      title="YYYY, YYYY-MM or YYYY-MM-DD"
      onChange={(e) => onChange(e.target.value.trim())}
    />
  )
}

export function TimelineEditor({ block, onChange }: { block: TimelineBlock; onChange: (block: TimelineBlock) => void }) {
  const [open, setOpen] = useState<number | null>(null)
  const setItem = (index: number, item: Item): void => onChange({ ...block, items: block.items.map((it, i) => (i === index ? item : it)) })
  const removeItem = (index: number): void => {
    const id = block.items[index].id
    onChange({
      ...block,
      items: block.items
        .filter((_, i) => i !== index)
        .map((item) => (item.dependsOn?.includes(id) ? { ...item, dependsOn: item.dependsOn.filter((d) => d !== id) } : item))
    })
  }
  const addItem = (): void => {
    const last = block.items.at(-1)
    const item: Item = {
      id: uniqueId(`item-${block.items.length + 1}`, block.items.map((i) => i.id)),
      title: '',
      kind: block.view === 'gantt' ? 'phase' : 'event',
      start: last?.end ?? last?.start ?? new Date().toISOString().slice(0, 7),
      status: 'planned',
      lane: last?.lane
    }
    if (item.kind === 'phase') item.end = item.start
    onChange({ ...block, items: [...block.items, item] })
    setOpen(null)
  }

  return (
    <div className="flex flex-col gap-4">
      <Row>
        <div className="flex flex-col gap-1">
          <Label>View</Label>
          <SegmentedControl
            value={block.view}
            onChange={(view) => onChange({ ...block, view })}
            options={[
              { value: 'vertical', label: 'Vertical story' },
              { value: 'gantt', label: 'Gantt schedule' }
            ]}
          />
        </div>
        <TextField label="Title" value={block.title ?? ''} onChange={(title) => onChange({ ...block, title: title || undefined })} />
        <Toggle label="Today line" checked={block.today !== false} onChange={(today) => onChange({ ...block, today: today ? undefined : false })} />
      </Row>

      <div className="flex flex-col gap-1.5">
        <Label>Lanes {block.view === 'vertical' && '(shown as colored tags)'}</Label>
        <ListEditor<TimelineBlock['lanes'][number]>
          items={block.lanes}
          addLabel="Add a lane"
          onChange={(lanes) => {
            const ids = new Set(lanes.map((l) => l.id))
            onChange({ ...block, lanes, items: block.items.map((item) => (item.lane && !ids.has(item.lane) ? { ...item, lane: undefined } : item)) })
          }}
          create={() => ({ id: uniqueId(`lane-${block.lanes.length + 1}`, block.lanes.map((l) => l.id)), title: `Lane ${block.lanes.length + 1}` })}
          render={(lane, update) => (
            <Row>
              <TextField label="Lane" value={lane.title} onChange={(title) => update({ ...lane, title })} width={200} />
              <ColorField value={lane.color} onChange={(color) => update({ ...lane, color })} />
            </Row>
          )}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Items</Label>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-panel-2 text-left text-[10.5px] uppercase tracking-wide text-muted">
                <th className="w-6 p-2" />
                <th className="p-2 font-medium">Title</th>
                <th className="p-2 font-medium">Kind</th>
                <th className="p-2 font-medium">Start</th>
                <th className="p-2 font-medium">End</th>
                <th className="p-2 font-medium">Lane</th>
                <th className="p-2 font-medium">Status</th>
                <th className="w-8 p-2" />
              </tr>
            </thead>
            <tbody>
              {block.items.map((item, i) => (
                <ItemRows
                  key={i}
                  item={item}
                  index={i}
                  block={block}
                  open={open === i}
                  onToggle={() => setOpen(open === i ? null : i)}
                  onChange={(next) => setItem(i, next)}
                  onRemove={() => removeItem(i)}
                />
              ))}
            </tbody>
          </table>
          <button type="button" onClick={addItem} className="flex h-8 w-full items-center justify-center gap-1.5 text-xs text-muted transition hover:bg-hover hover:text-accent">
            <Plus className="size-3.5" /> Add an item
          </button>
        </div>
      </div>
    </div>
  )
}

function ItemRows({
  item,
  index,
  block,
  open,
  onToggle,
  onChange,
  onRemove
}: {
  item: Item
  index: number
  block: TimelineBlock
  open: boolean
  onToggle: () => void
  onChange: (item: Item) => void
  onRemove: () => void
}) {
  const others = block.items.filter((other) => other.id !== item.id)
  const select = cn(fieldClass, 'h-7 text-xs')
  return (
    <>
      <tr className="border-t border-border align-middle">
        <td className="p-1 text-center">
          <SmallButton label={open ? 'Fewer details' : 'More details'} onClick={onToggle}>
            <ChevronDown className={clsx('size-3.5 transition-transform', !open && '-rotate-90')} />
          </SmallButton>
        </td>
        <td className="p-1">
          <input
            className={cn(fieldClass, 'h-7 min-w-40 text-xs font-medium')}
            value={item.title}
            placeholder="Title"
            aria-label={`Title of item ${index + 1}`}
            onChange={(e) => onChange({ ...item, title: e.target.value })}
          />
        </td>
        <td className="p-1">
          <select
            className={select}
            value={item.kind}
            aria-label={`Kind of item ${index + 1}`}
            onChange={(e) => {
              const kind = e.target.value as Item['kind']
              onChange({ ...item, kind, end: kind === 'phase' ? (item.end ?? item.start) : undefined })
            }}
          >
            {TIMELINE_KINDS.map((kind) => (
              <option key={kind}>{kind}</option>
            ))}
          </select>
        </td>
        <td className="p-1">
          <DateInput label={`Start of item ${index + 1}`} value={item.start} onChange={(start) => onChange({ ...item, start })} />
        </td>
        <td className="p-1">
          <DateInput
            label={`End of item ${index + 1}`}
            value={item.end ?? ''}
            disabled={item.kind !== 'phase'}
            onChange={(end) => onChange({ ...item, end: end || undefined })}
          />
        </td>
        <td className="p-1">
          <select className={select} value={item.lane ?? ''} aria-label={`Lane of item ${index + 1}`} onChange={(e) => onChange({ ...item, lane: e.target.value || undefined })}>
            <option value="">—</option>
            {block.lanes.map((lane) => (
              <option key={lane.id} value={lane.id}>
                {lane.title}
              </option>
            ))}
          </select>
        </td>
        <td className="p-1">
          <select className={select} value={item.status} aria-label={`Status of item ${index + 1}`} onChange={(e) => onChange({ ...item, status: e.target.value as Item['status'] })}>
            {TIMELINE_STATUSES.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </td>
        <td className="p-1 text-center">
          <SmallButton label={`Remove item ${index + 1}`} onClick={onRemove} danger disabled={block.items.length === 1}>
            <Trash2 className="size-3" />
          </SmallButton>
        </td>
      </tr>
      {open && (
        <tr>
          <td />
          <td colSpan={7} className="p-2 pt-0">
            <div className="flex flex-col gap-2.5 rounded-lg border border-border bg-bg/40 p-2.5">
              <MarkdownField label="Description" value={item.description ?? ''} onChange={(description) => onChange({ ...item, description: description || undefined })} minHeight={50} />
              <TextField label="Link" value={item.link ?? ''} onChange={(link) => onChange({ ...item, link: link || undefined })} placeholder="page:section/page or https://…" mono />
              {others.length > 0 && (
                <div className="flex flex-col gap-1">
                  <Label>Depends on (arrows in the Gantt view)</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {others.map((other) => {
                      const on = item.dependsOn?.includes(other.id) ?? false
                      return (
                        <button
                          key={other.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => {
                            const next = on ? (item.dependsOn ?? []).filter((d) => d !== other.id) : [...(item.dependsOn ?? []), other.id]
                            onChange({ ...item, dependsOn: next.length ? next : undefined })
                          }}
                          className={clsx(
                            'rounded-full border px-2.5 py-0.5 text-[11px] transition',
                            on ? 'border-accent bg-accent/15 text-accent' : 'border-border text-muted hover:text-fg'
                          )}
                        >
                          {other.title || other.id}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
