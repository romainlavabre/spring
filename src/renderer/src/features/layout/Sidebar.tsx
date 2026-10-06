// The menu of the workspace: sections, pages and external links. Right-click
// for actions, drag and drop to reorder or move.
import * as ContextMenu from '@radix-ui/react-context-menu'
import * as Menu from '@radix-ui/react-dropdown-menu'
import clsx from 'clsx'
import {
  ChevronRight,
  Copy,
  ExternalLink,
  FilePlus2,
  FileText,
  FolderPlus,
  Link2,
  Moon,
  Pencil,
  Plus,
  Search,
  Settings2,
  Sun,
  Trash2,
  FileDown
} from 'lucide-react'
import { useEffect, useState, type DragEvent, type ReactNode } from 'react'
import { create } from 'zustand'
import { findNode, parentPath, type TreeNode } from '@core/tree'
import { api, errorMessage } from '../../lib/bridge'
import { allDrafts, forgetDraft } from '../../lib/drafts'
import { retargetPage, setTheme, useApp } from '../../store'
import { confirm, toast } from '../../components/feedback'
import { IconButton } from '../../components/ui'
import { NamedIcon } from '../../doc/Icon'
import { NodeDialog, type NodeDialogRequest } from '../docs/NodeDialog'
import { homePage, useRefresh, useTree } from '../docs/useDocs'
import { exportPdf } from '../export/exportPdf'
import { openSearch } from '../search/SearchDialog'
import { UpdateBadge } from '../update/UpdateNotice'
import { WorkspaceSwitcher } from '../workspace/WorkspaceSwitcher'
import { openPageSafely } from './UnsavedChanges'

const menuItemClass = 'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs outline-none data-[highlighted]:bg-hover'
const menuContentClass = 'z-50 min-w-48 rounded-md border border-border bg-panel-2 p-1 shadow-xl'

/** Sections unfolded in the menu. */
const useExpanded = create<{ open: Set<string> }>(() => ({ open: new Set() }))

function toggle(path: string, open?: boolean): void {
  useExpanded.setState((s) => {
    const next = new Set(s.open)
    if (open ?? !next.has(path)) next.add(path)
    else next.delete(path)
    return { open: next }
  })
}

/** Unfolds the sections above a page so it shows in the menu. */
function reveal(path: string): void {
  const parts = path.split('/')
  useExpanded.setState((s) => {
    const next = new Set(s.open)
    for (let i = 1; i < parts.length; i++) next.add(parts.slice(0, i).join('/'))
    return { open: next }
  })
}

/** Opens the dialog creating or editing a menu item. */
const useNodeDialog = create<{ request: NodeDialogRequest | null }>(() => ({ request: null }))
export function openNodeDialog(request: NodeDialogRequest): void {
  useNodeDialog.setState({ request })
}

type DropPosition = 'before' | 'after' | 'into'
let dragged: TreeNode | null = null

