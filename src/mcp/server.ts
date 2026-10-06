// MCP server: lets an AI assistant browse and write the documentation of a
// workspace — sections, pages block by block, external links and images.
// Files are written in the workspace like the app does; the app shows them
// live and commits them at the next sync.
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { addBlock, allBlocks, childHolders, deleteBlock, findBlock, moveBlock, newBlockId, updateBlock, type Position } from '../core/blocks/ops'
import type { Block, Link, Page, Section } from '../core/blocks/schema'
import { formatIssues } from '../core/blocks/validate'
import { stableJson } from '../core/layout/json'
import { DocStore } from '../core/layout/store'
import { WORKSPACE_FILE } from '../core/layout/workspace'
import { searchPages } from '../core/search'
import type { TreeNode } from '../core/tree'
import { reference, REFERENCE_TOPICS, type ReferenceTopic } from './reference'
import { knownWorkspaces } from './workspaces'

export interface McpOptions {
  /** Fixed workspace folder (--workspace); otherwise the workspaces of the app. */
  workspace?: string
  env: Record<string, string | undefined>
  version: string
}

type Result = { content: { type: 'text'; text: string }[]; isError?: boolean }

function ok(value: unknown): Result {
  return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] }
}

function failure(error: unknown): Result {
  return { content: [{ type: 'text', text: (error as Error)?.message ?? String(error) }], isError: true }
}

function tool<A>(handler: (args: A) => unknown | Promise<unknown>): (args: A) => Promise<Result> {
  return async (args) => {
    try {
      return ok(await handler(args))
    } catch (error) {
      return failure(error)
    }
  }
}

function outline(nodes: TreeNode[], depth = 0): string[] {
  const pad = '  '.repeat(depth)
  return nodes.flatMap((node) => {
    if (node.kind === 'section') return [`${pad}▸ ${node.title}  (section: ${node.path})`, ...outline(node.children, depth + 1)]
    if (node.kind === 'link') return [`${pad}↗ ${node.title}  (link: ${node.path} → ${node.url})`]
    return [`${pad}• ${node.title}  (page: ${node.path})`]
  })
}

const workspaceArg = z.string().optional().describe('Workspace name; the active workspace of Spring when omitted')
const pathArg = z.string().describe('Page path, e.g. "infra/kubernetes" (see get_tree)')
const parentArg = z.string().default('').describe('Section path that will hold it, "" for the root of the menu')
const iconArg = z.string().optional().describe('Lucide icon name in kebab-case, e.g. server, book-open, rocket')
const blockArg = z
  .record(z.string(), z.unknown())
  .describe('A block: {"type": "...", ...}. See get_reference for every type. The id may be left out: one is generated')
const positionArgs = {
  after: z.string().optional().describe('Id of the block to put it after'),
  before: z.string().optional().describe('Id of the block to put it before'),
  parent: z.string().optional().describe('Id of a tabs or details block to put it in (at its end)'),
  tab: z.number().int().min(0).optional().describe('Index of the tab, with a tabs parent')
}

/** Gives an id to the blocks (nested ones included) that have none. */
function withIds(page: Pick<Page, 'blocks'>, blocks: unknown[]): Block[] {
  const scratch = { blocks: [...page.blocks] }
  const fill = (raw: unknown): Block => {
    const block = { ...(raw as Record<string, unknown>) } as Record<string, unknown>
    if (typeof block.id !== 'string' || !block.id) block.id = newBlockId(scratch)
    if (block.type === 'tabs' && Array.isArray(block.tabs)) {
      block.tabs = (block.tabs as { blocks?: unknown[] }[]).map((tab) => ({ ...tab, blocks: (tab.blocks ?? []).map(fill) }))
    }
    if (block.type === 'details') block.blocks = ((block.blocks as unknown[]) ?? []).map(fill)
    scratch.blocks.push(block as unknown as Block)
    return block as unknown as Block
  }
  return blocks.map(fill)
}

function position(args: { after?: string; before?: string; parent?: string; tab?: number }): Position {
  return { after: args.after, before: args.before, parent: args.parent, tab: args.tab }
}

