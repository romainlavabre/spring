import { describe, expect, it } from 'vitest'
import { endDay, formatDate, formatRange, startDay } from '@core/blocks/dates'
import {
  addBlock,
  allBlocks,
  deleteBlock,
  findBlock,
  headingAnchor,
  headingsOf,
  moveBlock,
  newBlockId,
  pageText,
  rewritePageLinks,
  updateBlock,
  withFreshIds
} from '@core/blocks/ops'
import { BLOCK_TYPES, type Block, type Page, type TimelineBlock } from '@core/blocks/schema'
import { blockTemplate, EXAMPLE_PAGE } from '@core/blocks/templates'
import { validatePage } from '@core/blocks/validate'
import { stableJson } from '@core/layout/json'

const page = (blocks: Block[]): Page => ({ title: 'Page', blocks })

const timeline = (patch: Partial<TimelineBlock> = {}): TimelineBlock => ({
  id: 'plan',
  type: 'timeline',
  view: 'gantt',
  lanes: [{ id: 'infra', title: 'Infra' }],
  items: [
    { id: 'a', title: 'A', kind: 'phase', start: '2026-01', end: '2026-02', lane: 'infra', status: 'done' },
    { id: 'b', title: 'B', kind: 'milestone', start: '2026-03-01', status: 'planned', dependsOn: ['a'] }
  ],
  ...patch
})

describe('block schemas', () => {
  it('accepts the example page and every block template', () => {
    expect(validatePage(EXAMPLE_PAGE)).toMatchObject({ ok: true })
    const blocks = BLOCK_TYPES.map((type, i) => blockTemplate(type, `b-${i}`)).map((b) => (b.type === 'image' ? { ...b, asset: 'x.png' } : b))
    expect(validatePage(page(blocks))).toMatchObject({ ok: true })
  })

  it('fills the defaults in', () => {
    const result = validatePage({ title: 'T', blocks: [{ id: 'c', type: 'code', code: 'ls' }, { id: 'k', type: 'callout', md: 'x' }] })
    expect(result.ok && result.page.blocks).toEqual([
      { id: 'c', type: 'code', lang: 'text', code: 'ls' },
      { id: 'k', type: 'callout', variant: 'info', md: 'x' }
    ])
  })

  it('reports where a value is wrong', () => {
    const result = validatePage({ title: 'T', blocks: [{ id: 't', type: 'text', md: 'ok' }, timeline({ items: [{ id: 'x', title: 'X', start: '2026-13' }] as never })] })
    expect(result.ok).toBe(false)
    expect(result.issues).toEqual([{ path: 'blocks[1].items[0].start', message: 'Dates are YYYY, YYYY-MM or YYYY-MM-DD' }])
  })

  it('rejects unknown block types and bad ids', () => {
    expect(validatePage({ title: 'T', blocks: [{ id: 'x', type: 'video' }] }).ok).toBe(false)
    const bad = validatePage({ title: 'T', blocks: [{ id: 'Bad Id', type: 'divider' }] })
    expect(bad.issues[0].path).toBe('blocks[0].id')
  })

  it('rejects duplicate ids, nested ones included', () => {
    const result = validatePage(
      page([
        { id: 'same', type: 'divider' },
        { id: 'tabs', type: 'tabs', tabs: [{ label: 'A', blocks: [{ id: 'same', type: 'divider' }] }] }
      ])
    )
    expect(result.issues).toEqual([{ path: 'blocks[1].tabs[0].blocks[0].id', message: 'Duplicate block id "same" (also at blocks[0])' }])
  })

  it('checks the lanes, dates and dependencies of timelines', () => {
    const result = validatePage(
      page([
        timeline({
          items: [
            { id: 'a', title: 'A', kind: 'phase', start: '2026-03', end: '2026-02', lane: 'ops', status: 'done' },
            { id: 'b', title: 'B', kind: 'event', start: '2026-03', end: '2026-04', status: 'planned', dependsOn: ['zzz', 'b'] },
            { id: 'a', title: 'A again', kind: 'event', start: '2026', status: 'planned' },
            { id: 'c', title: 'C', kind: 'phase', end: '2026-04', status: 'planned' }
          ]
        })
      ])
    )
    expect(result.issues.map((i) => `${i.path}: ${i.message}`)).toEqual([
      'blocks[0].items[2].id: Duplicate item id "a"',
      'blocks[0].items[0].lane: Unknown lane "ops" (lanes: infra)',
      'blocks[0].items[0].end: Ends (2026-02) before it starts (2026-03)',
      'blocks[0].items[1].end: Only phases have an end: set kind to "phase" or remove the end',
      'blocks[0].items[1].dependsOn: Unknown item "zzz"',
      'blocks[0].items[1].dependsOn: An item cannot depend on itself',
      'blocks[0].items[3].end: An end needs a start: set the start or remove the end'
    ])
  })

  it('accepts timeline items without a date', () => {
    const result = validatePage(page([timeline({ view: 'vertical', items: [{ id: 'a', title: 'Ask for access' }, { id: 'b', title: 'Install', kind: 'phase' }] as never })]))
    expect(result.ok).toBe(true)
    expect(result.ok && (result.page.blocks[0] as TimelineBlock).items[0]).toEqual({ id: 'a', title: 'Ask for access', kind: 'event', status: 'planned' })
  })

  it('checks the columns of tables', () => {
    const result = validatePage(
      page([
        {
          id: 't',
          type: 'table',
          columns: [
            { id: 'a', title: 'A', type: 'text' },
            { id: 'a', title: 'A2', type: 'text' }
          ],
          rows: [{ a: '1', z: '2' }],
          headerGroups: [{ title: 'G', span: 3 }]
        }
      ])
    )
    expect(result.issues.map((i) => i.path)).toEqual(['blocks[0].columns[1].id', 'blocks[0].rows[0].z', 'blocks[0].headerGroups'])
  })

  it('checks links and assets against the workspace', () => {
    const doc = page([
      { id: 't', type: 'text', md: 'See [x](page:infra/missing) and [y](page:infra/k8s#setup)' },
      { id: 'c', type: 'cards', cards: [{ title: 'C', href: 'page:nowhere' }] },
      { id: 'i', type: 'image', asset: 'gone.png' }
    ])
    const result = validatePage(doc, { pageExists: (p) => p === 'infra/k8s', assetExists: () => false })
    expect(result.issues.map((i) => i.message)).toEqual([
      'Link to a missing page: page:infra/missing',
      'Link to a missing page: page:nowhere',
      'No asset "gone.png" in the workspace: add it first'
    ])
  })
})

