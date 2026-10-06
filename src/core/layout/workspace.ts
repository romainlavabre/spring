// Root files of a workspace repository.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const WORKSPACE_FILE = 'spring.json'
export const SECTIONS_DIR = 'sections'
export const ASSETS_DIR = 'assets'
/** Optional CSS of the workspace, applied over the theme of the app and the PDFs. */
export const THEME_FILE = 'theme.css'
export const FORMAT_VERSION = 1

export interface WorkspaceFile {
  name: string
  formatVersion: number
}

/** Creates the workspace marker and the sections and assets folders when missing. */
export function ensureWorkspaceLayout(dir: string, name: string): void {
  for (const folder of [SECTIONS_DIR, ASSETS_DIR]) {
    mkdirSync(join(dir, folder), { recursive: true })
    const keep = join(dir, folder, '.gitkeep')
    if (!existsSync(keep)) writeFileSync(keep, '')
  }
  const marker = join(dir, WORKSPACE_FILE)
  if (!existsSync(marker)) writeFileSync(marker, JSON.stringify({ name, formatVersion: FORMAT_VERSION } satisfies WorkspaceFile, null, 2) + '\n')
}

export function readWorkspaceFile(dir: string): WorkspaceFile | null {
  try {
    return JSON.parse(readFileSync(join(dir, WORKSPACE_FILE), 'utf8')) as WorkspaceFile
  } catch {
    return null
  }
}
