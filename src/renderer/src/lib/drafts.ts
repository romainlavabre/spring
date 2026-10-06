// Unsaved changes of the page editor, kept outside the components so they can
// be saved or discarded from anywhere (opening another page, switching
// workspace, quitting the app).
import { create } from 'zustand'

export interface DraftEntry {
  /** Page path. */
  id: string
  /** What is edited, e.g. "Page". */
  kind: string
  title: string
  /** Where it is, e.g. "infra/kubernetes". */
  location: string
  value: unknown
  /** Writes `value` to the workspace. */
  save: (value: unknown) => Promise<void>
}

export const useDrafts = create<Record<string, DraftEntry>>(() => ({}))

/** Records unsaved changes, or forgets them when `value` is back to the saved one. */
export function putDraft(entry: DraftEntry, saved: unknown): void {
  if (JSON.stringify(entry.value) === JSON.stringify(saved)) forgetDraft(entry.id)
  else useDrafts.setState({ [entry.id]: entry })
}

export function forgetDraft(id: string): void {
  if (!(id in useDrafts.getState())) return
  useDrafts.setState((drafts) => {
    const next = { ...drafts }
    delete next[id]
    return next
  }, true)
}

export function clearDrafts(): void {
  useDrafts.setState({}, true)
}

/** Saves one draft; it is forgotten only once written. */
export async function saveDraft(id: string): Promise<void> {
  const entry = useDrafts.getState()[id]
  if (!entry) return
  await entry.save(entry.value)
  // Unless edited again while saving.
  if (useDrafts.getState()[id]?.value === entry.value) forgetDraft(id)
}

export function allDrafts(): DraftEntry[] {
  return Object.values(useDrafts.getState())
}

export function useDraft(id: string | null): DraftEntry | null {
  return useDrafts((drafts) => (id ? (drafts[id] ?? null) : null))
}
