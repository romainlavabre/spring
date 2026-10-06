// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Block, TableBlock, TimelineBlock } from '@core/blocks/schema'
import { BlockView } from '@/doc/BlockView'
import { DocProvider, type DocEnvironment } from '@/doc/context'
import { parseDelimited, tableFromRows } from '@/features/editor/TableEditor'

beforeAll(() => {
  // jsdom lacks these browser APIs.
  globalThis.ResizeObserver = class {
    observe(): void {}
    disconnect(): void {}
    unobserve(): void {}
  }
})

afterEach(cleanup)

function show(block: Block, environment: Partial<DocEnvironment> = {}) {
  const value: DocEnvironment = {
    assetBase: 'spring-asset://ws',
    navigate: vi.fn(),
    openExternal: vi.fn(),
    printing: false,
    dark: true,
    pending: () => () => undefined,
    ...environment
  }
  return { ...render(<DocProvider value={value}>{<BlockView block={block} />}</DocProvider>), environment: value }
}

describe('Markdown', () => {
  it('renders badges and keys, and keeps unknown directives as text', () => {
    const { container } = show({ id: 't', type: 'text', md: 'Status :badge[Prod]{color=red} :kbd[Ctrl+C] at 10:30, note:important' })
    expect(container.querySelector('.doc-badge')).toMatchObject({ textContent: 'Prod' })
    expect(container.querySelector('.doc-badge')?.getAttribute('data-color')).toBe('red')
    expect(container.querySelector('kbd')?.textContent).toBe('Ctrl+C')
    expect(container.textContent).toContain('at 10:30, note:important')
  })

  it('follows page links in the app, and external links in the browser', () => {
    const { environment } = show({ id: 't', type: 'text', md: '## Setup\nSee [the VPN](page:infra/vpn#access) or [Grafana](https://grafana.acme.io).' })
    expect(screen.getByRole('heading', { name: 'Setup' }).id).toBe('setup')
    fireEvent.click(screen.getByText('the VPN'))
    expect(environment.navigate).toHaveBeenCalledWith('infra/vpn', 'access')
    fireEvent.click(screen.getByText('Grafana'))
    expect(environment.openExternal).toHaveBeenCalledWith('https://grafana.acme.io')
  })

  it('renders GitHub tables and task lists', () => {
    const { container } = show({ id: 't', type: 'text', md: '| a | b |\n|---|---|\n| 1 | 2 |\n\n- [x] done\n- [ ] todo' })
    expect(container.querySelectorAll('.doc-table td')).toHaveLength(2)
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(2)
  })
})

describe('tables', () => {
  const table: TableBlock = {
    id: 'envs',
    type: 'table',
    caption: 'Environments',
    columns: [
      { id: 'env', title: 'Environment', type: 'badge', colors: { Prod: 'red' } },
      { id: 'nodes', title: 'Nodes', type: 'number' },
      { id: 'ha', title: 'HA', type: 'check' },
      { id: 'since', title: 'Since', type: 'date' }
    ],
    rows: [
      { env: 'Prod', nodes: '12', ha: 'yes', since: '2026-03-02' },
      { env: 'Dev', nodes: '2', ha: 'no', since: '2026-01' }
    ]
  }

  it('renders typed cells', () => {
    const { container } = show(table)
    const cells = [...container.querySelectorAll('tbody tr:first-child td')]
    expect(cells[0].querySelector('.doc-badge')?.getAttribute('data-color')).toBe('red')
    expect(cells[1].textContent).toBe('12')
    expect(cells[2].querySelector('[aria-label="Yes"]')).not.toBeNull()
    expect(cells[3].textContent).toBe('2 Mar 2026')
    expect(container.querySelector('tbody tr:last-child td:last-child')?.textContent).toBe('Jan 2026')
    expect(screen.getByText('Environments')).toBeTruthy()
  })

  it('sorts numbers as numbers, then backwards, then back to the stored order', () => {
    const { container } = show(table)
    const first = (): string | null | undefined => container.querySelector('tbody tr:first-child td')?.textContent
    fireEvent.click(screen.getByRole('button', { name: 'Nodes' }))
    expect(first()).toBe('Dev')
    fireEvent.click(screen.getByRole('button', { name: 'Nodes' }))
    expect(first()).toBe('Prod')
    fireEvent.click(screen.getByRole('button', { name: 'Nodes' }))
    expect(first()).toBe('Prod')
  })

  it('builds a table from cells pasted from a spreadsheet or a CSV', () => {
    expect(parseDelimited('Name\tPort\nvpn\t51820\n')).toEqual([
      ['Name', 'Port'],
      ['vpn', '51820']
    ])
    expect(parseDelimited('a;b\n"x;1";2')).toEqual([
      ['a', 'b'],
      ['x;1', '2']
    ])
    const built = tableFromRows(table, parseDelimited('Name,Port,Name\nvpn,51820,x'))
    expect(built.columns).toEqual([
      { id: 'name', title: 'Name', type: 'text' },
      { id: 'port', title: 'Port', type: 'number' },
      { id: 'name_2', title: 'Name', type: 'text' }
    ])
    expect(built.rows).toEqual([{ name: 'vpn', port: '51820', name_2: 'x' }])
  })
})

