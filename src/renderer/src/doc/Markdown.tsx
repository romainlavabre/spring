// Markdown of the blocks: GitHub-flavored, with :badge[…]{color=…} and
// :kbd[…], `page:` links that navigate, and headings carrying anchors.
import type { Root } from 'mdast'
import { Children, isValidElement, type ReactNode } from 'react'
import ReactMarkdown, { defaultUrlTransform, type Components } from 'react-markdown'
import remarkDirective from 'remark-directive'
import remarkGfm from 'remark-gfm'
import { visit } from 'unist-util-visit'
import { headingAnchor } from '@core/blocks/ops'
import { COLORS } from '@core/blocks/schema'
import { useDoc, useFollow } from './context'

/**
 * Keeps only the directives Spring knows. Any other ":word" (a time like
 * 10:30 is safe, but "Note:important" is not) goes back to plain text.
 */
function remarkSpringDirectives() {
  return (tree: Root) => {
    visit(tree, (node, index, parent) => {
      if (node.type !== 'textDirective' && node.type !== 'leafDirective' && node.type !== 'containerDirective') return
      const directive = node as unknown as {
        type: string
        name: string
        attributes?: Record<string, string | null | undefined>
        children: { type: string; value?: string }[]
        data?: Record<string, unknown>
      }
      if (node.type === 'textDirective' && (directive.name === 'badge' || directive.name === 'kbd')) {
        const color = directive.attributes?.color
        directive.data = {
          hName: directive.name === 'kbd' ? 'kbd' : 'span',
          hProperties:
            directive.name === 'badge'
              ? { className: 'doc-badge', 'data-color': color && (COLORS as readonly string[]).includes(color) ? color : 'gray' }
              : {}
        }
        return
      }
      if (!parent || index === undefined) return
      const prefix = node.type === 'textDirective' ? ':' : node.type === 'leafDirective' ? '::' : ':::'
      const text = `${prefix}${directive.name}`
      const replacement =
        node.type === 'textDirective'
          ? [{ type: 'text', value: directive.children.length ? `${text}[` : text }, ...directive.children, ...(directive.children.length ? [{ type: 'text', value: ']' }] : [])]
          : [{ type: 'paragraph', children: [{ type: 'text', value: text }] }, ...directive.children]
      ;(parent.children as unknown[]).splice(index, 1, ...replacement)
      return index
    })
  }
}

function textOf(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) => (typeof child === 'string' || typeof child === 'number' ? String(child) : isValidElement(child) ? textOf((child.props as { children?: ReactNode }).children) : ''))
    .join('')
}

function urlTransform(url: string): string {
  if (url.startsWith('page:') || url.startsWith('asset:')) return url
  return defaultUrlTransform(url)
}

export function Markdown({ children, inline = false }: { children: string; inline?: boolean }) {
  const follow = useFollow()
  const { assetBase } = useDoc()
  const components: Components = {
    a({ href = '', children: label }) {
      const internal = href.startsWith('page:') || href.startsWith('#')
      return (
        <a
          href={href}
          className={internal ? 'doc-link' : 'doc-link doc-link-external'}
          onClick={(event) => {
            event.preventDefault()
            follow(href)
          }}
        >
          {label}
        </a>
      )
    },
    h1: ({ children: text }) => <h2 id={headingAnchor(textOf(text))}>{text}</h2>,
    h2: ({ children: text }) => <h2 id={headingAnchor(textOf(text))}>{text}</h2>,
    h3: ({ children: text }) => <h3 id={headingAnchor(textOf(text))}>{text}</h3>,
    table: ({ children: rows }) => (
      <div className="doc-table-wrap">
        <table className="doc-table">{rows}</table>
      </div>
    ),
    img: ({ src = '', alt }) => <img src={typeof src === 'string' && src.startsWith('asset:') ? `${assetBase}/${encodeURIComponent(src.slice(6))}` : src} alt={alt ?? ''} />,
    ...(inline ? { p: ({ children: text }) => <>{text}</> } : {})
  }
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkDirective, remarkSpringDirectives]} components={components} urlTransform={urlTransform}>
      {children}
    </ReactMarkdown>
  )
}

/** Markdown of a block, in its own styled box. */
export function Prose({ md, className }: { md: string; className?: string }) {
  if (!md.trim()) return null
  return (
    <div className={className ? `doc-prose ${className}` : 'doc-prose'}>
      <Markdown>{md}</Markdown>
    </div>
  )
}
