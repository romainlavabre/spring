// Operations on the blocks of a page, nested ones (tabs, details) included.
// Pure functions: they return a new page and never touch the one given.
import type { Block, Page } from './schema'

/** Where a block goes: after or before a sibling, or at the end of a page, a tab or a details block. */
export interface Position {
  after?: string
  before?: string
  /** Container block (tabs or details); the page itself when omitted. */
  parent?: string
  /** Tab index, for a tabs container. */
  tab?: number
}

/** The blocks a container holds, by reference. */
type Holder = { blocks: Block[] }

/** Every block of the page, depth first, with the list holding it. */
export function walkBlocks(blocks: Block[], visit: (block: Block, siblings: Block[]) => void): void {
  for (const block of blocks) {
    visit(block, blocks)
    for (const holder of childHolders(block)) walkBlocks(holder.blocks, visit)
  }
}

export function childHolders(block: Block): Holder[] {
  if (block.type === 'tabs') return block.tabs
  if (block.type === 'details') return [block]
  return []
}

export function allBlocks(page: Pick<Page, 'blocks'>): Block[] {
  const found: Block[] = []
  walkBlocks(page.blocks, (block) => found.push(block))
  return found
}

export function findBlock(page: Pick<Page, 'blocks'>, id: string): Block | null {
  return allBlocks(page).find((block) => block.id === id) ?? null
}

/** A short id not used in the page yet, e.g. "b-k3x9q2". */
export function newBlockId(page: Pick<Page, 'blocks'>, prefix = 'b'): string {
  const taken = new Set(allBlocks(page).map((b) => b.id))
  for (;;) {
    const id = `${prefix}-${Math.random().toString(36).slice(2, 8)}`
    if (!taken.has(id)) return id
  }
}

/** Gives fresh ids to a block and the blocks inside it (duplicating, pasting). */
export function withFreshIds<T extends Block>(page: Pick<Page, 'blocks'>, block: T): T {
  const copy = structuredClone(block)
  const scratch = { blocks: [...page.blocks] }
  const renew = (b: Block): void => {
    b.id = newBlockId(scratch)
    scratch.blocks.push(b)
    for (const holder of childHolders(b)) holder.blocks.forEach(renew)
  }
  renew(copy)
  return copy
}

function locate(page: Page, id: string): { siblings: Block[]; index: number } | null {
  let found: { siblings: Block[]; index: number } | null = null
  walkBlocks(page.blocks, (block, siblings) => {
    if (!found && block.id === id) found = { siblings, index: siblings.indexOf(block) }
  })
  return found
}

function insertionPoint(page: Page, position: Position): { siblings: Block[]; index: number } {
  const anchor = position.after ?? position.before
  if (anchor) {
    const at = locate(page, anchor)
    if (!at) throw new Error(`No block "${anchor}" in the page`)
    return { siblings: at.siblings, index: position.after ? at.index + 1 : at.index }
  }
  if (position.parent) {
    const parent = findBlock(page, position.parent)
    if (!parent) throw new Error(`No block "${position.parent}" in the page`)
    if (parent.type === 'details') return { siblings: parent.blocks, index: parent.blocks.length }
    if (parent.type === 'tabs') {
      const tab = parent.tabs[position.tab ?? 0]
      if (!tab) throw new Error(`Block "${parent.id}" has no tab ${position.tab}`)
      return { siblings: tab.blocks, index: tab.blocks.length }
    }
    throw new Error(`Block "${parent.id}" is a ${parent.type}: only tabs and details hold blocks`)
  }
  return { siblings: page.blocks, index: page.blocks.length }
}

export function addBlock(page: Page, block: Block, position: Position = {}): Page {
  const next = structuredClone(page)
  if (findBlock(next, block.id)) throw new Error(`The page already has a block "${block.id}"`)
  const { siblings, index } = insertionPoint(next, position)
  siblings.splice(index, 0, structuredClone(block))
  return next
}

/** Replaces a block (same id), or merges fields into it. */
export function updateBlock(page: Page, id: string, change: Block | Partial<Block>, merge = false): Page {
  const next = structuredClone(page)
  const at = locate(next, id)
  if (!at) throw new Error(`No block "${id}" in the page`)
  const current = at.siblings[at.index]
  const replaced = (merge ? { ...current, ...change } : change) as Block
  if (replaced.id !== id) throw new Error(`The id of a block cannot change ("${id}" → "${replaced.id}")`)
  at.siblings[at.index] = replaced
  return next
}

export function deleteBlock(page: Page, id: string): Page {
  const next = structuredClone(page)
  const at = locate(next, id)
  if (!at) throw new Error(`No block "${id}" in the page`)
  at.siblings.splice(at.index, 1)
  return next
}

export function moveBlock(page: Page, id: string, position: Position): Page {
  const block = findBlock(page, id)
  if (!block) throw new Error(`No block "${id}" in the page`)
  if (position.after === id || position.before === id) return page
  const target = position.parent ?? position.after ?? position.before
  const inside = target && (position.parent === id || findBlock({ blocks: childHolders(block).flatMap((h) => h.blocks) }, target))
  if (inside) throw new Error('A block cannot move inside itself')
  return addBlock(deleteBlock(page, id), block, position)
}

