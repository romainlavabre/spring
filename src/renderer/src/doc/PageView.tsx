// A page as readers see it: header, blocks, table of contents and the
// previous / next pages of the menu.
import clsx from 'clsx'
import { ArrowLeft, ArrowRight, ChevronRight } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { headingAnchor, headingsOf } from '@core/blocks/ops'
import type { Page } from '@core/blocks/schema'
import { BlockList } from './BlockView'
import { NamedIcon } from './Icon'

export interface PageNeighbours {
  previous?: { path: string; title: string }
  next?: { path: string; title: string }
}

export function PageHeader({ page, trail, actions }: { page: Pick<Page, 'title' | 'description' | 'icon'>; trail?: string[]; actions?: ReactNode }) {
  return (
    <header className="doc-page-header">
      {trail && trail.length > 0 && (
        <nav className="doc-breadcrumbs" aria-label="Breadcrumbs">
          {trail.map((title, i) => (
            <span key={i} className="doc-breadcrumb">
              {i > 0 && <ChevronRight className="size-3" />}
              {title}
            </span>
          ))}
        </nav>
      )}
      <div className="doc-page-title-row">
        {page.icon && (
          <span className="doc-page-icon">
            <NamedIcon name={page.icon} fallback="file-text" className="size-5" />
          </span>
        )}
        <h1 className="doc-page-title">{page.title}</h1>
        {actions && <div className="doc-page-actions">{actions}</div>}
      </div>
      {page.description && <p className="doc-page-description">{page.description}</p>}
    </header>
  )
}

/** Headings of the page; the one being read is highlighted. */
export function TableOfContents({ page, scroller }: { page: Page; scroller: HTMLElement | null }) {
  const headings = headingsOf(page)
  const [current, setCurrent] = useState<string | null>(null)

  useEffect(() => {
    if (!scroller) return
    const update = (): void => {
      let active: string | null = null
      for (const heading of headings) {
        const element = document.getElementById(headingAnchor(heading.text))
        if (element && element.getBoundingClientRect().top - scroller.getBoundingClientRect().top < 120) active = headingAnchor(heading.text)
      }
      setCurrent(active ?? (headings[0] ? headingAnchor(headings[0].text) : null))
    }
    update()
    scroller.addEventListener('scroll', update, { passive: true })
    return () => scroller.removeEventListener('scroll', update)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scroller, JSON.stringify(headings)])

  if (headings.length < 2) return null
  return (
    <nav className="doc-toc" aria-label="On this page">
      <div className="doc-toc-title">On this page</div>
      {headings.map((heading, i) => {
        const anchor = headingAnchor(heading.text)
        return (
          <button
            key={i}
            type="button"
            className={clsx('doc-toc-item', heading.level === 3 && 'is-sub', current === anchor && 'is-active')}
            onClick={() => document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          >
            {heading.text}
          </button>
        )
      })}
    </nav>
  )
}

export function PageNav({ neighbours, onOpen }: { neighbours: PageNeighbours; onOpen: (path: string) => void }) {
  if (!neighbours.previous && !neighbours.next) return null
  return (
    <nav className="doc-page-nav">
      {neighbours.previous ? (
        <button type="button" className="doc-page-nav-link" onClick={() => onOpen(neighbours.previous!.path)}>
          <span className="doc-page-nav-label">
            <ArrowLeft className="size-3.5" /> Previous
          </span>
          <span className="doc-page-nav-title">{neighbours.previous.title}</span>
        </button>
      ) : (
        <span />
      )}
      {neighbours.next && (
        <button type="button" className="doc-page-nav-link is-next" onClick={() => onOpen(neighbours.next!.path)}>
          <span className="doc-page-nav-label">
            Next <ArrowRight className="size-3.5" />
          </span>
          <span className="doc-page-nav-title">{neighbours.next.title}</span>
        </button>
      )}
    </nav>
  )
}

/** The blocks of a page, read-only. */
export function PageBody({ page }: { page: Page }) {
  if (page.blocks.length === 0) return <p className="doc-empty-page">This page is empty.</p>
  return (
    <div className="doc-blocks">
      <BlockList blocks={page.blocks} />
    </div>
  )
}
