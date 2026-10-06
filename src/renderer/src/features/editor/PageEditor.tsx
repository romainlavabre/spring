// Edit mode of a page: every block shows as readers see it, with a toolbar to
// edit, move, duplicate or delete it, and "+" lines to insert blocks. Changes
// stay a draft until saved (Ctrl+S).
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import * as Menu from '@radix-ui/react-dropdown-menu'
import * as Popover from '@radix-ui/react-popover'
import clsx from 'clsx'
import { AlertTriangle, ArrowDown, ArrowUp, Braces, Check, Copy, GripVertical, Pencil, Plus, Redo2, Save, Trash2, Undo2, X } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { addBlock, deleteBlock, findBlock, moveBlock, newBlockId, updateBlock, withFreshIds, type Position } from '@core/blocks/ops'
import { BLOCK_TYPES, type Block, type BlockType, type Page } from '@core/blocks/schema'
import { blockTemplate, BLOCK_LABELS } from '@core/blocks/templates'
import { formatIssues, validatePage, type PageIssue } from '@core/blocks/validate'
import { stableJson } from '@core/layout/json'
import { api, errorMessage } from '../../lib/bridge'
import { forgetDraft, putDraft, saveDraft, useDraft } from '../../lib/drafts'
import { setEditing } from '../../store'
import { toast } from '../../components/feedback'
import { CodeEditor } from '../../components/CodeEditor'
import { ErrorBoundary } from '../../components/ErrorBoundary'
import { IconPicker } from '../../components/IconPicker'
import { Button, IconButton } from '../../components/ui'
import { BlockView } from '../../doc/BlockView'
import { NamedIcon } from '../../doc/Icon'
import { BlockEditor } from './BlockEditor'

interface EditorApi {
  draft: Page
  update(next: Page): void
  selected: string | null
  select(id: string | null): void
}

const EditorContext = createContext<EditorApi | null>(null)

function useEditor(): EditorApi {
  const editor = useContext(EditorContext)
  if (!editor) throw new Error('Outside of the page editor')
  return editor
}