// ------------------------------------------------------------------- content

/** Markdown fields of a block itself (not of the blocks it holds). */
export function markdownOf(block: Block): string[] {
  switch (block.type) {
    case 'text':
    case 'callout':
      return [block.md]
    case 'steps':
      return block.steps.map((s) => s.md)
    case 'cards':
      return block.cards.map((c) => c.md ?? '')
    case 'timeline':
      return block.items.map((i) => i.description ?? '')
    case 'table': {
      const md = new Set(block.columns.filter((c) => c.type === 'md').map((c) => c.id))
      return block.rows.flatMap((row) => Object.entries(row).filter(([key]) => md.has(key)).map(([, v]) => v))
    }
    default:
      return []
  }
}

/** Plain text of a page, for the search index. */
export function pageText(page: Page): string {
  const parts: string[] = []
  for (const block of allBlocks(page)) {
    parts.push(...markdownOf(block))
    switch (block.type) {
      case 'callout':
        parts.push(block.title ?? '')
        break
      case 'code':
        parts.push(block.title ?? '', block.code)
        break
      case 'codeGroup':
        parts.push(...block.items.map((i) => `${i.label} ${i.code}`))
        break
      case 'table':
        parts.push(block.caption ?? '', ...block.columns.map((c) => c.title), ...block.rows.flatMap((r) => Object.values(r)))
        break
      case 'timeline':
        parts.push(block.title ?? '', ...block.lanes.map((l) => l.title), ...block.items.flatMap((i) => [i.title, i.actor ?? '']))
        break
      case 'steps':
        parts.push(...block.steps.map((s) => s.title))
        break
      case 'cards':
        parts.push(...block.cards.map((c) => c.title))
        break
      case 'tabs':
        parts.push(...block.tabs.map((t) => t.label))
        break
      case 'details':
        parts.push(block.summary)
        break
      case 'mermaid':
        parts.push(block.caption ?? '')
        break
      case 'image':
        parts.push(block.alt ?? '', block.caption ?? '')
        break
    }
  }
  return parts.filter(Boolean).join('\n')
}

const PAGE_LINK = /\]\(page:([^)\s#]+)(#[^)\s]*)?\)/g

/** Targets of the page: links a block points to, as `page:` paths or plain URLs. */
export function linksOf(block: Block): string[] {
  const links: string[] = []
  for (const md of markdownOf(block)) for (const match of md.matchAll(PAGE_LINK)) links.push(`page:${match[1]}`)
  if (block.type === 'cards') for (const card of block.cards) if (card.href) links.push(card.href)
  if (block.type === 'timeline') for (const item of block.items) if (item.link) links.push(item.link)
  return links
}

/** Rewrites `page:` links after a page or section moved from `from` to `to`. */
export function rewritePageLinks(page: Page, from: string, to: string): Page {
  const move = (target: string): string => {
    if (target === from) return to
    if (target.startsWith(`${from}/`)) return to + target.slice(from.length)
    return target
  }
  const md = (text: string): string => text.replace(PAGE_LINK, (all, target: string, hash = '') => all.replace(`page:${target}${hash}`, `page:${move(target)}${hash}`))
  const href = (value: string | undefined): string | undefined => (value?.startsWith('page:') ? `page:${move(value.slice(5))}` : value)
  const next = structuredClone(page)
  for (const block of allBlocks(next)) {
    switch (block.type) {
      case 'text':
      case 'callout':
        block.md = md(block.md)
        break
      case 'steps':
        for (const step of block.steps) step.md = md(step.md)
        break
      case 'cards':
        for (const card of block.cards) {
          if (card.md) card.md = md(card.md)
          card.href = href(card.href)
        }
        break
      case 'timeline':
        for (const item of block.items) {
          if (item.description) item.description = md(item.description)
          item.link = href(item.link)
        }
        break
      case 'table': {
        const mdColumns = block.columns.filter((c) => c.type === 'md').map((c) => c.id)
        for (const row of block.rows) for (const key of mdColumns) if (row[key]) row[key] = md(row[key])
        break
      }
    }
  }
  return next
}

/** ## and ### headings of the text blocks, for the table of contents. */
export interface Heading {
  blockId: string
  level: 2 | 3
  text: string
}

export function headingsOf(page: Pick<Page, 'blocks'>): Heading[] {
  const headings: Heading[] = []
  for (const block of page.blocks) {
    if (block.type !== 'text') continue
    let fenced = false
    for (const line of block.md.split('\n')) {
      if (/^\s*(```|~~~)/.test(line)) fenced = !fenced
      const match = !fenced && /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(line)
      if (match) headings.push({ blockId: block.id, level: match[1].length as 2 | 3, text: stripInlineMarkdown(match[2]) })
    }
  }
  return headings
}

export function stripInlineMarkdown(text: string): string {
  return text
    .replace(/:(badge|kbd)\[([^\]]*)\](\{[^}]*\})?/g, '$2')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .trim()
}

/** Anchor of a heading, as the renderer sets it. */
export function headingAnchor(text: string): string {
  return (
    stripInlineMarkdown(text)
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'section'
  )
}
