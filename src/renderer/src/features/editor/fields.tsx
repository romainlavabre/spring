// Small form pieces shared by the block editors.
import clsx from 'clsx'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { COLORS, type Color } from '@core/blocks/schema'
import { cn, fieldClass } from '../../components/ui'

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('text-[11px] font-medium uppercase tracking-wide text-muted', className)}>{children}</span>
}

export function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-wrap items-end gap-3', className)}>{children}</div>
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  className,
  mono,
  width
}: {
  label?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  mono?: boolean
  width?: number
}) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1', !width && 'flex-1', className)} style={width ? { width } : undefined}>
      {label && <Label>{label}</Label>}
      <input
        className={cn(fieldClass, 'h-8 text-[13px]', mono && 'font-mono text-xs')}
        value={value}
        placeholder={placeholder}
        spellCheck={!mono}
        aria-label={label ?? placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  width
}: {
  label?: string
  value: T
  options: readonly (T | { value: T; label: string })[]
  onChange: (value: T) => void
  width?: number
}) {
  return (
    <label className="flex flex-col gap-1" style={width ? { width } : undefined}>
      {label && <Label>{label}</Label>}
      <select className={cn(fieldClass, 'h-8 pr-6 text-[13px]')} value={value} aria-label={label} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((option) => {
          const item = typeof option === 'string' ? { value: option, label: option } : option
          return (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          )
        })}
      </select>
    </label>
  )
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="inline-flex h-8 cursor-pointer items-center gap-2 text-xs">
      <input type="checkbox" className="size-3.5 accent-[var(--accent)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

const SWATCHES: Record<Color, string> = {
  red: '#f26b6f',
  orange: '#f08c4a',
  amber: '#e9b03b',
  green: '#4cc38a',
  teal: '#3cb8c2',
  blue: '#5b9cf5',
  violet: '#9d7cf4',
  pink: '#e86fb5',
  gray: '#8b93a4'
}

export function ColorField({ value, onChange, label = 'Color', allowNone = true }: { value?: Color; onChange: (value: Color | undefined) => void; label?: string; allowNone?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <Label>{label}</Label>
      <div className="flex h-8 items-center gap-1">
        {allowNone && (
          <button
            type="button"
            aria-label="Automatic color"
            title="Automatic"
            onClick={() => onChange(undefined)}
            className={clsx('size-5 rounded-full border border-dashed border-muted', !value && 'ring-2 ring-fg/60 ring-offset-1 ring-offset-panel')}
          />
        )}
        {COLORS.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`Color ${color}`}
            title={color}
            onClick={() => onChange(color)}
            className={clsx('size-5 rounded-full', value === color && 'ring-2 ring-fg/60 ring-offset-1 ring-offset-panel')}
            style={{ background: SWATCHES[color] }}
          />
        ))}
      </div>
    </div>
  )
}

/** A list of items edited in place: add, remove, reorder. */
export function ListEditor<T>({
  items,
  onChange,
  render,
  create,
  addLabel,
  min = 0
}: {
  items: T[]
  onChange: (items: T[]) => void
  render: (item: T, update: (item: T) => void, index: number) => ReactNode
  create: () => T
  addLabel: string
  min?: number
}) {
  const move = (from: number, to: number): void => {
    const next = [...items]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    onChange(next)
  }
  return (
    <div className="flex flex-col gap-2">
      {items.map((item, i) => (
        <div key={i} className="flex gap-2 rounded-lg border border-border bg-bg/40 p-2.5">
          <div className="min-w-0 flex-1">{render(item, (next) => onChange(items.map((old, j) => (j === i ? next : old))), i)}</div>
          <div className="flex shrink-0 flex-col gap-0.5">
            <SmallButton label="Move up" disabled={i === 0} onClick={() => move(i, i - 1)}>
              <ArrowUp className="size-3.5" />
            </SmallButton>
            <SmallButton label="Move down" disabled={i === items.length - 1} onClick={() => move(i, i + 1)}>
              <ArrowDown className="size-3.5" />
            </SmallButton>
            <SmallButton label="Remove" disabled={items.length <= min} onClick={() => onChange(items.filter((_, j) => j !== i))} danger>
              <Trash2 className="size-3.5" />
            </SmallButton>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, create()])}
        className="flex h-8 items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-xs text-muted transition hover:border-accent hover:text-accent"
      >
        <Plus className="size-3.5" /> {addLabel}
      </button>
    </div>
  )
}

export function SmallButton({
  label,
  onClick,
  disabled,
  danger,
  children,
  className
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex size-6 items-center justify-center rounded text-muted transition hover:bg-hover disabled:pointer-events-none disabled:opacity-30',
        danger ? 'hover:text-danger' : 'hover:text-fg',
        className
      )}
    >
      {children}
    </button>
  )
}
