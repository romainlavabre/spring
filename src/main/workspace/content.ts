// Documentation of the active workspace. Every change is committed with its
// own message, then pushed in the background by the workspace manager.
import type { Link, Page, Section } from '@core/blocks/schema'
import type { PageIssue } from '@core/blocks/validate'
import { DocStore, type Written } from '@core/layout/store'
import { searchPages, type SearchHit } from '@core/search'
import { baseName, type TreeNode } from '@core/tree'
import type { WorkspaceManager } from './manager'

export class ContentService {
  constructor(private readonly workspace: WorkspaceManager) {}

  store(): DocStore {
    return new DocStore(this.workspace.active().path)
  }

  private change(describe: (store: DocStore) => { written: Written; message: string }): Promise<string> {
    const repo = this.workspace.active()
    return this.workspace.change(repo, () => {
      const { written, message } = describe(new DocStore(repo.path))
      return { result: written.path, paths: written.paths, message }
    })
  }

  tree(): TreeNode[] {
    return this.store().tree()
  }

  // ---------------------------------------------------------------- pages

  getPage(path: string): Page {
    return this.store().readPage(path)
  }

  getPageSource(path: string): string {
    return this.store().readPageSource(path)
  }

  createPage(parent: string, page: Page): Promise<string> {
    return this.change((store) => ({ written: store.createPage(parent, page), message: `Add page "${page.title}"` }))
  }

  savePage(path: string, page: Page): Promise<string> {
    return this.change((store) => ({ written: store.writePage(path, page), message: `Update page "${page.title}"` }))
  }

  /** Saves the raw JSON of a page, as typed in the source editor. */
  savePageSource(path: string, source: string): Promise<string> {
    let raw: unknown
    try {
      raw = JSON.parse(source)
    } catch (error) {
      throw new Error(`Invalid JSON: ${(error as Error).message}`)
    }
    return this.savePage(path, raw as Page)
  }

  duplicatePage(path: string): Promise<string> {
    return this.change((store) => {
      const page = store.readPage(path)
      const copy = { ...page, title: `${page.title} (copy)`, order: undefined }
      const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
      const written = store.createPage(parent, copy, `${baseName(path)}-copy`)
      // Right after the original.
      const siblings = store.tree(parent).map((n) => n.path)
      const next = siblings[siblings.indexOf(path) + 1]
      const moved = store.move(written.path, parent, next && next !== written.path ? next : null)
      return { written: { path: written.path, paths: [...written.paths, ...moved.paths] }, message: `Duplicate page "${page.title}"` }
    })
  }

  validate(page: unknown): PageIssue[] {
    const result = this.store().validate(page)
    return result.ok ? [] : result.issues
  }

  search(query: string): SearchHit[] {
    return searchPages(this.store().allPages(), query)
  }

  // ------------------------------------------------------------ sections

  getSection(path: string): Section {
    return this.store().readSection(path)
  }

  createSection(parent: string, section: Section): Promise<string> {
    return this.change((store) => ({ written: store.createSection(parent, section), message: `Add section "${section.title}"` }))
  }

  saveSection(path: string, section: Section): Promise<string> {
    return this.change((store) => ({ written: store.writeSection(path, section), message: `Update section "${section.title}"` }))
  }

  // --------------------------------------------------------------- links

  getLink(path: string): Link {
    return this.store().readLink(path)
  }

  createLink(parent: string, link: Link): Promise<string> {
    return this.change((store) => ({ written: store.createLink(parent, link), message: `Add link "${link.title}"` }))
  }

  saveLink(path: string, link: Link): Promise<string> {
    return this.change((store) => ({ written: store.writeLink(path, link), message: `Update link "${link.title}"` }))
  }

  // ------------------------------------------------------ remove and move

  async remove(path: string): Promise<void> {
    await this.change((store) => {
      const node = store.tree(path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '').find((n) => n.path === path)
      const label = node ? `${node.kind} "${node.title}"` : `"${path}"`
      return { written: store.remove(path), message: `Remove ${label}` }
    })
  }

  move(from: string, parent: string, before: string | null): Promise<string> {
    return this.change((store) => {
      const written = store.move(from, parent, before)
      const where = written.path === from ? 'Reorder' : 'Move'
      return { written, message: `${where} "${baseName(from)}"${written.path === from ? '' : ` to "${parent || 'the root'}"`}` }
    })
  }

  // -------------------------------------------------------------- assets

  listAssets(): string[] {
    return this.store().listAssets()
  }

  addAsset(source: { file: string } | { name: string; data: Buffer }): Promise<string> {
    return this.change((store) => {
      const written = store.addAsset(source)
      return { written, message: `Add image "${written.path}"` }
    })
  }

  theme(): string {
    return this.store().theme()
  }
}
