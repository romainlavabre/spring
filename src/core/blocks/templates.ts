// Starter content of each block type (the "+" menu of the editor) and a full
// example page (served to assistants by the MCP reference).
import type { Block, BlockType, Page } from './schema'

export const BLOCK_LABELS: Record<BlockType, { label: string; hint: string }> = {
  text: { label: 'Text', hint: 'Headings, paragraphs, lists, links' },
  callout: { label: 'Callout', hint: 'Info, tip, warning or danger box' },
  code: { label: 'Code', hint: 'Highlighted code with a copy button' },
  codeGroup: { label: 'Code tabs', hint: 'The same snippet in several languages' },
  table: { label: 'Table', hint: 'Typed columns, badges, captions' },
  timeline: { label: 'Timeline', hint: 'Vertical story or Gantt with lanes' },
  steps: { label: 'Steps', hint: 'A numbered procedure' },
  cards: { label: 'Cards', hint: 'A grid of links or highlights' },
  tabs: { label: 'Tabs', hint: 'Blocks grouped under tabs' },
  details: { label: 'Collapsible', hint: 'Blocks hidden under a summary' },
  mermaid: { label: 'Diagram', hint: 'Mermaid flowchart, sequence, ER…' },
  image: { label: 'Image', hint: 'A picture of the workspace assets' },
  divider: { label: 'Divider', hint: 'A horizontal line' }
}

/** A new block of this type, ready to edit. `image` needs its asset set by the caller. */
export function blockTemplate(type: BlockType, id: string): Block {
  switch (type) {
    case 'text':
      return { id, type, md: '' }
    case 'callout':
      return { id, type, variant: 'info', title: 'Good to know', md: '' }
    case 'code':
      return { id, type, lang: 'bash', code: '' }
    case 'codeGroup':
      return {
        id,
        type,
        items: [
          { label: 'npm', lang: 'bash', code: 'npm install' },
          { label: 'yarn', lang: 'bash', code: 'yarn' }
        ]
      }
    case 'table':
      return {
        id,
        type,
        columns: [
          { id: 'name', title: 'Name', type: 'text' },
          { id: 'value', title: 'Value', type: 'text' }
        ],
        rows: [{ name: '', value: '' }]
      }
    case 'timeline':
      return {
        id,
        type,
        view: 'vertical',
        lanes: [],
        items: [{ id: 'start', title: 'Kick-off', kind: 'milestone', start: new Date().toISOString().slice(0, 10), status: 'planned' }]
      }
    case 'steps':
      return { id, type, steps: [{ title: 'First step', md: '' }] }
    case 'cards':
      return { id, type, cards: [{ title: 'Card', md: '' }] }
    case 'tabs':
      return { id, type, tabs: [{ label: 'Tab 1', blocks: [] }] }
    case 'details':
      return { id, type, summary: 'More details', blocks: [] }
    case 'mermaid':
      return { id, type, source: 'flowchart LR\n  A[Client] --> B[API]\n  B --> C[(Database)]' }
    case 'image':
      return { id, type, asset: '' }
    case 'divider':
      return { id, type }
  }
}

/** A page using most block types, as assistants should write them. */
export const EXAMPLE_PAGE: Page = {
  title: 'Kubernetes migration',
  description: 'Moving the services from the VMs to the managed cluster',
  icon: 'container',
  blocks: [
    {
      id: 'intro',
      type: 'text',
      md: '## Context\nThe services run on **six VMs** today. See [the network page](page:infra/network) first.\n\nStatus: :badge[In progress]{color=amber}'
    },
    { id: 'warn', type: 'callout', variant: 'warning', title: 'Freeze', md: 'No deployment on Fridays during the migration.' },
    {
      id: 'plan',
      type: 'timeline',
      view: 'gantt',
      title: 'Plan',
      lanes: [
        { id: 'infra', title: 'Infra', color: 'blue' },
        { id: 'dev', title: 'Dev', color: 'violet' }
      ],
      items: [
        { id: 'cluster', title: 'Cluster', kind: 'phase', start: '2026-01', end: '2026-02', lane: 'infra', status: 'done' },
        { id: 'charts', title: 'Helm charts', kind: 'phase', start: '2026-02-15', end: '2026-04-10', lane: 'dev', status: 'current', dependsOn: ['cluster'] },
        { id: 'golive', title: 'Go live', kind: 'milestone', start: '2026-04-15', lane: 'infra', status: 'planned', dependsOn: ['charts'] }
      ]
    },
    {
      id: 'envs',
      type: 'table',
      caption: 'Environments',
      columns: [
        { id: 'env', title: 'Environment', type: 'badge', colors: { Prod: 'red', Staging: 'amber' } },
        { id: 'url', title: 'URL', type: 'md' },
        { id: 'nodes', title: 'Nodes', type: 'number', align: 'right' },
        { id: 'ha', title: 'HA', type: 'check', align: 'center' }
      ],
      rows: [
        { env: 'Prod', url: '[app.example.com](https://app.example.com)', nodes: '6', ha: 'yes' },
        { env: 'Staging', url: '[staging.example.com](https://staging.example.com)', nodes: '2', ha: 'no' }
      ],
      striped: true
    },
    { id: 'deploy', type: 'code', lang: 'bash', title: 'Deploy', code: 'helm upgrade --install api ./charts/api -n prod', highlight: '1' },
    {
      id: 'howto',
      type: 'steps',
      steps: [
        { title: 'Log in', md: 'Run `gcloud auth login`.' },
        { title: 'Get the credentials', md: 'Run `gcloud container clusters get-credentials prod`.' }
      ]
    },
    {
      id: 'flow',
      type: 'mermaid',
      source: 'flowchart LR\n  U[Users] --> LB[Load balancer] --> I[Ingress] --> S[Services]'
    }
  ]
}
