// UI state: the page shown, its history, edit mode and the theme.
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AppState {
  /** Path of the page shown, null for the home page of the workspace. */
  page: string | null
  /** Heading or block to scroll to once the page is shown. */
  anchor: string | null
  editing: boolean
  back: string[]
  forward: string[]
  /** Active workspace, which `lastPages` are about. */
  repoId: string | null
  /** Page last seen per workspace, reopened at the next launch. */
  lastPages: Record<string, string>
  theme: 'dark' | 'light'
}

export const useApp = create<AppState>()(
  persist(
    () =>
      ({
        page: null,
        anchor: null,
        editing: false,
        back: [],
        forward: [],
        repoId: null,
        lastPages: {},
        theme: 'dark'
      }) as AppState,
    {
      name: 'spring-ui',
      partialize: (s) => ({ lastPages: s.lastPages, theme: s.theme })
    }
  )
)

function remember(page: string | null): Partial<AppState> {
  const { repoId, lastPages } = useApp.getState()
  return repoId && page ? { lastPages: { ...lastPages, [repoId]: page } } : {}
}

/** Shows a page; ask about unsaved changes first (openPageSafely). */
export function openPage(page: string, anchor: string | null = null): void {
  useApp.setState((s) => {
    if (s.page === page) return { anchor }
    return {
      page,
      anchor,
      editing: false,
      back: s.page ? [...s.back, s.page].slice(-50) : s.back,
      forward: [],
      ...remember(page)
    }
  })
}

export function goBack(): void {
  useApp.setState((s) => {
    const previous = s.back.at(-1)
    if (!previous) return s
    return { page: previous, anchor: null, editing: false, back: s.back.slice(0, -1), forward: s.page ? [s.page, ...s.forward] : s.forward, ...remember(previous) }
  })
}

export function goForward(): void {
  useApp.setState((s) => {
    const next = s.forward[0]
    if (!next) return s
    return { page: next, anchor: null, editing: false, back: s.page ? [...s.back, s.page] : s.back, forward: s.forward.slice(1), ...remember(next) }
  })
}

/** Follows a page that moved, in the history too. */
export function retargetPage(from: string, to: string): void {
  const moved = (path: string): string => (path === from ? to : path.startsWith(`${from}/`) ? to + path.slice(from.length) : path)
  useApp.setState((s) => ({
    page: s.page ? moved(s.page) : s.page,
    back: s.back.map(moved),
    forward: s.forward.map(moved),
    ...remember(s.page ? moved(s.page) : null)
  }))
}

export function setEditing(editing: boolean): void {
  useApp.setState({ editing })
}

/** Leaves the pages of the previous workspace. */
export function resetForWorkspace(repoId: string | null): void {
  useApp.setState((s) => ({ repoId, page: repoId ? (s.lastPages[repoId] ?? null) : null, anchor: null, editing: false, back: [], forward: [] }))
}

export function setTheme(theme: 'dark' | 'light'): void {
  document.documentElement.classList.toggle('light', theme === 'light')
  useApp.setState({ theme })
}
