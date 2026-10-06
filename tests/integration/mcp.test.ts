// The real CLI bundle as an MCP server on stdio, as Claude runs it, writing
// in a workspace that two users share through a git remote.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { DocStore } from '@core/layout/store'
import { bareRemote, git, tempRoot, user } from '../unit/helpers'

const CLI = resolve(__dirname, '../../out/cli/spring.cjs')

let root: string
let client: Client | null = null

beforeAll(() => {
  if (!existsSync(CLI)) throw new Error('Build the CLI first: npm run build')
})

beforeEach(() => {
  root = tempRoot('spring-int-')
})

afterEach(async () => {
  await client?.close()
  client = null
  rmSync(root, { recursive: true, force: true })
})

async function connect(args: string[], env: Record<string, string> = {}): Promise<Client> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [CLI, 'mcp', ...args],
    env: { ...(process.env as Record<string, string>), ...env },
    stderr: 'pipe'
  })
  client = new Client({ name: 'claude-like', version: '1' })
  await client.connect(transport)
  return client
}

async function call(name: string, args: Record<string, unknown>): Promise<{ text: string; isError: boolean }> {
  const result = (await client!.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean }
  return { text: result.content[0].text, isError: !!result.isError }
}

async function json<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
  const result = await call(name, args)
  if (result.isError) throw new Error(`${name}: ${result.text}`)
  return JSON.parse(result.text) as T
}