/** Where blocks of a list go: the page, or a tab / details block. */
interface Holder {
  parent?: string
  tab?: number
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function PageEditor({ path, saved, onSaved }: { path: string; saved: Page; onSaved: () => Promise<void> }) {
  const entry = useDraft(path)
  const draft = (entry?.value as Page | undefined) ?? saved
  // A new page starts with an empty text block: ready to type.
  const [selected, setSelected] = useState<string | null>(() => {
    const [first] = saved.blocks
    return saved.blocks.length === 1 && first.type === 'text' && !first.md ? first.id : null
  })
  const [source, setSource] = useState(false)
  const [serverIssues, setServerIssues] = useState<PageIssue[]>([])
  const [saving, setSaving] = useState(false)
  const past = useRef<Page[]>([])
  const future = useRef<Page[]>([])
  const [, setTick] = useState(0)

  const record = useCallback(
    (next: Page) => {
      putDraft(
        {
          id: path,
          kind: 'Page',
          title: next.title,
          location: path,
          value: next,
          save: async (value) => {
            await api.docs.savePage({ path, page: value as Page })
            await onSaved()
          }
        },
        saved
      )
      setServerIssues([])
    },
    [path, saved, onSaved]
  )

  const update = useCallback(
    (next: Page) => {
      past.current = [...past.current.slice(-99), draft]
      future.current = []
      record(next)
      setTick((n) => n + 1)
    },
    [draft, record]
  )

  const undo = (): void => {
    const previous = past.current.pop()
    if (!previous) return
    future.current = [draft, ...future.current]
    record(previous)
    setTick((n) => n + 1)
  }
  const redo = (): void => {
    const [next, ...rest] = future.current
    if (!next) return
    future.current = rest
    past.current = [...past.current, draft]
    record(next)
    setTick((n) => n + 1)
  }

  const issues = useMemo(() => {
    const result = validatePage(draft)
    return result.ok ? serverIssues : result.issues
  }, [draft, serverIssues])

  const save = async (): Promise<void> => {
    if (!entry) return
    setSaving(true)
    try {
      await saveDraft(path)
      past.current = []
      future.current = []
      toast('Page saved', 'success')
    } catch (error) {
      const message = errorMessage(error)
      const lines = message.split('\n').slice(1)
      setServerIssues(
        lines.length
          ? lines.map((line) => {
              const at = line.indexOf(': ')
              return { path: line.slice(0, at), message: line.slice(at + 2) }
            })
          : [{ path: '(page)', message }]
      )
      toast(message.split('\n')[0], 'error')
    } finally {
      setSaving(false)
    }
  }
  const saveRef = useRef(save)
  saveRef.current = save
  const undoRef = useRef({ undo, redo })
  undoRef.current = { undo, redo }

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement
      const typing = target.closest('input, textarea, select, .cm-editor')
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void saveRef.current()
      } else if (event.key === 'Escape' && !target.closest('[role="dialog"]')) {
        setSelected(null)
      } else if (!typing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) undoRef.current.redo()
        else undoRef.current.undo()
      } else if (!typing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        undoRef.current.redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // An image pasted or dropped on the page becomes an image block.
  const addImages = async (files: File[]): Promise<void> => {
    let page = draft
    let after = selected ?? page.blocks.at(-1)?.id
    for (const file of files.filter((f) => f.type.startsWith('image/'))) {
      try {
        const extension = file.type.split('/')[1]?.replace('jpeg', 'jpg').replace('svg+xml', 'svg') ?? 'png'
        const name = file.name && /\.\w+$/.test(file.name) ? file.name : `image.${extension}`
        const asset = await api.assets.add({ name, base64: await readAsBase64(file) })
        const block: Block = { id: newBlockId(page), type: 'image', asset }
        page = addBlock(page, block, after && findBlock(page, after) ? { after } : {})
        after = block.id
      } catch (error) {
        toast(errorMessage(error), 'error')
      }
    }
    if (page !== draft) update(page)
  }

  const discard = (): void => {
    forgetDraft(path)
    past.current = []
    future.current = []
    setServerIssues([])
    setTick((n) => n + 1)
  }

  const editor: EditorApi = { draft, update, selected, select: setSelected }
  const dirty = !!entry

  return (
    <EditorContext.Provider value={editor}>
      <div
        className="doc-editor"
        onPaste={(event) => {
          const files = [...event.clipboardData.files]
          if (files.some((f) => f.type.startsWith('image/'))) {
            event.preventDefault()
            void addImages(files)
          }
        }}
        onDragOver={(event) => {
          if ([...event.dataTransfer.items].some((item) => item.kind === 'file')) event.preventDefault()
        }}
        onDrop={(event) => {
          const files = [...event.dataTransfer.files]
          if (files.length) {
            event.preventDefault()
            void addImages(files)
          }
        }}
      >
        <div className="sticky top-0 z-20 -mx-2 mb-6 flex items-center gap-1.5 rounded-xl border border-border bg-panel/95 px-3 py-2 shadow-lg backdrop-blur">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-accent">
            <Pencil className="size-3.5" /> Editing
          </span>
          {dirty && <span className="text-[11px] text-muted">· unsaved changes</span>}
          <div className="flex-1" />
          <IconButton label="Undo (Ctrl+Z)" disabled={past.current.length === 0} onClick={undo}>
            <Undo2 className="size-4" />
          </IconButton>
          <IconButton label="Redo (Ctrl+Shift+Z)" disabled={future.current.length === 0} onClick={redo}>
            <Redo2 className="size-4" />
          </IconButton>
          <IconButton label={source ? 'Back to the blocks' : 'Edit the JSON source'} active={source} onClick={() => setSource(!source)}>
            <Braces className="size-4" />
          </IconButton>
          <div className="mx-1 h-5 w-px bg-border" />
          <Button size="sm" variant="ghost" disabled={!dirty} onClick={discard}>
            Discard
          </Button>
          <Button size="sm" variant="primary" icon={<Save className="size-3.5" />} loading={saving} disabled={!dirty} onClick={() => void save()}>
            Save
          </Button>
          <Button
            size="sm"
            icon={<Check className="size-3.5" />}
            onClick={() => {
              if (dirty) toast('Save or discard the changes first.', 'warning')
              else setEditing(false)
            }}
          >
            Done
          </Button>
        </div>

        {issues.length > 0 && <IssuesPanel issues={issues} onPick={setSelected} />}

        {source ? (
          <SourceEditor page={draft} onChange={update} />
        ) : (
          <>
            <MetaEditor />
            <div className="doc-blocks doc-editable" aria-label="Blocks">
              <EditableBlocks blocks={draft.blocks} holder={{}} />
            </div>
          </>
        )}
      </div>
    </EditorContext.Provider>
  )
}