describe('timelines', () => {
  const plan: TimelineBlock = {
    id: 'plan',
    type: 'timeline',
    view: 'gantt',
    title: 'Plan',
    lanes: [
      { id: 'infra', title: 'Infra', color: 'blue' },
      { id: 'dev', title: 'Dev' }
    ],
    items: [
      { id: 'a', title: 'Cluster', kind: 'phase', start: '2026-01', end: '2026-02', lane: 'infra', status: 'done' },
      { id: 'b', title: 'Charts', kind: 'phase', start: '2026-02-15', end: '2026-04-10', lane: 'dev', status: 'current', dependsOn: ['a'] },
      { id: 'c', title: 'Overlap', kind: 'phase', start: '2026-01-15', end: '2026-03', lane: 'infra', status: 'planned' },
      { id: 'd', title: 'Go live', kind: 'milestone', start: '2026-04-20', status: 'planned', dependsOn: ['b'], link: 'page:infra/k8s' }
    ],
    today: false
  }

  it('draws a Gantt chart: lanes, rows for overlapping phases, milestones and dependencies', () => {
    const { container, environment } = show(plan)
    expect([...container.querySelectorAll('.doc-gantt-lane-title')].map((e) => e.textContent)).toEqual(['Infra', 'Dev', 'Other'])
    const bars = [...container.querySelectorAll<HTMLElement>('.doc-gantt-bar')]
    expect(bars.map((b) => b.textContent)).toEqual(['Cluster', 'Overlap', 'Charts'])
    // Overlapping phases of a lane go on separate rows.
    expect(bars[0].style.top).not.toBe(bars[1].style.top)
    expect(bars[0].classList.contains('is-done')).toBe(true)
    expect(container.querySelectorAll('.doc-gantt-link')).toHaveLength(2)
    expect(container.querySelector('.doc-gantt-point.kind-milestone')?.textContent).toBe('Go live')
    expect(container.querySelector('.doc-gantt-today')).toBeNull()
    expect([...container.querySelectorAll('.doc-gantt-group')].map((e) => e.textContent)).toEqual(['2026'])
    fireEvent.click(container.querySelector('.doc-gantt-point')!)
    expect(environment.navigate).toHaveBeenCalledWith('infra/k8s', undefined)
    fireEvent.mouseEnter(bars[2])
    expect(container.querySelector('.doc-gantt-card')?.textContent).toContain('15 Feb – 10 Apr 2026')
  })

  it('lists the descriptions under the chart when printing', () => {
    const { container } = show({ ...plan, items: plan.items.map((i) => (i.id === 'a' ? { ...i, description: 'Done in **six** weeks' } : i)) }, { printing: true })
    expect(container.querySelector('.doc-gantt-notes')?.textContent).toContain('Done in six weeks')
  })

  it('tells a story vertically, grouped by year, and waits for half-typed dates', () => {
    const { container } = show({
      ...plan,
      view: 'vertical',
      items: [
        { id: 'x', title: 'Later', kind: 'event', start: '2027-02', status: 'planned' },
        { id: 'y', title: 'First', kind: 'phase', start: '2026-01', end: '2026-03', status: 'done', lane: 'infra' },
        { id: 'z', title: 'Typing', kind: 'event', start: '2026-1', status: 'planned' }
      ]
    })
    expect([...container.querySelectorAll('.doc-tl-year')].map((e) => e.textContent)).toEqual(['2026', '2027'])
    expect([...container.querySelectorAll('.doc-tl-heading')].map((e) => e.textContent)).toEqual(['First', 'Later'])
    expect(container.querySelector('.doc-tl-meta time')?.textContent).toBe('Jan – Mar 2026')
    expect(container.querySelector('.doc-tl-meta .doc-badge')?.textContent).toBe('Infra')
  })

  it('keeps the written order of a vertical timeline with undated items', () => {
    const { container } = show({
      ...plan,
      view: 'vertical',
      items: [
        { id: 'x', title: 'Ask for access', kind: 'event', status: 'done' },
        { id: 'y', title: 'Install', kind: 'event', start: '2027', status: 'planned' },
        { id: 'z', title: 'Configure', kind: 'event', start: '2026-05', status: 'planned' },
        { id: 'w', title: 'Check', kind: 'milestone', status: 'planned' }
      ]
    })
    expect([...container.querySelectorAll('.doc-tl-heading')].map((e) => e.textContent)).toEqual(['Ask for access', 'Install', 'Configure', 'Check'])
    expect([...container.querySelectorAll('.doc-tl-meta time')].map((e) => e.textContent)).toEqual(['2027', 'May 2026'])
    expect([...container.querySelectorAll('.doc-tl-year')].map((e) => e.textContent)).toEqual(['2027', '2026'])
  })

  it('shows the actor of the steps of a procedure, without status', () => {
    const { container } = show({
      ...plan,
      view: 'vertical',
      items: [
        { id: 'r', title: 'Request the access', kind: 'event', actor: 'Developer' },
        { id: 'g', title: 'Grant the access', kind: 'event', actor: 'CTO', status: 'done' }
      ]
    })
    const [first, second] = [...container.querySelectorAll('.doc-tl-entry')]
    expect(first.querySelector('.doc-tl-meta-end .doc-tl-actor')?.textContent).toBe('Developer')
    expect(first.querySelector('.doc-tl-actor .lucide-user')).not.toBeNull()
    expect(first.querySelector('.doc-tl-status')).toBeNull()
    expect(first.querySelector('.doc-tl-marker svg')).toBeNull()
    expect(first.className).not.toMatch(/is-/)
    // With an actor and a status, both show: the actor first.
    expect([...second.querySelectorAll('.doc-tl-meta-end > *')].map((e) => e.textContent)).toEqual(['CTO', 'Done'])
    expect(second.querySelector('.doc-tl-marker .lucide-check')).not.toBeNull()
  })

  it('shows the actor in the Gantt card and the printed notes, and leaves items without status out of the legend', () => {
    const items: TimelineBlock['items'] = [
      { id: 'a', title: 'Cluster', kind: 'phase', start: '2026-01', end: '2026-02', actor: 'Ops team', description: 'Six weeks' },
      { id: 'b', title: 'Go live', kind: 'milestone', start: '2026-03', status: 'planned' },
      { id: 'c', title: 'Retro', kind: 'event', actor: 'Lead dev', status: 'blocked' }
    ]
    const { container } = show({ ...plan, items })
    fireEvent.mouseEnter(container.querySelector('.doc-gantt-bar')!)
    expect(container.querySelector('.doc-gantt-card-meta .doc-tl-actor')?.textContent).toBe('Ops team')
    expect(container.querySelector('.doc-gantt-card-meta .doc-tl-status')).toBeNull()
    expect([...container.querySelectorAll('.doc-gantt-legend-item')].map((e) => e.textContent)).toEqual(['Planned', 'Milestone'])
    expect(container.querySelector('.doc-gantt-undated-item')?.getAttribute('title')).toBe('Lead dev · Blocked')

    const { container: printed } = show({ ...plan, items }, { printing: true })
    expect(printed.querySelector('.doc-gantt-notes dt')?.textContent).toContain('Ops team')
  })

  it('lists the undated items of a Gantt chart under it', () => {
    const { container, environment } = show({
      ...plan,
      items: [...plan.items, { id: 'e', title: 'Retro', kind: 'event', status: 'planned', lane: 'dev', dependsOn: ['d'], link: 'page:process/retro' }]
    })
    expect([...container.querySelectorAll('.doc-gantt-bar')]).toHaveLength(3)
    expect(container.querySelector('.doc-gantt-undated')?.textContent).toBe('Not datedRetro')
    fireEvent.click(screen.getByText('Retro'))
    expect(environment.navigate).toHaveBeenCalledWith('process/retro', undefined)

    const { container: none } = show({ ...plan, items: [{ id: 'e', title: 'Someday', kind: 'event', status: 'planned' }] })
    expect(none.querySelector('.doc-gantt')).toBeNull()
    expect(none.textContent).toContain('No dated item to draw yet')
    expect(none.querySelector('.doc-gantt-undated')?.textContent).toContain('Someday')
  })
})

