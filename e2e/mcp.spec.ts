// An assistant writes through the MCP server while the app is open: the page
// shows up at once, and the app commits it a moment later.
import { join, resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { expect, test } from '@playwright/test'
import { git, launchWithDemo, menuItem } from './helpers'

test('shows the pages an assistant writes through MCP', async () => {
  const { page, root, workspace, close } = await launchWithDemo()
  const client = new Client({ name: 'claude-like', version: '1' })
  try {
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [resolve('out/cli/spring.cjs'), 'mcp'],
        env: { ...(process.env as Record<string, string>), SPRING_DATA_DIR: join(root, 'data') }
      })
    )
    const result = (await client.callTool({
      name: 'create_page',
      arguments: {
        parent: 'process',
        title: 'Incident response',
        icon: 'siren',
        blocks: [
          { type: 'callout', variant: 'danger', title: 'Sev 1', md: 'Page the on-call engineer first.' },
          { type: 'steps', steps: [{ title: 'Acknowledge', md: 'In PagerDuty.' }, { title: 'Open a channel', md: '`#incident-<date>`' }] }
        ]
      }
    })) as { isError?: boolean }
    expect(result.isError).toBeFalsy()

    await menuItem(page, 'Process').click()
    await menuItem(page, 'Incident response').click()
    await expect(page.getByRole('heading', { name: 'Incident response', level: 1 })).toBeVisible()
    await expect(page.locator('.doc-callout')).toContainText('Page the on-call engineer first.')

    // The app commits it a moment later, without a click on Sync.
    await expect.poll(() => git(workspace, 'status', '--porcelain'), { timeout: 15_000 }).toBe('')
    expect(git(workspace, 'log', '-1', '--name-only', '--format=%s')).toContain('sections/process/incident-response.page.json')
  } finally {
    await client.close()
    await close()
  }
})
