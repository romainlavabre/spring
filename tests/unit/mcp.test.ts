import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BLOCK_TYPES } from '@core/blocks/schema'
import { DocStore } from '@core/layout/store'
import { ensureWorkspaceLayout } from '@core/layout/workspace'
import { createMcpServer } from '../../src/mcp/server'
import { tempRoot } from './helpers'

let root: string
let ws: string
let client: Client

async function connect(options: Parameters<typeof createMcpServer>[0]): Promise<Client> {
  const mcp = createMcpServer(options)
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const next = new Client({ name: 'test', version: '1' })
  await Promise.all([mcp.connect(serverTransport), next.connect(clientTransport)])
  return next
}

beforeEach(async () => {
  root = tempRoot('spring-mcp-')
  ws = join(root, 'ws')
  ensureWorkspaceLayout(ws, 'Team')
  client = await connect({ env: { SPRING_DATA_DIR: join(root, 'data') }, version: 'test', workspace: ws })
})

afterEach(async () => {
  await client.close()
  rmSync(root, { recursive: true, force: true })
})

async function call(name: string, args: Record<string, unknown> = {}): Promise<{ text: string; isError: boolean }> {
  const result = (await client.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean }
  return { text: result.content[0].text, isError: !!result.isError }
}

const json = async (name: string, args: Record<string, unknown> = {}): Promise<unknown> => {
  const result = await call(name, args)
  if (result.isError) throw new Error(result.text)
  return JSON.parse(result.text)
}

