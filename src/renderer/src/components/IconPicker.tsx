// Picks a Lucide icon: a few suggestions, or any name typed.
import clsx from 'clsx'
import { NamedIcon, SUGGESTED_ICONS, iconExists } from '../doc/Icon'
import { Input } from './ui'

export function IconPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        {SUGGESTED_ICONS.map((name) => (
          <button
            key={name}
            type="button"
            title={name}
            aria-label={`Icon ${name}`}
            aria-pressed={value === name}
            onClick={() => onChange(value === name ? '' : name)}
            className={clsx(
              'flex size-8 items-center justify-center rounded-md border transition',
              value === name ? 'border-accent bg-accent/15 text-accent' : 'border-transparent text-muted hover:bg-hover hover:text-fg'
            )}
          >
            <NamedIcon name={name} className="size-4" />
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="or any Lucide icon name, e.g. cpu" className="font-mono text-xs" />
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border text-accent">
          {value && iconExists(value) ? <NamedIcon name={value} className="size-4" /> : <span className="text-[10px] text-muted">{value ? '?' : '—'}</span>}
        </span>
      </div>
    </div>
  )
}
