import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Page } from '@core/blocks/schema'
import { DocStore } from '@core/layout/store'
import { ensureWorkspaceLayout } from '@core/layout/workspace'
import { searchPages } from '@core/search'
import { tempRoot } from './helpers'

let root: string
let store: DocStore

beforeEach(() => {
  root = tempRoot('spring-store-')
  ensureWorkspaceLayout(root, 'Docs')
  store = new DocStore(root)
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const page = (title: string, md = ''): Page => ({ title, blocks: [{ id: 'intro', type: 'text', md }] })

describe('DocStore', () => {
  it('creates sections, sub-sections, pages and links, in menu order', () => {
    const infra = store.createSection('', { title: 'Infra', icon: 'server' })
    const process = store.createSection('', { title: 'Process' })
    expect(infra).toEqual({ path: 'infra', paths: ['sections/infra/section.yaml'] })
    store.createPage('infra', page('Kubernetes'))
    store.createSection('infra', { title: 'Réseau & DNS' })
    store.createLink('infra', { title: 'Grafana', url: 'https://grafana.example.com' })
    store.createPage(process.path, page('Release'))
    store.createLink('', { title: 'Status page', url: 'https://status.example.com' })

    const tree = store.tree()
    expect(tree.map((n) => `${n.kind}:${n.path}:${n.order}`)).toEqual(['section:infra:10', 'section:process:20', 'link:status-page:30'])
    const children = (tree[0] as { children: { kind: string; path: string }[] }).children
    expect(children.map((n) => `${n.kind}:${n.path}`)).toEqual(['page:infra/kubernetes', 'section:infra/reseau-dns', 'link:infra/grafana'])
    expect(readFileSync(join(root, 'sections/infra/kubernetes.page.json'), 'utf8')).toContain('"title": "Kubernetes"')
    expect(store.readLink('infra/grafana')).toEqual({ title: 'Grafana', url: 'https://grafana.example.com', order: 30 })
    expect(store.readSection('infra')).toEqual({ title: 'Infra', icon: 'server', order: 10 })
  })

  it('never reuses a taken name', () => {
    store.createSection('', { title: 'Docs' })
    expect(store.createPage('', page('Docs')).path).toBe('docs-2')
    expect(store.createLink('', { title: 'Docs', url: 'https://x.io' }).path).toBe('docs-3')
  })

  it('refuses invalid pages, links and paths without writing', () => {
    expect(() => store.createPage('', { title: '', blocks: [] })).toThrow()
    expect(() => store.createPage('', page('Bad', '[x](page:nowhere)'))).toThrow(/Link to a missing page: page:nowhere/)
    expect(() => store.createLink('', { title: 'L', url: 'javascript:alert(1)' })).toThrow(/External links start/)
    expect(() => store.readPage('../etc/passwd')).toThrow(/Invalid path/)
    expect(() => store.createPage('nope', page('X'))).toThrow(/No section "nope"/)
    expect(store.tree()).toEqual([])
  })

  it('writes pages with their defaults and reads them back', () => {
    const { path } = store.createPage('', { title: 'P', blocks: [{ id: 'c', type: 'code', code: 'ls' } as never] })
    expect(store.readPage(path).blocks[0]).toEqual({ id: 'c', type: 'code', lang: 'text', code: 'ls' })
    store.writePage(path, { title: 'P2', blocks: [] })
    expect(store.readPage(path).title).toBe('P2')
    expect(() => store.writePage('ghost', page('x'))).toThrow(/No page "ghost"/)
  })

  it('still lists a broken page, and explains what is wrong with it', () => {
    writeFileSync(join(root, 'sections/broken.page.json'), '{"title": "Broken", "blocks": [{"id": "x", "type": "nope"}]}')
    writeFileSync(join(root, 'sections/garbage.page.json'), 'not json')
    expect(store.tree().map((n) => n.title)).toEqual(['Broken', 'garbage'])
    expect(() => store.readPage('broken')).toThrow(/Page "broken" is invalid:\nblocks\[0\]/)
    expect(() => store.readPage('garbage')).toThrow(/not valid JSON/)
    expect(store.readPageSource('garbage')).toBe('not json')
  })

  it('reorders siblings and moves nodes between sections, rewriting the links to them', () => {
    store.createSection('', { title: 'Infra' })
    store.createSection('', { title: 'Platform' })
    store.createPage('infra', page('Kubernetes', '## Setup'))
    store.createPage('infra', page('Network'))
    store.createPage('', page('Home', 'Read [k8s](page:infra/kubernetes#setup) and [net](page:infra/network).'))

    const reordered = store.move('infra/network', 'infra', 'infra/kubernetes')
    expect(reordered.path).toBe('infra/network')
    expect(store.tree('infra').map((n) => n.path)).toEqual(['infra/network', 'infra/kubernetes'])

    const moved = store.move('infra/kubernetes', 'platform', null)
    expect(moved.path).toBe('platform/kubernetes')
    expect(moved.paths).toEqual(
      expect.arrayContaining(['sections/infra/kubernetes.page.json', 'sections/platform/kubernetes.page.json', 'sections/home.page.json'])
    )
    expect((store.readPage('home').blocks[0] as { md: string }).md).toBe(
      'Read [k8s](page:platform/kubernetes#setup) and [net](page:infra/network).'
    )

    const section = store.move('infra', 'platform', null)
    expect(section.path).toBe('platform/infra')
    expect((store.readPage('home').blocks[0] as { md: string }).md).toContain('page:platform/infra/network')
    expect(() => store.move('platform', 'platform/infra', null)).toThrow(/inside itself/)
  })

  it('removes nodes', () => {
    store.createSection('', { title: 'Infra' })
    store.createPage('infra', page('K8s'))
    expect(store.remove('infra/k8s')).toEqual({ path: 'infra/k8s', paths: ['sections/infra/k8s.page.json'] })
    expect(store.remove('infra').paths).toEqual(['sections/infra'])
    expect(existsSync(join(root, 'sections/infra'))).toBe(false)
    expect(() => store.remove('')).toThrow()
  })

  it('stores images as assets under free names', () => {
    const first = store.addAsset({ name: 'Schéma réseau.PNG', data: Buffer.from('png') })
    const second = store.addAsset({ name: 'schema-reseau.png', data: Buffer.from('png') })
    expect(first.path).toBe('schema-reseau.png')
    expect(second.path).toBe('schema-reseau-2.png')
    expect(store.listAssets()).toEqual(['schema-reseau-2.png', 'schema-reseau.png'])
    expect(() => store.addAsset({ name: 'script.sh', data: Buffer.from('') })).toThrow(/Unsupported/)
    expect(() => store.assetFile('../spring.json')).toThrow(/Invalid asset/)
    const doc = store.createPage('', { title: 'Img', blocks: [{ id: 'i', type: 'image', asset: 'schema-reseau.png' }] })
    expect(store.readPage(doc.path).blocks).toHaveLength(1)
  })

  it('finds pages by their title and content', () => {
    store.createSection('', { title: 'Infra' })
    store.createPage('infra', { title: 'Kubernetes', description: 'Cluster setup', blocks: [{ id: 'c', type: 'code', lang: 'bash', code: 'kubectl rollout restart deploy/api' }] })
    store.createPage('infra', page('Réseau', 'Le VPN se configure avec WireGuard.'))
    const pages = store.allPages()
    expect(searchPages(pages, 'kube').map((h) => h.path)).toEqual(['infra/kubernetes'])
    expect(searchPages(pages, 'rollout')[0]).toMatchObject({ path: 'infra/kubernetes', title: 'Kubernetes' })
    expect(searchPages(pages, 'reseau wireguard')[0].snippet).toContain('WireGuard')
    expect(searchPages(pages, '  ')).toEqual([])
  })
})
