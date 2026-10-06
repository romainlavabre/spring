// Full-text search over the pages of a workspace.
import MiniSearch from 'minisearch'
import { pageText } from './blocks/ops'
import type { Page } from './blocks/schema'

export interface SearchHit {
  path: string
  title: string
  description?: string
  /** A few words around the first match. */
  snippet: string
  score: number
}

interface Doc {
  id: string
  title: string
  description: string
  text: string
}

function normalize(term: string): string {
  return term
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
}

function snippetOf(text: string, terms: string[]): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  const plain = normalize(flat)
  const at = terms.map((t) => plain.indexOf(normalize(t))).filter((i) => i >= 0)
  const index = at.length ? Math.min(...at) : 0
  const start = Math.max(0, index - 60)
  const end = Math.min(flat.length, index + 140)
  return `${start > 0 ? '…' : ''}${flat.slice(start, end)}${end < flat.length ? '…' : ''}`
}

export function searchPages(pages: { path: string; page: Page }[], query: string, limit = 20): SearchHit[] {
  if (!query.trim()) return []
  const index = new MiniSearch<Doc>({
    fields: ['title', 'description', 'text'],
    storeFields: ['title', 'description', 'text'],
    processTerm: (term) => normalize(term)
  })
  index.addAll(
    pages.map(({ path, page }) => ({ id: path, title: page.title, description: page.description ?? '', text: pageText(page) }))
  )
  return index
    .search(query, { prefix: true, fuzzy: 0.2, boost: { title: 3, description: 2 }, combineWith: 'AND' })
    .slice(0, limit)
    .map((hit) => ({
      path: hit.id as string,
      title: hit.title as string,
      description: (hit.description as string) || undefined,
      snippet: snippetOf(`${hit.description as string} ${hit.text as string}`, hit.terms),
      score: hit.score
    }))
}
