// Code blocks: highlighted, with a title bar and a copy button; code groups
// show variants of a snippet under tabs.
import clsx from 'clsx'
import { Check, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { CodeBlock, CodeGroupBlock } from '@core/blocks/schema'
import { usePending, useDoc } from '../context'
import { highlight, normalizeLang } from '../highlight'

export function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(timer)
  }, [copied])
  return (
    <button
      type="button"
      className={clsx('doc-copy', copied && 'is-copied', className)}
      aria-label={copied ? 'Copied' : 'Copy code'}
      title={copied ? 'Copied' : 'Copy'}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => setCopied(true))
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      <span>{copied ? 'Copied' : 'Copy'}</span>
    </button>
  )
}

/** Highlighted code; plain text until Shiki is ready. */
export function HighlightedCode({ code, lang, lines, lineNumbers }: { code: string; lang: string; lines?: string; lineNumbers?: boolean }) {
  const [html, setHtml] = useState<{ key: string; html: string } | null>(null)
  const key = `${lang}\u0000${lines ?? ''}\u0000${code}`
  usePending(html?.key === key)
  useEffect(() => {
    let alive = true
    highlight(code, lang, lines)
      .then((result) => alive && setHtml({ key, html: result }))
      .catch(() => alive && setHtml({ key, html: '' }))
    return () => {
      alive = false
    }
  }, [code, lang, lines, key])
  const className = clsx('doc-code-body', lineNumbers && 'with-line-numbers')
  if (html?.key === key && html.html) return <div className={className} dangerouslySetInnerHTML={{ __html: html.html }} />
  return (
    <div className={className}>
      <pre className="shiki">
        <code>
          {code.split('\n').map((line, i) => (
            <span key={i} className="line">
              {line}
              {'\n'}
            </span>
          ))}
        </code>
      </pre>
    </div>
  )
}

const LANGUAGE_NAMES: Record<string, string> = {
  bash: 'Shell',
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  tsx: 'TSX',
  json: 'JSON',
  yaml: 'YAML',
  sql: 'SQL',
  html: 'HTML',
  css: 'CSS',
  java: 'Java',
  kotlin: 'Kotlin',
  python: 'Python',
  go: 'Go',
  rust: 'Rust',
  php: 'PHP',
  docker: 'Dockerfile',
  hcl: 'Terraform',
  powershell: 'PowerShell',
  graphql: 'GraphQL',
  xml: 'XML',
  text: 'Text'
}

export function languageName(lang: string): string {
  const normalized = normalizeLang(lang)
  return LANGUAGE_NAMES[normalized] ?? normalized
}

export function CodeView({ block }: { block: CodeBlock }) {
  return (
    <figure className="doc-code">
      <figcaption className="doc-code-bar">
        <span className="doc-code-title">{block.title ?? languageName(block.lang)}</span>
        {block.title && <span className="doc-code-lang">{languageName(block.lang)}</span>}
        <CopyButton text={block.code} />
      </figcaption>
      <HighlightedCode code={block.code} lang={block.lang} lines={block.highlight} lineNumbers={block.lineNumbers} />
    </figure>
  )
}

export function CodeGroupView({ block }: { block: CodeGroupBlock }) {
  const [active, setActive] = useState(0)
  const { printing } = useDoc()
  const current = block.items[Math.min(active, block.items.length - 1)]
  if (printing) {
    return (
      <>
        {block.items.map((item, i) => (
          <CodeView key={i} block={{ id: `${block.id}-${i}`, type: 'code', lang: item.lang, code: item.code, title: item.label }} />
        ))}
      </>
    )
  }
  return (
    <figure className="doc-code">
      <figcaption className="doc-code-bar" role="tablist">
        <div className="doc-code-tabs">
          {block.items.map((item, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === active}
              className={clsx('doc-code-tab', i === active && 'is-active')}
              onClick={() => setActive(i)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <CopyButton text={current.code} />
      </figcaption>
      <HighlightedCode code={current.code} lang={current.lang} />
    </figure>
  )
}
