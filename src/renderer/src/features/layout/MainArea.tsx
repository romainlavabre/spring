// The page being read or edited, with its toolbar, its table of contents and
// links to the previous and next pages.
import { ArrowLeft, ArrowRight, BookOpen, FileDown, FilePlus2, FolderPlus, Pencil } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Page } from '@core/blocks/schema'
import { pagesInOrder, type TreeNode } from '@core/tree'
import { api, errorMessage } from '../../lib/bridge'
import { goBack, goForward, setEditing, useApp } from '../../store'
import { toast } from '../../components/feedback'
import { CodeEditor } from '../../components/CodeEditor'
import { Button, EmptyState, ErrorBox, IconButton, Spinner } from '../../components/ui'
import { DocProvider, type DocEnvironment } from '../../doc/context'
import { PageBody, PageHeader, PageNav, TableOfContents } from '../../doc/PageView'
import { homePage, trailOf, usePage, useRefresh, useTheme, useTree } from '../docs/useDocs'
import { PageEditor } from '../editor/PageEditor'
import { exportPdf } from '../export/exportPdf'
import { useActiveRepo } from '../workspace/useWorkspace'
import { openNodeDialog } from './Sidebar'
import { openPageSafely } from './UnsavedChanges'

export function MainArea() {
  const repo = useActiveRepo()
  const { data: tree, isLoading } = useTree()
  const chosen = useApp((s) => s.page)
  const theme = useApp((s) => s.theme)
  const { data: css } = useTheme()
  const path = chosen && tree && pagesInOrder(tree).some((p) => p.path === chosen) ? chosen : homePage(tree)

  const environment = useMemo<DocEnvironment>(
    () => ({
      assetBase: repo ? `spring-asset://${repo.id}` : '',
      navigate: (target, anchor) => void openPageSafely(target, anchor ?? null),
      openExternal: (url) => void api.app.openExternal({ url }).catch((e: unknown) => toast(errorMessage(e), 'error')),
      printing: false,
      dark: theme === 'dark',
      pending: () => () => undefined
    }),
    [repo, theme]
  )

  if (isLoading || !tree) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    )
  }
  if (!path) return <EmptyWorkspace />

  return (
    <DocProvider value={environment}>
      {css && <style>{css}</style>}
      <PageScreen key={path} path={path} tree={tree} />
    </DocProvider>
  )
}

function EmptyWorkspace() {
  return (
    <EmptyState icon={<BookOpen className="size-10" />} title="No page yet">
      <p className="max-w-md text-xs leading-relaxed">
        Organise the documentation in sections — Infra, Process, External links… — and write pages of text, tables, timelines, code and
        diagrams. Or ask Claude to write them through the MCP server.
      </p>
      <div className="flex gap-2">
        <Button variant="primary" icon={<FolderPlus className="size-4" />} onClick={() => openNodeDialog({ kind: 'section', parent: '' })}>
          New section
        </Button>
        <Button icon={<FilePlus2 className="size-4" />} onClick={() => openNodeDialog({ kind: 'page', parent: '' })}>
          New page
        </Button>
      </div>
    </EmptyState>
  )
}

function PageScreen({ path, tree }: { path: string; tree: TreeNode[] }) {
  const { data: page, error, isLoading } = usePage(path)
  const editing = useApp((s) => s.editing)
  const anchor = useApp((s) => s.anchor)
  const canGoBack = useApp((s) => s.back.length > 0)
  const canGoForward = useApp((s) => s.forward.length > 0)
  const refresh = useRefresh()
  const scroller = useRef<HTMLDivElement>(null)
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null)
  const trail = trailOf(tree, path)
  const pages = pagesInOrder(tree)
  const index = pages.findIndex((p) => p.path === path)

  useEffect(() => {
    if (!page || !anchor) return
    const timer = setTimeout(() => {
      const target = document.getElementById(anchor) ?? document.getElementById(`block-${anchor}`)
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 60)
    return () => clearTimeout(timer)
  }, [page, anchor])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.altKey && event.key === 'ArrowLeft') goBack()
      if (event.altKey && event.key === 'ArrowRight') goForward()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border px-3">
        <IconButton label="Back (Alt+←)" disabled={!canGoBack} onClick={goBack}>
          <ArrowLeft className="size-4" />
        </IconButton>
        <IconButton label="Forward (Alt+→)" disabled={!canGoForward} onClick={goForward}>
          <ArrowRight className="size-4" />
        </IconButton>
        <div className="ml-2 min-w-0 flex-1 truncate text-xs text-muted">
          {[...trail, page?.title ?? ''].filter(Boolean).join('  /  ')}
        </div>
        {page && !editing && (
          <>
            <Button size="sm" variant="ghost" icon={<FileDown className="size-3.5" />} onClick={() => void exportPdf(path)}>
              PDF
            </Button>
            <Button size="sm" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(true)}>
              Edit
            </Button>
          </>
        )}
      </div>
      <div
        ref={(element) => {
          scroller.current = element
          setScrollElement(element)
        }}
        className="min-h-0 flex-1 overflow-y-auto"
        style={{ background: 'var(--doc-bg)' }}
      >
        <div className="mx-auto flex max-w-[1180px] gap-10 px-10 pb-24 pt-10">
          <article className="doc-page min-w-0 max-w-[820px] flex-1">
            {isLoading && <Spinner />}
            {error && <BrokenPage path={path} message={errorMessage(error)} onRepaired={refresh} />}
            {page &&
              (editing ? (
                <PageEditor path={path} saved={page} onSaved={refresh} />
              ) : (
                <>
                  <PageHeader page={page} trail={trail} />
                  <PageBody page={page} />
                  <PageNav
                    neighbours={{ previous: pages[index - 1], next: pages[index + 1] }}
                    onOpen={(target) => {
                      void openPageSafely(target)
                      scroller.current?.scrollTo({ top: 0 })
                    }}
                  />
                </>
              ))}
          </article>
          {page && !editing && <TocColumn page={page} scroller={scrollElement} />}
        </div>
      </div>
    </div>
  )
}

function TocColumn({ page, scroller }: { page: Page; scroller: HTMLElement | null }) {
  return (
    <aside className="sticky top-10 hidden w-52 shrink-0 self-start xl:block">
      <TableOfContents page={page} scroller={scroller} />
    </aside>
  )
}

/** A page that does not validate (edited by hand or by a merge): its source can be repaired here. */
function BrokenPage({ path, message, onRepaired }: { path: string; message: string; onRepaired: () => Promise<void> }) {
  const [source, setSource] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    void api.docs.getPageSource({ path }).then(setSource).catch(() => setSource(null))
  }, [path])
  return (
    <div className="flex flex-col gap-3">
      <h1 className="doc-page-title">This page cannot be shown</h1>
      <ErrorBox>{message}</ErrorBox>
      {source !== null && (
        <>
          <p className="text-xs text-muted">Fix its source below, then save.</p>
          <CodeEditor value={source} onChange={setSource} language="json" minHeight={300} maxHeight={1400} label="Page source" />
          {error && <ErrorBox>{error}</ErrorBox>}
          <div>
            <Button
              variant="primary"
              loading={busy}
              onClick={() => {
                setBusy(true)
                setError(null)
                api.docs
                  .savePageSource({ path, source })
                  .then(onRepaired)
                  .catch((e: unknown) => setError(errorMessage(e)))
                  .finally(() => setBusy(false))
              }}
            >
              Save the source
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
