// Types shared by the main process and the renderer.

/** A workspace: a git repository (or a plain folder) holding documentation. */
export interface WorkspaceRepo {
  id: string
  name: string
  /** Absolute path of the local clone. */
  path: string
  remoteUrl?: string
}

export interface WorkspaceState {
  repos: WorkspaceRepo[]
  activeRepoId: string | null
}

export interface SyncStatus {
  repoId: string
  isGitRepo: boolean
  hasRemote: boolean
  branch: string | null
  ahead: number
  behind: number
  dirty: boolean
  syncing: boolean
  /** Files in conflict with the remote after the last sync attempt. */
  conflicts: string[]
  lastSyncAt: number | null
  error: string | null
}

export type ConflictChoice = 'mine' | 'theirs'

// -------------------------------------------------------------------- update

/** How the running app was installed: decides how it can update itself. */
export type InstallKind = 'deb' | 'appimage' | 'unknown'

export interface UpdateStatus {
  current: string
  /** Latest published version when it is newer than the running one. */
  latest: string | null
  notesUrl: string | null
  kind: InstallKind
  state: 'idle' | 'available' | 'installing' | 'installed' | 'error'
  error: string | null
}

// -------------------------------------------------------------------- export

/** What the print window renders: pages of one workspace, already read. */
export interface PrintJob {
  title: string
  /** Shown on the cover page of a section export. */
  subtitle?: string
  cover: boolean
  pages: { path: string; page: import('../core/blocks/schema').Page }[]
  /** CSS of the workspace (theme.css). */
  theme: string
  /** Base URL of the workspace assets. */
  assetBase: string
}
