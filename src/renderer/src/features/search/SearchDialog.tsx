// Ctrl+K: full-text search over the pages, opened with Enter.
import * as RadixDialog from '@radix-ui/react-dialog'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { CornerDownLeft, FileText, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { api } from '../../lib/bridge'
import { useActiveRepo } from '../workspace/useWorkspace'
import { openPageSafely } from '../layout/UnsavedChanges'

const useSearch = create<{ open: boolean }>(() => ({ open: false }))

export function openSearch(): void {
  useSearch.setState({ open: true })
}

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export function SearchDialog() {
  const open = useSearch((s) => s.open)
  const repo = useActiveRepo()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const debounced = useDebounced(query.trim(), 120)
  const { data: hits = [] } = useQuery({
    queryKey: ['search', repo?.id, debounced],
    queryFn: () => api.docs.search({ query: debounced }),
    enabled: open && !!repo && debounced.length > 0
  })

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (repo) useSearch.setState({ open: true })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [repo])

  useEffect(() => setSelected(0), [debounced])
  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const choose = (path: string): void => {
    useSearch.setState({ open: false })
    void openPageSafely(path)
  }

  const results = debounced ? hits : []

  return (
    <RadixDialog.Root open={open} onOpenChange={(value) => useSearch.setState({ open: value })}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <RadixDialog.Content
          className="fixed left-1/2 top-[14vh] z-50 flex max-h-[70vh] w-[min(640px,92vw)] -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-border bg-panel shadow-2xl outline-none"
          aria-describedby={undefined}
        >
          <RadixDialog.Title className="sr-only">Search</RadixDialog.Title>
          <div className="flex items-center gap-3 border-b border-border px-4">
            <Search className="size-4 text-muted" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setSelected((s) => Math.min(s + 1, results.length - 1))
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setSelected((s) => Math.max(s - 1, 0))
                } else if (e.key === 'Enter' && results[selected]) {
                  e.preventDefault()
                  choose(results[selected].path)
                }
              }}
              placeholder="Search the documentation…"
              aria-label="Search the documentation"
              className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
              spellCheck={false}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {debounced && results.length === 0 && <div className="px-3 py-8 text-center text-xs text-muted">No page matches “{debounced}”.</div>}
            {!debounced && <div className="px-3 py-8 text-center text-xs text-muted">Titles, text, code, tables and timelines are searched.</div>}
            {results.map((hit, i) => (
              <button
                key={hit.path}
                type="button"
                onMouseEnter={() => setSelected(i)}
                onClick={() => choose(hit.path)}
                className={clsx('flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left', i === selected && 'bg-hover')}
              >
                <FileText className="mt-0.5 size-4 shrink-0 text-accent" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-semibold">{hit.title}</span>
                    <span className="truncate font-mono text-[10.5px] text-muted">{hit.path}</span>
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-xs text-muted">{hit.snippet}</span>
                </span>
                {i === selected && <CornerDownLeft className="mt-1 size-3.5 shrink-0 text-muted" />}
              </button>
            ))}
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
