// Text, callouts, steps, cards, images and dividers.
import clsx from 'clsx'
import { AlertTriangle, ArrowUpRight, CheckCircle2, Info, Lightbulb, OctagonAlert, StickyNote } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { CalloutBlock, CardsBlock, ImageBlock, StepsBlock, TextBlock } from '@core/blocks/schema'
import { useDoc, useFollow } from '../context'
import { NamedIcon } from '../Icon'
import { ExpandButton, Lightbox } from '../Lightbox'
import { Markdown, Prose } from '../Markdown'

export function TextView({ block }: { block: TextBlock }) {
  if (!block.md.trim()) return <div className="doc-empty-text">Empty text</div>
  return <Prose md={block.md} />
}

const CALLOUT_ICONS: Record<CalloutBlock['variant'], ReactNode> = {
  info: <Info />,
  tip: <Lightbulb />,
  success: <CheckCircle2 />,
  warning: <AlertTriangle />,
  danger: <OctagonAlert />,
  note: <StickyNote />
}

export function CalloutView({ block }: { block: CalloutBlock }) {
  return (
    <aside className="doc-callout" data-variant={block.variant}>
      <div className="doc-callout-icon">{CALLOUT_ICONS[block.variant]}</div>
      <div className="doc-callout-body">
        {block.title && <div className="doc-callout-title">{block.title}</div>}
        <Prose md={block.md} />
      </div>
    </aside>
  )
}

export function StepsView({ block }: { block: StepsBlock }) {
  return (
    <ol className="doc-steps">
      {block.steps.map((step, i) => (
        <li key={i} className="doc-step">
          <div className="doc-step-number">{i + 1}</div>
          <div className="doc-step-body">
            <div className="doc-step-title">{step.title}</div>
            <Prose md={step.md} />
          </div>
        </li>
      ))}
    </ol>
  )
}

export function CardsView({ block }: { block: CardsBlock }) {
  const follow = useFollow()
  const columns = block.columns ?? (block.cards.length % 3 === 0 || block.cards.length > 4 ? 3 : 2)
  return (
    <div className="doc-cards" style={{ ['--columns' as string]: columns }}>
      {block.cards.map((card, i) => {
        const content = (
          <>
            <div className="doc-card-head">
              {card.icon && (
                <span className="doc-card-icon" data-color={card.color ?? 'red'}>
                  <NamedIcon name={card.icon} fallback="file-text" className="size-4" />
                </span>
              )}
              <span className="doc-card-title">{card.title}</span>
              {card.href && <ArrowUpRight className="doc-card-arrow size-4" />}
            </div>
            {card.md && (
              <div className="doc-card-text">
                <Markdown>{card.md}</Markdown>
              </div>
            )}
          </>
        )
        return card.href ? (
          <button key={i} type="button" className="doc-card is-link" data-color={card.color} onClick={() => follow(card.href!)}>
            {content}
          </button>
        ) : (
          <div key={i} className="doc-card" data-color={card.color}>
            {content}
          </div>
        )
      })}
    </div>
  )
}

export function ImageView({ block }: { block: ImageBlock }) {
  const { assetBase, printing } = useDoc()
  const [zoomed, setZoomed] = useState(false)
  const src = `${assetBase}/${encodeURIComponent(block.asset)}`
  return (
    <figure className={clsx('doc-image', `is-${block.width ?? 'full'}`)}>
      <div className="doc-zoomable">
        <img src={src} alt={block.alt ?? block.caption ?? ''} onClick={() => !printing && setZoomed(true)} />
        {!printing && <ExpandButton onClick={() => setZoomed(true)} />}
      </div>
      {block.caption && <figcaption>{block.caption}</figcaption>}
      {zoomed && (
        <Lightbox label={block.caption ?? block.alt ?? 'Image'} onClose={() => setZoomed(false)}>
          <img src={src} alt={block.alt ?? ''} draggable={false} />
        </Lightbox>
      )}
    </figure>
  )
}

export function DividerView() {
  return <hr className="doc-divider" />
}