export function Sidebar() {
  const { data: tree } = useTree()
  const page = useApp((s) => s.page)
  const theme = useApp((s) => s.theme)
  const refresh = useRefresh()
  const request = useNodeDialog((s) => s.request)
  const current = page ?? homePage(tree)

  useEffect(() => {
    if (current) reveal(current)
  }, [current])

  return (
    <aside className="flex h-full flex-col bg-panel">
      <WorkspaceSwitcher />
      <div className="flex items-center gap-1 px-2 pt-2">
        <button
          type="button"
          onClick={openSearch}
          className="flex h-8 flex-1 items-center gap-2 rounded-md border border-border bg-bg px-2.5 text-xs text-muted transition hover:border-accent/50 hover:text-fg"
        >
          <Search className="size-3.5" />
          Search
          <kbd className="ml-auto rounded border border-border px-1 font-sans text-[10px]">Ctrl K</kbd>
        </button>
        <NewMenu parent="" />
      </div>
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-2" aria-label="Menu">
            {tree && tree.length === 0 && <EmptyMenu />}
            {tree && <Nodes nodes={tree} depth={0} current={current} />}
            <RootDropZone />
          </nav>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content className={menuContentClass}>
            <CreateItems parent="" Item={ContextMenu.Item} />
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
      <div className="flex items-center gap-1 border-t border-border px-2 py-1.5">
        <IconButton label={theme === 'dark' ? 'Light theme' : 'Dark theme'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </IconButton>
        <div className="flex-1" />
      </div>
      <UpdateBadge />
      <NodeDialog
        request={request}
        onClose={() => useNodeDialog.setState({ request: null })}
        onDone={(path) => {
          const done = useNodeDialog.getState().request
          useNodeDialog.setState({ request: null })
          void refresh()
          if (done?.kind === 'page' && !done.path) void openPageSafely(path).then(() => useApp.setState({ editing: true }))
          if (done?.kind === 'section' && !done.path) toggle(path, true)
        }}
      />
    </aside>
  )
}

function EmptyMenu() {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center text-xs text-muted">
      <p>This workspace is empty. Start with a section, such as Infra or Process, then add pages to it.</p>
      <div className="flex gap-2">
        <button type="button" className="rounded-md bg-accent px-3 py-1.5 font-medium text-accent-fg" onClick={() => openNodeDialog({ kind: 'section', parent: '' })}>
          New section
        </button>
        <button type="button" className="rounded-md border border-border px-3 py-1.5" onClick={() => openNodeDialog({ kind: 'page', parent: '' })}>
          New page
        </button>
      </div>
    </div>
  )
}

function NewMenu({ parent }: { parent: string }) {
  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <button type="button" aria-label="New" className="flex size-8 items-center justify-center rounded-md border border-border text-muted hover:bg-hover hover:text-fg">
          <Plus className="size-4" />
        </button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="end" sideOffset={4} className={menuContentClass}>
          <CreateItems parent={parent} Item={Menu.Item} />
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}

type ItemComponent = typeof Menu.Item | typeof ContextMenu.Item

function CreateItems({ parent, Item }: { parent: string; Item: ItemComponent }) {
  return (
    <>
      <Item className={menuItemClass} onSelect={() => openNodeDialog({ kind: 'page', parent })}>
        <FilePlus2 className="size-3.5" /> New page
      </Item>
      <Item className={menuItemClass} onSelect={() => openNodeDialog({ kind: 'section', parent })}>
        <FolderPlus className="size-3.5" /> New section
      </Item>
      <Item className={menuItemClass} onSelect={() => openNodeDialog({ kind: 'link', parent })}>
        <Link2 className="size-3.5" /> New external link
      </Item>
    </>
  )
}

function Nodes({ nodes, depth, current }: { nodes: TreeNode[]; depth: number; current: string | null }) {
  return (
    <ul className="flex flex-col gap-px" role={depth === 0 ? 'tree' : 'group'}>
      {nodes.map((node) => (
        <NodeRow key={node.path} node={node} depth={depth} current={current} />
      ))}
    </ul>
  )
}