describe('block operations', () => {
  const base = page([
    { id: 'a', type: 'text', md: 'A' },
    { id: 'tabs', type: 'tabs', tabs: [{ label: 'One', blocks: [{ id: 'in', type: 'divider' }] }, { label: 'Two', blocks: [] }] },
    { id: 'z', type: 'divider' }
  ])

  it('adds blocks after, before, at the end or inside a container', () => {
    let next = addBlock(base, { id: 'n1', type: 'divider' }, { after: 'a' })
    next = addBlock(next, { id: 'n2', type: 'divider' }, { before: 'a' })
    next = addBlock(next, { id: 'n3', type: 'divider' })
    next = addBlock(next, { id: 'n4', type: 'divider' }, { parent: 'tabs', tab: 1 })
    expect(next.blocks.map((b) => b.id)).toEqual(['n2', 'a', 'n1', 'tabs', 'z', 'n3'])
    expect(findBlock(next, 'n4')).toEqual({ id: 'n4', type: 'divider' })
    expect((next.blocks[3] as { tabs: { blocks: Block[] }[] }).tabs[1].blocks.map((b) => b.id)).toEqual(['n4'])
    // The page given is untouched.
    expect(base.blocks).toHaveLength(3)
  })

  it('refuses duplicates, unknown anchors and non-containers', () => {
    expect(() => addBlock(base, { id: 'a', type: 'divider' })).toThrow(/already has a block "a"/)
    expect(() => addBlock(base, { id: 'q', type: 'divider' }, { after: 'nope' })).toThrow(/No block "nope"/)
    expect(() => addBlock(base, { id: 'q', type: 'divider' }, { parent: 'a' })).toThrow(/only tabs and details hold blocks/)
  })

  it('updates, merges, moves and deletes blocks', () => {
    expect(findBlock(updateBlock(base, 'a', { id: 'a', type: 'text', md: 'B' }), 'a')).toEqual({ id: 'a', type: 'text', md: 'B' })
    expect(findBlock(updateBlock(base, 'in', { type: 'divider' }, true), 'in')).toEqual({ id: 'in', type: 'divider' })
    expect(() => updateBlock(base, 'a', { id: 'b', type: 'text', md: '' })).toThrow(/cannot change/)
    expect(moveBlock(base, 'z', { before: 'a' }).blocks.map((b) => b.id)).toEqual(['z', 'a', 'tabs'])
    expect(findBlock(moveBlock(base, 'in', { after: 'z' }), 'in')).toBeTruthy()
    expect(moveBlock(base, 'in', { after: 'z' }).blocks.map((b) => b.id)).toEqual(['a', 'tabs', 'z', 'in'])
    expect(() => moveBlock(base, 'tabs', { parent: 'tabs' })).toThrow(/inside itself/)
    expect(allBlocks(deleteBlock(base, 'tabs')).map((b) => b.id)).toEqual(['a', 'z'])
  })

  it('gives fresh ids to copies, nested blocks included', () => {
    const copy = withFreshIds(base, base.blocks[1])
    const ids = allBlocks({ blocks: [copy] }).map((b) => b.id)
    expect(ids).toHaveLength(2)
    for (const id of ids) expect(['tabs', 'in']).not.toContain(id)
    expect(newBlockId(base)).toMatch(/^b-[a-z0-9]+$/)
  })

  it('extracts text, headings and anchors', () => {
    const doc = page([
      { id: 't', type: 'text', md: '## Setup the *cluster*\ntext\n```\n## not a heading\n```\n### Accès réseau' },
      { id: 'c', type: 'code', lang: 'bash', code: 'kubectl get pods' }
    ])
    expect(headingsOf(doc)).toEqual([
      { blockId: 't', level: 2, text: 'Setup the cluster' },
      { blockId: 't', level: 3, text: 'Accès réseau' }
    ])
    expect(headingAnchor('Accès réseau')).toBe('acces-reseau')
    expect(pageText(doc)).toContain('kubectl get pods')
  })

  it('rewrites page links when a page or a section moves', () => {
    const doc = page([
      { id: 't', type: 'text', md: '[a](page:infra/k8s) [b](page:infra/k8s/x) [c](page:infra/k8s-old#top) [d](page:infra#x)' },
      { id: 'c', type: 'cards', cards: [{ title: 'C', href: 'page:infra/k8s' }] },
      timeline({ items: [{ id: 'a', title: 'A', kind: 'event', start: '2026', status: 'done', link: 'page:infra/k8s' }] })
    ])
    const moved = rewritePageLinks(doc, 'infra/k8s', 'platform/k8s')
    expect((moved.blocks[0] as { md: string }).md).toBe('[a](page:platform/k8s) [b](page:platform/k8s/x) [c](page:infra/k8s-old#top) [d](page:infra#x)')
    expect((moved.blocks[1] as { cards: { href: string }[] }).cards[0].href).toBe('page:platform/k8s')
    expect((moved.blocks[2] as TimelineBlock).items[0].link).toBe('page:platform/k8s')
  })
})

