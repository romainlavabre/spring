// Mermaid diagrams, rendered to SVG in the page (Mermaid loads on first use).
import { useEffect, useId, useState } from 'react'
import type { MermaidBlock } from '@core/blocks/schema'
import { useDoc, usePending } from '../context'

type MermaidApi = (typeof import('mermaid'))['default']
let mermaid: Promise<MermaidApi> | null = null
let initializedFor: string | null = null
/** Mermaid keeps global state: diagrams render one at a time. */
let queue: Promise<unknown> = Promise.resolve()

function render(id: string, source: string, dark: boolean): Promise<string> {
  mermaid ??= import('mermaid').then((module) => module.default)
  const task = queue.then(async () => {
    const api = await mermaid!
    const theme = dark ? 'dark' : 'default'
    if (initializedFor !== theme) {
      api.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme,
        fontFamily: "'Inter Variable', Inter, system-ui, sans-serif",
        themeVariables: dark
          ? { primaryColor: '#3a2a2e', primaryBorderColor: '#f26b6f', lineColor: '#8b93a4', primaryTextColor: '#e3e6ec' }
          : { primaryColor: '#fde8e8', primaryBorderColor: '#d9474f', lineColor: '#667085', primaryTextColor: '#1d2330' }
      })
      initializedFor = theme
    }
    const { svg } = await api.render(id, source)
    return svg
  })
  queue = task.catch(() => undefined)
  return task
}

export function MermaidView({ block }: { block: MermaidBlock }) {
  const { dark, printing } = useDoc()
  const id = `mermaid-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const key = `${dark && !printing}\u0000${block.source}`
  const [result, setResult] = useState<{ key: string; svg?: string; error?: string } | null>(null)
  usePending(result?.key === key)

  useEffect(() => {
    let alive = true
    render(id, block.source, dark && !printing)
      .then((svg) => alive && setResult({ key, svg }))
      .catch((error: unknown) => {
        // Mermaid leaves its error diagram in the body.
        document.getElementById(`d${id}`)?.remove()
        if (alive) setResult({ key, error: error instanceof Error ? error.message : String(error) })
      })
    return () => {
      alive = false
    }
  }, [id, block.source, dark, printing, key])

  return (
    <figure className="doc-mermaid">
      {result?.key === key && result.error ? (
        <pre className="doc-mermaid-error">Diagram error: {result.error}</pre>
      ) : result?.key === key && result.svg ? (
        <div className="doc-mermaid-svg" dangerouslySetInnerHTML={{ __html: result.svg }} />
      ) : (
        <div className="doc-mermaid-loading">Drawing the diagram…</div>
      )}
      {block.caption && <figcaption>{block.caption}</figcaption>}
    </figure>
  )
}
