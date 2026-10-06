// Renders any block; tabs and collapsible blocks hold blocks of their own.
import clsx from 'clsx'
import { ChevronRight } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { Block, DetailsBlock, TabsBlock } from '@core/blocks/schema'
import { CalloutView, CardsView, DividerView, ImageView, StepsView, TextView } from './blocks/basic'
import { CodeGroupView, CodeView } from './blocks/Code'
import { MermaidView } from './blocks/Mermaid'
import { TableView } from './blocks/Table'
import { TimelineView } from './blocks/Timeline'
import { useDoc } from './context'

/** How the blocks inside a container are drawn: plain, or wrapped by the editor. */
export type RenderBlocks = (blocks: Block[], holder: { parent: string; tab?: number }) => ReactNode

export function BlockView({ block, renderBlocks }: { block: Block; renderBlocks?: RenderBlocks }) {
  const render = renderBlocks ?? ((blocks: Block[]) => <BlockList blocks={blocks} />)
  switch (block.type) {
    case 'text':
      return <TextView block={block} />
    case 'callout':
      return <CalloutView block={block} />
    case 'code':
      return <CodeView block={block} />
    case 'codeGroup':
      return <CodeGroupView block={block} />
    case 'table':
      return <TableView block={block} />
    case 'timeline':
      return <TimelineView block={block} />
    case 'steps':
      return <StepsView block={block} />
    case 'cards':
      return <CardsView block={block} />
    case 'mermaid':
      return <MermaidView block={block} />
    case 'image':
      return <ImageView block={block} />
    case 'divider':
      return <DividerView />
    case 'tabs':
      return <TabsView block={block} render={render} />
    case 'details':
      return <DetailsView block={block} render={render} />
  }
}

export function BlockList({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((block) => (
        <div key={block.id} id={`block-${block.id}`} className="doc-block" data-type={block.type}>
          <BlockView block={block} />
        </div>
      ))}
    </>
  )
}

function TabsView({ block, render }: { block: TabsBlock; render: RenderBlocks }) {
  const [active, setActive] = useState(0)
  const { printing } = useDoc()
  const index = Math.min(active, block.tabs.length - 1)
  if (printing) {
    return (
      <div className="doc-tabs is-printed">
        {block.tabs.map((tab, i) => (
          <section key={i} className="doc-tab-panel">
            <div className="doc-tab-printed-label">{tab.label}</div>
            {render(tab.blocks, { parent: block.id, tab: i })}
          </section>
        ))}
      </div>
    )
  }
  return (
    <div className="doc-tabs">
      <div className="doc-tab-list" role="tablist">
        {block.tabs.map((tab, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={i === index}
            className={clsx('doc-tab', i === index && 'is-active')}
            onClick={() => setActive(i)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="doc-tab-panel" role="tabpanel">
        {render(block.tabs[index].blocks, { parent: block.id, tab: index })}
      </div>
    </div>
  )
}

function DetailsView({ block, render }: { block: DetailsBlock; render: RenderBlocks }) {
  const { printing } = useDoc()
  const [open, setOpen] = useState(block.open ?? false)
  const shown = open || printing
  return (
    <div className={clsx('doc-details', shown && 'is-open')}>
      <button type="button" className="doc-details-summary" aria-expanded={shown} onClick={() => setOpen(!open)}>
        <ChevronRight className="doc-details-chevron size-4" />
        {block.summary}
      </button>
      {shown && <div className="doc-details-body">{render(block.blocks, { parent: block.id })}</div>}
    </div>
  )
}
