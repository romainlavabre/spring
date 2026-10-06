// Serves the images of the workspaces to the renderer on spring-asset://<id>/<name>,
// <id> being a workspace id, or a folder registered for an export.
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { net, protocol } from 'electron'
import { DocStore } from '@core/layout/store'

export const ASSET_SCHEME = 'spring-asset'

/** Must run before the app is ready. */
export function registerAssetScheme(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: ASSET_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }])
}

export class AssetRoots {
  /** Folders without workspace id (CLI exports), by id. */
  private readonly extra = new Map<string, string>()

  constructor(private readonly workspaceRoot: (id: string) => string | null) {}

  /** Base URL of the assets of the workspace at `root`. */
  base(root: string, id?: string): string {
    let key = id
    if (!key) {
      key = [...this.extra.entries()].find(([, folder]) => folder === resolve(root))?.[0]
      if (!key) {
        key = `x${randomUUID().replace(/-/g, '')}`
        this.extra.set(key, resolve(root))
      }
    }
    return `${ASSET_SCHEME}://${key}`
  }

  root(id: string): string | null {
    return this.extra.get(id) ?? this.workspaceRoot(id)
  }

  /** Must run once the app is ready. */
  serve(): void {
    protocol.handle(ASSET_SCHEME, (request) => {
      const url = new URL(request.url)
      const root = this.root(url.hostname)
      if (!root) return new Response('Unknown workspace', { status: 404 })
      try {
        const file = new DocStore(root).assetFile(decodeURIComponent(url.pathname.replace(/^\//, '')))
        if (!existsSync(file)) return new Response('Not found', { status: 404 })
        return net.fetch(pathToFileURL(file).toString())
      } catch {
        return new Response('Invalid asset', { status: 400 })
      }
    })
  }
}
