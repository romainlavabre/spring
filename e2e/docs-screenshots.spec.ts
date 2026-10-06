// Screenshots of the documentation (README and docs/), taken on the demo
// workspace. Runs only with SPRING_SCREENSHOTS=<folder>.
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchWithDemo, menuItem } from './helpers'

const folder = process.env.SPRING_SCREENSHOTS

test.skip(!folder, 'Set SPRING_SCREENSHOTS=<folder> to take the screenshots')

for (const theme of ['dark', 'light'] as const) {
  test(`screenshots in the ${theme} theme`, async () => {
    const { page, close } = await launchWithDemo({ theme })
    try {
      const shot = (name: string) => join(folder!, theme === 'dark' ? `${name}.png` : `${name}-light.png`)
      await expect(page.locator('.doc-gantt-bar').first()).toBeVisible()
      await expect(page.locator('.doc-code-body .shiki span[style]').first()).toBeVisible()
      await page.waitForTimeout(500)
      await page.screenshot({ path: shot('overview') })
      // The light theme is shown once.
      if (theme === 'light') return

      await page.locator('#block-plan').scrollIntoViewIfNeeded()
      await page.locator('#block-plan').screenshot({ path: shot('gantt') })
      await page.locator('#block-envs').screenshot({ path: shot('table') })
      await page.locator('#block-values').scrollIntoViewIfNeeded()
      await page.locator('#block-values').screenshot({ path: shot('code') })

      await menuItem(page, 'Process').click()
      await menuItem(page, 'Release').click()
      await expect(page.locator('.doc-tl-vertical')).toBeVisible()
      await page.locator('#block-history').screenshot({ path: shot('vertical-timeline') })

      await menuItem(page, 'Kubernetes').click()
      await page.getByRole('button', { name: 'Edit', exact: true }).click()
      await page.locator('[data-block="plan"] .doc-block-preview').dblclick()
      await expect(page.locator('.doc-block-editor')).toBeVisible()
      await page.locator('.doc-block-editor').scrollIntoViewIfNeeded()
      await page.screenshot({ path: shot('editor') })
    } finally {
      await close()
    }
  })
}
