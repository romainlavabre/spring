// PDF export: a hidden window renders the pages with the same components as
// the app (print styles unfold tabs and collapsible blocks), then Chromium
// prints it.
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import type { Page } from '@core/blocks/schema'
import { DocStore } from '@core/layout/store'
import { flattenTree, type TreeNode } from '@core/tree'
import type { PrintJob } from '@shared/types'
import type { AssetRoots } from './assets'

const READY_TIMEOUT_MS = 60_000

/** The pages of a page or a section path, in menu order, with the job's title. */
export function printJobFor(store: DocStore, path: string, assetBase: string, workspaceName: string): PrintJob {
  const kind = store.kindOf(path)
  if (kind === 'page') {
    const page = store.readPage(path)
    return { title: page.title, cover: false, pages: [{ path, page }], theme: store.theme(), assetBase }
  }
  if (kind !== 'section') throw new Error(kind ? `A ${kind} cannot be exported` : `Nothing at "${path}"`)
  const nodes: TreeNode[] = store.tree(path)
  const pages: { path: string; page: Page }[] = flattenTree(nodes)
    .filter((node) => node.kind === 'page')
    .map((node) => ({ path: node.path, page: store.readPage(node.path) }))
  if (pages.length === 0) throw new Error('This section has no page to export')
  const section = path === '' ? { title: workspaceName } : store.readSection(path)
  return { title: section.title, subtitle: section.description ?? workspaceName, cover: true, pages, theme: store.theme(), assetBase }
}

export class PdfExporter {
  private readonly jobs = new Map<string, PrintJob>()

  constructor(
    private readonly assets: AssetRoots,
    private readonly rendererUrl: () => { file: string } | { url: string }
  ) {}

  job(token: string): PrintJob {
    const job = this.jobs.get(token)
    if (!job) throw new Error('Unknown print job')
    return job
  }

  /** Prints the path of the workspace at `root` to `file`. */
  async export(root: string, path: string, file: string, workspaceName: string): Promise<void> {
    const store = new DocStore(root)
    const assetBase = this.assets.base(root)
    const job = printJobFor(store, path, assetBase, workspaceName)
    const token = randomUUID()
    this.jobs.set(token, job)
    const window = new BrowserWindow({
      show: false,
      width: 1100,
      height: 1400,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        // Hidden windows are throttled otherwise: diagrams would take ages to render.
        backgroundThrottling: false
      }
    })
    try {
      const target = this.rendererUrl()
      if ('url' in target) await window.loadURL(`${target.url}?print=${token}`)
      else await window.loadFile(target.file, { query: { print: token } })
      await waitUntilReady(window)
      const pdf = await window.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        margins: { top: 0.55, bottom: 0.65, left: 0.55, right: 0.55 },
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate: `<div style="width:100%;font-size:8px;color:#8b93a4;padding:0 36px;display:flex;justify-content:space-between;font-family:sans-serif"><span>${escapeHtml(job.title)}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`
      })
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, pdf)
    } finally {
      this.jobs.delete(token)
      window.destroy()
    }
  }
}

/** The print view sets `window.springPrintReady` once code, diagrams and images are rendered. */
async function waitUntilReady(window: BrowserWindow): Promise<void> {
  const started = Date.now()
  for (;;) {
    const state = (await window.webContents.executeJavaScript('window.springPrintReady ?? null').catch(() => null)) as string | boolean | null
    if (state === true) return
    if (typeof state === 'string') throw new Error(`The export failed: ${state}`)
    if (Date.now() - started > READY_TIMEOUT_MS) throw new Error('The export timed out while rendering the pages')
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)
}

export function defaultPdfName(title: string): string {
  return `${title.replace(/[/\\:*?"<>|]+/g, '-').trim() || 'export'}.pdf`
}

export function downloadsDir(): string {
  try {
    return app.getPath('downloads')
  } catch {
    return app.getPath('home')
  }
}