/** Title, description and icon of the page. */
function MetaEditor() {
  const { draft, update } = useEditor()
  return (
    <header className="doc-page-header">
      <div className="doc-page-title-row">
        <Popover.Root>
          <Popover.Trigger asChild>
            <button type="button" aria-label="Page icon" className="doc-page-icon border border-dashed border-transparent hover:border-[var(--doc-accent)]">
              <NamedIcon name={draft.icon} fallback="file-text" className="size-5" />
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content sideOffset={6} align="start" className="z-50 w-[340px] rounded-lg border border-border bg-panel-2 p-3 shadow-xl">
              <IconPicker value={draft.icon ?? ''} onChange={(icon) => update({ ...draft, icon: icon || undefined })} />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        <input
          className="doc-page-title min-w-0 bg-transparent outline-none placeholder:text-[var(--doc-muted)]"
          value={draft.title}
          placeholder="Page title"
          aria-label="Page title"
          onChange={(e) => update({ ...draft, title: e.target.value })}
        />
      </div>
      <input
        className="doc-page-description w-full bg-transparent outline-none placeholder:text-[var(--doc-muted)]/60"
        value={draft.description ?? ''}
        placeholder="Add a one-line description…"
        aria-label="Page description"
        onChange={(e) => update({ ...draft, description: e.target.value || undefined })}
      />
    </header>
  )
}

function IssuesPanel({ issues, onPick }: { issues: PageIssue[]; onPick: (id: string) => void }) {
  const { draft } = useEditor()
  /** The block an issue path points at: the deepest "blocks[n]" in it. */
  const blockAt = (path: string): string | null => {
    let blocks: Block[] = draft.blocks
    let found: Block | null = null
    for (const match of path.matchAll(/(?:^|\.)(?:tabs\[(\d+)\]\.)?blocks\[(\d+)\]/g)) {
      const tab = match[1] !== undefined ? Number(match[1]) : null
      if (tab !== null && found?.type === 'tabs') blocks = found.tabs[tab]?.blocks ?? []
      else if (found?.type === 'details') blocks = found.blocks
      found = blocks[Number(match[2])] ?? null
      if (!found) break
    }
    return found?.id ?? null
  }
  return (
    <div className="mb-6 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs" role="alert">
      <div className="mb-1.5 flex items-center gap-1.5 font-semibold text-warning">
        <AlertTriangle className="size-3.5" /> {issues.length === 1 ? '1 thing to fix before saving' : `${issues.length} things to fix before saving`}
      </div>
      <ul className="space-y-0.5">
        {issues.slice(0, 8).map((issue, i) => {
          const id = blockAt(issue.path)
          return (
            <li key={i}>
              <button type="button" disabled={!id} onClick={() => id && onPick(id)} className="text-left hover:underline disabled:no-underline">
                <span className="font-mono text-muted">{issue.path}</span> {issue.message}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function SourceEditor({ page, onChange }: { page: Page; onChange: (page: Page) => void }) {
  const [text, setText] = useState(() => stableJson(page))
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted">The page as stored in the workspace. Changes apply as soon as the JSON is a valid page.</p>
      <CodeEditor
        value={text}
        language="json"
        minHeight={400}
        maxHeight={2000}
        label="Page source"
        onChange={(next) => {
          setText(next)
          let raw: unknown
          try {
            raw = JSON.parse(next)
          } catch (e) {
            setError(`Invalid JSON: ${(e as Error).message}`)
            return
          }
          const result = validatePage(raw)
          if (!result.ok) {
            setError(formatIssues(result.issues))
            return
          }
          setError(null)
          onChange(result.page)
        }}
      />
      {error && <pre className="whitespace-pre-wrap rounded-md border border-danger/40 bg-danger/10 px-3 py-2 font-mono text-xs text-danger">{error}</pre>}
    </div>
  )
}

// ------------------------------------------------------------------ blocks

function EditableBlocks({ blocks, holder }: { blocks: Block[]; holder: Holder }) {
  const { draft, update } = useEditor()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const onDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = blocks.findIndex((b) => b.id === active.id)
    const to = blocks.findIndex((b) => b.id === over.id)
    if (from < 0 || to < 0) return
    update(moveBlock(draft, String(active.id), from < to ? { after: String(over.id) } : { before: String(over.id) }))
  }

  if (blocks.length === 0) {
    return <Inserter position={{ parent: holder.parent, tab: holder.tab }} big={!holder.parent} />
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
        <Inserter position={{ before: blocks[0].id }} />
        {blocks.map((block, i) => (
          <div key={block.id}>
            <BlockFrame block={block} first={i === 0} last={i === blocks.length - 1} siblings={blocks} />
            <Inserter position={{ after: block.id }} />
          </div>
        ))}
      </SortableContext>
    </DndContext>
  )
}

function BlockFrame({ block, first, last, siblings }: { block: Block; first: boolean; last: boolean; siblings: Block[] }) {
  const { draft, update, selected, select } = useEditor()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id })
  const editing = selected === block.id
  const editable = block.type !== 'divider'
  const index = siblings.indexOf(block)

  const actions: { label: string; icon: ReactNode; run: () => void; disabled?: boolean; danger?: boolean }[] = [
    { label: 'Move up', icon: <ArrowUp className="size-3.5" />, disabled: first, run: () => update(moveBlock(draft, block.id, { before: siblings[index - 1].id })) },
    { label: 'Move down', icon: <ArrowDown className="size-3.5" />, disabled: last, run: () => update(moveBlock(draft, block.id, { after: siblings[index + 1].id })) },
    { label: 'Duplicate', icon: <Copy className="size-3.5" />, run: () => update(addBlock(draft, withFreshIds(draft, block), { after: block.id })) },
    {
      label: 'Delete block',
      icon: <Trash2 className="size-3.5" />,
      danger: true,
      run: () => {
        if (editing) select(null)
        update(deleteBlock(draft, block.id))
      }
    }
  ]

  return (
    <div
      ref={setNodeRef}
      style={{ transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined, transition }}
      className={clsx('doc-block-frame group/frame', editing && 'is-editing', isDragging && 'is-dragging')}
      data-block={block.id}
      data-type={block.type}
    >
      <div className="doc-block-toolbar" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="doc-block-handle" aria-label={`Drag ${BLOCK_LABELS[block.type].label}`} {...attributes} {...listeners}>
          <GripVertical className="size-3.5" />
        </button>
        <span className="doc-block-type">{BLOCK_LABELS[block.type].label}</span>
        {editable && (
          <button
            type="button"
            className={clsx('doc-block-action', editing && 'is-active')}
            aria-label={editing ? 'Close the editor' : `Edit ${BLOCK_LABELS[block.type].label}`}
            title={editing ? 'Close (Esc)' : 'Edit'}
            onClick={() => select(editing ? null : block.id)}
          >
            {editing ? <X className="size-3.5" /> : <Pencil className="size-3.5" />}
          </button>
        )}
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            className={clsx('doc-block-action', action.danger && 'is-danger')}
            aria-label={action.label}
            title={action.label}
            disabled={action.disabled}
            onClick={action.run}
          >
            {action.icon}
          </button>
        ))}
      </div>
      <div
        className="doc-block-preview"
        onDoubleClick={(e) => {
          if (!editable || (e.target as HTMLElement).closest('.doc-block-frame') !== e.currentTarget.parentElement) return
          select(block.id)
        }}
      >
        <ErrorBoundary resetKey={JSON.stringify(block)}>
          <BlockView block={block} renderBlocks={(blocks, holder) => <EditableBlocks blocks={blocks} holder={holder} />} />
        </ErrorBoundary>
      </div>
      {editing && (
        <div className="doc-block-editor selectable" onDoubleClick={(e) => e.stopPropagation()}>
          <BlockEditor block={block} onChange={(next) => update(updateBlock(draft, block.id, next))} />
        </div>
      )}
    </div>
  )
}

