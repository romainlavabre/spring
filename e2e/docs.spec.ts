// Writing documentation in the app: sections, pages, external links, blocks,
// and reading it: links, search, copying code, PDF export.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { createWorkspace, launch, launchWithDemo, menuItem } from './helpers'

async function insertBlock(page: Page, label: string): Promise<void> {
  await page.getByRole('button', { name: 'Insert a block' }).last().click()
  await page.getByRole('menuitem', { name: new RegExp(`^${label}`) }).click()
}

test('builds a documentation from scratch: sections, pages, blocks and links', async () => {
  const { app, page, root, close } = await launch()
  try {
    await createWorkspace(page, 'Docs')

    // Sections and a sub-section.
    await page.getByRole('button', { name: 'New section' }).first().click()
    await page.getByPlaceholder('Infrastructure').fill('Infra')
    await page.getByRole('button', { name: 'Icon server' }).click()
    await page.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(menuItem(page, 'Infra')).toBeVisible()

    await menuItem(page, 'Infra').click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'New section' }).click()
    await page.getByPlaceholder('Infrastructure').fill('Réseau')
    await page.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(menuItem(page, 'Réseau')).toBeVisible()

    // An external link in the menu opens in the browser.
    await app.evaluate(({ shell }) => {
      const opened: string[] = []
      ;(globalThis as { opened?: string[] }).opened = opened
      shell.openExternal = async (url: string) => {
        opened.push(url)
      }
    })
    await page.getByRole('button', { name: 'New', exact: true }).click()
    await page.getByRole('menuitem', { name: 'New external link' }).click()
    await page.getByPlaceholder('Grafana', { exact: true }).fill('Grafana')
    await page.getByPlaceholder('https://grafana.example.com').fill('https://grafana.acme.io')
    await page.getByRole('button', { name: 'Create', exact: true }).click()
    await menuItem(page, 'Grafana').click()
    await expect.poll(() => app.evaluate(() => (globalThis as { opened?: string[] }).opened)).toEqual(['https://grafana.acme.io'])

    // A page in the sub-section opens in edit mode.
    await menuItem(page, 'Réseau').click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'New page' }).click()
    await page.getByPlaceholder('Infrastructure').fill('VPN')
    await page.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Done' })).toBeVisible()
    await expect(page.locator('.doc-block-editor .cm-content')).toBeVisible()
    await page.locator('.doc-block-editor .cm-content').click()
    await page.keyboard.type('## Access\nThe VPN uses **WireGuard**.')
    await expect(page.locator('.doc-block-preview h2')).toHaveText('Access')

    // A table typed in its grid.
    await insertBlock(page, 'Table')
    await page.getByLabel('Title of column 1').fill('Server')
    await page.getByLabel('Title of column 2').fill('Port')
    await page.getByLabel('Type of column 2').selectOption('number')
    await page.getByLabel('Row 1, Server').fill('vpn.acme.io')
    await page.getByLabel('Row 1, Port').fill('51820')
    await expect(page.locator('.doc-table td').first()).toHaveText('vpn.acme.io')

    // A timeline in Gantt view with two lanes and a dependency.
    await insertBlock(page, 'Timeline')
    await page.getByRole('button', { name: 'Gantt schedule' }).click()
    await page.getByRole('button', { name: 'Add a lane' }).click()
    await page.getByRole('textbox', { name: 'Lane' }).fill('Ops')
    await page.getByLabel('Title of item 1').fill('Install')
    await page.getByLabel('Kind of item 1').selectOption('phase')
    await page.getByLabel('Start of item 1').fill('2026-01')
    await page.getByLabel('End of item 1').fill('2026-02')
    await page.getByLabel('Lane of item 1').selectOption({ label: 'Ops' })
    await page.getByRole('button', { name: 'Add an item' }).click()
    await page.getByLabel('Title of item 2').fill('Go live')
    await page.getByLabel('Kind of item 2').selectOption('milestone')
    await page.getByLabel('Start of item 2').fill('2026-03-02')
    await page.getByRole('button', { name: 'More details' }).nth(1).click()
    await page.getByRole('button', { name: 'Install', exact: true }).click()
    await expect(page.locator('.doc-gantt-bar')).toHaveText('Install')
    await expect(page.locator('.doc-gantt-point-label')).toHaveText('Go live')
    await expect(page.locator('.doc-gantt-link')).toHaveCount(1)

    // An invalid date blocks the save and says where.
    await page.getByLabel('Start of item 2').fill('2026-13')
    await expect(page.getByRole('alert')).toContainText('Dates are YYYY, YYYY-MM or YYYY-MM-DD')
    await page.keyboard.press('Control+s')
    await expect(page.getByText(/^Invalid page/)).toBeVisible()
    await page.getByLabel('Start of item 2').fill('2026-03-02')
    await expect(page.getByRole('alert')).toBeHidden()

    await page.keyboard.press('Escape')
    await page.keyboard.press('Control+s')
    await expect(page.getByText('Page saved')).toBeVisible()
    await page.getByRole('button', { name: 'Done' }).click()

    // Read mode: the blocks, the breadcrumbs, and the files of the workspace.
    await expect(page.getByRole('heading', { name: 'VPN', level: 1 })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Breadcrumbs' })).toHaveText('InfraRéseau')
    await expect(page.locator('.doc-gantt-bar')).toHaveText('Install')
    const file = join(root, 'data', 'workspaces', 'docs', 'sections', 'infra', 'reseau', 'vpn.page.json')
    const saved = JSON.parse(readFileSync(file, 'utf8')) as { blocks: { type: string }[] }
    expect(saved.blocks.map((b) => b.type)).toEqual(['text', 'table', 'timeline'])
  } finally {
    await close()
  }
})

