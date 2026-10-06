// Reads and writes the documentation of a workspace folder:
//
//   sections/<section>/section.yaml          title, icon, order
//   sections/<section>/<page>.page.json      a page: title and blocks
//   sections/<section>/<link>.link.yaml      an external link of the menu
//   sections/<section>/<sub-section>/…       any depth; pages and links may sit at the root too
//   assets/<file>                            images
//
// Shared by the app, the CLI and the MCP server. Methods return the files they
// changed (relative to the workspace root) so the app can commit them.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join, relative, resolve, sep } from 'node:path'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { linkSchema, sectionSchema, type Link, type Page, type Section } from '../blocks/schema'
import { rewritePageLinks } from '../blocks/ops'
import { assertValidPage, validatePage, zodIssues, formatIssues, type ValidationResult } from '../blocks/validate'
import { slugify, uniqueSlug } from '../slug'
import { baseName, joinPath, parentPath, type TreeNode } from '../tree'
import { stableJson } from './json'
import { ASSETS_DIR, SECTIONS_DIR, THEME_FILE } from './workspace'

export const PAGE_EXT = '.page.json'
export const LINK_EXT = '.link.yaml'
export const SECTION_FILE = 'section.yaml'

const SEGMENT = /^[a-z0-9][a-z0-9-]{0,79}$/
const ORDER_STEP = 10

export type NodeKind = 'section' | 'page' | 'link'

/** Files a write changed, relative to the workspace root (deleted ones included). */
export interface Written {
  path: string
  paths: string[]
}

export class DocStore {
  readonly sectionsDir: string
  readonly assetsDir: string

  constructor(readonly root: string) {
    this.sectionsDir = join(root, SECTIONS_DIR)
    this.assetsDir = join(root, ASSETS_DIR)
  }

  // ---------------------------------------------------------------- paths

  /** Checks a node path ("infra/kubernetes"): '' is the root of the menu. */
  static checkPath(path: string): string {
    if (path === '') return ''
    const parts = path.split('/')
    for (const part of parts) {
      if (!SEGMENT.test(part)) throw new Error(`Invalid path "${path}": segments are lowercase letters, digits and dashes`)
    }
    return path
  }

  private abs(path: string): string {
    return join(this.sectionsDir, ...DocStore.checkPath(path).split('/').filter(Boolean))
  }

  private rel(file: string): string {
    return relative(this.root, file).split(sep).join('/')
  }

  private fileOf(path: string, kind: NodeKind): string {
    const base = this.abs(path)
    if (kind === 'page') return base + PAGE_EXT
    if (kind === 'link') return base + LINK_EXT
    return join(base, SECTION_FILE)
  }

  kindOf(path: string): NodeKind | null {
    if (path === '') return 'section'
    const base = this.abs(path)
    if (existsSync(base + PAGE_EXT)) return 'page'
    if (existsSync(base + LINK_EXT)) return 'link'
    if (existsSync(base) && statSync(base).isDirectory()) return 'section'
    return null
  }

  private requireKind(path: string, kind: NodeKind): void {
    const actual = this.kindOf(path)
    if (actual !== kind) throw new Error(actual ? `"${path}" is a ${actual}, not a ${kind}` : `No ${kind} "${path}"`)
  }

  private taken(parent: string, name: string): boolean {
    return this.kindOf(joinPath(parent, name)) !== null || name === 'section'
  }

  private freeName(parent: string, wanted: string): string {
    return uniqueSlug(slugify(wanted).slice(0, 60), (name) => this.taken(parent, name))
  }

  pageExists(path: string): boolean {
    try {
      return this.kindOf(path) === 'page'
    } catch {
      return false
    }
  }

  // ----------------------------------------------------------------- tree

