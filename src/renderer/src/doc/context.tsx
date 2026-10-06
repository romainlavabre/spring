// What the blocks of a page need from where they are shown: the app (links
// navigate, images come from the active workspace) or a PDF export.
import { createContext, useContext, useEffect, type ReactNode } from 'react'

export interface DocEnvironment {
  /** Base URL of the workspace images (spring-asset://<id>). */
  assetBase: string
  /** Opens a page of the workspace (`page:` links); absent in exports. */
  navigate?(path: string, anchor?: string): void
  /** Opens an external URL. */
  openExternal(url: string): void
  /** Rendering for print: everything unfolded, light colors. */
  printing: boolean
  /** Light or dark colors for diagrams. */
  dark: boolean
  /** Tells the print view a block is still rendering; call the result when done. */
  pending(): () => void
}

const noop = (): (() => void) => () => undefined

const DocContext = createContext<DocEnvironment>({
  assetBase: '',
  openExternal: (url) => window.open(url, '_blank'),
  printing: false,
  dark: true,
  pending: noop
})

export function DocProvider({ value, children }: { value: DocEnvironment; children: ReactNode }) {
  return <DocContext.Provider value={value}>{children}</DocContext.Provider>
}

export function useDoc(): DocEnvironment {
  return useContext(DocContext)
}

/** Marks the block as rendering until `done` is true (diagrams, highlighting). */
export function usePending(done: boolean): void {
  const { pending } = useDoc()
  useEffect(() => {
    if (done) return
    return pending()
  }, [done, pending])
}

/** Follows a link of a page: `page:` paths in the app, URLs in the browser. */
export function useFollow(): (href: string) => void {
  const { navigate, openExternal } = useDoc()
  return (href: string) => {
    if (href.startsWith('page:')) {
      const [path, anchor] = href.slice(5).split('#')
      navigate?.(path, anchor)
    } else if (href.startsWith('#')) {
      document.getElementById(href.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else if (/^(https?|mailto):/i.test(href)) {
      openExternal(href)
    }
  }
}
