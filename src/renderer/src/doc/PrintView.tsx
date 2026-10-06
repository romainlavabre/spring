// What the PDF export prints: a cover and a contents page for a section,
// then each page, light colors, everything unfolded. Sets
// window.springPrintReady once code, diagrams and images are rendered.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PrintJob } from '@shared/types'
import { api, errorMessage } from '../lib/bridge'
import { DocProvider, type DocEnvironment } from './context'
import { PageBody, PageHeader } from './PageView'

declare global {
  interface Window {
    springPrintReady?: boolean | string
  }
}

export function PrintView({ token }: { token: string }) {
  const [job, setJob] = useState<PrintJob | null>(null)
  const pendingCount = useRef(0)
  const [settled, setSettled] = useState(0)

  useEffect(() => {
    document.documentElement.classList.add('light', 'printing')
    api.print
      .job({ token })
      .then(setJob)
      .catch((error: unknown) => {
        window.springPrintReady = errorMessage(error)
      })
  }, [token])

  const pending = useCallback(() => {
    pendingCount.current++
    let done = false
    return () => {
      if (done) return
      done = true
      pendingCount.current--
      setSettled((n) => n + 1)
    }
  }, [])

  const environment = useMemo<DocEnvironment>(
    () => ({ assetBase: job?.assetBase ?? '', openExternal: () => undefined, printing: true, dark: false, pending }),
    [job?.assetBase, pending]
  )

  // Ready once nothing renders any more and the images are loaded.
  useEffect(() => {
    if (!job) return
    let cancelled = false
    const timer = setTimeout(() => {
      if (cancelled || pendingCount.current > 0) return
      const images = [...document.images].filter((image) => !image.complete)
      const loaded = (image: HTMLImageElement): Promise<unknown> =>
        new Promise((resolve) => {
          image.addEventListener('load', resolve)
          image.addEventListener('error', resolve)
        })
      void Promise.all(images.map(loaded))
        .then(() => document.fonts.ready)
        .then(() => {
          if (!cancelled && pendingCount.current === 0) window.springPrintReady = true
        })
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [job, settled])

  if (!job) return null
  return (
    <DocProvider value={environment}>
      <style>{job.theme}</style>
      <div className="doc-print">
        {job.cover && (
          <section className="doc-print-cover">
            <div className="doc-print-cover-bar" />
            <div className="doc-print-cover-title">{job.title}</div>
            {job.subtitle && <div className="doc-print-cover-subtitle">{job.subtitle}</div>}
            <div className="doc-print-cover-date">{new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
            <ol className="doc-print-contents">
              {job.pages.map(({ path, page }, i) => (
                <li key={path}>
                  <span className="doc-print-contents-number">{String(i + 1).padStart(2, '0')}</span>
                  <span>
                    <span className="doc-print-contents-title">{page.title}</span>
                    {page.description && <span className="doc-print-contents-description">{page.description}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}
        {job.pages.map(({ path, page }) => (
          <article key={path} className="doc-print-page doc-page">
            <PageHeader page={page} />
            <PageBody page={page} />
          </article>
        ))}
      </div>
    </DocProvider>
  )
}