describe('MCP server', () => {
  it('lists its tools', async () => {
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual([
      'add_asset',
      'add_block',
      'create_link',
      'create_page',
      'create_section',
      'delete_block',
      'delete_item',
      'get_page',
      'get_reference',
      'get_tree',
      'list_workspaces',
      'move_block',
      'move_item',
      'search',
      'update_block',
      'update_link',
      'update_page',
      'update_section',
      'validate_page'
    ])
  })

  it('serves the conventions, the JSON Schema of every block and an example', async () => {
    const overview = (await call('get_reference')).text
    expect(overview).toContain('[label](page:section/page)')
    for (const type of BLOCK_TYPES) expect(overview).toContain(`- ${type}:`)
    const schema = JSON.parse((await call('get_reference', { topic: 'blocks' })).text.split('\n\n')[1]) as { properties: Record<string, unknown> }
    expect(Object.keys(schema.properties)).toEqual(expect.arrayContaining(['title', 'blocks']))
    const timeline = (await call('get_reference', { topic: 'timeline' })).text
    expect(timeline).toContain('"dependsOn"')
    expect(timeline).toContain('Example:')
    expect((await call('get_reference', { topic: 'example' })).text).toContain('"type": "timeline"')
  })

  it('writes a documentation from scratch, the way an assistant does', async () => {
    expect(await json('create_section', { title: 'Infra', icon: 'server' })).toEqual({ path: 'infra' })
    expect(await json('create_section', { title: 'Liens externes' })).toEqual({ path: 'liens-externes' })
    expect(await json('create_link', { parent: 'liens-externes', title: 'Grafana', url: 'https://grafana.example.com' })).toEqual({
      path: 'liens-externes/grafana'
    })
    const created = (await json('create_page', {
      parent: 'infra',
      title: 'Kubernetes',
      description: 'The cluster',
      blocks: [
        { type: 'text', md: '## Context\nWe run on GKE.' },
        {
          id: 'plan',
          type: 'timeline',
          view: 'gantt',
          lanes: [{ id: 'infra', title: 'Infra', color: 'blue' }],
          items: [
            { id: 'a', title: 'Cluster', kind: 'phase', start: '2026-01', end: '2026-02', lane: 'infra', status: 'done' },
            { id: 'b', title: 'Go live', start: '2026-03-01', lane: 'infra', dependsOn: ['a'] }
          ]
        },
        { type: 'tabs', tabs: [{ label: 'Prod', blocks: [{ type: 'code', lang: 'bash', code: 'kubectl get pods -n prod' }] }] }
      ]
    })) as { path: string; blocks: { id: string; type: string }[] }
    expect(created.path).toBe('infra/kubernetes')
    expect(created.blocks.map((b) => b.type)).toEqual(['text', 'timeline', 'tabs', 'code'])
    expect(created.blocks[1].id).toBe('plan')

    const tree = (await call('get_tree')).text
    expect(tree).toBe(
      [
        '▸ Infra  (section: infra)',
        '  • Kubernetes  (page: infra/kubernetes)',
        '▸ Liens externes  (section: liens-externes)',
        '  ↗ Grafana  (link: liens-externes/grafana → https://grafana.example.com)'
      ].join('\n')
    )
    const page = JSON.parse((await call('get_page', { path: 'infra/kubernetes' })).text) as { blocks: { items?: { kind: string; status?: string }[] }[] }
    // Defaults are filled in; the status has none.
    expect(page.blocks[1].items?.[1]).toMatchObject({ kind: 'event' })
    expect(page.blocks[1].items?.[1].status).toBeUndefined()
  })

  it('edits a page block by block', async () => {
    await json('create_page', { title: 'Runbook', blocks: [{ id: 'intro', type: 'text', md: 'Hello' }] })
    const { id } = (await json('add_block', { path: 'runbook', block: { type: 'callout', variant: 'warning', md: 'Careful' }, before: 'intro' })) as {
      id: string
    }
    expect(id).toMatch(/^b-/)
    await json('add_block', { path: 'runbook', block: { id: 'more', type: 'details', summary: 'More', blocks: [] } })
    await json('add_block', { path: 'runbook', block: { id: 'deep', type: 'divider' }, parent: 'more' })
    expect(await json('update_block', { path: 'runbook', id: 'intro', fields: { md: 'Hello world' } })).toEqual({
      id: 'intro',
      type: 'text',
      md: 'Hello world'
    })
    expect(await json('move_block', { path: 'runbook', id: 'intro', before: id })).toEqual(['intro (text)', `${id} (callout)`, 'more (details, holds blocks)'])
    expect((await call('delete_block', { path: 'runbook', id: 'more' })).text).toBe('Deleted block "more"')
    const page = new DocStore(ws).readPage('runbook')
    expect(page.blocks.map((b) => b.id)).toEqual(['intro', id])

    await json('update_page', { path: 'runbook', title: 'Runbook prod', icon: 'siren' })
    expect(new DocStore(ws).readPage('runbook')).toMatchObject({ title: 'Runbook prod', icon: 'siren' })
  })

  it('refuses invalid writes, says why, and leaves the file untouched', async () => {
    await json('create_page', { title: 'Plan', blocks: [{ id: 'intro', type: 'text', md: 'x' }] })
    const before = readFileSync(join(ws, 'sections/plan.page.json'), 'utf8')

    const bad = await call('add_block', {
      path: 'plan',
      block: { type: 'timeline', items: [{ id: 'a', title: 'A', kind: 'phase', start: '2026-05', end: '2026-01', lane: 'ghost' }] }
    })
    expect(bad.isError).toBe(true)
    expect(bad.text).toContain('blocks[1].items[0].lane: Unknown lane "ghost"')
    expect(bad.text).toContain('blocks[1].items[0].end: Ends (2026-01) before it starts (2026-05)')

    expect((await call('update_block', { path: 'plan', id: 'intro', fields: { md: 'See [x](page:missing)' } })).text).toContain(
      'Link to a missing page: page:missing'
    )
    expect((await call('update_block', { path: 'plan', id: 'intro', fields: { type: 'video' } })).isError).toBe(true)
    expect((await call('create_page', { title: 'X', blocks: [{ type: 'table', columns: [], rows: [] }] })).text).toContain('blocks[0].columns')
    expect((await call('create_link', { title: 'Bad', url: 'file:///etc/passwd' })).isError).toBe(true)
    expect(readFileSync(join(ws, 'sections/plan.page.json'), 'utf8')).toBe(before)
    expect(existsSync(join(ws, 'sections/x.page.json'))).toBe(false)

    expect((await call('validate_page', { page: { title: 'T', blocks: [{ id: 'd', type: 'divider' }] } })).text).toBe('The page is valid.')
    expect((await call('validate_page', { path: 'plan' })).text).toBe('The page is valid.')
  })

  it('moves and deletes items, keeping links between pages right', async () => {
    await json('create_section', { title: 'Infra' })
    await json('create_section', { title: 'Platform' })
    await json('create_page', { parent: 'infra', title: 'DNS', blocks: [] })
    await json('create_page', { title: 'Home', blocks: [{ id: 't', type: 'text', md: '[DNS](page:infra/dns)' }] })
    expect(await json('move_item', { from: 'infra/dns', parent: 'platform' })).toEqual({ path: 'platform/dns' })
    expect(new DocStore(ws).readPage('home').blocks[0]).toEqual({ id: 't', type: 'text', md: '[DNS](page:platform/dns)' })
    expect((await call('delete_item', { path: 'infra' })).text).toBe('Deleted "infra"')
    expect((await call('get_tree')).text).not.toContain('Infra')
  })

  it('adds images and searches pages', async () => {
    const image = join(root, 'Schéma.png')
    writeFileSync(image, 'png')
    expect(await json('add_asset', { file: image })).toEqual({ asset: 'schema.png' })
    await json('create_page', { title: 'Network', blocks: [{ type: 'image', asset: 'schema.png', caption: 'VPN' }, { type: 'text', md: 'WireGuard tunnels' }] })
    expect(await json('search', { query: 'wireguard' })).toEqual([{ path: 'network', title: 'Network', snippet: expect.stringContaining('WireGuard') }])
    expect((await call('search', { query: 'nothing-here' })).text).toBe('No page matches.')
  })

  it('works on the workspaces of the app, the active one by default', async () => {
    const data = join(root, 'data')
    const other = join(root, 'other')
    ensureWorkspaceLayout(other, 'Other')
    mkdirSync(data, { recursive: true })
    writeFileSync(
      join(data, 'workspaces.json'),
      JSON.stringify({ repos: [{ id: '1', name: 'Team', path: ws }, { id: '2', name: 'Other', path: other }], activeRepoId: '2' })
    )
    const app = await connect({ env: { SPRING_DATA_DIR: data }, version: 'test' })
    const result = (await app.callTool({ name: 'list_workspaces', arguments: {} })) as { content: { text: string }[] }
    expect(JSON.parse(result.content[0].text)).toEqual([
      { name: 'Team', path: ws, active: false },
      { name: 'Other', path: other, active: true }
    ])
    await app.callTool({ name: 'create_page', arguments: { title: 'In other', blocks: [] } })
    await app.callTool({ name: 'create_page', arguments: { workspace: 'Team', title: 'In team', blocks: [] } })
    expect(existsSync(join(other, 'sections/in-other.page.json'))).toBe(true)
    expect(existsSync(join(ws, 'sections/in-team.page.json'))).toBe(true)
    const missing = (await app.callTool({ name: 'get_tree', arguments: { workspace: 'Nope' } })) as { content: { text: string }[] }
    expect(missing.content[0].text).toBe('No workspace "Nope". Known: Team, Other')
    await app.close()
  })
})