test('reads the documentation: links, search, copy, PDF', async () => {
  const { app, page, root, close } = await launchWithDemo()
  try {
    // Every block type of the demo renders.
    for (const selector of ['.doc-callout', '.doc-gantt', '.doc-table', '.doc-code', '.doc-steps', '.doc-tabs', '.doc-details', '.doc-cards', '.doc-divider']) {
      await expect(page.locator(selector).first()).toBeVisible()
    }
    await expect(page.locator('.doc-mermaid svg')).toBeVisible()
    await expect(page.locator('.doc-code-body .shiki span[style]').first()).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'On this page' })).toBeHidden()

    // Copy a code block.
    await page.locator('#block-values').getByRole('button', { name: 'Copy code' }).click()
    await expect(page.locator('#block-values').getByRole('button', { name: 'Copied' })).toBeVisible()
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toContain('replicaCount: 3')

    // Sort the table by number of nodes.
    await page.getByRole('button', { name: 'Nodes' }).click()
    await expect(page.locator('#block-envs tbody tr').first()).toContainText('Dev')

    // Tabs and collapsible blocks.
    await page.getByRole('tab', { name: 'Diagram image' }).click()
    await expect(page.locator('.doc-image img')).toHaveJSProperty('naturalWidth', 1)
    await page.getByRole('button', { name: 'Why GKE rather than EKS?' }).click()
    await expect(page.getByText('The data already lives in BigQuery.')).toBeVisible()

    // A link to another page, then back.
    await page.locator('#block-intro').getByText('the VPN page').click()
    await expect(page.getByRole('heading', { name: 'VPN', level: 1 })).toBeVisible()
    await page.getByRole('button', { name: 'Back (Alt+←)' }).click()
    await expect(page.getByRole('heading', { name: 'Kubernetes', level: 1 })).toBeVisible()

    // Search with Ctrl+K.
    await page.keyboard.press('Control+k')
    await page.getByLabel('Search the documentation').fill('wireguard')
    await expect(page.getByRole('dialog').getByText('VPN', { exact: true })).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'VPN', level: 1 })).toBeVisible()

    // Export a section as PDF.
    const pdf = join(root, 'infra.pdf')
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = (async () => ({ canceled: false, filePath: file })) as typeof dialog.showSaveDialog
    }, pdf)
    await menuItem(page, 'Infra').click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Export as PDF' }).click()
    await expect(page.getByText(`PDF saved to ${pdf}`)).toBeVisible({ timeout: 60_000 })
    expect(existsSync(pdf)).toBe(true)
    expect(statSync(pdf).size).toBeGreaterThan(20_000)
    expect(readFileSync(pdf).subarray(0, 5).toString()).toBe('%PDF-')
  } finally {
    await close()
  }
})

test('asks about unsaved changes before leaving a page', async () => {
  const { page, close } = await launchWithDemo()
  try {
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await page.getByLabel('Page title').fill('Kubernetes (draft)')
    await menuItem(page, 'Process').click()
    await menuItem(page, 'Release').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('1 page has unsaved changes')
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByLabel('Page title')).toHaveValue('Kubernetes (draft)')

    await menuItem(page, 'Release').click()
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Release', level: 1 })).toBeVisible()
    await expect(menuItem(page, 'Kubernetes (draft)')).toBeVisible()
  } finally {
    await close()
  }
})

test('moves a page by drag and drop, keeping the links to it', async () => {
  const { page, workspace, close } = await launchWithDemo()
  try {
    await menuItem(page, 'Process').click()
    const source = menuItem(page, 'VPN')
    await menuItem(page, 'Réseau').click()
    await expect(source).toBeVisible()
    await source.dragTo(menuItem(page, 'Release'), { targetPosition: { x: 40, y: 4 } })
    await expect(page.locator('[data-path="process/vpn"]')).toBeVisible()
    const kubernetes = readFileSync(join(workspace, 'sections', 'infra', 'kubernetes.page.json'), 'utf8')
    expect(kubernetes).toContain('page:process/vpn')
    expect(kubernetes).not.toContain('page:infra/reseau/vpn')
  } finally {
    await close()
  }
})
