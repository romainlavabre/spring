// IPC contract shared by the main process, the preload script and the renderer.
//
// Every method takes a single object argument (validated with zod in main) and
// is exposed on channel `${domain}:${method}`.
import type { Link, Page, Section } from '../core/blocks/schema'
import type { PageIssue } from '../core/blocks/validate'
import type { SearchHit } from '../core/search'
import type { TreeNode } from '../core/tree'
import type { ConflictChoice, PrintJob, SyncStatus, UpdateStatus, WorkspaceRepo, WorkspaceState } from './types'

export interface AppInfo {
  version: string
  platform: string
}

export interface Api {
  workspace: {
    state(): Promise<WorkspaceState>
    clone(args: { name: string; remoteUrl: string; path?: string }): Promise<WorkspaceRepo>
    open(args: { name: string; path: string }): Promise<WorkspaceRepo>
    create(args: { name: string; path?: string }): Promise<WorkspaceRepo>
    rename(args: { repoId: string; name: string }): Promise<WorkspaceState>
    remove(args: { repoId: string; deleteFiles: boolean }): Promise<WorkspaceState>
    activate(args: { repoId: string }): Promise<WorkspaceState>
    setRemote(args: { repoId: string; remoteUrl: string }): Promise<WorkspaceRepo>
    status(args: { repoId: string }): Promise<SyncStatus>
    sync(args: { repoId: string }): Promise<SyncStatus>
    resolveConflicts(args: { repoId: string; choices: Record<string, ConflictChoice> }): Promise<SyncStatus>
  }
  /** Documentation of the active workspace. Paths are relative to the sections folder, e.g. "infra/kubernetes". */
  docs: {
    tree(): Promise<TreeNode[]>
    getPage(args: { path: string }): Promise<Page>
    /** Raw JSON of a page, readable even when the page does not validate. */
    getPageSource(args: { path: string }): Promise<string>
    createPage(args: { parent: string; page: Page }): Promise<string>
    savePage(args: { path: string; page: Page }): Promise<string>
    savePageSource(args: { path: string; source: string }): Promise<string>
    duplicatePage(args: { path: string }): Promise<string>
    /** Issues of a page against the workspace (links, assets); empty when valid. */
    validate(args: { page: unknown }): Promise<PageIssue[]>
    getSection(args: { path: string }): Promise<Section>
    createSection(args: { parent: string; section: Section }): Promise<string>
    saveSection(args: { path: string; section: Section }): Promise<string>
    getLink(args: { path: string }): Promise<Link>
    createLink(args: { parent: string; link: Link }): Promise<string>
    saveLink(args: { path: string; link: Link }): Promise<string>
    remove(args: { path: string }): Promise<void>
    /** Moves a node into `parent`, before the sibling `before` (at the end when null); returns its new path. */
    move(args: { from: string; parent: string; before: string | null }): Promise<string>
    search(args: { query: string }): Promise<SearchHit[]>
    /** CSS of the workspace (theme.css), empty when there is none. */
    theme(): Promise<string>
  }
  assets: {
    list(): Promise<string[]>
    /** Adds an image (pasted or dropped) to the workspace; returns its asset name. */
    add(args: { name: string; base64: string }): Promise<string>
    /** Asks for an image file and adds it; null when cancelled. */
    pick(): Promise<string | null>
  }
  exporter: {
    /** Exports a page, or every page of a section, as a PDF chosen in a save dialog; returns the file, null when cancelled. */
    pdf(args: { path: string }): Promise<string | null>
    /** Opens a PDF exported in this session with the default viewer. */
    open(args: { file: string }): Promise<void>
    /** Shows a PDF exported in this session in the file manager. */
    reveal(args: { file: string }): Promise<void>
  }
  print: {
    /** What a print window renders. */
    job(args: { token: string }): Promise<PrintJob>
  }
  dialog: {
    openDirectory(args: { title: string }): Promise<string | null>
  }
  app: {
    info(): Promise<AppInfo>
    /** Closes the window, once the renderer dealt with the unsaved changes. */
    close(): Promise<void>
    /** Opens an external link of the menu in the browser. */
    openExternal(args: { url: string }): Promise<void>
  }
  update: {
    status(): Promise<UpdateStatus>
    /** Downloads and installs the latest version (a system window asks for the password of a .deb). */
    install(): Promise<void>
    /** Opens a terminal ready to run install.sh; `copied` when there was none and the command went to the clipboard. */
    openTerminal(): Promise<{ command: string; copied: boolean }>
    restart(): Promise<void>
  }
}

/** Events pushed from the main process. */
export interface ApiEvents {
  'workspace:status': SyncStatus
  'workspace:changed': WorkspaceState
  /** Files of the active workspace changed outside the app (MCP server, editor, git). */
  'workspace:files': { repoId: string }
  'update:status': UpdateStatus
  /** The window is about to close: the renderer asks about unsaved changes, then calls app.close. */
  'app:close-requested': Record<string, never>
}

export const API_EVENTS: (keyof ApiEvents)[] = ['workspace:status', 'workspace:changed', 'workspace:files', 'update:status', 'app:close-requested']

/** Method names per domain, used by the preload script to build the bridge. */
export const API_METHODS: { [D in keyof Api]: (keyof Api[D])[] } = {
  workspace: ['state', 'clone', 'open', 'create', 'rename', 'remove', 'activate', 'setRemote', 'status', 'sync', 'resolveConflicts'],
  docs: [
    'tree',
    'getPage',
    'getPageSource',
    'createPage',
    'savePage',
    'savePageSource',
    'duplicatePage',
    'validate',
    'getSection',
    'createSection',
    'saveSection',
    'getLink',
    'createLink',
    'saveLink',
    'remove',
    'move',
    'search',
    'theme'
  ],
  assets: ['list', 'add', 'pick'],
  exporter: ['pdf', 'open', 'reveal'],
  print: ['job'],
  dialog: ['openDirectory'],
  app: ['info', 'close', 'openExternal'],
  update: ['status', 'install', 'openTerminal', 'restart']
}

export interface Bridge {
  api: Api
  on<E extends keyof ApiEvents>(event: E, listener: (payload: ApiEvents[E]) => void): () => void
}

/** Error message format used across IPC: Electron prefixes errors, the renderer strips it. */
export function cleanIpcError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

/** URL of an image of a workspace, served by the main process. */
export function assetUrl(base: string, name: string): string {
  return `${base}/${encodeURIComponent(name)}`
}
