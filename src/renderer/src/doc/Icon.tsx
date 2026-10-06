// Icons named in pages, sections and links: Lucide names in kebab-case.
import { icons, type LucideProps } from 'lucide-react'

function pascal(name: string): string {
  return name
    .trim()
    .split(/[-_\s]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

export function iconExists(name: string | undefined): boolean {
  return !!name && pascal(name) in icons
}

export function NamedIcon({ name, fallback, ...props }: { name?: string; fallback?: string } & LucideProps) {
  const Component = (name && icons[pascal(name) as keyof typeof icons]) || (fallback && icons[pascal(fallback) as keyof typeof icons])
  if (!Component) return null
  return <Component {...props} />
}

/** A few icons offered in the pickers; any Lucide name can be typed. */
export const SUGGESTED_ICONS = [
  'book-open',
  'file-text',
  'server',
  'database',
  'cloud',
  'container',
  'network',
  'shield-check',
  'lock',
  'key-round',
  'git-branch',
  'rocket',
  'workflow',
  'list-checks',
  'calendar',
  'users',
  'life-buoy',
  'siren',
  'wrench',
  'settings',
  'gauge',
  'chart-line',
  'bell',
  'globe',
  'link',
  'mail',
  'message-circle',
  'lightbulb',
  'graduation-cap',
  'scale',
  'receipt',
  'briefcase'
]