function NodeRow({ node, depth, current }: { node: TreeNode; depth: number; current: string | null }) {
  const open = useExpanded((s) => s.open.has(node.path))
  const refresh = useRefresh()
  const { data: tree } = useTree()
  const [drop, setDrop] = useState<DropPosition | null>(null)
  const active = node.kind === 'page' && node.path === current

  const activate = (): void => {
    if (node.kind === 'section') toggle(node.path)
    else if (node.kind === 'page') void openPageSafely(node.path)
    else void api.app.openExternal({ url: node.url }).catch((e: unknown) => toast(errorMessage(e), 'error'))
  }

  const positionOf = (event: DragEvent): DropPosition => {
    const box = event.currentTarget.getBoundingClientRect()
    const ratio = (event.clientY - box.top) / box.height
    if (node.kind === 'section') return ratio < 0.3 ? 'before' : ratio > 0.7 && open ? 'into' : ratio > 0.7 ? 'after' : 'into'
    return ratio < 0.5 ? 'before' : 'after'
  }

  const onDrop = async (event: DragEvent): Promise<void> => {
    event.preventDefault()
    const position = positionOf(event)
    setDrop(null)
    const source = dragged
    dragged = null
    if (!source || source.path === node.path) return
    if (allDrafts().length > 0) {
      toast('Save or discard the changes of the page you edit before moving items.', 'warning')
      return
    }
    let parent = parentPath(node.path)
    let before: string | null = node.path
    if (position === 'into') {
      parent = node.path
      before = null
    } else if (position === 'after') {
      const siblings = childrenOf(tree ?? [], parent).filter((n) => n.path !== source.path)
      before = siblings[siblings.findIndex((n) => n.path === node.path) + 1]?.path ?? null
    }
    try {
      const path = await api.docs.move({ from: source.path, parent, before })
      if (path !== source.path) retargetPage(source.path, path)
      if (position === 'into') toggle(node.path, true)
      await refresh()
    } catch (error) {
      toast(errorMessage(error), 'error')
    }
  }

  return (
    <li role="treeitem" aria-label={node.title} aria-expanded={node.kind === 'section' ? open : undefined} aria-selected={active}>
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          <div
            draggable
            onDragStart={(event) => {
              dragged = node
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData('text/plain', node.path)
            }}
            onDragOver={(event) => {
              if (!dragged || dragged.path === node.path) return
              event.preventDefault()
              event.stopPropagation()
              setDrop(positionOf(event))
            }}
            onDragLeave={() => setDrop(null)}
            onDrop={(event) => {
              event.stopPropagation()
              void onDrop(event)
            }}
            onClick={activate}
            data-path={node.path}
            className={clsx(
              'group relative flex h-8 cursor-pointer items-center gap-2 rounded-md pr-2 text-[13px] transition',
              active ? 'bg-accent/15 font-medium text-accent' : 'text-fg/85 hover:bg-hover hover:text-fg',
              node.kind === 'section' && 'font-semibold text-fg',
              drop === 'into' && 'ring-1 ring-accent ring-inset'
            )}
            style={{ paddingLeft: 8 + depth * 14 }}
          >
            {drop === 'before' && <span className="pointer-events-none absolute -top-px left-2 right-2 h-0.5 rounded bg-accent" />}
            {drop === 'after' && <span className="pointer-events-none absolute -bottom-px left-2 right-2 h-0.5 rounded bg-accent" />}
            {node.kind === 'section' ? (
              <ChevronRight className={clsx('size-3.5 shrink-0 text-muted transition-transform', open && 'rotate-90')} />
            ) : null}
            <NodeIcon node={node} />
            <span className="min-w-0 flex-1 truncate">{node.title}</span>
            {node.kind === 'link' && <ExternalLink className="size-3.5 shrink-0 text-muted opacity-60 group-hover:opacity-100" />}
          </div>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content className={menuContentClass}>
            <NodeActions node={node} />
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
      {node.kind === 'section' && open && (
        <div>
          {node.children.length > 0 ? (
            <Nodes nodes={node.children} depth={depth + 1} current={current} />
          ) : (
            <div className="py-1 text-[11px] italic text-muted" style={{ paddingLeft: 30 + depth * 14 }}>
              Empty section
            </div>
          )}
        </div>
      )}
    </li>
  )
}

function childrenOf(tree: TreeNode[], parent: string): TreeNode[] {
  if (parent === '') return tree
  const section = findNode(tree, parent)
  return section?.kind === 'section' ? section.children : []
}

function NodeIcon({ node }: { node: TreeNode }): ReactNode {
  if (node.icon) return <NamedIcon name={node.icon} fallback={node.kind === 'link' ? 'link' : 'file-text'} className="size-4 shrink-0 opacity-80" />
  if (node.kind === 'section') return null
  if (node.kind === 'link') return <Link2 className="size-4 shrink-0 opacity-70" />
  return <FileText className="size-4 shrink-0 opacity-70" />
}