describe('other blocks', () => {
  it('copies code', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    show({ id: 'c', type: 'code', lang: 'bash', title: 'deploy.sh', code: 'helm upgrade api' })
    expect(screen.getByText('deploy.sh')).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy code' }))
    })
    expect(writeText).toHaveBeenCalledWith('helm upgrade api')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy())
  })

  it('switches tabs, and prints all of them', () => {
    const tabs: Block = {
      id: 't',
      type: 'tabs',
      tabs: [
        { label: 'One', blocks: [{ id: 'a', type: 'text', md: 'First tab' }] },
        { label: 'Two', blocks: [{ id: 'b', type: 'text', md: 'Second tab' }] }
      ]
    }
    show(tabs)
    expect(screen.queryByText('Second tab')).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: 'Two' }))
    expect(screen.getByText('Second tab')).toBeTruthy()
    cleanup()
    show(tabs, { printing: true })
    expect(screen.getByText('First tab')).toBeTruthy()
    expect(screen.getByText('Second tab')).toBeTruthy()
  })

  it('folds details, and cards follow their links', () => {
    show({ id: 'd', type: 'details', summary: 'Why?', blocks: [{ id: 'x', type: 'text', md: 'Because.' }] })
    expect(screen.queryByText('Because.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Why?' }))
    expect(screen.getByText('Because.')).toBeTruthy()
    cleanup()
    const { environment } = show({ id: 'c', type: 'cards', cards: [{ title: 'VPN', href: 'page:infra/vpn', icon: 'shield-check' }] })
    fireEvent.click(screen.getByRole('button', { name: /VPN/ }))
    expect(environment.navigate).toHaveBeenCalledWith('infra/vpn', undefined)
  })

  it('shows images from the workspace assets, with a caption', () => {
    const { container } = show({ id: 'i', type: 'image', asset: 'schéma réseau.png', caption: 'Network', width: 'medium' })
    expect(container.querySelector('img')?.getAttribute('src')).toBe('spring-asset://ws/sch%C3%A9ma%20r%C3%A9seau.png')
    expect(container.querySelector('figure')?.className).toContain('is-medium')
    expect(screen.getByText('Network')).toBeTruthy()
  })

  it('renders callouts and steps', () => {
    const { container } = show({ id: 'c', type: 'callout', variant: 'danger', title: 'Careful', md: 'Prod **only**' })
    expect(container.querySelector('.doc-callout')?.getAttribute('data-variant')).toBe('danger')
    expect(screen.getByText('Careful')).toBeTruthy()
    cleanup()
    const steps = show({ id: 's', type: 'steps', steps: [{ title: 'Log in', md: '' }, { title: 'Deploy', md: 'Run it' }] })
    expect([...steps.container.querySelectorAll('.doc-step-number')].map((e) => e.textContent)).toEqual(['1', '2'])
  })
})