function Inserter({ position, big }: { position: Position; big?: boolean }) {
  const { draft, update, select } = useEditor()
  const insert = (type: BlockType): void => {
    const block = blockTemplate(type, newBlockId(draft))
    update(addBlock(draft, block, position))
    if (type !== 'divider') select(block.id)
  }
  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        {big ? (
          <button type="button" className="doc-inserter-big">
            <Plus className="size-4" /> Add a block
          </button>
        ) : (
          <button type="button" className="doc-inserter" aria-label="Insert a block">
            <span className="doc-inserter-line" />
            <span className="doc-inserter-plus">
              <Plus className="size-3" />
            </span>
            <span className="doc-inserter-line" />
          </button>
        )}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content sideOffset={4} align="center" className="z-50 grid w-[440px] grid-cols-2 gap-0.5 rounded-lg border border-border bg-panel-2 p-1.5 shadow-xl">
          {BLOCK_TYPES.map((type) => (
            <Menu.Item key={type} onSelect={() => insert(type)} className="flex cursor-pointer flex-col rounded-md px-2.5 py-1.5 outline-none data-[highlighted]:bg-hover">
              <span className="text-xs font-semibold">{BLOCK_LABELS[type].label}</span>
              <span className="text-[11px] text-muted">{BLOCK_LABELS[type].hint}</span>
            </Menu.Item>
          ))}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}
