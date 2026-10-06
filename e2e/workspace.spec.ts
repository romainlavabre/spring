// Workspaces: creating one, pushing it to a remote, cloning a shared one and
// switching between them.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { seedDemoRepository } from './demo'
import { createWorkspace, git, launch, menuItem } from './helpers'

test('creates a workspace and syncs it to a remote', async () => {
  const { page, root, close } = await launch()
  try {
    const remote = join(root, 'remote.git')
    execFileSync('git', ['init', '--bare', '--initial-branch=master', remote])
    await createWorkspace(page, 'Acme')
    await expect(page.getByText('No page yet')).toBeVisible()

    await page.getByText('Local only').first().click()
    await page.getByRole('menuitem', { name: 'Acme' }).hover()
    await page.getByRole('menuitem', { name: 'Set remote' }).click()
    await page.getByRole('dialog').getByRole('textbox').fill(remote)
    await page.getByRole('button', { name: 'Save' }).click()

    // The push runs in the background after the remote is set.
    const remoteLog = (): string => {
      try {
        return git(remote, 'log', '--format=%s', 'master').trim()
      } catch {
        return ''
      }
    }
    await expect.poll(remoteLog).toBe('Initialize workspace')

    // A page created in the app is committed and pushed on its own.
    await page.getByRole('button', { name: 'New page' }).first().click()
    await page.getByPlaceholder('Infrastructure').fill('Onboarding')
    await page.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Done' })).toBeVisible()
    await expect.poll(remoteLog).toBe('Add page "Onboarding"\nInitialize workspace')
    expect(git(remote, 'ls-tree', '-r', '--name-only', 'master')).toContain('sections/onboarding.page.json')
  } finally {
    await close()
  }
})

test('clones a shared documentation and switches between workspaces', async () => {
  const root = mkdtempSync(join(tmpdir(), 'spring-e2e-'))
  const remote = join(root, 'shared.git')
  execFileSync('git', ['init', '--bare', '--initial-branch=master', remote])
  seedDemoRepository(join(root, 'seed'), remote)
  const { page, close } = await launch({ root: join(root, 'app') })
  try {
    await createWorkspace(page, 'Personal')
    await page.getByText('Local only').first().click()
    await page.getByRole('menuitem', { name: 'Add workspace…' }).click()
    await page.getByRole('button', { name: 'Clone a repository' }).click()
    await page.getByPlaceholder('git@github.com:acme/docs.git').fill(remote)
    await expect(page.getByPlaceholder('Client A')).toHaveValue('shared')
    await page.getByRole('button', { name: 'Clone', exact: true }).click()
    await expect(page.getByText('Workspace "shared" added')).toBeVisible()

    // The first page of the menu opens.
    await expect(page.getByRole('heading', { name: 'Kubernetes', level: 1 })).toBeVisible()
    await expect(menuItem(page, 'Liens externes')).toBeVisible()

    // Back to the other workspace: its own (empty) documentation.
    await page.getByRole('button', { name: /shared/ }).first().click()
    await page.getByRole('menuitem', { name: 'Personal' }).hover()
    await page.getByRole('menuitem', { name: 'Switch to' }).click()
    await expect(page.getByText('No page yet')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Kubernetes', level: 1 })).toBeHidden()

    // And back again: the last page read is shown.
    await page.getByRole('button', { name: /Personal/ }).first().click()
    await page.getByRole('menuitem', { name: 'shared' }).hover()
    await page.getByRole('menuitem', { name: 'Switch to' }).click()
    await expect(page.getByRole('heading', { name: 'Kubernetes', level: 1 })).toBeVisible()
  } finally {
    await close()
    rmSync(root, { recursive: true, force: true })
  }
})
