// Shows an image or a diagram over the whole window: wheel or buttons to zoom, drag to pan, Escape to close.
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Maximize2, Minus, Plus, X } from 'lucide-react'

const MIN = 0.25
const MAX = 8

interface View {
  scale: number
  x: number
  y: number
}

const FIT: View = { scale: 1, x: 0, y: 0 }

export function Lightbox({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const [view, setView] = useState<View>(FIT)
  const stage = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; moved: boolean; backdrop: boolean } | null>(null)

  /** Zooms by a factor, keeping the point under (cx, cy), relative to the centre of the stage, in place. */
  const zoom = useCallback((factor: number, cx = 0, cy = 0) => {
    setView((current) => {
      const scale = Math.min(MAX, Math.max(MIN, current.scale * factor))
      const ratio = scale / current.scale
      return { scale, x: cx - (cx - current.x) * ratio, y: cy - (cy - current.y) * ratio }
    })
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
      else if (event.key === '+' || event.key === '=') zoom(1.25)
      else if (event.key === '-') zoom(0.8)
      else if (event.key === '0') setView(FIT)
      else return
      event.preventDefault()
      event.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose, zoom])

  // React registers wheel listeners as passive: the page would scroll behind.
  useEffect(() => {
    const element = stage.current
    if (!element) return
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault()
      const box = element.getBoundingClientRect()
      zoom(Math.exp(-event.deltaY * 0.0015), event.clientX - box.left - box.width / 2, event.clientY - box.top - box.height / 2)
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [zoom])

  const onPointerDown = (event: ReactPointerEvent): void => {
    if (event.button !== 0) return
    drag.current = { x: event.clientX, y: event.clientY, moved: false, backdrop: event.target === event.currentTarget }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onPointerMove = (event: ReactPointerEvent): void => {
    const start = drag.current
    if (!start) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    if (!start.moved && Math.hypot(dx, dy) < 4) return
    start.moved = true
    start.x = event.clientX
    start.y = event.clientY
    setView((current) => ({ ...current, x: current.x + dx, y: current.y + dy }))
  }
  const onPointerUp = (): void => {
    const start = drag.current
    drag.current = null
    // A click on the backdrop, not the end of a drag, closes.
    if (start && !start.moved && start.backdrop) onClose()
  }

  return createPortal(
    <div className="doc-lightbox" role="dialog" aria-modal="true" aria-label={label}>
      <div
        ref={stage}
        className="doc-lightbox-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect()
          if (view.scale > 1.01) setView(FIT)
          else zoom(2.5, event.clientX - box.left - box.width / 2, event.clientY - box.top - box.height / 2)
        }}
      >
        <div
          className="doc-lightbox-content"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
        >
          {children}
        </div>
      </div>
      <div className="doc-lightbox-bar">
        <button type="button" aria-label="Zoom out" title="Zoom out (-)" onClick={() => zoom(0.8)}>
          <Minus />
        </button>
        <button type="button" className="doc-lightbox-scale" title="Fit to the window (0)" onClick={() => setView(FIT)}>
          {Math.round(view.scale * 100)}%
        </button>
        <button type="button" aria-label="Zoom in" title="Zoom in (+)" onClick={() => zoom(1.25)}>
          <Plus />
        </button>
        <span className="doc-lightbox-sep" />
        <button type="button" aria-label="Close" title="Close (Escape)" onClick={onClose}>
          <X />
        </button>
      </div>
    </div>,
    document.body
  )
}

/** The button that opens a figure in the lightbox, shown when the figure is hovered. */
export function ExpandButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="doc-expand" aria-label="Expand" title="Expand" onClick={onClick}>
      <Maximize2 />
    </button>
  )
}