export function createMcpServer(options: McpOptions): McpServer {
  const server = new McpServer(
    { name: 'spring', version: options.version },
    {
      instructions:
        'Spring stores documentation as pages of typed blocks (text, callout, code, table, timeline, steps, cards, tabs, mermaid, image…) ' +
        'in git workspaces, organised in sections with external links in the menu. Call get_reference first, then get_tree. ' +
        'Edit existing pages block by block. Link pages with [text](page:section/page). Every write is validated: read the errors, fix and retry.'
    }
  )

  const workspaceStore = (name: string | undefined): DocStore => {
    const workspaces = knownWorkspaces(options.workspace, options.env)
    if (workspaces.length === 0) throw new Error('No workspace: add one in the Spring app, or start the server with --workspace <folder>')
    const target = name
      ? workspaces.find((w) => w.name === name || w.id === name)
      : (workspaces.find((w) => w.active) ?? workspaces[0])
    if (!target) throw new Error(`No workspace "${name}". Known: ${workspaces.map((w) => w.name).join(', ')}`)
    if (!existsSync(target.path)) throw new Error(`The folder of workspace "${target.name}" is missing: ${target.path}`)
    if (!existsSync(join(target.path, WORKSPACE_FILE))) throw new Error(`${target.path} is not a Spring workspace (no ${WORKSPACE_FILE})`)
    return new DocStore(target.path)
  }

  /** Reads a page, applies a change and writes it once it validates. */
  const editPage = (workspace: string | undefined, path: string, change: (page: Page) => Page): Page => {
    const store = workspaceStore(workspace)
    const next = change(store.readPage(path))
    store.writePage(path, next)
    return store.readPage(path)
  }

  server.registerTool(
    'get_reference',
    {
      description: 'How to write Spring pages: conventions (overview), the JSON Schema of every block (blocks or one type), a full example',
      inputSchema: { topic: z.enum(REFERENCE_TOPICS).optional() }
    },
    tool(({ topic }: { topic?: ReferenceTopic }) => reference(topic))
  )

  server.registerTool(
    'list_workspaces',
    { description: 'Workspaces known to Spring, the active one marked', inputSchema: {} },
    tool(() => knownWorkspaces(options.workspace, options.env).map(({ name, path, active }) => ({ name, path, active })))
  )

  server.registerTool(
    'get_tree',
    { description: 'The menu of a workspace: sections, pages and external links with their paths', inputSchema: { workspace: workspaceArg } },
    tool(({ workspace }: { workspace?: string }) => {
      const lines = outline(workspaceStore(workspace).tree())
      return lines.length ? lines.join('\n') : 'The workspace is empty: create a section or a page.'
    })
  )

  server.registerTool(
    'get_page',
    { description: 'A page as JSON: title, description, icon and its blocks with their ids', inputSchema: { workspace: workspaceArg, path: pathArg } },
    tool(({ workspace, path }: { workspace?: string; path: string }) => stableJson(workspaceStore(workspace).readPage(path)))
  )

  server.registerTool(
    'search',
    { description: 'Full-text search over the pages of a workspace', inputSchema: { workspace: workspaceArg, query: z.string().min(1) } },
    tool(({ workspace, query }: { workspace?: string; query: string }) => {
      const hits = searchPages(workspaceStore(workspace).allPages(), query)
      return hits.length ? hits.map(({ path, title, snippet }) => ({ path, title, snippet })) : 'No page matches.'
    })
  )

  // ------------------------------------------------------------- sections

  server.registerTool(
    'create_section',
    {
      description: 'Create a section (a folder of the menu) at the root or inside another section',
      inputSchema: {
        workspace: workspaceArg,
        parent: parentArg,
        title: z.string().min(1),
        description: z.string().optional(),
        icon: iconArg
      }
    },
    tool(({ workspace, parent, ...section }: { workspace?: string; parent: string } & Section) => {
      const { path } = workspaceStore(workspace).createSection(parent, section)
      return { path }
    })
  )

  server.registerTool(
    'update_section',
    {
      description: 'Change the title, description or icon of a section; fields left out are kept',
      inputSchema: { workspace: workspaceArg, path: z.string(), title: z.string().min(1).optional(), description: z.string().optional(), icon: iconArg }
    },
    tool(({ workspace, path, ...patch }: { workspace?: string; path: string } & Partial<Section>) => {
      const store = workspaceStore(workspace)
      store.writeSection(path, { ...store.readSection(path), ...stripUndefined(patch) })
      return store.readSection(path)
    })
  )

  // ---------------------------------------------------------------- links

  server.registerTool(
    'create_link',
    {
      description: 'Add an external link to the menu (a button that opens a web page), at the root or in a section',
      inputSchema: {
        workspace: workspaceArg,
        parent: parentArg,
        title: z.string().min(1),
        url: z.string().describe('https://…'),
        description: z.string().optional(),
        icon: iconArg
      }
    },
    tool(({ workspace, parent, ...link }: { workspace?: string; parent: string } & Link) => {
      const { path } = workspaceStore(workspace).createLink(parent, link)
      return { path }
    })
  )

  server.registerTool(
    'update_link',
    {
      description: 'Change an external link of the menu; fields left out are kept',
      inputSchema: {
        workspace: workspaceArg,
        path: z.string(),
        title: z.string().min(1).optional(),
        url: z.string().optional(),
        description: z.string().optional(),
        icon: iconArg
      }
    },
    tool(({ workspace, path, ...patch }: { workspace?: string; path: string } & Partial<Link>) => {
      const store = workspaceStore(workspace)
      store.writeLink(path, { ...store.readLink(path), ...stripUndefined(patch) })
      return store.readLink(path)
    })
  )

  // ---------------------------------------------------------------- pages

  server.registerTool(
    'create_page',
    {
      description: 'Create a page with its blocks. Returns its path; nothing is written when a block is invalid (the errors say where)',
      inputSchema: {
        workspace: workspaceArg,
        parent: parentArg,
        title: z.string().min(1),
        description: z.string().optional().describe('One line under the title'),
        icon: iconArg,
        blocks: z.array(blockArg).default([])
      }
    },
    tool(({ workspace, parent, blocks, ...meta }: { workspace?: string; parent: string; blocks: unknown[] } & Omit<Page, 'blocks'>) => {
      const store = workspaceStore(workspace)
      const page: Page = { ...stripUndefined(meta), title: meta.title, blocks: withIds({ blocks: [] }, blocks) }
      const { path } = store.createPage(parent, page)
      return { path, blocks: allBlocks(store.readPage(path)).map((b) => ({ id: b.id, type: b.type })) }
    })
  )

  server.registerTool(
    'update_page',
    {
      description: 'Change the title, description or icon of a page; with blocks, replace all of them (prefer the block tools for edits)',
      inputSchema: {
        workspace: workspaceArg,
        path: pathArg,
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        icon: iconArg,
        blocks: z.array(blockArg).optional()
      }
    },
    tool(({ workspace, path, blocks, ...meta }: { workspace?: string; path: string; blocks?: unknown[] } & Partial<Omit<Page, 'blocks'>>) => {
      const page = editPage(workspace, path, (current) => ({
        ...current,
        ...stripUndefined(meta),
        blocks: blocks ? withIds({ blocks: [] }, blocks) : current.blocks
      }))
      return { title: page.title, blocks: page.blocks.length }
    })
  )

  server.registerTool(
    'add_block',
    {
      description: 'Add a block to a page: after or before a block, inside a tabs/details block, or at the end. Returns its id',
      inputSchema: { workspace: workspaceArg, path: pathArg, block: blockArg, ...positionArgs }
    },
    tool(({ workspace, path, block, ...where }: { workspace?: string; path: string; block: Record<string, unknown> } & Position) => {
      let id = ''
      editPage(workspace, path, (page) => {
        const [filled] = withIds(page, [block])
        id = filled.id
        return addBlock(page, filled, position(where))
      })
      return { id }
    })
  )

  server.registerTool(
    'update_block',
    {
      description:
        'Change a block of a page: "block" replaces it whole, "fields" changes only the fields given (e.g. {"md": "…"} or {"items": [...]})',
      inputSchema: {
        workspace: workspaceArg,
        path: pathArg,
        id: z.string(),
        block: blockArg.optional(),
        fields: z.record(z.string(), z.unknown()).optional()
      }
    },
    tool(
      ({ workspace, path, id, block, fields }: { workspace?: string; path: string; id: string; block?: Record<string, unknown>; fields?: Record<string, unknown> }) => {
        if (!block === !fields) throw new Error('Give either "block" (replace) or "fields" (merge)')
        const page = editPage(workspace, path, (current) => {
          if (block) return updateBlock(current, id, { ...block, id } as Block)
          if ('id' in fields! && fields!.id !== id) throw new Error('The id of a block cannot change')
          return updateBlock(current, id, fields as Partial<Block>, true)
        })
        return findBlock(page, id)
      }
    )
  )

  server.registerTool(
    'move_block',
    {
      description: 'Move a block of a page after or before another block, or into a tabs/details block',
      inputSchema: { workspace: workspaceArg, path: pathArg, id: z.string(), ...positionArgs }
    },
    tool(({ workspace, path, id, ...where }: { workspace?: string; path: string; id: string } & Position) => {
      const page = editPage(workspace, path, (current) => moveBlock(current, id, position(where)))
      return page.blocks.map((b) => (childHolders(b).length ? `${b.id} (${b.type}, holds blocks)` : `${b.id} (${b.type})`))
    })
  )

  server.registerTool(
    'delete_block',
    { description: 'Delete a block of a page, with the blocks it holds', inputSchema: { workspace: workspaceArg, path: pathArg, id: z.string() } },
    tool(({ workspace, path, id }: { workspace?: string; path: string; id: string }) => {
      editPage(workspace, path, (current) => deleteBlock(current, id))
      return `Deleted block "${id}"`
    })
  )

  server.registerTool(
    'validate_page',
    {
      description: 'Check a page of the workspace, or a page given as JSON, without writing anything',
      inputSchema: { workspace: workspaceArg, path: z.string().optional(), page: z.record(z.string(), z.unknown()).optional() }
    },
    tool(({ workspace, path, page }: { workspace?: string; path?: string; page?: Record<string, unknown> }) => {
      const store = workspaceStore(workspace)
      if (!path === !page) throw new Error('Give either "path" or "page"')
      const raw = page ?? JSON.parse(store.readPageSource(path!))
      const result = store.validate(raw)
      return result.ok ? 'The page is valid.' : `The page has issues:\n${formatIssues(result.issues)}`
    })
  )

  // --------------------------------------------------------- organisation

  server.registerTool(
    'move_item',
    {
      description: 'Move a page, link or section into another section, or reorder it (before a sibling, at the end otherwise). Links to moved pages are updated',
      inputSchema: {
        workspace: workspaceArg,
        from: z.string().describe('Path of the page, link or section'),
        parent: parentArg,
        before: z.string().optional().describe('Path of the sibling to put it before')
      }
    },
    tool(({ workspace, from, parent, before }: { workspace?: string; from: string; parent: string; before?: string }) => {
      const { path } = workspaceStore(workspace).move(from, parent, before ?? null)
      return { path }
    })
  )

  server.registerTool(
    'delete_item',
    {
      description: 'Delete a page, a link, or a section with everything inside (git keeps the history)',
      inputSchema: { workspace: workspaceArg, path: z.string() }
    },
    tool(({ workspace, path }: { workspace?: string; path: string }) => {
      workspaceStore(workspace).remove(path)
      return `Deleted "${path}"`
    })
  )

  server.registerTool(
    'add_asset',
    {
      description: 'Copy a local image (png, jpg, gif, webp, svg, avif) into the workspace; returns the asset name for an image block',
      inputSchema: { workspace: workspaceArg, file: z.string().describe('Absolute path of the image on this computer') }
    },
    tool(({ workspace, file }: { workspace?: string; file: string }) => {
      const source = resolve(file)
      if (!existsSync(source)) throw new Error(`No such file: ${source}`)
      return { asset: workspaceStore(workspace).addAsset({ file: source }).path }
    })
  )

  return server
}

function stripUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T
}
