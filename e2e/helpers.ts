// Launches the built app on a throwaway data folder.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, type ElectronApplication, type Page } from '@playwright/test'
import { seedDemo } from './demo'

export interface Launched {
  app: ElectronApplication
  page: Page
  root: string
  close(): Promise<void>
}

export async function launch(options: { root?: string; theme?: 'dark' | 'light' } = {}): Promise<Launched> {
  const root = options.root ?? mkdtempSync(join(tmpdir(), 'spring-e2e-'))
  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      SPRING_DATA_DIR: join(root, 'data'),
      GIT_AUTHOR_NAME: 'E2E',
      GIT_AUTHOR_EMAIL: 'e2e@example.com',
      GIT_COMMITTER_NAME: 'E2E',
      GIT_COMMITTER_EMAIL: 'e2e@example.com'
    }
  })
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1440, height: 900 }).catch(() => undefined)
  if (options.theme === 'light') {
    await page.evaluate(() => {
      localStorage.setItem('spring-ui', JSON.stringify({ state: { theme: 'light', lastPages: {} }, version: 0 }))
    })
    await page.reload()
  }
  return {
    app,
    page,
    root,
    async close() {
      // Destroying the window skips the unsaved-changes question a test may have left open.
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.destroy())).catch(() => undefined)
      await app.close().catch(() => undefined)
      rmSync(root, { recursive: true, force: true })
    }
  }
}

/** Launches the app with the demo documentation registered as its active workspace. */
export async function launchWithDemo(options: { theme?: 'dark' | 'light' } = {}): Promise<Launched & { workspace: string }> {
  const root = mkdtempSync(join(tmpdir(), 'spring-e2e-'))
  const workspace = join(root, 'docs')
  seedDemo(workspace)
  execFileSync('git', ['init', '--initial-branch=master'], { cwd: workspace })
  execFileSync('git', ['add', '.'], { cwd: workspace })
  execFileSync('git', ['-c', 'user.name=Seed', '-c', 'user.email=seed@example.com', 'commit', '-qm', 'Seed'], { cwd: workspace })
  mkdirSync(join(root, 'data'), { recursive: true })
  writeFileSync(join(root, 'data', 'workspaces.json'), JSON.stringify({ repos: [{ id: 'demo', name: 'Acme docs', path: workspace }], activeRepoId: 'demo' }))
  const launched = await launch({ root, theme: options.theme })
  await expect(launched.page.getByRole('heading', { name: 'Kubernetes', level: 1 })).toBeVisible()
  return { ...launched, workspace }
}

export async function createWorkspace(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Add workspace' }).click()
  await page.getByPlaceholder('Client A').fill(name)
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page.getByText(`Workspace "${name}" added`)).toBeVisible()
}

/** The menu entry of a node. */
export function menuItem(page: Page, title: string) {
  return page.getByRole('tree').getByRole('treeitem', { name: title, exact: true }).locator('> div').first()
}

export function git(dir: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: 'pipe' })
}