  tree(parent = ''): TreeNode[] {
    const dir = this.abs(parent)
    if (!existsSync(dir)) return []
    const nodes: TreeNode[] = []
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const name = entry.name
      if (entry.isDirectory()) {
        if (!SEGMENT.test(name)) continue
        const path = joinPath(parent, name)
        const meta = this.readSectionLoose(path)
        nodes.push({ kind: 'section', path, ...meta, order: meta.order ?? Infinity, children: this.tree(path) })
      } else if (name.endsWith(PAGE_EXT)) {
        const slug = name.slice(0, -PAGE_EXT.length)
        if (!SEGMENT.test(slug)) continue
        const path = joinPath(parent, slug)
        const meta = this.readPageMetaLoose(path)
        nodes.push({ kind: 'page', path, ...meta, order: meta.order ?? Infinity })
      } else if (name.endsWith(LINK_EXT)) {
        const slug = name.slice(0, -LINK_EXT.length)
        if (!SEGMENT.test(slug)) continue
        const path = joinPath(parent, slug)
        const link = this.readLinkLoose(path)
        nodes.push({ kind: 'link', path, ...link, order: link.order ?? Infinity })
      }
    }
    return nodes.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
  }

  /** Title and order even from a file that does not validate: the menu must always show it. */
  private readSectionLoose(path: string): { title: string; description?: string; icon?: string; order?: number } {
    try {
      return this.readSection(path)
    } catch {
      return { title: baseName(path) }
    }
  }

  private readPageMetaLoose(path: string): { title: string; description?: string; icon?: string; order?: number } {
    try {
      const raw = JSON.parse(readFileSync(this.fileOf(path, 'page'), 'utf8')) as Partial<Page>
      return {
        title: typeof raw.title === 'string' && raw.title.trim() ? raw.title : baseName(path),
        description: typeof raw.description === 'string' ? raw.description : undefined,
        icon: typeof raw.icon === 'string' ? raw.icon : undefined,
        order: typeof raw.order === 'number' ? raw.order : undefined
      }
    } catch {
      return { title: baseName(path) }
    }
  }

  private readLinkLoose(path: string): Link {
    try {
      return this.readLink(path)
    } catch {
      return { title: baseName(path), url: 'about:blank' }
    }
  }

  // --------------------------------------------------------------- pages

  /** The raw JSON of a page, even when it does not validate (to repair it). */
  readPageSource(path: string): string {
    this.requireKind(path, 'page')
    return readFileSync(this.fileOf(path, 'page'), 'utf8')
  }

  readPage(path: string): Page {
    const source = this.readPageSource(path)
    let raw: unknown
    try {
      raw = JSON.parse(source)
    } catch (error) {
      throw new Error(`Page "${path}" is not valid JSON: ${(error as Error).message}`)
    }
    const result = validatePage(raw)
    if (!result.ok) throw new Error(`Page "${path}" is invalid:\n${formatIssues(result.issues)}`)
    return result.page
  }

  allPages(): { path: string; page: Page }[] {
    const pages: { path: string; page: Page }[] = []
    const walk = (nodes: TreeNode[]): void => {
      for (const node of nodes) {
        if (node.kind === 'section') walk(node.children)
        else if (node.kind === 'page') {
          try {
            pages.push({ path: node.path, page: this.readPage(node.path) })
          } catch {
            // An invalid page is left out of search and link rewriting.
          }
        }
      }
    }
    walk(this.tree())
    return pages
  }

  /** Validates a page against this workspace: links to pages and assets must exist. */
  validate(page: unknown): ValidationResult {
    return validatePage(page, { pageExists: (p) => this.pageExists(p), assetExists: (a) => this.assetExists(a) })
  }

  private checked(page: unknown): Page {
    return assertValidPage(page, { pageExists: (p) => this.pageExists(p), assetExists: (a) => this.assetExists(a) })
  }

  createPage(parent: string, page: Page, slug?: string): Written {
    this.requireKind(parent, 'section')
    const valid = this.checked({ ...page, order: page.order ?? this.nextOrder(parent) })
    const path = joinPath(parent, this.freeName(parent, slug || page.title))
    const file = this.fileOf(path, 'page')
    mkdirSync(this.abs(parent), { recursive: true })
    writeFileSync(file, stableJson(valid))
    return { path, paths: [this.rel(file)] }
  }

  writePage(path: string, page: Page): Written {
    this.requireKind(path, 'page')
    const file = this.fileOf(path, 'page')
    writeFileSync(file, stableJson(this.checked(page)))
    return { path, paths: [this.rel(file)] }
  }

  // ------------------------------------------------------------ sections

  readSection(path: string): Section {
    if (path === '') return { title: 'Root' }
    this.requireKind(path, 'section')
    const file = this.fileOf(path, 'section')
    if (!existsSync(file)) return { title: baseName(path) }
    const parsed = sectionSchema.safeParse(parseYaml(readFileSync(file, 'utf8')) ?? {})
    if (!parsed.success) throw new Error(`Section "${path}" is invalid:\n${formatIssues(zodIssues(parsed.error))}`)
    return parsed.data
  }

  createSection(parent: string, section: Section, slug?: string): Written {
    this.requireKind(parent, 'section')
    const valid = sectionSchema.parse({ ...section, order: section.order ?? this.nextOrder(parent) })
    const path = joinPath(parent, this.freeName(parent, slug || section.title))
    mkdirSync(this.abs(path), { recursive: true })
    const file = this.fileOf(path, 'section')
    writeFileSync(file, stringifyYaml(valid))
    return { path, paths: [this.rel(file)] }
  }

  writeSection(path: string, section: Section): Written {
    this.requireKind(path, 'section')
    if (path === '') throw new Error('The root of the menu has no settings')
    const file = this.fileOf(path, 'section')
    writeFileSync(file, stringifyYaml(sectionSchema.parse(section)))
    return { path, paths: [this.rel(file)] }
  }

  // --------------------------------------------------------------- links

  readLink(path: string): Link {
    this.requireKind(path, 'link')
    const parsed = linkSchema.safeParse(parseYaml(readFileSync(this.fileOf(path, 'link'), 'utf8')) ?? {})
    if (!parsed.success) throw new Error(`Link "${path}" is invalid:\n${formatIssues(zodIssues(parsed.error))}`)
    return parsed.data
  }

  createLink(parent: string, link: Link, slug?: string): Written {
    this.requireKind(parent, 'section')
    const valid = linkSchema.parse({ ...link, order: link.order ?? this.nextOrder(parent) })
    const path = joinPath(parent, this.freeName(parent, slug || link.title))
    mkdirSync(this.abs(parent), { recursive: true })
    const file = this.fileOf(path, 'link')
    writeFileSync(file, stringifyYaml(valid))
    return { path, paths: [this.rel(file)] }
  }

  writeLink(path: string, link: Link): Written {
    this.requireKind(path, 'link')
    const file = this.fileOf(path, 'link')
    writeFileSync(file, stringifyYaml(linkSchema.parse(link)))
    return { path, paths: [this.rel(file)] }
  }

  // ------------------------------------------------------ remove and move

  remove(path: string): Written {
    if (path === '') throw new Error('The root of the menu cannot be removed')
    const kind = this.kindOf(path)
    if (!kind) throw new Error(`Nothing at "${path}"`)
    const target = kind === 'section' ? this.abs(path) : this.fileOf(path, kind)
    const removed = this.rel(target)
    rmSync(target, { recursive: true, force: true })
    return { path, paths: [removed] }
  }

  private nextOrder(parent: string): number {
    const orders = this.tree(parent)
      .map((n) => n.order)
      .filter(Number.isFinite)
    return (orders.length ? Math.max(...orders) : 0) + ORDER_STEP
  }

  private setOrder(path: string, order: number): string | null {
    const kind = this.kindOf(path)
    if (kind === 'page') {
      const file = this.fileOf(path, 'page')
      try {
        const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
        if (raw.order === order) return null
        writeFileSync(file, stableJson({ ...raw, order }))
        return this.rel(file)
      } catch {
        return null
      }
    }
    if (kind === 'link' || kind === 'section') {
      const file = this.fileOf(path, kind)
      const raw = (existsSync(file) ? (parseYaml(readFileSync(file, 'utf8')) as Record<string, unknown>) : null) ?? { title: baseName(path) }
      if (raw.order === order) return null
      writeFileSync(file, stringifyYaml({ ...raw, order }))
      return this.rel(file)
    }
    return null
  }

  /**
   * Moves a node into `parent`, before the sibling `before` (at the end when
   * null), renumbering the siblings. Links to the moved pages are rewritten in
   * every page of the workspace.
   */
  move(from: string, parent: string, before: string | null): Written {
    const kind = this.kindOf(from)
    if (!kind || from === '') throw new Error(`Nothing at "${from}"`)
    this.requireKind(parent, 'section')
    if (kind === 'section' && (parent === from || parent.startsWith(`${from}/`))) throw new Error('A section cannot move inside itself')
    const paths = new Set<string>()

    let path = from
    if (parentPath(from) !== parent) {
      path = joinPath(parent, this.freeName(parent, baseName(from)))
      const source = kind === 'section' ? this.abs(from) : this.fileOf(from, kind)
      const target = kind === 'section' ? this.abs(path) : this.fileOf(path, kind)
      mkdirSync(this.abs(parent), { recursive: true })
      renameSync(source, target)
      paths.add(this.rel(source))
      paths.add(this.rel(target))
      if (kind !== 'link') for (const changed of this.rewriteLinks(from, path)) paths.add(changed)
    }

    const siblings = this.tree(parent)
      .map((n) => n.path)
      .filter((p) => p !== path)
    const index = before ? siblings.indexOf(before) : -1
    siblings.splice(index >= 0 ? index : siblings.length, 0, path)
    siblings.forEach((sibling, i) => {
      const changed = this.setOrder(sibling, (i + 1) * ORDER_STEP)
      if (changed) paths.add(changed)
    })
    return { path, paths: [...paths] }
  }

  /** Points the `page:` links of every page from `from` (a page or a section) to `to`. */
  private rewriteLinks(from: string, to: string): string[] {
    const changed: string[] = []
    for (const { path, page } of this.allPages()) {
      const next = rewritePageLinks(page, from, to)
      if (JSON.stringify(next) === JSON.stringify(page)) continue
      const file = this.fileOf(path, 'page')
      writeFileSync(file, stableJson(next))
      changed.push(this.rel(file))
    }
    return changed
  }

  // -------------------------------------------------------------- assets

  assetExists(name: string): boolean {
    return /^[A-Za-z0-9][\w.-]*$/.test(name) && existsSync(join(this.assetsDir, name))
  }

  listAssets(): string[] {
    if (!existsSync(this.assetsDir)) return []
    return readdirSync(this.assetsDir)
      .filter((name) => !name.startsWith('.'))
      .sort()
  }

  /** Absolute file of an asset, refusing names that leave the assets folder. */
  assetFile(name: string): string {
    const file = resolve(this.assetsDir, name)
    if (!file.startsWith(resolve(this.assetsDir) + sep)) throw new Error(`Invalid asset name "${name}"`)
    return file
  }

  /** Copies a file, or writes data, into the assets folder under a free name. */
  addAsset(source: { file: string } | { name: string; data: Buffer }): Written {
    const original = 'file' in source ? basename(source.file) : source.name
    const extension = extname(original).toLowerCase().replace(/[^.a-z0-9]/g, '')
    if (!/^\.(png|jpe?g|gif|webp|svg|avif)$/.test(extension)) throw new Error(`Unsupported image type "${extension || original}"`)
    const stem = slugify(original.slice(0, original.length - extname(original).length))
    mkdirSync(this.assetsDir, { recursive: true })
    const name = uniqueSlug(stem, (s) => existsSync(join(this.assetsDir, s + extension))) + extension
    const target = join(this.assetsDir, name)
    if ('file' in source) copyFileSync(source.file, target)
    else writeFileSync(target, source.data)
    return { path: name, paths: [this.rel(target)] }
  }

  // --------------------------------------------------------------- theme

  /** The workspace CSS, empty when there is none. */
  theme(): string {
    const file = join(this.root, THEME_FILE)
    return existsSync(file) ? readFileSync(file, 'utf8') : ''
  }
}