describe('dates', () => {
  it('reads years, months and days as periods', () => {
    expect(endDay('2026-02') - startDay('2026-02')).toBe(27)
    expect(endDay('2024-02') - startDay('2024-02')).toBe(28)
    expect(endDay('2026') - startDay('2026')).toBe(364)
    expect(startDay('2026-03-01')).toBe(endDay('2026-02') + 1)
    expect(formatDate('2026-03-05')).toBe('5 Mar 2026')
    expect(formatRange('2026-01', '2026-03')).toBe('Jan – Mar 2026')
    expect(formatRange('2025-11', '2026-02')).toBe('Nov 2025 – Feb 2026')
  })
})

describe('stable JSON', () => {
  it('keeps plain objects and arrays on one line', () => {
    expect(stableJson({ title: 'T', rows: [{ a: '1', b: '2' }], tags: ['x', 'y'], nested: { list: [{ deep: { x: 1 } }] } })).toBe(
      '{\n  "title": "T",\n  "rows": [\n    { "a": "1", "b": "2" }\n  ],\n  "tags": ["x", "y"],\n  "nested": {\n    "list": [\n      {\n        "deep": { "x": 1 }\n      }\n    ]\n  }\n}\n'
    )
  })

  it('breaks long or multi-line values', () => {
    const text = stableJson({ md: 'a\nb', long: 'x'.repeat(200) })
    expect(text).toBe(`{\n  "md": "a\\nb",\n  "long": "${'x'.repeat(200)}"\n}\n`)
    expect(JSON.parse(text)).toEqual({ md: 'a\nb', long: 'x'.repeat(200) })
  })
})