describe('spring mcp over stdio', () => {
  it('writes documentation that the app commits and a colleague pulls', async () => {
    const remote = bareRemote(root)
    const alice = user(root, 'alice')
    const repo = await alice.ws.clone('Team docs', remote)
    await alice.ws.flush()

    // Claude writes through the MCP server, on the workspaces of the app.
    const data = join(root, 'alice-data')
    mkdirSync(data, { recursive: true })
    writeFileSync(join(data, 'workspaces.json'), JSON.stringify({ repos: [{ id: repo.id, name: repo.name, path: repo.path }], activeRepoId: repo.id }))
    await connect([], { SPRING_DATA_DIR: data })

    expect((await call('get_reference', {})).text).toContain('Block types:')
    expect(await json('list_workspaces', {})).toEqual([{ name: 'Team docs', path: repo.path, active: true }])
    await json('create_section', { title: 'Infra', icon: 'server' })
    await json('create_section', { title: 'Liens externes', icon: 'link' })
    await json('create_link', { parent: 'liens-externes', title: 'Grafana', url: 'https://grafana.acme.io' })
    const created = await json<{ path: string }>('create_page', {
      parent: 'infra',
      title: 'Kubernetes',
      description: 'The cluster',
      icon: 'container',
      blocks: [
        { id: 'intro', type: 'text', md: '## Overview\nWe run on GKE.' },
        {
          id: 'plan',
          type: 'timeline',
          view: 'gantt',
          lanes: [
            { id: 'infra', title: 'Infra', color: 'blue' },
            { id: 'dev', title: 'Dev', color: 'violet' }
          ],
          items: [
            { id: 'cluster', title: 'Cluster', kind: 'phase', start: '2026-01', end: '2026-02', lane: 'infra', status: 'done' },
            { id: 'charts', title: 'Charts', kind: 'phase', start: '2026-02-15', end: '2026-04', lane: 'dev', status: 'current', dependsOn: ['cluster'] },
            { id: 'live', title: 'Go live', kind: 'milestone', start: '2026-04-20', lane: 'infra', dependsOn: ['charts'] }
          ]
        },
        {
          id: 'envs',
          type: 'table',
          columns: [
            { id: 'env', title: 'Environment', type: 'badge' },
            { id: 'nodes', title: 'Nodes', type: 'number' }
          ],
          rows: [
            { env: 'Prod', nodes: '6' },
            { env: 'Staging', nodes: '2' }
          ]
        }
      ]
    })
    expect(created.path).toBe('infra/kubernetes')

    // Then it edits block by block.
    const { id } = await json<{ id: string }>('add_block', {
      path: 'infra/kubernetes',
      block: { type: 'code', lang: 'bash', title: 'Deploy', code: 'helm upgrade --install api ./chart' },
      after: 'plan'
    })
    await json('update_block', { path: 'infra/kubernetes', id: 'intro', fields: { md: '## Overview\nWe run on **GKE**, see [Grafana](https://grafana.acme.io).' } })
    await json('move_block', { path: 'infra/kubernetes', id: 'envs', before: id })

    // A mistake is refused with its place, and nothing is written.
    const before = readFileSync(join(repo.path, 'sections/infra/kubernetes.page.json'), 'utf8')
    const refused = await call('update_block', { path: 'infra/kubernetes', id: 'plan', fields: { lanes: [] } })
    expect(refused.isError).toBe(true)
    expect(refused.text).toContain('blocks[1].items[0].lane: Unknown lane "infra"')
    expect(readFileSync(join(repo.path, 'sections/infra/kubernetes.page.json'), 'utf8')).toBe(before)

    expect(new DocStore(repo.path).readPage('infra/kubernetes').blocks.map((b) => b.id)).toEqual(['intro', 'plan', 'envs', id])

    // The app commits what the assistant wrote at its next sync, and pushes it.
    const status = await alice.ws.sync(repo.id)
    expect(status).toMatchObject({ error: null, ahead: 0, dirty: false })

    // A colleague clones the workspace and reads the same documentation.
    const bob = user(root, 'bob')
    const bobRepo = await bob.ws.clone('Team docs', remote)
    const store = new DocStore(bobRepo.path)
    expect(store.tree().map((n) => n.title)).toEqual(['Infra', 'Liens externes'])
    expect(store.readPage('infra/kubernetes')).toMatchObject({ title: 'Kubernetes', description: 'The cluster' })
    expect(store.readLink('liens-externes/grafana').url).toBe('https://grafana.acme.io')
    expect(git(remote, 'log', '-1', '--format=%s', 'master').trim()).toBe('Update workspace')
  })

  it('serves a fixed workspace folder, and the CLI validates its pages', async () => {
    const ws = join(root, 'ws')
    mkdirSync(ws)
    execFileSync(process.execPath, [CLI, 'help'])
    await connect(['--workspace', ws])
    expect((await call('get_tree', {})).text).toContain('is not a Spring workspace (no spring.json)')

    // spring.json is missing: the folder is not a workspace yet.
    writeFileSync(join(ws, 'spring.json'), JSON.stringify({ name: 'WS', formatVersion: 1 }))
    mkdirSync(join(ws, 'sections'))
    await json('create_page', { title: 'Home', blocks: [{ type: 'text', md: 'Hello' }] })
    expect((await call('get_tree', {})).text).toBe('• Home  (page: home)')

    const valid = spawnSync(process.execPath, [CLI, 'validate', '--workspace', ws], { encoding: 'utf8' })
    expect(valid.status).toBe(0)
    expect(valid.stdout).toBe('1 pages, all valid\n')

    writeFileSync(join(ws, 'sections/broken.page.json'), JSON.stringify({ title: 'Broken', blocks: [{ id: 'x', type: 'text', md: '[a](page:nowhere)' }] }))
    const invalid = spawnSync(process.execPath, [CLI, 'validate'], { cwd: ws, encoding: 'utf8' })
    expect(invalid.status).toBe(1)
    expect(invalid.stderr).toContain('✗ broken\n    blocks[0]: Link to a missing page: page:nowhere')
    expect(invalid.stdout).toBe('1 of 2 pages have issues\n')

    const pdf = spawnSync(process.execPath, [CLI, 'export', 'home', '-o', 'x.pdf'], { cwd: ws, encoding: 'utf8' })
    expect(pdf.status).toBe(2)
    expect(pdf.stderr).toContain('PDF export needs the Spring app')
  })
})
