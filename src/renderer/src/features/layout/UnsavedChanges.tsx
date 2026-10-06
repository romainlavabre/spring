// Unsaved changes before quitting, opening another page or switching
// workspace: a popup to save or drop them.
import { FileWarning } from 'lucide-react'
import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { api, errorMessage, onEvent } from '../../lib/bridge'
import { allDrafts, forgetDraft, saveDraft, type DraftEntry } from '../../lib/drafts'
import { openPage } from '../../store'
import { toast } from '../../components/feedback'
import { Button, Dialog } from '../../components/ui'

/** What happens once the changes are dealt with, e.g. "Quit". */
interface Ask {
  entries: DraftEntry[]
  proceed: string
  resolve: (proceed: boolean) => void
}

const useAsk = create<{ ask: Ask | null }>(() => ({ ask: null }))

/**
 * Asks what to do with unsaved changes; resolves true once they are saved or
 * dropped, false when the user cancels. Resolves true at once without changes.
 */
export function askUnsaved(entries: DraftEntry[], proceed: string): Promise<boolean> {
  if (entries.length === 0) return Promise.resolve(true)
  // A question already open is answered "cancel" by a new one.
  useAsk.getState().ask?.resolve(false)
  return new Promise((resolve) => useAsk.setState({ ask: { entries, proceed, resolve } }))
}

/** Opens a page once the unsaved changes of the current one are dealt with. */
export async function openPageSafely(path: string, anchor: string | null = null): Promise<void> {
  const others = allDrafts().filter((draft) => draft.id !== path)
  if (await askUnsaved(others, 'Leave')) openPage(path, anchor)
}

/** Saves or drops every draft; false when a save failed (the failed ones stay). */
async function apply(entries: DraftEntry[], save: boolean): Promise<boolean> {
  let ok = true
  for (const entry of entries) {
    if (!save) {
      forgetDraft(entry.id)
      continue
    }
    try {
      await saveDraft(entry.id)
    } catch (error) {
      ok = false
      toast(`${entry.kind} "${entry.title}": ${errorMessage(error)}`, 'error')
    }
  }
  return ok
}

function finish(proceed: boolean): void {
  useAsk.getState().ask?.resolve(proceed)
  useAsk.setState({ ask: null })
}

/** Mounted once: answers the main process when the window is about to close. */
export function UnsavedChanges() {
  const { ask } = useAsk()
  const [busy, setBusy] = useState(false)

  useEffect(
    () =>
      onEvent('app:close-requested', () => {
        void askUnsaved(allDrafts(), 'Quit').then((proceed) => {
          if (proceed) void api.app.close()
        })
      }),
    []
  )

  if (!ask) return null
  const count = ask.entries.length

  const run = async (save: boolean): Promise<void> => {
    setBusy(true)
    const ok = await apply(ask.entries, save)
    setBusy(false)
    if (ok) finish(true)
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && !busy && finish(false)}
      title="Unsaved changes"
      width={480}
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={() => finish(false)}>
            Cancel
          </Button>
          <div className="flex-1" />
          <Button disabled={busy} onClick={() => void run(false)}>
            Don't save
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void run(true)}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex gap-3 text-xs">
        <FileWarning className="size-5 shrink-0 text-warning" />
        <div className="min-w-0 space-y-2">
          <p>
            {count === 1 ? '1 page has' : `${count} pages have`} unsaved changes. Save them before you {ask.proceed.toLowerCase()}?
          </p>
          <ul className="space-y-0.5 text-muted">
            {ask.entries.slice(0, 5).map((entry) => (
              <li key={entry.id} className="truncate">
                {entry.kind} <span className="text-fg">{entry.title}</span> <span className="font-mono">({entry.location})</span>
              </li>
            ))}
            {count > 5 && <li>and {count - 5} more</li>}
          </ul>
        </div>
      </div>
    </Dialog>
  )
}
