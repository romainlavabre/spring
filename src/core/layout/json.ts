// JSON written for small git diffs: indented, but an object or array made of
// plain values (a table row, a timeline lane, a list of ids) stays on one line.

const INLINE_MAX = 110

function isPlain(value: unknown): boolean {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value)
}

function render(value: unknown, indent: string): string {
  if (isPlain(value)) return JSON.stringify(value)
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    if (value.every(isPlain)) {
      const inline = `[${value.map((v) => JSON.stringify(v)).join(', ')}]`
      if (inline.length + indent.length <= INLINE_MAX) return inline
    }
    const inner = indent + '  '
    return `[\n${value.map((v) => inner + render(v, inner)).join(',\n')}\n${indent}]`
  }
  const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined)
  if (entries.length === 0) return '{}'
  if (entries.every(([, v]) => isPlain(v))) {
    const inline = `{ ${entries.map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ')} }`
    if (inline.length + indent.length <= INLINE_MAX && !inline.includes('\\n')) return inline
  }
  const inner = indent + '  '
  return `{\n${entries.map(([k, v]) => `${inner}${JSON.stringify(k)}: ${render(v, inner)}`).join(',\n')}\n${indent}}`
}

export function stableJson(value: unknown): string {
  return render(value, '') + '\n'
}