function NodeActions({ node }: { node: TreeNode }) {
  const refresh = useRefresh()
  const run = async (action: () => Promise<unknown>): Promise<void> => {
    try {
      await action()
      await refresh()
    } catch (error) {
      toast(errorMessage(error), 'error')
    }
  }

  const remove = async (): Promise<void> => {
    const what = node.kind === 'section' ? `the section "${node.title}" and everything in it` : `the ${node.kind} "${node.title}"`
    const ok = await confirm({ title: `Delete ${node.kind}`, body: `Delete ${what}? Git keeps the history.`, confirmLabel: 'Delete', danger: true })
    if (!ok) return
    for (const draft of allDrafts()) if (draft.id === node.path || draft.id.startsWith(`${node.path}/`)) forgetDraft(draft.id)
    await run(() => api.docs.remove({ path: node.path }))
    const { page } = useApp.getState()
    if (page && (page === node.path || page.startsWith(`${node.path}/`))) useApp.setState({ page: null, editing: false })
  }

  return (
    <>
      {node.kind === 'section' && (
        <>
          <CreateItems parent={node.path} Item={ContextMenu.Item} />
          <ContextMenu.Separator className="my-1 h-px bg-border" />
          <ContextMenu.Item className={menuItemClass} onSelect={() => openNodeDialog({ kind: 'section', path: node.path })}>
            <Settings2 className="size-3.5" /> Settings
          </ContextMenu.Item>
          <ContextMenu.Item className={menuItemClass} onSelect={() => void exportPdf(node.path)}>
            <FileDown className="size-3.5" /> Export as PDF
          </ContextMenu.Item>
        </>
      )}
      {node.kind === 'page' && (
        <>
          <ContextMenu.Item
            className={menuItemClass}
            onSelect={() => void openPageSafely(node.path).then(() => useApp.getState().page === node.path && useApp.setState({ editing: true }))}
          >
            <Pencil className="size-3.5" /> Edit
          </ContextMenu.Item>
          <ContextMenu.Item className={menuItemClass} onSelect={() => void run(() => api.docs.duplicatePage({ path: node.path }))}>
            <Copy className="size-3.5" /> Duplicate
          </ContextMenu.Item>
          <ContextMenu.Item className={menuItemClass} onSelect={() => void exportPdf(node.path)}>
            <FileDown className="size-3.5" /> Export as PDF
          </ContextMenu.Item>
        </>
      )}
      {node.kind === 'link' && (
        <>
          <ContextMenu.Item className={menuItemClass} onSelect={() => void api.app.openExternal({ url: node.url })}>
            <ExternalLink className="size-3.5" /> Open in the browser
          </ContextMenu.Item>
          <ContextMenu.Item className={menuItemClass} onSelect={() => openNodeDialog({ kind: 'link', path: node.path })}>
            <Pencil className="size-3.5" /> Edit
          </ContextMenu.Item>
        </>
      )}
      <ContextMenu.Separator className="my-1 h-px bg-border" />
      <ContextMenu.Item className={`${menuItemClass} text-danger`} onSelect={() => void remove()}>
        <Trash2 className="size-3.5" /> Delete
      </ContextMenu.Item>
    </>
  )
}

/** Dropping below the last item moves it to the end of the root. */
function RootDropZone() {
  const refresh = useRefresh()
  const [over, setOver] = useState(false)
  return (
    <div
      className={clsx('h-10 rounded-md', over && 'bg-accent/10')}
      onDragOver={(event) => {
        if (!dragged) return
        event.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault()
        setOver(false)
        const source = dragged
        dragged = null
        if (!source) return
        void api.docs
          .move({ from: source.path, parent: '', before: null })
          .then(async (path) => {
            if (path !== source.path) retargetPage(source.path, path)
            await refresh()
          })
          .catch((error: unknown) => toast(errorMessage(error), 'error'))
      }}
    />
  )
}
