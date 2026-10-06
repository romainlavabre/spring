// Data hooks for the workspace registry and its sync status.
import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { create } from 'zustand'
import type { SyncStatus, WorkspaceState } from '@shared/types'
import { api, onEvent } from '../../lib/bridge'
import { clearDrafts } from '../../lib/drafts'
import { resetForWorkspace } from '../../store'

export function useWorkspace() {
  return useQuery({ queryKey: ['workspace'], queryFn: () => api.workspace.state(), staleTime: Infinity })
}

export function useActiveRepo() {
  const { data } = useWorkspace()
  return data?.repos.find((r) => r.id === data.activeRepoId) ?? null
}

const useStatuses = create<Record<string, SyncStatus>>(() => ({}))

export function useSyncStatus(repoId: string | null | undefined): SyncStatus | null {
  return useStatuses((s) => (repoId ? (s[repoId] ?? null) : null))
}

/** Query keys holding workspace content, refreshed after a pull. */
export const CONTENT_KEYS = [['tree'], ['page'], ['page-source'], ['section'], ['link'], ['theme'], ['assets'], ['search']]

/** Subscribes to status events and refreshes the active repo status periodically. */
export function useWorkspaceStatus(): void {
  const queryClient = useQueryClient()
  const { data } = useWorkspace()
  const activeRepoId = data?.activeRepoId

  // The page shown and its history belong to the active workspace.
  useEffect(() => {
    if (data) resetForWorkspace(activeRepoId ?? null)
  }, [activeRepoId, data])

  useEffect(
    () =>
      onEvent('workspace:status', (status) => {
        const previous = useStatuses.getState()[status.repoId]
        useStatuses.setState({ [status.repoId]: status })
        // A pull may have brought new pages.
        if (previous?.syncing && !status.syncing) {
          for (const queryKey of CONTENT_KEYS) void queryClient.invalidateQueries({ queryKey })
        }
      }),
    [queryClient]
  )

  useEffect(
    () =>
      onEvent('workspace:changed', (state) => {
        const previous = queryClient.getQueryData<WorkspaceState>(['workspace'])
        queryClient.setQueryData(['workspace'], state)
        // Unsaved changes belong to the pages of the previous workspace.
        if (previous?.activeRepoId !== state.activeRepoId) {
          clearDrafts()
          for (const queryKey of CONTENT_KEYS) void queryClient.removeQueries({ queryKey })
        }
      }),
    [queryClient]
  )

  useEffect(
    () =>
      onEvent('workspace:files', () => {
        // The editor keeps its unsaved changes: it only takes new data when clean.
        for (const queryKey of CONTENT_KEYS) void queryClient.invalidateQueries({ queryKey })
      }),
    [queryClient]
  )

  useEffect(() => {
    if (!activeRepoId) return
    void api.workspace.sync({ repoId: activeRepoId }).catch(() => undefined)
    // Pull the colleagues' changes every 5 minutes.
    const timer = setInterval(() => void api.workspace.sync({ repoId: activeRepoId }).catch(() => undefined), 5 * 60_000)
    return () => clearInterval(timer)
  }, [activeRepoId])
}
