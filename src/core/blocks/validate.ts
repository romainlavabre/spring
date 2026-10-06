// Checks a page beyond its shape: unique ids, timeline references and dates,
// table columns, and the pages and assets it points to. Errors carry the
// path of the faulty value, e.g. blocks[2].items[4].end.
import type { ZodError } from 'zod'
import { endDay, startDay } from './dates'
import { childHolders, linksOf } from './ops'
import { pageSchema, type Block, type Page } from './schema'

export interface PageIssue {
  path: string
  message: string
}

export interface ValidationContext {
  /** Whether a page exists at this path (relative to the sections folder). */
  pageExists?(path: string): boolean
  assetExists?(name: string): boolean
}

export type ValidationResult = { ok: true; page: Page; issues: [] } | { ok: false; page: null; issues: PageIssue[] }

export function issuePath(path: readonly PropertyKey[]): string {
  return path.reduce<string>((acc, part) => (typeof part === 'number' ? `${acc}[${part}]` : acc ? `${acc}.${String(part)}` : String(part)), '')
}

export function zodIssues(error: ZodError): PageIssue[] {
  return error.issues.map((issue) => ({ path: issuePath(issue.path) || '(page)', message: issue.message }))
}

function checkBlock(block: Block, at: string, seen: Map<string, string>, ctx: ValidationContext, issues: PageIssue[]): void {
  const add = (path: string, message: string): void => void issues.push({ path: `${at}${path}`, message })
  const previous = seen.get(block.id)
  if (previous) add('.id', `Duplicate block id "${block.id}" (also at ${previous})`)
  else seen.set(block.id, at)

  if (block.type === 'table') {
    const ids = new Set<string>()
    block.columns.forEach((column, i) => {
      if (ids.has(column.id)) add(`.columns[${i}].id`, `Duplicate column id "${column.id}"`)
      ids.add(column.id)
    })
    block.rows.forEach((row, r) => {
      for (const key of Object.keys(row)) if (!ids.has(key)) add(`.rows[${r}].${key}`, `Unknown column "${key}"`)
    })
    if (block.headerGroups) {
      const span = block.headerGroups.reduce((sum, g) => sum + g.span, 0)
      if (span !== block.columns.length) add('.headerGroups', `The spans add up to ${span}, the table has ${block.columns.length} columns`)
    }
  }

  if (block.type === 'timeline') {
    const lanes = new Set(block.lanes.map((l) => l.id))
    const actors = new Set<string>()
    // An actor that is not declared is free text: it is not checked.
    block.actors?.forEach((actor, i) => {
      if (actors.has(actor.id)) add(`.actors[${i}].id`, `Duplicate actor id "${actor.id}"`)
      actors.add(actor.id)
    })
    const items = new Set<string>()
    block.items.forEach((item, i) => {
      if (items.has(item.id)) add(`.items[${i}].id`, `Duplicate item id "${item.id}"`)
      items.add(item.id)
    })
    block.items.forEach((item, i) => {
      if (item.lane && !lanes.has(item.lane)) add(`.items[${i}].lane`, `Unknown lane "${item.lane}" (lanes: ${[...lanes].join(', ') || 'none'})`)
      if (item.end && !item.start) add(`.items[${i}].end`, 'An end needs a start: set the start or remove the end')
      else if (item.end && item.start && endDay(item.end) < startDay(item.start)) add(`.items[${i}].end`, `Ends (${item.end}) before it starts (${item.start})`)
      if (item.end && item.kind !== 'phase') add(`.items[${i}].end`, `Only phases have an end: set kind to "phase" or remove the end`)
      for (const dependency of item.dependsOn ?? []) {
        if (!items.has(dependency)) add(`.items[${i}].dependsOn`, `Unknown item "${dependency}"`)
        else if (dependency === item.id) add(`.items[${i}].dependsOn`, 'An item cannot depend on itself')
      }
    })
  }

  if (block.type === 'image' && ctx.assetExists && !ctx.assetExists(block.asset)) {
    add('.asset', `No asset "${block.asset}" in the workspace: add it first`)
  }

  if (ctx.pageExists) {
    for (const link of linksOf(block)) {
      if (link.startsWith('page:') && !ctx.pageExists(link.slice(5).split('#')[0])) add('', `Link to a missing page: ${link}`)
    }
  }

  if (block.type === 'tabs') {
    block.tabs.forEach((tab, t) => tab.blocks.forEach((child, i) => checkBlock(child, `${at}.tabs[${t}].blocks[${i}]`, seen, ctx, issues)))
  } else {
    for (const holder of childHolders(block)) holder.blocks.forEach((child, i) => checkBlock(child, `${at}.blocks[${i}]`, seen, ctx, issues))
  }
}

/** Parses and checks a page; the page returned has its defaults filled in. */
export function validatePage(input: unknown, ctx: ValidationContext = {}): ValidationResult {
  const parsed = pageSchema.safeParse(input)
  if (!parsed.success) return { ok: false, page: null, issues: zodIssues(parsed.error) }
  const issues: PageIssue[] = []
  const seen = new Map<string, string>()
  parsed.data.blocks.forEach((block, i) => checkBlock(block, `blocks[${i}]`, seen, ctx, issues))
  return issues.length ? { ok: false, page: null, issues } : { ok: true, page: parsed.data, issues: [] }
}

export function formatIssues(issues: PageIssue[]): string {
  return issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n')
}

/** Like validatePage, but throws with every issue listed. */
export function assertValidPage(input: unknown, ctx: ValidationContext = {}): Page {
  const result = validatePage(input, ctx)
  if (!result.ok) throw new Error(`Invalid page:\n${formatIssues(result.issues)}`)
  return result.page
}
