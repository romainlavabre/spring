// Queries on the documentation of the active workspace.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { pagesInOrder, type TreeNode } from '@core/tree'
import { api } from '../../lib/bridge'
import { CONTENT_KEYS, useActiveRepo } from '../workspace/useWorkspace'

export function useTree() {
  const repo = useActiveRepo()
  return useQuery({ queryKey: ['tree', repo?.id], queryFn: () => api.docs.tree(), enabled: !!repo })
}

export function usePage(path: string | null) {
  const repo = useActiveRepo()
  return useQuery({ queryKey: ['page', repo?.id, path], queryFn: () => api.docs.getPage({ path: path! }), enabled: !!repo && !!path })
}

export function useTheme() {
  const repo = useActiveRepo()
  return useQuery({ queryKey: ['theme', repo?.id], queryFn: () => api.docs.theme(), enabled: !!repo })
}

/** Refreshes everything read from the workspace, after a change. */
export function useRefresh(): () => Promise<void> {
  const queryClient = useQueryClient()
  return async () => {
    await Promise.all(CONTENT_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })))
  }
}

/** The page shown when none is chosen: the first of the menu. */
export function homePage(tree: TreeNode[] | undefined): string | null {
  return tree ? (pagesInOrder(tree)[0]?.path ?? null) : null
}

/** Titles of the sections above a path. */
export function trailOf(tree: TreeNode[], path: string): string[] {
  const titles: string[] = []
  let level = tree
  const parts = path.split('/')
  for (let i = 1; i < parts.length; i++) {
    const sectionPath = parts.slice(0, i).join('/')
    const section = level.find((node) => node.kind === 'section' && node.path === sectionPath)
    if (!section || section.kind !== 'section') break
    titles.push(section.title)
    level = section.children
  }
  return titles
}
